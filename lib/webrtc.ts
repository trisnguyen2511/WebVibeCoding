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

export type InputMessage = {
  type: 'button'
  key: string
  state: 'pressed' | 'released'
  ts: number
  peerId: string
}

export type PlayerInfo = {
  peerId: string
  playerIndex: number
  connected: boolean
}

// ── Host side ────────────────────────────────────────────────────
export async function createRoom(
  roomId: string,
  onInput: (msg: InputMessage) => void,
  onPlayersChange: (players: PlayerInfo[]) => void
): Promise<() => void> {
  const peers = new Map<string, { pc: RTCPeerConnection; playerIndex: number; connected: boolean }>()

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
    if (peers.has(peerId) || peers.size >= 8) return

    const playerIndex = peers.size
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const dc = pc.createDataChannel('input')

    peers.set(peerId, { pc, playerIndex, connected: false })

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

  return () => {
    peers.forEach(({ pc }) => pc.close())
    peers.clear()
    getSupabase().removeChannel(sigChannel)
  }
}

// ── Phone side ───────────────────────────────────────────────────
// Fix: phone subscribes first, THEN announces presence so host never misses the signal
export async function joinRoom(
  roomId: string,
  onAssigned: (playerIndex: number) => void,
  onDisconnected: () => void
): Promise<{
  sendInput: (msg: Omit<InputMessage, 'peerId'>) => void
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
    sendInput: (msg) => {
      if (dataChannel?.readyState === 'open')
        dataChannel.send(JSON.stringify({ ...msg, peerId }))
    },
    disconnect: () => {
      pc.close()
      getSupabase().removeChannel(sigChannel)
    },
  }
}
