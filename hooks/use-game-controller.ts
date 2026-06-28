'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoom, InputMessage, PlayerInfo, RoomHandle } from '@/lib/webrtc'

export type ButtonState = Record<string, boolean>

export function useGameController(roomId: string) {
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [playerInputs, setPlayerInputs] = useState<Record<string, ButtonState>>({})
  const handleRef = useRef<RoomHandle | null>(null)

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
    ).then((handle) => {
      if (cancelled) handle.cleanup()
      else handleRef.current = handle
    })

    return () => {
      cancelled = true
      handleRef.current?.cleanup()
      handleRef.current = null
      setPlayers([])
      setPlayerInputs({})
    }
  }, [roomId])

  const kickPlayer = useCallback((peerId: string) => {
    handleRef.current?.kickPlayer(peerId)
  }, [])

  return { players, playerInputs, kickPlayer }
}
