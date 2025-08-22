-- Fix Auth Rate Limiting: table, atomic RPC, and RLS adjustments (idempotent)
-- Safe to run multiple times in Supabase SQL editor

-- 1) Ensure table exists
create table if not exists public.auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  scope text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  last_attempt timestamptz not null default now()
);

-- Helpful indexes
create index if not exists auth_rate_limits_identifier_scope_idx
  on public.auth_rate_limits (identifier, scope);
create index if not exists auth_rate_limits_window_idx
  on public.auth_rate_limits (window_start);

-- Unique index to enable atomic upsert semantics
create unique index if not exists idx_auth_rl_unique
  on public.auth_rate_limits(identifier, scope, window_start);

-- 2) Atomic rate limiting RPC
-- Uses SECURITY DEFINER and a scoped exec_context so RLS can allow only this function
create or replace function public.increment_auth_rate(
  p_identifier text,
  p_scope text,
  p_window_start timestamptz,
  p_limit int
) returns table(limited boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Flag execution context so RLS policies can allow this function only
  perform set_config('app.exec_context', 'increment_auth_rate', true);

  loop
    update public.auth_rate_limits
       set count = auth_rate_limits.count + 1,
           last_attempt = now()
     where identifier = p_identifier
       and scope = p_scope
       and window_start = p_window_start
     returning (count >= p_limit) into limited;

    if found then
      return;
    end if;

    begin
      insert into public.auth_rate_limits(identifier, scope, window_start, count, last_attempt)
      values (p_identifier, p_scope, p_window_start, 1, now())
      returning false into limited;
      return;
    exception when unique_violation then
      -- concurrent insert, retry loop
    end;
  end loop;
end
$$;

-- 3) RLS: enable and add targeted policies
alter table if exists public.auth_rate_limits enable row level security;

-- Base deny policy may already exist; keep it. Add permissive policies scoped to the function context.
-- INSERT policy (allow via function only)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'auth_rate_limits' and policyname = 'auth_rl_insert_via_fn'
  ) then
    create policy auth_rl_insert_via_fn on public.auth_rate_limits
      for insert with check ( current_setting('app.exec_context', true) = 'increment_auth_rate' );
  end if;
end $$;

-- UPDATE policy (allow via function only)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'auth_rate_limits' and policyname = 'auth_rl_update_via_fn'
  ) then
    create policy auth_rl_update_via_fn on public.auth_rate_limits
      for update using ( current_setting('app.exec_context', true) = 'increment_auth_rate' )
                 with check ( current_setting('app.exec_context', true) = 'increment_auth_rate' );
  end if;
end $$;

-- 4) Allow anon/authenticated to execute the RPC (table writes still constrained by RLS + exec_context)
grant execute on function public.increment_auth_rate(text, text, timestamptz, int) to anon, authenticated;

