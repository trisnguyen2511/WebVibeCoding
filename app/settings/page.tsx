'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Settings as SettingsIcon, Moon, Sun } from 'lucide-react'

// App-wide settings — deliberately its own page (not a tool, doesn't use
// ToolShell) so it isn't tracked as "last tool visited" and so more setting
// sections can be added here later without redesigning the entry point.
export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <Link
            href="/"
            aria-label="Back to tools"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted transition-all hover:border-accent/50 hover:text-fg"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </Link>

          <div className="h-4 w-px shrink-0 bg-border" />

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted">
              <SettingsIcon size={15} />
            </span>
            <h1 className="font-display text-sm font-semibold leading-tight text-fg">Cài đặt</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-sm font-semibold text-fg">Giao diện</h2>
          <p className="mt-0.5 text-xs text-muted">Chọn giao diện sáng hoặc tối cho toàn bộ app</p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setTheme('dark')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all ${
                mounted && theme === 'dark'
                  ? 'border-accent bg-accent/[0.12] text-accent-soft'
                  : 'border-border bg-background text-muted hover:text-fg'
              }`}
            >
              <Moon size={16} /> Tối
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all ${
                mounted && theme === 'light'
                  ? 'border-accent bg-accent/[0.12] text-accent-soft'
                  : 'border-border bg-background text-muted hover:text-fg'
              }`}
            >
              <Sun size={16} /> Sáng
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
