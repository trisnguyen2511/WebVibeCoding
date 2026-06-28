import { tools } from '@/lib/tools-registry'

describe('tools-registry', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThan(0)
  })

  it('each tool has required fields', () => {
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string')
      expect(typeof tool.slug).toBe('string')
      expect(typeof tool.icon).toBe('string')
      expect(typeof tool.description).toBe('string')
      expect(['utility', 'crypto', 'game', 'media']).toContain(tool.category)
    }
  })

  it('slug matches kebab-case pattern', () => {
    for (const tool of tools) {
      expect(tool.slug).toMatch(/^[a-z]+(-[a-z]+)*$/)
    }
  })

  it('slugs are unique', () => {
    const slugs = tools.map(t => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
