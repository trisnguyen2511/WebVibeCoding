'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { marked } from 'marked'
import { ToolShell } from '@/components/tool-shell'

const LS_KEY = 'wv-markdown-content'
const DEFAULT = `# Welcome to Markdown Editor

Start writing here. Your notes are **auto-saved** in the browser.

## Features
- Live preview
- Auto-save to localStorage
- Export as .md file

\`\`\`js
console.log('Hello, world!')
\`\`\`

> Tip: Use the toolbar buttons to insert formatting.
`

const TOOLBAR = [
  { label: 'B', title: 'Bold', wrap: ['**', '**'] },
  { label: 'I', title: 'Italic', wrap: ['_', '_'] },
  { label: 'H2', title: 'Heading', prefix: '## ' },
  { label: '`', title: 'Inline code', wrap: ['`', '`'] },
  { label: '```', title: 'Code block', wrap: ['```\n', '\n```'] },
  { label: '—', title: 'Horizontal rule', prefix: '\n---\n' },
  { label: '>', title: 'Blockquote', prefix: '> ' },
  { label: '[ ]', title: 'Task', prefix: '- [ ] ' },
]

export default function MarkdownEditorPage() {
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState('')
  const [view, setView] = useState<'split' | 'write' | 'preview'>('split')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    setContent(saved ?? DEFAULT)
  }, [])

  // Debounced save + live preview
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(LS_KEY, content)
    }, 500)
    setPreview(marked(content) as string)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [content])

  const insertAt = useCallback((wrap?: [string, string], prefix?: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = content.slice(start, end)

    let newContent = content
    let newCursor = start

    if (wrap) {
      const [before, after] = wrap
      newContent = content.slice(0, start) + before + selected + after + content.slice(end)
      newCursor = start + before.length + selected.length
    } else if (prefix) {
      newContent = content.slice(0, start) + prefix + content.slice(start)
      newCursor = start + prefix.length
    }

    setContent(newContent)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(newCursor, newCursor)
    }, 0)
  }, [content])

  const exportMd = () => {
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'notes.md'; a.click()
    URL.revokeObjectURL(url)
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0

  return (
    <ToolShell name="Markdown Editor" icon="📝" description="Write Markdown with live preview and auto-save">
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {TOOLBAR.map((item) => (
            <button key={item.label} title={item.title}
              onClick={() => insertAt(
                item.wrap as [string, string] | undefined,
                item.prefix
              )}
              className="rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-xs text-muted hover:text-white transition-colors">
              {item.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <span className="text-xs text-muted self-center">{wordCount} words · auto-saved</span>
            {(['split', 'write', 'preview'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${view === v ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-surface text-muted hover:text-white'}`}>
                {v}
              </button>
            ))}
            <button onClick={exportMd}
              className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:text-white transition-colors">
              Export .md
            </button>
          </div>
        </div>

        {/* Editor / Preview */}
        <div className={`gap-4 ${view === 'split' ? 'grid grid-cols-2' : 'block'}`} style={{ minHeight: '60vh' }}>
          {(view === 'split' || view === 'write') && (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full rounded-xl border border-border bg-surface p-4 font-mono text-sm text-white outline-none resize-none placeholder-muted focus:border-accent"
              style={{ minHeight: '60vh' }}
            />
          )}
          {(view === 'split' || view === 'preview') && (
            <div
              className="rounded-xl border border-border bg-surface p-6 overflow-y-auto prose prose-invert prose-sm max-w-none"
              style={{ minHeight: '60vh' }}
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          )}
        </div>
      </div>
    </ToolShell>
  )
}
