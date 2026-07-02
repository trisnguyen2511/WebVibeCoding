'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Tool, ToolCategory } from '@/lib/tools-registry'

const CATEGORIES: { label: string; value: ToolCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Utility', value: 'utility' },
  { label: 'Dev', value: 'dev' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'Media', value: 'media' },
  { label: 'Productivity', value: 'productivity' },
  { label: 'Game', value: 'game' },
]

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
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-sm select-none">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools..."
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-sm text-white placeholder-muted outline-none transition-colors focus:border-accent"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category filters */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
              category === cat.value
                ? 'border-accent bg-accent/20 text-accent-soft'
                : 'border-border bg-surface text-muted hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Tool grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted">
          <p className="text-3xl mb-3">🔍</p>
          <p className="text-sm">No tools found for &ldquo;{query}&rdquo;</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tool) => (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 transition-all duration-100 hover:-translate-y-0.5 hover:border-accent/40"
            >
              <span className="text-2xl">{tool.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-white">{tool.name}</p>
                <p className="mt-0.5 text-sm text-muted">{tool.description}</p>
              </div>
              <span className="mt-0.5 text-muted transition-colors group-hover:text-accent-soft">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
