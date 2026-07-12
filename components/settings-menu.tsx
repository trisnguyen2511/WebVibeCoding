import Link from 'next/link'
import { Settings } from 'lucide-react'

// Entry point into the app-wide settings screen (/settings) — not a popover,
// so more settings can be added there later without redesigning this button.
export function SettingsMenu() {
  return (
    <Link
      href="/settings"
      aria-label="Cài đặt"
      title="Cài đặt"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-fg"
    >
      <Settings size={14} />
    </Link>
  )
}
