import { Zap } from 'lucide-react'
import { tools } from '@/lib/tools-registry'
import { SearchableToolGrid } from '@/components/searchable-tool-grid'

const STATS = [
  { value: String(tools.length), label: 'Tools', sub: 'and growing' },
  { value: '7',    label: 'Categories',   sub: 'utility to game'  },
  { value: '100%', label: 'Client-side',  sub: 'no server calls'  },
  { value: '0',    label: 'Sign-ups',     sub: 'just open & use'  },
]

const CHIPS = ['No account needed', 'Runs locally', 'Zero tracking']

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">

      {/* ── Ambient blobs ────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none fixed inset-0 select-none overflow-hidden">
        <div className="absolute -left-60 -top-60 h-[700px] w-[700px] rounded-full bg-accent/[0.08] blur-[140px]" />
        <div className="absolute -right-40 top-10 h-[500px] w-[500px] rounded-full bg-accent-soft/[0.05] blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-accent/[0.04] blur-[100px]" />
      </div>

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent shadow-[0_0_14px_rgba(124,58,237,0.55)]">
              <Zap size={13} className="text-white" fill="white" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-white">WebVibe</span>
            <span className="hidden rounded-full border border-accent/20 bg-accent/[0.08] px-2 py-0.5 font-mono text-[10px] text-accent-soft sm:inline">
              tools
            </span>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
            Press{' '}
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-white/60">
              /
            </kbd>{' '}
            to search
          </span>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative border-b border-white/[0.05] pb-14 pt-16 sm:pb-16 sm:pt-20">
        <div className="mx-auto max-w-5xl px-6">

          {/* Badge */}
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.08] px-3.5 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-soft" style={{ animationDuration: '2.4s' }} />
            <span className="font-mono text-xs text-accent-soft">Personal toolkit · open source</span>
          </div>

          {/* Headline */}
          <h1 className="mb-5 max-w-2xl font-display text-[2.6rem] font-bold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-[3.75rem]">
            Every tool you{' '}
            <span className="bg-gradient-to-r from-accent-soft via-white to-white bg-clip-text text-transparent">
              actually need
            </span>
          </h1>

          {/* Subline */}
          <p className="mb-8 max-w-[480px] text-base leading-relaxed text-muted sm:text-[1.05rem]">
            Developer utilities, crypto tools, media & productivity — all running in your browser. No setup, no tracking.
          </p>

          {/* Feature chips */}
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <span
                key={chip}
                className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-xs text-white/60 backdrop-blur-sm"
              >
                <span className="h-[5px] w-[5px] rounded-full bg-accent-soft/70" />
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bento ──────────────────────────────────────── */}
      <section className="border-b border-white/[0.05]">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur-sm transition-all duration-300 hover:border-accent/25 hover:bg-white/[0.05] hover:shadow-[0_0_24px_rgba(124,58,237,0.08)]"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/[0.05] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <p className="font-display text-3xl font-bold tracking-tight text-white sm:text-[2.25rem]">
                  {s.value}
                </p>
                <p className="mt-1 text-sm font-semibold text-white/80">{s.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tool grid ────────────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-10">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">Browse tools</h2>
            <p className="mt-0.5 text-sm text-muted">
              {tools.length} tools · search or filter by category
            </p>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            All systems live
          </span>
        </div>
        <SearchableToolGrid tools={tools} />
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05]">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <p className="text-center font-mono text-[11px] text-muted">
            Built with Next.js · Everything runs in your browser · No data ever leaves your device
          </p>
        </div>
      </footer>

    </div>
  )
}
