'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { hexToRgb, rgbToHsl, isValidHex } from '@/lib/color-utils'

export default function ColorPickerPage() {
  const [hex, setHex] = useState('#7C3AED')
  const [copied, setCopied] = useState<string | null>(null)

  const rgb = isValidHex(hex) ? hexToRgb(hex) : null
  const hsl = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  const row = (label: string, value: string) => (
    <div key={label} className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
      <span className="text-xs uppercase tracking-widest text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-fg">{value}</span>
        <button
          onClick={() => copy(value, label)}
          className="text-xs text-muted transition-colors hover:text-accent-soft"
        >
          {copied === label ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  )

  return (
    <ToolShell name="Color Picker" icon="🎨">
      <div className="mx-auto max-w-sm space-y-4">
        <div
          className="h-40 w-full rounded-2xl border border-border transition-colors"
          style={{ backgroundColor: isValidHex(hex) ? hex : '#08080E' }}
        />
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={isValidHex(hex) ? hex : '#000000'}
            onChange={e => setHex(e.target.value)}
            className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-surface"
          />
          <input
            type="text"
            value={hex}
            onChange={e => setHex(e.target.value)}
            placeholder="#000000"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-fg outline-none focus:border-accent"
          />
        </div>
        <div className="space-y-2">
          {row('HEX', hex.toUpperCase())}
          {rgb && row('RGB', `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`)}
          {hsl && row('HSL', `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`)}
        </div>
      </div>
    </ToolShell>
  )
}
