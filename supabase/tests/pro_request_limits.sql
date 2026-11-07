begin;
set local role service_role;
do $$
begin
  if not public.claim_pro_requests(array[repeat('a',64)], array[1], array[1800]) then raise exception 'First claim denied'; end if;
  if public.claim_pro_requests(array[repeat('a',64)], array[1], array[1800]) then raise exception 'Replay accepted'; end if;
  if not public.claim_pro_requests(array[repeat('b',64),repeat('c',64)], array[2,1], array[900,3600]) then raise exception 'First limits denied'; end if;
  if public.claim_pro_requests(array[repeat('b',64),repeat('c',64)], array[2,1], array[900,3600]) then raise exception 'Email limit ignored'; end if;
  update public.pro_request_limits set resets_at = now()-interval '1 second' where request_key=repeat('a',64);
  if not public.claim_pro_requests(array[repeat('a',64)], array[1], array[1800]) then raise exception 'Expired window did not reset'; end if;
  if has_function_privilege('anon','public.claim_pro_requests(text[],integer[],integer[])','EXECUTE')
     or has_table_privilege('authenticated','public.pro_request_limits','SELECT') then raise exception 'Public privileges found'; end if;
end $$;
rollback;
