-- Emulator ROM library: admin-managed ROM files stored in Cloudinary
-- (folder "emulator_rom"), listed on the public emulator page filtered by
-- system. All access is mediated by API routes using the service-role key
-- (admin routes for writes, a public route for read-only listing), so RLS
-- is enabled with no policies (default deny) to block direct anon-key access.

create table if not exists emulator_roms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  system text not null check (system in ('nes', 'snes', 'gba', 'gbc', 'n64', 'arcade')),
  url text not null,
  public_id text not null,
  bytes bigint not null,
  cover_url text,
  cover_public_id text,
  created_at timestamptz not null default now()
);

create index if not exists emulator_roms_system_idx on emulator_roms (system, created_at desc);

alter table emulator_roms enable row level security;
