'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { tools } from '@/lib/tools-registry'
import { ToolCategory } from '@/lib/tools-registry'

const CAT_COLORS: Record<ToolCategory, string> = {
  utility:      'text-blue-400',
  dev:          'text-violet-400',
  crypto:       'text-amber-400',
  media:        'text-pink-400',
  productivity: 'text-emerald-400',
  game:         'text-orange-400',
  social:       'text-rose-400',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const filtered = tools.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()) ||
    t.description.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as Element).tagName)) {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && filtered[selectedIdx]) {
      navigate(filtered[selectedIdx].slug)
    }
  }

  const navigate = (slug: string) => {
    router.push(`/tools/${slug}`)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-[15vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'palette-in 150ms ease' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <svg className="shrink-0 text-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tools..."
            className="flex-1 bg-transparent font-sans text-sm text-white placeholder-muted outline-none"
          />
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-muted">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {filtered.map((tool, idx) => (
            <button
              key={tool.slug}
              onClick={() => navigate(tool.slug)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                idx === selectedIdx ? 'bg-accent/15' : 'hover:bg-white/4'
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-base">
                {tool.icon}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block font-display text-sm text-white">{tool.name}</span>
                <span className="block truncate text-xs text-muted">{tool.description}</span>
              </div>
              <span className={`shrink-0 font-mono text-xs ${CAT_COLORS[tool.category]}`}>
                {tool.category}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted">No tools found for &ldquo;{query}&rdquo;</p>
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex gap-5 border-t border-border px-4 py-2">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-xs">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-xs">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-xs">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  )
}
