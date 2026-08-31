-- =====================================================================
-- RCK People — add the disciplinaries and breaches register.
--
-- An add-on for a database that already has supabase-schema.sql in it.
-- Safe to run more than once, and it touches nothing already entered.
-- (The full schema file now contains this too, so re-running that
-- instead would do the same job.)
--
-- Company profiles needs no database change at all — it reads the staff
-- you already have.
-- =====================================================================

create table if not exists staff_breaches (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references staff(id) on delete cascade,
  title        text not null,
  description  text default '',
  raised_by    text default '',
  raised_at    timestamptz not null default now(),
  status       text not null default 'open',      -- open | complete
  hr_comments  text default '',
  outcome      text default '',
  completed_by text default '',
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists staff_breaches_staff_idx  on staff_breaches (staff_id, raised_at desc);
create index if not exists staff_breaches_status_idx on staff_breaches (status, raised_at desc);

drop trigger if exists staff_breaches_touch on staff_breaches;
create trigger staff_breaches_touch before update on staff_breaches
  for each row execute function touch_updated_at();

alter table staff_breaches enable row level security;

drop policy if exists staff_breaches_all on staff_breaches;
create policy staff_breaches_all on staff_breaches
  for all to anon, authenticated using (true) with check (true);
