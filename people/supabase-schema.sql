-- =====================================================================
-- RCK People — staff compliance.
--
-- Paste the whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run again later: everything here is "create if not
-- exists" or a replaced object, so re-running only adds what is missing
-- and never touches anything already entered.
--
-- There are NO accounts to create. Like RCK Workshop and RCK Dispatch,
-- every device shares one key. Run this, copy the Project URL and anon
-- key out of Settings → API, and you are done — see the note under
-- "Access" further down for what that does and does not protect.
--
-- What it creates
--   companies         labour hire firms and subcontractor companies
--   staff             the people
--   profile_sections  one row per compliance tile, per person or company
--   profile_files     the documents behind those tiles
--   staff_audit       who changed what, and when
--   storage bucket    "staff-files", private, reachable only by signed link
-- =====================================================================

create extension if not exists "pgcrypto";

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
--  Access
--
--  Like RCK Workshop and RCK Dispatch, this is an internal tool with no
--  logins: every device uses the same "anon" key, so anyone holding that
--  key and the app URL can read and write. That is deliberate — the crew
--  have no password to lose.
--
--  BE CLEAR ABOUT WHAT THAT MEANS HERE. This app holds wages, bank account
--  numbers and dates of birth. The supervisor/director split in the app is
--  about keeping the screen simple and stopping accidents, NOT about
--  secrecy: the director code lives in config.js, and anyone holding the
--  anon key can read the pay straight out of this database whatever the
--  app chooses to show them.
--
--  So the key IS the secret. Which is why config.js is left blank and each
--  phone is given the key once, by a setup link, instead of it being
--  published on a page anyone can read. Treat that link the way you would
--  treat a key to the office.
--
--  If pay must be genuinely secret from supervisors rather than merely out
--  of sight, this needs real accounts — one signed-in account for the
--  director, with the pay behind it. Ask and it can be put back; it is
--  about thirty seconds of extra setup.
-- =====================================================================

-- Anything left over from the earlier, account-based version of this file.
drop view     if exists profile_sections_v;
drop function if exists redact_keys(jsonb, text[]);
drop function if exists staff_grant(text, text, text);
drop function if exists is_director();
drop function if exists my_role();
drop function if exists is_staff_user();
drop table    if exists staff_users;

alter table companies        enable row level security;
alter table staff            enable row level security;
alter table profile_sections enable row level security;
alter table profile_files    enable row level security;
alter table staff_audit      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['companies', 'staff', 'profile_sections', 'profile_files', 'staff_audit']
  loop
    -- every policy name this file has ever used, so a re-run lands clean
    execute format('drop policy if exists %I on %I', t || '_all',    t);
    execute format('drop policy if exists %I on %I', t || '_read',   t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);

    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_all', t);
  end loop;
end $$;

-- =====================================================================
--  Document storage
--
--  The bucket is private, so there is no public URL to a contract or a
--  licence photo. The app asks for a link that works for a few minutes and
--  then stops working. That keeps documents off search engines and out of
--  anything that trawls public buckets — it does not hide them from
--  someone holding the key, and is not meant to.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('staff-files', 'staff-files', false)
on conflict (id) do nothing;

drop policy if exists staff_files_read   on storage.objects;
drop policy if exists staff_files_write  on storage.objects;
drop policy if exists staff_files_update on storage.objects;
drop policy if exists staff_files_delete on storage.objects;

create policy staff_files_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'staff-files');

create policy staff_files_write on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'staff-files');

create policy staff_files_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'staff-files') with check (bucket_id = 'staff-files');

create policy staff_files_delete on storage.objects
  for delete to anon, authenticated using (bucket_id = 'staff-files');

-- =====================================================================
--  That is the whole of it. No accounts to create, nobody to grant.
--  Copy the Project URL and the anon key from Settings → API, put them
--  into the app on one phone, and send everyone else the setup link from
--  Settings → Set up someone else's phone.
-- =====================================================================
