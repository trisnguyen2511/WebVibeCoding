'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

const ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'] as const
type Algorithm = typeof ALGORITHMS[number]

export default function HashPage() {
  const [text, setText] = useState('')
  const [algorithm, setAlgorithm] = useState<Algorithm>('sha256')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { copied, copy } = useCopyToClipboard()

  const generate = async () => {
    if (!text.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, algorithm }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setResult(data.result)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ToolShell name="Hash Generator" icon="#">
      <div className="mx-auto max-w-2xl space-y-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Enter text to hash..."
          rows={4}
          className="w-full resize-none rounded-xl border border-border bg-surface p-4 font-mono text-sm text-fg outline-none placeholder-muted focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          {ALGORITHMS.map(alg => (
            <button
              key={alg}
              onClick={() => setAlgorithm(alg)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                algorithm === alg
                  ? 'border-accent bg-accent/20 text-accent-soft'
                  : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-fg'
              }`}
            >
              {alg.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={generate}
          disabled={loading || !text.trim()}
          className="w-full rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
        >
          {loading ? 'Generating...' : 'Generate Hash'}
        </button>
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}
        {result && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4">
            <p className="break-all font-mono text-sm text-fg">{result}</p>
            <button onClick={() => result && copy(result)} className="shrink-0 text-xs text-muted hover:text-accent-soft">
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
