'use client'
import Link from 'next/link'
import { ToolShell } from '@/components/tool-shell'
import { games } from '@/lib/games-registry'

export default function GamesPage() {
  return (
    <ToolShell name="Games" icon="🎲" description="Game tự code, chơi trực tiếp trên web">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {games.map((game) => (
          <Link
            key={game.slug}
            href={`/tools/games/${game.slug}`}
            className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-lg">
                {game.icon}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-sm font-semibold text-fg group-hover:text-accent-soft">
                  {game.name}
                </h2>
                <p className="mt-1 text-xs text-muted">{game.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </ToolShell>
  )
}
