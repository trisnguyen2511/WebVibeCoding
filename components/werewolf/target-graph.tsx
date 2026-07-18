'use client'
import { useRef, useState } from 'react'
import type { Player, RoleDef } from '@/lib/werewolf/types'
import { primaryRole } from '@/lib/werewolf/primary-role'

interface TargetGraphProps {
  players: Player[]
  roles: RoleDef[]
  actorId: string
  targetCount: 0 | 1 | 2
  selected: string[]
  onChange?: (ids: string[]) => void
  edgeColor: string
  canTargetSelf: boolean
  readOnly?: boolean
}

// Vòng tròn kích thước cố định — KHÔNG giãn thành elip theo số người, vì elip
// cao buộc MC phải cuộn xuống mới bấm được nút xác nhận, bất tiện hơn nhãn bị
// hơi sát nhau khi đông người. Vẫn chừa padding để nhãn trên/dưới không cắt.
const RADIUS = 148
const NODE_R = 28
const PAD_X = 32
const PAD_Y = 44
const WIDTH = RADIUS * 2 + NODE_R * 2 + PAD_X * 2
const HEIGHT = RADIUS * 2 + NODE_R * 2 + PAD_Y * 2
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2

function nodePosition(index: number, total: number) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
  return {
    x: CENTER_X + RADIUS * Math.cos(angle),
    y: CENTER_Y + RADIUS * Math.sin(angle),
  }
}

/**
 * Node (vẽ sau, r=NODE_R) đè lên trên line — nếu mũi tên chạm đúng tâm node
 * thì bị che khuất hoàn toàn. Kéo lùi điểm cuối ra khỏi mép node để mũi tên
 * hiện rõ bên ngoài.
 */
function pullBackToEdge(from: { x: number; y: number }, to: { x: number; y: number }, distance: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len <= distance) return to
  return { x: to.x - (dx / len) * distance, y: to.y - (dy / len) * distance }
}

export function TargetGraph({
  players,
  roles,
  actorId,
  targetCount,
  selected,
  onChange,
  edgeColor,
  canTargetSelf,
  readOnly = false,
}: TargetGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const draggingRef = useRef(false)
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null)
  const roleById = new Map(roles.map((r) => [r.id, r]))

  const eligible = players.filter((p) => p.isAlive || p.id === actorId)
  const positions = new Map(eligible.map((p, i) => [p.id, nodePosition(i, eligible.length)]))
  const actorPos = positions.get(actorId)

  function toSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * WIDTH,
      y: ((clientY - rect.top) / rect.height) * HEIGHT,
    }
  }

  function handleActorPointerDown(e: React.PointerEvent<SVGCircleElement>) {
    if (readOnly || !onChange || targetCount === 0 || selected.length >= targetCount) return
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragPoint(toSvgPoint(e.clientX, e.clientY))
  }

  function handlePointerMove(e: React.PointerEvent<SVGCircleElement>) {
    if (!draggingRef.current) return
    setDragPoint(toSvgPoint(e.clientX, e.clientY))
  }

  function handlePointerUp(e: React.PointerEvent<SVGCircleElement>) {
    if (!draggingRef.current || !onChange) return
    draggingRef.current = false
    setDragPoint(null)
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const targetId = el?.closest('[data-player-id]')?.getAttribute('data-player-id')
    if (!targetId) return
    if (targetId === actorId && !canTargetSelf) return
    if (selected.includes(targetId) || selected.length >= targetCount) return
    onChange([...selected, targetId])
  }

  function handleNodeTap(playerId: string) {
    if (readOnly || !onChange) return
    if (selected.includes(playerId)) onChange(selected.filter((id) => id !== playerId))
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mx-auto h-auto w-full max-w-[400px] touch-none select-none"
      >
        {selected.map((targetId) => {
          const pos = positions.get(targetId)
          if (!pos || !actorPos) return null
          const tip = pullBackToEdge(actorPos, pos, NODE_R + 4)
          return (
            <line
              key={targetId}
              x1={actorPos.x}
              y1={actorPos.y}
              x2={tip.x}
              y2={tip.y}
              stroke={edgeColor}
              strokeWidth={2.5}
              markerEnd="url(#arrow)"
            />
          )
        })}
        {dragPoint && actorPos && (
          <line
            x1={actorPos.x}
            y1={actorPos.y}
            x2={dragPoint.x}
            y2={dragPoint.y}
            stroke={edgeColor}
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        )}
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={edgeColor} />
          </marker>
        </defs>

        {eligible.map((player) => {
          const pos = positions.get(player.id)
          if (!pos) return null
          const isActor = player.id === actorId
          const isSelected = selected.includes(player.id)
          const role = primaryRole(player, roleById)
          const isCouple = player.linkedWith.length > 0
          return (
            <g
              key={player.id}
              data-player-id={player.id}
              opacity={player.isAlive ? 1 : 0.35}
              onClick={() => handleNodeTap(player.id)}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={NODE_R}
                fill={isSelected ? edgeColor : 'rgb(var(--color-surface))'}
                fillOpacity={isSelected ? 0.25 : 1}
                stroke={isActor ? '#7C3AED' : isSelected ? edgeColor : 'rgb(var(--color-border))'}
                strokeWidth={isActor ? 3 : 1.5}
                onPointerDown={isActor ? handleActorPointerDown : undefined}
                onPointerMove={isActor ? handlePointerMove : undefined}
                onPointerUp={isActor ? handlePointerUp : undefined}
                className={isActor && !readOnly ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
              />
              {role && (
                <text
                  x={pos.x}
                  y={pos.y - NODE_R - 8}
                  textAnchor="middle"
                  className="pointer-events-none select-none text-[10px] fill-muted"
                >
                  {role.shortName ?? role.name}
                </text>
              )}
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none select-none text-[20px]"
              >
                {role?.icon ?? '❓'}
              </text>
              {isCouple && (
                <text
                  x={pos.x + NODE_R - 4}
                  y={pos.y - NODE_R + 4}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none select-none text-[13px]"
                >
                  💘
                </text>
              )}
              <text
                x={pos.x}
                y={pos.y + NODE_R + 11}
                textAnchor="middle"
                className="pointer-events-none select-none text-[11px] fill-muted"
              >
                {player.name.length > 8 ? `${player.name.slice(0, 7)}…` : player.name}
              </text>
            </g>
          )
        })}
      </svg>
      {!readOnly && (
        <p className="text-center text-xs text-muted">
          Kéo từ người viền tím (đang thao tác) tới {targetCount === 2 ? '2 mục tiêu' : 'mục tiêu'} — tap lại vào mục
          tiêu đã chọn để bỏ chọn.
        </p>
      )}
    </div>
  )
}
