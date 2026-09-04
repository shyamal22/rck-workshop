# RCK Workshop v2

The structured rebuild of the workshop app. The design is in
[`docs/01-flow-and-architecture.md`](docs/01-flow-and-architecture.md); this
folder is the code, built stage by stage in the order that document sets out.

**Stage 0, foundations** — this is what exists now:

- the project skeleton (Vite, TypeScript, Preact), laid out as the design says:
  `src/app` shell and router, `src/data` the only code that talks to Supabase,
  `src/domain` pure rules with tests, `src/features` one folder per screen area;
- migration `0001_foundations.sql`: companies, people, tiers, the link from a
  sign-in to a person, and row-level security;
- sign-in by email link, and a landing screen chosen by tier;
- the tier rules from the design as tested code (`src/domain/tiers.ts`).

## Running it locally

```sh
cd workshop-v2
npm install
npm test          # the domain rules
npm run dev       # http://localhost:5173
```

The app will say "Not set up yet" until `public/config.js` has a project in it.

The database has tests too. They need a throwaway local Postgres (never a real
project): `supabase/test/00_stub_supabase.sql` stands in for the parts of
Supabase the migrations rely on, then every migration runs, then every
`*.test.sql` asserts who can see and change what, and rolls back.

```sh
createdb rckw2_test
DATABASE_URL=postgres://postgres@localhost:5432/rckw2_test sh supabase/test/run.sh
```

## Setting up the database, once

1. Create a Supabase project (Sydney region). Note the **Project URL** and the
   **anon public** key from Settings → API.
2. Open SQL Editor → New query, paste `supabase/migrations/0001_foundations.sql`,
   Run. Later migrations are numbered and run in order, each once. (With the
   Supabase CLI: `supabase db push` from this folder does the same.)
3. Make yourself the owner, before or after your first sign-in, with one of the
   two statements at the foot of that migration.
4. Authentication → URL configuration: add the site URL and, under redirect
   URLs, the address the app is served from (for Pages,
   `https://shyamal22.github.io/rck-workshop/workshop-v2/`; for local work,
   `http://localhost:5173/`). Email sign-in is on by default; leave "confirm
   email" on.
5. Put the URL and anon key into `public/config.js`. The anon key is fine in
   a public repository: every table is behind row-level security and nothing
   can be read without a signed-in person with a tier.

## Publishing

The workflow in `.github/workflows/pages.yml` builds this folder on every push
to `main` and publishes the repository root (the v1 apps) plus the built v2 at
`/workshop-v2/`. One-time change in the repository: **Settings → Pages →
Source: GitHub Actions** (it is currently "Deploy from a branch").

## Adding people

Until the People screen exists (stage 0 ends with sign-in; managing people is
stage 3), add a person in SQL:

```sql
insert into people (company_id, name, email, tier)
values ('00000000-0000-0000-0000-000000000001', 'Dave Smith', 'dave@example.com', 'workshop');
```

For a subcontractor, make their company first:

```sql
insert into companies (name, trade, phone) values ('Sparky Ltd', 'electrical', '021 000 000') returning id;
insert into people (company_id, name, email, tier) values ('<that id>', 'Sam Sparky', 'sam@sparky.example', 'subcontractor');
```

Anyone who signs in without being added lands on a "not yet given access"
screen and can do nothing until an owner or director sets their tier.
