-- =====================================================================
-- RCK People — staff compliance.
--
-- Paste the whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run again later: everything here is "create if not
-- exists" or a replaced function, so re-running only adds what is
-- missing and never touches anything already entered.
--
-- What it creates
--   staff_users       the two shared accounts, and which role each is
--   companies         labour hire firms and subcontractor companies
--   staff             the people
--   profile_sections  one row per compliance tile, per person or company
--   profile_files     the documents behind those tiles
--   staff_audit       who changed what, and when
--   storage bucket    "staff-files", private, reachable only by signed link
--
-- =====================================================================
-- The two roles
--
--   director    Sees everything, including pay. Can change everything.
--               The director and the HR manager both use this one.
--   supervisor  Sees everything EXCEPT pay. Can change nothing.
--
-- "Except pay" is enforced here, in the database, not in the app:
--   · the wage, salary, bank account and charge rates come back to a
--     supervisor as "##hidden##" rather than as figures, and
--   · the signed contract and the account paperwork cannot be opened by
--     a supervisor at all, because the pay is written inside them.
--
-- Hiding a field in the app would not be worth much: the page is public
-- and its key is readable, so anything the app can ask for, a determined
-- person could ask for too. So the app never gets sent the figures.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Who may use the app
--
-- Normally just two rows: one director account and one supervisor
-- account, shared by everyone in that role via a link. Deliberately not
-- editable from inside the app — you add to it in SQL, so nobody can
-- promote themselves from a browser.
-- ---------------------------------------------------------------------
create table if not exists staff_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null default '',
  role       text not null default 'supervisor',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Anyone who ran the first version of this file, where the roles were
-- named differently. Harmless on a fresh database.
update staff_users set role = 'director'   where role = 'hr';
update staff_users set role = 'supervisor' where role = 'viewer';

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
-- `path` is a key into the private storage bucket, and is laid out as
--   <staff|company>/<id>/<tile>/<file>
-- The tile has to be in the path so the storage rules below can keep a
-- supervisor out of the contract, which has the pay written inside it.
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
-- Who is asking
-- =====================================================================

-- Signed in, and on the list?
create or replace function is_staff_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_users where id = auth.uid() and active = true
  );
$$;

-- Which of the two roles?  Null for anyone not on the list.
create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from staff_users where id = auth.uid() and active = true limit 1;
$$;

-- May they change anything?  Only a director.
create or replace function is_director() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() = 'director';
$$;

-- =====================================================================
-- Access
--
--   Read  — signed in and on the list.
--   Write — that, and a role of 'director'.
-- =====================================================================
alter table staff_users      enable row level security;
alter table companies        enable row level security;
alter table staff            enable row level security;
alter table profile_sections enable row level security;
alter table profile_files    enable row level security;
alter table staff_audit      enable row level security;

-- Everyone on the list may read the list, so the app can show who you
-- are and what you may do. Nobody may edit it from the app.
drop policy if exists staff_users_read on staff_users;
create policy staff_users_read on staff_users
  for select to authenticated using (is_staff_user());

do $$
declare t text;
begin
  foreach t in array array['companies', 'staff', 'profile_files', 'staff_audit']
  loop
    execute format('drop policy if exists %I on %I', t || '_all', t);      -- from an earlier run
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);

    execute format('create policy %I on %I for select to authenticated using (is_staff_user())',
                   t || '_read', t);
    execute format('create policy %I on %I for insert to authenticated with check (is_director())',
                   t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (is_director()) with check (is_director())',
                   t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (is_director())',
                   t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- The tiles are the one place pay is written down, so they are read
-- through a view instead of directly.
--
-- Only a director may read the table itself. A supervisor reads
-- profile_sections_v below, which hands back the same rows with the
-- money replaced by "##hidden##".
-- ---------------------------------------------------------------------
drop policy if exists profile_sections_all    on profile_sections;
drop policy if exists profile_sections_read   on profile_sections;
drop policy if exists profile_sections_insert on profile_sections;
drop policy if exists profile_sections_update on profile_sections;
drop policy if exists profile_sections_delete on profile_sections;

create policy profile_sections_read on profile_sections
  for select to authenticated using (is_director());
create policy profile_sections_insert on profile_sections
  for insert to authenticated with check (is_director());
create policy profile_sections_update on profile_sections
  for update to authenticated using (is_director()) with check (is_director());
create policy profile_sections_delete on profile_sections
  for delete to authenticated using (is_director());

-- Replace the named keys with "##hidden##", leaving keys that are absent
-- absent. That matters: it means a supervisor and a director both see the
-- same tile as complete or incomplete, and so the same percentage. Only
-- the figure itself differs.
create or replace function redact_keys(d jsonb, keys text[]) returns jsonb
language sql immutable as $$
  select coalesce(
    (select jsonb_object_agg(
        e.key,
        case when e.key = any(keys) then to_jsonb('##hidden##'::text) else e.value end)
     from jsonb_each(coalesce(d, '{}'::jsonb)) as e),
    '{}'::jsonb);
$$;

-- Deliberately NOT security_invoker: the view reads the table on the
-- caller's behalf and re-imposes the membership check itself, which is
-- how a supervisor gets the rows without being able to read the table.
drop view if exists profile_sections_v;
create view profile_sections_v as
  select
    id, staff_id, company_id, section_key, na, na_reason, updated_by, updated_at,
    case
      when my_role() = 'director' then data
      when section_key = 'contract' then redact_keys(data, array['pay_rate', 'pay_unit'])
      when section_key = 'account'  then redact_keys(data, array['bank_account', 'charge_rates'])
      else data
    end as data
  from profile_sections
  where is_staff_user();

grant select on profile_sections_v to authenticated;

-- =====================================================================
-- Document storage — private, no public URL
--
-- Paths are  <staff|company>/<id>/<tile>/<file>, so the third folder is
-- the tile. A supervisor is kept out of the two tiles whose documents
-- have pay written inside them.
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
  using (
    bucket_id = 'staff-files'
    and is_staff_user()
    and (
      is_director()
      or coalesce((storage.foldername(name))[3], '') not in ('contract', 'account')
    )
  );

create policy staff_files_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'staff-files' and is_director());

create policy staff_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'staff-files' and is_director())
  with check (bucket_id = 'staff-files' and is_director());

create policy staff_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'staff-files' and is_director());

-- =====================================================================
-- Setting up the two accounts
--
-- You do this ONCE, for the whole company. Nobody else ever needs an
-- account — they get a link instead.
--
-- 1. Authentication → Users → Add user. Make two, ticking
--    "Auto Confirm User" on both:
--       rck-director@rcknz.co.nz     with a long password
--       rck-supervisor@rcknz.co.nz   with a different long password
--    The addresses do not have to be real mailboxes.
--
-- 2. Run these two lines:
--
--      select staff_grant('rck-director@rcknz.co.nz',   'Director',   'director');
--      select staff_grant('rck-supervisor@rcknz.co.nz', 'Supervisor', 'supervisor');
--
-- 3. Sign in to the app as the director account, then use
--    Settings → "Set up someone's phone" to make the two links you hand
--    out. The director link goes to you and the HR manager; the
--    supervisor link goes to the supervisors.
--
-- To cut everyone in one role off — someone leaves, or a link goes
-- astray — change that account's password under Authentication → Users,
-- and hand out a fresh link. Or switch it off entirely:
--
--   update staff_users set active = false where email = 'rck-supervisor@rcknz.co.nz';
-- =====================================================================
create or replace function staff_grant(p_email text, p_name text default '', p_role text default 'supervisor')
returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);

  if uid is null then
    return 'No account found for ' || p_email ||
           '. Create it first under Authentication → Users → Add user, then run this again.';
  end if;

  if p_role not in ('director', 'supervisor') then
    return 'Role must be director or supervisor — got "' || p_role || '".';
  end if;

  insert into staff_users (id, email, name, role, active)
  values (uid, lower(p_email), coalesce(nullif(p_name, ''), p_email), p_role, true)
  on conflict (id) do update
    set name = coalesce(nullif(excluded.name, ''), staff_users.name),
        role = excluded.role,
        active = true;

  return p_email || ' is now the ' || p_role || ' account for RCK People.';
end $$;
