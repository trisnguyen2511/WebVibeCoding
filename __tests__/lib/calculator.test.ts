import { calculate } from '@/lib/calculator'

describe('calculate', () => {
  it('adds', () => expect(calculate(2, 3, '+')).toBe(5))
  it('subtracts', () => expect(calculate(10, 4, '-')).toBe(6))
  it('multiplies', () => expect(calculate(3, 7, '*')).toBe(21))
  it('divides', () => expect(calculate(10, 2, '/')).toBe(5))
  it('returns null for division by zero', () => expect(calculate(5, 0, '/')).toBeNull())
  it('returns null for unknown operator', () => expect(calculate(1, 2, '%')).toBeNull())
  it('handles negative numbers', () => expect(calculate(-3, -2, '*')).toBe(6))
})
