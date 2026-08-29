-- =====================================================================
-- RCK People — staff compliance.
--
-- Paste the whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run again later: everything here is "create if not
-- exists" or a replaced function, so re-running only adds what is
-- missing and never touches anything already entered.
--
-- What it creates
--   staff_users       who is allowed to open the app at all
--   companies         labour hire firms and subcontractor companies
--   staff             the people
--   profile_sections  one row per compliance tile, per person or company
--   profile_files     the documents behind those tiles
--   staff_audit       who changed what, and when
--   storage bucket    "staff-files", private, reachable only by signed link
--
-- The rule behind all of it: nothing is readable without a signed-in
-- account that is ALSO on the staff_users list. The anon key in
-- config.js opens nothing on its own.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Who may use the app
--
-- Deliberately not editable from inside the app. You add people here in
-- SQL, so nobody can grant themselves access from a browser.
--   role 'director' sees pay figures without asking.
--   role 'hr'       full access, pay hidden behind a button.
--   role 'viewer'   read only.
-- ---------------------------------------------------------------------
create table if not exists staff_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null default '',
  role       text not null default 'hr',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Labour hire firms and subcontractor companies
--
-- The agreement and the account details belong to the company, not to
-- each worker — so twelve people from the same firm share one agreement
-- instead of it being typed in twelve times.
-- ---------------------------------------------------------------------
create table if not exists companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'labour_hire',   -- labour_hire | subcontractor
  notes      text default '',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- The people
--
-- worker_type is the filter on the staff screen:
--   rck            on RCK's own books
--   labour_hire    supplied by a labour hire firm
--   subcontractor  a subcontractor, or someone working for one
-- ---------------------------------------------------------------------
create table if not exists staff (
  id            uuid primary key default gen_random_uuid(),
  employee_no   text default '',
  first_name    text not null default '',
  last_name     text not null default '',
  preferred_name text default '',
  worker_type   text not null default 'rck',
  company_id    uuid references companies(id) on delete set null,
  role          text default '',
  crew          text default '',
  date_of_birth date,
  start_date    date,
  end_date      date,
  status        text not null default 'active',     -- active | on_leave | finished
  phone         text default '',
  email         text default '',
  address       text default '',
  notes         text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists staff_name_idx    on staff (last_name, first_name);
create index if not exists staff_type_idx    on staff (worker_type);
create index if not exists staff_company_idx on staff (company_id);

-- ---------------------------------------------------------------------
-- The compliance tiles
--
-- One row per tile per person (or per company). Everything the tile
-- collects lives in `data` as JSON, because the tiles differ from each
-- other so much that a column per field would be a hundred columns of
-- mostly nulls. The shape of each tile is defined in app.js, which is
-- also the only place it needs changing.
--
--   na = "does not apply to this person". A tile marked so drops out of
--   their compliance percentage entirely, rather than counting against
--   them.
-- ---------------------------------------------------------------------
create table if not exists profile_sections (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid references staff(id) on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  section_key text not null,
  na          boolean not null default false,
  na_reason   text default '',
  data        jsonb not null default '{}'::jsonb,
  updated_by  text default '',
  updated_at  timestamptz not null default now(),
  -- belongs to exactly one of a person or a company, never both, never neither
  constraint profile_sections_owner_ck
    check ((staff_id is null) <> (company_id is null))
);

create unique index if not exists profile_sections_staff_key_idx
  on profile_sections (staff_id, section_key) where staff_id is not null;
create unique index if not exists profile_sections_company_key_idx
  on profile_sections (company_id, section_key) where company_id is not null;

-- ---------------------------------------------------------------------
-- The documents behind the tiles
--
-- `slot` says which upload box on the tile a file belongs to — 'front'
-- and 'back' for a licence, 'photo' for a head shot, or the id of a row
-- for the repeating tiles (competencies, inductions).
--
-- `path` is a key into the private storage bucket. There is no public
-- URL; the app mints a signed link that works for a few minutes.
-- ---------------------------------------------------------------------
create table if not exists profile_files (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid references staff(id) on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  section_key text not null,
  slot        text not null default '',
  path        text not null,
  file_name   text default '',
  file_size   bigint,
  mime        text default '',
  added_by    text default '',
  created_at  timestamptz not null default now(),
  constraint profile_files_owner_ck
    check ((staff_id is null) <> (company_id is null))
);

create index if not exists profile_files_staff_idx   on profile_files (staff_id, section_key);
create index if not exists profile_files_company_idx on profile_files (company_id, section_key);

-- ---------------------------------------------------------------------
-- The trail
-- ---------------------------------------------------------------------
create table if not exists staff_audit (
  id          uuid primary key default gen_random_uuid(),
  actor       text default '',
  actor_email text default '',
  staff_id    uuid references staff(id) on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  entity      text default '',
  entity_id   text default '',
  action      text default '',
  summary     text default '',
  at          timestamptz not null default now()
);

create index if not exists staff_audit_staff_idx on staff_audit (staff_id, at desc);
create index if not exists staff_audit_at_idx    on staff_audit (at desc);

-- ---------------------------------------------------------------------
-- Keep updated_at honest without the app having to remember
-- ---------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists staff_touch on staff;
create trigger staff_touch before update on staff
  for each row execute function touch_updated_at();

drop trigger if exists companies_touch on companies;
create trigger companies_touch before update on companies
  for each row execute function touch_updated_at();

drop trigger if exists profile_sections_touch on profile_sections;
create trigger profile_sections_touch before update on profile_sections
  for each row execute function touch_updated_at();

-- =====================================================================
-- Access
--
-- Two rules, applied to every table.
--   To read anything: you must be signed in AND on staff_users with
--   active = true. Nothing else reads a single row.
--   To change anything: that, and a role of 'hr' or 'director'.
-- =====================================================================
-- May this account see anything at all?
create or replace function is_staff_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_users
    where id = auth.uid() and active = true
  );
$$;

-- May it change anything? A 'viewer' may not, and this is where that is
-- actually enforced — the app hides the buttons, but hiding a button is
-- not a permission.
create or replace function is_staff_writer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_users
    where id = auth.uid() and active = true and role in ('hr', 'director')
  );
$$;

alter table staff_users      enable row level security;
alter table companies        enable row level security;
alter table staff            enable row level security;
alter table profile_sections enable row level security;
alter table profile_files    enable row level security;
alter table staff_audit      enable row level security;

-- Everyone on the list may read the list (so the app can show who you are),
-- but nobody may edit it from the app. Changes are made in SQL only.
drop policy if exists staff_users_read on staff_users;
create policy staff_users_read on staff_users
  for select to authenticated using (is_staff_user());

-- Anyone on the list may read; only hr and director may write.
do $$
declare t text;
begin
  foreach t in array array['companies', 'staff', 'profile_sections', 'profile_files', 'staff_audit']
  loop
    execute format('drop policy if exists %I on %I', t || '_all', t);      -- from an earlier run
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);

    execute format('create policy %I on %I for select to authenticated using (is_staff_user())',
                   t || '_read', t);
    execute format('create policy %I on %I for insert to authenticated with check (is_staff_writer())',
                   t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (is_staff_writer()) with check (is_staff_writer())',
                   t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (is_staff_writer())',
                   t || '_delete', t);
  end loop;
end $$;

-- =====================================================================
-- Document storage — private, no public URL
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('staff-files', 'staff-files', false)
on conflict (id) do nothing;

drop policy if exists staff_files_read   on storage.objects;
drop policy if exists staff_files_write  on storage.objects;
drop policy if exists staff_files_update on storage.objects;
drop policy if exists staff_files_delete on storage.objects;

create policy staff_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-files' and is_staff_user());

create policy staff_files_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'staff-files' and is_staff_writer());

create policy staff_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'staff-files' and is_staff_writer())
  with check (bucket_id = 'staff-files' and is_staff_writer());

create policy staff_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'staff-files' and is_staff_writer());

-- =====================================================================
-- Letting someone in
--
-- Create the account first under Authentication → Users → Add user
-- (tick "Auto Confirm User"), then run:
--
--   select staff_grant('jane@rcknz.co.nz', 'Jane Smith', 'hr');
--
-- Use 'director' for you and the director, 'viewer' for read-only.
-- It tells you straight back whether it worked.
--
-- To take someone off again:
--   update staff_users set active = false where email = 'jane@rcknz.co.nz';
-- =====================================================================
create or replace function staff_grant(p_email text, p_name text default '', p_role text default 'hr')
returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);

  if uid is null then
    return 'No account found for ' || p_email ||
           '. Create it first under Authentication → Users → Add user, then run this again.';
  end if;

  if p_role not in ('director', 'hr', 'viewer') then
    return 'Role must be director, hr or viewer — got "' || p_role || '".';
  end if;

  insert into staff_users (id, email, name, role, active)
  values (uid, lower(p_email), coalesce(nullif(p_name, ''), p_email), p_role, true)
  on conflict (id) do update
    set name = coalesce(nullif(excluded.name, ''), staff_users.name),
        role = excluded.role,
        active = true;

  return p_email || ' can now sign in to RCK People as ' || p_role || '.';
end $$;
