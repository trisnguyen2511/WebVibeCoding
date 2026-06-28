# WebVibeCoding — Design Spec
**Date:** 2026-06-28  
**Status:** Approved

---

## Quick Reference (read this first)

| Question | Answer |
|---|---|
| How do I add a tool? | Create `app/tools/[name]/page.tsx` + add to `lib/tools-registry.ts` |
| Where does server logic go? | `app/api/[tool-name]/route.ts` |
| What wraps every tool? | `<ToolShell name="..." icon="...">` |
| Where is game controller logic? | `lib/webrtc.ts` + `hooks/use-game-controller.ts` |
| What is the accent color? | `#7C3AED` (violet) — do not introduce new accent colors |
| Dark mode default? | Yes — always design dark-first |

---

## 1. Architecture

### Stack
- **Framework:** Next.js 14 (App Router)
- **Hosting:** Vercel (free tier) — auto-deploy on push to `main`
- **Styling:** Tailwind CSS + shadcn/ui
- **Realtime:** WebRTC P2P + Supabase Realtime (signaling only)
- **Language:** TypeScript — all files must be `.ts` or `.tsx`

### Deployment
```
push to main → Vercel production (yourdomain.com)     ~60s build
push to dev  → Vercel preview URL                     ~60s build
```

---

## 2. Project Structure

```
WebVibeCoding/
├── app/
│   ├── page.tsx                    ← homepage, reads from tools-registry
│   ├── layout.tsx                  ← global layout, applies theme + fonts
│   └── tools/
│       └── [tool-name]/
│           └── page.tsx            ← one file per tool
├── app/api/
│   └── [tool-name]/
│       └── route.ts                ← API route if tool needs server logic
├── components/
│   ├── tool-shell.tsx              ← MUST wrap every tool page
│   ├── command-palette.tsx         ← "/" global shortcut
│   └── ui/                        ← shadcn/ui only, do not add custom here
├── hooks/
│   └── use-game-controller.ts      ← WebRTC input hook
├── lib/
│   ├── tools-registry.ts           ← single source of truth for tool list
│   └── webrtc.ts                   ← WebRTC connection logic
└── public/
    └── controller-presets/
        ├── nes.inf
        └── snes.inf
```

---

## 3. How to Add a Tool (exact steps, follow precisely)

### Step 1 — Create the page

```tsx
// app/tools/my-tool/page.tsx
import { ToolShell } from "@/components/tool-shell"

export default function MyToolPage() {
  return (
    <ToolShell name="My Tool" icon="🔧">
      {/* tool content here */}
    </ToolShell>
  )
}
```

### Step 2 — Register in tools-registry.ts

```ts
// lib/tools-registry.ts
export const tools: Tool[] = [
  // ... existing tools
  {
    name: "My Tool",
    slug: "my-tool",          // must match folder name exactly
    icon: "🔧",
    description: "One sentence. What it does, not what it is.",
    category: "utility",      // "utility" | "crypto" | "game" | "media"
  },
]
```

### Step 3 — Done
Homepage picks up the new tool automatically. No other files need changes.

---

## 4. Tool Conventions (follow for every tool)

**Always:**
- Wrap content in `<ToolShell>` — never render a tool without it
- Use `JetBrains Mono` (via `font-mono` class) for any output that is data, hash, code, or numbers
- Keep tool state local (useState) — tools do not share state with each other
- Mobile-first layout — tool must be usable on a 390px wide screen

**Never:**
- Do not add new global CSS variables or override Tailwind theme
- Do not import from another tool's folder
- Do not use `any` type in TypeScript
- Do not add a new accent color — the palette is fixed (see Section 6)
- Do not add a tool without registering it in `tools-registry.ts`

**API routes (when needed):**
- Only use when operation must stay server-side (e.g., crypto with secret key)
- Route lives at `app/api/[tool-name]/route.ts`
- Return `{ result, error }` shape — always, even on success
- Validate all user input before processing

---

## 5. WebRTC Game Controller

### How it works
```
PC /tools/game-controller → shows QR + Room ID
Phone scans QR            → joins room
Supabase Realtime         → exchanges ~5 WebRTC handshake messages
P2P connection established → Supabase exits, all data is phone→PC direct
```

### Using controller input in a game

```ts
import { useGameController } from "@/hooks/use-game-controller"

export default function MyGame() {
  const { buttons } = useGameController()
  // buttons.UP, buttons.DOWN, buttons.LEFT, buttons.RIGHT, buttons.A, buttons.B
}
```

Do not touch `lib/webrtc.ts` when building a game — use the hook only.

### Controller config file (.inf format)

```ini
[controller]
name = NES Layout
orientation = landscape

[button:UP]
label = ↑
key = ArrowUp
x = 15    ; percent of screen width
y = 35    ; percent of screen height
w = 14
h = 14
```

Rules:
- `x`, `y`, `w`, `h` are screen percentages (0–100) — always responsive
- `key` maps to a `KeyboardEvent.key` value
- Parse errors must report exact line number, not crash silently
- Loaded layout is saved to `localStorage` key `controller-layout`

---

## 6. Design System (fixed — do not change)

### Colors
```
--bg:           #08080E   background
--surface:      #0F0F1A   card, panel
--border:       #1A1A2E   divider, border
--accent:       #7C3AED   buttons, active, highlights
--accent-soft:  #A78BFA   hover, secondary accent
--text:         #FAFAFA   primary text
--text-muted:   #52525B   labels, captions
```

### Typography
```
Space Grotesk   — headings (font-display)
Inter           — body (font-sans)
JetBrains Mono  — data output, code (font-mono)
```

### Component: ToolShell

```tsx
<ToolShell
  name="Tool Name"    // required — shown in header
  icon="🔧"          // required — emoji or string
  description="..."  // optional — shown under name
>
  {children}
</ToolShell>
```

ToolShell provides: back button, header, responsive container, dark mode toggle. Do not re-implement any of these inside a tool.

### Motion rules
- Card hover: `transition-all duration-100` + `translate-y-[-2px]`
- Command palette open: `scale-95 → scale-100` + `opacity-0 → opacity-100`, 150ms
- No ambient or looping animations — this is a daily-use tool, not a landing page

---

## 7. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anon key (safe to expose)
```

Add to `.env.local` (never commit). Add to Vercel dashboard under Environment Variables.

---

## 8. Git Conventions

```
feat: add [tool-name] tool
fix: [tool-name] — short description of bug
style: update [component] visual
refactor: [file] — short reason
chore: update dependencies
```

Commit message must name the tool or component affected. "fix bug" is not acceptable.

---

## 9. Mobile Vibe Coding Workflow

### How to prompt AI to add a tool
> "Add a [tool name] tool. Follow the pattern in `app/tools/calculator/page.tsx`.
> Register it in `lib/tools-registry.ts`. Wrap it in ToolShell. Mobile-first."

### How to prompt AI to fix a bug
> "Bug in `app/tools/[name]/page.tsx`: [describe exact symptom].
> Do not change any other files. Do not change the design system."

### Workflow on mobile
```
Simple feature  → Claude Code Web (claude.ai/code) → commit → Vercel deploys
Want preview    → Bolt.new → export to GitHub → merge
Need other AI   → github.dev + GitHub Copilot (supports GPT-4o, Gemini, o1)
```

---

## 10. Out of Scope

Do not implement these unless a new spec is written:
- User authentication or accounts
- Persisting tool outputs to a database
- Public sharing / social features
- Analytics or tracking

---

## 11. Initial Tool List

| Slug | Name | Type | API Route? |
|---|---|---|---|
| `calculator` | Calculator | Frontend | No |
| `color-picker` | Color Picker | Frontend | No |
| `hash` | Hash Generator | Server | Yes |
| `decrypt` | Encrypt / Decrypt | Server | Yes |
| `game-controller` | Game Controller | WebRTC | No |
