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

// STUN alone can fail to find a working candidate pair on some networks —
// notably iOS Safari's WebRTC stack is more prone to this than
// Chrome/Android on the same Wi-Fi (mDNS-obfuscated local candidates that
// some routers don't resolve, stricter NAT traversal, etc.), which shows up
// as "phone thinks it joined but the host never sees it connect". The free
// Open Relay TURN servers give ICE a relay fallback path so the connection
// can still complete when direct/STUN candidates don't work.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
]

// How long to give one connection attempt (from offer/answer exchange to
// the data channel actually opening) before treating it as failed. ICE
// negotiation can fail transiently — a free/rate-limited TURN relay not
// responding in time, a flaky candidate pair, etc. — and this has been
// observed in practice to disproportionately hit iOS Safari vs.
// Chrome/Android on the same network. Retrying with a fresh connection
// (new peerId, new ICE gathering) rather than hanging on "connecting"
// forever gives negotiation another shot instead of a dead end.
const CONNECT_TIMEOUT_MS = 10000
const MAX_JOIN_ATTEMPTS = 3

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
  const peers = new Map<string, {
    pc: RTCPeerConnection
    dc: RTCDataChannel
    playerIndex: number
    connected: boolean
    connectTimer: ReturnType<typeof setTimeout>
    pendingCandidates: RTCIceCandidateInit[]
    remoteDescSet: boolean
  }>()

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

  const removePeer = (peerId: string) => {
    const peer = peers.get(peerId)
    if (!peer) return
    clearTimeout(peer.connectTimer)
    peer.pc.close()
    peers.delete(peerId)
    notify()
  }

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

    // Kept unconditional (not dev-only) — this is the only visibility we
    // have into *why* a connection is stuck without a live debugger
    // attached; on iPhone that means Safari's remote Web Inspector from a
    // Mac (Settings → Safari → Advanced → Web Inspector).
    pc.oniceconnectionstatechange = () => console.log(`[webrtc host] ice state (${peerId}):`, pc.iceConnectionState)

    // If this peer's data channel never actually opens (ICE/DTLS never
    // completes), evict it instead of permanently squatting on a player
    // slot — otherwise a phone that keeps retrying with fresh peerIds (see
    // joinRoom's own retry loop) would exhaust all 4 slots after just a
    // few failed attempts, blocking everyone else from joining.
    const connectTimer = setTimeout(() => {
      const peer = peers.get(peerId)
      if (peer && !peer.connected) removePeer(peerId)
    }, CONNECT_TIMEOUT_MS)

    peers.set(peerId, { pc, dc, playerIndex, connected: false, connectTimer, pendingCandidates: [], remoteDescSet: false })

    dc.onopen = () => {
      const peer = peers.get(peerId)
      if (peer) {
        peer.connected = true
        clearTimeout(peer.connectTimer)
      }
      notify()
    }
    dc.onclose = () => {
      const peer = peers.get(peerId)
      if (peer) clearTimeout(peer.connectTimer)
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
      try {
        await peer.pc.setRemoteDescription(
          new RTCSessionDescription({ type: type as RTCSdpType, sdp })
        )
        peer.remoteDescSet = true
        for (const c of peer.pendingCandidates) {
          try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
        }
        peer.pendingCandidates.length = 0
      } catch (err) {
        console.error('[webrtc] setRemoteDescription failed (host):', err)
      }
    })
    .on('broadcast', { event: 'ice-phone' }, async ({ payload }) => {
      const { from, candidate } = payload as { from: string; candidate: RTCIceCandidateInit }
      const peer = peers.get(from)
      if (!peer) return
      if (!peer.remoteDescSet) {
        peer.pendingCandidates.push(candidate)
        return
      }
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
      peers.forEach(({ pc, connectTimer }) => { clearTimeout(connectTimer); pc.close() })
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
  onHostMessage?: (data: unknown) => void,
  // Fires only when the data channel actually opens — i.e. the P2P
  // connection really succeeded. `onAssigned` fires as soon as an SDP
  // offer/answer is exchanged, which is not the same thing: signaling can
  // complete while ICE/DTLS never finishes (seen in practice on iOS
  // Safari), which used to make the phone display "connected" even though
  // the host never saw it. Callers should gate their "connected" UI on
  // this, not on onAssigned alone.
  onConnected?: () => void,
  // Fires each time an attempt times out and a fresh retry begins, with
  // the retry's attempt number (2, 3, ...) — lets the UI show "thử lại
  // (2/3)" instead of just sitting on a plain "connecting" forever.
  onRetrying?: (attempt: number) => void
): Promise<{
  sendInput: (msg: ControllerInput) => void
  disconnect: () => void
  peerId: string
}> {
  const sigChannel = getSupabase().channel(`ctrl-${roomId}`, {
    config: { broadcast: { self: false } },
  })

  let current: { peerId: string; pc: RTCPeerConnection; dataChannel: RTCDataChannel | null } | null = null
  let attempt = 0
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let remoteDescSet = false
  let pendingCandidates: RTCIceCandidateInit[] = []

  const clearConnectTimer = () => {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null }
  }

  const startAttempt = () => {
    if (stopped) return
    attempt += 1
    remoteDescSet = false
    pendingCandidates = []
    const peerId = Math.random().toString(36).slice(2, 10).toUpperCase()
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    current = { peerId, pc, dataChannel: null }

    pc.oniceconnectionstatechange = () => console.log(`[webrtc phone] ice state (${peerId}):`, pc.iceConnectionState)

    pc.ondatachannel = (e) => {
      if (current?.pc !== pc) return // superseded by a later retry — ignore
      const dc = e.channel
      current.dataChannel = dc
      dc.onopen = () => { clearConnectTimer(); onConnected?.() }
      dc.onclose = () => { if (current?.pc === pc) onDisconnected() }
      dc.onmessage = (msg) => onHostMessage?.(JSON.parse(msg.data as string))
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        sigChannel.send({
          type: 'broadcast',
          event: 'ice-phone',
          payload: { from: peerId, candidate: candidate.toJSON() },
        })
    }

    clearConnectTimer()
    connectTimer = setTimeout(() => {
      if (stopped || current?.pc !== pc || current.dataChannel?.readyState === 'open') return
      pc.close()
      if (attempt < MAX_JOIN_ATTEMPTS) {
        onRetrying?.(attempt + 1)
        startAttempt()
      } else {
        onDisconnected()
      }
    }, CONNECT_TIMEOUT_MS)

    sigChannel.send({ type: 'broadcast', event: 'phone-ready', payload: { peerId } })
  }

  sigChannel
    .on('broadcast', { event: 'offer' }, async ({ payload }) => {
      const { to, playerIndex, type, sdp } = payload as {
        to: string
        playerIndex: number
        type: string
        sdp: string
      }
      if (!current || to !== current.peerId) return
      const { pc, peerId } = current
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription({ type: type as RTCSdpType, sdp })
        )
        remoteDescSet = true
        // Flush ICE candidates that arrived while setRemoteDescription was in-flight.
        // iOS Safari's async path is slower than Chrome/Android — host candidates
        // sent via Supabase Realtime outrace it, and the old silent-drop left zero
        // remote candidates, so ICE never completed → phone stuck at "connecting".
        for (const c of pendingCandidates) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch {}
        }
        pendingCandidates = []
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
      if (!current || to !== current.peerId) return
      if (!remoteDescSet) {
        pendingCandidates.push(candidate)
        return
      }
      try {
        await current.pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {}
    })

  await new Promise<void>((resolve) =>
    sigChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
    })
  )

  // Announce after subscription is confirmed — eliminates race condition
  startAttempt()

  return {
    peerId: current!.peerId,
    sendInput: (msg: ControllerInput) => {
      if (current?.dataChannel?.readyState === 'open')
        current.dataChannel.send(JSON.stringify({ ...msg, peerId: current.peerId }))
    },
    disconnect: () => {
      stopped = true
      clearConnectTimer()
      current?.pc.close()
      getSupabase().removeChannel(sigChannel)
    },
  }
}
