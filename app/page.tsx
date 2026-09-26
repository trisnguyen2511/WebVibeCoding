import { Zap } from 'lucide-react'
import { tools } from '@/lib/tools-registry'
import { SearchableToolGrid } from '@/components/searchable-tool-grid'
import { LastToolRedirect } from '@/components/last-tool-redirect'
import { SettingsMenu } from '@/components/settings-menu'

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <LastToolRedirect />

      {/* ── Ambient blobs ────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none fixed inset-0 select-none overflow-hidden">
        <div className="absolute -left-60 -top-60 h-[700px] w-[700px] rounded-full bg-accent/[0.08] blur-[140px]" />
        <div className="absolute -right-40 top-10 h-[500px] w-[500px] rounded-full bg-accent-soft/[0.05] blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-accent/[0.04] blur-[100px]" />
      </div>

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-overlay/[0.06] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent shadow-[0_0_14px_rgba(124,58,237,0.55)]">
              <Zap size={13} className="text-white" fill="white" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-fg">WebVibe</span>
            <span className="hidden rounded-full border border-accent/20 bg-accent/[0.08] px-2 py-0.5 font-mono text-[10px] text-accent-soft sm:inline">
              tools
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              All systems live
            </span>
            <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
              Press{' '}
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-fg/60">
                /
              </kbd>{' '}
              to search
            </span>
            <SettingsMenu />
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative border-b border-overlay/[0.05] pb-8 pt-8 sm:pb-10 sm:pt-10">
        <div className="mx-auto max-w-5xl px-6">

          {/* Badge */}
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.08] px-3.5 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-soft" style={{ animationDuration: '2.4s' }} />
            <span className="font-mono text-xs text-accent-soft">Personal toolkit · open source</span>
          </div>

          {/* Headline */}
          <h1 className="mb-5 max-w-2xl font-display text-[2.6rem] font-bold leading-[1.06] tracking-tight text-fg sm:text-5xl lg:text-[3.75rem]">
            Every tool you{' '}
            <span className="bg-gradient-to-r from-accent-soft via-fg to-fg bg-clip-text text-transparent">
              actually need
            </span>
          </h1>

          {/* Subline */}
          <p className="max-w-[480px] text-base leading-relaxed text-muted sm:text-[1.05rem]">
            Developer utilities, all running in your browser. No setup, no tracking.
          </p>
        </div>
      </section>

      {/* ── Tool grid ────────────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-6">
        <SearchableToolGrid tools={tools} />
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-overlay/[0.05]">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <p className="font-mono text-[11px] text-muted">
              Built with Next.js · Runs entirely in your browser · No data leaves your device
            </p>
            <p className="font-mono text-[11px] text-muted">
              Made by{' '}
              <a
                href="https://trisnguyen2511.github.io/CVHTML/Index/index.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-soft transition-colors hover:text-fg"
              >
                Tris
              </a>
            </p>
          </div>
        </div>
      </footer>

    </div>
  )
}
