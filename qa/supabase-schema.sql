-- =====================================================================
--  RCK QA — database schema
--  Paste this whole file into Supabase → SQL Editor → Run. Safe to
--  re-run: everything is "if not exists" / "drop policy if exists".
--
--  It can share a Supabase project with RCK Workshop, RCK Dispatch and
--  RCK HR — none of the table or bucket names clash.
-- =====================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------- jobs
-- One QA job: one site, one day, one client. Loaded before leaving the
-- yard, worked on site, signed off at the end.
--   planned → onsite → complete, and nothing else.
create table if not exists qa_jobs (
  id             uuid primary key default gen_random_uuid(),
  number         bigserial,                       -- QA-0001, QA-0002 …
  name           text not null,                   -- the site
  client         text not null default '',
  site           text not null default '',        -- address, or where on the road
  job_ref        text not null default '',        -- the client's own job number
  qa_date        date not null default current_date,

  -- What the job carries: any of milling | paving | spraying | chipseal.
  -- More than one is normal. Held as a JSON array of those keys.
  work_types     jsonb not null default '[]'::jsonb,

  description    text not null default '',
  qa_name        text not null default '',        -- who is doing the QA
  supervisor     text not null default '',        -- who is running the site

  -- The weather, set on arrival. Asked for first whenever a seal fails.
  weather        text not null default '',        -- fine|overcast|showers|rain|windy|cold
  air_temp       numeric,                         -- °C
  ground         text not null default '',        -- dry|damp|wet
  wind           text not null default '',
  weather_notes  text not null default '',

  status         text not null default 'planned'
                 check (status in ('planned','onsite','complete')),
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  started_by     text not null default '',
  completed_at   timestamptz,
  completed_by   text not null default '',
  signoff_notes  text not null default '',
  archived       boolean not null default false,  -- off the board, history kept
  updated_at     timestamptz not null default now()
);

create index if not exists qa_jobs_date_idx   on qa_jobs (qa_date desc);
create index if not exists qa_jobs_status_idx on qa_jobs (status);

-- ---------------------------------------------------------- patches
-- A patch is the unit of asphalt work and the unit of QA. It gets milled,
-- the depth is strung and read, emulsion goes down, chip goes over it, and
-- it is paved. A whole car park can be one patch with twenty depths in it.
--
-- steps is the list this patch actually gets, as [{key,label}] in the order
-- they happen. Storing the label alongside the key is what lets somebody
-- add a step of their own — a tack coat, a second coat — without a
-- migration, and what makes a report printed next year read the same as it
-- did on the day.
create table if not exists qa_patches (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references qa_jobs(id) on delete cascade,
  number        integer not null default 1,       -- its order within the job
  name          text not null default '',
  location      text not null default '',         -- where on site
  steps         jsonb not null default '[]'::jsonb,

  -- What the patch is meant to be. Every reading is judged against these.
  design_depth  numeric,                          -- mm of asphalt
  depth_tol     numeric,                          -- ± mm before it is called out
  min_temp      numeric,                          -- °C the mat must not go under

  mix           text not null default '',         -- e.g. AC10
  length_m      numeric,
  width_m       numeric,
  notes         text not null default '',
  created_by    text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists qa_patches_job_idx on qa_patches (job_id, number);

-- ----------------------------------------------------------- photos
-- One row per photo. patch_id null means the photo belongs to the whole
-- site rather than to any one patch — the closure, the dockets, the before
-- and after of the job itself.
--
-- step_label is written down at the moment the photo is taken. If the patch
-- is later renamed or a step removed, the photo still says what it was.
create table if not exists qa_photos (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references qa_jobs(id) on delete cascade,
  patch_id     uuid references qa_patches(id) on delete cascade,
  step         text not null default 'general',
  step_label   text not null default '',
  file_name    text not null default '',
  file_url     text not null default '',
  file_type    text not null default '',
  file_size    bigint not null default 0,
  caption      text not null default '',
  lat          double precision,
  lng          double precision,
  taken_at     timestamptz not null default now(),
  author       text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists qa_photos_job_idx   on qa_photos (job_id, taken_at);
create index if not exists qa_photos_patch_idx on qa_photos (patch_id, step);

-- --------------------------------------------------------- readings
-- The numbers. kind 'depth' is the string sheet: the depth written on the
-- ground at each string line, in millimetres. kind 'temp' is the mat
-- temperature as the paver lays it, in degrees.
--
-- Whether a reading passed is worked out from the patch's design_depth and
-- depth_tol rather than stored here, so correcting a design depth that was
-- typed wrong re-judges the readings instead of leaving a row that says
-- "failed" against a number that didn't.
create table if not exists qa_readings (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references qa_jobs(id) on delete cascade,
  patch_id     uuid not null references qa_patches(id) on delete cascade,
  kind         text not null default 'depth' check (kind in ('depth','temp')),
  seq          integer not null default 1,        -- 1, 2, 3 … within the patch
  value        numeric not null,
  unit         text not null default 'mm',
  position     text not null default '',          -- "Ch 12 LHS", if they wrote one
  taken_at     timestamptz not null default now(),
  author       text not null default ''
);

create index if not exists qa_readings_patch_idx on qa_readings (patch_id, kind, seq);
create index if not exists qa_readings_job_idx   on qa_readings (job_id, kind);

-- Columns added after the first release go here as
--   alter table <t> add column if not exists <c> <type>;
-- "create table if not exists" above does nothing to a table that already
-- exists, so this block is what makes the file safe to re-run over a live
-- database and is how an older one catches up.

-- keep updated_at honest even if a client forgets to set it
create or replace function touch_qa_job() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists qa_jobs_touch on qa_jobs;
create trigger qa_jobs_touch before update on qa_jobs
  for each row execute function touch_qa_job();

-- =====================================================================
--  Access
--
--  Like the other RCK apps, this is an internal tool with no logins: every
--  device uses the same public "anon" key, so anyone who has the app URL
--  and that key can read and write. That is deliberate — the QAs have no
--  password to lose in a wet high-vis. The QA/Manager split is about
--  keeping a gloved thumb from deleting somebody's day, not about secrecy:
--  don't put anything you would mind an RCK phone seeing into the app, and
--  don't publish the link outside RCK.
-- =====================================================================
alter table qa_jobs     enable row level security;
alter table qa_patches  enable row level security;
alter table qa_photos   enable row level security;
alter table qa_readings enable row level security;

drop policy if exists qa_jobs_all     on qa_jobs;
drop policy if exists qa_patches_all  on qa_patches;
drop policy if exists qa_photos_all   on qa_photos;
drop policy if exists qa_readings_all on qa_readings;

create policy qa_jobs_all     on qa_jobs     for all to anon, authenticated using (true) with check (true);
create policy qa_patches_all  on qa_patches  for all to anon, authenticated using (true) with check (true);
create policy qa_photos_all   on qa_photos   for all to anon, authenticated using (true) with check (true);
create policy qa_readings_all on qa_readings for all to anon, authenticated using (true) with check (true);

-- =====================================================================
--  File storage — the site photos
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('qa-files', 'qa-files', true)
on conflict (id) do update set public = true;

drop policy if exists qa_files_read  on storage.objects;
drop policy if exists qa_files_write on storage.objects;

create policy qa_files_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'qa-files');

create policy qa_files_write on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'qa-files');
