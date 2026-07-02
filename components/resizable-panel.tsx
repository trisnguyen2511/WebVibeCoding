'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

interface ResizablePanelProps {
  left: React.ReactNode
  right: React.ReactNode
  defaultSplit?: number
  storageKey?: string
  minSize?: number
  className?: string
}

export function ResizablePanel({
  left,
  right,
  defaultSplit = 50,
  storageKey,
  minSize = 20,
  className = '',
}: ResizablePanelProps) {
  const [split, setSplit] = useState(defaultSplit)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!storageKey) return
    const stored = localStorage.getItem(`wv-resize-${storageKey}`)
    if (stored) setSplit(Number(stored))
  }, [storageKey])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      const clamped = Math.min(100 - minSize, Math.max(minSize, pct))
      setSplit(clamped)
      if (storageKey) localStorage.setItem(`wv-resize-${storageKey}`, String(clamped))
    }

    const handleMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [minSize, storageKey])

  return (
    <div ref={containerRef} className={`flex h-full ${className}`}>
      {/* Left panel */}
      <div style={{ width: `${split}%` }} className="min-w-0 overflow-hidden">
        <div className="h-full">
          {left}
        </div>
      </div>

      {/* Drag handle */}
      <div
        className="group relative z-10 flex w-3 flex-shrink-0 cursor-col-resize items-center justify-center"
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      >
        <div className="h-full w-px bg-border transition-colors duration-150 group-hover:bg-accent/70 group-active:bg-accent" />
        <div className="absolute flex flex-col gap-[3px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[3px] w-[3px] rounded-full bg-accent" />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: `${100 - split}%` }} className="min-w-0 overflow-hidden">
        <div className="h-full">
          {right}
        </div>
      </div>
    </div>
  )
}
