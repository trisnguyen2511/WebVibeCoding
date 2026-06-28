import { parseInf } from '@/lib/inf-parser'

const VALID_INF = `
[controller]
name = NES Layout
orientation = landscape

[button:UP]
label = ↑
key = ArrowUp
x = 15
y = 35
w = 14
h = 14

[button:A]
label = A
key = z
x = 75
y = 45
w = 14
h = 14
`.trim()

describe('parseInf', () => {
  it('parses a valid .inf file', () => {
    const { config, error } = parseInf(VALID_INF)
    expect(error).toBeNull()
    expect(config?.name).toBe('NES Layout')
    expect(config?.orientation).toBe('landscape')
    expect(config?.buttons.UP.key).toBe('ArrowUp')
    expect(config?.buttons.UP.x).toBe(15)
    expect(config?.buttons.A.label).toBe('A')
  })

  it('reports error with line number for missing equals sign', () => {
    const bad = '[controller]\nname NES\n'
    const { config, error } = parseInf(bad)
    expect(config).toBeNull()
    expect(error).toContain('line 2')
  })

  it('reports error for unknown orientation', () => {
    const bad = '[controller]\nname = test\norientation = diagonal\n'
    const { config, error } = parseInf(bad)
    expect(config).toBeNull()
    expect(error).toContain('orientation')
  })

  it('reports error for non-numeric coordinate', () => {
    const bad = '[controller]\nname = t\norientation = landscape\n[button:UP]\nlabel = ↑\nkey = ArrowUp\nx = abc\ny = 35\nw = 14\nh = 14\n'
    const { config, error } = parseInf(bad)
    expect(config).toBeNull()
    expect(error).toContain('x')
  })

  it('reports error for coordinate out of range', () => {
    const bad = '[controller]\nname = t\norientation = landscape\n[button:UP]\nlabel = ↑\nkey = ArrowUp\nx = 150\ny = 35\nw = 14\nh = 14\n'
    const { config, error } = parseInf(bad)
    expect(config).toBeNull()
    expect(error).toContain('0–100')
  })

  it('returns empty buttons object for controller-only file', () => {
    const { config } = parseInf('[controller]\nname = Empty\norientation = portrait\n')
    expect(config?.buttons).toEqual({})
  })
})
