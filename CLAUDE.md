# WebVibeCoding — Claude Instructions

Full spec: `docs/superpowers/specs/2026-06-28-webvibecoding-design.md`

---

## Project in one sentence
Personal multi-tool web app (Next.js 14 + Vercel). Every tool is a self-contained page. Adding a tool = 1 new file + 1 registry entry.

## Stack
- Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui
- Vercel (auto-deploy on push to `main`)
- Supabase Realtime (WebRTC signaling only)

## Adding a tool (always follow this pattern)

1. Create `app/tools/[slug]/page.tsx` using `<ToolShell>` wrapper
2. Add entry to `lib/tools-registry.ts`
3. If server logic needed: `app/api/[slug]/route.ts` returning `{ result, error }`
4. Nothing else changes

## Hard rules — never break these

- Every tool page must use `<ToolShell name="..." icon="...">`
- Never use `any` in TypeScript
- Never add a new accent color — palette is fixed in spec
- Never import from another tool's folder
- Never commit `.env.local`
- Data/code/hash output must use `font-mono` (JetBrains Mono)
- All layouts must work at 390px width (mobile-first)

## Design system (fixed)

```
bg: #08080E  |  surface: #0F0F1A  |  border: #1A1A2E
accent: #7C3AED  |  accent-soft: #A78BFA
text: #FAFAFA  |  text-muted: #52525B
```

Fonts: Space Grotesk (headings), Inter (body), JetBrains Mono (data)

## Branch & deploy workflow

```
feature/xxx  →  staging  →  master (prod)
```

- **`master`**: production, auto-deploy to Vercel prod
- **`staging`**: integration branch, auto-deploy to Vercel Preview URL for testing
- **`feature/*` / `claude/*`**: individual feature branches

### Steps for every new feature
1. Develop on `claude/<feature>` branch
2. Merge `claude/<feature>` → `staging` (auto-deploy to Vercel Preview)
3. Notify the user that the feature is on staging and ready for review
4. **STOP and wait** — do NOT touch `master` until the user explicitly says so
5. After user says "lên prod" / "lên production" / "merge to master": merge `staging` → `master`

### HARD DEPLOY RULES — never break these
- **Default for every task**: push to `staging` only, notify the user, then STOP
- **NEVER** merge `staging` → `master` unless the user explicitly says "lên prod" (or equivalent)
- This applies to every change, no matter how small (typo fix, removing a section, etc.)
- The user will say if they want an exception — otherwise always stop at staging

## Commit format

```
feat: add [tool-name] tool
fix: [tool-name] — description
style: update [component]
```

## When fixing a bug
- Only change the file where the bug is
- Do not refactor surrounding code
- Do not change design system or other tools

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```
