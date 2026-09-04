-- =====================================================================
--  RCK Workshop v2 — migration 0001: foundations
--
--  Companies, people and tiers, and the sign-in link between a Supabase
--  Auth user and a person. Every later table hangs off these.
--
--  Migrations are applied in order, once each, and never edited after
--  they have run anywhere. The next change is 0002.
-- =====================================================================

create extension if not exists pgcrypto;

-- Helpers live in their own schema so they do not mix with the tables.
create schema if not exists app;
grant usage on schema app to anon, authenticated;

-- ------------------------------------------------------------ companies
-- RCK itself, and every outside company that gets jobs.
create table companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'subcontractor' check (kind in ('rck', 'subcontractor')),
  trade      text not null default '',      -- electrical, hydraulics, glass ...
  phone      text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one RCK. Its id is fixed so the app and later migrations can name it.
insert into companies (id, name, kind)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'RCK', 'rck')
on conflict (id) do nothing;

create unique index companies_one_rck on companies (kind) where kind = 'rck';

-- --------------------------------------------------------------- people
-- One row per person. user_id links to the Auth account once they have
-- signed in; email is how a row made ahead of time finds its account.
create table people (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users (id) on delete set null,
  company_id uuid not null references companies (id),
  name       text not null default '',
  email      text unique,
  phone      text not null default '',
  tier       text not null default 'pending'
             check (tier in ('owner', 'director', 'workshop_manager', 'workshop',
                             'crew', 'subcontractor', 'screen', 'pending')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index people_company_idx on people (company_id);

-- A subcontractor tier must belong to an outside company, and every RCK
-- tier to RCK. The screen and a pending person may sit anywhere.
create or replace function app.tier_matches_company() returns trigger
language plpgsql as $$
declare k text;
begin
  select kind into k from companies where id = new.company_id;
  if new.tier = 'subcontractor' and k <> 'subcontractor' then
    raise exception 'A subcontractor must belong to an outside company';
  end if;
  if new.tier in ('owner', 'director', 'workshop_manager', 'workshop', 'crew') and k <> 'rck' then
    raise exception 'An RCK tier must belong to RCK';
  end if;
  return new;
end $$;

create trigger people_tier_company before insert or update of tier, company_id on people
  for each row execute function app.tier_matches_company();

-- keep updated_at honest
create or replace function app.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger companies_touch before update on companies for each row execute function app.touch();
create trigger people_touch    before update on people    for each row execute function app.touch();

-- ------------------------------------------------ who am I, for policies
-- Security definer so a policy can ask without itself needing to read
-- the people table, which would recurse.
create or replace function app.me() returns people
language sql stable security definer set search_path = public as $$
  select * from people where user_id = auth.uid() and active limit 1
$$;

create or replace function app.my_tier() returns text
language sql stable security definer set search_path = public as $$
  select tier from people where user_id = auth.uid() and active limit 1
$$;

create or replace function app.my_company() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from people where user_id = auth.uid() and active limit 1
$$;

-- True for the five RCK tiers. Subcontractor, screen and pending are not RCK.
create or replace function app.is_rck() returns boolean
language sql stable as $$
  select coalesce(app.my_tier() in ('owner', 'director', 'workshop_manager', 'workshop', 'crew'), false)
$$;

create or replace function app.tier_rank(t text) returns int
language sql immutable as $$
  select case t
    when 'owner'            then 6
    when 'director'         then 5
    when 'workshop_manager' then 4
    when 'workshop'         then 3
    when 'crew'             then 2
    when 'subcontractor'    then 1
    when 'screen'           then 1
    else 0 end
$$;

-- "at least a workshop manager" and so on, for the RCK ladder.
create or replace function app.at_least(t text) returns boolean
language sql stable as $$
  select app.is_rck() and app.tier_rank(app.my_tier()) >= app.tier_rank(t)
$$;

grant execute on function app.me(), app.my_tier(), app.my_company(), app.is_rck(),
  app.tier_rank(text), app.at_least(text) to anon, authenticated;

-- --------------------------------------- first sign-in links the account
-- When an Auth user is created: if a person with that email was set up
-- ahead of time, link them; otherwise make a pending person at RCK with
-- no access, so nobody gets in by signing up.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare existing uuid;
begin
  select id into existing from people where lower(email) = lower(new.email) and user_id is null limit 1;
  if existing is not null then
    update people set user_id = new.id where id = existing;
  else
    insert into people (user_id, company_id, email, name, tier)
    values (new.id, '00000000-0000-0000-0000-000000000001', new.email,
            coalesce(new.raw_user_meta_data ->> 'name', ''), 'pending');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------- access
alter table companies enable row level security;
alter table people    enable row level security;

-- Only signed-in people touch these tables at all; the policies below
-- narrow it further. anon gets nothing.
revoke all on companies, people from anon;
grant select, insert, update on companies, people to authenticated;

-- Companies: RCK sees all; an outsider sees their own.
create policy companies_read on companies for select to authenticated
  using (app.is_rck() or id = app.my_company());

create policy companies_write on companies for insert to authenticated
  with check (app.at_least('workshop_manager'));

create policy companies_edit on companies for update to authenticated
  using (app.at_least('workshop_manager')) with check (app.at_least('workshop_manager'));

-- People: everyone reads their own row. RCK reads everyone (names on
-- jobs, assignment lists). An outsider reads their own company only.
create policy people_read on people for select to authenticated
  using (user_id = auth.uid() or app.is_rck() or company_id = app.my_company());

-- Owner and director add people and set tiers.
create policy people_insert on people for insert to authenticated
  with check (app.at_least('director'));

-- Anyone may edit their own row; owner and director may edit any.
create policy people_update on people for update to authenticated
  using (user_id = auth.uid() or app.at_least('director'))
  with check (user_id = auth.uid() or app.at_least('director'));

-- ...but editing your own row cannot change what you are allowed to do.
-- Only a signed-in person is guarded: the sign-in trigger and SQL run by
-- the owner in the dashboard have no auth uid and are let through.
create or replace function app.guard_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not app.at_least('director') then
    if new.tier <> old.tier or new.company_id <> old.company_id
       or new.active <> old.active or new.email is distinct from old.email
       or new.user_id is distinct from old.user_id then
      raise exception 'Only an owner or director can change tier, company, email or access';
    end if;
  end if;
  return new;
end $$;

create trigger people_guard_self before update on people
  for each row execute function app.guard_self_edit();

-- Nobody deletes people or companies. Deactivate instead.

-- =====================================================================
--  After running this, make the first owner. Either ahead of time:
--
--    insert into people (company_id, name, email, tier)
--    values ('00000000-0000-0000-0000-000000000001', 'Your Name', 'you@example.com', 'owner');
--
--  and they are linked on first sign-in; or after they have signed in:
--
--    update people set tier = 'owner' where email = 'you@example.com';
-- =====================================================================
