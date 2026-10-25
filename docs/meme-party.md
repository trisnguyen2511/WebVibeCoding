# Meme Party

Realtime party game for 5–12 friends in the same room (phones = controllers, optional TV/desktop = shared screen) plus a managed meme library. It lives under **Board Games** (`/tools/board-games` → `/tools/meme-party`).

## Pages and APIs

| Page | Purpose |
|---|---|
| `/tools/meme-party` | Create a room (Host) / join by code / open shared screen |
| `/tools/meme-party/host?code=` | Host console |
| `/tools/meme-party/play?code=` | Player (mobile). QR from the lobby points here |
| `/tools/meme-party/screen?code=` | Shared screen for TV/desktop (public view only) |
| `/tools/meme-party/library` | Meme library management (admin password) |

All routes answer `{ result, error }` (+ `code`). Game: `POST /api/meme-party/rooms`, `POST …/rooms/join`, `GET …/rooms/[code]/state`, `POST …/rooms/[code]/command`. Library: `/api/meme-party/admin/*`.

## Architecture

```
lib/meme-party/
  types.ts          shared types (state, commands, views)
  engine.ts         PURE server-authoritative state machine (no I/O)
  scoring.ts        round result + shared-rank scoreboard
  view.ts           builds the per-viewer snapshot (what each client may see)
  room-store.ts     RoomStore: Supabase (prod) / Memory (tests, local dev)
  room-service.ts   load → apply command → compare-and-swap write (retry)
  sessions.ts       tokens (random, only sha256 stored), room codes
  content-store.ts  ContentStore: library, import jobs, files (Supabase / Memory)
  csv.ts, import-*.ts, image-*.ts, library-service.ts, upload-service.ts   library module
```

* **Authority**: clients only send *commands* (`SUBMIT`, `VOTE`, host phase commands). The engine validates actor role, phase and payload; clients never send scores, ids of other players or flags.
* **Atomicity**: a room is one JSONB row with a `rev` counter. Every write is `UPDATE … WHERE id=? AND rev=?`; the loser of a race re-reads and re-applies (so duplicate/concurrent votes and double `CLOSE_VOTING` cannot be applied twice). This replaces per-row unique constraints for `(room, round, voter)` — the vote map is keyed by voter inside the document.
* **Idempotency**: every command carries a `cmdId`; the room remembers the last 300. Replays are no-ops. Showcase navigation is *absolute* (`SHOWCASE_GOTO index`), so a duplicated "Next" cannot skip a slide.
* **Versions**: `stateVersion` increases on every observable change; clients ignore older snapshots.
* **Realtime**: clients poll an authorised snapshot (`/state?since=&lite=1`, 1.5 s) and, when Supabase is configured, also get a broadcast *nudge* (`meme-party-<code>`, event `changed`) to refetch immediately. The broadcast carries no game data, so nothing private can leak through it. Reconnecting = fetching a snapshot.
* **Privacy**: authors, per-submission tallies, other players' hands and unpublished results are *omitted* from snapshots (not hidden by CSS). The scoreboard also excludes points of a locked-but-unpublished round so the winner is not revealed early.
* **Host presence** (no persistent sockets on Vercel): members heartbeat through `/state`; presence is evaluated lazily on every request. Host silent > 20 s → `HOST_RECONNECTING` (Host controls locked, players can still act). After 60 s (`MEME_PARTY_HOST_GRACE_SECONDS`) the earliest-joined online eligible player becomes Host; the old Host becomes a spectator. No online player → `HOST_TRANSFER` until someone returns. This is the only timer; submission/voting never close automatically.
* **Round content snapshot**: prompt and each player's hand are copied into the round when it is dealt, so library edits/deactivation/deletion never change a running or finished match. Library rows are soft-deleted.

### Game flow
`LOBBY → ROUND_BRIEFING → SUBMISSION_OPEN → REVIEW → [MEME_SHOWCASE] → VOTING_OPEN → RESULTS → ROUND_END → … → GAME_FINISHED`, plus `PAUSED`, `HOST_RECONNECTING`, `HOST_TRANSFER`, `CANCELLED`.

Decisions where the spec left room:
* **Plan**: 10 rounds, all three modes at least once, order shuffled and persisted at start; 2 special rounds (always one **Double Points**, the other **Chaos** or **Host Award**). A skipped special round does not transfer its effect.
* **Hand**: each player is dealt 6 cards (captions in Caption Battle, meme images otherwise); only dealt cards can be submitted.
* **Review is anonymous** (the Host does not see authors either); approve/reject, "approve all pending", reopen (only when < 3 valid), skip (only after one reopen).
* **Results**: `CLOSE_VOTING` locks result + scores exactly once; `PUBLISH_RESULTS` reveals them. Host Award only on award rounds, stored separately, never affects points.
* **Kick**: in the lobby removes the member; in a match withdraws pending work before voting, but confirmed votes stay valid.
* **Starter pack** (toggle with `MEME_PARTY_STARTER_CONTENT`): `starter-content.ts` + `public/meme-party/starter/*.svg` (original face illustrations) are used per category only while the managed library has no active content for it, so a fresh install is playable.

## Database

Migration `supabase/migrations/0020_meme_party.sql`: `meme_party_rooms`, `meme_library_items` (kind = `memeAsset | gamePrompt | captionOption`), `meme_import_jobs`, storage bucket `meme-party`. RLS enabled with no policies (all access via service role). Apply with your usual Supabase flow (`supabase db push` or paste into the SQL editor).

Retention: rooms are never deleted automatically. Suggested cleanup (run periodically):
```sql
delete from meme_party_rooms where updated_at < now() - interval '7 days';
```
Import jobs hold normalised records/files only until you no longer need history; prune old `meme_import_jobs` rows the same way.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Existing — rooms, library, storage, broadcast nudge |
| `MEME_ADMIN_PASSWORD` | Required to enable `/tools/meme-party/library`. Unset = library management is closed |
| `MEME_PARTY_HOST_GRACE_SECONDS` | Host reconnection window (default 60) |
| `MEME_IMPORT_MAX_RECORDS` / `MEME_IMPORT_MAX_FILE_KB` / `MEME_UPLOAD_MAX_MB` | Import/upload limits (2000 / 2048 / 4) |
| `MEME_PARTY_STARTER_CONTENT` | `true` (default) lets the built-in starter pack fill categories the library lacks; `false`/`0`/`off` uses only the managed library (empty library ⇒ match cannot start) |
| `MEME_PARTY_STORE=memory` | Force the in-memory store (tests/local). Without Supabase config the memory store is used automatically **outside production only**; in production missing config errors out |

Images are stored in Supabase Storage bucket `meme-party` (public read, service-role write) at `assets/<sha256>.<ext>` — content-addressed, so the same bytes are stored once however many records use them.

## Meme library management

Open `/tools/meme-party/library` (separate from the room Host; password cookie, HttpOnly, 12 h).

* **Thư viện**: search (title / text / ID), filter by type, game mode, status, category, language; list or grid; create/edit with field-level errors; bulk activate / deactivate / soft-delete (confirmation).
* **Tải nhiều ảnh**: drag & drop JPG/PNG/WebP (≤ 4 MB each). Type is verified from the file's magic bytes (extension/header ignored), filenames sanitised, uploads rate-limited, one request per image so single files can be retried. Then set title/category/tags/modes per image → preview → confirm.
* **Import CSV / JSON**: download template/example/guide, choose the duplicate policy (skip / update / create new), **preview** (counts, per-row errors as `dòng 4.caption` or `items[1].imageUrl`, field diffs for updates, duplicate flags, image previews), then **confirm**. Optionally attach images; they match records by `filename`, or by `id` = file name without extension; ambiguous or missing matches are errors, unused files are listed.
* **Lịch sử import**: status, counts (created / updated / skipped / failed / pending), error report CSV, retry failed rows. Imports are processed in batches of 50 and are **not atomic** — the result states exactly what was committed. Creates are keyed `jobId:index` (unique), so retries and double clicks never duplicate rows.
* **Direct image URLs**: syntax/protocol checked (http/https only, no credentials, no loopback/private/link-local hosts) and previewed **in the browser**. The server never fetches remote URLs, so there is no SSRF surface; the trade-off is that URL images are hot-linked (not copied into storage) and availability is only checked client-side.

### CSV columns
`id, contentType, title, imageUrl, filename, gameMode, modes, prompt, caption, imageRef, category, tags, language, status`

| contentType | required | optional |
|---|---|---|
| `memeAsset` | `title`, and one of `imageUrl` / `filename` / `id` matching an uploaded file name | `modes` (`meme\|reaction`, default both), category, tags, language, status |
| `gamePrompt` | `gameMode` (`caption`/`meme`/`reaction`), `prompt` (≤ 280) | `imageRef` (id of a memeAsset used as situation image), title |
| `captionOption` | `caption` (≤ 140) | title |

Common: `id` (stable, `[A-Za-z0-9_.:-]{1,64}`, enables update-by-id), `category` (default `general`), `tags` (separated by `|`), `language` (default `vi`), `status` (`active`/`inactive`, default `active`). UTF-8, optional BOM, `,` or `;` delimiter, quoted multiline cells supported.

### JSON
Array of items, or `{ "version": 1, "items": [ … ] }` with the same fields (`tags`/`modes` may be arrays). See the downloadable template/example.

## Tests

```bash
npx jest __tests__/meme-party __tests__/lib/board-games-registry.test.ts   # engine, scoring, privacy, service/concurrency, API, import
npm run build && npm run lint
# multi-browser smoke test (1 Host + 5 players + shared screen + library), real Next server, memory store:
MEME_PARTY_STORE=memory MEME_ADMIN_PASSWORD=e2e-pass npx next start -p 3100 &
BASE=http://localhost:3100 SHOTS=./e2e-shots npm run e2e:meme-party
```

## Known limitations
* The Supabase store/storage implementations are written against the migration but **have not been run against a live Supabase project** (none available in the dev sandbox); the same engine/service logic is covered with the in-memory store. First deploy: apply migration 0020, set `MEME_ADMIN_PASSWORD`, then smoke-test one room and one upload.
* Presence/Host recovery depends on at least one client polling; with every client offline the room is simply preserved.
* Rate limiting is per serverless instance (best effort).
* Hotlinked URL images can disappear or block hotlinking.
* No automatic room expiry (see retention SQL).
* Starter pack is intentionally small; add real content through the library.
