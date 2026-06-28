'use client'
import { useEffect, useRef, useState } from 'react'
import { createRoom, InputMessage } from '@/lib/webrtc'

export type ButtonState = {
  UP: boolean; DOWN: boolean; LEFT: boolean; RIGHT: boolean
  A: boolean; B: boolean; START: boolean; SELECT: boolean
}

const INITIAL: ButtonState = {
  UP: false, DOWN: false, LEFT: false, RIGHT: false,
  A: false, B: false, START: false, SELECT: false,
}

export function useGameController(roomId: string) {
  const [buttons, setButtons] = useState<ButtonState>(INITIAL)
  const [connected, setConnected] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!roomId) return

    const handleInput = (msg: InputMessage) => {
      if (msg.type !== 'button') return
      setButtons(prev => ({ ...prev, [msg.key]: msg.state === 'pressed' }))
    }

    createRoom(roomId, handleInput, () => setConnected(true))
      .then(cleanup => { cleanupRef.current = cleanup })

    return () => { cleanupRef.current?.(); setConnected(false); setButtons(INITIAL) }
  }, [roomId])

  return { buttons, connected }
}
