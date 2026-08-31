-- =====================================================================
--  RCK Workshop — database schema
--  Paste this whole file into Supabase → SQL Editor → Run. Safe to
--  re-run: everything is "if not exists" / "drop policy if exists".
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- gear
create table if not exists gear (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,          -- MIL-01, TRK-03 ...
  name                text not null default '',      -- plain-English name
  category            text not null default 'other', -- miller|paver|roller|bobcat|truck|trailer|other
  make_model          text not null default '',
  location            text not null default '',      -- where the gear is right now
  location_updated_at timestamptz,
  location_updated_by text not null default '',
  notes               text not null default '',
  retired             boolean not null default false,
  created_at          timestamptz not null default now()
);

-- --------------------------------------------------------- work orders
create table if not exists work_orders (
  id                 uuid primary key default gen_random_uuid(),
  number             bigserial,                      -- WO-0001, WO-0002 ...
  gear_id            uuid not null references gear(id) on delete cascade,
  title              text not null,
  description        text not null default '',
  -- orange = damaged but still usable, red = out of operation
  severity           text not null default 'orange'
                     check (severity in ('orange','red')),
  status             text not null default 'new'
                     check (status in ('new','in_progress','awaiting_parts',
                                       'with_external','complete','cancelled')),
  repairer           text check (repairer in ('internal','external')),
  external_company   text not null default '',
  external_ref       text not null default '',       -- their job/invoice number
  cost               numeric,
  target_date        date,                           -- expected back-in-service date
  reported_by        text not null default '',
  reported_at        timestamptz not null default now(),
  location_at_report text not null default '',
  completed_at       timestamptz,
  completed_by       text not null default '',
  work_done          text not null default '',       -- what was actually done
  updated_at         timestamptz not null default now()
);

create index if not exists work_orders_gear_idx   on work_orders (gear_id);
create index if not exists work_orders_status_idx on work_orders (status);

-- ------------------------------------- work order timeline / comments
-- kind: created | comment | status | external | file | complete | reopen
create table if not exists wo_updates (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  created_at    timestamptz not null default now(),
  author        text not null default '',
  role          text not null default '',
  kind          text not null default 'comment',
  body          text not null default '',
  meta          jsonb not null default '{}'::jsonb   -- file info, status from/to
);

create index if not exists wo_updates_wo_idx on wo_updates (work_order_id, created_at);

-- keep updated_at honest even if a client forgets to set it
create or replace function touch_work_order() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists work_orders_touch on work_orders;
create trigger work_orders_touch before update on work_orders
  for each row execute function touch_work_order();

-- =====================================================================
--  Access
--
--  This is an internal tool with no logins: every device uses the same
--  public "anon" key, so anyone who has the app URL and key can read and
--  write. That is deliberate — it keeps the app usable for the crew with
--  no passwords to lose. Do not put anything confidential in here, and
--  don't publish the app URL outside RCK.
-- =====================================================================
alter table gear        enable row level security;
alter table work_orders enable row level security;
alter table wo_updates  enable row level security;

drop policy if exists gear_all        on gear;
drop policy if exists work_orders_all on work_orders;
drop policy if exists wo_updates_all  on wo_updates;

create policy gear_all        on gear        for all to anon, authenticated using (true) with check (true);
create policy work_orders_all on work_orders for all to anon, authenticated using (true) with check (true);
create policy wo_updates_all  on wo_updates  for all to anon, authenticated using (true) with check (true);

-- =====================================================================
--  File storage — photos of damage and paperwork from external repairers
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('workshop-files', 'workshop-files', true)
on conflict (id) do update set public = true;

drop policy if exists workshop_files_read  on storage.objects;
drop policy if exists workshop_files_write on storage.objects;

create policy workshop_files_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'workshop-files');

create policy workshop_files_write on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'workshop-files');

-- =====================================================================
--  Costs — planned and actual spend against each asset.
--
--  Deliberately independent of work orders: nothing here feeds the
--  maintenance side and nothing there feeds this. A repair cost recorded
--  on a work order does NOT appear in the cost tracker, and vice versa.
-- =====================================================================
create table if not exists costs (
  id          uuid primary key default gen_random_uuid(),
  gear_id     uuid not null references gear(id) on delete cascade,
  kind        text not null default 'actual' check (kind in ('planned','actual')),
  amount      numeric not null default 0,
  description text not null default '',
  incurred_on date,                                  -- when the cost was incurred
  payment_on  date,                                  -- when payment is/was due
  files       jsonb not null default '[]'::jsonb,    -- invoices and attachments
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists costs_gear_idx     on costs (gear_id);
create index if not exists costs_incurred_idx on costs (incurred_on);
create index if not exists costs_payment_idx  on costs (payment_on);

drop trigger if exists costs_touch on costs;
create trigger costs_touch before update on costs
  for each row execute function touch_work_order();

alter table costs enable row level security;
drop policy if exists costs_all on costs;
create policy costs_all on costs for all to anon, authenticated using (true) with check (true);

-- =====================================================================
--  Maintenance crew — who is managing each work order
--
--  Separate from `repairer`, which says whether the spanners are RCK's or
--  an external company's. Every job has an RCK person accountable for it
--  either way.
-- =====================================================================
alter table work_orders add column if not exists assigned_to text not null default '';
create index if not exists work_orders_assigned_idx on work_orders (assigned_to);

create table if not exists crew (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table crew enable row level security;
drop policy if exists crew_all on crew;
create policy crew_all on crew for all to anon, authenticated using (true) with check (true);

-- The starting crew. Re-running this never duplicates or renames anyone.
insert into crew (name, created_at) values
  ('Milian',    now()),
  ('Clint',     now() + interval '1 second'),
  ('Ryder',     now() + interval '2 seconds'),
  ('Sebastion', now() + interval '3 seconds'),
  ('Lyndon',    now() + interval '4 seconds'),
  ('Barry',     now() + interval '5 seconds')
on conflict (name) do nothing;
