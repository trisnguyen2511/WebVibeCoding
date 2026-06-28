# WebVibeCoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal multi-tool web app (Next.js 14 + Vercel) with a generic plugin architecture, dark precision UI, and WebRTC phone-as-gamepad feature.

**Architecture:** Each tool lives in `app/tools/[slug]/page.tsx`, wrapped by `<ToolShell>`. The homepage reads from `lib/tools-registry.ts` and renders all tools automatically. WebRTC game controller uses Supabase Realtime only for the P2P handshake, then runs entirely peer-to-peer.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase Realtime, WebRTC API, Jest + React Testing Library

## Global Constraints

- TypeScript strict — `any` is forbidden in all files
- Every tool page must be wrapped in `<ToolShell name="..." icon="...">`
- All data/code/hash output must use class `font-mono` (JetBrains Mono)
- All layouts must work at 390px width minimum (mobile-first)
- Dark mode is default and non-negotiable — design all UI dark-first
- Accent color is `#7C3AED` only — do not introduce new accent colors
- API routes must return `{ result: T | null, error: string | null }` shape always
- Git commit format: `feat:`, `fix:`, `style:`, `refactor:`, `chore:`

---

## File Map

```
WebVibeCoding/
├── CLAUDE.md                               [exists]
├── docs/superpowers/specs/                 [exists]
├── app/
│   ├── layout.tsx                          Task 1 — global fonts + theme
│   ├── globals.css                         Task 1 — CSS variables
│   ├── page.tsx                            Task 5 — homepage tool grid
│   └── tools/
│       ├── calculator/page.tsx             Task 7
│       ├── color-picker/page.tsx           Task 8
│       ├── hash/page.tsx                   Task 9
│       ├── decrypt/page.tsx                Task 10
│       └── game-controller/page.tsx        Task 13
├── app/api/
│   ├── hash/route.ts                       Task 9
│   └── encrypt/route.ts                    Task 10
├── components/
│   ├── tool-shell.tsx                      Task 4
│   └── command-palette.tsx                 Task 6
├── hooks/
│   └── use-game-controller.ts              Task 12
├── lib/
│   ├── tools-registry.ts                   Task 3
│   ├── calculator.ts                       Task 7
│   ├── color-utils.ts                      Task 8
│   ├── inf-parser.ts                       Task 11
│   └── webrtc.ts                           Task 12
├── public/
│   └── controller-presets/
│       ├── nes.inf                         Task 13
│       └── snes.inf                        Task 13
└── tailwind.config.ts                      Task 1
```

---

### Task 1: Project Initialization & Design System

**Files:**
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `tailwind.config.ts` (replaces generated)

**Interfaces:**
- Produces: Tailwind classes `bg-background`, `bg-surface`, `border-border`, `text-accent`, `text-accent-soft`, `text-muted`, `font-display`, `font-sans`, `font-mono`

- [ ] **Step 1: Bootstrap Next.js 14**

Run in `C:\Dev\Project\WebVibeCoding`:
```powershell
npx create-next-app@14 . --typescript --tailwind --eslint --app --import-alias "@/*"
```
When prompted: TypeScript=Yes, ESLint=Yes, Tailwind=Yes, src/ dir=No, App Router=Yes, import alias=`@/*`

Expected output: `Success! Created WebVibeCoding`

- [ ] **Step 2: Install dependencies**

```powershell
npm install @supabase/supabase-js qrcode.react next-themes
npm install -D jest @types/jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom ts-jest
```

- [ ] **Step 3: Configure Jest**

Create `jest.config.ts`:
```ts
import type { Config } from 'jest'
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
}
export default config
```

Create `jest.setup.ts`:
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Configure Tailwind with design system**

Replace `tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#08080E',
        surface:    '#0F0F1A',
        border:     '#1A1A2E',
        accent: {
          DEFAULT: '#7C3AED',
          soft:    '#A78BFA',
        },
        muted: '#52525B',
      },
      fontFamily: {
        display: ['var(--font-space-grotesk)', 'sans-serif'],
        sans:    ['var(--font-inter)', 'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 5: Set up global CSS variables**

Replace `app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * { @apply border-border; }
  body {
    @apply bg-background text-white font-sans;
    -webkit-font-smoothing: antialiased;
  }
}
```

- [ ] **Step 6: Set up fonts in layout.tsx**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' })

export const metadata: Metadata = { title: 'WebVibe Tools', description: 'Personal toolkit' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 7: Install shadcn/ui**

```powershell
npx shadcn@latest init
```
When prompted: Style=Default, Base color=Slate, CSS variables=Yes

Then add components:
```powershell
npx shadcn@latest add button input label card badge separator
```

- [ ] **Step 8: Verify dev server starts**

```powershell
npm run dev
```
Expected: `▲ Next.js 14.x.x — ready on http://localhost:3000`
Open browser, verify page loads without errors. Stop server.

- [ ] **Step 9: Commit**

```powershell
git add -A
git commit -m "chore: initialize Next.js 14 with design system and shadcn/ui"
```

---

### Task 2: GitHub Repository & Vercel Connection

**Files:** No code files — infrastructure setup only.

**Interfaces:**
- Produces: GitHub remote `origin`, Vercel auto-deploy on push to `main`

- [ ] **Step 1: Create GitHub repo**

On github.com, create a new repository named `WebVibeCoding` (private). Do not initialize with README.

- [ ] **Step 2: Push to GitHub**

```powershell
git remote add origin https://github.com/<your-username>/WebVibeCoding.git
git branch -M main
git push -u origin main
```

Expected: Repository visible on github.com

- [ ] **Step 3: Create dev branch**

```powershell
git checkout -b dev
git push -u origin dev
```

- [ ] **Step 4: Connect Vercel**

1. Go to vercel.com → Add New Project → Import `WebVibeCoding` from GitHub
2. Framework: Next.js (auto-detected)
3. Leave all settings default → Deploy
4. Wait for first deploy to complete (~60s)

Expected: Green deploy, preview URL like `webvibecoding.vercel.app`

- [ ] **Step 5: Verify auto-deploy**

Make a trivial change (add a comment to `app/layout.tsx`), push to `main`:
```powershell
git add app/layout.tsx
git commit -m "chore: verify Vercel auto-deploy"
git push
```
Expected: Vercel dashboard shows new deploy triggered automatically.

---

### Task 3: Tool Registry & Types

**Files:**
- Create: `lib/tools-registry.ts`
- Create: `__tests__/lib/tools-registry.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ToolCategory = 'utility' | 'crypto' | 'game' | 'media'
  interface Tool { name: string; slug: string; icon: string; description: string; category: ToolCategory }
  const tools: Tool[]
  ```

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/tools-registry.test.ts`:
```ts
import { tools } from '@/lib/tools-registry'

describe('tools-registry', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThan(0)
  })

  it('each tool has required fields', () => {
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string')
      expect(typeof tool.slug).toBe('string')
      expect(typeof tool.icon).toBe('string')
      expect(typeof tool.description).toBe('string')
      expect(['utility', 'crypto', 'game', 'media']).toContain(tool.category)
    }
  })

  it('slug matches kebab-case pattern', () => {
    for (const tool of tools) {
      expect(tool.slug).toMatch(/^[a-z]+(-[a-z]+)*$/)
    }
  })

  it('slugs are unique', () => {
    const slugs = tools.map(t => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest __tests__/lib/tools-registry.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/tools-registry'`

- [ ] **Step 3: Implement tools-registry**

Create `lib/tools-registry.ts`:
```ts
export type ToolCategory = 'utility' | 'crypto' | 'game' | 'media'

export interface Tool {
  name: string
  slug: string
  icon: string
  description: string
  category: ToolCategory
}

export const tools: Tool[] = [
  {
    name: 'Calculator',
    slug: 'calculator',
    icon: '🔢',
    description: 'Basic and scientific calculations',
    category: 'utility',
  },
  {
    name: 'Color Picker',
    slug: 'color-picker',
    icon: '🎨',
    description: 'Pick colors and convert between HEX, RGB, HSL',
    category: 'utility',
  },
  {
    name: 'Hash Generator',
    slug: 'hash',
    icon: '#',
    description: 'Generate MD5, SHA1, SHA256, SHA512 hashes',
    category: 'crypto',
  },
  {
    name: 'Encrypt / Decrypt',
    slug: 'decrypt',
    icon: '🔓',
    description: 'AES-256 text encryption and decryption',
    category: 'crypto',
  },
  {
    name: 'Game Controller',
    slug: 'game-controller',
    icon: '🎮',
    description: 'Use your phone as a wireless gamepad',
    category: 'game',
  },
]
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest __tests__/lib/tools-registry.test.ts
```
Expected: PASS — 4 tests passed

- [ ] **Step 5: Commit**

```powershell
git add lib/tools-registry.ts __tests__/lib/tools-registry.test.ts
git commit -m "feat: add tool registry with initial 5 tools"
```

---

### Task 4: ToolShell Component

**Files:**
- Create: `components/tool-shell.tsx`
- Create: `__tests__/components/tool-shell.test.tsx`

**Interfaces:**
- Consumes: Nothing from prior tasks
- Produces:
  ```tsx
  interface ToolShellProps {
    name: string
    icon: string
    description?: string
    children: React.ReactNode
  }
  export function ToolShell(props: ToolShellProps): JSX.Element
  ```

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/tool-shell.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { ToolShell } from '@/components/tool-shell'

describe('ToolShell', () => {
  it('renders tool name and icon', () => {
    render(<ToolShell name="Test Tool" icon="🔧"><div>content</div></ToolShell>)
    expect(screen.getByText('Test Tool')).toBeInTheDocument()
    expect(screen.getByText('🔧')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(<ToolShell name="T" icon="x"><span data-testid="child">hi</span></ToolShell>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders a back link to homepage', () => {
    render(<ToolShell name="T" icon="x"><div /></ToolShell>)
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/')
  })

  it('renders optional description when provided', () => {
    render(<ToolShell name="T" icon="x" description="A description"><div /></ToolShell>)
    expect(screen.getByText('A description')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest __tests__/components/tool-shell.test.tsx
```
Expected: FAIL — `Cannot find module '@/components/tool-shell'`

- [ ] **Step 3: Implement ToolShell**

Create `components/tool-shell.tsx`:
```tsx
'use client'
import Link from 'next/link'

interface ToolShellProps {
  name: string
  icon: string
  description?: string
  children: React.ReactNode
}

export function ToolShell({ name, icon, description, children }: ToolShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <Link
            href="/"
            aria-label="Back to tools"
            className="text-muted transition-colors hover:text-white"
          >
            ← Back
          </Link>
          <span className="text-xl">{icon}</span>
          <div>
            <h1 className="font-display text-lg font-semibold text-white">{name}</h1>
            {description && (
              <p className="text-xs text-muted">{description}</p>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest __tests__/components/tool-shell.test.tsx
```
Expected: PASS — 4 tests passed

- [ ] **Step 5: Commit**

```powershell
git add components/tool-shell.tsx __tests__/components/tool-shell.test.tsx
git commit -m "feat: add ToolShell component"
```

---

### Task 5: Homepage Tool Grid

**Files:**
- Modify: `app/page.tsx` (replace generated content)

**Interfaces:**
- Consumes: `tools: Tool[]` from `lib/tools-registry.ts`
- Produces: Homepage at `/` showing all registered tools as cards

- [ ] **Step 1: Implement homepage**

Replace `app/page.tsx`:
```tsx
import Link from 'next/link'
import { tools } from '@/lib/tools-registry'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-display text-xl font-bold text-white">
            WebVibe
          </span>
          <span className="text-sm text-muted">
            Press <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs text-white">/</kbd> to search
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="mb-6 font-display text-sm font-medium uppercase tracking-widest text-muted">
          Your Tools
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 transition-all duration-100 hover:-translate-y-0.5 hover:border-accent/40"
            >
              <span className="text-2xl">{tool.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-white">{tool.name}</p>
                <p className="mt-0.5 text-sm text-muted">{tool.description}</p>
              </div>
              <span className="mt-0.5 text-muted transition-colors group-hover:text-accent-soft">
                →
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Start dev server and verify visually**

```powershell
npm run dev
```
Open `http://localhost:3000`. Verify:
- 5 tool cards render in a grid
- Cards are dark with violet border on hover
- Responsive: resize to 390px width, cards go to 1 column
- Press `/` — nothing happens yet (command palette in Task 6)

Stop server.

- [ ] **Step 3: Commit**

```powershell
git add app/page.tsx
git commit -m "feat: add homepage tool grid"
```

---

### Task 6: Command Palette

**Files:**
- Create: `components/command-palette.tsx`
- Modify: `app/layout.tsx` (add CommandPalette)
- Modify: `app/page.tsx` (remove the kbd hint, it will come from layout)

**Interfaces:**
- Consumes: `tools: Tool[]` from `lib/tools-registry.ts`
- Produces: Global `"/"` shortcut → frosted overlay → filter tools → navigate on Enter/click

- [ ] **Step 1: Implement command palette**

Create `components/command-palette.tsx`:
```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { tools } from '@/lib/tools-registry'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const filtered = tools.filter(t =>
    t.name.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as Element).tagName)) {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const navigate = (slug: string) => {
    router.push(`/tools/${slug}`)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface/90 shadow-2xl backdrop-blur-md"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'palette-in 150ms ease' }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search tools..."
          className="w-full bg-transparent px-5 py-4 font-sans text-white placeholder-muted outline-none"
        />
        <div className="border-t border-border">
          {filtered.map(tool => (
            <button
              key={tool.slug}
              onClick={() => navigate(tool.slug)}
              className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/10"
            >
              <span>{tool.icon}</span>
              <span className="font-display text-white">{tool.name}</span>
              <span className="ml-auto text-xs text-muted">{tool.description}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted">No tools found.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add animation keyframe to globals.css**

Append to `app/globals.css`:
```css
@keyframes palette-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
```

- [ ] **Step 3: Add CommandPalette to layout**

In `app/layout.tsx`, add CommandPalette inside the body:
```tsx
import { CommandPalette } from '@/components/command-palette'

// inside <body>:
<CommandPalette />
{children}
```

- [ ] **Step 4: Verify in browser**

```powershell
npm run dev
```
Open `http://localhost:3000`. Verify:
- Press `/` → palette opens with frosted glass overlay
- Type "calc" → only Calculator shows
- Click Calculator card → navigates to `/tools/calculator`
- Press Escape → palette closes
- Clicking outside palette → palette closes

Stop server.

- [ ] **Step 5: Commit**

```powershell
git add components/command-palette.tsx app/layout.tsx app/globals.css
git commit -m "feat: add command palette with '/' shortcut"
```

---

### Task 7: Calculator Tool

**Files:**
- Create: `lib/calculator.ts`
- Create: `__tests__/lib/calculator.test.ts`
- Create: `app/tools/calculator/page.tsx`

**Interfaces:**
- Consumes: `ToolShell` from `components/tool-shell.tsx`
- Produces:
  ```ts
  // lib/calculator.ts
  function calculate(a: number, b: number, op: string): number | null
  ```

- [ ] **Step 1: Write failing tests for calculator logic**

Create `__tests__/lib/calculator.test.ts`:
```ts
import { calculate } from '@/lib/calculator'

describe('calculate', () => {
  it('adds', () => expect(calculate(2, 3, '+')).toBe(5))
  it('subtracts', () => expect(calculate(10, 4, '-')).toBe(6))
  it('multiplies', () => expect(calculate(3, 7, '*')).toBe(21))
  it('divides', () => expect(calculate(10, 2, '/')).toBe(5))
  it('returns null for division by zero', () => expect(calculate(5, 0, '/')).toBeNull())
  it('returns null for unknown operator', () => expect(calculate(1, 2, '%')).toBeNull())
  it('handles negative numbers', () => expect(calculate(-3, -2, '*')).toBe(6))
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest __tests__/lib/calculator.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/calculator'`

- [ ] **Step 3: Implement calculator logic**

Create `lib/calculator.ts`:
```ts
export function calculate(a: number, b: number, op: string): number | null {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return b === 0 ? null : a / b
    default:  return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest __tests__/lib/calculator.test.ts
```
Expected: PASS — 7 tests passed

- [ ] **Step 5: Implement calculator UI**

Create `app/tools/calculator/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { calculate } from '@/lib/calculator'

type Op = '+' | '-' | '*' | '/'

export default function CalculatorPage() {
  const [display, setDisplay] = useState('0')
  const [prevValue, setPrevValue] = useState<number | null>(null)
  const [op, setOp] = useState<Op | null>(null)
  const [shouldReset, setShouldReset] = useState(false)

  const appendDigit = (d: string) => {
    if (shouldReset) {
      setDisplay(d === '.' ? '0.' : d)
      setShouldReset(false)
    } else {
      if (d === '.' && display.includes('.')) return
      setDisplay(display === '0' && d !== '.' ? d : display + d)
    }
  }

  const setOperator = (nextOp: Op) => {
    const current = parseFloat(display)
    if (prevValue !== null && op && !shouldReset) {
      const result = calculate(prevValue, current, op)
      setDisplay(result === null ? 'Error' : String(result))
      setPrevValue(result)
    } else {
      setPrevValue(current)
    }
    setOp(nextOp)
    setShouldReset(true)
  }

  const equals = () => {
    if (prevValue === null || op === null) return
    const result = calculate(prevValue, parseFloat(display), op)
    setDisplay(result === null ? 'Error' : String(result))
    setPrevValue(null)
    setOp(null)
    setShouldReset(true)
  }

  const clear = () => {
    setDisplay('0')
    setPrevValue(null)
    setOp(null)
    setShouldReset(false)
  }

  const btn = (label: string, onClick: () => void, variant?: 'accent' | 'op' | 'eq') => {
    const base = 'flex h-14 w-full items-center justify-center rounded-xl font-display text-lg font-medium transition-colors active:scale-95'
    const styles = {
      accent: 'bg-surface text-muted hover:bg-border hover:text-white',
      op:     'bg-accent/20 text-accent-soft hover:bg-accent/30',
      eq:     'bg-accent text-white hover:bg-accent/80',
      default:'bg-surface text-white hover:bg-border',
    }
    return (
      <button key={label} onClick={onClick} className={`${base} ${styles[variant ?? 'default']}`}>
        {label}
      </button>
    )
  }

  return (
    <ToolShell name="Calculator" icon="🔢">
      <div className="mx-auto max-w-xs">
        <div className="mb-3 rounded-xl border border-border bg-surface p-4 text-right">
          <p className="text-xs text-muted">{prevValue !== null ? `${prevValue} ${op ?? ''}` : ' '}</p>
          <p className="font-mono text-3xl font-light text-white truncate">{display}</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {btn('C', clear, 'accent')}
          {btn('+/-', () => setDisplay(String(parseFloat(display) * -1)), 'accent')}
          {btn('%', () => setDisplay(String(parseFloat(display) / 100)), 'accent')}
          {btn('÷', () => setOperator('/'), 'op')}
          {btn('7', () => appendDigit('7'))}
          {btn('8', () => appendDigit('8'))}
          {btn('9', () => appendDigit('9'))}
          {btn('×', () => setOperator('*'), 'op')}
          {btn('4', () => appendDigit('4'))}
          {btn('5', () => appendDigit('5'))}
          {btn('6', () => appendDigit('6'))}
          {btn('−', () => setOperator('-'), 'op')}
          {btn('1', () => appendDigit('1'))}
          {btn('2', () => appendDigit('2'))}
          {btn('3', () => appendDigit('3'))}
          {btn('+', () => setOperator('+'), 'op')}
          <div className="col-span-2">
            {btn('0', () => appendDigit('0'))}
          </div>
          {btn('.', () => appendDigit('.'))}
          {btn('=', equals, 'eq')}
        </div>
      </div>
    </ToolShell>
  )
}
```

- [ ] **Step 6: Verify in browser**

```powershell
npm run dev
```
Navigate to `http://localhost:3000/tools/calculator`. Verify:
- Calculator renders with dark theme
- `7 + 3 =` shows `10`
- `10 / 0` shows `Error`
- `C` clears display to `0`
- Layout works at 390px width

Stop server.

- [ ] **Step 7: Commit**

```powershell
git add lib/calculator.ts __tests__/lib/calculator.test.ts app/tools/calculator/page.tsx
git commit -m "feat: add calculator tool"
```

---

### Task 8: Color Picker Tool

**Files:**
- Create: `lib/color-utils.ts`
- Create: `__tests__/lib/color-utils.test.ts`
- Create: `app/tools/color-picker/page.tsx`

**Interfaces:**
- Produces:
  ```ts
  function hexToRgb(hex: string): { r: number; g: number; b: number } | null
  function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number }
  function isValidHex(hex: string): boolean
  ```

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/color-utils.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest __tests__/lib/color-utils.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement color-utils**

Create `lib/color-utils.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest __tests__/lib/color-utils.test.ts
```
Expected: PASS

- [ ] **Step 5: Implement color picker UI**

Create `app/tools/color-picker/page.tsx`:
```tsx
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
        <span className="font-mono text-sm text-white">{value}</span>
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
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-white outline-none focus:border-accent"
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
```

- [ ] **Step 6: Verify in browser**

Navigate to `http://localhost:3000/tools/color-picker`. Verify:
- Color swatch updates as you type a hex value
- Native color picker input updates hex field
- RGB and HSL rows update in real time
- Copy button copies correct value and shows ✓ briefly

- [ ] **Step 7: Commit**

```powershell
git add lib/color-utils.ts __tests__/lib/color-utils.test.ts app/tools/color-picker/page.tsx
git commit -m "feat: add color picker tool"
```

---

### Task 9: Hash Generator

**Files:**
- Create: `app/api/hash/route.ts`
- Create: `__tests__/api/hash.test.ts`
- Create: `app/tools/hash/page.tsx`

**Interfaces:**
- Produces API: `POST /api/hash` — body: `{ text: string, algorithm: 'md5'|'sha1'|'sha256'|'sha512' }` → `{ result: string | null, error: string | null }`

- [ ] **Step 1: Write failing API tests**

Create `__tests__/api/hash.test.ts`:
```ts
import { POST } from '@/app/api/hash/route'

const makeReq = (body: object) => new Request('http://localhost/api/hash', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/hash', () => {
  it('returns sha256 of "hello"', async () => {
    const res = await POST(makeReq({ text: 'hello', algorithm: 'sha256' }) as any)
    const data = await res.json()
    expect(data.error).toBeNull()
    expect(data.result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('returns sha1 of "hello"', async () => {
    const res = await POST(makeReq({ text: 'hello', algorithm: 'sha1' }) as any)
    const data = await res.json()
    expect(data.result).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
  })

  it('returns 400 for missing text', async () => {
    const res = await POST(makeReq({ algorithm: 'sha256' }) as any)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('text is required')
    expect(data.result).toBeNull()
  })

  it('returns 400 for invalid algorithm', async () => {
    const res = await POST(makeReq({ text: 'hello', algorithm: 'md2' }) as any)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid algorithm')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest __tests__/api/hash.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement API route**

Create `app/api/hash/route.ts`:
```ts
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

const VALID_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'] as const
type Algorithm = typeof VALID_ALGORITHMS[number]

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { text, algorithm } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ result: null, error: 'text is required' }, { status: 400 })
  }
  if (!VALID_ALGORITHMS.includes(algorithm as Algorithm)) {
    return NextResponse.json({ result: null, error: 'invalid algorithm' }, { status: 400 })
  }

  const result = createHash(algorithm).update(text, 'utf8').digest('hex')
  return NextResponse.json({ result, error: null })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest __tests__/api/hash.test.ts
```
Expected: PASS — 4 tests passed

- [ ] **Step 5: Implement hash UI**

Create `app/tools/hash/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'

const ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'] as const
type Algorithm = typeof ALGORITHMS[number]

export default function HashPage() {
  const [text, setText] = useState('')
  const [algorithm, setAlgorithm] = useState<Algorithm>('sha256')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    if (!text.trim()) return
    setLoading(true)
    const res = await fetch('/api/hash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, algorithm }),
    })
    const data = await res.json()
    setResult(data.result)
    setLoading(false)
  }

  const copy = () => {
    if (!result) return
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <ToolShell name="Hash Generator" icon="#">
      <div className="mx-auto max-w-2xl space-y-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Enter text to hash..."
          rows={4}
          className="w-full resize-none rounded-xl border border-border bg-surface p-4 font-mono text-sm text-white outline-none placeholder-muted focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          {ALGORITHMS.map(alg => (
            <button
              key={alg}
              onClick={() => setAlgorithm(alg)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                algorithm === alg
                  ? 'border-accent bg-accent/20 text-accent-soft'
                  : 'border-border bg-surface text-muted hover:border-accent/40 hover:text-white'
              }`}
            >
              {alg.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={generate}
          disabled={loading || !text.trim()}
          className="w-full rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
        >
          {loading ? 'Generating...' : 'Generate Hash'}
        </button>
        {result && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4">
            <p className="break-all font-mono text-sm text-white">{result}</p>
            <button onClick={copy} className="shrink-0 text-xs text-muted hover:text-accent-soft">
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
```

- [ ] **Step 6: Verify in browser**

Navigate to `http://localhost:3000/tools/hash`. Verify:
- Enter text, select SHA256, click Generate → shows 64-char hex hash
- Switch algorithm → result clears until Generate pressed again
- Copy button copies hash to clipboard
- Empty input → button is disabled

- [ ] **Step 7: Commit**

```powershell
git add app/api/hash/route.ts __tests__/api/hash.test.ts app/tools/hash/page.tsx
git commit -m "feat: add hash generator tool"
```

---

### Task 10: Encrypt / Decrypt Tool

**Files:**
- Create: `app/api/encrypt/route.ts`
- Create: `__tests__/api/encrypt.test.ts`
- Create: `app/tools/decrypt/page.tsx`

**Interfaces:**
- Produces API: `POST /api/encrypt`
  - Encrypt: `{ action: 'encrypt', text: string, password: string }` → `{ result: string | null, error: string | null }`
  - Decrypt: `{ action: 'decrypt', text: string, password: string }` → `{ result: string | null, error: string | null }`
  - `result` on encrypt = `iv:encrypted` (hex), on decrypt = plaintext

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/encrypt.test.ts`:
```ts
import { POST } from '@/app/api/encrypt/route'

const makeReq = (body: object) => new Request('http://localhost/api/encrypt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/encrypt', () => {
  it('encrypts and decrypts round-trip', async () => {
    const encRes = await POST(makeReq({ action: 'encrypt', text: 'hello world', password: 'secret123' }) as any)
    const encData = await encRes.json()
    expect(encData.error).toBeNull()
    expect(typeof encData.result).toBe('string')

    const decRes = await POST(makeReq({ action: 'decrypt', text: encData.result, password: 'secret123' }) as any)
    const decData = await decRes.json()
    expect(decData.error).toBeNull()
    expect(decData.result).toBe('hello world')
  })

  it('returns error for wrong password on decrypt', async () => {
    const encRes = await POST(makeReq({ action: 'encrypt', text: 'secret', password: 'correct' }) as any)
    const { result } = await encRes.json()

    const decRes = await POST(makeReq({ action: 'decrypt', text: result, password: 'wrong' }) as any)
    const data = await decRes.json()
    expect(data.result).toBeNull()
    expect(data.error).toBe('decryption failed — wrong password or corrupted data')
  })

  it('returns 400 for missing text', async () => {
    const res = await POST(makeReq({ action: 'encrypt', password: 'x' }) as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing password', async () => {
    const res = await POST(makeReq({ action: 'encrypt', text: 'x' }) as any)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest __tests__/api/encrypt.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement API route**

Create `app/api/encrypt/route.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

const ALGORITHM = 'aes-256-cbc'
const SALT = 'webvibe-static-salt'

function deriveKey(password: string): Buffer {
  return scryptSync(password, SALT, 32)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, text, password } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ result: null, error: 'text is required' }, { status: 400 })
  }
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ result: null, error: 'password is required' }, { status: 400 })
  }

  const key = deriveKey(password)

  if (action === 'encrypt') {
    const iv = randomBytes(16)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    const result = `${iv.toString('hex')}:${encrypted.toString('hex')}`
    return NextResponse.json({ result, error: null })
  }

  if (action === 'decrypt') {
    try {
      const [ivHex, encHex] = text.split(':')
      if (!ivHex || !encHex) throw new Error('invalid format')
      const iv = Buffer.from(ivHex, 'hex')
      const encrypted = Buffer.from(encHex, 'hex')
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      const result = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
      return NextResponse.json({ result, error: null })
    } catch {
      return NextResponse.json({ result: null, error: 'decryption failed — wrong password or corrupted data' })
    }
  }

  return NextResponse.json({ result: null, error: 'action must be encrypt or decrypt' }, { status: 400 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest __tests__/api/encrypt.test.ts
```
Expected: PASS — 4 tests passed

- [ ] **Step 5: Implement encrypt/decrypt UI**

Create `app/tools/decrypt/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'

export default function DecryptPage() {
  const [text, setText] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const run = async (action: 'encrypt' | 'decrypt') => {
    if (!text.trim() || !password.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)
    const res = await fetch('/api/encrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, text, password }),
    })
    const data = await res.json()
    if (data.error) setError(data.error)
    else setResult(data.result)
    setLoading(false)
  }

  const copy = () => {
    if (!result) return
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <ToolShell name="Encrypt / Decrypt" icon="🔓">
      <div className="mx-auto max-w-2xl space-y-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Enter text to encrypt or decrypt..."
          rows={4}
          className="w-full resize-none rounded-xl border border-border bg-surface p-4 font-mono text-sm text-white outline-none placeholder-muted focus:border-accent"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white outline-none placeholder-muted focus:border-accent"
        />
        <div className="flex gap-3">
          <button
            onClick={() => run('encrypt')}
            disabled={loading || !text.trim() || !password.trim()}
            className="flex-1 rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
          >
            Encrypt
          </button>
          <button
            onClick={() => run('decrypt')}
            disabled={loading || !text.trim() || !password.trim()}
            className="flex-1 rounded-xl border border-accent/40 py-3 font-display font-semibold text-accent-soft transition-colors hover:bg-accent/10 disabled:opacity-40"
          >
            Decrypt
          </button>
        </div>
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}
        {result && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4">
            <p className="break-all font-mono text-sm text-white">{result}</p>
            <button onClick={copy} className="shrink-0 text-xs text-muted hover:text-accent-soft">
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
```

- [ ] **Step 6: Verify in browser**

Navigate to `http://localhost:3000/tools/decrypt`. Verify:
- Encrypt "hello" with password "123" → shows `iv:hex` format
- Paste encrypted text, same password → Decrypt shows "hello"
- Wrong password → shows red error message

- [ ] **Step 7: Commit**

```powershell
git add app/api/encrypt/route.ts __tests__/api/encrypt.test.ts app/tools/decrypt/page.tsx
git commit -m "feat: add encrypt/decrypt tool"
```

---

### Task 11: .inf Parser

**Files:**
- Create: `lib/inf-parser.ts`
- Create: `__tests__/lib/inf-parser.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface ButtonConfig { label: string; key: string; x: number; y: number; w: number; h: number }
  interface ControllerConfig { name: string; orientation: 'landscape' | 'portrait'; buttons: Record<string, ButtonConfig> }
  function parseInf(content: string): { config: ControllerConfig | null; error: string | null }
  ```

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/inf-parser.test.ts`:
```ts
import { parseInf } from '@/lib/inf-parser'

const VALID_INF = `
[controller]
name = NES Layout
orientation = landscape

[button:UP]
label = ↑
key = ArrowUp
x = 15
y = 35
w = 14
h = 14

[button:A]
label = A
key = z
x = 75
y = 45
w = 14
h = 14
`.trim()

describe('parseInf', () => {
  it('parses a valid .inf file', () => {
    const { config, error } = parseInf(VALID_INF)
    expect(error).toBeNull()
    expect(config?.name).toBe('NES Layout')
    expect(config?.orientation).toBe('landscape')
    expect(config?.buttons.UP.key).toBe('ArrowUp')
    expect(config?.buttons.UP.x).toBe(15)
    expect(config?.buttons.A.label).toBe('A')
  })

  it('reports error with line number for missing equals sign', () => {
    const bad = '[controller]\nname NES\n'
    const { config, error } = parseInf(bad)
    expect(config).toBeNull()
    expect(error).toContain('line 2')
  })

  it('reports error for unknown orientation', () => {
    const bad = '[controller]\nname = test\norientation = diagonal\n'
    const { config, error } = parseInf(bad)
    expect(config).toBeNull()
    expect(error).toContain('orientation')
  })

  it('reports error for non-numeric coordinate', () => {
    const bad = '[controller]\nname = t\norientation = landscape\n[button:UP]\nlabel = ↑\nkey = ArrowUp\nx = abc\ny = 35\nw = 14\nh = 14\n'
    const { config, error } = parseInf(bad)
    expect(config).toBeNull()
    expect(error).toContain('x')
  })

  it('reports error for coordinate out of range', () => {
    const bad = '[controller]\nname = t\norientation = landscape\n[button:UP]\nlabel = ↑\nkey = ArrowUp\nx = 150\ny = 35\nw = 14\nh = 14\n'
    const { config, error } = parseInf(bad)
    expect(config).toBeNull()
    expect(error).toContain('0–100')
  })

  it('returns empty buttons object for controller-only file', () => {
    const { config } = parseInf('[controller]\nname = Empty\norientation = portrait\n')
    expect(config?.buttons).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest __tests__/lib/inf-parser.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement inf-parser**

Create `lib/inf-parser.ts`:
```ts
export interface ButtonConfig {
  label: string
  key: string
  x: number
  y: number
  w: number
  h: number
}

export interface ControllerConfig {
  name: string
  orientation: 'landscape' | 'portrait'
  buttons: Record<string, ButtonConfig>
}

export function parseInf(content: string): { config: ControllerConfig | null; error: string | null } {
  const lines = content.split('\n')
  let section: string | null = null
  let buttonId: string | null = null

  const controller: Partial<ControllerConfig> & { buttons: Record<string, Partial<ButtonConfig>> } = { buttons: {} }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const raw = lines[i].split(';')[0].trim()
    if (!raw) continue

    if (raw.startsWith('[')) {
      const header = raw.slice(1, -1).trim()
      if (header === 'controller') {
        section = 'controller'
        buttonId = null
      } else if (header.startsWith('button:')) {
        buttonId = header.slice(7).trim().toUpperCase()
        section = 'button'
        controller.buttons[buttonId] = {}
      } else {
        return { config: null, error: `line ${lineNum}: unknown section [${header}]` }
      }
      continue
    }

    if (!raw.includes('=')) {
      return { config: null, error: `line ${lineNum}: expected "key = value", got "${raw}"` }
    }

    const eqIdx = raw.indexOf('=')
    const key = raw.slice(0, eqIdx).trim()
    const value = raw.slice(eqIdx + 1).trim()

    if (section === 'controller') {
      if (key === 'name') controller.name = value
      else if (key === 'orientation') {
        if (value !== 'landscape' && value !== 'portrait') {
          return { config: null, error: `line ${lineNum}: orientation must be "landscape" or "portrait"` }
        }
        controller.orientation = value
      }
    } else if (section === 'button' && buttonId) {
      const btn = controller.buttons[buttonId]
      if (key === 'label') btn.label = value
      else if (key === 'key') btn.key = value
      else if (['x', 'y', 'w', 'h'].includes(key)) {
        const num = Number(value)
        if (isNaN(num)) {
          return { config: null, error: `line ${lineNum}: "${key}" must be a number, got "${value}"` }
        }
        if (num < 0 || num > 100) {
          return { config: null, error: `line ${lineNum}: "${key}" must be 0–100 (percent), got ${num}` }
        }
        btn[key as 'x' | 'y' | 'w' | 'h'] = num
      }
    }
  }

  if (!controller.name) return { config: null, error: 'missing required field: name' }
  if (!controller.orientation) return { config: null, error: 'missing required field: orientation' }

  return {
    config: {
      name: controller.name,
      orientation: controller.orientation,
      buttons: controller.buttons as Record<string, ButtonConfig>,
    },
    error: null,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest __tests__/lib/inf-parser.test.ts
```
Expected: PASS — 6 tests passed

- [ ] **Step 5: Commit**

```powershell
git add lib/inf-parser.ts __tests__/lib/inf-parser.test.ts
git commit -m "feat: add .inf controller config parser"
```

---

### Task 12: WebRTC Core & useGameController Hook

**Files:**
- Create: `lib/webrtc.ts`
- Create: `hooks/use-game-controller.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
- Produces:
  ```ts
  // lib/webrtc.ts
  type InputMessage = { type: 'button'; key: string; state: 'pressed' | 'released'; ts: number }
  function createRoom(roomId: string, onInput: (msg: InputMessage) => void): Promise<() => void>
  function joinRoom(roomId: string): Promise<{ sendInput: (msg: InputMessage) => void; disconnect: () => void }>

  // hooks/use-game-controller.ts
  type ButtonState = { UP: boolean; DOWN: boolean; LEFT: boolean; RIGHT: boolean; A: boolean; B: boolean; START: boolean; SELECT: boolean }
  function useGameController(roomId: string): { buttons: ButtonState; connected: boolean }
  ```

- [ ] **Step 1: Set up Supabase project**

1. Go to supabase.com → New project → name it `webvibecoding`
2. Go to Project Settings → API
3. Copy `Project URL` and `anon public` key
4. Create `.env.local` in project root:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Do not commit `.env.local`. Verify `.gitignore` contains `.env.local`.

- [ ] **Step 2: Implement webrtc.ts**

Create `lib/webrtc.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export type InputMessage = {
  type: 'button'
  key: string
  state: 'pressed' | 'released'
  ts: number
}

// PC side — host the controller input receiver
export async function createRoom(
  roomId: string,
  onInput: (msg: InputMessage) => void,
  onConnected: () => void
): Promise<() => void> {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  const channel = supabase.channel(`controller-${roomId}`, { config: { broadcast: { self: false } } })

  const dataChannel = pc.createDataChannel('input')
  dataChannel.onmessage = (e) => onInput(JSON.parse(e.data))
  dataChannel.onopen = onConnected

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) channel.send({ type: 'broadcast', event: 'ice-pc', payload: candidate.toJSON() })
  }

  channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
    await pc.setRemoteDescription(new RTCSessionDescription(payload))
  })
  channel.on('broadcast', { event: 'ice-phone' }, async ({ payload }) => {
    await pc.addIceCandidate(new RTCIceCandidate(payload))
  })

  await new Promise<void>(resolve => channel.subscribe(status => { if (status === 'SUBSCRIBED') resolve() }))

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  channel.send({ type: 'broadcast', event: 'offer', payload: { type: offer.type, sdp: offer.sdp } })

  return () => { pc.close(); supabase.removeChannel(channel) }
}

// Phone side — join as controller
export async function joinRoom(roomId: string): Promise<{
  sendInput: (msg: InputMessage) => void
  disconnect: () => void
}> {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  const channel = supabase.channel(`controller-${roomId}`, { config: { broadcast: { self: false } } })
  let dataChannel: RTCDataChannel | null = null

  pc.ondatachannel = (e) => { dataChannel = e.channel }

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) channel.send({ type: 'broadcast', event: 'ice-phone', payload: candidate.toJSON() })
  }

  channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
    await pc.setRemoteDescription(new RTCSessionDescription(payload))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    channel.send({ type: 'broadcast', event: 'answer', payload: { type: answer.type, sdp: answer.sdp } })
  })
  channel.on('broadcast', { event: 'ice-pc' }, async ({ payload }) => {
    await pc.addIceCandidate(new RTCIceCandidate(payload))
  })

  await new Promise<void>(resolve => channel.subscribe(status => { if (status === 'SUBSCRIBED') resolve() }))

  return {
    sendInput: (msg) => dataChannel?.readyState === 'open' && dataChannel.send(JSON.stringify(msg)),
    disconnect: () => { pc.close(); supabase.removeChannel(channel) },
  }
}
```

- [ ] **Step 3: Implement useGameController hook**

Create `hooks/use-game-controller.ts`:
```ts
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoom, InputMessage } from '@/lib/webrtc'

export type ButtonState = {
  UP: boolean; DOWN: boolean; LEFT: boolean; RIGHT: boolean
  A: boolean; B: boolean; START: boolean; SELECT: boolean
}

const INITIAL: ButtonState = {
  UP: false, DOWN: false, LEFT: false, RIGHT: false,
  A: false, B: false, START: false, SELECT: false,
}

export function useGameController(roomId: string) {
  const [buttons, setButtons] = useState<ButtonState>(INITIAL)
  const [connected, setConnected] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!roomId) return

    const handleInput = (msg: InputMessage) => {
      if (msg.type !== 'button') return
      setButtons(prev => ({ ...prev, [msg.key]: msg.state === 'pressed' }))
    }

    createRoom(roomId, handleInput, () => setConnected(true))
      .then(cleanup => { cleanupRef.current = cleanup })

    return () => { cleanupRef.current?.(); setConnected(false); setButtons(INITIAL) }
  }, [roomId])

  return { buttons, connected }
}
```

- [ ] **Step 4: Commit**

```powershell
git add lib/webrtc.ts hooks/use-game-controller.ts .env.local
git commit -m "feat: add WebRTC core and useGameController hook"
```

Note: If `.env.local` gets staged, unstage it: `git reset HEAD .env.local`

---

### Task 13: Game Controller UI & Presets

**Files:**
- Create: `app/tools/game-controller/page.tsx`
- Create: `public/controller-presets/nes.inf`
- Create: `public/controller-presets/snes.inf`

**Interfaces:**
- Consumes: `useGameController(roomId)` from `hooks/use-game-controller.ts`
- Consumes: `joinRoom(roomId)` from `lib/webrtc.ts`
- Consumes: `parseInf(content)` from `lib/inf-parser.ts`
- Consumes: `ControllerConfig, ButtonConfig` from `lib/inf-parser.ts`

- [ ] **Step 1: Create NES preset**

Create `public/controller-presets/nes.inf`:
```ini
[controller]
name = NES Layout
orientation = landscape

[button:UP]
label = ↑
key = ArrowUp
x = 15
y = 38
w = 10
h = 12

[button:DOWN]
label = ↓
key = ArrowDown
x = 15
y = 62
w = 10
h = 12

[button:LEFT]
label = ←
key = ArrowLeft
x = 5
y = 50
w = 10
h = 12

[button:RIGHT]
label = →
key = ArrowRight
x = 25
y = 50
w = 10
h = 12

[button:A]
label = A
key = z
x = 82
y = 50
w = 12
h = 14

[button:B]
label = B
key = x
x = 70
y = 55
w = 12
h = 14

[button:SELECT]
label = SELECT
key = Shift
x = 38
y = 80
w = 16
h = 8

[button:START]
label = START
key = Enter
x = 58
y = 80
w = 16
h = 8
```

- [ ] **Step 2: Create SNES preset**

Create `public/controller-presets/snes.inf`:
```ini
[controller]
name = SNES Layout
orientation = landscape

[button:UP]
label = ↑
key = ArrowUp
x = 13
y = 38
w = 10
h = 11

[button:DOWN]
label = ↓
key = ArrowDown
x = 13
y = 60
w = 10
h = 11

[button:LEFT]
label = ←
key = ArrowLeft
x = 4
y = 49
w = 10
h = 11

[button:RIGHT]
label = →
key = ArrowRight
x = 22
y = 49
w = 10
h = 11

[button:A]
label = A
key = z
x = 86
y = 50
w = 11
h = 13

[button:B]
label = B
key = x
x = 76
y = 58
w = 11
h = 13

[button:X]
label = X
key = a
x = 76
y = 42
w = 11
h = 13

[button:Y]
label = Y
key = s
x = 65
y = 50
w = 11
h = 13

[button:SELECT]
label = SELECT
key = Shift
x = 36
y = 78
w = 14
h = 8

[button:START]
label = START
key = Enter
x = 55
y = 78
w = 14
h = 8
```

- [ ] **Step 3: Implement game controller page**

Create `app/tools/game-controller/page.tsx`:
```tsx
'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { ToolShell } from '@/components/tool-shell'
import { useGameController } from '@/hooks/use-game-controller'
import { joinRoom, InputMessage } from '@/lib/webrtc'
import { parseInf, ControllerConfig } from '@/lib/inf-parser'

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── PC Side (host) ───────────────────────────────────────────────
function PCController({ roomId }: { roomId: string }) {
  const { connected, buttons } = useGameController(roomId)
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/tools/game-controller?room=${roomId}`
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    const pressed = Object.entries(buttons)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (pressed.length) setLog(prev => [`→ ${pressed.join(' + ')} pressed`, ...prev].slice(0, 8))
  }, [buttons])

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-400' : 'bg-muted'}`} />
        <span className="text-sm text-muted">{connected ? 'Phone connected — ready' : 'Waiting for phone...'}</span>
        <span className="ml-auto font-mono text-xs text-muted">Room: {roomId}</span>
      </div>
      {!connected && (
        <div className="flex justify-center rounded-2xl border border-border bg-surface p-6">
          <QRCodeSVG value={url} size={200} bgColor="#0F0F1A" fgColor="#FAFAFA" />
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted">Input Log</p>
        {log.length === 0
          ? <p className="text-sm text-muted">No input yet</p>
          : log.map((l, i) => <p key={i} className="font-mono text-sm text-white">{l}</p>)
        }
      </div>
    </div>
  )
}

// ── Phone Side (controller) ───────────────────────────────────────
function PhoneController({ roomId, config }: { roomId: string; config: ControllerConfig }) {
  const connectionRef = useRef<{ sendInput: (m: InputMessage) => void; disconnect: () => void } | null>(null)

  useEffect(() => {
    joinRoom(roomId).then(conn => { connectionRef.current = conn })
    return () => connectionRef.current?.disconnect()
  }, [roomId])

  const send = (key: string, state: 'pressed' | 'released') => {
    connectionRef.current?.sendInput({ type: 'button', key, state, ts: Date.now() })
    if (state === 'pressed' && navigator.vibrate) navigator.vibrate(20)
  }

  return (
    <div className="relative h-screen w-full bg-background">
      {Object.entries(config.buttons).map(([id, btn]) => (
        <button
          key={id}
          style={{
            position: 'absolute',
            left: `${btn.x}%`,
            top: `${btn.y}%`,
            width: `${btn.w}%`,
            height: `${btn.h}%`,
          }}
          onPointerDown={() => send(id, 'pressed')}
          onPointerUp={() => send(id, 'released')}
          onPointerLeave={() => send(id, 'released')}
          className="flex items-center justify-center rounded-xl border border-border bg-surface font-display text-sm font-bold text-white active:bg-accent/30 active:border-accent select-none touch-none"
        >
          {btn.label}
        </button>
      ))}
    </div>
  )
}

// ── Main Page (inner, uses hooks) ────────────────────────────────
function GameControllerInner() {
  const searchParams = useSearchParams()
  const incomingRoom = searchParams.get('room')
  const isPhone = !!incomingRoom

  const [roomId] = useState(incomingRoom ?? generateRoomId)
  const [config, setConfig] = useState<ControllerConfig | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [preset, setPreset] = useState<'nes' | 'snes'>('nes')

  // Load default preset
  useEffect(() => {
    fetch(`/controller-presets/${preset}.inf`)
      .then(r => r.text())
      .then(text => {
        const { config: parsed, error } = parseInf(text)
        if (error) setParseError(error)
        else setConfig(parsed)
      })
  }, [preset])

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { config: parsed, error } = parseInf(text)
      if (error) { setParseError(error); return }
      setParseError(null)
      setConfig(parsed)
      localStorage.setItem('controller-layout', text)
    }
    reader.readAsText(file)
  }

  // Phone view — no shell, fullscreen controller
  if (isPhone && config) {
    return <PhoneController roomId={roomId} config={config} />
  }

  return (
    <ToolShell name="Game Controller" icon="🎮" description="Use your phone as a wireless gamepad">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">Preset:</span>
          {(['nes', 'snes'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                preset === p
                  ? 'border-accent bg-accent/20 text-accent-soft'
                  : 'border-border bg-surface text-muted hover:text-white'
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
          <label className="ml-auto cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:text-white">
            Import .inf
            <input type="file" accept=".inf" onChange={handleImport} className="hidden" />
          </label>
        </div>
        {parseError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 font-mono text-xs text-red-400">
            {parseError}
          </div>
        )}
        {config && <PCController roomId={roomId} />}
      </div>
    </ToolShell>
  )
}

// Suspense wrapper required by useSearchParams in App Router
export default function GameControllerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <GameControllerInner />
    </Suspense>
  )
}
```

- [ ] **Step 4: Verify locally**

```powershell
npm run dev
```
1. Open `http://localhost:3000/tools/game-controller` on PC — QR code and Room ID appear
2. On phone, open the URL shown in QR code
3. Press buttons on phone — PC input log shows button names
4. Import a custom `.inf` file — controller layout updates

- [ ] **Step 5: Commit**

```powershell
git add app/tools/game-controller/page.tsx public/controller-presets/
git commit -m "feat: add game controller tool with WebRTC and .inf config"
```

---

### Task 14: Production Deploy & Environment Variables

**Files:** No code changes — Vercel configuration only.

- [ ] **Step 1: Add Supabase env vars to Vercel**

1. Go to vercel.com → Project → Settings → Environment Variables
2. Add:
   - `NEXT_PUBLIC_SUPABASE_URL` → your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → your Supabase anon key
3. Select environments: Production + Preview + Development
4. Save

- [ ] **Step 2: Run full test suite**

```powershell
npx jest --passWithNoTests
```
Expected: All tests pass

- [ ] **Step 3: Push to main and verify production deploy**

```powershell
git checkout main
git merge dev
git push origin main
```

Go to Vercel dashboard → watch deploy complete (~60s).
Open production URL. Verify:
- Homepage loads with 5 tool cards
- `/` shortcut opens command palette
- All 5 tools navigate and work
- Game Controller shows QR code

- [ ] **Step 4: Push to main and test on mobile**

Open production URL on phone browser. Verify:
- Homepage is readable at mobile width
- Tool cards are 1-column
- Calculator buttons are large enough to tap
- Color picker color input works on mobile
- Hash generator textarea works on mobile

- [ ] **Step 5: Final commit**

```powershell
git add -A
git commit -m "chore: production deploy verified"
git push
```

---

## Running All Tests

```powershell
npx jest
```

Expected passing test files:
- `__tests__/lib/tools-registry.test.ts`
- `__tests__/components/tool-shell.test.tsx`
- `__tests__/lib/calculator.test.ts`
- `__tests__/lib/color-utils.test.ts`
- `__tests__/api/hash.test.ts`
- `__tests__/api/encrypt.test.ts`
- `__tests__/lib/inf-parser.test.ts`
