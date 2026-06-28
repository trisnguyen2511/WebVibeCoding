import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export type InputMessage = {
  type: 'button'
  key: string
  state: 'pressed' | 'released'
  ts: number
}

// PC side — host the controller input receiver
export async function createRoom(
  roomId: string,
  onInput: (msg: InputMessage) => void,
  onConnected: () => void
): Promise<() => void> {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  const channel = supabase.channel(`controller-${roomId}`, { config: { broadcast: { self: false } } })

  const dataChannel = pc.createDataChannel('input')
  dataChannel.onmessage = (e) => onInput(JSON.parse(e.data as string) as InputMessage)
  dataChannel.onopen = onConnected

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) channel.send({ type: 'broadcast', event: 'ice-pc', payload: candidate.toJSON() })
  }

  channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
    await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit))
  })
  channel.on('broadcast', { event: 'ice-phone' }, async ({ payload }) => {
    await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit))
  })

  await new Promise<void>(resolve => channel.subscribe(status => { if (status === 'SUBSCRIBED') resolve() }))

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  channel.send({ type: 'broadcast', event: 'offer', payload: { type: offer.type, sdp: offer.sdp } })

  return () => { pc.close(); supabase.removeChannel(channel) }
}

// Phone side — join as controller
export async function joinRoom(roomId: string): Promise<{
  sendInput: (msg: InputMessage) => void
  disconnect: () => void
}> {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  const channel = supabase.channel(`controller-${roomId}`, { config: { broadcast: { self: false } } })
  let dataChannel: RTCDataChannel | null = null

  pc.ondatachannel = (e) => { dataChannel = e.channel }

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) channel.send({ type: 'broadcast', event: 'ice-phone', payload: candidate.toJSON() })
  }

  channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
    await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    channel.send({ type: 'broadcast', event: 'answer', payload: { type: answer.type, sdp: answer.sdp } })
  })
  channel.on('broadcast', { event: 'ice-pc' }, async ({ payload }) => {
    await pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit))
  })

  await new Promise<void>(resolve => channel.subscribe(status => { if (status === 'SUBSCRIBED') resolve() }))

  return {
    sendInput: (msg) => { if (dataChannel?.readyState === 'open') dataChannel.send(JSON.stringify(msg)) },
    disconnect: () => { pc.close(); supabase.removeChannel(channel) },
  }
}
