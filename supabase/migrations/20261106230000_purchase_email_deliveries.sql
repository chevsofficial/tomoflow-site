-- One durable outbox record per Stripe Checkout Session and test/live mode.
create table public.purchase_email_deliveries (
  delivery_key text primary key,
  started bigint not null default (floor(extract(epoch from clock_timestamp()) * 1000)::bigint),
  mail jsonb not null check (jsonb_typeof(mail) = 'object'),
  sent text
);

alter table public.purchase_email_deliveries enable row level security;
-- No browser/user access, even if application authentication is added later.
revoke all on public.purchase_email_deliveries from public, anon, authenticated, service_role;
grant select, insert on public.purchase_email_deliveries to service_role;
-- A successful send can update only its marker, not the original payload/timestamp.
grant update (sent) on public.purchase_email_deliveries to service_role;
