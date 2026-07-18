'use client'
import { useEffect, useRef, useState } from 'react'
import type { PlayerSetup } from '@/lib/werewolf/types'

interface SetupOrderProps {
  players: PlayerSetup[]
  onChange: (players: PlayerSetup[]) => void
}

// Ngưỡng di chuyển tối thiểu trước khi tính là đang kéo — tránh rung tay/tap
// nhẹ bị hiểu nhầm thành kéo (drag-threshold).
const DRAG_THRESHOLD = 4

// Thứ tự hiển thị quyết định vị trí trên vòng tròn của TargetGraph — sắp xếp
// lại đây để khớp với chỗ ngồi thật ngoài đời, giúp MC dễ hướng dẫn.
//
// Khi kéo, chỉ cập nhật state cục bộ (order) để phản hồi tức thời và mượt —
// KHÔNG gọi onChange trên mỗi lần di chuyển, vì onChange đẩy state lên tận
// page.tsx và kích hoạt ghi localStorage mỗi lần, gây giật. Chỉ commit ra
// ngoài đúng 1 lần khi thả tay (pointer up) — đọc từ orderRef (không phải
// state order) để tránh đọc phải giá trị cũ nếu pointerup tới trước khi
// React kịp re-render sau lần setOrder cuối cùng.
export function SetupOrder({ players, onChange }: SetupOrderProps) {
  const [order, setOrder] = useState(players)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  const orderRef = useRef(players)
  const rowRefs = useRef(new Map<string, HTMLLIElement>())
  const pointerIdRef = useRef<number | null>(null)
  const startYRef = useRef(0)
  const rowPitchRef = useRef(56)
  const startIndexRef = useRef(0)
  const currentIndexRef = useRef(0)
  const draggingRef = useRef(false)

  // Đồng bộ lại từ props khi không đang kéo dở (VD thêm/xoá người chơi ở bước trước).
  useEffect(() => {
    if (!draggingRef.current) {
      orderRef.current = players
      setOrder(players)
    }
  }, [players])

  function measureRowPitch() {
    const els = orderRef.current.map((p) => rowRefs.current.get(p.id)).filter((el): el is HTMLLIElement => !!el)
    if (els.length >= 2) {
      return els[1].getBoundingClientRect().top - els[0].getBoundingClientRect().top
    }
    return els[0]?.getBoundingClientRect().height ?? 56
  }

  function handlePointerDown(e: React.PointerEvent, id: string, index: number) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerIdRef.current = e.pointerId
    startYRef.current = e.clientY
    startIndexRef.current = index
    currentIndexRef.current = index
    rowPitchRef.current = measureRowPitch()
    draggingRef.current = false
    setDragId(id)
    setDragOffset(0)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (pointerIdRef.current === null || e.pointerId !== pointerIdRef.current) return
    const delta = e.clientY - startYRef.current

    if (!draggingRef.current) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return
      draggingRef.current = true
    }

    setDragOffset(delta)

    const pitch = rowPitchRef.current || 56
    const shift = Math.round(delta / pitch)
    const newIndex = Math.min(orderRef.current.length - 1, Math.max(0, startIndexRef.current + shift))
    if (newIndex !== currentIndexRef.current) {
      const next = [...orderRef.current]
      const [moved] = next.splice(currentIndexRef.current, 1)
      next.splice(newIndex, 0, moved)
      orderRef.current = next
      currentIndexRef.current = newIndex
      setOrder(next)
    }
  }

  function handlePointerUp() {
    if (pointerIdRef.current !== null && draggingRef.current) onChange(orderRef.current)
    pointerIdRef.current = null
    draggingRef.current = false
    setDragId(null)
    setDragOffset(0)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Sắp xếp theo đúng vị trí ngồi ngoài đời trước khi chia vai — giữ icon ☰ để kéo thả đổi chỗ.
      </p>
      <ul className="space-y-1.5">
        {order.map((player, i) => {
          const isDragging = dragId === player.id && draggingRef.current
          return (
            <li
              key={player.id}
              ref={(el) => {
                if (el) rowRefs.current.set(player.id, el)
                else rowRefs.current.delete(player.id)
              }}
              style={
                isDragging
                  ? { transform: `translateY(${dragOffset}px)`, zIndex: 10, position: 'relative' }
                  : undefined
              }
              className={`flex select-none items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 ${
                isDragging ? 'border-accent shadow-lg shadow-accent/20' : 'border-border transition-transform'
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted">
                {i + 1}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm text-fg">{player.name}</p>
              <span
                role="button"
                aria-label={`Kéo để đổi vị trí ${player.name}`}
                onPointerDown={(e) => handlePointerDown(e, player.id, i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-lg border border-border text-base text-muted transition-colors hover:text-fg active:cursor-grabbing"
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
