import { hexToRgb, rgbToHsl, isValidHex } from '@/lib/color-utils'

describe('hexToRgb', () => {
  it('converts #ffffff to rgb(255,255,255)', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
  })
  it('converts #000000', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
  })
  it('converts #7c3aed', () => {
    expect(hexToRgb('#7c3aed')).toEqual({ r: 124, g: 58, b: 237 })
  })
  it('returns null for invalid hex', () => {
    expect(hexToRgb('notahex')).toBeNull()
  })
})

describe('rgbToHsl', () => {
  it('converts white to hsl(0,0%,100%)', () => {
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 100 })
  })
  it('converts black to hsl(0,0%,0%)', () => {
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 })
  })
})

describe('isValidHex', () => {
  it('accepts #aabbcc', () => expect(isValidHex('#aabbcc')).toBe(true))
  it('accepts #abc', () => expect(isValidHex('#abc')).toBe(true))
  it('rejects invalid', () => expect(isValidHex('abc')).toBe(false))
})
