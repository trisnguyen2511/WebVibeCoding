'use client'
import { useState, useMemo } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { isValidHex, generateShades, generateComplementary, generateTriadic, generateAnalogous, generateMonochromatic } from '@/lib/color-utils'

type PaletteType = 'shades' | 'complementary' | 'triadic' | 'analogous' | 'monochromatic'

const PALETTE_TYPES: { id: PaletteType; label: string; desc: string }[] = [
  { id: 'shades', label: 'Shades', desc: 'Light → Dark' },
  { id: 'complementary', label: 'Complementary', desc: 'Opposite hues' },
  { id: 'triadic', label: 'Triadic', desc: '120° apart' },
  { id: 'analogous', label: 'Analogous', desc: '±30° neighbors' },
  { id: 'monochromatic', label: 'Mono', desc: 'Same hue, varied L' },
]

function Swatch({ hex }: { hex: string }) {
  const { copied, copy } = useCopyToClipboard(1000)
  return (
    <button
      onClick={() => copy(hex)}
      title={hex}
      className="group relative flex flex-col items-center gap-1.5"
    >
      <div
        className="w-full rounded-xl border border-overlay/10 transition-transform group-hover:scale-105"
        style={{ backgroundColor: hex, aspectRatio: '1' }}
      />
      <span className="font-mono text-[10px] text-muted group-hover:text-fg transition-colors">
        {copied ? '✓' : hex}
      </span>
    </button>
  )
}

export default function ColorPalettePage() {
  const [seed, setSeed] = useState('#7C3AED')
  const [active, setActive] = useState<PaletteType>('shades')
  const { copy } = useCopyToClipboard()

  const palette = useMemo(() => {
    if (!isValidHex(seed)) return []
    switch (active) {
      case 'shades': return generateShades(seed)
      case 'complementary': return generateComplementary(seed)
      case 'triadic': return generateTriadic(seed)
      case 'analogous': return generateAnalogous(seed)
      case 'monochromatic': return generateMonochromatic(seed)
    }
  }, [seed, active])

  const exportCss = () => {
    const vars = palette.map((hex, i) => `  --color-${active}-${(i + 1) * 100}: ${hex};`).join('\n')
    copy(`:root {\n${vars}\n}`)
  }

  return (
    <ToolShell name="Color Palette" icon="🖌️" description="Generate palettes from any seed color">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Seed input */}
        <div className="flex gap-3 items-center">
          <input
            type="color"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="h-12 w-12 cursor-pointer rounded-xl border border-border bg-surface p-1"
          />
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            maxLength={7}
            className={`flex-1 rounded-xl border bg-surface px-4 py-2.5 font-mono text-sm text-fg outline-none transition-colors ${isValidHex(seed) ? 'border-border focus:border-accent' : 'border-red-500/60'}`}
          />
          <div
            className="h-12 w-12 rounded-xl border border-overlay/10 shrink-0"
            style={{ backgroundColor: isValidHex(seed) ? seed : '#7C3AED' }}
          />
        </div>

        {/* Palette type tabs */}
        <div className="flex gap-2 flex-wrap">
          {PALETTE_TYPES.map((t) => (
            <button key={t.id} onClick={() => setActive(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${active === t.id ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-surface text-muted hover:text-fg'}`}>
              {t.label}
              <span className="ml-1 opacity-60">{t.desc}</span>
            </button>
          ))}
        </div>

        {/* Swatches */}
        {palette.length > 0 && (
          <div>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${palette.length}, minmax(0, 1fr))` }}
            >
              {palette.map((hex) => (
                <Swatch key={hex} hex={hex} />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={exportCss}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-xs text-muted hover:text-fg transition-colors">
                Copy as CSS variables
              </button>
            </div>
          </div>
        )}

        {!isValidHex(seed) && (
          <p className="text-xs text-red-400 font-mono">Enter a valid hex color (#rrggbb)</p>
        )}
      </div>
    </ToolShell>
  )
}
