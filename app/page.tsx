import Link from 'next/link'
import { tools } from '@/lib/tools-registry'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-display text-xl font-bold text-white">
            WebVibe
          </span>
          <span className="text-sm text-muted">
            Press <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs text-white">/</kbd> to search
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="mb-6 font-display text-sm font-medium uppercase tracking-widest text-muted">
          Your Tools
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
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
              <span className="mt-0.5 text-muted transition-colors group-hover:text-accent-soft">
                →
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
