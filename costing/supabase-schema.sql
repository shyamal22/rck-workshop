-- =====================================================================
--  RCK Costing — database schema
--  Paste this whole file into Supabase → SQL Editor → Run. Safe to
--  re-run: everything is "if not exists" / "drop policy if exists", so
--  running it again over live data only adds what is missing.
--
--  It can share a Supabase project with RCK Workshop, Dispatch and HR —
--  none of the table names clash.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
--  Jobs
--
--  One row per job being costed. The two cost breakdowns are jsonb maps
--  keyed by the lines in COST_LINES in app.js — {"labour": 12000,
--  "plant": 4300, ...} — so a line can be added to the app without a
--  migration here. A key that is absent means nobody has said yet; it is
--  never read as a zero.
-- =====================================================================
create table if not exists cost_jobs (
  id             uuid primary key default gen_random_uuid(),
  number         bigserial,                      -- JC-0001, JC-0002 ...
  name           text not null,
  client         text not null default '',
  site           text not null default '',
  work_type      text not null default 'other',  -- milling|paving|other …
  reference      text not null default '',       -- client PO / contract number
  description    text not null default '',
  status         text not null default 'quoted'
                 check (status in ('quoted','running','completed')),
  start_date     date,
  end_date       date,

  contract_value numeric,                        -- agreed price for the base job, excl GST
  expected_costs jsonb not null default '{}'::jsonb,
  actual_costs   jsonb not null default '{}'::jsonb,
  claim_value    numeric,                        -- what was actually claimed for the base job
  invoice_ref    text not null default '',
  claimed_on     date,

  archived       boolean not null default false,
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists cost_jobs_status_idx on cost_jobs (status);
create index if not exists cost_jobs_dates_idx  on cost_jobs (start_date, end_date);

-- =====================================================================
--  Variations
--
--  Extra work outside the agreed price: what it cost us, and what was
--  claimed for it. A declined variation stays on the record but is left
--  out of every total the app adds up.
-- =====================================================================
create table if not exists cost_variations (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references cost_jobs(id) on delete cascade,
  title        text not null default '',
  detail       text not null default '',
  status       text not null default 'approved'
               check (status in ('approved','pending','declined')),
  cost         numeric,
  claim_value  numeric,
  dated        date,
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists cost_variations_job_idx on cost_variations (job_id, created_at);

-- =====================================================================
--  Comments — the two of you talking about one job, kept with the job
-- =====================================================================
create table if not exists cost_comments (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references cost_jobs(id) on delete cascade,
  body       text not null default '',
  author     text not null default '',
  at         timestamptz not null default now()
);

create index if not exists cost_comments_job_idx on cost_comments (job_id, at);

-- keep updated_at honest even if a client forgets to set it
create or replace function cost_touch() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists cost_jobs_touch on cost_jobs;
create trigger cost_jobs_touch before update on cost_jobs
  for each row execute function cost_touch();

drop trigger if exists cost_variations_touch on cost_variations;
create trigger cost_variations_touch before update on cost_variations
  for each row execute function cost_touch();

-- =====================================================================
--  Access
--
--  Like RCK Workshop and RCK Dispatch, and unlike RCK HR, this is an
--  internal tool with no logins: both devices use the same public "anon"
--  key, so anyone who has the app URL and that key can read and write.
--
--  This database holds what every job made, so guard the key accordingly:
--  it is deliberately left out of config.js, entered once per device in
--  Settings instead, and the setup link that carries it should only ever
--  go to the two of you.
-- =====================================================================
alter table cost_jobs       enable row level security;
alter table cost_variations enable row level security;
alter table cost_comments   enable row level security;

drop policy if exists cost_jobs_rw     on cost_jobs;
drop policy if exists cost_var_rw      on cost_variations;
drop policy if exists cost_comments_rw on cost_comments;

create policy cost_jobs_rw     on cost_jobs      for all to anon, authenticated using (true) with check (true);
create policy cost_var_rw      on cost_variations for all to anon, authenticated using (true) with check (true);
create policy cost_comments_rw on cost_comments   for all to anon, authenticated using (true) with check (true);
