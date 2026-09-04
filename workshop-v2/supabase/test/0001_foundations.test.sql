-- =====================================================================
--  Tests for migration 0001: who can see and change people and
--  companies. Runs inside one transaction and rolls back.
--
--  Each "as person" block switches to the authenticated role with that
--  person's auth uid, exactly as a request from the app would arrive.
-- =====================================================================
begin;

-- helper: act as a signed-in user
create or replace function pg_temp.become(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.become_nobody() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ------------------------------------------------------------ fixtures
-- People set up ahead of time by the owner (as the migration's footer says).
insert into companies (id, name, trade) values ('11111111-1111-1111-1111-111111111111', 'Sparky Ltd', 'electrical');

insert into people (company_id, name, email, tier) values
  ('00000000-0000-0000-0000-000000000001', 'Olive Owner',    'owner@example.com',    'owner'),
  ('00000000-0000-0000-0000-000000000001', 'Dee Director',   'director@example.com', 'director'),
  ('00000000-0000-0000-0000-000000000001', 'Max Manager',    'manager@example.com',  'workshop_manager'),
  ('00000000-0000-0000-0000-000000000001', 'Wendy Workshop', 'wendy@example.com',    'workshop'),
  ('00000000-0000-0000-0000-000000000001', 'Chris Crew',     'chris@example.com',    'crew'),
  ('11111111-1111-1111-1111-111111111111', 'Sam Sparky',     'sam@sparky.example',   'subcontractor');

-- Each of them signs in for the first time: Auth creates the user, the
-- trigger links it to the row made ahead of time.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'director@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'manager@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'wendy@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'chris@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'sam@sparky.example'),
  -- and a stranger nobody set up
  ('aaaaaaaa-0000-0000-0000-000000000099', 'stranger@example.com');

do $$ begin
  assert (select count(*) from people where user_id is not null) = 7, 'every sign-in is linked to a person';
  assert (select tier from people where email = 'owner@example.com') = 'owner', 'a pre-made row keeps its tier when linked';
  assert (select tier from people where email = 'stranger@example.com') = 'pending', 'a stranger becomes pending, not crew';
  assert (select company_id from people where email = 'stranger@example.com') = '00000000-0000-0000-0000-000000000001', 'a stranger is parked at RCK';
end $$;

-- ------------------------------------------------- tier and company fit
do $$ begin
  begin
    insert into people (company_id, name, email, tier) values ('11111111-1111-1111-1111-111111111111', 'X', 'x@sparky.example', 'crew');
    raise exception 'should not reach';
  exception when others then
    assert sqlerrm like '%RCK tier must belong to RCK%', 'an RCK tier cannot sit at an outside company: ' || sqlerrm;
  end;
  begin
    insert into people (company_id, name, email, tier) values ('00000000-0000-0000-0000-000000000001', 'Y', 'y@example.com', 'subcontractor');
    raise exception 'should not reach';
  exception when others then
    assert sqlerrm like '%subcontractor must belong to an outside company%', 'a subcontractor cannot sit at RCK: ' || sqlerrm;
  end;
end $$;

-- ------------------------------------------------------------ anon sees nothing
do $$ begin perform pg_temp.become_nobody(); end $$;
set local role anon;
do $$ begin
  begin
    perform * from people;
    raise exception 'should not reach';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------------------ RCK crew reads all
do $$ begin perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000005'); end $$;
do $$ begin
  assert (select count(*) from people) = 7, 'crew can read every person';
  assert (select count(*) from companies) = 2, 'crew can read every company';
  assert app.my_tier() = 'crew';
  assert app.is_rck();
  assert not app.at_least('workshop');
end $$;

-- crew may fix their own name...
update people set name = 'Chris Crew-Cut' where email = 'chris@example.com';
do $$ begin
  assert (select name from people where email = 'chris@example.com') = 'Chris Crew-Cut', 'own name updated';
end $$;

-- ...but not promote themselves
do $$ begin
  begin
    update people set tier = 'owner' where email = 'chris@example.com';
    raise exception 'should not reach';
  exception when others then
    assert sqlerrm like '%Only an owner or director%', 'self-promotion refused: ' || sqlerrm;
  end;
end $$;

-- ...and an update to somebody else's row silently touches nothing (RLS)
update people set name = 'Hacked' where email = 'owner@example.com';
do $$ begin
  assert (select name from people where email = 'owner@example.com') = 'Olive Owner', 'crew cannot edit another person';
end $$;

-- ...and cannot add people or companies
do $$ begin
  begin
    insert into people (company_id, name, email, tier) values ('00000000-0000-0000-0000-000000000001', 'Z', 'z@example.com', 'crew');
    raise exception 'should not reach';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into companies (name) values ('Nope');
    raise exception 'should not reach';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------------------ subcontractor is fenced in
do $$ begin perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000006'); end $$;
do $$ begin
  assert (select count(*) from people) = 1, 'a subcontractor sees only their own company''s people, got ' || (select count(*) from people);
  assert (select count(*) from companies) = 1, 'a subcontractor sees only their own company';
  assert (select name from companies) = 'Sparky Ltd';
  assert not app.is_rck();
  assert not app.at_least('crew');
end $$;

-- ------------------------------------------------------------ manager can add a company, not a person
do $$ begin perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000003'); end $$;
insert into companies (name, trade) values ('Hydro Fix', 'hydraulics');
do $$ begin
  assert (select count(*) from companies where name = 'Hydro Fix') = 1, 'manager added a company';
  begin
    insert into people (company_id, name, email, tier) values ('00000000-0000-0000-0000-000000000001', 'N', 'n@example.com', 'crew');
    raise exception 'should not reach';
  exception when insufficient_privilege then null;
  end;
end $$;

-- another person's row is not theirs to update: the statement touches nothing
update people set tier = 'workshop' where email = 'chris@example.com';
do $$ begin
  assert (select tier from people where email = 'chris@example.com') = 'crew', 'manager cannot change tiers';
end $$;

-- ------------------------------------------------------------ director manages people
do $$ begin perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000002'); end $$;
update people set tier = 'crew' where email = 'stranger@example.com';
insert into people (company_id, name, email, tier) values ('00000000-0000-0000-0000-000000000001', 'New Person', 'new@example.com', 'workshop');
do $$ begin
  assert (select tier from people where email = 'stranger@example.com') = 'crew', 'director gave the stranger a tier';
  assert (select count(*) from people where email = 'new@example.com') = 1, 'director added a person';
end $$;

-- the new person signs in later and is linked by email (Auth does this, not a person)
do $$ begin perform pg_temp.become_nobody(); end $$;
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000007', 'NEW@example.com');
do $$ begin
  assert (select user_id from people where email = 'new@example.com') = 'aaaaaaaa-0000-0000-0000-000000000007', 'linked by email, case-insensitively';
  assert (select count(*) from people) = 8, 'no duplicate row was made';
end $$;

-- ------------------------------------------------------------ deactivated people lose access
do $$ begin perform pg_temp.become_nobody(); end $$;
update people set active = false where email = 'chris@example.com';
do $$ begin perform pg_temp.become('aaaaaaaa-0000-0000-0000-000000000005'); end $$;
do $$ begin
  assert app.my_tier() is null, 'a deactivated person has no tier';
  assert not app.is_rck(), 'and is not RCK';
end $$;

do $$ begin perform pg_temp.become_nobody(); end $$;
select 'migration 0001: all assertions passed' as result;
rollback;
