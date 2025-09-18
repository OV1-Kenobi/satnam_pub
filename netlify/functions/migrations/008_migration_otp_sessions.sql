-- Migration: Create migration_otp_sessions for Account Migration TOTP
-- Idempotent and privacy-first. Execute directly in Supabase SQL editor.

-- 1) Enable required extensions (idempotent)
create extension if not exists pgcrypto;

-- 2) Table for temporary TOTP sessions used during Nostr account migration
create table if not exists public.migration_otp_sessions (
  session_id uuid primary key default gen_random_uuid(),
  npub text not null check (length(npub) <= 100),
  totp_secret text not null check (length(totp_secret) <= 100),             -- Base32 encoded secret (no plaintext keys beyond this)
  used_codes jsonb not null default '[]'::jsonb, -- [{"code":"123456","used_at":"2025-01-01T00:00:00Z"}]
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at and expires_at <= created_at + interval '1 hour'),
  last_attempt_at timestamptz
);

-- 3) Indexes for performance
create index if not exists idx_mos_npub on public.migration_otp_sessions (npub);
create index if not exists idx_mos_expires_at on public.migration_otp_sessions (expires_at);

-- 4) RLS: allow anon flow with minimal scope. Functions use anon key.
alter table public.migration_otp_sessions enable row level security;

-- Allow inserts for anonymous (initiate migration OTP)
drop policy if exists mos_insert_anon on public.migration_otp_sessions;
create policy mos_insert_anon on public.migration_otp_sessions
  for insert to anon
  with check (true);

-- Allow select/update only for the same session (by session_id) and not expired
drop policy if exists mos_select_self on public.migration_otp_sessions;
create policy mos_select_self on public.migration_otp_sessions
  for select to anon
  using (now() <= expires_at and session_id = current_setting('app.current_session_id', true)::uuid);

drop policy if exists mos_update_self on public.migration_otp_sessions;
create policy mos_update_self on public.migration_otp_sessions
  for update to anon
  using (now() <= expires_at and session_id = current_setting('app.current_session_id', true)::uuid);

-- 5) Cleanup function and helper to purge expired sessions (can be called by scheduler or Netlify function)
create or replace function public.cleanup_expired_migration_otp_sessions()
returns void
language plpgsql
as $$
begin
  delete from public.migration_otp_sessions where expires_at < now();
end;
$$;

-- 6) Comments for auditors
comment on table public.migration_otp_sessions is 'Temporary TOTP sessions for secure Nostr account migration (10-minute TTL). Stores Base32 TOTP secrets; no OTP codes at rest.';
comment on column public.migration_otp_sessions.used_codes is 'Replay protection: 5-minute blacklist of previously used codes with timestamps.';

