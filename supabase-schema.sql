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
--  Manuals — the books the crew need on site
--
--  Operator and workshop manuals, parts books, service schedules. Not
--  tied to a machine or a job: a manual covers a model, and the same
--  book serves every one of them. Uploading it once puts it in
--  everyone's pocket.
-- =====================================================================
create table if not exists manuals (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  note       text not null default '',
  file       jsonb not null default '{}'::jsonb,   -- { url, name, type, size }
  added_by   text not null default '',
  created_at timestamptz not null default now()
);

alter table manuals enable row level security;
drop policy if exists manuals_all on manuals;
create policy manuals_all on manuals for all to anon, authenticated using (true) with check (true);

-- =====================================================================
--  Planned servicing and maintenance
--
--  The other half of the job: the work you do so the gear doesn't break,
--  rather than because it has. A plan is a rule — this service, every so
--  many months and/or so many hours — and the log is what actually
--  happened. When it is next due is worked out from the two, never
--  stored, so it can't drift.
--
--  Deliberately separate from work orders. A service falling due does
--  not take a machine out of operation, and does not change its colour
--  on the gear board: that still answers only "can we use it today".
-- =====================================================================
alter table gear add column if not exists hours     numeric;
alter table gear add column if not exists hours_at  timestamptz;
alter table gear add column if not exists hours_by  text not null default '';

create table if not exists service_plans (
  id           uuid primary key default gen_random_uuid(),
  gear_id      uuid references gear(id) on delete cascade,
  name         text not null default '',
  every_months integer,                      -- either, or both; whichever comes first
  every_hours  integer,
  starts_on    date,                          -- the clock starts here until the first service
  start_hours  numeric,
  note         text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists service_log (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid references service_plans(id) on delete cascade,
  gear_id    uuid,
  name       text not null default '',        -- kept on the row, so history reads
  done_on    date not null default current_date,
  hours      numeric,
  done_by    text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now()
);

alter table service_plans enable row level security;
alter table service_log   enable row level security;
drop policy if exists service_plans_all on service_plans;
drop policy if exists service_log_all   on service_log;
create policy service_plans_all on service_plans for all to anon, authenticated using (true) with check (true);
create policy service_log_all   on service_log   for all to anon, authenticated using (true) with check (true);

-- =====================================================================
--  Removed features
--
--  The maintenance crew and costs sections were taken out of the app.
--  Their tables are deliberately NOT dropped here — this file is re-run
--  routinely, and a drop would destroy the record the moment anyone did.
--  They simply sit unused and cost nothing.
--
--  To clear them out for good, run these by hand, once, knowingly:
--
--    drop table if exists crew_log;
--    drop table if exists crew;
--    drop table if exists costs;
--    alter table work_orders drop column if exists assigned_to;
-- =====================================================================
