'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

type Tab = 'base64' | 'url' | 'jwt' | 'aes'

function Base64Tab() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [mode, setMode] = useState<'encode' | 'decode'>('encode')
  const [error, setError] = useState('')
  const { copied, copy } = useCopyToClipboard()

  const run = () => {
    setError('')
    try {
      if (mode === 'encode') {
        setOutput(btoa(unescape(encodeURIComponent(input))))
      } else {
        setOutput(decodeURIComponent(escape(atob(input.trim()))))
      }
    } catch {
      setError('Invalid input for ' + mode)
      setOutput('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['encode', 'decode'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors capitalize ${mode === m ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-surface text-muted hover:text-fg'}`}>
            {m}
          </button>
        ))}
      </div>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4}
        placeholder={mode === 'encode' ? 'Enter text to encode...' : 'Enter Base64 to decode...'}
        className="w-full resize-none rounded-xl border border-border bg-surface p-4 font-mono text-sm text-fg outline-none placeholder-muted focus:border-accent" />
      <button onClick={run}
        className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent/80">
        {mode === 'encode' ? 'Encode →' : '← Decode'}
      </button>
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}
      {output && (
        <div className="relative rounded-xl border border-border bg-surface p-4">
          <pre className="font-mono text-sm text-fg break-all whitespace-pre-wrap">{output}</pre>
          <button onClick={() => copy(output)}
            className="absolute right-3 top-3 rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-muted hover:text-fg">
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}

function UrlTab() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [mode, setMode] = useState<'encode' | 'decode'>('encode')
  const [error, setError] = useState('')
  const { copied, copy } = useCopyToClipboard()

  const run = () => {
    setError('')
    try {
      setOutput(mode === 'encode' ? encodeURIComponent(input) : decodeURIComponent(input))
    } catch {
      setError('Invalid URL encoding')
      setOutput('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['encode', 'decode'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors capitalize ${mode === m ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-surface text-muted hover:text-fg'}`}>
            {m}
          </button>
        ))}
      </div>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4}
        placeholder={mode === 'encode' ? 'Enter text to URL-encode...' : 'Enter encoded string to decode...'}
        className="w-full resize-none rounded-xl border border-border bg-surface p-4 font-mono text-sm text-fg outline-none placeholder-muted focus:border-accent" />
      <button onClick={run}
        className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent/80">
        {mode === 'encode' ? 'Encode →' : '← Decode'}
      </button>
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}
      {output && (
        <div className="relative rounded-xl border border-border bg-surface p-4">
          <pre className="font-mono text-sm text-fg break-all whitespace-pre-wrap">{output}</pre>
          <button onClick={() => copy(output)}
            className="absolute right-3 top-3 rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-muted hover:text-fg">
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}

function JwtTab() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<{ header: string; payload: string; expired: boolean | null } | null>(null)
  const [error, setError] = useState('')

  const decode = () => {
    setError('')
    setResult(null)
    const parts = input.trim().split('.')
    if (parts.length !== 3) { setError('Not a valid JWT (expected 3 parts separated by .)'); return }
    try {
      const decodeB64 = (s: string) => {
        const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')
        return JSON.stringify(JSON.parse(atob(padded)), null, 2)
      }
      const header = decodeB64(parts[0])
      const payload = decodeB64(parts[1])
      const parsed = JSON.parse(payload)
      const expired = parsed.exp ? Date.now() / 1000 > parsed.exp : null
      setResult({ header, payload, expired })
    } catch {
      setError('Failed to decode JWT parts')
    }
  }

  return (
    <div className="space-y-4">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3}
        placeholder="Paste JWT token here..."
        className="w-full resize-none rounded-xl border border-border bg-surface p-4 font-mono text-xs text-fg outline-none placeholder-muted focus:border-accent" />
      <button onClick={decode}
        className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent/80">
        Decode JWT
      </button>
      {error && <p className="font-mono text-xs text-red-400">{error}</p>}
      {result && (
        <div className="space-y-3">
          {result.expired !== null && (
            <div className={`rounded-lg border px-4 py-2 text-sm font-medium ${result.expired ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-green-500/40 bg-green-500/10 text-green-400'}`}>
              {result.expired ? '⚠ Token is expired' : '✓ Token is valid (not expired)'}
            </div>
          )}
          {[['Header', result.header], ['Payload', result.payload]].map(([label, val]) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted">{label}</p>
              <pre className="font-mono text-sm text-fg overflow-x-auto">{val}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AesTab() {
  const [text, setText] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { copied, copy } = useCopyToClipboard()

  const run = async (action: 'encrypt' | 'decrypt') => {
    if (!text.trim() || !password.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text, password }),
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
    <div className="space-y-4">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
        placeholder="Enter text to encrypt or decrypt..."
        className="w-full resize-none rounded-xl border border-border bg-surface p-4 font-mono text-sm text-fg outline-none placeholder-muted focus:border-accent" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg outline-none placeholder-muted focus:border-accent" />
      <div className="flex gap-3">
        <button onClick={() => run('encrypt')} disabled={loading || !text.trim() || !password.trim()}
          className="flex-1 rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40">
          Encrypt
        </button>
        <button onClick={() => run('decrypt')} disabled={loading || !text.trim() || !password.trim()}
          className="flex-1 rounded-xl border border-accent/40 py-3 font-display font-semibold text-accent-soft transition-colors hover:bg-accent/10 disabled:opacity-40">
          Decrypt
        </button>
      </div>
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}
      {result && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4">
          <p className="break-all font-mono text-sm text-fg">{result}</p>
          <button onClick={() => copy(result)} className="shrink-0 text-xs text-muted hover:text-accent-soft">
            {copied ? '✓' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function EncodeDecodePage() {
  const [tab, setTab] = useState<Tab>('base64')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'base64', label: 'Base64' },
    { id: 'url', label: 'URL' },
    { id: 'jwt', label: 'JWT' },
    { id: 'aes', label: 'AES Encrypt' },
  ]

  return (
    <ToolShell name="Encode / Decode" icon="⇄" description="Base64, URL encoding, JWT decoding, and AES-256 encryption">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${tab === t.id ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-fg'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'base64' && <Base64Tab />}
        {tab === 'url' && <UrlTab />}
        {tab === 'jwt' && <JwtTab />}
        {tab === 'aes' && <AesTab />}
      </div>
    </ToolShell>
  )
}
