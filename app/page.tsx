import { tools } from '@/lib/tools-registry'
import { SearchableToolGrid } from '@/components/searchable-tool-grid'

const STATS = [
  { value: String(tools.length), label: 'Tools' },
  { value: '6', label: 'Categories' },
  { value: '100%', label: 'Client-side' },
  { value: '0', label: 'Sign-ups needed' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm">
              ⚡
            </div>
            <span className="font-display text-lg font-bold text-white">WebVibe</span>
            <span className="hidden rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-xs text-muted sm:inline">
              tools
            </span>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
            Press{' '}
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs">/</kbd>{' '}
            to search
          </span>
        </div>
      </header>

      {/* Hero section */}
      <section className="border-b border-border" style={{ background: 'linear-gradient(180deg, rgba(124,58,237,0.06) 0%, transparent 100%)' }}>
        <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/8 px-3 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-soft" style={{ animationDuration: '2s' }} />
            <span className="font-mono text-xs text-accent-soft">Personal toolkit</span>
          </div>

          <h1 className="mb-3 font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
            Your tools,{' '}
            <span className="animate-shimmer">all in one place</span>
          </h1>

          <p className="mb-8 max-w-xl text-base text-muted sm:text-lg">
            Developer utilities, crypto tools, media processing — all running in your browser. No accounts, no tracking, no nonsense.
          </p>

          <div className="flex flex-wrap gap-8">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="font-display text-2xl font-bold text-white">{s.value}</div>
                <div className="mt-0.5 text-xs text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tool grid */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <SearchableToolGrid tools={tools} />
      </main>
    </div>
  )
}
