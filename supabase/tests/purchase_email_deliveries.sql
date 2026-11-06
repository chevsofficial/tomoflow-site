-- Safe integration check: synthetic records exist only inside a rolled-back transaction.
begin;
do $$
begin
  if has_table_privilege('anon', 'public.purchase_email_deliveries', 'SELECT')
     or has_table_privilege('authenticated', 'public.purchase_email_deliveries', 'INSERT')
     or has_table_privilege('service_role', 'public.purchase_email_deliveries', 'DELETE')
     or has_column_privilege('service_role', 'public.purchase_email_deliveries', 'mail', 'UPDATE') then
    raise exception 'Unexpected delivery table privileges';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.purchase_email_deliveries'::regclass) then
    raise exception 'RLS must be enabled';
  end if;
end $$;
set local role service_role;
insert into public.purchase_email_deliveries (delivery_key, mail)
values ('integration-check-rollback-only', '{"subject":"original"}')
on conflict (delivery_key) do nothing;
insert into public.purchase_email_deliveries (delivery_key, mail)
values ('integration-check-rollback-only', '{"subject":"replacement"}')
on conflict (delivery_key) do nothing;
update public.purchase_email_deliveries set sent = 'synthetic-email-id'
where delivery_key = 'integration-check-rollback-only';
do $$
begin
  if not exists (
    select 1 from public.purchase_email_deliveries
    where delivery_key = 'integration-check-rollback-only'
      and mail->>'subject' = 'original'
      and started > 0 and sent = 'synthetic-email-id'
  ) then
    raise exception 'Outbox duplicate/persistence check failed';
  end if;
end $$;
rollback;
