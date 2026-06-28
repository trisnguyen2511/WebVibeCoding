'use client'
import { useEffect, useRef, useState } from 'react'
import { createRoom, InputMessage, PlayerInfo } from '@/lib/webrtc'

export type ButtonState = Record<string, boolean>

export function useGameController(roomId: string) {
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [playerInputs, setPlayerInputs] = useState<Record<string, ButtonState>>({})
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    createRoom(
      roomId,
      (msg: InputMessage) => {
        if (msg.type !== 'button') return
        setPlayerInputs((prev) => ({
          ...prev,
          [msg.peerId]: {
            ...(prev[msg.peerId] ?? {}),
            [msg.key]: msg.state === 'pressed',
          },
        }))
      },
      (newPlayers: PlayerInfo[]) => {
        if (!cancelled) setPlayers(newPlayers)
      }
    ).then((cleanup) => {
      if (cancelled) cleanup()
      else cleanupRef.current = cleanup
    })

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
      setPlayers([])
      setPlayerInputs({})
    }
  }, [roomId])

  return { players, playerInputs }
}
