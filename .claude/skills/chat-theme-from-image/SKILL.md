---
name: chat-theme-from-image
description: "Add or update a Private Chat room theme (app/tools/private-chat) from a reference image the user sends — wallpaper + 4-color palette + font + icon tint, bundled into one THEME_PRESETS entry with a one-click admin apply button. Use whenever the user says things like 'làm theme này cho tôi', 'đổi theme chat theo hình', 'thêm theme mới theo hình tôi gửi', or attaches a photo/pattern/mood board and asks the chat to match it."
---

# Private Chat: theme-from-image

Turns a reference image into a full Private Chat theme: wallpaper, 4-role color
palette, suggested font, and icon/aurora-background tinting — all bundled into
one `THEME_PRESETS` entry the admin applies with a single button.

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

Icons and the outer page background (`ToolShell`'s `backgroundStyle`) already
read `primaryColor`/`secondaryColor`/`quaternaryColor` generically — you do
not need to touch icon code again for a new theme, only add the preset data.

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

4. **No new admin/API/client code needed for a new preset** — `THEME_PRESETS`
   is already read generically by:
   - `app/tools/private-chat/admin/page.tsx`'s `applyThemePreset()` (renders a
     "✨ Áp dụng theme: {label}" button per entry automatically)
   - the client already reads all 4 colors + font + wallpaper from `roomInfo`
   Only add code elsewhere if the image implies something genuinely new (e.g.
   a 5th color role, or a wallpaper behavior that doesn't fit the existing
   preset/custom-upload model) — ask the user first if so, don't build it
   speculatively.

5. **If you DO add a new color role or field** (extending beyond the existing
   4), it needs a migration: `alter table chat_rooms add column if not exists
   <role>_color text;` in a new `supabase/migrations/00NN_....sql` file — tell
   the user to run it in Supabase SQL Editor, and remind them again in your
   final report. Never run it yourself.

6. **Verify before shipping:**
   ```bash
   npx tsc --noEmit
   rm -rf .next public/sw.js public/workbox-*.js public/worker-*.js
   NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder npm run build
   ```

7. **Ship per this repo's branch workflow** (see root `CLAUDE.md`): new
   `claude/<slug>-theme` branch → commit → push → merge `--no-ff` into
   `staging` → push `staging` → report to the user and **stop before
   `master`** until they explicitly say "lên prod".

8. **After pushing to staging, tell the user to actually click "✨ Áp dụng
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
