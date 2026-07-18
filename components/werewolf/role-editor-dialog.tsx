'use client'
import { useState } from 'react'
import type { EffectType, Faction, RoleDef } from '@/lib/werewolf/types'

interface RoleEditorDialogProps {
  onCreate: (role: RoleDef) => void
  onCancel: () => void
  /** Nếu có — form ở chế độ sửa vai trò tùy chỉnh đã tồn tại thay vì tạo mới. */
  editingRole?: RoleDef
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
export function RoleEditorDialog({ onCreate, onCancel, editingRole }: RoleEditorDialogProps) {
  const [name, setName] = useState(editingRole?.name ?? '')
  const [icon, setIcon] = useState(editingRole?.icon ?? '✨')
  const [faction, setFaction] = useState<Faction>(editingRole?.faction ?? 'village')
  const [effect, setEffect] = useState<EffectType>(editingRole?.effect ?? 'custom')
  const [targetCount, setTargetCount] = useState<0 | 1 | 2>(editingRole?.targetCount ?? 1)
  const [priority, setPriority] = useState(editingRole?.priority ?? 50)
  const [description, setDescription] = useState(editingRole?.description ?? '')
  const [skippable, setSkippable] = useState(editingRole?.skippable ?? true)
  const [limitedUses, setLimitedUses] = useState(editingRole?.usesPerGame !== undefined)
  const [usesPerGame, setUsesPerGame] = useState(editingRole?.usesPerGame ?? 1)

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate({
      id: editingRole?.id ?? crypto.randomUUID(),
      name: trimmed,
      faction,
      icon: icon.trim() || '✨',
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
      skippable,
      usesPerGame: limitedUses ? usesPerGame : undefined,
      description: description.trim() || 'Vai trò tùy chỉnh.',
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-accent/40 bg-surface p-3">
      <p className="text-sm font-medium text-fg">{editingRole ? 'Sửa vai trò tùy chỉnh' : 'Vai trò tùy chỉnh mới'}</p>

      <div className="flex gap-2">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="✨"
          aria-label="Icon vai trò — bấm rồi mở bàn phím emoji mặc định để chọn"
          className="w-14 shrink-0 rounded-lg border border-border bg-background px-2 py-2 text-center text-lg text-fg outline-none focus:border-accent"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên vai trò..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />
      </div>

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

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={skippable} onChange={(e) => setSkippable(e.target.checked)} />
          Có thể bỏ qua lượt
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={limitedUses} onChange={(e) => setLimitedUses(e.target.checked)} />
          Giới hạn số lần dùng cả ván
        </label>
        {limitedUses && (
          <input
            type="number"
            min={1}
            value={usesPerGame}
            onChange={(e) => setUsesPerGame(Math.max(1, Number(e.target.value)))}
            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-fg"
          />
        )}
      </div>

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
          {editingRole ? 'Lưu thay đổi' : 'Tạo vai trò'}
        </button>
      </div>
    </div>
  )
}
