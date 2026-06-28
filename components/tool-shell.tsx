'use client'
import Link from 'next/link'

interface ToolShellProps {
  name: string
  icon: string
  description?: string
  children: React.ReactNode
}

export function ToolShell({ name, icon, description, children }: ToolShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <Link
            href="/"
            aria-label="Back to tools"
            className="text-muted transition-colors hover:text-white"
          >
            ← Back
          </Link>
          <span className="text-xl">{icon}</span>
          <div>
            <h1 className="font-display text-lg font-semibold text-white">{name}</h1>
            {description && (
              <p className="text-xs text-muted">{description}</p>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
