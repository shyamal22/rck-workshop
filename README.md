# RCK Workshop

Shared gear tracking for RCK plant and trucks. Crews report damage from their phones,
the workshop works the job and records what was done, and everyone — including the
screen on the workshop wall — sees the same live picture.

**Green** = working · **Orange** = damaged but still usable · **Red** = out of operation

The colour is never set by hand. It comes straight from the open work orders:
any red work order makes the gear red, any orange one makes it orange, and when
the last job is signed off the gear goes green again on its own.

---

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
  - **RCK workshop crew** — add comments as the job goes along.
  - **External company** — record the company, their job/invoice number and cost,
    and upload the report or invoice they send back.
- Upload photos and paperwork at any point; they attach to the work order and appear
  on the printed history.
- Sign the job off with **what was done**. The gear turns green automatically.

**On the workshop wall**
- The **Workshop screen** (`#/screen`) is a full-screen board: counts of working /
  usable / out-of-operation gear, every active work order with its status and due
  date, and the gear needing attention. It refreshes every 15 seconds and keeps the
  screen awake by itself.

**Reports** — one button each:
- **Fleet status** — every machine, colour, location, due date, plus all open jobs.
- **Repair history** — whole fleet or one machine, any date range: every repair,
  what was done, who did it, days out of action, cost, and the paperwork on file.
- **CSV export** of all work orders for Excel.

Every change is written to the work order's history, with who did it and when, so
the record of a machine's repairs is complete without anyone having to keep it.

---

## Setting it up

Two jobs, about 15 minutes total, done once.

### 1. The database (once, by whoever sets this up)

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. **New project** — any name, pick the Sydney region, set a database password
   (you won't need it again, but save it somewhere).
3. Wait about two minutes for the project to build.
4. Open **SQL Editor** in the left sidebar → **New query**.
5. Open `supabase-schema.sql` from this repo, copy the whole file, paste it in,
   press **Run**. It should say *Success*.
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
| `supabase-schema.sql` | Run once in Supabase to create the database |
| `sw.js` | Offline caching |

## The other RCK apps in this repository

Each is a separate app with its own database tables, and each installs to a phone on
its own. They share nothing but the look, so a phone that knows one knows the others.

| Folder | What it is |
|---|---|
| [`hr/`](hr/) | **RCK HR** — staff records, licences and compliance |
| [`dispatch/`](dispatch/) | **RCK Dispatch** — jobs, site paperwork and the daily job diary |
