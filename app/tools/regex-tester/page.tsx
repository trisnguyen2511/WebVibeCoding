'use client'
import { useState, useMemo } from 'react'
import { ToolShell } from '@/components/tool-shell'

const FLAGS = ['g', 'i', 'm', 's'] as const
type Flag = typeof FLAGS[number]

const CHEATSHEET = [
  { pattern: '.', desc: 'Any character except newline' },
  { pattern: '\\d', desc: 'Digit [0-9]' },
  { pattern: '\\w', desc: 'Word char [a-zA-Z0-9_]' },
  { pattern: '\\s', desc: 'Whitespace' },
  { pattern: '^', desc: 'Start of string/line' },
  { pattern: '$', desc: 'End of string/line' },
  { pattern: '*', desc: '0 or more' },
  { pattern: '+', desc: '1 or more' },
  { pattern: '?', desc: '0 or 1 (optional)' },
  { pattern: '{n,m}', desc: 'Between n and m times' },
  { pattern: '(abc)', desc: 'Capture group' },
  { pattern: '(?:abc)', desc: 'Non-capture group' },
  { pattern: 'a|b', desc: 'a or b' },
  { pattern: '[abc]', desc: 'Character class' },
  { pattern: '[^abc]', desc: 'Negated class' },
]

export default function RegexTesterPage() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState<Set<Flag>>(new Set<Flag>(['g']))
  const [testStr, setTestStr] = useState('')
  const [showCheat, setShowCheat] = useState(false)

  const toggleFlag = (f: Flag) => {
    setFlags((prev) => {
      const next = new Set(prev)
      next.has(f) ? next.delete(f) : next.add(f)
      return next
    })
  }

  const { highlighted, matches, error } = useMemo(() => {
    if (!pattern) return { highlighted: testStr, matches: [], error: null }
    try {
      const re = new RegExp(pattern, Array.from(flags).join(''))
      const allMatches: { value: string; index: number; groups: string[] }[] = []

      if (flags.has('g')) {
        let m: RegExpExecArray | null
        const reCopy = new RegExp(pattern, Array.from(flags).join(''))
        while ((m = reCopy.exec(testStr)) !== null) {
          allMatches.push({ value: m[0], index: m.index, groups: m.slice(1) })
          if (m[0].length === 0) reCopy.lastIndex++
        }
      } else {
        const m = re.exec(testStr)
        if (m) allMatches.push({ value: m[0], index: m.index, groups: m.slice(1) })
      }

      // Build highlighted HTML
      let html = ''
      let lastIdx = 0
      for (const match of allMatches) {
        html += escapeHtml(testStr.slice(lastIdx, match.index))
        html += `<mark class="bg-accent/40 text-white rounded px-0.5">${escapeHtml(match.value)}</mark>`
        lastIdx = match.index + match.value.length
      }
      html += escapeHtml(testStr.slice(lastIdx))

      return { highlighted: html, matches: allMatches, error: null }
    } catch (e) {
      return { highlighted: escapeHtml(testStr), matches: [], error: (e as Error).message }
    }
  }, [pattern, flags, testStr])

  return (
    <ToolShell name="Regex Tester" icon=".*" description="Test regular expressions with live match highlighting">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Pattern row */}
        <div className="flex gap-2 items-start">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted text-sm select-none">/</span>
            <input value={pattern} onChange={(e) => setPattern(e.target.value)}
              placeholder="pattern"
              className={`w-full rounded-xl border bg-surface py-2.5 pl-7 pr-4 font-mono text-sm text-fg outline-none transition-colors ${error ? 'border-red-500' : 'border-border focus:border-accent'}`} />
          </div>
          <div className="flex gap-1">
            {FLAGS.map((f) => (
              <button key={f} onClick={() => toggleFlag(f)}
                className={`h-10 w-10 rounded-xl border font-mono text-sm font-bold transition-colors ${flags.has(f) ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-surface text-muted hover:text-fg'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="font-mono text-xs text-red-400">{error}</p>}

        {/* Test string */}
        <textarea value={testStr} onChange={(e) => setTestStr(e.target.value)} rows={5}
          placeholder="Enter test string..."
          className="w-full resize-none rounded-xl border border-border bg-surface p-4 font-mono text-sm text-fg outline-none placeholder-muted focus:border-accent" />

        {/* Highlighted output */}
        {testStr && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-2 text-xs uppercase tracking-widest text-muted">Preview</p>
            <p className="font-mono text-sm leading-relaxed text-fg whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: highlighted }} />
          </div>
        )}

        {/* Match list */}
        {matches.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-3 text-xs uppercase tracking-widest text-muted">
              {matches.length} match{matches.length !== 1 ? 'es' : ''}
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {matches.map((m, i) => (
                <div key={i} className="flex items-start gap-3 font-mono text-xs">
                  <span className="text-muted w-6 shrink-0">{i + 1}</span>
                  <span className="text-accent-soft bg-accent/10 rounded px-2 py-0.5">{m.value || '(empty)'}</span>
                  <span className="text-muted">@ {m.index}</span>
                  {m.groups.length > 0 && (
                    <span className="text-muted">groups: [{m.groups.map(g => `"${g ?? 'undefined'}"`).join(', ')}]</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cheatsheet */}
        <button onClick={() => setShowCheat((v) => !v)}
          className="text-xs text-muted hover:text-fg transition-colors">
          {showCheat ? '▲ Hide' : '▼ Show'} regex cheatsheet
        </button>
        {showCheat && (
          <div className="rounded-xl border border-border bg-surface p-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
            {CHEATSHEET.map(({ pattern: p, desc }) => (
              <div key={p} className="flex gap-3 text-xs">
                <code className="font-mono text-accent-soft w-20 shrink-0">{p}</code>
                <span className="text-muted">{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ToolShell>
  )
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
