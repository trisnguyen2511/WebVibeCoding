import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null
function getSupabase() {
  if (!_supabase)
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  return _supabase
}

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export type ButtonInput = {
  type: 'button'
  key: string
  state: 'pressed' | 'released'
  ts: number
}

export type RomUrlInput = {
  type: 'rom-url'
  url: string
  system: string
}

// Raw compass heading + front-back tilt from the phone's
// DeviceOrientationEvent — sent as-is (alpha still wrapped 0-360) so the
// host can unwrap it itself; that keeps the phone a dumb sensor client
// with no physics/continuity state of its own.
export type OrientationInput = {
  type: 'orientation'
  alpha: number
  beta: number
  ts: number
}

// Any connected phone can request a restart — the host reacts by
// resetting every player's own chest instance for a fresh round.
export type RestartInput = {
  type: 'restart'
}

export type ControllerInput = ButtonInput | RomUrlInput | OrientationInput | RestartInput

export type InputMessage = ControllerInput & { peerId: string }

export type PlayerInfo = {
  peerId: string
  playerIndex: number
  connected: boolean
}

export type RoomHandle = {
  cleanup: () => void
  kickPlayer: (peerId: string) => void
  /** Push a message down to one connected phone (e.g. game state to render on its screen). */
  sendToPlayer: <T>(peerId: string, data: T) => void
}

// ── Host side ────────────────────────────────────────────────────
export async function createRoom(
  roomId: string,
  onInput: (msg: InputMessage) => void,
  onPlayersChange: (players: PlayerInfo[]) => void
): Promise<RoomHandle> {
  const peers = new Map<string, { pc: RTCPeerConnection; dc: RTCDataChannel; playerIndex: number; connected: boolean }>()

  const notify = () =>
    onPlayersChange(
      Array.from(peers.entries()).map(([peerId, { playerIndex, connected }]) => ({
        peerId,
        playerIndex,
        connected,
      }))
    )

  const sigChannel = getSupabase().channel(`ctrl-${roomId}`, {
    config: { broadcast: { self: false } },
  })

  const handlePhoneReady = async (peerId: string) => {
    if (peers.has(peerId) || peers.size >= 4) return

    // Assign the lowest free slot in 0..3, not peers.size — peers.size only
    // reflects who's *currently* connected, so a player who joined and left
    // (freeing their slot) would otherwise cause the next joiner to collide
    // with whoever took the size-based index in between, permanently
    // orphaning the freed slot. This is the root cause of players getting
    // "stuck" unable to claim P1-P4.
    const used = new Set(Array.from(peers.values()).map((p) => p.playerIndex))
    let playerIndex = -1
    for (let i = 0; i < 4; i++) {
      if (!used.has(i)) { playerIndex = i; break }
    }
    if (playerIndex === -1) return // room full

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const dc = pc.createDataChannel('input')

    peers.set(peerId, { pc, dc, playerIndex, connected: false })

    dc.onopen = () => {
      const peer = peers.get(peerId)
      if (peer) peer.connected = true
      notify()
    }
    dc.onclose = () => {
      peers.delete(peerId)
      notify()
    }
    dc.onmessage = (e) => onInput(JSON.parse(e.data as string) as InputMessage)

    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        sigChannel.send({
          type: 'broadcast',
          event: 'ice-host',
          payload: { to: peerId, candidate: candidate.toJSON() },
        })
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sigChannel.send({
      type: 'broadcast',
      event: 'offer',
      payload: { to: peerId, playerIndex, type: offer.type, sdp: offer.sdp },
    })
  }

  sigChannel
    .on('broadcast', { event: 'phone-ready' }, ({ payload }) => {
      handlePhoneReady((payload as { peerId: string }).peerId)
    })
    .on('broadcast', { event: 'answer' }, async ({ payload }) => {
      const { from, type, sdp } = payload as { from: string; type: string; sdp: string }
      const peer = peers.get(from)
      if (!peer) return
      await peer.pc.setRemoteDescription(
        new RTCSessionDescription({ type: type as RTCSdpType, sdp })
      )
    })
    .on('broadcast', { event: 'ice-phone' }, async ({ payload }) => {
      const { from, candidate } = payload as { from: string; candidate: RTCIceCandidateInit }
      const peer = peers.get(from)
      if (!peer) return
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {}
    })

  await new Promise<void>((resolve) =>
    sigChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
    })
  )

  return {
    cleanup: () => {
      peers.forEach(({ pc }) => pc.close())
      peers.clear()
      getSupabase().removeChannel(sigChannel)
    },
    kickPlayer: (peerId: string) => {
      const peer = peers.get(peerId)
      if (peer) peer.pc.close()
      // dc.onclose fires automatically → peers.delete + notify
    },
    sendToPlayer: (peerId, data) => {
      const peer = peers.get(peerId)
      if (peer?.dc.readyState === 'open') peer.dc.send(JSON.stringify(data))
    },
  }
}

// ── Phone side ───────────────────────────────────────────────────
// Fix: phone subscribes first, THEN announces presence so host never misses the signal
export async function joinRoom(
  roomId: string,
  onAssigned: (playerIndex: number) => void,
  onDisconnected: () => void,
  onHostMessage?: (data: unknown) => void
): Promise<{
  sendInput: (msg: ControllerInput) => void
  disconnect: () => void
  peerId: string
}> {
  const peerId = Math.random().toString(36).slice(2, 10).toUpperCase()
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  const sigChannel = getSupabase().channel(`ctrl-${roomId}`, {
    config: { broadcast: { self: false } },
  })
  let dataChannel: RTCDataChannel | null = null

  pc.ondatachannel = (e) => {
    dataChannel = e.channel
    dataChannel.onclose = onDisconnected
    dataChannel.onmessage = (msg) => onHostMessage?.(JSON.parse(msg.data as string))
  }

  pc.onicecandidate = ({ candidate }) => {
    if (candidate)
      sigChannel.send({
        type: 'broadcast',
        event: 'ice-phone',
        payload: { from: peerId, candidate: candidate.toJSON() },
      })
  }

  sigChannel
    .on('broadcast', { event: 'offer' }, async ({ payload }) => {
      const { to, playerIndex, type, sdp } = payload as {
        to: string
        playerIndex: number
        type: string
        sdp: string
      }
      if (to !== peerId) return
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: type as RTCSdpType, sdp })
        )
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        onAssigned(playerIndex)
        sigChannel.send({
          type: 'broadcast',
          event: 'answer',
          payload: { from: peerId, type: answer.type, sdp: answer.sdp },
        })
      } catch (err) {
        console.error('[webrtc] offer handling failed:', err)
      }
    })
    .on('broadcast', { event: 'ice-host' }, async ({ payload }) => {
      const { to, candidate } = payload as { to: string; candidate: RTCIceCandidateInit }
      if (to !== peerId) return
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {}
    })

  await new Promise<void>((resolve) =>
    sigChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
    })
  )

  // Announce after subscription is confirmed — eliminates race condition
  sigChannel.send({ type: 'broadcast', event: 'phone-ready', payload: { peerId } })

  return {
    peerId,
    sendInput: (msg: ControllerInput) => {
      if (dataChannel?.readyState === 'open')
        dataChannel.send(JSON.stringify({ ...msg, peerId }))
    },
    disconnect: () => {
      pc.close()
      getSupabase().removeChannel(sigChannel)
    },
  }
}
