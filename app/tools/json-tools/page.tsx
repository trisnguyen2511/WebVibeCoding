'use client'
import { useState, useMemo } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

type Tab = 'format' | 'diff'

// Simple syntax highlight for formatted JSON
function syntaxHighlight(json: string): string {
  return json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'text-blue-300' // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'text-violet-300' : 'text-green-300' // key vs string
      } else if (/true|false/.test(match)) {
        cls = 'text-yellow-300'
      } else if (/null/.test(match)) {
        cls = 'text-red-300'
      }
      return `<span class="${cls}">${match}</span>`
    })
}

// LCS-based line diff
function diffLines(a: string[], b: string[]): { type: 'same' | 'add' | 'remove'; line: string }[] {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const result: { type: 'same' | 'add' | 'remove'; line: string }[] = []
  let i = a.length, j = b.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'same', line: a[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', line: b[j - 1] })
      j--
    } else {
      result.unshift({ type: 'remove', line: a[i - 1] })
      i--
    }
  }
  return result
}

function FormatTab() {
  const [input, setInput] = useState('')
  const { copied, copy } = useCopyToClipboard()

  const { formatted, error } = useMemo(() => {
    if (!input.trim()) return { formatted: null, error: null }
    try {
      return { formatted: JSON.stringify(JSON.parse(input), null, 2), error: null }
    } catch (e) {
      return { formatted: null, error: (e as Error).message }
    }
  }, [input])

  return (
    <div className="space-y-4">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={8}
        placeholder='Paste JSON here... {"key": "value"}'
        className={`w-full resize-none rounded-xl border bg-surface p-4 font-mono text-sm text-white outline-none placeholder-muted transition-colors ${error ? 'border-red-500/60' : 'border-border focus:border-accent'}`} />
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 font-mono text-xs text-red-400">
          ✕ {error}
        </div>
      )}
      {formatted && (
        <div className="relative rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-green-400 font-medium">✓ Valid JSON</span>
            <button onClick={() => copy(formatted)}
              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-muted hover:text-white">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="font-mono text-sm overflow-x-auto max-h-96"
            dangerouslySetInnerHTML={{ __html: syntaxHighlight(formatted) }} />
        </div>
      )}
    </div>
  )
}

function DiffTab() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')

  const diff = useMemo(() => {
    if (!a.trim() && !b.trim()) return null
    try {
      const fmtA = a.trim() ? JSON.stringify(JSON.parse(a), null, 2).split('\n') : []
      const fmtB = b.trim() ? JSON.stringify(JSON.parse(b), null, 2).split('\n') : []
      return { lines: diffLines(fmtA, fmtB), error: null }
    } catch (e) {
      return { lines: [], error: (e as Error).message }
    }
  }, [a, b])

  const changes = diff?.lines.filter((l) => l.type !== 'same').length ?? 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1.5 text-xs text-muted">JSON A</p>
          <textarea value={a} onChange={(e) => setA(e.target.value)} rows={7}
            placeholder='{"a": 1}'
            className="w-full resize-none rounded-xl border border-border bg-surface p-3 font-mono text-xs text-white outline-none placeholder-muted focus:border-accent" />
        </div>
        <div>
          <p className="mb-1.5 text-xs text-muted">JSON B</p>
          <textarea value={b} onChange={(e) => setB(e.target.value)} rows={7}
            placeholder='{"a": 2}'
            className="w-full resize-none rounded-xl border border-border bg-surface p-3 font-mono text-xs text-white outline-none placeholder-muted focus:border-accent" />
        </div>
      </div>
      {diff?.error && (
        <p className="font-mono text-xs text-red-400">{diff.error}</p>
      )}
      {diff && !diff.error && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <p className="text-xs text-muted uppercase tracking-widest">Diff</p>
            {changes === 0
              ? <span className="text-xs text-green-400">✓ Identical</span>
              : <span className="text-xs text-yellow-400">{changes} change{changes !== 1 ? 's' : ''}</span>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {diff.lines.map((line, i) => (
              <div key={i} className={`flex gap-2 px-4 py-0.5 font-mono text-xs ${line.type === 'add' ? 'bg-green-500/10 text-green-300' : line.type === 'remove' ? 'bg-red-500/10 text-red-300' : 'text-muted'}`}>
                <span className="w-3 shrink-0 select-none">{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}</span>
                <span>{line.line}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function JsonToolsPage() {
  const [tab, setTab] = useState<Tab>('format')

  return (
    <ToolShell name="JSON Tools" icon="{ }" description="Format, validate and diff JSON documents">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {(['format', 'diff'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'format' && <FormatTab />}
        {tab === 'diff' && <DiffTab />}
      </div>
    </ToolShell>
  )
}
