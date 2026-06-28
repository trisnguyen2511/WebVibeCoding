'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'

export default function DecryptPage() {
  const [text, setText] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const run = async (action: 'encrypt' | 'decrypt') => {
    if (!text.trim() || !password.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)
    const res = await fetch('/api/encrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, text, password }),
    })
    const data = await res.json()
    if (data.error) setError(data.error)
    else setResult(data.result)
    setLoading(false)
  }

  const copy = () => {
    if (!result) return
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <ToolShell name="Encrypt / Decrypt" icon="🔓">
      <div className="mx-auto max-w-2xl space-y-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Enter text to encrypt or decrypt..."
          rows={4}
          className="w-full resize-none rounded-xl border border-border bg-surface p-4 font-mono text-sm text-white outline-none placeholder-muted focus:border-accent"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white outline-none placeholder-muted focus:border-accent"
        />
        <div className="flex gap-3">
          <button
            onClick={() => run('encrypt')}
            disabled={loading || !text.trim() || !password.trim()}
            className="flex-1 rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
          >
            Encrypt
          </button>
          <button
            onClick={() => run('decrypt')}
            disabled={loading || !text.trim() || !password.trim()}
            className="flex-1 rounded-xl border border-accent/40 py-3 font-display font-semibold text-accent-soft transition-colors hover:bg-accent/10 disabled:opacity-40"
          >
            Decrypt
          </button>
        </div>
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}
        {result && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4">
            <p className="break-all font-mono text-sm text-white">{result}</p>
            <button onClick={copy} className="shrink-0 text-xs text-muted hover:text-accent-soft">
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
