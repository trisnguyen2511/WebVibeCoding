'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { calculate } from '@/lib/calculator'

type Op = '+' | '-' | '*' | '/'

const OP_LABELS: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' }

export default function CalculatorPage() {
  const [display, setDisplay] = useState('0')
  const [prevValue, setPrevValue] = useState<number | null>(null)
  const [op, setOp] = useState<Op | null>(null)
  const [shouldReset, setShouldReset] = useState(false)

  const appendDigit = (d: string) => {
    if (shouldReset) {
      setDisplay(d === '.' ? '0.' : d)
      setShouldReset(false)
    } else {
      if (d === '.' && display.includes('.')) return
      setDisplay(display === '0' && d !== '.' ? d : display + d)
    }
  }

  const setOperator = (nextOp: Op) => {
    if (display === 'Error') { clear(); return }
    const current = parseFloat(display)
    if (prevValue !== null && op && !shouldReset) {
      const result = calculate(prevValue, current, op)
      setDisplay(result === null ? 'Error' : String(result))
      setPrevValue(result)
    } else {
      setPrevValue(current)
    }
    setOp(nextOp)
    setShouldReset(true)
  }

  const equals = () => {
    if (prevValue === null || op === null || display === 'Error') return
    const result = calculate(prevValue, parseFloat(display), op)
    setDisplay(result === null ? 'Error' : String(result))
    setPrevValue(null)
    setOp(null)
    setShouldReset(true)
  }

  const clear = () => {
    setDisplay('0')
    setPrevValue(null)
    setOp(null)
    setShouldReset(false)
  }

  const toggleSign = () => {
    if (display === '0' || display === 'Error') return
    setDisplay(display.startsWith('-') ? display.slice(1) : '-' + display)
  }

  const percentage = () => {
    const val = parseFloat(display)
    if (isNaN(val)) return
    setDisplay(String(val / 100))
  }

  const numSize =
    display.length > 12 ? 'text-3xl' :
    display.length > 8  ? 'text-4xl' :
    'text-5xl'

  const isError = display === 'Error'

  return (
    <ToolShell name="Calculator" icon="🔢">
      <div className="mx-auto max-w-[22rem]">

        {/* ── Display ─────────────────────────────────────────── */}
        <div className="relative mb-4 overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.03] px-6 py-5 backdrop-blur-2xl">
          {/* ambient glow */}
          <div className="pointer-events-none absolute -top-10 left-1/2 h-28 w-56 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" />

          {/* expression */}
          <p className="mb-2 min-h-[1rem] text-right font-mono text-sm text-muted">
            {prevValue !== null && op ? `${prevValue} ${OP_LABELS[op]}` : ' '}
          </p>

          {/* main number */}
          <p
            className={`text-right font-mono font-light leading-none tracking-tighter transition-all duration-150 truncate ${numSize} ${
              isError ? 'text-red-400' : 'text-white'
            }`}
          >
            {display}
          </p>
        </div>

        {/* ── Buttons ─────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">

          {/* row 1 — utility */}
          <Btn label="C"   onClick={clear}                             kind="utility" />
          <Btn label="+/-" onClick={toggleSign}                        kind="utility" />
          <Btn label="%"   onClick={percentage}                        kind="utility" />
          <Btn label="÷"   onClick={() => setOperator('/')}            kind="op" active={op === '/'} />

          {/* row 2 */}
          <Btn label="7" onClick={() => appendDigit('7')} />
          <Btn label="8" onClick={() => appendDigit('8')} />
          <Btn label="9" onClick={() => appendDigit('9')} />
          <Btn label="×" onClick={() => setOperator('*')} kind="op" active={op === '*'} />

          {/* row 3 */}
          <Btn label="4" onClick={() => appendDigit('4')} />
          <Btn label="5" onClick={() => appendDigit('5')} />
          <Btn label="6" onClick={() => appendDigit('6')} />
          <Btn label="−" onClick={() => setOperator('-')} kind="op" active={op === '-'} />

          {/* row 4 */}
          <Btn label="1" onClick={() => appendDigit('1')} />
          <Btn label="2" onClick={() => appendDigit('2')} />
          <Btn label="3" onClick={() => appendDigit('3')} />
          <Btn label="+" onClick={() => setOperator('+')} kind="op" active={op === '+'} />

          {/* row 5 */}
          <Btn label="0" onClick={() => appendDigit('0')} wide />
          <Btn label="." onClick={() => appendDigit('.')} />
          <Btn label="=" onClick={equals} kind="eq" />

        </div>
      </div>
    </ToolShell>
  )
}

// ── CalcBtn ─────────────────────────────────────────────────────────────────

interface BtnProps {
  label: string
  onClick: () => void
  kind?: 'utility' | 'op' | 'eq'
  active?: boolean
  wide?: boolean
}

function Btn({ label, onClick, kind, active, wide }: BtnProps) {
  const base =
    'flex h-16 cursor-pointer select-none items-center justify-center rounded-2xl ' +
    'font-mono text-xl font-medium transition-all duration-150 active:scale-[0.93] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 '

  const kindClass = {
    utility:
      'bg-white/[0.08] text-[#A1A1AA] hover:bg-white/[0.14] border border-white/[0.06]',
    op: active
      ? 'bg-accent/30 text-accent-soft border border-accent/50 shadow-[0_0_16px_rgba(124,58,237,0.35)]'
      : 'bg-accent/[0.10] text-accent-soft hover:bg-accent/[0.22] border border-accent/[0.12]',
    eq:
      'bg-accent text-white hover:bg-accent/85 ' +
      'shadow-[0_4px_24px_rgba(124,58,237,0.45)] hover:shadow-[0_6px_32px_rgba(124,58,237,0.60)]',
    default:
      'bg-white/[0.06] text-white hover:bg-white/[0.13] border border-white/[0.05]',
  }

  const wideClass = wide ? 'col-span-2 justify-start pl-7' : ''

  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`${base} ${kindClass[kind ?? 'default']} ${wideClass}`}
    >
      {label}
    </button>
  )
}
