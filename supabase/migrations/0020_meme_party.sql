-- Meme Party: realtime party game rooms + managed meme library.
--
-- Rooms are one JSONB document per room guarded by a `rev` counter: every
-- write is `UPDATE ... WHERE id = ? AND rev = ?`, which makes concurrent
-- votes/commands atomic (the loser re-reads and re-applies). All access goes
-- through API routes with the service-role key, so RLS is enabled with no
-- policies (default deny) to block direct anon-key access.

create table if not exists meme_party_rooms (
  id uuid primary key,
  code text not null unique,
  state jsonb not null,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table meme_party_rooms enable row level security;
create index if not exists meme_party_rooms_updated_idx on meme_party_rooms (updated_at);

-- One table with a `kind` discriminator:
--   memeAsset     image_url (+ modes)        -- a reusable image
--   gamePrompt    game_mode + text           -- situation / event / quote (optional asset_id image)
--   captionOption text                       -- caption cards for Caption Battle
-- Rows are soft-deleted (deleted_at) so running and finished matches never
-- lose referenced content; matches also keep their own snapshot of content.
create table if not exists meme_library_items (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  kind text not null check (kind in ('memeAsset', 'gamePrompt', 'captionOption')),
  title text not null default '',
  text text not null default '',
  image_url text not null default '',
  storage_path text,
  original_filename text,
  mime text,
  width integer,
  height integer,
  sha256 text,
  game_mode text check (game_mode in ('caption', 'meme', 'reaction')),
  modes text[] not null default '{}',
  asset_id uuid references meme_library_items (id),
  category text not null default 'general',
  tags text[] not null default '{}',
  language text not null default 'vi',
  status text not null default 'active' check (status in ('active', 'inactive')),
  import_key text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table meme_library_items enable row level security;
create unique index if not exists meme_library_external_id_uq on meme_library_items (external_id) where external_id is not null and deleted_at is null;
-- A retried import commit can never create the same row twice.
create unique index if not exists meme_library_import_key_uq on meme_library_items (import_key) where import_key is not null;
create index if not exists meme_library_kind_status_idx on meme_library_items (kind, status) where deleted_at is null;
create index if not exists meme_library_sha_idx on meme_library_items (sha256) where sha256 is not null;

create table if not exists meme_import_jobs (
  id uuid primary key,
  kind text not null,
  filename text not null,
  status text not null,
  created_by text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  data jsonb not null
);
alter table meme_import_jobs enable row level security;
create index if not exists meme_import_jobs_started_idx on meme_import_jobs (started_at desc);

-- Public-read bucket for library images; writes happen only through the service role.
insert into storage.buckets (id, name, public)
values ('meme-party', 'meme-party', true)
on conflict (id) do nothing;
