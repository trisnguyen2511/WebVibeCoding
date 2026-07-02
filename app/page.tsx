import { tools } from '@/lib/tools-registry'
import { SearchableToolGrid } from '@/components/searchable-tool-grid'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-display text-xl font-bold text-white">WebVibe</span>
          <span className="text-xs text-muted">Press <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono">/</kbd> to search</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="mb-6 font-display text-sm font-medium uppercase tracking-widest text-muted">
          Your Tools
        </h2>
        <SearchableToolGrid tools={tools} />
      </main>
    </div>
  )
}
