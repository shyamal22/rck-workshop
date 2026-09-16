-- =====================================================================
--  RCK Dispatch — database schema
--  Paste this whole file into Supabase → SQL Editor → Run. Safe to
--  re-run: everything is "if not exists" / "drop policy if exists".
--
--  It can share a Supabase project with RCK Workshop — none of the table
--  or bucket names clash.
-- =====================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------ projects
-- A project is one job: a site, a type of work, and a span of days.
-- planned → ongoing → completed, and nothing else.
create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  number         bigserial,                      -- JOB-0001, JOB-0002 ...
  name           text not null,
  client         text not null default '',
  site           text not null default '',       -- address or description
  work_type      text not null default 'other',  -- milling|paving|other …
  description    text not null default '',       -- scope in a sentence or two
  status         text not null default 'planned'
                 check (status in ('planned','ongoing','completed')),
  start_date     date,                           -- planned first day on site
  end_date       date,                           -- planned last day on site
  supervisor     text not null default '',       -- who is running it on site
  contact        text not null default '',       -- client contact / phone
  created_by     text not null default '',
  created_at     timestamptz not null default now(),
  started_at     timestamptz,                    -- when work actually began
  started_by     text not null default '',
  completed_at   timestamptz,
  completed_by   text not null default '',
  completion_notes text not null default '',
  archived       boolean not null default false, -- hidden from the board, history kept
  -- What the job is worth and what it cost us. Entered by the office or a
  -- director, never shown on a site phone. Left null until somebody knows.
  contract_value numeric,
  actual_cost    numeric,
  -- Which crew is on it. Blank until the office assigns one.
  crew           text not null default '',
  updated_at     timestamptz not null default now()
);

-- Columns added after the first release. "create table if not exists" above
-- does nothing to a table that already exists, so they are added here too —
-- which is what makes this file safe to re-run over a live database.
alter table projects add column if not exists contract_value numeric;
alter table projects add column if not exists actual_cost    numeric;
alter table projects add column if not exists crew           text not null default '';
alter table projects add column if not exists actual_invoice numeric;
alter table projects add column if not exists variations     numeric;
alter table projects add column if not exists pnl_notes      text not null default '';

create index if not exists projects_crew_idx on projects (crew);

create index if not exists projects_status_idx on projects (status);
create index if not exists projects_dates_idx  on projects (start_date, end_date);

-- ------------------------------------------------------------ documents
-- Everything the office puts on the job: PMP, scope, job cards, TMP,
-- drawings, spreadsheets, photos of the mark-out — any file at all.
--
-- audience decides who sees it:
--   all         everyone on the job
--   supervisor  the site crew (office sees it too — they put it there)
--   office      office only; supervisors never see it listed
create table if not exists project_docs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  kind         text not null default 'other',   -- pmp|scope|jobcard|tmp|swms|drawing|permit|other
  title        text not null default '',
  audience     text not null default 'all'
               check (audience in ('all','supervisor','office')),
  file_name    text not null default '',
  file_url     text not null default '',
  file_type    text not null default '',
  file_size    bigint not null default 0,
  notes        text not null default '',
  uploaded_by  text not null default '',
  uploaded_at  timestamptz not null default now()
);

create index if not exists project_docs_project_idx on project_docs (project_id, uploaded_at);

-- Who added it, by id as well as by name — the id survives a respelling.
alter table project_docs add column if not exists user_id uuid;

-- ------------------------------------------------------------- people
-- A person is only ever a name typed into Settings — there are no accounts
-- in this app and there is no wish for any. This table hangs the few things
-- that belong to a person rather than to a device off that name, so a photo
-- set on Tane's phone is the one the office sees when it prints Tane's day.
--
-- name_key is the name folded to lower case, which is how the rest of the
-- app decides two entries were written by the same person.
create table if not exists crew_people (
  id           uuid primary key default gen_random_uuid(),
  name_key     text not null unique,
  name         text not null default '',
  photo_url    text not null default '',
  photo_name   text not null default '',
  role         text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   text not null default ''
);

create index if not exists crew_people_key_idx on crew_people (name_key);

-- Added when sign-in arrived. A person's row is what lets them in: the
-- director puts their phone or email here, they sign in with a code sent to
-- it, and user_id is filled in the first time. active = false is how access
-- is taken away — the row and every entry they ever wrote stay.
alter table crew_people add column if not exists user_id uuid unique;
alter table crew_people add column if not exists phone   text not null default '';
alter table crew_people add column if not exists email   text not null default '';
alter table crew_people add column if not exists active  boolean not null default true;

-- --------------------------------------------------------- job costing
-- One line of what a finished job actually cost: a description and an
-- amount. The costing is filled in after the job is done, so there is no
-- estimate to keep in step with — what is here is what it came to.
create table if not exists job_costs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  kind         text not null default 'other',   -- kept from the old form; nothing writes it now
  label        text not null default '',        -- the description typed in
  unit         text not null default '',        -- tonnes, hours, loads …
  amount       numeric,                         -- what this line actually cost
  -- Kept so costings entered under the old quantity-times-rate form still
  -- read correctly. Nothing writes to them any more.
  qty          numeric,
  rate         numeric,
  actual_qty   numeric,
  actual_rate  numeric,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  created_by   text not null default ''
);

-- Added after the first release, so an existing job_costs table gets it too.
alter table job_costs add column if not exists amount numeric;

create index if not exists job_costs_project_idx on job_costs (project_id, sort);

-- --------------------------------------------------------- job diary
-- One row per thing that happened on site, in order: on site, prestart,
-- milling start, paving stop, a delay, a note. Photos ride along in
-- files as [{name,url,type,size}].
create table if not exists diary_entries (
  id           uuid primary key default gen_random_uuid(),
  -- Null means the entry is not about a job: somebody's own diary for the
  -- day. Everything else about it is the same.
  project_id   uuid references projects(id) on delete cascade,
  entry_date   date not null default current_date,
  at           timestamptz not null default now(),  -- when it happened
  kind         text not null default 'note',        -- see ENTRY_TYPES in app.js
  label        text not null default '',            -- shown name, so added types survive
  body         text not null default '',
  files        jsonb not null default '[]'::jsonb,
  author       text not null default '',
  role         text not null default '',
  created_at   timestamptz not null default now()
);

-- Added after the first release: an entry no longer has to belong to a job,
-- so an existing table has the constraint lifted here.
alter table diary_entries alter column project_id drop not null;
-- Who wrote it, by id as well as by name — the id survives a respelling.
alter table diary_entries add column if not exists user_id uuid;

-- The crew screen reads a whole day across every job and person at once.
create index if not exists diary_day_idx on diary_entries (entry_date, at);

create index if not exists diary_project_idx on diary_entries (project_id, entry_date, at);

-- keep updated_at honest even if a client forgets to set it
create or replace function touch_project() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_touch on projects;
create trigger projects_touch before update on projects
  for each row execute function touch_project();

-- =====================================================================
--  Access — who gets in, and what each role can touch
--
--  Every phone signs in as a person: a code sent to the phone number or
--  email the director put on their row in crew_people. From then on the
--  database checks WHO is asking, not just whether they hold the key.
--  Somebody taken off the list (active = false) is refused at the database,
--  on every device, straight away.
--
--  ┌──────────────────────────────────────────────────────────────────┐
--  │  STEP 1 — DO THIS BEFORE RUNNING THE REST, OR YOU LOCK YOURSELF  │
--  │  OUT TOO.  Put your own name and the email or phone you will     │
--  │  sign in with into the line below. Phone as digits with the      │
--  │  country code, e.g. 6421234567.                                  │
--  └──────────────────────────────────────────────────────────────────┘
-- =====================================================================
insert into crew_people (name_key, name, role, active, email, phone)
select lower(v.name), v.name, 'director', true, v.email, v.phone
from (values ('YOUR NAME', 'your.email@example.com', '')) as v(name, email, phone)
where v.name <> 'YOUR NAME' and v.email not like '%example.com'   -- only once it has been edited
on conflict (name_key) do update
  set role = 'director', active = true,
      email = excluded.email, phone = excluded.phone;

-- Refuses to go any further until STEP 1 has really been done.
do $$
begin
  if not exists (
    select 1 from crew_people
    where role = 'director' and active
      and (email <> '' or phone <> '')
      and email not like '%example.com' and name <> 'YOUR NAME'
  ) then
    raise exception 'STEP 1 first: put your own name and email or phone into the insert at the top of the Access section, or every phone including yours will be locked out.';
  end if;
end $$;

-- A phone number the way the sign-in service writes it: digits, country
-- code, no plus. A New Zealand number typed the local way ("021 234 5678")
-- means +64, so a row the director typed in a hurry still matches the
-- token. The app normalises the same way before it saves; this is for rows
-- that arrived any other way.
create or replace function public.norm_phone(v text) returns text
language sql immutable as $$
  select case
    when d like '00%' then substr(d, 3)
    when d like '0%'  then '64' || substr(d, 2)
    else d end
  from (select regexp_replace(coalesce(v, ''), '\D', '', 'g') as d) x
$$;

-- The person behind the current request. Matched by user_id once that is
-- set, and until then by the email or phone they signed in with — which is
-- how a row the director typed in gets joined to the account that person
-- creates when they first sign in. security definer so this can read
-- crew_people without going through crew_people's own policy.
create or replace function public.my_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from crew_people
  where active and (
    user_id = auth.uid()
    or (user_id is null and email <> ''
        and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    or (user_id is null and phone <> ''
        and public.norm_phone(phone) = public.norm_phone(auth.jwt() ->> 'phone'))
  )
  order by (user_id is not null) desc
  limit 1
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from crew_people where id = public.my_person_id()
$$;

create or replace function public.is_active()   returns boolean language sql stable as $$ select public.my_person_id() is not null $$;
create or replace function public.is_office()   returns boolean language sql stable as $$ select public.my_role() in ('office', 'director') $$;
create or replace function public.is_director() returns boolean language sql stable as $$ select public.my_role() = 'director' $$;

grant execute on function public.norm_phone(text), public.my_person_id(), public.my_role(),
  public.is_active(), public.is_office(), public.is_director() to anon, authenticated;

alter table projects      enable row level security;
alter table project_docs  enable row level security;
alter table diary_entries enable row level security;
alter table job_costs     enable row level security;
alter table crew_people   enable row level security;

-- The old open policies, from before sign-in.
drop policy if exists projects_all      on projects;
drop policy if exists project_docs_all  on project_docs;
drop policy if exists diary_entries_all on diary_entries;
drop policy if exists job_costs_all     on job_costs;
drop policy if exists crew_people_all   on crew_people;

drop policy if exists projects_read   on projects;
drop policy if exists projects_insert on projects;
drop policy if exists projects_update on projects;
drop policy if exists projects_delete on projects;
create policy projects_read   on projects for select to authenticated using (public.is_active());
create policy projects_insert on projects for insert to authenticated with check (public.is_office());
create policy projects_update on projects for update to authenticated using (public.is_active()) with check (public.is_active());
create policy projects_delete on projects for delete to authenticated using (public.is_director());

-- Office-only paperwork never reaches a site phone, at the database now.
drop policy if exists project_docs_read   on project_docs;
drop policy if exists project_docs_insert on project_docs;
drop policy if exists project_docs_update on project_docs;
drop policy if exists project_docs_delete on project_docs;
create policy project_docs_read   on project_docs for select to authenticated
  using (public.is_active() and (audience <> 'office' or public.is_office()));
create policy project_docs_insert on project_docs for insert to authenticated with check (public.is_active());
create policy project_docs_update on project_docs for update to authenticated using (public.is_office()) with check (public.is_office());
create policy project_docs_delete on project_docs for delete to authenticated using (public.is_office());

drop policy if exists diary_entries_active on diary_entries;
create policy diary_entries_active on diary_entries for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- The money is a director's, and now the database says so too.
drop policy if exists job_costs_director on job_costs;
create policy job_costs_director on job_costs for all to authenticated
  using (public.is_director()) with check (public.is_director());

-- Everyone who is in can see who else is (names, faces, roles). Only a
-- director adds, removes or changes people; anybody can update their own row,
-- which is how a photo or a spelling of a name gets set.
drop policy if exists crew_people_read   on crew_people;
drop policy if exists crew_people_insert on crew_people;
drop policy if exists crew_people_update on crew_people;
drop policy if exists crew_people_delete on crew_people;
create policy crew_people_read   on crew_people for select to authenticated using (public.is_active());
create policy crew_people_insert on crew_people for insert to authenticated with check (public.is_director());
create policy crew_people_update on crew_people for update to authenticated
  using (public.is_director() or id = public.my_person_id())
  with check (public.is_director() or id = public.my_person_id());
create policy crew_people_delete on crew_people for delete to authenticated using (public.is_director());

-- =====================================================================
--  File storage — job paperwork and site photos
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('dispatch-files', 'dispatch-files', true)
on conflict (id) do update set public = true;

drop policy if exists dispatch_files_read  on storage.objects;
drop policy if exists dispatch_files_write on storage.objects;

create policy dispatch_files_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'dispatch-files');

create policy dispatch_files_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dispatch-files' and public.is_active());
