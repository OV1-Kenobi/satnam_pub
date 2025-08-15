-- Ensure uniqueness for atomic rate limiting
create unique index if not exists idx_auth_rl_unique
  on auth_rate_limits(identifier, scope, window_start);

-- Atomic increment function for auth rate limiting
create or replace function increment_auth_rate(
  p_identifier text, p_scope text, p_window_start timestamptz, p_limit int
) returns table(limited boolean) language plpgsql as $$
begin
  loop
    update auth_rate_limits
       set count = count + 1, last_attempt = now()
     where identifier = p_identifier and scope = p_scope and window_start = p_window_start
     returning count >= p_limit into limited;
    if found then return; end if;

    begin
      insert into auth_rate_limits(identifier, scope, window_start, count, last_attempt)
      values (p_identifier, p_scope, p_window_start, 1, now())
      returning false into limited;
      return;
    exception when unique_violation then
      -- concurrent insert, retry
    end;
  end loop;
end $$;

