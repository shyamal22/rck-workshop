-- =====================================================================
-- RCK People — add the annual leave register.
--
-- An add-on for a database that already has supabase-schema.sql in it.
-- Safe to run more than once, and it touches nothing already entered.
-- (The full schema file now contains all of this too, so re-running that
-- instead would do the same job.)
-- =====================================================================

create table if not exists staff_leave (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  kind        text not null default 'annual',      -- annual | sick | unpaid | bereavement | parental | other
  starts_on   date not null,
  ends_on     date not null,
  days        numeric(5,2),
  approved_by text default '',
  notes       text default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint staff_leave_dates_ck check (ends_on >= starts_on)
);

create index if not exists staff_leave_staff_idx on staff_leave (staff_id, starts_on desc);
create index if not exists staff_leave_when_idx  on staff_leave (starts_on, ends_on);

drop trigger if exists staff_leave_touch on staff_leave;
create trigger staff_leave_touch before update on staff_leave
  for each row execute function touch_updated_at();

alter table staff_leave enable row level security;

drop policy if exists staff_leave_all on staff_leave;
create policy staff_leave_all on staff_leave
  for all to anon, authenticated using (true) with check (true);
