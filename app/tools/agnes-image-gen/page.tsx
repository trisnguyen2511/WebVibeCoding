'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'

const MODELS = ['agnes-image-2.0-flash', 'agnes-image-2.1-flash'] as const
type Model = typeof MODELS[number]
const SIZES = ['512x512', '1024x1024', '1024x1792', '1792x1024'] as const
type Size = typeof SIZES[number]

export default function AgnesImageGenPage() {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<Model>('agnes-image-2.0-flash')
  const [size, setSize] = useState<Size>('1024x1024')
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setImage(null)
    setError(null)
    try {
      const res = await fetch('/api/agnes-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, size }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setImage(data.result)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ToolShell name="Agnes Image Gen" icon="🖼️" description="Test image generation via the Agnes AI API">
      <div className="mx-auto max-w-2xl space-y-4">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe the image you want..."
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-surface p-4 text-sm text-fg outline-none placeholder-muted focus:border-accent"
        />

        <div className="flex flex-wrap gap-2">
          {MODELS.map(m => (
            <button
              key={m}
              onClick={() => setModel(m)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                model === m
                  ? 'border-accent bg-accent/20 text-accent-soft'
                  : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-fg'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {SIZES.map(s => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                size === s
                  ? 'border-accent bg-accent/20 text-accent-soft'
                  : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-fg'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="w-full rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
        >
          {loading ? 'Generating...' : 'Generate Image'}
        </button>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {image && (
          <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={prompt} className="w-full rounded-lg" />
            <a
              href={image}
              download
              className="block text-center text-xs text-muted hover:text-accent-soft"
            >
              Download
            </a>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
