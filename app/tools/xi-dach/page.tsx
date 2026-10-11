'use client'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUp, Hand, RotateCcw, Scale, Settings2, Undo2 } from 'lucide-react'
import { ToolShell } from '@/components/tool-shell'
import {
  DEFAULT_RULES,
  RANKS,
  analyze,
  countCards,
  rankLabel,
  type Analysis,
  type HandKind,
  type Outcome,
  type Rank,
  type RuleSet,
} from '@/lib/xi-dach'

const LS_RULES = 'wv-xi-dach-rules'

type Group = 'player' | 'dealerUp' | 'exposed'

const GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: 'player', label: 'Bài của con', hint: 'Các lá đang cầm trên tay' },
  { id: 'dealerUp', label: 'Cái ngửa (tùy chọn)', hint: 'Không bắt buộc — để trống nếu chưa thấy lá nào' },
  { id: 'exposed', label: 'Đã lộ', hint: 'Bài người khác đã lật' },
]

const KIND_LABEL: Record<HandKind, string> = {
  bust: 'Quắc',
  normal: 'Thường',
  nguLinh: 'Ngũ linh',
  xiDach: 'Xì dách',
  xiBan: 'Xì bàn',
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(3)}`

function CardChip({ rank, onRemove }: { rank: Rank; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRemove() }}
      aria-label={`Bỏ lá ${rankLabel(rank)}`}
      className="flex h-14 w-11 shrink-0 touch-manipulation flex-col items-center justify-center rounded-lg border border-accent-soft/40 bg-accent/10 font-mono text-lg font-bold text-fg transition-transform duration-150 active:scale-95"
    >
      {rankLabel(rank)}
    </button>
  )
}

function ProbBar({ o }: { o: Outcome }) {
  const seg = [
    { v: o.win, cls: 'bg-emerald-500', label: 'Thắng' },
    { v: o.tie, cls: 'bg-muted', label: 'Hòa' },
    { v: o.lose, cls: 'bg-red-500', label: 'Thua' },
  ]
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-border" role="img"
        aria-label={`Thắng ${pct(o.win)}, hòa ${pct(o.tie)}, thua ${pct(o.lose)}`}>
        {seg.map((s) => (
          <div key={s.label} className={`${s.cls} transition-[flex-grow] duration-300`} style={{ flexGrow: s.v, flexBasis: 0 }} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center font-mono text-xs">
        {seg.map((s) => (
          <div key={s.label}>
            <div className="text-fg/70">{s.label}</div>
            <div className="text-sm font-semibold text-fg">{pct(s.v)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActionCard({ title, icon, o, best, disabled, note }: {
  title: string
  icon: React.ReactNode
  o: Outcome | null
  best: boolean
  disabled?: boolean
  note?: string
}) {
  return (
    <div className={`rounded-xl border p-3.5 transition-colors duration-200 ${best ? 'border-accent bg-accent/10' : 'border-border bg-surface'} ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 font-display text-sm font-semibold text-fg">
        {icon}
        {title}
        {best && <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">Tốt hơn</span>}
      </div>
      {o ? (
        <>
          <div className="my-2.5 font-mono text-2xl font-bold text-fg">
            {signed(o.ev)}
            <span className="ml-1 text-xs font-normal text-fg/70">EV / 1 cược</span>
          </div>
          <ProbBar o={o} />
        </>
      ) : (
        <p className="mt-2 text-sm text-fg/70">{note ?? 'Không khả dụng'}</p>
      )}
      {o && note && <p className="mt-2 text-xs text-fg/70">{note}</p>}
    </div>
  )
}

function Warnings({ a, rules }: { a: Analysis; rules: RuleSet }) {
  if (!a.hit || a.terminal) return null
  const items: string[] = []
  const dl = a.denLangProb ?? 0
  if (dl > 0) {
    items.push(`Rút có ${pct(dl)} nguy cơ đền làng (từ ${rules.denLang.threshold} điểm trở lên, thua ×${rules.denLang.multiplier}).`)
  }
  if (a.recommendation === 'HIT' && !a.mustHit && a.bustProb! >= 0.5) {
    items.push(`Rút đang có lợi hơn nhưng xác suất quắc tới ${pct(a.bustProb!)} — rủi ro cao, biến động lớn.`)
  }
  if (a.recommendation === 'STAND' && a.stand!.ev < 0) {
    items.push('Dằn chỉ là lựa chọn ít tệ hơn — EV vẫn âm.')
  }
  if (a.mustHit) items.push(`Dưới ${rules.playerMinStand} điểm nên bắt buộc rút theo luật bàn.`)
  items.push('EV là trung bình sau nhiều ván giống hệt nhau; một ván đơn lẻ vẫn có thể thắng hoặc thua ngược khuyến nghị.')
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5" role="note">
      <div className="mb-1.5 flex items-center gap-2 font-display text-sm font-semibold text-amber-300">
        <AlertTriangle size={16} aria-hidden /> Lưu ý
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-fg/80">
        {items.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </div>
  )
}

function Verdict({ a }: { a: Analysis }) {
  const rec = a.recommendation
  let title = ''
  let sub = ''
  if (a.hand?.isBust) {
    const dl = a.stand!.ev < -1
    title = dl ? 'Đền làng' : 'Đã quắc'
    sub = dl ? `Bài ${a.hand.hard} điểm — thua nặng ×${-a.stand!.ev}.` : 'Bài vượt 21 điểm — con thua ván này.'
  } else if (rec === 'DONE') {
    title = `${KIND_LABEL[a.hand!.kind]} — dừng`
    sub = 'Bài đặc biệt, không cần rút thêm.'
  } else if (rec === 'HIT') {
    title = 'RÚT'
    sub = a.mustHit ? 'Dưới ngưỡng tối thiểu nên bắt buộc rút.' : `Rút hơn dằn ${signed(a.evDiff!)} EV mỗi cược.`
  } else if (rec === 'STAND') {
    title = 'DẰN'
    sub = `Dằn hơn rút ${signed(-a.evDiff!)} EV mỗi cược.`
  } else {
    title = 'Gần như ngang nhau'
    sub = `Chênh lệch EV chỉ ${signed(a.evDiff!)} — chọn theo khẩu vị rủi ro (dằn ít biến động hơn).`
  }
  const big = rec === 'HIT' || rec === 'STAND'
  return (
    <div className="rounded-2xl border border-accent/60 bg-gradient-to-br from-accent/25 to-surface p-5 text-center" role="status" aria-live="polite">
      <div className="text-xs uppercase tracking-widest text-accent-soft">Khuyến nghị</div>
      <div className={`mt-1 font-display font-bold text-fg ${big ? 'text-5xl' : 'text-3xl'}`}>{title}</div>
      <p className="mx-auto mt-2 max-w-xs text-sm text-fg/80">{sub}</p>
    </div>
  )
}

export default function XiDachPage() {
  const [hands, setHands] = useState<Record<Group, Rank[]>>({ player: [], dealerUp: [], exposed: [] })
  const [active, setActive] = useState<Group>('player')
  const [rules, setRules] = useState<RuleSet>(DEFAULT_RULES)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_RULES)
      if (raw) {
        const saved = JSON.parse(raw) as Partial<RuleSet>
        setRules({ ...DEFAULT_RULES, ...saved, denLang: { ...DEFAULT_RULES.denLang, ...saved.denLang } })
      }
    } catch { /* ignore corrupt storage */ }
  }, [])

  const updateRules = (next: RuleSet) => {
    setRules(next)
    try { localStorage.setItem(LS_RULES, JSON.stringify(next)) } catch { /* storage full */ }
  }

  const analysis = useMemo(() => analyze(hands, rules), [hands, rules])
  const used = useMemo(() => countCards(hands.player, hands.dealerUp, hands.exposed), [hands])

  const add = (r: Rank) => {
    if (used[r] >= 4) return
    setHands((h) => ({ ...h, [active]: [...h[active], r] }))
  }
  const removeAt = (g: Group, i: number) =>
    setHands((h) => ({ ...h, [g]: h[g].filter((_, idx) => idx !== i) }))
  const undo = () =>
    setHands((h) => (h[active].length ? { ...h, [active]: h[active].slice(0, -1) } : h))
  const reset = () => {
    setHands({ player: [], dealerUp: [], exposed: [] })
    setActive('player')
  }

  const best = analysis.recommendation === 'HIT' ? 'hit' : analysis.recommendation === 'STAND' ? 'stand' : null

  return (
    <ToolShell name="Xì Dách" icon="🃏" description="Tính xác suất & EV — nên rút hay dằn">
      <div className="space-y-5">
        {/* Hands */}
        <section className="space-y-2.5" aria-label="Bài đã nhập">
          {GROUPS.map((g) => {
            const selected = active === g.id
            const cards = hands[g.id]
            return (
              <div
                key={g.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => setActive(g.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(g.id) } }}
                className={`cursor-pointer rounded-xl border p-3 transition-colors duration-200 ${selected ? 'border-accent bg-accent/5' : 'border-border bg-surface'}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold text-fg">{g.label}</h2>
                  {g.id === 'player' && analysis.hand && (
                    <span className="font-mono text-xs text-fg/80">
                      <span className="text-base font-bold text-fg">{analysis.hand.total}</span> điểm · {KIND_LABEL[analysis.hand.kind]}
                    </span>
                  )}
                  {selected && g.id !== 'player' && <span className="text-[11px] text-accent-soft">đang chọn</span>}
                </div>
                <div className="mt-2 flex min-h-14 flex-wrap items-center gap-2">
                  {cards.map((r, i) => <CardChip key={`${r}-${i}`} rank={r} onRemove={() => removeAt(g.id, i)} />)}
                  {cards.length === 0 && (
                    <span className="text-xs text-fg/60">{selected ? 'Bấm lá bài bên dưới để thêm…' : g.hint}</span>
                  )}
                </div>
              </div>
            )
          })}
        </section>

        {/* Keypad */}
        <section aria-label="Chọn lá bài">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-fg/70">
              Thêm vào: <b className="text-fg">{GROUPS.find((g) => g.id === active)!.label}</b>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={undo} aria-label="Xóa lá vừa nhập"
                className="flex h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs text-fg touch-manipulation transition-colors hover:border-accent/60 active:scale-95">
                <Undo2 size={16} aria-hidden /> Hoàn tác
              </button>
              <button type="button" onClick={reset} aria-label="Ván mới"
                className="flex h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs text-fg touch-manipulation transition-colors hover:border-accent/60 active:scale-95">
                <RotateCcw size={16} aria-hidden /> Ván mới
              </button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
            {RANKS.map((r) => {
              const left = 4 - used[r]
              return (
                <button
                  key={r}
                  type="button"
                  disabled={left === 0}
                  onClick={() => add(r)}
                  aria-label={`Lá ${rankLabel(r)}, còn ${left}`}
                  className="relative flex h-14 touch-manipulation items-center justify-center rounded-xl border border-border bg-surface font-mono text-xl font-bold text-fg transition-all duration-150 hover:border-accent/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {rankLabel(r)}
                  <span className="absolute bottom-1 right-1.5 text-[10px] font-medium text-fg/60">{left}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Results */}
        {analysis.status === 'invalid' && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{analysis.error}</div>
        )}
        {analysis.status === 'incomplete' && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-fg/70">
            Nhập <b className="text-fg">ít nhất 2 lá của con</b> để xem khuyến nghị. Lá ngửa của cái là tùy chọn — nhập thêm sẽ chính xác hơn.
          </div>
        )}
        {analysis.status === 'ok' && analysis.hand && (
          <section className="space-y-4" aria-label="Kết quả phân tích">
            <Verdict a={analysis} />
            <Warnings a={analysis} rules={rules} />

            <div className="grid gap-3 sm:grid-cols-2">
              <ActionCard
                title="Dằn"
                icon={<Hand size={16} aria-hidden />}
                o={analysis.stand ?? null}
                best={best === 'stand'}
                note={analysis.mustHit ? 'Chưa đủ điểm tối thiểu để dằn (chỉ tham khảo).' : undefined}
              />
              <ActionCard
                title="Rút thêm"
                icon={<ArrowUp size={16} aria-hidden />}
                o={analysis.hit ?? null}
                best={best === 'hit'}
                disabled={!analysis.hit}
                note={!analysis.hit ? 'Không thể rút thêm.' : 'Sau khi rút, chơi tối ưu tiếp.'}
              />
            </div>

            {analysis.hit && (
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-fg">Rút lá kế tiếp</h3>
                  <span className="font-mono text-xs text-fg/70">còn {analysis.remaining} lá</span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-xs text-fg/70">Xác suất quắc</div>
                    <div className="font-mono text-2xl font-bold text-fg">{pct(analysis.bustProb!)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-fg/70">An toàn</div>
                    <div className="font-mono text-lg font-semibold text-fg">{pct(analysis.safeProb!)}</div>
                  </div>
                </div>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-border" role="img"
                  aria-label={`Quắc ${pct(analysis.bustProb!)}`}>
                  <div className="bg-red-500 transition-[flex-grow] duration-300" style={{ flexGrow: analysis.bustProb!, flexBasis: 0 }} />
                  <div className="bg-emerald-500 transition-[flex-grow] duration-300" style={{ flexGrow: analysis.safeProb!, flexBasis: 0 }} />
                </div>

                <div className="mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                  {analysis.nextCards!.map((n) => (
                    <div key={n.rank}
                      className={`rounded-lg border p-1.5 text-center ${n.denLang ? 'border-red-500/60 bg-red-500/20' : n.bust ? 'border-red-500/30 bg-red-500/10' : 'border-border'}`}>
                      <div className="font-mono text-sm font-bold text-fg">{rankLabel(n.rank)}</div>
                      <div className="font-mono text-[11px] text-fg/70">{pct(n.prob)}</div>
                      <div className={`font-mono text-[11px] font-semibold ${n.ev > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {n.denLang ? 'Đền làng' : n.bust ? 'Quắc' : signed(n.ev)}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-fg/60">Mỗi ô: xác suất rút được lá đó và EV nếu rút đúng lá đó rồi chơi tối ưu.</p>
              </div>
            )}
          </section>
        )}

        {/* Rules */}
        <section className="rounded-xl border border-border bg-surface">
          <button type="button" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules}
            className="flex h-12 w-full touch-manipulation items-center gap-2 px-3.5 text-left font-display text-sm font-semibold text-fg">
            <Settings2 size={16} aria-hidden /> Luật bàn
            <span className="ml-auto text-xs font-normal text-fg/70">{showRules ? 'Thu gọn' : 'Tùy chỉnh'}</span>
          </button>
          {showRules && <RulesEditor rules={rules} onChange={updateRules} />}
        </section>

        <p className="flex gap-2 text-[11px] leading-relaxed text-fg/60">
          <Scale size={14} className="mt-0.5 shrink-0" aria-hidden />
          Kết quả là mô hình xác suất theo luật đã chọn: cái rút tới ≥{rules.dealerStandAt} điểm, rút không hoàn lại từ bộ bài 52 lá,
          các lá của cái chưa thấy được coi là chưa biết. Không đảm bảo thắng ván thực tế.
        </p>
      </div>
    </ToolShell>
  )
}

function NumberField({ label, value, min, max, step = 1, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-fg">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
        className="h-11 w-20 rounded-lg border border-border bg-background px-2 text-center font-mono text-fg"
      />
    </label>
  )
}

function RulesEditor({ rules, onChange }: { rules: RuleSet; onChange: (r: RuleSet) => void }) {
  const specials: { key: 'xiBan' | 'xiDach' | 'nguLinh'; label: string; desc: string }[] = [
    { key: 'xiBan', label: 'Xì bàn', desc: '2 lá Át' },
    { key: 'xiDach', label: 'Xì dách', desc: 'Át + lá 10 điểm' },
    { key: 'nguLinh', label: 'Ngũ linh', desc: '5 lá không quắc' },
  ]
  return (
    <div className="space-y-3 border-t border-border p-3.5">
      {specials.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-3">
          <label className="flex min-h-11 flex-1 items-center gap-2.5 text-sm text-fg">
            <input
              type="checkbox"
              checked={rules[s.key].enabled}
              onChange={(e) => onChange({ ...rules, [s.key]: { ...rules[s.key], enabled: e.target.checked } })}
              className="h-5 w-5 accent-accent"
            />
            <span>
              {s.label} <span className="text-xs text-fg/60">({s.desc})</span>
            </span>
          </label>
          <div className="flex items-center gap-1.5 font-mono text-sm text-fg">
            ×
            <input
              type="number"
              inputMode="decimal"
              aria-label={`Hệ số ${s.label}`}
              value={rules[s.key].multiplier}
              min={1}
              max={10}
              step={0.5}
              disabled={!rules[s.key].enabled}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v)) onChange({ ...rules, [s.key]: { ...rules[s.key], multiplier: Math.min(10, Math.max(1, v)) } })
              }}
              className="h-11 w-16 rounded-lg border border-border bg-background px-2 text-center disabled:opacity-40"
            />
          </div>
        </div>
      ))}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <label className="flex min-h-11 items-center gap-2.5 text-sm text-fg">
          <input
            type="checkbox"
            checked={rules.denLang.enabled}
            onChange={(e) => onChange({ ...rules, denLang: { ...rules.denLang, enabled: e.target.checked } })}
            className="h-5 w-5 accent-accent"
          />
          <span>
            Đền làng <span className="text-xs text-fg/60">(con quắc quá nặng thì thua nhiều hơn)</span>
          </span>
        </label>
        {rules.denLang.enabled && (
          <>
            <NumberField label="Đền làng từ (điểm)" value={rules.denLang.threshold} min={22} max={40}
              onChange={(v) => onChange({ ...rules, denLang: { ...rules.denLang, threshold: v } })} />
            <NumberField label="Thua gấp (×)" value={rules.denLang.multiplier} min={1} max={10} step={0.5}
              onChange={(v) => onChange({ ...rules, denLang: { ...rules.denLang, multiplier: v } })} />
          </>
        )}
      </div>
      <NumberField label="Con được dằn từ (điểm, 0 = tự do)" value={rules.playerMinStand} min={0} max={21}
        onChange={(v) => onChange({ ...rules, playerMinStand: v })} />
      <NumberField label="Cái dằn từ (điểm)" value={rules.dealerStandAt} min={12} max={21}
        onChange={(v) => onChange({ ...rules, dealerStandAt: v })} />
      <button type="button" onClick={() => onChange(DEFAULT_RULES)}
        className="h-11 w-full rounded-lg border border-border text-sm text-fg transition-colors hover:border-accent/60">
        Khôi phục luật mặc định
      </button>
    </div>
  )
}
