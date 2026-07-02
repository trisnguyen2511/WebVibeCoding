'use client'
import Link from 'next/link'

interface ToolShellProps {
  name: string
  icon: string
  description?: string
  children: React.ReactNode
  wide?: boolean
}

export function ToolShell({ name, icon, description, children, wide = false }: ToolShellProps) {
  const maxW = wide ? 'max-w-6xl' : 'max-w-4xl'

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className={`mx-auto flex ${maxW} items-center gap-3 px-4 py-2.5`}>
          <Link
            href="/"
            aria-label="Back to tools"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted transition-all hover:border-accent/50 hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            <span className="hidden sm:inline">Back</span>
          </Link>

          <div className="h-4 w-px shrink-0 bg-border" />

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-base">
              {icon}
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-sm font-semibold leading-tight text-white">{name}</h1>
              {description && (
                <p className="truncate text-xs leading-tight text-muted">{description}</p>
              )}
            </div>
          </div>

          <div className="ml-auto hidden items-center gap-1.5 sm:flex">
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs text-muted">/</kbd>
            <span className="text-xs text-muted">search</span>
          </div>
        </div>
      </header>

      <main className={`mx-auto ${maxW} px-4 py-6`}>
        {children}
      </main>
    </div>
  )
}
