-- =====================================================================
--  RCK HR — database schema
--
--  Paste this whole file into Supabase → SQL Editor → Run.
--  Safe to re-run: everything is "if not exists" / "drop policy if exists".
--
--  READ THIS FIRST — how this differs from the workshop app
--  ---------------------------------------------------------------------
--  The workshop app has no logins: one shared key, everyone can read and
--  write, and the README says not to put anything confidential in it.
--
--  This database is the opposite. It holds contracts, pay and personal
--  details, so:
--
--    · The anonymous key can read NOTHING. Every policy below requires a
--      signed-in user.
--    · Being signed in is not enough either — the user must also be listed
--      in hr_users. That table is the whole guest list, and it is small on
--      purpose (you, the director, the HR manager).
--    · Uploaded documents go in a PRIVATE storage bucket. They are only
--      reachable through short-lived signed links the app generates after
--      you sign in. There is no public URL to leak.
--
--  Because of that, publishing the app's URL and its anon key is harmless:
--  without an account in hr_users, they open a sign-in screen and nothing
--  else.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
--  Who is allowed in
-- =====================================================================
-- One row per person who may use the app. `id` matches the user's id in
-- Supabase Auth. See the README for the one line that adds someone.
create table if not exists hr_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null default '',
  role       text not null default 'hr' check (role in ('hr', 'director')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Every policy in this file calls this. It is SECURITY DEFINER so that
-- checking the guest list does not itself go through the guest-list policy
-- (which would recurse forever).
create or replace function hr_member() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from hr_users u
    where u.id = auth.uid() and u.active
  );
$$;

-- Convenience: adds an account to the guest list by email, after that
-- person has been created in Supabase → Authentication → Users.
--   select hr_grant('jane@rcknz.co.nz', 'Jane Smith', 'hr');
create or replace function hr_grant(p_email text, p_name text default '', p_role text default 'hr')
returns text language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    return 'No account found for ' || p_email ||
           '. Create it first in Authentication → Users, then run this again.';
  end if;
  insert into hr_users (id, email, name, role)
  values (uid, lower(p_email), coalesce(nullif(p_name, ''), p_email), p_role)
  on conflict (id) do update
    set name = excluded.name, role = excluded.role, active = true;
  return p_email || ' can now use RCK HR as ' || p_role || '.';
end;
$$;

-- =====================================================================
--  Staff
-- =====================================================================
create table if not exists people (
  id            uuid primary key default gen_random_uuid(),
  employee_no   text not null default '',
  first_name    text not null default '',
  last_name     text not null default '',
  preferred_name text not null default '',

  -- job_type drives which credentials are *required* of this person
  -- driver | operator | crew | office | management
  job_type      text not null default 'crew',
  position      text not null default '',        -- free text job title
  crew          text not null default '',        -- team / gang / depot

  employment_type text not null default 'permanent',
    -- permanent | fixed_term | casual | contractor
  start_date    date,
  end_date      date,
  status        text not null default 'active'
                check (status in ('active', 'on_leave', 'finished')),

  -- contact
  phone         text not null default '',
  email         text not null default '',
  address       text not null default '',
  date_of_birth date,
  emergency_name         text not null default '',
  emergency_phone        text not null default '',
  emergency_relationship text not null default '',

  -- pay. Kept deliberately light: the rate and when it was last reviewed,
  -- so HR can answer questions without opening payroll. Bank accounts and
  -- tax numbers are NOT stored here — they belong in the payroll system.
  pay_type      text not null default 'hourly' check (pay_type in ('hourly', 'salary')),
  pay_rate      numeric,
  pay_reviewed_on date,
  pay_notes     text not null default '',

  -- the person's folder in SharePoint, so their file is one tap away
  sharepoint_url text not null default '',

  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists people_status_idx  on people (status);
create index if not exists people_name_idx    on people (last_name, first_name);

-- =====================================================================
--  What we require of people
-- =====================================================================
-- Editable in the app under Requirements. Seeded below with the usual set
-- for a New Zealand roading crew.
create table if not exists credential_types (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  category    text not null default 'ticket',
    -- licence | endorsement | ticket | medical | employment | other
  expires     boolean not null default true,
  warn_days   integer not null default 60,      -- amber this many days out
  -- which job types must hold this. Empty = optional for everyone.
  required_for text[] not null default '{}',
  detail_label text not null default '',        -- e.g. "Classes", "Letters"
  sort        integer not null default 100,
  active      boolean not null default true,
  notes       text not null default ''
);

-- =====================================================================
--  What each person actually holds
-- =====================================================================
create table if not exists credentials (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references people(id) on delete cascade,
  type_id    uuid not null references credential_types(id) on delete restrict,
  reference  text not null default '',          -- licence / certificate number
  detail     text not null default '',          -- "2, 4, 5" or "W, T, R"
  issued_on  date,
  expires_on date,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credentials_person_idx  on credentials (person_id);
create index if not exists credentials_expiry_idx  on credentials (expires_on);

-- =====================================================================
--  Documents — uploaded here, or living in SharePoint
-- =====================================================================
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references people(id) on delete cascade,
  credential_id uuid references credentials(id) on delete set null,
  kind          text not null default 'other',
    -- contract | addendum | pay | licence | medical | id | policy | other
  title         text not null default '',
  doc_date      date,

  -- source = 'upload'     → the file is in the private hr-files bucket at
  --                         storage_path, reached by a signed link.
  -- source = 'sharepoint' → url points at SharePoint; nothing is copied.
  source        text not null default 'upload' check (source in ('upload', 'sharepoint')),
  storage_path  text not null default '',
  url           text not null default '',
  file_name     text not null default '',
  file_type     text not null default '',
  file_size     bigint,

  added_by      text not null default '',
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists documents_person_idx on documents (person_id, created_at desc);

-- =====================================================================
--  Audit trail — who changed what, kept forever
-- =====================================================================
create table if not exists hr_audit (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  actor       text not null default '',
  actor_email text not null default '',
  person_id   uuid references people(id) on delete set null,
  entity      text not null default '',         -- person | credential | document | type
  entity_id   uuid,
  action      text not null default '',         -- added | changed | removed | viewed_pay
  summary     text not null default '',
  meta        jsonb not null default '{}'::jsonb
);

create index if not exists hr_audit_person_idx on hr_audit (person_id, at desc);
create index if not exists hr_audit_at_idx     on hr_audit (at desc);

-- ------------------------------------------------- keep updated_at true
create or replace function hr_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists people_touch on people;
create trigger people_touch before update on people
  for each row execute function hr_touch();

drop trigger if exists credentials_touch on credentials;
create trigger credentials_touch before update on credentials
  for each row execute function hr_touch();

-- =====================================================================
--  Access — signed in AND on the guest list, or nothing
-- =====================================================================
alter table hr_users         enable row level security;
alter table people           enable row level security;
alter table credential_types enable row level security;
alter table credentials      enable row level security;
alter table documents        enable row level security;
alter table hr_audit         enable row level security;

drop policy if exists hr_users_self    on hr_users;
drop policy if exists people_rw        on people;
drop policy if exists cred_types_rw    on credential_types;
drop policy if exists credentials_rw   on credentials;
drop policy if exists documents_rw     on documents;
drop policy if exists hr_audit_read    on hr_audit;
drop policy if exists hr_audit_write   on hr_audit;

-- A signed-in user may read their own guest-list row (that is how the app
-- knows whether to let them in). Nobody edits the guest list from the app;
-- that is done in the SQL editor on purpose.
create policy hr_users_self on hr_users
  for select to authenticated
  using (id = auth.uid());

create policy people_rw on people
  for all to authenticated using (hr_member()) with check (hr_member());

create policy cred_types_rw on credential_types
  for all to authenticated using (hr_member()) with check (hr_member());

create policy credentials_rw on credentials
  for all to authenticated using (hr_member()) with check (hr_member());

create policy documents_rw on documents
  for all to authenticated using (hr_member()) with check (hr_member());

-- The audit trail can be added to and read, never edited or deleted.
create policy hr_audit_read on hr_audit
  for select to authenticated using (hr_member());
create policy hr_audit_write on hr_audit
  for insert to authenticated with check (hr_member());

-- =====================================================================
--  Document storage — PRIVATE bucket
--
--  public = false, so there is no URL anyone can open. The app asks
--  Supabase for a signed link that works for a few minutes, and only after
--  the user has signed in.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('hr-files', 'hr-files', false)
on conflict (id) do update set public = false;

drop policy if exists hr_files_read   on storage.objects;
drop policy if exists hr_files_write  on storage.objects;
drop policy if exists hr_files_update on storage.objects;
drop policy if exists hr_files_delete on storage.objects;

create policy hr_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'hr-files' and hr_member());

create policy hr_files_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'hr-files' and hr_member());

create policy hr_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'hr-files' and hr_member());

create policy hr_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'hr-files' and hr_member());

-- =====================================================================
--  The starting set of requirements
--
--  These are the usual ones for a New Zealand roading crew. Change them,
--  delete them or add your own in the app under ⋮ → Requirements — this
--  block only ever fills in what is missing, so editing is safe and
--  re-running this file will not undo your changes.
-- =====================================================================
insert into credential_types (key, name, category, expires, warn_days, required_for, detail_label, sort) values
  ('driver_licence',  'Driver Licence',                     'licence',    true,  60, '{driver,operator}', 'Classes held',    10),
  ('wtr',             'WTR Endorsement (Wheels/Tracks/Rollers)', 'endorsement', true, 60, '{operator}',  'Letters held',    20),
  ('forklift',        'Forklift Endorsement (F)',           'endorsement', true, 60, '{}',              '',                30),
  ('dangerous_goods', 'Dangerous Goods Endorsement (D)',    'endorsement', true, 60, '{}',              '',                40),
  ('passenger',       'Passenger Endorsement (P)',          'endorsement', true, 60, '{}',              '',                50),
  ('driver_medical',  'Driver Medical Certificate',         'medical',    true,  45, '{}',              '',                60),
  ('site_safe',       'Site Safe Construction Card',        'ticket',     true,  90, '{driver,operator,crew}', '',         70),
  ('first_aid',       'First Aid Certificate',              'ticket',     true,  60, '{}',              '',                80),
  ('ttm_tc',          'TTM — Traffic Controller (TC)',      'ticket',     true,  60, '{}',              '',                90),
  ('ttm_stms',        'TTM — STMS Level 1',                 'ticket',     true,  60, '{}',              '',               100),
  ('confined_space',  'Confined Space',                     'ticket',     true,  60, '{}',              '',               110),
  ('heights',         'Working at Heights',                 'ticket',     true,  60, '{}',              '',               120),
  ('da_test',         'Drug & Alcohol Test',                'medical',    true,  30, '{}',              '',               130),
  ('employment_agreement', 'Employment Agreement Signed',   'employment', false,  0, '{driver,operator,crew,office,management}', '', 140),
  ('right_to_work',   'Right to Work / Visa',               'employment', true,  90, '{driver,operator,crew,office,management}', '', 150),
  ('induction',       'Site Induction',                     'employment', false,  0, '{driver,operator,crew}', '',        160),
  ('ird_kiwisaver',   'IRD & KiwiSaver Forms',              'employment', false,  0, '{driver,operator,crew,office,management}', '', 170)
on conflict (key) do nothing;
