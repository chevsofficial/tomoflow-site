-- Keep the Supabase-provisioned DDL event trigger, but remove API-role access.
-- Conditional so the email migrations also work in projects without this helper.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
