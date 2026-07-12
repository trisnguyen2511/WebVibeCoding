'use client'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Settings, Sun, Moon } from 'lucide-react'

// App-wide settings — currently just the dark/light toggle, but this is the
// one place future global settings should live (not per-tool).
export function SettingsMenu() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (!(e.target as Element).closest('[data-settings-menu]')) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  // Avoid a hydration mismatch — theme isn't known until mounted client-side.
  if (!mounted) return <div className="h-8 w-8 shrink-0" />

  return (
    <div className="relative shrink-0" data-settings-menu>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Cài đặt"
        title="Cài đặt"
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
          open ? 'border-accent/50 bg-accent/[0.1] text-accent-soft' : 'border-border bg-surface text-muted hover:text-fg'
        }`}
      >
        <Settings size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-xl border border-border bg-surface p-2 shadow-2xl animate-panel-in">
          <p className="px-2 pb-1.5 text-[10px] uppercase tracking-widest text-muted">Giao diện</p>
          <button
            onClick={() => { setTheme('dark'); setOpen(false) }}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              theme === 'dark' ? 'bg-accent/[0.15] text-accent-soft' : 'text-fg hover:bg-overlay/[0.06]'
            }`}
          >
            <Moon size={14} /> Tối
          </button>
          <button
            onClick={() => { setTheme('light'); setOpen(false) }}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              theme === 'light' ? 'bg-accent/[0.15] text-accent-soft' : 'text-fg hover:bg-overlay/[0.06]'
            }`}
          >
            <Sun size={14} /> Sáng
          </button>
        </div>
      )}
    </div>
  )
}
