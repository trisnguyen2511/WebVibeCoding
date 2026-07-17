'use client'
import { useState } from 'react'
import type { EffectType, Faction, RoleDef } from '@/lib/werewolf/types'

interface RoleEditorDialogProps {
  onCreate: (role: RoleDef) => void
  onCancel: () => void
}

const FACTIONS: { value: Faction; label: string }[] = [
  { value: 'village', label: 'Dân làng' },
  { value: 'wolf', label: 'Sói' },
  { value: 'neutral', label: 'Trung lập' },
]

const EFFECTS: { value: EffectType; label: string }[] = [
  { value: 'kill', label: 'Giết' },
  { value: 'protect', label: 'Bảo vệ' },
  { value: 'inspect', label: 'Soi (chỉ MC biết)' },
  { value: 'poison', label: 'Đầu độc (bỏ qua bảo vệ)' },
  { value: 'revive', label: 'Hồi sinh / cứu' },
  { value: 'link', label: 'Ghép cặp liên kết sinh tử' },
  { value: 'swap', label: 'Hoán đổi (MC tự xử lý)' },
  { value: 'silence', label: 'Câm lặng ngày hôm sau' },
  { value: 'custom', label: 'Tùy chỉnh (MC tự diễn giải)' },
]

// Không dùng modal/dialog thật (repo chưa có dependency Radix Dialog) — đây
// là 1 panel mở rộng ngay trong dòng chảy setup, đủ dùng cho form ngắn này.
export function RoleEditorDialog({ onCreate, onCancel }: RoleEditorDialogProps) {
  const [name, setName] = useState('')
  const [faction, setFaction] = useState<Faction>('village')
  const [effect, setEffect] = useState<EffectType>('custom')
  const [targetCount, setTargetCount] = useState<0 | 1 | 2>(1)
  const [priority, setPriority] = useState(50)
  const [description, setDescription] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate({
      id: crypto.randomUUID(),
      name: trimmed,
      faction,
      icon: '✨',
      isBuiltIn: false,
      actsAtNight: targetCount > 0 || effect !== 'custom',
      priority,
      targetCount,
      canTargetSelf: true,
      canTargetDead: false,
      effect,
      firstNightOnly: false,
      extraLives: 0,
      isCouncil: false,
      description: description.trim() || 'Vai trò tùy chỉnh.',
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-accent/40 bg-surface p-3">
      <p className="text-sm font-medium text-fg">Vai trò tùy chỉnh mới</p>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên vai trò..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none focus:border-accent"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Phe
          <select
            value={faction}
            onChange={(e) => setFaction(e.target.value as Faction)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-fg"
          >
            {FACTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted">
          Hiệu ứng
          <select
            value={effect}
            onChange={(e) => setEffect(e.target.value as EffectType)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-fg"
          >
            {EFFECTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted">
          Số mục tiêu / đêm
          <select
            value={targetCount}
            onChange={(e) => setTargetCount(Number(e.target.value) as 0 | 1 | 2)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-fg"
          >
            <option value={0}>0 (không target)</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>

        <label className="text-xs text-muted">
          Thứ tự thức dậy
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-fg"
          />
        </label>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Mô tả hiệu ứng cho MC tự diễn giải..."
        rows={2}
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none focus:border-accent"
      />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fg disabled:opacity-40"
        >
          Tạo vai trò
        </button>
      </div>
    </div>
  )
}
