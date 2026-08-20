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
  updated_at     timestamptz not null default now()
);

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

-- --------------------------------------------------------- job diary
-- One row per thing that happened on site, in order: on site, prestart,
-- milling start, paving stop, a delay, a note. Photos ride along in
-- files as [{name,url,type,size}].
create table if not exists diary_entries (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
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
--  Access
--
--  Like RCK Workshop, this is an internal tool with no logins: every
--  device uses the same public "anon" key, so anyone who has the app URL
--  and that key can read and write. That is deliberate — the crew have no
--  password to lose. The office/supervisor split is about keeping the app
--  simple to use, not about secrecy: don't put anything you would mind an
--  RCK phone seeing into the app, and don't publish the link outside RCK.
-- =====================================================================
alter table projects      enable row level security;
alter table project_docs  enable row level security;
alter table diary_entries enable row level security;

drop policy if exists projects_all      on projects;
drop policy if exists project_docs_all  on project_docs;
drop policy if exists diary_entries_all on diary_entries;

create policy projects_all      on projects      for all to anon, authenticated using (true) with check (true);
create policy project_docs_all  on project_docs  for all to anon, authenticated using (true) with check (true);
create policy diary_entries_all on diary_entries for all to anon, authenticated using (true) with check (true);

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
  for insert to anon, authenticated
  with check (bucket_id = 'dispatch-files');
