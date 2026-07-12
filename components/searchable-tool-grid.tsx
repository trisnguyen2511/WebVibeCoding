'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Tool, ToolCategory } from '@/lib/tools-registry'

const CATEGORIES: { label: string; value: ToolCategory | 'all'; icon: string }[] = [
  { label: 'All', value: 'all', icon: '◈' },
  { label: 'Utility', value: 'utility', icon: '🔧' },
  { label: 'Dev', value: 'dev', icon: '💻' },
  { label: 'Crypto', value: 'crypto', icon: '🔐' },
  { label: 'Media', value: 'media', icon: '🎬' },
  { label: 'Productivity', value: 'productivity', icon: '⚡' },
  { label: 'Game', value: 'game', icon: '🎮' },
  { label: 'Social', value: 'social', icon: '💬' },
]

const CAT_STYLES: Record<ToolCategory | 'all', { pill: string; icon: string; glow: string; bar: string }> = {
  all:          { pill: 'border-accent/30 bg-accent/10 text-accent-soft',          icon: 'border-accent/30 bg-accent/10 text-accent-soft',     glow: 'shadow-accent/10',     bar: 'from-accent to-accent-soft' },
  utility:      { pill: 'border-blue-500/30 bg-blue-500/10 text-blue-400',         icon: 'border-blue-500/30 bg-blue-500/10 text-blue-400',     glow: 'shadow-blue-500/10',   bar: 'from-blue-500 to-blue-400' },
  dev:          { pill: 'border-violet-500/30 bg-violet-500/10 text-violet-400',   icon: 'border-violet-500/30 bg-violet-500/10 text-violet-400', glow: 'shadow-violet-500/10', bar: 'from-violet-500 to-violet-400' },
  crypto:       { pill: 'border-amber-500/30 bg-amber-500/10 text-amber-400',      icon: 'border-amber-500/30 bg-amber-500/10 text-amber-400',  glow: 'shadow-amber-500/10',  bar: 'from-amber-500 to-amber-400' },
  media:        { pill: 'border-pink-500/30 bg-pink-500/10 text-pink-400',         icon: 'border-pink-500/30 bg-pink-500/10 text-pink-400',     glow: 'shadow-pink-500/10',   bar: 'from-pink-500 to-pink-400' },
  productivity: { pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400', icon: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400', glow: 'shadow-emerald-500/10', bar: 'from-emerald-500 to-emerald-400' },
  game:         { pill: 'border-orange-500/30 bg-orange-500/10 text-orange-400',   icon: 'border-orange-500/30 bg-orange-500/10 text-orange-400', glow: 'shadow-orange-500/10', bar: 'from-orange-500 to-orange-400' },
  social:       { pill: 'border-rose-500/30 bg-rose-500/10 text-rose-400',         icon: 'border-rose-500/30 bg-rose-500/10 text-rose-400',     glow: 'shadow-rose-500/10',   bar: 'from-rose-500 to-rose-400' },
}

export function SearchableToolGrid({ tools }: { tools: Tool[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ToolCategory | 'all'>('all')

  const filtered = tools.filter((t) => {
    const matchesQuery =
      query === '' ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.description.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = category === 'all' || t.category === category
    return matchesQuery && matchesCategory
  })

  return (
    <div className="space-y-5">
      {/* Search input */}
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools..."
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-10 text-sm text-fg placeholder-muted outline-none transition-all focus:border-accent focus:ring-1 focus:ring-accent/15"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted transition-colors hover:text-fg"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const isActive = category === cat.value
          const styles = CAT_STYLES[cat.value]
          return (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                isActive
                  ? `${styles.pill} shadow-sm`
                  : 'border-border bg-surface text-muted hover:border-border/80 hover:text-fg'
              }`}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <div className="mb-4 text-5xl opacity-40">⊘</div>
          <p className="text-sm text-muted">
            No tools found{query ? ` for "${query}"` : ''}
          </p>
          <button
            onClick={() => { setQuery(''); setCategory('all') }}
            className="mt-3 text-xs text-accent-soft hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tool) => {
            const styles = CAT_STYLES[tool.category]
            return (
              <Link
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                className={`group relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg ${styles.glow}`}
              >
                {/* Top gradient accent line (appears on hover) */}
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${styles.bar}`} />

                <div className="flex items-start gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xl transition-transform duration-200 group-hover:scale-110 ${styles.icon}`}>
                    {tool.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-semibold leading-tight text-fg">{tool.name}</p>
                    <p className="mt-1 text-sm leading-snug text-muted">{tool.description}</p>
                  </div>
                  <span className="mt-0.5 shrink-0 text-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent-soft">
                    →
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className={`rounded-md border px-1.5 py-0.5 font-mono text-xs ${styles.pill}`}>
                    {tool.category}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
