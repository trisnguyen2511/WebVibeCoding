---
name: chat-theme-from-image
description: "Add or update a Private Chat room theme (app/tools/private-chat) from a reference image the user sends — wallpaper + 4-color palette + font + a full matching hand-drawn icon set, bundled into one THEME_PRESETS entry with a one-click admin apply button. Use whenever the user says things like 'làm theme này cho tôi', 'đổi theme chat theo hình', 'thêm theme mới theo hình tôi gửi', or attaches a photo/pattern/mood board and asks the chat to match it."
---

# Private Chat: theme-from-image

Turns a reference image into a full Private Chat theme: wallpaper, 4-role color
palette, suggested font, ambient/header background tinting, **and a full
matching hand-drawn icon set** — all bundled into one `THEME_PRESETS` entry
the admin applies with a single button.

**A theme-from-image request always includes a matching icon set.** Don't
treat the icon set as optional or a separate follow-up — build it in the same
pass as the wallpaper/palette/font, the same way the mosaic (Talavera) theme
now has one. See "Icon set" step below.

This encodes what was learned building the mosaic/Talavera theme in this repo:
color renames, the 4-color system, the outer aurora background, and the
stale-cache refresh bug all happened as separate follow-up requests because
they weren't planned together up front. Do them together this time.

## What "the whole theme" covers

Everything visually driven by the room's theme, all wired through
`lib/chat-defaults.ts` → `ThemePreset`:

| Role | Field | Used for |
|---|---|---|
| Wallpaper | `wallpaperPreset` (or a custom uploaded image) | message-list background |
| Primary | `primaryColor` | your own bubble/journal text, icons, send button, outer aurora blob 1 |
| Secondary | `secondaryColor` | the other side's bubble/journal text, outer aurora blob 2 |
| Tertiary | `tertiaryColor` | pinned message, link-preview site name — informational highlights |
| Quaternary | `quaternaryColor` | chosen-reaction chip tint, outer aurora's 3rd blob (liveliness) |
| Font | `fontId` | suggested chrome/message font, reordered first in the picker |

The outer/header ambient background (`ToolShell`'s `ambientBackgroundStyle` /
`headerStyle`) already reads `primaryColor`/`secondaryColor`/`quaternaryColor`/
`wallpaperCss` generically — no code changes needed there for a new theme.

Icons are different: there is no generic "icon set" reader. Each theme's icon
set is a real folder of hand-drawn SVGs under `public/icons/<slug>/`, and the
render call sites in `app/tools/private-chat/page.tsx` pick a theme's set by
checking `roomInfo.wallpaperPreset === '<slug>'` (see `useMosaicIcons` for the
existing example). A new theme needs its own folder and its own boolean/
lookup wired the same way — this is manual work every time, not automatic.

## Steps

1. **Extract the palette from the image.** Pick 4 real colors actually present
   in the image (don't invent generic ones) — the strongest 2 for
   primary/secondary (goes on message bubbles, must have good contrast against
   both dark and light app backgrounds), then 2 supporting colors for
   tertiary/quaternary. Name them by what they are in the image in a code
   comment (e.g. `// cobalt blue tile`), not just "color 1/2/3/4".

2. **Add the wallpaper.**
   - If the image itself should be the tiled/full background: save it to
     `public/wallpapers/<slug>.jpg` (or reuse the original) and add an entry to
     `WALLPAPER_PRESETS` in `lib/chat-defaults.ts` with
     `css: "url('/wallpapers/<slug>.jpg')"`.
   - If the theme should instead use a plain color-derived gradient (no
     literal image as background), write a `radial-gradient(...)`/
     `linear-gradient(...)` css string using the same 4 colors at low alpha,
     matching the existing preset entries' style.

3. **Add one `ThemePreset` entry** to `THEME_PRESETS` in `lib/chat-defaults.ts`:
   ```ts
   {
     id: '<slug>',
     label: '<Vietnamese label> (<short reference>)',
     wallpaperPreset: '<slug>',
     primaryColor: '#......', // <what it is>
     secondaryColor: '#......',
     tertiaryColor: '#......',
     quaternaryColor: '#......',
     fontId: '<pick from FONT_CATALOG that matches the image's mood>',
   }
   ```
   Font choice matters — match the image's personality (e.g. a folk/tile
   pattern → `rounded`; an elegant/luxury photo → `serif` or `display`; a
   playful pattern → `cute`/`funky`). Don't default to `sans` without looking.

4. **Draw the matching icon set** (always do this, not just when asked
   separately). Create `public/icons/<slug>/` with one hand-drawn SVG per icon
   currently themeable — check `app/tools/private-chat/page.tsx` for the
   current full list (as of writing: `send`, `image`, `gallery`, `search`,
   `plus`, `reaction`, `font`, `timer`, `attachment`, `leave`, `pin`, `reply` —
   **re-check the file, this list grows**; see rule below). Style rules, consistent across
   every theme's set so they all feel like "one family" of a shared system:
   - viewBox `0 0 24 24`, bold ~1.5-2px black (`#0B0B0F`) outlines
   - filled with the theme's own 4 palette colors (name which color = which
     hex in a comment, matching step 1)
   - a small recurring corner accent (the mosaic set uses a tiny 4-point
     quatrefoil/dot cluster in one corner) so icons in the same set are
     visually related to each other, not just same-color-different-shape
   - validate each file parses as XML before committing (a stray unescaped
     `&` broke one of the mosaic icons before — check with e.g.
     `python3 -c "import xml.dom.minidom as m; m.parse('file.svg')"`)
   Wire them in with the same pattern as `useMosaicIcons`: a boolean derived
   from `roomInfo.wallpaperPreset === '<slug>'`, and a `<ThemedIcon set="<slug>"
   name="..." size={..} />` conditional at each icon call site, falling back to
   the existing lucide icon when the boolean is false.

5. **Whenever you add a new icon-using feature to the chat** (a new button,
   picker, or action — regardless of which theme prompted it), add the new
   icon to **every existing theme's icon set**, not just the one you're
   currently working on. An icon set that only covers some buttons looks
   broken/inconsistent the moment a themed room hits the one button still
   showing a bare lucide icon. Treat "add an icon set entry" as part of
   "add the feature," the same way a new field needs updating in `Session`,
   `join`, `room-info`, and the admin route all together.

6. **No new admin/API/client code needed for the preset data itself** —
   `THEME_PRESETS` is already read generically by:
   - `app/tools/private-chat/admin/page.tsx`'s `applyThemePreset()` (renders a
     "✨ Áp dụng theme: {label}" button per entry automatically)
   - the client already reads all 4 colors + font + wallpaper from `roomInfo`
   (Icons are the one exception — see step 4/5 above, they need explicit wiring.)
   Only add other code if the image implies something genuinely new (e.g.
   a 5th color role, or a wallpaper behavior that doesn't fit the existing
   preset/custom-upload model) — ask the user first if so, don't build it
   speculatively.

7. **If you DO add a new color role or field** (extending beyond the existing
   4), it needs a migration: `alter table chat_rooms add column if not exists
   <role>_color text;` in a new `supabase/migrations/00NN_....sql` file — tell
   the user to run it in Supabase SQL Editor, and remind them again in your
   final report. Never run it yourself.

8. **Verify before shipping:**
   ```bash
   npx tsc --noEmit
   rm -rf .next public/sw.js public/workbox-*.js public/worker-*.js
   NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder npm run build
   ```

9. **Ship per this repo's branch workflow** (see root `CLAUDE.md`): new
   `claude/<slug>-theme` branch → commit → push → merge `--no-ff` into
   `staging` → push `staging` → report to the user and **stop before
   `master`** until they explicitly say "lên prod".

10. **After pushing to staging, tell the user to actually click "✨ Áp dụng
    theme"** in the admin panel for the room they want it on — adding the
    preset alone doesn't change any existing room until applied.

## Known pitfalls from building this system (avoid repeating)

- **Vercel preview staleness**: pushing to `staging` doesn't always trigger a
  fresh Vercel deployment right away. If the user reports "the preview still
  looks old," check the deployment's source commit in the Vercel dashboard
  before assuming the merge failed — an empty commit (`git commit
  --allow-empty`) re-triggers a build if needed.
- **Stale cached session**: room customization (colors, wallpaper, font...) is
  fetched once at join time and cached in `localStorage`; the client already
  has a refresh-on-mount mechanism (`roomInfo` state + `GET
  /api/chat/room-info?roomId=`) — don't reintroduce a join-time-only read path
  for any new field you add.
- **Solo/journal mode**: bubble colors must also work in journal (solo) mode,
  which renders as plain text with a colored left border, not a real bubble —
  alternates primary/secondary per-device based on who actually sent each
  entry (`isOwnDevice`), not a fixed "mine" style.
- **Message font isolation**: the chrome font (`themeFont`) must never leak
  into message text — `fontStyleFor()`'s default case explicitly sets
  `fontFamily: 'var(--font-inter), sans-serif'` so messages never inherit the
  chrome wrapper's font via CSS inheritance. Keep this invariant if you touch
  font logic.
- **No AI icon-generation API key in this environment**: the `design` skill's
  `scripts/icon/generate.py` needs `GEMINI_API_KEY`, which isn't set up here.
  Default to hand-drawing the SVGs directly (as done for every icon so far)
  unless the user has explicitly provided a key for that session.
- **Icon sets go stale silently**: because each icon set is a manually-wired
  folder (not a generic reader), adding a new icon feature without updating
  every existing theme's set doesn't error — it just quietly falls back to
  the default lucide icon for that one theme, which reads as an inconsistency
  bug days later. Grep for the existing `useMosaicIcons` (or equivalent)
  boolean and its `<ThemedIcon .../>` call sites whenever adding a themeable
  icon, and mirror the same call site for every other theme folder that
  exists at the time.
