create table public.pro_request_limits (
  request_key text primary key,
  attempts integer not null check (attempts > 0),
  resets_at timestamptz not null
);
create index pro_request_limits_expiry on public.pro_request_limits (resets_at);
alter table public.pro_request_limits enable row level security;
revoke all on public.pro_request_limits from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.pro_request_limits to service_role;

-- Invoker privileges only. Atomic upserts serialize simultaneous requests per key.
create function public.claim_pro_requests(p_keys text[], p_limits integer[], p_windows integer[])
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  i integer;
  current_attempts integer;
  allowed boolean := true;
begin
  if cardinality(p_keys) not between 1 and 2
     or cardinality(p_keys) <> cardinality(p_limits)
     or cardinality(p_keys) <> cardinality(p_windows) then
    raise exception 'Invalid request limits';
  end if;
  delete from public.pro_request_limits where resets_at < now() - interval '1 day';
  for i in 1..cardinality(p_keys) loop
    if p_keys[i] !~ '^[a-f0-9]{64}$' or p_limits[i] not between 1 and 100
       or p_windows[i] not between 1 and 86400 then
      raise exception 'Invalid request limit';
    end if;
    insert into public.pro_request_limits as existing (request_key, attempts, resets_at)
    values (p_keys[i], 1, now() + make_interval(secs => p_windows[i]))
    on conflict (request_key) do update set
      attempts = case when existing.resets_at <= now() then 1 else least(existing.attempts + 1, 101) end,
      resets_at = case when existing.resets_at <= now() then excluded.resets_at else existing.resets_at end
    returning attempts into current_attempts;
    if current_attempts > p_limits[i] then allowed := false; end if;
  end loop;
  return allowed;
end $$;
revoke all on function public.claim_pro_requests(text[], integer[], integer[]) from public, anon, authenticated;
grant execute on function public.claim_pro_requests(text[], integer[], integer[]) to service_role;
