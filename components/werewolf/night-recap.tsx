'use client'
import type { NightAction, Player, RoleDef } from '@/lib/werewolf/types'
import { EFFECT_COLOR } from '@/lib/werewolf/effect-color'
import { primaryRole } from '@/lib/werewolf/primary-role'

interface NightRecapProps {
  players: Player[]
  roles: RoleDef[]
  night: number
  actions: NightAction[]
  deaths: string[]
  /** Người được cứu bằng thuốc giải/hồi sinh không chỉ định target — vẽ mũi tên actor -> người được cứu. */
  healed: { actorPlayerId: string; playerId: string }[]
  onToggleAlive: (playerId: string, isAlive: boolean) => void
  onConfirm: () => void
  /** Chỉ xem lại (VD tóm tắt cuối ván) — ẩn nút sửa trạng thái và nút xác nhận. */
  readOnly?: boolean
}

function markerId(color: string) {
  return `recap-arrow-${color.replace('#', '')}`
}

// Vòng tròn kích thước cố định — KHÔNG giãn thành elip theo số người, vì elip
// cao buộc MC phải cuộn xuống mới bấm được nút xác nhận.
const RADIUS = 148
const NODE_R = 26
const PAD_X = 32
const PAD_Y = 40
const WIDTH = RADIUS * 2 + NODE_R * 2 + PAD_X * 2
const HEIGHT = RADIUS * 2 + NODE_R * 2 + PAD_Y * 2
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2

function nodePosition(index: number, total: number) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
  return { x: CENTER_X + RADIUS * Math.cos(angle), y: CENTER_Y + RADIUS * Math.sin(angle) }
}

/**
 * Node (vẽ sau, r=NODE_R) đè lên trên line — nếu mũi tên chạm đúng tâm node
 * thì bị che khuất hoàn toàn (đây là lý do đường dẫn thao tác không thấy mũi
 * tên). Kéo lùi điểm cuối ra khỏi mép node để mũi tên hiện rõ bên ngoài.
 */
function pullBackToEdge(from: { x: number; y: number }, to: { x: number; y: number }, distance: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len <= distance) return to
  return { x: to.x - (dx / len) * distance, y: to.y - (dy / len) * distance }
}

export function NightRecap({ players, roles, night, actions, deaths, healed, onToggleAlive, onConfirm, readOnly = false }: NightRecapProps) {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const positions = new Map(players.map((p, i) => [p.id, nodePosition(i, players.length)]))
  const deathSet = new Set(deaths)

  const actionArrows = actions
    .filter((a) => !a.skipped && a.targetPlayerIds.length > 0)
    .flatMap((a) => {
      const role = roleById.get(a.roleId)
      if (!role) return []
      const from = positions.get(a.actorPlayerId)
      const color = EFFECT_COLOR[role.effect]
      return a.targetPlayerIds
        .map((targetId) => {
          const to = positions.get(targetId)
          if (!from || !to) return null
          return { key: `${a.id}-${targetId}`, from, to: pullBackToEdge(from, to, NODE_R + 4), color }
        })
        .filter((x): x is { key: string; from: { x: number; y: number }; to: { x: number; y: number }; color: string } => !!x)
    })

  // Bình thuốc giải kiểu Phù thủy không chỉ định target lúc thao tác (tự cứu
  // người đang sắp chết) — vẫn cần vẽ mũi tên actor -> người được cứu ở đây.
  const healArrows = healed
    .map((h) => {
      const from = positions.get(h.actorPlayerId)
      const to = positions.get(h.playerId)
      if (!from || !to) return null
      return { key: `heal-${h.actorPlayerId}-${h.playerId}`, from, to: pullBackToEdge(from, to, NODE_R + 4), color: EFFECT_COLOR.revive }
    })
    .filter((x): x is { key: string; from: { x: number; y: number }; to: { x: number; y: number }; color: string } => !!x)

  const arrows = [...actionArrows, ...healArrows]
  const arrowColors = Array.from(new Set(arrows.map((a) => a.color)))

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-accent/40 bg-surface px-4 py-4 text-center">
        <p className="text-2xl">🔎</p>
        <p className="mt-1 font-display text-base font-semibold text-fg">Kiểm tra lại đêm {night}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
          Màu viền = loại hiệu ứng của vai, số ở góc = thứ tự hoạt động trong đêm. Bấm tên bên dưới để sửa nếu hệ thống tính nhầm.
        </p>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mx-auto h-auto w-full max-w-[400px] select-none">
        <defs>
          {arrowColors.map((color) => (
            <marker key={color} id={markerId(color)} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill={color} />
            </marker>
          ))}
        </defs>
        {arrows.map((arrow) => (
          <line
            key={arrow.key}
            x1={arrow.from.x}
            y1={arrow.from.y}
            x2={arrow.to.x}
            y2={arrow.to.y}
            stroke={arrow.color}
            strokeWidth={2}
            opacity={0.85}
            markerEnd={`url(#${markerId(arrow.color)})`}
          />
        ))}
        {players.map((player) => {
          const pos = positions.get(player.id)
          if (!pos) return null
          const role = primaryRole(player, roleById)
          const color = role ? EFFECT_COLOR[role.effect] : '#52525B'
          const isCouple = player.linkedWith.length > 0
          return (
            <g key={player.id} opacity={player.isAlive ? 1 : 0.35}>
              <circle cx={pos.x} cy={pos.y} r={NODE_R} fill="rgb(var(--color-surface))" stroke={color} strokeWidth={2.5} />
              {role?.actsAtNight && (
                <g>
                  <circle cx={pos.x + NODE_R - 4} cy={pos.y - NODE_R + 4} r={7} fill={color} />
                  <text
                    x={pos.x + NODE_R - 4}
                    y={pos.y - NODE_R + 4}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none select-none font-mono text-[8px] fill-fg"
                  >
                    {role.priority}
                  </text>
                </g>
              )}
              {isCouple && (
                <text
                  x={pos.x - NODE_R + 4}
                  y={pos.y - NODE_R + 4}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none select-none text-[10px]"
                >
                  💘
                </text>
              )}
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none select-none text-[15px]"
              >
                {role?.icon ?? '❓'}
              </text>
              <text x={pos.x} y={pos.y + NODE_R + 11} textAnchor="middle" className="pointer-events-none select-none text-[9px] fill-muted">
                {player.name.length > 8 ? `${player.name.slice(0, 7)}…` : player.name}
              </text>
              {deathSet.has(player.id) && !player.isAlive && (
                <text x={pos.x} y={pos.y - NODE_R - 6} textAnchor="middle" className="pointer-events-none select-none text-[11px]">
                  💀
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div>
        <p className="mb-1.5 text-sm text-muted">Trạng thái sau đêm {night} — bấm để sửa nếu sai</p>
        <ul className="space-y-1.5">
          {players.map((player) => {
            const role = primaryRole(player, roleById)
            const diedTonight = deathSet.has(player.id) && !player.isAlive
            return (
              <li
                key={player.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  diedTonight ? 'border-red-500/40 bg-red-500/5' : 'border-border bg-surface'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{player.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {player.roleIds.map((id) => roleById.get(id)?.name).filter(Boolean).join(', ') || '—'}
                    {player.linkedWith.length > 0 && <span className="text-pink-400"> · 💘 Cặp đôi</span>}
                  </span>
                </span>
                {readOnly ? (
                  <span className={`shrink-0 text-xs ${player.isAlive ? 'text-muted' : 'text-red-400'}`}>
                    {player.isAlive ? 'Còn sống' : 'Đã chết'}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleAlive(player.id, !player.isAlive)}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      player.isAlive
                        ? 'border-border text-muted hover:border-red-500/40 hover:text-red-400'
                        : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
                    }`}
                  >
                    {player.isAlive ? 'Đang sống · cho chết' : 'Đã chết · hồi sinh'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98]"
        >
          ✅ Xác nhận, sang ngày
        </button>
      )}
    </div>
  )
}
