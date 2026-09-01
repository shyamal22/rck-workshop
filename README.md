# RCK Workshop

Shared gear tracking for RCK plant and trucks. Crews report damage from their phones,
the workshop works the job and records what was done, and everyone — including the
screen on the workshop wall — sees the same live picture.

**Green** = working · **Orange** = damaged but still usable · **Red** = out of operation

The colour is never set by hand. It comes straight from the open work orders:
any red work order makes the gear red, any orange one makes it orange, and when
the last job is signed off the gear goes green again on its own.

---

## Opening the app

The landing page offers two doors:

- **Maintenance** — gear status, damage reports, work orders, repair history.
- **Maintenance crew** — who is managing which job, and how each of them is tracking.

**Costs** is still there, in the ⋮ menu rather than on the landing page. It records
planned and actual spend per asset and stays deliberately unconnected to
maintenance: a repair cost on a work order does **not** reach the cost tracker,
and a cost never changes a machine's colour.

## Maintenance crew

Every work order has an RCK person accountable for it — **separately** from whether
the spanners are RCK's or an external company's. A job sent to Hydraulink still has
someone here chasing it.

- The workshop sets **Managed by** on the work order. Six are preloaded — Milian,
  Clint, Ryder, Sebastion, Lyndon and Barry — and anyone can be added, either from
  the crew board or straight from the work order.
- The **crew board** is one row per person: open jobs, a red flag if any are
  overdue, what they have done today, and today's count. Whoever needs attention
  is at the top — most overdue, then most open, then busiest. Tapping a row lists
  everything they hold and what they've fixed.
- Jobs with nobody on them are pushed to the top of the crew board, since an
  unowned job is the one that goes quiet.
- Assigning changes nothing operationally — it doesn't touch gear colour or status.
  It only answers who is on what.

### The daily diary

Same idea as the job diary in Dispatch, but for the workshop. Each person logs
what they did as the day goes: **on the tools, inspection, quote requested,
quote received, parts ordered, parts arrived, dropped at a repairer, picked up,
admin** — and anyone can add a type of their own.

- An entry carries a time (24-hour, the way a diary is written), a note, and
  photos or paperwork. It can point at a work order but doesn't have to — plenty
  of a day isn't one job.
- Quote and order entries take an **amount**, so what a repair was quoted at sits
  in the record next to the day it was chased. These are a note of what was
  quoted, **not** the cost ledger — nothing here reaches the cost tracker.
- The **Daily diary** opens on the day's four numbers — reported, updates, files,
  closed — then everyone who was on the tools as a row of chips you can tap to
  filter, then the day itself as one stream, **newest first**. The latest thing
  that happened is the first thing you read; nobody scrolls to the bottom to find
  out what is going on. A date stepper moves between days and the whole day prints
  as a sheet for the manager.
- A person's own page leads with today, the same way, then their open jobs, then
  their earlier days.

**Most of the diary writes itself.** Anything done to a work order — reporting the
damage, updating it, adding a note, arranging a repairer, uploading paperwork,
signing it off — appears in that person's diary for the day, linked to the job.
Almost everything in a diary arrives this way, so it is the exception that carries
a mark: a line someone typed themselves says **written by hand**.

Those lines are not a copy of the work; they *are* the work, read back. Every
action on a job is already stored with who did it and when, and that record syncs
to every phone, so the diary shows **everyone's** day on any device and reaches
back to before the diary existed. Nothing has to be captured first, and the diary
can never drift out of step with the jobs it describes.

Entries appear under the name on the device that did the work. Someone not on the
maintenance crew still gets their own day, shown under **Also active** on the crew
board — the work is never filed under somebody else and never disappears.

### One person, several devices

Most people have the tool on a phone and a laptop, and the two are usually named
differently — *Clint*, *Clint - phone*, *Clint Laptop*. Left alone that is three
people with a third of a day each.

**⋮ → Link devices to people** fixes it. The screen reads the names that have
actually done work, suggests the ones that look like the same person, and picks the
real name (not the device name) to keep. Confirming a group:

- merges the three diaries into one, so the tally is the person's whole day across
  every device;
- moves anything **assigned** to a folded name onto the kept one, so jobs given to
  a placeholder land on the person really holding them;
- leaves the folded names off the crew board, listed instead as *also …* under the
  person they belong to.

Any name can be linked by hand, and **Separate** undoes it. Nothing is deleted or
rewritten in the job history — the original name stays on every update; linking only
says which names are the same person. So a mistake costs one tap to undo.

Photos and paperwork ride along on the line that captured them, so a photo added
to a job shows as a photo in the diary rather than a mention of one.

**The day is tallied.** Each person's day is counted from their diary — reported,
updates, photos, documents, closed — and shown on their crew tile, at the top of
their page, against each day, and on the printed day sheet. That is the
"who got what done today" figure.

Everything points at everything else: a captured diary line opens the job it came
from, a work order names who is managing it and links to their page, and their
page lists their jobs. Updating a job from the crew side and from the maintenance
side are the same act on the same record — there is one work order, seen from
two directions.

## What it does

**For the crew**
- See every machine, its colour, where it is and when it's due back.
- Report damage in about 30 seconds: pick the gear, say what's wrong, choose
  *usable* or *out of operation*, add photos, tap **Raise work order**.
- Raising the report creates a numbered work order (WO-0001, WO-0002 …) with the
  full issue and gear details, printable as a PDF straight from the phone.
- Update where a machine is, by typing it or with one tap on **Use my GPS**.

**For the workshop**
- Set the status: Reported → Being repaired → Waiting on parts → With external repairer.
- Set the **expected back-in-service date**. Everyone sees the countdown, and
  anything past its date shows as overdue in red.
- Say who is doing the work:
  - **RCK workshop crew** — post updates as the job goes along.
  - **External company** — record the company, their job/invoice number and cost,
    and upload the report or invoice they send back.
- Upload photos and paperwork at any point; they attach to the work order and appear
  on the printed history.
- Sign the job off with **what was done**. The gear turns green automatically.

### Saying what's happening

A plain comment never told you whether someone was fixing the thing or only
talking about it, so a job could carry six notes and still tell you nothing.
Posting one now means saying which it is — write the line, then tap the one that
fits:

| | means |
|---|---|
| **Working on it** | spanners on it now — no typing needed, one tap says it |
| **Waiting on** | parts, a quote, the repairer. Type what for and the card says it |
| **Hit a problem** | needs a decision |
| **Had a look** | checked it over, nothing done yet |
| **Just info** | nothing for anyone to do |

The newest one becomes the job's **live line**, and it follows the job everywhere:
on the work-order card, at the top of the job, on the wall screen, in the diary and
on the printed sheet. So the board answers *is this moving?* without anyone opening
anything — including when the answer is **No word yet**, which is the one a
workshop most needs to see.

Colour keeps its meaning: red is bad news, yellow is held up, dark is happening
now, grey is only words.

**On the workshop wall**
- The **Workshop screen** (`#/screen`) is a full-screen board: counts of working /
  usable / out-of-operation gear, every active work order with its status and due
  date, and the gear needing attention. It refreshes every 15 seconds and keeps the
  screen awake by itself.

**Printed documents** carry the RCK look from the quotation template — navy
banded headings, gold labels, a cream panel of the key facts — and print their
backgrounds properly rather than coming out as bare text.

The **work order** reads in the order someone needs it: who and what at the top,
then the state of it in a highlighted box, then **what is wrong**, **how it was
fixed**, **cost** (always shown, "Not recorded" when it hasn't been entered),
then comments and history, attachments and photos, and sign-off lines.

**Reports** — one button each:
- **Fleet status** — every machine, colour, location, due date, plus all open jobs.
- **Repair history** — whole fleet or one machine, any date range: every repair,
  what was done, who did it, days out of action, cost, and the paperwork on file.
- **CSV export** of all work orders for Excel.

Every change is written to the work order's history, with who did it and when, so
the record of a machine's repairs is complete without anyone having to keep it.

---

## Costs

- **Assets** — the same fleet, showing actual and planned spend per machine.
- Tapping one shows its running total, its variance and every entry against it.
- **Adding a cost** takes: planned or actual, the amount, what it is for, the
  date it was incurred, the date payment is due, and any number of invoices or
  photos attached to it.
- A **planned** cost can later be marked **actual** in place, which avoids the
  double counting that comes from entering it twice.
- **Tracker** — this month, last month, this quarter, the financial year
  (April to March) or any custom range. Shows actual vs planned vs variance, a
  month-by-month bar breakdown, spend per asset, and planned payments coming up.
  Prints to PDF and exports to CSV.

## Setting it up

Two jobs, about 15 minutes total, done once.

### 1. The database (once, by whoever sets this up)

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. **New project** — any name, pick the Sydney region, set a database password
   (you won't need it again, but save it somewhere).
3. Wait about two minutes for the project to build.
4. Open **SQL Editor** in the left sidebar → **New query**.
5. Open `supabase-schema.sql` from this repo, copy the whole file, paste it in,
   press **Run**. It should say *Success*. (Re-running it later is safe, and is
   how you add the **Costs** section to a database created before costs existed.)
6. Go to **Settings → API** and copy two things:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting `eyJ…`
     (Use the *anon public* key. Never the `service_role` one.)

The free tier is far more than this app will ever need.

### 2. The app

Put those two values into `config.js` and every phone that opens the app is
connected automatically, with nothing to type in:

```js
window.RCKW_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
  workshopPin: '4821'     // optional, see below
};
```

Commit that change and the site redeploys itself.

If you'd rather not put the key in the repo, leave `config.js` blank — each device
can paste the two values into **Settings → Shared data** instead, and there's a
**Test connection** button that says exactly what's wrong if something isn't right.

### 3. On each phone

The quickest way: on a phone that is already connected, go to
**Settings → Set up someone else's phone → Share link** and send that link to the
crew. One tap connects their phone — they never type the key, and because the
details ride in the URL's `#` fragment they are never sent to the web server.
Treat the link like a key: only send it to RCK people.

By hand instead:

1. Open the app URL in the phone's browser.
2. **Add to Home Screen** (Share menu on iPhone, ⋮ on Android). It installs like a
   normal app.
3. Open it, go to **Settings**, enter your name and choose:
   - **Crew** — report damage, see everything, update locations.
   - **Workshop** — all of that, plus change status, set dates, upload paperwork
     and sign jobs off.

Set `workshopPin` in `config.js` if you want a code required before a device can
switch itself to Workshop. It stops accidents; it is not a password, since the
code sits in a file anyone can read.

### 4. The fleet list

First person in goes to **⋮ → Manage gear → Load the standard fleet**. That creates
the 33 machines — 5 millers, 5 pavers, 7 rollers, 4 bobcats, 6 trucks, 6 trailers —
as MIL-01…05, PAV-01…05, ROL-01…07, BOB-01…04, TRK-01…06, TRL-01…06. Rename them,
add make and model, or add more gear any time from the same screen. Sold or scrapped
machines get **Retired**, which hides them from the board but keeps their history.

**Types of gear** are not a fixed list. When adding or editing a machine, pick
**+ Add a new type…** in the Type box and name it — "Emulsion trailer", say — and
from then on it is a type like any other: its own filter on the board, its own
group in the damage report picker, its own section in the fleet report. A type
exists for as long as there is gear filed under it, so there is no separate list
to keep tidy. Naming one that already exists in a different spelling reuses the
existing one rather than making a near-duplicate.

### 5. The workshop screen

On the wall PC or tablet: open the app, **⋮ → Workshop screen**, then **Full screen**.
Leave it there. It refreshes itself and asks the device to stay awake. Bookmark
`…/#/screen` so it comes straight back after a reboot.

---

## Hosting it

The app is plain HTML, CSS and JavaScript — no build step, no server — so GitHub
Pages serves it straight from this repository:

**Settings → Pages → Source: Deploy from a branch → Branch `main`, folder `/ (root)` → Save**

It is live at `https://shyamal22.github.io/rck-workshop/` a minute later, and every
push to `main` updates it automatically.

---

## Things worth knowing

- **No logins.** Everyone shares one key, so anyone holding that key can read and
  write. That's deliberate — no passwords for the crew to lose. Because this repo
  and the published site are public, `config.js` is left **blank on purpose**: the
  key is entered once per device in Settings instead, so it never appears on a
  public page. Don't put anything confidential in the app.
- **Bad signal is fine.** The app opens from its own cache and shows the last data
  it had. Damage reported with no signal is saved on the phone and sent as soon as
  there's coverage — the dot next to the title turns orange while anything is waiting.
- **Practice mode** in Settings lets someone try the whole app without touching the
  shared data. Nothing entered in practice mode is visible to anyone else.
- **Photos** are shrunk on the phone before upload, so they go through on site.
- **Reports** open the phone's print dialog — choose *Save as PDF* to email or file it.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application |
| `app.css` | Styling, including the wall screen and the printed documents |
| `config.js` | Your Supabase URL and key |
| `supabase-schema.sql` | Run in Supabase to create the database. Safe to re-run — do so after an update that adds a column |
| `sw.js` | Offline caching |

## The other RCK apps in this repository

Each is a separate app with its own database tables, and each installs to a phone on
its own. They share nothing but the look, so a phone that knows one knows the others.

| Folder | What it is |
|---|---|
| [`people/`](people/) | **RCK People** — staff information and compliance, as a tile per person and a tile per thing on file |
| [`hr/`](hr/) | **RCK HR** — an earlier, differently shaped take on staff records and licences. Shares no data with `people/` |
| [`dispatch/`](dispatch/) | **RCK Dispatch** — jobs, site paperwork and the daily job diary |
| [`costing/`](costing/) | **RCK Costing** — what a job was priced at, what it cost, and what it made (no database — it lives on the phone) |
