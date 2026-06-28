'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { tools } from '@/lib/tools-registry'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const filtered = tools.filter(t =>
    t.name.toLowerCase().includes(query.toLowerCase())
  )

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

  const navigate = (slug: string) => {
    router.push(`/tools/${slug}`)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface/90 shadow-2xl backdrop-blur-md"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'palette-in 150ms ease' }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search tools..."
          className="w-full bg-transparent px-5 py-4 font-sans text-white placeholder-muted outline-none"
        />
        <div className="border-t border-border">
          {filtered.map(tool => (
            <button
              key={tool.slug}
              onClick={() => navigate(tool.slug)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/10"
            >
              <span>{tool.icon}</span>
              <span className="font-display text-white">{tool.name}</span>
              <span className="ml-auto text-xs text-muted">{tool.description}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted">No tools found.</p>
          )}
        </div>
      </div>
    </div>
  )
}
