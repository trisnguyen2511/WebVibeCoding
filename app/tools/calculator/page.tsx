'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { calculate } from '@/lib/calculator'

type Op = '+' | '-' | '*' | '/'

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

  const btn = (label: string, onClick: () => void, variant?: 'accent' | 'op' | 'eq') => {
    const base = 'flex h-14 w-full items-center justify-center rounded-xl font-display text-lg font-medium transition-colors active:scale-95'
    const styles = {
      accent: 'bg-surface text-muted hover:bg-border hover:text-white',
      op:     'bg-accent/20 text-accent-soft hover:bg-accent/30',
      eq:     'bg-accent text-white hover:bg-accent/80',
      default:'bg-surface text-white hover:bg-border',
    }
    return (
      <button key={label} onClick={onClick} className={`${base} ${styles[variant ?? 'default']}`}>
        {label}
      </button>
    )
  }

  return (
    <ToolShell name="Calculator" icon="🔢">
      <div className="mx-auto max-w-xs">
        <div className="mb-3 rounded-xl border border-border bg-surface p-4 text-right">
          <p className="text-xs text-muted">{prevValue !== null ? `${prevValue} ${op ?? ''}` : ' '}</p>
          <p className="font-mono text-3xl font-light text-white truncate">{display}</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {btn('C', clear, 'accent')}
          {btn('+/-', () => setDisplay(String(parseFloat(display) * -1)), 'accent')}
          {btn('%', () => setDisplay(String(parseFloat(display) / 100)), 'accent')}
          {btn('÷', () => setOperator('/'), 'op')}
          {btn('7', () => appendDigit('7'))}
          {btn('8', () => appendDigit('8'))}
          {btn('9', () => appendDigit('9'))}
          {btn('×', () => setOperator('*'), 'op')}
          {btn('4', () => appendDigit('4'))}
          {btn('5', () => appendDigit('5'))}
          {btn('6', () => appendDigit('6'))}
          {btn('−', () => setOperator('-'), 'op')}
          {btn('1', () => appendDigit('1'))}
          {btn('2', () => appendDigit('2'))}
          {btn('3', () => appendDigit('3'))}
          {btn('+', () => setOperator('+'), 'op')}
          <div className="col-span-2">
            {btn('0', () => appendDigit('0'))}
          </div>
          {btn('.', () => appendDigit('.'))}
          {btn('=', equals, 'eq')}
        </div>
      </div>
    </ToolShell>
  )
}
