# RCK Workshop v2 — how it flows

*Design document 1 of the rebuild. Draft 2: adds the tiers, assignment and subcontractors.*

This is the map we build from. It says who uses the app, what data exists, where
each piece of it lives, how it moves between a phone and the shared record, and
what the screens are. Nothing here is code yet; the point is to agree the shape
before any is written.

The current app (`/app.js` in this repository) does the same job and does it
well enough that the crew use it. What it lacks is structure: one 3,000-line
file, one shared key with no idea who is holding it, all data in `localStorage`,
and every rule about status and due dates living only in the browser. v2 keeps
what works and puts a spine under it.

---

## 1. What stays, what changes

| | Today (v1) | v2 |
|---|---|---|
| Purpose | Gear status, damage → work orders, servicing, manuals, wall screen | Same, plus work orders **assigned** to a person or an outside company, and an owner's dashboard |
| Colour rule | Gear colour comes only from open work orders, never set by hand | Same rule, but computed **in the database** so every reader agrees |
| Who is who | A name typed into Settings; a device is "crew" or "workshop" | Each **person** signs in once; their tier travels with them. Subcontractors get a login too |
| Access | One public anon key, read/write for anyone holding it | Row-level security keyed to the signed-in person's tier and what is **assigned** to them |
| Offline | `localStorage` cache + outbox, replayed on reconnect | Same idea, on **IndexedDB** (bigger, survives photos), same outbox pattern |
| Staying current | Poll every 20 s | **Realtime** push from Supabase, with polling only as a fallback |
| History | Client writes a `wo_updates` row after each change | Database **trigger** writes the event; a client cannot forget |
| Code | One file, hand-rolled router and store | Modules with one job each, typed, tested where the rules live |
| Hosting | GitHub Pages, no build | GitHub Pages, built by an Action on push |

Principles carried over unchanged, because they are why the crew use it:

- **Report damage in about 30 seconds**, one hand, bad signal.
- **The colour is never set by hand.** Green = working, orange = usable but
  damaged, red = out of operation.
- **Servicing is separate from breakdowns.** A service falling due does not
  change the colour.
- **Everything prints** with the RCK document look.
- **The wall screen is just the app** in a full-screen mode.

---

## 2. Who uses it

Five tiers. Each one sees everything the tier below it sees, and the boundary
between RCK and outside is the one that matters most.

```mermaid
flowchart TD
  O["<b>Owner</b><br/>you · everything, plus the back end and the dashboard"]
  D["<b>Director</b><br/>full view, all actions, no back end"]
  M["<b>Workshop manager</b><br/>full view, runs the work: assigns, signs off"]
  W["<b>Workshop crew</b><br/>all assets and jobs · works what is assigned"]
  C["<b>RCK crew</b><br/>operators, drivers, office · all assets · raises issues"]
  X["<b>Subcontractor</b><br/>only the work orders assigned to their company"]
  S["<b>Screen</b><br/>the wall · read only"]
  O --> D --> M
  M --> W
  M --> C
  M -. assigns .-> X
  O -.-> S
  classDef out stroke-dasharray:5 4
  class X out
```

| Tier | Who | Sees | Does |
|---|---|---|---|
| **Owner** | You | Everything, plus a dashboard across the whole operation and the back end (Supabase project, deploys, settings, audit) | Anything |
| **Director** | Director | Everything the owner sees in the app, including the dashboard. No back end | Any action in the app, including people and their tiers |
| **Workshop manager** | Workshop lead | Everything operational: all assets, all jobs, servicing, reports, dashboard | Assigns jobs to people and subcontractors, signs off, manages the fleet and service plans |
| **Workshop crew** | Fitters, mechanics | All assets and jobs. **My work** shows what is assigned to them | Works a job: updates, parts, paperwork, marks their part done. Logs services |
| **RCK crew** | Operators, drivers, office staff | All assets and their colour, all jobs. **My work** shows anything assigned to them | Raises issues, updates locations, logs hours, reads manuals |
| **Subcontractor** | Sparky, hydraulics, glass, whoever is called in | **Only work orders assigned to their company**, and only the parts of them meant for outside eyes | Posts updates, attaches their report or invoice, marks their part done |
| **Screen** | The wall PC or tablet | The board | Nothing |

What each tier can see and do, in one table. A dot is "yes":

| | Owner | Director | Wkshp mgr | Wkshp crew | RCK crew | Subcontractor | Screen |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Back end (Supabase, deploys, config) | ● | | | | | | |
| Dashboard | ● | ● | ● | | | | |
| People and tiers | ● | ● | | | | | |
| All assets and their colour | ● | ● | ● | ● | ● | | ● |
| All work orders | ● | ● | ● | ● | ● | | ● |
| Work orders assigned to me / my company | ● | ● | ● | ● | ● | ● | |
| Raise a work order | ● | ● | ● | ● | ● | | |
| Assign, reassign, set target date | ● | ● | ● | | | | |
| Post an update on an assigned job | ● | ● | ● | ● | ● | ● | |
| Internal notes (hidden from subcontractors) | ● | ● | ● | ● | ● | | |
| See other subcontractors' quotes and costs | ● | ● | ● | ● | | | |
| Sign off (complete) | ● | ● | ● | ● | | | |
| Cancel, change severity | ● | ● | ● | | | | |
| Servicing plans and log | ● | ● | ● | ● | | | |
| Manuals | ● | ● | ● | ● | ● | | |
| Reports | ● | ● | ● | | | | |

A person has exactly one tier. Subcontractors belong to a **company**; the
assignment goes to the company, and every login at that company sees it. Office
staff who raise issues are RCK crew in this app unless made Director.

**Proposed and open:** the Director and the Workshop manager differ only in
people-and-tiers admin above. If the Director should be view-only instead, that
is one line in the policy. See §13.

## 3. The pieces and how they connect

```mermaid
flowchart LR
  subgraph Devices
    P[Crew phone]
    W[Workshop phone / tablet]
    O[Office laptop]
    X[Subcontractor phone]
    S[Wall screen]
  end
  GH[GitHub Pages<br/>static app shell]
  subgraph Supabase
    A[Auth<br/>who is this]
    DB[(Postgres<br/>the record + rules)]
    ST[Storage<br/>photos, paperwork, manuals]
    RT[Realtime<br/>change push]
  end
  P & W & O & X & S -- "load app (cached after first visit)" --> GH
  P & W & O & X & S -- "sign in, session token" --> A
  P & W & O & X & S -- "read / write rows (RLS by tier and assignment)" --> DB
  P & W & O & X -- "upload / signed download" --> ST
  DB -- "row changed" --> RT
  RT -- "push to every open device" --> P & W & O & X & S
```

The app is still a static site. There is no server of ours to run or patch.
Every rule that has to be true for everyone (colour, history, who may do what,
what a subcontractor may see) lives in Postgres as a view, trigger or policy. The
same app is on every phone; the tier decides what it shows. Every rule that only affects
what one person sees lives in the app.

---

## 4. Where data lives

| Data | Lives in | Why there |
|---|---|---|
| Who I am, my tier, my company, my session | Supabase Auth + `people` and `companies` tables; token cached on device | Needed before anything else loads; must be verifiable server-side |
| Who a job is assigned to | `wo_assignments` in Postgres | It decides what a subcontractor is allowed to read, so it must be a row the policy can check, not a note |
| Fleet, work orders, events, service plans and log, meter readings, manuals list | Postgres | The shared record. Only one copy is true |
| Photos, external repairer paperwork, manual files | Supabase Storage (private bucket) | Big binary; served by signed URL so the bucket is not public |
| Gear colour, days down, next service due | **Nowhere.** Computed by SQL views from the tables above | Derived values drift if stored. A view cannot disagree with its inputs |
| Local copy of the record | IndexedDB on the device | App opens instantly and reads offline |
| Outbox of changes made offline | IndexedDB on the device | Replayed in order when signal returns |
| Photos taken offline | IndexedDB (blob), then Storage | The row goes in the outbox with a placeholder; the file follows |
| Per-device preferences (last tab, board filter) | `localStorage` | Convenience only; losing it costs nothing |

Retention: nothing is deleted from the record. Gear is *retired*, work orders
are *cancelled*, people are *deactivated*. Files are kept even when the row that
pointed at them goes.

---

## 5. The data model

```mermaid
erDiagram
  companies ||--o{ people : "employs"
  companies ||--o{ wo_assignments : "assigned (external)"
  people ||--o{ wo_assignments : "assigned (internal)"
  work_orders ||--o{ wo_assignments : "who is on it"
  people ||--o{ work_orders : "reported_by / completed_by"
  people ||--o{ wo_events : "author"
  asset_types ||--o{ assets : "type"
  assets ||--o{ work_orders : "has"
  assets ||--o{ meter_readings : "has"
  assets ||--o{ service_plans : "has"
  assets ||--o{ service_log : "has"
  work_orders ||--o{ wo_events : "timeline"
  work_orders ||--o{ attachments : "photos, paperwork"
  service_plans ||--o{ service_log : "done under"
  service_log ||--o{ attachments : "paperwork"

  companies {
    uuid id PK
    text name "RCK, or a subcontractor"
    text kind "rck | subcontractor"
    text trade "electrical, hydraulics ..."
    text phone
    bool active
  }
  people {
    uuid id PK
    uuid company_id FK
    text name
    text tier "owner | director | workshop_manager | workshop | crew | subcontractor | screen"
    text phone
    bool active
  }
  wo_assignments {
    uuid id PK
    uuid work_order_id FK
    uuid person_id FK "one of these two"
    uuid company_id FK
    text brief "what they are asked to do"
    uuid assigned_by FK
    timestamptz assigned_at
    timestamptz done_at "they marked their part done"
    timestamptz released_at "taken off the job"
  }
  asset_types {
    text key PK
    text label
    int  rank "board order"
  }
  assets {
    uuid id PK
    text code "MIL-01"
    text name
    text type FK
    text make_model
    text location
    timestamptz location_at
    uuid location_by FK
    bool retired
  }
  meter_readings {
    uuid id PK
    uuid asset_id FK
    numeric hours
    date read_on
    uuid read_by FK
  }
  work_orders {
    uuid id PK
    bigint number "WO-0001"
    uuid asset_id FK
    text title
    text description
    text severity "orange | red"
    text status "see lifecycle"
    text repairer "internal | external"
    text external_company
    text external_ref
    numeric cost
    date target_date
    text work_done
    uuid reported_by FK
    timestamptz reported_at
    uuid completed_by FK
    timestamptz completed_at
  }
  wo_events {
    uuid id PK
    uuid work_order_id FK
    uuid author FK
    timestamptz at
    text kind "created | note | status | working | waiting | problem | looked | file | assigned | part_done | complete | reopen"
    text visibility "internal | shared"
    text body
    jsonb meta
  }
  attachments {
    uuid id PK
    text owner_kind "work_order | service_log | manual"
    uuid owner_id
    text path "storage object path"
    text name
    text mime
    int  bytes
    uuid added_by FK
  }
  service_plans {
    uuid id PK
    uuid asset_id FK
    text name
    int  every_months
    int  every_hours
    date starts_on
    numeric start_hours
    bool active
  }
  service_log {
    uuid id PK
    uuid plan_id FK
    uuid asset_id FK
    text name
    date done_on
    numeric hours
    uuid done_by FK
    text note
  }
  manuals {
    uuid id PK
    text title
    text note
    uuid added_by FK
  }
```

What changed from v1 and why:

- **`companies`** holds RCK itself and every subcontractor. A person belongs to
  one company. This is what lets a policy say "a subcontractor sees a job only
  if their company is assigned to it".
- **`wo_assignments`** is who is on a job. A job can have several at once (a
  fitter and a sparky), each with a one-line brief of what they are asked to do,
  and each marks their own part done. Taking someone off a job sets
  `released_at` rather than deleting, so the record shows who was asked.
- **`wo_events.visibility`** splits the timeline: `internal` notes never leave
  RCK; `shared` ones are what a subcontractor reads. The default is internal
  for RCK people and shared for subcontractors, so nothing leaks by accident.
- **`people`** exists. Every `_by` column is a foreign key to a person, not a
  typed name. Names can be corrected once; history stays attached.
- **`asset_types`** is a table, not a free-text column, so the board order and
  labels are data. Adding a type is still one tap; it just inserts a row.
- **`meter_readings`** is a log, not a pair of columns on the asset. You can see
  when hours were read and by whom, and a mis-typed reading can be corrected
  without losing the previous one.
- **`attachments`** is one table for every kind of file, so "what paperwork is
  on file for this machine" is one query.
- **`wo_events.kind`** carries the v1 "what kind of update is this" vocabulary
  (working on it, waiting on, hit a problem, had a look, just info) as first-class
  values, so the live line on a card is a query, not a parse.

Views, computed on read:

- **`my_work`** — for the signed-in person: every open assignment to them or
  their company, with the job and asset alongside. This is the "My work" screen
  and the whole of a subcontractor's app.
- **`asset_status`** — for each asset: colour, open work order count, down
  since, days down, expected back. Built from `work_orders where status not in
  (complete, cancelled)`.
- **`service_due`** — for each active plan: last done (date, hours), next due by
  date, next due by hours, state (ok / due soon / overdue / no reading). The
  tighter of date and hours wins, exactly as v1.

---

## 6. How data moves

### Reading

```mermaid
flowchart TD
  open[App opens] --> cache{Local copy<br/>in IndexedDB?}
  cache -- yes --> render1[Render from local copy<br/>instantly]
  cache -- no --> spinner[Show loading]
  render1 --> sync
  spinner --> sync[Pull changed rows since<br/>last sync watermark]
  sync --> apply[Apply to local copy<br/>re-render what changed]
  apply --> live[Subscribe to Realtime<br/>on the tables in view]
  live -- "row changed" --> apply
  live -. "socket lost" .-> poll[Poll every 60 s<br/>until it comes back]
  poll --> apply
```

Two things differ from v1. The pull asks only for rows changed since a
watermark (`updated_at > last_seen`) instead of re-downloading up to 17,000
rows every 20 seconds. And Realtime means the wall screen and the workshop
phone update the moment a crew phone raises a job, without polling.

### Writing

```mermaid
flowchart TD
  act[Person taps Raise work order] --> validate[Validate in the app<br/>required fields, tier allowed]
  validate --> local[Apply to local copy<br/>screen updates at once]
  local --> outbox[Append to outbox<br/>IndexedDB, ordered]
  outbox --> online{Signal?}
  online -- no --> wait[Orange dot: n changes waiting]
  wait -- "back online / app foregrounded" --> flush
  online -- yes --> flush[Flush outbox in order]
  flush --> db[(Postgres: insert / update<br/>RLS checks tier and assignment)]
  db --> trig[Trigger writes wo_events row<br/>touches updated_at]
  trig --> rt[Realtime pushes change]
  rt --> others[Every other open device<br/>applies it]
  db -- "rejected (policy, conflict)" --> fail[Keep op in outbox<br/>show what was refused]
```

Rules that make this safe:

- **Every op carries an id chosen on the device**, so a replay after a dropped
  connection is an upsert, never a duplicate.
- **The outbox is ordered.** A "complete" cannot land before the "create" it
  belongs to.
- **Photos travel after their row.** The work order is raised with the photo
  held locally; the file uploads next, and the attachment row last. A job is
  never invisible because a photo is slow.
- **The database is the referee.** If two workshop phones sign off the same job
  offline, the second replay finds it already complete and the app shows the
  person that, rather than silently overwriting.

---

## 7. Work order lifecycle

```mermaid
stateDiagram-v2
  [*] --> reported : Crew or Workshop raises it
  reported --> in_progress : Workshop starts (working on it)
  in_progress --> awaiting_parts : Waiting on parts / quote
  awaiting_parts --> in_progress : Parts arrived
  in_progress --> with_external : Sent to external repairer
  with_external --> in_progress : Back from repairer
  reported --> with_external : Sent straight out
  in_progress --> complete : Workshop signs off with what was done
  with_external --> complete : Returned fixed, sign off
  reported --> cancelled : Planner, duplicate or not a fault
  in_progress --> cancelled : Planner
  complete --> in_progress : Reopen, fault came back
  complete --> [*]
  cancelled --> [*]
```

Who may move it is a policy in the database, not a hidden button in the app:

| Transition | RCK crew | Workshop crew | Subcontractor | Manager and up |
|---|:-:|:-:|:-:|:-:|
| Raise | ● | ● | | ● |
| Add a note or photo | ● | ● | on assigned jobs, shared only | ● |
| Mark my part done | on assigned jobs | on assigned jobs | on assigned jobs | ● |
| Change status, target date, repairer | | ● | | ● |
| Assign, reassign | | | | ● |
| Sign off (complete) | | ● | | ● |
| Reopen | | ● | | ● |
| Cancel, change severity | | | | ● |

A change of status always writes a `wo_events` row (by trigger), and the newest
event of kind `working / waiting / problem / looked / note` is the job's **live
line**, exactly as in v1.

---

## 8. Assigning work

This is the piece v1 does not have and the reason subcontractors get a login.
A job is raised by anyone at RCK; the workshop manager decides who is on it;
each person on it sees it under **My work** on their own phone; the workshop
signs it off.

```mermaid
flowchart LR
  subgraph RCK
    raise["Crew raises it<br/>gear goes orange or red"]
    assign["Workshop manager assigns<br/>a person, a company, or both<br/>with a one-line brief each"]
    fitter["Fitter's phone<br/>My work: the job appears"]
    signoff["Workshop signs off<br/>what was done · gear goes green"]
  end
  subgraph Outside
    sparky["Sparky's phone<br/>My work: only this job,<br/>only shared notes and photos"]
  end
  raise --> assign
  assign -- "internal" --> fitter
  assign -- "external" --> sparky
  fitter -- "updates, marks part done" --> signoff
  sparky -- "updates, report or invoice,<br/>marks part done" --> signoff
```

What a subcontractor's app is: a list of the jobs assigned to their company,
newest first, and nothing else. No board, no other assets, no servicing, no
menu. Opening a job shows the machine (code, name, where it is), what is wrong,
the brief they were given, the shared photos and notes, and three things they
can do: post an update, attach a file, mark their part done. When their part is
done the job stays visible to them until it is signed off, then drops off their
list. They never see internal notes, other companies' costs, or the sign-off
fields.

What **My work** is for RCK people: the same list, but reached from a **My
profile** button in the normal app, and showing everything, because they are
inside.

How someone finds out they have been assigned:

- The job appears in My work the next time the app is open, within a second if
  it already is. A count sits on the My profile button.
- A **push notification** when the app is installed to the home screen, on both
  iPhone and Android. This replaces the WhatsApp message.
- An **email** as a fallback for anyone who has not installed it.

Push and email need a small piece of back end (a database function that fires
when an assignment row is inserted). It is the one place v2 has server-side
code, and it is the owner's back end to look after. Which channels to switch on
is a decision in §13.

Cost and the outside: a subcontractor's invoice number and amount are recorded
against **their assignment**, not against the job as a whole, so two companies
on the same job never see each other's numbers. The job's total cost is the sum,
visible to workshop crew and up.

---

## 9. Gear colour

```mermaid
flowchart LR
  wo[(work_orders<br/>status not complete/cancelled)] --> q{Any open<br/>with severity red?}
  q -- yes --> red[RED<br/>out of operation]
  q -- no --> q2{Any open<br/>at all?}
  q2 -- yes --> orange[ORANGE<br/>usable, damaged]
  q2 -- no --> green[GREEN<br/>working]
```

This is the `asset_status` view. The app never stores a colour, and neither
does the wall screen, the fleet report, or a future export. Retired assets are
excluded from the board but keep their history.

---

## 10. When a service is due

```mermaid
flowchart TD
  plan[Active plan:<br/>every N months and/or every H hours] --> last{Last done<br/>in service_log?}
  last -- yes --> base[Base = that date and hours]
  last -- no --> base0[Base = plan starts_on / start_hours]
  base --> bydate[Due by date =<br/>base date + N months]
  base0 --> bydate
  base --> byhours{Plan has<br/>every_hours?}
  base0 --> byhours
  byhours -- yes --> reading{Latest meter<br/>reading exists?}
  reading -- no --> unknown[NO READING<br/>not enough to go on]
  reading -- yes --> hrs[Due at = base hours + H<br/>compare to latest reading]
  byhours -- no --> pick
  bydate --> pick[Tighter of the two wins]
  hrs --> pick
  pick --> state{Past due?<br/>Within 14 days or<br/>last 10% of hours?}
  state -- past --> overdue[OVERDUE]
  state -- within --> soon[DUE SOON]
  state -- neither --> ok[UP TO DATE]
```

Same rules as v1, moved into the `service_due` view so the Due tab, the
machine page and the fleet servicing report all agree to the day.

---

## 11. Screens and how they are used

### Screen map

```mermaid
flowchart TD
  signin[Sign in] --> tier{Tier?}
  tier -- subcontractor --> mywork_x["My work<br/>only jobs assigned to my company"]
  mywork_x --> wo_x["Job: machine, fault, my brief,<br/>shared notes · update · attach · part done"]
  tier -- owner, director, manager --> dash["Dashboard<br/>fleet colour counts · open jobs by status and assignee<br/>overdue · servicing due · subcontractors out · cost this month"]
  dash --> home
  tier -- crew, workshop --> home[Home: three doors]
  home --> me["My profile<br/>My work: jobs assigned to me"]
  me --> wo
  home --> maint[Maintenance]
  home --> svc[Servicing]
  home --> man[Manuals]
  maint --> board[Gear board<br/>colour per machine, filters by type]
  maint --> orders[Work orders<br/>open first, live line on each]
  maint --> report[Report damage<br/>the 30-second form]
  board --> asset[Machine page<br/>colour, location, hours, open jobs, history]
  orders --> wo[Work order<br/>timeline, workshop panel, print]
  asset --> report
  asset --> wo
  svc --> due[Due list<br/>worst first]
  svc --> fleet[By machine]
  fleet --> svcasset[Machine servicing<br/>plans, log, mark done]
  due --> svcasset
  man --> manual[Manual tile → opens file]
  home -. menu .-> screen[Wall screen<br/>full-screen, read only]
  home -. menu .-> reports[Reports<br/>fleet status, repair history, CSV]
  home -. menu .-> admin[Manage: fleet, types,<br/>people and tiers, companies]
  dash -. owner only .-> backend["Back end<br/>Supabase project, deploys, audit, settings"]
```

### The flows that matter

**Report damage (Crew, on site, one hand).** Board → tap the machine → Report →
title, one line of description, *usable* or *out of operation*, camera → Raise.
Target: five taps and one short sentence. Works with no signal; the card shows
"waiting to send" until it goes.

**Work a job (Workshop).** Work orders → tap the job → the workshop panel is at
the top: status, target date, who is fixing it. Post an update by writing the
line and tapping which kind it is. Attach paperwork. Everything else (the
timeline, print) is below.

**Assign a job (Workshop manager).** Open the job, tap Assign, pick a person
or a company from a short list (the ones used recently come first), write one
line of what they are to do, done. They are told. Add a second assignee the
same way.

**Work an assigned job (Subcontractor, or a fitter from My work).** My work,
tap the job. What is wrong and the brief are at the top, the machine and its
location under that, then shared notes and photos. Post an update, attach the
invoice, tap **My part is done**.

**Sign off.** One button, one required field: *what was done*. Cost is asked
for but not required. The gear goes green on every screen within a second.

**Log a service (Workshop).** Machine servicing page → the due plan → Mark done
→ date (today), hours (last reading offered), note. The clock restarts.

**Look across everything (Owner, Director, Manager).** The dashboard opens
first. Counts of green, orange and red; open jobs grouped by status with who is
on each; anything overdue; services due this fortnight; which subcontractors
have jobs out and for how long; cost this month against last. Every number is a
tap away from the list behind it. The Owner also has a way through to the back
end from here; nobody else sees that door.

**Glance at the wall (Screen).** Counts across the top, then every open job
with its live line and due date, then machines needing attention. Refreshes
itself, keeps the screen awake, never asks for anything.

### Usability rules

- Every tap target is at least 48 px. Primary actions sit within thumb reach at
  the bottom of the screen.
- The sync dot is always visible: green live, orange changes waiting, red cannot
  reach the database, grey practice mode.
- Anything that changes the shared record says so back ("Raised WO-0142",
  "Signed off").
- A form remembers what was typed if the app is backgrounded mid-way.
- Lists open on what needs attention: open jobs first, overdue services first,
  red machines first.
- Print is a button on the thing being printed, never a separate screen.

---

## 12. How the code is organised

```
workshop-v2/
  src/
    app/          shell, router, sign-in, sync dot
    data/         Supabase client, IndexedDB cache, outbox, realtime, sync
    domain/       pure rules with tests: lifecycle, colour, service due, live line
    features/
      assets/     board, machine page, manage fleet
      work-orders/ list, work order, report damage, workshop panel
      servicing/  due list, by machine, plans, mark done
      manuals/
      reports/    fleet status, repair history, CSV
      screen/     wall screen
      people/     sign in, my profile, my work, companies, tiers
      dashboard/  owner, director and manager overview
      notify/     assignment push and email (server-side function)
    ui/           buttons, cards, forms, print document theme
  supabase/
    migrations/   numbered SQL, one change each, applied in order
    functions/    the one server-side piece: notify on assignment
    seed.sql      the standard fleet and types
  docs/           this file and the ones after it
```

Rules of the structure:

- **`domain/` has no imports from anywhere else** and no DOM. It is the rules,
  and it is where the tests are. The database views implement the same rules in
  SQL; a test fixture checks the two agree.
- **`data/` is the only thing that talks to Supabase or IndexedDB.** Features
  ask the store; they never fetch.
- **A feature owns its screens and nothing else's.** Shared bits go to `ui/`.
- **Migrations, not a re-runnable schema file.** Each change to the database is
  a new numbered file. The v1 "paste the whole file again" approach is what let
  tables silently stop matching the code.

---

## 13. Decisions to make before building

Recommendation first in each case.

**Sign-in.** Settled by the requirement: subcontractors need a login, so every
person has one. Supabase Auth, one account per person, tier and company on
their profile.
- *Recommended:* magic link by email for everyone. Free, no passwords.
- *Also worth having:* phone-number sign-in (a code by text) for subcontractors
  and crew who live on their phone and not their inbox. Small SMS cost per
  sign-in; can be added at any stage without changing anything else.

**Director versus Workshop manager.**
- *Proposed:* both have full view and every action; only the Director manages
  people and tiers. If the Director should be view-only, it is one line in the
  policy. Say which.

**How people are told about an assignment.**
- *Recommended:* push notification to the installed app, with email as the
  fallback for anyone who has not installed it. This is what removes WhatsApp.
- *Alternative:* in-app only (the badge on My profile). No back end at all, but
  a subcontractor has to remember to open it.

**Stack.**
- *Recommended:* Vite + TypeScript + Preact, deployed to GitHub Pages by a GitHub
  Action on push. Types are how the module boundaries above get enforced; Preact
  is small enough that a phone on 3G still opens fast.
- *Alternative:* plain ES modules, no build, as v1. Simpler to deploy by hand, but
  no types and no tests without adding tooling anyway.

**Storage privacy.** Settled by the requirement too: a subcontractor must not be
able to open another company's invoice, so files are in a private bucket and
served by short-lived signed links that respect the same assignment rule.

**Where v2 lives.**
- *Recommended:* `workshop-v2/` in this repository alongside the other RCK apps,
  with its own Supabase project so v1 keeps running untouched until cut-over.
  Migrating v1's data is a one-off script, planned as its own phase.

---

## 14. Building it in stages

Each stage is usable on its own and is put in front of the workshop before the
next starts.

| Stage | Delivers | Done when |
|---|---|---|
| 0 Foundations | Repo layout, build, deploy to Pages, Supabase project, `companies`, `people`, tiers, sign-in, sync dot | You, a fitter and a test subcontractor can each sign in and see a screen that matches their tier |
| 1 Fleet | `assets`, `asset_types`, board, machine page, manage fleet, seed the 33 machines | The board shows every machine, all green; the subcontractor login cannot see it |
| 2 Damage → work order | Report damage, work orders list, work order page, lifecycle, events, photos, colour view | Crew raise a job offline; the board goes red when it lands |
| 3 Assigning | Assignments, My profile and My work, the subcontractor app, shared and internal notes, part done | A sparky sees only the job they were given, posts an update, and the workshop sees it |
| 4 Workshop | Workshop panel, updates with kinds, live line, per-assignment cost, sign-off, print | A job goes from raised to signed off with two assignees, and prints |
| 5 Telling people | Push and email on assignment | The sparky's phone buzzes when assigned, with nothing sent by hand |
| 6 Dashboard and wall | Owner and director dashboard, full-screen wall board, realtime | The wall and the dashboard update within a second of a phone |
| 7 Servicing | Plans, log, meter readings, due view, Due and By-machine tabs | The Due list matches a hand check for three machines |
| 8 Manuals and reports | Manuals shelf, fleet status, repair history, CSV | Reports match v1's for the same data |
| 9 Cut-over | Migrate v1 data, redirect v1, retire old key | The crew are on v2 and nobody asks for v1 |

Next document: **02 — the database**, with the migrations for stages 0–3
written out and the row-level policies per tier, including the assignment rule
that fences a subcontractor in.
