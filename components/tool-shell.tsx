'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { SettingsMenu } from '@/components/settings-menu'
import { recordToolVisit } from '@/lib/tool-history'

interface ToolShellProps {
  name: string
  icon: string
  description?: string
  children: React.ReactNode
  wide?: boolean
  /**
   * Fills exactly the viewport height with no outer scroll — the header
   * shrinks to fit and `children` gets the rest via a flex-1 region with
   * its own internal scrolling. Use for tools like chat that need a fixed,
   * app-like frame instead of a normal scrolling page.
   */
  fullBleed?: boolean
  /**
   * Optional style for a full-viewport ambient background layer, rendered as
   * a fixed, negative-z-index, empty div behind everything (header + main).
   * Meant for a blurred/scaled backdrop (e.g. a room's own wallpaper) — since
   * the layer has no children, a `filter: blur(...)` on it is safe and won't
   * blur any real content.
   */
  ambientBackgroundStyle?: React.CSSProperties
  /** Optional style override for the sticky header bar (e.g. a subtle theme accent). */
  headerStyle?: React.CSSProperties
  /**
   * Lets the ambient background layer bleed through the header instead of
   * sitting behind an opaque bar — so the header reads as part of the same
   * themed surface as the rest of the page, rather than a flat strip on top.
   */
  headerTranslucent?: boolean
  /**
   * Hides the header bar entirely (e.g. a tool's own full-screen overlay,
   * like a search or media view, that shouldn't be covered by it).
   */
  hideHeader?: boolean
}

export function ToolShell({
  name,
  icon,
  description,
  children,
  wide = false,
  fullBleed = false,
  ambientBackgroundStyle,
  headerStyle,
  headerTranslucent = false,
  hideHeader = false,
}: ToolShellProps) {
  const maxW = wide ? 'max-w-6xl' : 'max-w-4xl'
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (pathname) recordToolVisit(pathname)
  }, [pathname])

  return (
    <div
      className={fullBleed ? 'flex h-dvh flex-col overflow-hidden bg-background' : 'min-h-screen bg-background'}
      style={fullBleed ? { overscrollBehavior: 'none' } : undefined}
    >
      {ambientBackgroundStyle && (
        // A *negative* z-index here would paint below this wrapper's own
        // opaque bg-background (static content still paints above negative-
        // z-index layers), making it invisible — so this uses z-0 instead,
        // and header/main each get their own stacking context (relative +
        // positive z-index) to still paint above it.
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={ambientBackgroundStyle} />
      )}
      {!hideHeader && (
      <header
        className={`sticky top-0 z-20 shrink-0 border-b border-border backdrop-blur-md ${headerTranslucent ? 'bg-background/35' : 'bg-background/85'}`}
        style={headerStyle}
      >
        <div className={`mx-auto flex ${maxW} items-center gap-3 px-4 py-2.5`}>
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted transition-all hover:border-accent/50 hover:text-fg"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="h-4 w-px shrink-0 bg-border" />

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-base">
              {icon}
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-sm font-semibold leading-tight text-fg">{name}</h1>
              {description && (
                <p className="truncate text-xs leading-tight text-muted">{description}</p>
              )}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 sm:flex">
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs text-muted">/</kbd>
              <span className="text-xs text-muted">search</span>
            </div>
            <SettingsMenu />
          </div>
        </div>
      </header>
      )}

      <main className={fullBleed ? 'relative z-10 min-h-0 flex-1 overflow-hidden' : `relative z-10 mx-auto ${maxW} px-4 py-6`}>
        {children}
      </main>
    </div>
  )
}
