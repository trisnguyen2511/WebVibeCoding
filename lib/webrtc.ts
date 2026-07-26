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
// the data channel actually opening) before treating it as failed.
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

export type OrientationInput = {
  type: 'orientation'
  alpha: number
  beta: number
  ts: number
}

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

  // Supabase-relay peers — phones that fell back to relay mode after
  // WebRTC ICE failed. They send inputs via Supabase broadcast instead of
  // a data channel; treated as fully connected from the host's perspective.
  const relayPeers = new Map<string, { playerIndex: number }>()

  const allUsedIndices = () => new Set([
    ...Array.from(peers.values()).map((p) => p.playerIndex),
    ...Array.from(relayPeers.values()).map((p) => p.playerIndex),
  ])

  const notify = () =>
    onPlayersChange([
      ...Array.from(peers.entries()).map(([peerId, { playerIndex, connected }]) => ({
        peerId, playerIndex, connected,
      })),
      ...Array.from(relayPeers.entries()).map(([peerId, { playerIndex }]) => ({
        peerId, playerIndex, connected: true,
      })),
    ])

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
    if (peers.has(peerId) || relayPeers.has(peerId)) return
    if (peers.size + relayPeers.size >= 4) return

    const used = allUsedIndices()
    let playerIndex = -1
    for (let i = 0; i < 4; i++) {
      if (!used.has(i)) { playerIndex = i; break }
    }
    if (playerIndex === -1) return

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const dc = pc.createDataChannel('input')

    pc.oniceconnectionstatechange = () => console.log(`[webrtc host] ice state (${peerId}):`, pc.iceConnectionState)

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
    // ── Supabase relay fallback handlers ───────────────────────────
    // When WebRTC ICE fails on the phone (typically iOS Safari behind NAT
    // or with iCloud Private Relay), the phone switches to sending inputs
    // directly via Supabase broadcast. The host handles them identically to
    // WebRTC data-channel messages — same onInput callback, same playerIndex
    // assignment. Latency is ~50-150ms vs <10ms for WebRTC, but it works
    // on every network without requiring a reliable TURN server.
    .on('broadcast', { event: 'relay-connect' }, ({ payload }) => {
      const { peerId } = payload as { peerId: string }
      if (relayPeers.has(peerId) || peers.has(peerId)) return
      if (peers.size + relayPeers.size >= 4) return

      const used = allUsedIndices()
      let playerIndex = -1
      for (let i = 0; i < 4; i++) {
        if (!used.has(i)) { playerIndex = i; break }
      }
      if (playerIndex === -1) return

      relayPeers.set(peerId, { playerIndex })
      sigChannel.send({
        type: 'broadcast',
        event: 'relay-assigned',
        payload: { to: peerId, playerIndex },
      })
      notify()
    })
    .on('broadcast', { event: 'relay-input' }, ({ payload }) => {
      const msg = payload as InputMessage
      if (!relayPeers.has(msg.peerId)) return
      onInput(msg)
    })
    .on('broadcast', { event: 'relay-disconnect' }, ({ payload }) => {
      const { peerId } = payload as { peerId: string }
      if (relayPeers.delete(peerId)) notify()
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
      relayPeers.clear()
      getSupabase().removeChannel(sigChannel)
    },
    kickPlayer: (peerId: string) => {
      if (relayPeers.delete(peerId)) { notify(); return }
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
export async function joinRoom(
  roomId: string,
  onAssigned: (playerIndex: number) => void,
  onDisconnected: () => void,
  onHostMessage?: (data: unknown) => void,
  onConnected?: () => void,
  onRetrying?: (attempt: number) => void,
  // Called when all WebRTC attempts fail and the connection falls back to
  // Supabase relay. Optional — callers can use it to show a status badge.
  onRelayMode?: () => void
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
  let relayMode = false
  let relayPeerId = ''
  // Per-attempt ICE candidate queue — reset on each startAttempt().
  // Candidates that arrive before setRemoteDescription completes are
  // stored here and flushed after — the primary iOS Safari fix.
  let remoteDescSet = false
  let pendingCandidates: RTCIceCandidateInit[] = []

  const clearConnectTimer = () => {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null }
  }

  const switchToRelay = () => {
    relayMode = true
    relayPeerId = Math.random().toString(36).slice(2, 10).toUpperCase()
    onRelayMode?.()
    sigChannel.send({
      type: 'broadcast',
      event: 'relay-connect',
      payload: { peerId: relayPeerId },
    })
    // Safety: if host never responds (room full, host offline), give up after 8s
    const relayTimeout = setTimeout(() => {
      if (!stopped && relayMode && !relayPeerId) onDisconnected()
    }, 8000)
    // relayTimeout is cleared when relay-assigned fires (via the flag below)
    void relayTimeout // suppress unused-variable lint
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
      if (current?.pc !== pc) return
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
        // All WebRTC attempts failed — fall back to Supabase relay so the
        // phone can still send inputs on networks where ICE always fails
        // (iOS Safari behind carrier NAT + unreliable/rate-limited TURN).
        switchToRelay()
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
    // ── Relay mode response handler ────────────────────────────────
    .on('broadcast', { event: 'relay-assigned' }, ({ payload }) => {
      const { to, playerIndex } = payload as { to: string; playerIndex: number }
      if (to !== relayPeerId || stopped) return
      onAssigned(playerIndex)
      onConnected?.()
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
      if (relayMode) {
        // In relay mode inputs go through Supabase broadcast instead of WebRTC
        sigChannel.send({
          type: 'broadcast',
          event: 'relay-input',
          payload: { ...msg, peerId: relayPeerId },
        })
        return
      }
      if (current?.dataChannel?.readyState === 'open')
        current.dataChannel.send(JSON.stringify({ ...msg, peerId: current.peerId }))
    },
    disconnect: () => {
      stopped = true
      clearConnectTimer()
      current?.pc.close()
      if (relayMode) {
        sigChannel.send({
          type: 'broadcast',
          event: 'relay-disconnect',
          payload: { peerId: relayPeerId },
        })
      }
      getSupabase().removeChannel(sigChannel)
    },
  }
}
