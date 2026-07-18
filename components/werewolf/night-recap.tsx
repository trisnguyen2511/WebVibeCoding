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
  onToggleAlive: (playerId: string, isAlive: boolean) => void
  onConfirm: () => void
}

function markerId(color: string) {
  return `recap-arrow-${color.replace('#', '')}`
}

const SIZE = 300
const CENTER = SIZE / 2
const RADIUS = 112
const NODE_R = 22

function nodePosition(index: number, total: number) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
  return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) }
}

export function NightRecap({ players, roles, night, actions, deaths, onToggleAlive, onConfirm }: NightRecapProps) {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const positions = new Map(players.map((p, i) => [p.id, nodePosition(i, players.length)]))
  const deathSet = new Set(deaths)

  const arrows = actions
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
          return { key: `${a.id}-${targetId}`, from, to, color }
        })
        .filter((x): x is { key: string; from: { x: number; y: number }; to: { x: number; y: number }; color: string } => !!x)
    })
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

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto h-[280px] w-[280px] max-w-full select-none">
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
              {deathSet.has(player.id) && (
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
            const diedTonight = deathSet.has(player.id)
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
              </li>
            )
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98]"
      >
        ✅ Xác nhận, sang ngày
      </button>
    </div>
  )
}
