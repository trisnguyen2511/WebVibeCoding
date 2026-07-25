'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Settings as SettingsIcon, Moon, Sun, Monitor, Trash2 } from 'lucide-react'
import { CLEARABLE_CACHES, clearToolCache } from '@/lib/clear-cache-registry'

// App-wide settings — deliberately its own page (not a tool, doesn't use
// ToolShell) so it isn't tracked as "last tool visited" and so more setting
// sections can be added here later without redesigning the entry point.
export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [clearedSlug, setClearedSlug] = useState<string | null>(null)
  useEffect(() => setMounted(true), [])

  function handleClearCache(slug: string, label: string) {
    if (!window.confirm(`Xoá dữ liệu local của "${label}"? Không thể hoàn tác.`)) return
    clearToolCache(slug)
    setClearedSlug(slug)
    setTimeout(() => setClearedSlug((s) => (s === slug ? null : s)), 2000)
  }

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
          <p className="mt-0.5 text-xs text-muted">Chọn giao diện sáng, tối, hoặc theo hệ thống cho toàn bộ app</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <button
              onClick={() => setTheme('system')}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all ${
                mounted && theme === 'system'
                  ? 'border-accent bg-accent/[0.12] text-accent-soft'
                  : 'border-border bg-background text-muted hover:text-fg'
              }`}
            >
              <Monitor size={16} /> Hệ thống
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all ${
                mounted && theme === 'dark'
                  ? 'border-accent bg-accent/[0.12] text-accent-soft'
                  : 'border-border bg-background text-muted hover:text-fg'
              }`}
            >
              <Moon size={16} /> Tối
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all ${
                mounted && theme === 'light'
                  ? 'border-accent bg-accent/[0.12] text-accent-soft'
                  : 'border-border bg-background text-muted hover:text-fg'
              }`}
            >
              <Sun size={16} /> Sáng
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-sm font-semibold text-fg">Xoá cache</h2>
          <p className="mt-0.5 text-xs text-muted">
            Xoá dữ liệu lưu cục bộ (localStorage) của 1 tool — dùng khi tool gặp lỗi do dữ liệu cũ không tương thích.
          </p>
          <ul className="mt-4 space-y-2">
            {CLEARABLE_CACHES.map((entry) => (
              <li
                key={entry.slug}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5"
              >
                <span className="text-xs text-muted">{entry.label}</span>
                <button
                  type="button"
                  onClick={() => handleClearCache(entry.slug, entry.label)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    clearedSlug === entry.slug
                      ? 'border-emerald-500/40 text-emerald-400'
                      : 'border-border text-muted hover:border-red-500/40 hover:text-red-400'
                  }`}
                >
                  <Trash2 size={13} />
                  {clearedSlug === entry.slug ? 'Đã xoá' : 'Xoá'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
