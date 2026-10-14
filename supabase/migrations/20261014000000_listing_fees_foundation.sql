-- Dar listing monetization foundation
-- Safe foundation only: no payment provider, live charges, or production secrets.
-- Review in staging and confirm existing schema before applying to production.

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 5 and 160),
  description text not null default '',
  property_type text not null check (property_type in ('hotel','apartment','house','guesthouse','other')),
  country_code char(2) not null,
  city text not null,
  address text,
  currency char(3) not null default 'USD',
  nightly_price numeric(12,2) check (nightly_price is null or nightly_price >= 0),
  media_urls text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft','pending_review','approved','rejected','published','suspended','expired')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists properties_owner_created_idx on public.properties(owner_id, created_at desc);
create index if not exists properties_discovery_idx on public.properties(country_code, city, property_type) where status = 'published';

create table if not exists public.listing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  duration_days integer not null check (duration_days = 30),
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency char(3) not null default 'USD',
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Prices are intentionally inactive until the operator configures market, currency,
-- taxes, legal terms, and a payment provider. The first-property promotion is
-- granted transactionally by trusted server code, never by the browser.
insert into public.listing_plans (code, name, duration_days, price_minor, currency, is_active)
values ('launch-30d', 'Launch listing - 30 days', 30, 0, 'USD', false)
on conflict (code) do nothing;

create table if not exists public.listing_orders (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.listing_plans(id) on delete restrict,
  order_type text not null check (order_type in ('first_listing_free','paid_listing','renewal')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null,
  status text not null default 'pending'
    check (status in ('pending','awaiting_payment','paid','free_granted','cancelled','refunded','failed')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists listing_orders_owner_created_idx on public.listing_orders(owner_id, created_at desc);
create index if not exists listing_orders_property_idx on public.listing_orders(property_id, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.listing_orders(id) on delete restrict,
  provider text not null default 'unconfigured',
  provider_payment_id text,
  status text not null default 'not_configured'
    check (status in ('not_configured','pending','succeeded','failed','cancelled','refunded')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null,
  verified_at timestamptz,
  provider_event_id text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);
create index if not exists payments_order_idx on public.payments(order_id, created_at desc);

create table if not exists public.listing_entitlements (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  order_id uuid not null unique references public.listing_orders(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null check (source in ('launch_free','paid')),
  created_at timestamptz not null default now(),
  constraint listing_entitlement_dates_valid check (ends_at > starts_at)
);
create index if not exists listing_entitlements_property_end_idx on public.listing_entitlements(property_id, ends_at desc);

-- Limited launch promotion: deliberately inactive until an operator sets a cap
-- and activates it. A trusted server transaction must atomically consume a slot.
create table if not exists public.listing_promotion_config (
  code text primary key check (code = 'launch-limited'),
  max_claims integer not null check (max_claims > 0),
  claims_used integer not null default 0 check (claims_used >= 0 and claims_used <= max_claims),
  is_active boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_promotion_claims (
  id uuid primary key default gen_random_uuid(),
  promotion_code text not null references public.listing_promotion_config(code) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null unique references public.properties(id) on delete restrict,
  order_id uuid not null unique references public.listing_orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (promotion_code, owner_id)
);
alter table public.listing_promotion_config enable row level security;
alter table public.listing_promotion_claims enable row level security;

create table if not exists public.listing_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  order_id uuid references public.listing_orders(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists listing_audit_logs_created_idx on public.listing_audit_logs(created_at desc);

alter table public.properties enable row level security;
alter table public.listing_plans enable row level security;
alter table public.listing_orders enable row level security;
alter table public.payments enable row level security;
alter table public.listing_entitlements enable row level security;
alter table public.listing_audit_logs enable row level security;

-- Owners can manage only their own drafts/submissions. Review/publish actions
-- must be performed by a trusted server-side admin process.
drop policy if exists properties_owner_select on public.properties;
create policy properties_owner_select on public.properties
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists properties_owner_insert on public.properties;
create policy properties_owner_insert on public.properties
  for insert to authenticated with check (owner_id = (select auth.uid()) and status in ('draft','pending_review'));
drop policy if exists properties_owner_update on public.properties;
create policy properties_owner_update on public.properties
  for update to authenticated using (owner_id = (select auth.uid()) and status in ('draft','rejected'))
  with check (owner_id = (select auth.uid()) and status in ('draft','pending_review','rejected'));
drop policy if exists properties_owner_delete on public.properties;
create policy properties_owner_delete on public.properties
  for delete to authenticated using (owner_id = (select auth.uid()) and status in ('draft','rejected'));

-- Public discovery is exposed through a filtered view, not direct table access.
-- The view returns only published properties with a currently valid entitlement.
create or replace view public.public_properties as
select p.id, p.title, p.description, p.property_type, p.country_code, p.city,
       p.currency, p.nightly_price, p.media_urls, p.created_at
from public.properties p
where p.status = 'published'
  and exists (
    select 1
    from public.listing_entitlements e
    where e.property_id = p.id
      and e.starts_at <= now()
      and e.ends_at > now()
  );
grant select on public.public_properties to anon, authenticated;

drop policy if exists listing_plans_read_active on public.listing_plans;
create policy listing_plans_read_active on public.listing_plans
  for select to anon, authenticated using (is_active = true);

drop policy if exists listing_orders_owner_read on public.listing_orders;
create policy listing_orders_owner_read on public.listing_orders
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists payments_owner_read on public.payments;
create policy payments_owner_read on public.payments
  for select to authenticated using (
    exists (select 1 from public.listing_orders o
            where o.id = payments.order_id and o.owner_id = (select auth.uid()))
  );
drop policy if exists listing_entitlements_owner_read on public.listing_entitlements;
create policy listing_entitlements_owner_read on public.listing_entitlements
  for select to authenticated using (owner_id = (select auth.uid()));

-- No client INSERT/UPDATE policies for orders, payments, entitlements, audit logs:
-- trusted server-side code must validate ownership, promotion eligibility,
-- payment webhooks, and idempotency before writing these records.
