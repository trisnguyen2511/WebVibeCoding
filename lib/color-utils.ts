export function isValidHex(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isValidHex(hex)) return null
  const h = hex.slice(1)
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgbToHsl(rgb.r, rgb.g, rgb.b)
}

export function generateShades(hex: string): string[] {
  const hsl = hexToHsl(hex)
  if (!hsl) return []
  return Array.from({ length: 10 }, (_, i) => {
    const l = 95 - i * 9
    return hslToHex(hsl.h, hsl.s, Math.max(5, Math.min(95, l)))
  })
}

export function generateComplementary(hex: string): string[] {
  const hsl = hexToHsl(hex)
  if (!hsl) return []
  const comp = (hsl.h + 180) % 360
  return [
    hslToHex(hsl.h, hsl.s, 70),
    hslToHex(hsl.h, hsl.s, hsl.l),
    hslToHex(hsl.h, hsl.s, 30),
    hslToHex(comp, hsl.s, 70),
    hslToHex(comp, hsl.s, hsl.l),
    hslToHex(comp, hsl.s, 30),
  ]
}

export function generateTriadic(hex: string): string[] {
  const hsl = hexToHsl(hex)
  if (!hsl) return []
  return [0, 120, 240].flatMap((offset) => [
    hslToHex((hsl.h + offset) % 360, hsl.s, 70),
    hslToHex((hsl.h + offset) % 360, hsl.s, hsl.l),
  ])
}

export function generateAnalogous(hex: string): string[] {
  const hsl = hexToHsl(hex)
  if (!hsl) return []
  return [-60, -30, 0, 30, 60].map((offset) =>
    hslToHex((hsl.h + offset + 360) % 360, hsl.s, hsl.l)
  )
}

export function generateMonochromatic(hex: string): string[] {
  const hsl = hexToHsl(hex)
  if (!hsl) return []
  return [90, 75, 60, 45, 30, 15].map((l) => hslToHex(hsl.h, hsl.s, l))
}
