-- =====================================================================
--  RCK Costing — database schema
--  Paste this whole file into Supabase → SQL Editor → Run. Safe to
--  re-run: everything is "if not exists" / "drop policy if exists", so
--  running it again over live data only adds what is missing.
--
--  It can share a Supabase project with RCK Workshop, Dispatch and HR —
--  none of the table or function names clash.
--
--  This database holds what every job made. So, like RCK HR and unlike
--  the workshop and dispatch apps:
--
--    · The anonymous key can read NOTHING. Every policy below requires a
--      signed-in user.
--    · Being signed in is not enough either — the account must also be
--      listed in cost_users. That table is the whole guest list, and it is
--      meant to be two rows long: you and the director.
--
--  Because of that, publishing the app's URL and its anon key is harmless:
--  without an account in cost_users they open a sign-in screen and nothing
--  else.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
--  Who is allowed in
-- =====================================================================
-- One row per person who may use the app. `id` matches the user's id in
-- Supabase Auth. See the README for the one line that adds someone.
create table if not exists cost_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null default '',
  role       text not null default 'owner' check (role in ('owner', 'director')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Every policy in this file calls this. It is SECURITY DEFINER so that
-- checking the guest list does not itself go through the guest-list policy
-- (which would recurse forever).
create or replace function cost_member() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from cost_users u
    where u.id = auth.uid() and u.active
  );
$$;

-- Convenience: adds an account to the guest list by email, after that
-- person has been created in Supabase → Authentication → Users.
--   select cost_grant('director@rcknz.co.nz', 'The Director', 'director');
create or replace function cost_grant(p_email text, p_name text default '', p_role text default 'owner')
returns text language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    return 'No account found for ' || p_email ||
           '. Create it first in Authentication → Users, then run this again.';
  end if;
  insert into cost_users (id, email, name, role)
  values (uid, lower(p_email), coalesce(nullif(p_name, ''), p_email), p_role)
  on conflict (id) do update
    set name = excluded.name, role = excluded.role, active = true;
  return p_email || ' can now use RCK Costing as ' || p_role || '.';
end;
$$;

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
--  Access — signed in AND on the guest list, or nothing
-- =====================================================================
alter table cost_users      enable row level security;
alter table cost_jobs       enable row level security;
alter table cost_variations enable row level security;
alter table cost_comments   enable row level security;

drop policy if exists cost_users_self  on cost_users;
drop policy if exists cost_jobs_rw     on cost_jobs;
drop policy if exists cost_var_rw      on cost_variations;
drop policy if exists cost_comments_rw on cost_comments;

-- A signed-in user may read their own guest-list row (that is how the app
-- knows whether to let them in). Nobody edits the guest list from the app;
-- that is done in the SQL editor on purpose.
create policy cost_users_self on cost_users
  for select to authenticated
  using (id = auth.uid());

create policy cost_jobs_rw on cost_jobs
  for all to authenticated using (cost_member()) with check (cost_member());

create policy cost_var_rw on cost_variations
  for all to authenticated using (cost_member()) with check (cost_member());

create policy cost_comments_rw on cost_comments
  for all to authenticated using (cost_member()) with check (cost_member());
