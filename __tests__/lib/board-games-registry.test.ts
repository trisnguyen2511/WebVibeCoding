import { boardGames } from '@/lib/board-games-registry'
import { tools } from '@/lib/tools-registry'

describe('board-games-registry', () => {
  it('has unique slugs and well-formed internal hrefs', () => {
    expect(new Set(boardGames.map((g) => g.slug)).size).toBe(boardGames.length)
    for (const game of boardGames) expect(game.href).toMatch(/^\/tools\/[a-z-]+$/)
  })

  it('lists the existing games with their original URLs unchanged', () => {
    const hrefs = Object.fromEntries(boardGames.map((g) => [g.slug, g.href]))
    expect(hrefs['werewolf-gm']).toBe('/tools/werewolf-gm')
    expect(hrefs['xi-dach']).toBe('/tools/xi-dach')
    expect(hrefs['meme-party']).toBe('/tools/meme-party')
  })

  it('shows board games as a single entry on the home page', () => {
    const slugs = tools.map((t) => t.slug)
    expect(slugs).toContain('board-games')
    for (const game of boardGames) expect(slugs).not.toContain(game.slug)
  })
})
