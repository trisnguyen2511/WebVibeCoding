'use client'
import { useRef, useState } from 'react'
import type { PlayerSetup } from '@/lib/werewolf/types'

interface SetupOrderProps {
  players: PlayerSetup[]
  onChange: (players: PlayerSetup[]) => void
}

const ITEM_HEIGHT = 48 // px — chiều cao mỗi hàng (py-2.5 + border), dùng để tính vị trí khi kéo.

// Thứ tự trong mảng players quyết định vị trí trên vòng tròn của TargetGraph —
// sắp xếp lại đây để khớp với chỗ ngồi thật ngoài đời, giúp MC dễ hướng dẫn.
export function SetupOrder({ players, onChange }: SetupOrderProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const startYRef = useRef(0)
  const currentIndexRef = useRef(0)

  function handlePointerDown(e: React.PointerEvent, index: number) {
    e.currentTarget.setPointerCapture(e.pointerId)
    startYRef.current = e.clientY
    currentIndexRef.current = index
    setDragIndex(index)
    setDragY(0)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragIndex === null) return
    const delta = e.clientY - startYRef.current
    setDragY(delta)

    const shift = Math.round(delta / ITEM_HEIGHT)
    const newIndex = Math.min(players.length - 1, Math.max(0, dragIndex + shift))
    if (newIndex !== currentIndexRef.current) {
      const next = [...players]
      const [moved] = next.splice(currentIndexRef.current, 1)
      next.splice(newIndex, 0, moved)
      currentIndexRef.current = newIndex
      onChange(next)
      // Bù lại startY để phần tử đang kéo không bị "nhảy" khi mảng đã đổi thứ tự.
      startYRef.current = e.clientY - (newIndex - dragIndex) * ITEM_HEIGHT
    }
  }

  function handlePointerUp() {
    setDragIndex(null)
    setDragY(0)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Sắp xếp theo đúng vị trí ngồi ngoài đời trước khi chia vai — giữ icon ☰ để kéo thả đổi chỗ.
      </p>
      <ul className="space-y-1.5">
        {players.map((player, i) => {
          const isDragging = dragIndex === i
          return (
            <li
              key={player.id}
              style={
                isDragging
                  ? { transform: `translateY(${dragY}px)`, zIndex: 10, position: 'relative' }
                  : undefined
              }
              className={`flex select-none items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 ${
                isDragging ? 'border-accent shadow-lg shadow-accent/20' : 'border-border'
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted">
                {i + 1}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm text-fg">{player.name}</p>
              <span
                role="button"
                aria-label={`Kéo để đổi vị trí ${player.name}`}
                onPointerDown={(e) => handlePointerDown(e, i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded-lg border border-border text-base text-muted transition-colors hover:text-fg active:cursor-grabbing"
              >
                ☰
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
