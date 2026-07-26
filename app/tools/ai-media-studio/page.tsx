'use client'
import { useEffect, useRef, useState } from 'react'
import { ToolShell } from '@/components/tool-shell'

const IMAGE_MODELS = ['agnes-image-2.0-flash', 'agnes-image-2.1-flash'] as const
type ImageModel = typeof IMAGE_MODELS[number]
const IMAGE_SIZES = ['512x512', '1024x1024', '1024x1792', '1792x1024'] as const
type ImageSize = typeof IMAGE_SIZES[number]

const VIDEO_SIZES = ['1280x720', '720x1280', '1024x1024'] as const
type VideoSize = typeof VIDEO_SIZES[number]

const API_KEY_STORAGE_KEY = 'ai-media-studio:agnes-api-key'
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 60

type Mode = 'image' | 'video'

export default function AiMediaStudioPage() {
  const [mode, setMode] = useState<Mode>('image')
  const [prompt, setPrompt] = useState('')
  const [imageModel, setImageModel] = useState<ImageModel>('agnes-image-2.0-flash')
  const [imageSize, setImageSize] = useState<ImageSize>('1024x1024')
  const [videoSize, setVideoSize] = useState<VideoSize>('1280x720')
  const [referenceImage, setReferenceImage] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [resultVideo, setResultVideo] = useState<string | null>(null)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem(API_KEY_STORAGE_KEY)
    if (stored) setApiKey(stored)
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [])

  const saveApiKey = (value: string) => {
    setApiKey(value)
    if (value.trim()) window.localStorage.setItem(API_KEY_STORAGE_KEY, value.trim())
    else window.localStorage.removeItem(API_KEY_STORAGE_KEY)
  }

  const onPickReferenceImage = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setReferenceImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  const pollVideo = async (taskId: string, attempt: number) => {
    if (attempt > MAX_POLL_ATTEMPTS) {
      setError('Video generation timed out')
      setLoading(false)
      setStatusText(null)
      return
    }
    try {
      const params = new URLSearchParams({ taskId, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) })
      const res = await fetch(`/api/ai-media-studio/video?${params.toString()}`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setLoading(false)
        setStatusText(null)
        return
      }
      const { status, videoUrl } = data.result
      if (status === 'completed' && videoUrl) {
        setResultVideo(videoUrl)
        setLoading(false)
        setStatusText(null)
        return
      }
      if (status === 'failed') {
        setError('Video generation failed')
        setLoading(false)
        setStatusText(null)
        return
      }
      setStatusText(`Rendering... (${status})`)
      pollTimer.current = setTimeout(() => pollVideo(taskId, attempt + 1), POLL_INTERVAL_MS)
    } catch {
      setError('Network error while checking video status')
      setLoading(false)
      setStatusText(null)
    }
  }

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setResultImage(null)
    setResultVideo(null)
    setError(null)
    setStatusText(null)

    try {
      if (mode === 'image') {
        const res = await fetch('/api/ai-media-studio/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model: imageModel,
            size: imageSize,
            apiKey: apiKey.trim() || undefined,
            referenceImage: referenceImage || undefined,
          }),
        })
        const data = await res.json()
        if (data.error) setError(data.error)
        else setResultImage(data.result)
        setLoading(false)
      } else {
        const res = await fetch('/api/ai-media-studio/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            size: videoSize,
            apiKey: apiKey.trim() || undefined,
            referenceImage: referenceImage || undefined,
          }),
        })
        const data = await res.json()
        if (data.error) {
          setError(data.error)
          setLoading(false)
          return
        }
        setStatusText('Rendering...')
        pollVideo(data.result.taskId, 1)
      }
    } catch {
      setError('Network error — please try again')
      setLoading(false)
    }
  }

  return (
    <ToolShell name="AI Media Studio" icon="🎬" description="Generate images and videos via the Agnes AI API">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex gap-2">
          {(['image', 'video'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                mode === m
                  ? 'border-accent bg-accent/20 text-accent-soft'
                  : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-fg'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={mode === 'image' ? 'Describe the image you want...' : 'Describe the video you want...'}
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-surface p-4 text-sm text-fg outline-none placeholder-muted focus:border-accent"
        />

        {mode === 'image' && (
          <div className="flex flex-wrap gap-2">
            {IMAGE_MODELS.map(m => (
              <button
                key={m}
                onClick={() => setImageModel(m)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                  imageModel === m
                    ? 'border-accent bg-accent/20 text-accent-soft'
                    : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-fg'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(mode === 'image' ? IMAGE_SIZES : VIDEO_SIZES).map(s => (
            <button
              key={s}
              onClick={() => (mode === 'image' ? setImageSize(s as ImageSize) : setVideoSize(s as VideoSize))}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                (mode === 'image' ? imageSize : videoSize) === s
                  ? 'border-accent bg-accent/20 text-accent-soft'
                  : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-fg'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">Reference image (optional) — helps generate a more accurate result</p>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => onPickReferenceImage(e.target.files?.[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent/40 hover:text-fg"
            >
              Upload image
            </button>
            {referenceImage && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={referenceImage} alt="Reference" className="h-10 w-10 rounded-lg object-cover" />
                <button onClick={() => setReferenceImage(null)} className="text-xs text-muted hover:text-fg">
                  Remove
                </button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">Agnes AI API key override (optional) — leave blank to use the server default</p>
          <div className="flex gap-2">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => saveApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-fg outline-none placeholder-muted focus:border-accent"
            />
            <button
              onClick={() => setShowApiKey(v => !v)}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-fg"
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="w-full rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
        >
          {loading ? statusText || 'Generating...' : `Generate ${mode === 'image' ? 'Image' : 'Video'}`}
        </button>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {resultImage && (
          <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resultImage} alt={prompt} className="w-full rounded-lg" />
            <a href={resultImage} download className="block text-center text-xs text-muted hover:text-accent-soft">
              Download
            </a>
          </div>
        )}

        {resultVideo && (
          <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
            <video src={resultVideo} controls className="w-full rounded-lg" />
            <a href={resultVideo} download className="block text-center text-xs text-muted hover:text-accent-soft">
              Download
            </a>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
