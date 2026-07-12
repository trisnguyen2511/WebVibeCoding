'use client'
import { useState, useRef, useCallback } from 'react'
import { ToolShell } from '@/components/tool-shell'

type Tab = 'compress' | 'resize' | 'convert'
type Format = 'image/jpeg' | 'image/png' | 'image/webp'
const FORMAT_LABELS: Record<Format, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' }

interface ImgInfo { url: string; size: number; w: number; h: number; name: string }

function useImageLoader() {
  const [img, setImg] = useState<ImgInfo | null>(null)

  const loadFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => setImg({ url, size: file.size, w: el.naturalWidth, h: el.naturalHeight, name: file.name })
    el.src = url
  }, [])

  return { img, loadFile, clear: () => setImg(null) }
}

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = useState(false)
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${over ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent/50'}`}
    >
      <span className="text-4xl">🖼️</span>
      <p className="text-sm text-muted">Drop image here or <span className="text-accent-soft underline">browse</span></p>
      <p className="text-xs text-muted">PNG, JPEG, WebP, GIF</p>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </label>
  )
}

function processImage(src: string, opts: { w?: number; h?: number; format: Format; quality: number }): Promise<{ url: string; size: number }> {
  return new Promise((resolve) => {
    const el = new Image()
    el.onload = () => {
      const w = opts.w ?? el.naturalWidth
      const h = opts.h ?? el.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(el, 0, 0, w, h)
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob!)
        resolve({ url, size: blob!.size })
      }, opts.format, opts.quality)
    }
    el.src = src
  })
}

function fmt(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function CompressTab() {
  const { img, loadFile } = useImageLoader()
  const [quality, setQuality] = useState(80)
  const [output, setOutput] = useState<{ url: string; size: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    if (!img) return
    setLoading(true)
    const result = await processImage(img.url, { format: 'image/jpeg', quality: quality / 100 })
    setOutput(result)
    setLoading(false)
  }

  const download = () => {
    if (!output) return
    const a = document.createElement('a'); a.href = output.url
    a.download = img!.name.replace(/\.[^.]+$/, '') + `-compressed.jpg`; a.click()
  }

  return (
    <div className="space-y-4">
      {!img ? <DropZone onFile={loadFile} /> : (
        <>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
            <img src={img.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <div className="flex-1">
              <p className="text-sm font-medium text-fg">{img.name}</p>
              <p className="text-xs text-muted">{img.w} × {img.h} · {fmt(img.size)}</p>
            </div>
            <button onClick={() => setOutput(null)} className="text-xs text-muted hover:text-fg">Change</button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted">Quality</label>
              <span className="font-mono text-sm text-accent-soft">{quality}%</span>
            </div>
            <input type="range" min={10} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-accent" />
          </div>
          <button onClick={run} disabled={loading}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent/80 disabled:opacity-50">
            {loading ? 'Processing...' : 'Compress'}
          </button>
          {output && (
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div className="flex gap-6 text-sm">
                <span className="text-muted">Before: <span className="text-fg font-mono">{fmt(img.size)}</span></span>
                <span className="text-muted">After: <span className="text-green-400 font-mono">{fmt(output.size)}</span></span>
                <span className="text-muted">Saved: <span className="text-accent-soft font-mono">{Math.round((1 - output.size / img.size) * 100)}%</span></span>
              </div>
              <img src={output.url} alt="compressed" className="max-h-48 rounded-lg object-contain mx-auto" />
              <button onClick={download}
                className="w-full rounded-xl border border-accent/50 py-2 text-sm text-accent-soft hover:bg-accent/10 transition-colors">
                ↓ Download
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ResizeTab() {
  const { img, loadFile } = useImageLoader()
  const [w, setW] = useState(0)
  const [h, setH] = useState(0)
  const [lock, setLock] = useState(true)
  const [output, setOutput] = useState<{ url: string; size: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const onImgLoad = (f: File) => { loadFile(f) }
  const updateW = (val: number) => {
    setW(val)
    if (lock && img) setH(Math.round(val * img.h / img.w))
  }
  const updateH = (val: number) => {
    setH(val)
    if (lock && img) setW(Math.round(val * img.w / img.h))
  }

  const run = async () => {
    if (!img) return
    setLoading(true)
    const result = await processImage(img.url, { w: w || img.w, h: h || img.h, format: 'image/png', quality: 1 })
    setOutput(result)
    setLoading(false)
  }

  const download = () => {
    if (!output) return
    const a = document.createElement('a'); a.href = output.url
    a.download = img!.name.replace(/\.[^.]+$/, '') + `-${w}x${h}.png`; a.click()
  }

  return (
    <div className="space-y-4">
      {!img ? (
        <DropZone onFile={(f) => { onImgLoad(f); loadFile(f) }} />
      ) : (
        <>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
            <img src={img.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <div>
              <p className="text-sm font-medium text-fg">{img.name}</p>
              <p className="text-xs text-muted">{img.w} × {img.h}</p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <label className="text-xs text-muted">Width (px)</label>
              <input type="number" value={w || img.w} min={1} onChange={(e) => updateW(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-fg outline-none focus:border-accent" />
            </div>
            <button onClick={() => setLock((v) => !v)}
              className={`mt-5 rounded-lg border p-2 text-sm transition-colors ${lock ? 'border-accent text-accent-soft' : 'border-border text-muted'}`}>
              {lock ? '🔒' : '🔓'}
            </button>
            <div className="flex-1">
              <label className="text-xs text-muted">Height (px)</label>
              <input type="number" value={h || img.h} min={1} onChange={(e) => updateH(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-fg outline-none focus:border-accent" />
            </div>
          </div>
          <button onClick={run} disabled={loading}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent/80 disabled:opacity-50">
            {loading ? 'Processing...' : 'Resize'}
          </button>
          {output && (
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <img src={output.url} alt="resized" className="max-h-48 rounded-lg object-contain mx-auto" />
              <p className="text-xs text-muted text-center">{w} × {h} · {fmt(output.size)}</p>
              <button onClick={download}
                className="w-full rounded-xl border border-accent/50 py-2 text-sm text-accent-soft hover:bg-accent/10 transition-colors">
                ↓ Download
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ConvertTab() {
  const { img, loadFile } = useImageLoader()
  const [format, setFormat] = useState<Format>('image/webp')
  const [output, setOutput] = useState<{ url: string; size: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    if (!img) return
    setLoading(true)
    const result = await processImage(img.url, { format, quality: 0.92 })
    setOutput(result)
    setLoading(false)
  }

  const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp'

  const download = () => {
    if (!output) return
    const a = document.createElement('a'); a.href = output.url
    a.download = img!.name.replace(/\.[^.]+$/, '') + `.${ext}`; a.click()
  }

  return (
    <div className="space-y-4">
      {!img ? <DropZone onFile={loadFile} /> : (
        <>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
            <img src={img.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <div>
              <p className="text-sm font-medium text-fg">{img.name}</p>
              <p className="text-xs text-muted">{img.w} × {img.h} · {fmt(img.size)}</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-muted">Convert to</p>
            <div className="flex gap-2">
              {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors ${format === f ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-surface text-muted hover:text-fg'}`}>
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <button onClick={run} disabled={loading}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent/80 disabled:opacity-50">
            {loading ? 'Converting...' : `Convert to ${FORMAT_LABELS[format]}`}
          </button>
          {output && (
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div className="flex gap-6 text-sm">
                <span className="text-muted">Before: <span className="text-fg font-mono">{fmt(img.size)}</span></span>
                <span className="text-muted">After: <span className="text-accent-soft font-mono">{fmt(output.size)}</span></span>
              </div>
              <img src={output.url} alt="converted" className="max-h-48 rounded-lg object-contain mx-auto" />
              <button onClick={download}
                className="w-full rounded-xl border border-accent/50 py-2 text-sm text-accent-soft hover:bg-accent/10 transition-colors">
                ↓ Download .{ext}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ImageToolsPage() {
  const [tab, setTab] = useState<Tab>('compress')

  return (
    <ToolShell name="Image Tools" icon="🖼️" description="Compress, resize and convert images in the browser">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
          {(['compress', 'resize', 'convert'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-fg'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'compress' && <CompressTab />}
        {tab === 'resize' && <ResizeTab />}
        {tab === 'convert' && <ConvertTab />}
      </div>
    </ToolShell>
  )
}
