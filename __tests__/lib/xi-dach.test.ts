import { analyze, evaluateHand, settle, DEFAULT_RULES, Rank } from '@/lib/xi-dach'

const R = DEFAULT_RULES
const h = (...r: Rank[]) => evaluateHand(r, R)

describe('evaluateHand', () => {
  it('scores aces as 11 when possible, else 1', () => {
    expect(h(1, 8).total).toBe(19)
    expect(h(1, 8, 7).total).toBe(16)
    expect(h(10, 10, 5).isBust).toBe(true)
  })
  it('detects special hands', () => {
    expect(h(1, 1).kind).toBe('xiBan')
    expect(h(1, 13).kind).toBe('xiDach')
    expect(h(2, 3, 4, 5, 6).kind).toBe('nguLinh')
    expect(h(10, 9, 5, 5, 5).kind).toBe('bust')
    expect(h(1, 2, 3).kind).toBe('normal')
  })
})

describe('settle', () => {
  it('orders xì bàn > xì dách > ngũ linh > points', () => {
    expect(settle(h(1, 13), h(2, 3, 4, 5, 6), R)).toBe(2)
    expect(settle(h(2, 3, 4, 5, 6), h(1, 13), R)).toBe(-2)
    expect(settle(h(1, 1), h(1, 13), R)).toBe(3)
    expect(settle(h(1, 13), h(1, 12), R)).toBe(0)
    expect(settle(h(10, 9), h(10, 8), R)).toBe(1)
    expect(settle(h(10, 8), h(10, 8), R)).toBe(0)
  })
  it('con bust always loses; cái bust pays con', () => {
    expect(settle(h(10, 10, 5), h(10, 10, 5), R)).toBe(-1)
    expect(settle(h(10, 7), h(10, 10, 5), R)).toBe(1)
  })
})

describe('analyze', () => {
  it('needs enough cards', () => {
    expect(analyze({ player: [10], dealerUp: [5], exposed: [] }).status).toBe('incomplete')
  })
  it('rejects more than 4 of a rank', () => {
    const a = analyze({ player: [5, 5], dealerUp: [5], exposed: [5, 5] })
    expect(a.status).toBe('invalid')
  })
  it('probabilities sum to 1 and bust+safe = 1', () => {
    const a = analyze({ player: [10, 6], dealerUp: [7], exposed: [] })
    expect(a.status).toBe('ok')
    const s = a.stand!
    expect(s.win + s.tie + s.lose).toBeCloseTo(1, 9)
    const t = a.hit!
    expect(t.win + t.tie + t.lose).toBeCloseTo(1, 9)
    expect(a.bustProb! + a.safeProb!).toBeCloseTo(1, 9)
    // 49 unseen; draws of 6+ bust: 6(3)+7(3)+8(4)+9(4)+ten-values(15)
    expect(a.bustProb).toBeCloseTo((3 + 3 + 4 + 4 + 15) / 49, 9)
  })
  it('forces hit under the minimum and never stands in 5-card rule violation', () => {
    const a = analyze({ player: [5, 6], dealerUp: [10], exposed: [] })
    expect(a.mustHit).toBe(true)
    expect(a.recommendation).toBe('HIT')
  })
  it('terminal for xì dách', () => {
    const a = analyze({ player: [1, 12], dealerUp: [9], exposed: [] })
    expect(a.recommendation).toBe('DONE')
    expect(a.stand!.ev).toBeGreaterThan(1)
  })
  it('stand with 20 and hit-bust probability when all remaining bust', () => {
    // Only high cards remain: exposed everything except 10-pointers.
    const exposed: Rank[] = []
    for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 9] as Rank[]) for (let i = 0; i < 4; i++) exposed.push(r)
    const a = analyze({ player: [10, 10], dealerUp: [10], exposed })
    expect(a.safeProb).toBe(0)
    expect(a.bustProb).toBe(1)
    expect(a.recommendation).toBe('STAND')
  })
  it('runs fast on a fresh two-card hand', () => {
    const t0 = Date.now()
    analyze({ player: [2, 3], dealerUp: [6], exposed: [] })
    expect(Date.now() - t0).toBeLessThan(3000)
  })
})
