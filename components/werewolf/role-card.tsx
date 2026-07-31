import type { RoleDef } from '@/lib/werewolf/types'

const FACTION_LABEL: Record<RoleDef['faction'], string> = {
  wolf: 'Sói',
  village: 'Dân làng',
  neutral: 'Trung lập',
}

const FACTION_COLOR: Record<RoleDef['faction'], string> = {
  wolf: 'text-red-400 border-red-400/30 bg-red-400/10',
  village: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  neutral: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
}

export function RoleCard({ role }: { role: RoleDef }) {
  return (
    <div className={`space-y-3 rounded-2xl border p-5 text-center ${FACTION_COLOR[role.faction]}`}>
      <p className="text-5xl">{role.icon}</p>
      <div>
        <p className="text-lg font-semibold text-fg">{role.name}</p>
        <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 font-mono text-xs ${FACTION_COLOR[role.faction]}`}>
          {FACTION_LABEL[role.faction]}
        </span>
      </div>
      <p className="text-left text-sm leading-relaxed text-muted">{role.description}</p>
    </div>
  )
}
