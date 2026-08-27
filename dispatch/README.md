# RCK Dispatch

Jobs, site paperwork and the daily job diary. The office plans a job and hangs the
paperwork on it. The supervisor opens it on site, reads the paperwork, and keeps the
diary as the day happens. When the last day is done the supervisor closes the job and
the whole thing prints as one report.

A job is only ever in one of three states:

**Planned** = booked in, not started · **On site** = the crew is working it now ·
**Completed** = finished and signed off

Nobody sets those by hand more than once. Creating a job makes it *planned*; the first
diary entry makes it *on site*; the supervisor taps **Project completed** and it's done.

---

## What it does

**For the office (and directors, who can do everything)**
- Create a job: name, client, site, **which crew is on it**, the dates, and who's running it.
- Load anything onto it — PMP, scope, job cards, TMP, drawings, permits, spreadsheets,
  photos. Several files at once is fine.
- Decide who each document is for: **everyone**, **site crew**, or **office only**.
  Office-only documents are never listed on a site phone, so pricing can live on the
  job without being on the job.
- Watch the day from the **office screen** on the wall: who's on site, what each crew
  has logged and when, and what's due to start.
- Print the record: one job start to finish, one day of it, a document register, or
  every job over a period.

**For the supervisor on site**
- Open the job, read and **download** every document the office put there.
- Keep the day's diary as it happens. Tap **On site**, **Prestart**, **Milling
  started**, **Paving started**, **Issue** or **Off site** and it fills in the time;
  add the comment and the photos.
- Anything not on that list — *Traffic management set up*, *Delivery*, *Weather*,
  *Visitor* — is in the full list, and you can name a new type of entry yourself. It
  is a real type from that moment, on everyone's phone.
- Every entry takes photos. They're shrunk on the phone so they go through on site.
- When the job's finished: **Project completed**, with a closing note.

**For the director**
- Everything above, on the same phone — a director can plan a job in the morning and keep
  its diary on site in the afternoon.
- **The app opens on a landing page with two tools: Jobs, and Profit & loss.** Everyone gets
  Jobs. P&L appears on Director devices only, and nothing hints at it otherwise.
- **Costing a job**, on the job's own **Costing** screen: a line for each thing the job is
  made of — asphalt, emulsion, concrete, materials, crew, trucking, plant and machinery,
  transport, subcontractors, or anything you name yourself. Each line is a quantity, a unit
  and a rate. **Maintenance is never typed in: it is always 10% of everything above it**, so
  it moves when the lines move.
- The office prices the job and enters the expected invoice. A **director** fills in the
  actuals once it is done — quantity and rate again, line by line — plus the final invoice
  and a note on why it landed where it did. The screen shows expected against actual, the
  difference on every line, and how far ahead or behind the price the job came in.
- **The job P&L prints** as one document: the money, every line with its variance, your note,
  and every entry the supervisors wrote — because the reason a job went over is usually in
  the diary rather than the spreadsheet.
- **⋮ → Profit & loss**: every job at once over a period — this month, last month, this
  quarter, the financial year (1 April to 31 March), or dates you pick. Days on site, diary
  entries, issues, contract value, cost and margin, sorted by whichever of those you care
  about. Nothing on it is typed twice: it is added up from what the crews and the office
  already entered on the jobs.
- **The director's report** prints that period — the totals, every job with its margin, and
  **every issue and delay the supervisors logged**, gathered across all the jobs into one table.
- Value and cost live on the job itself, entered by the office or a director. They are never
  shown on a site phone, and never exported in a supervisor's CSV. A margin is only worked out
  when both numbers are there — half the figures is worse than none.
- Archiving a job is a director's call. Nothing in the app is ever deleted.

**The report**
The full job report is the whole record in one document: the job's details, a summary,
every issue and delay, the documents on file, then each day of the diary in the order
it happened with its photos underneath and a sign-off line at the end. It opens the
phone's print dialog — choose *Save as PDF* to email it or file it.

**Night works**
The app knows a shift isn't a calendar day. A crew that comes on at 19:45 and goes off
at 05:15 reads in that order under the day it started, and the day totals say
*9h 30m on site* rather than counting backwards. Logging something in the small hours
files it against last night's shift, and says so, so you can change it if it's wrong.

**Bad signal is fine.** The app opens from its own cache and shows the last data it
had. Diary entries and photos written with no coverage are held on the phone and sent
as soon as there's signal — the dot next to the title turns orange while anything is
waiting, and a line at the top of the screen says how many changes are queued.

**Nothing goes quietly.** Work that hasn't reached the database yet is marked **Not sent
yet**, and is never overwritten by what the server has. Anything the database *refuses*
is said out loud, in words, with what to do about it — a refusal never fixes itself by
waiting, and the commonest cause (a database set up from an older copy of
`supabase-schema.sql` and missing a column the app now sends) is named on the spot, with
the fix: re-run that file, press **Try again**. **Settings → Download a backup** writes
everything on the device to one file, and clearing the device takes that backup first
whether you ask for it or not.

---

## Setting it up

Two jobs, about 15 minutes total, done once.

### 1. The database

1. Go to [supabase.com](https://supabase.com) and create a free account — or reuse the
   project RCK Workshop already uses, since none of the table names clash.
2. **New project** — any name, pick the Sydney region, set a database password.
3. Wait about two minutes for the project to build.
4. Open **SQL Editor** → **New query**.
5. Open `supabase-schema.sql` from this folder, copy the whole file, paste it in, press
   **Run**. It should say *Success*. Re-run it any time — it is safe over a live database,
   and that is how new columns reach an installation that already exists.
6. Go to **Settings → API** and copy two things:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting `eyJ…`
     (Use the *anon public* key. Never the `service_role` one.)

### 2. The first device

Open the app, go to **Settings**, paste those two values into **Shared data** and press
**Save & connect**. Enter your name and choose **Office**.

`config.js` is left blank on purpose: this repository and the published site are public,
so the key is entered once per device instead of sitting on a public page.

### 3. Everyone else's phone

On the device that's already connected: **Settings → Set up someone else's phone →
Share link**, and send that link to the supervisor. One tap connects their phone — they
never type the key, and because the details ride in the URL's `#` fragment they are
never sent to the web server. Treat the link like a key: only send it to RCK people.

By hand instead: open the app URL, **Add to Home Screen** (Share menu on iPhone, ⋮ on
Android), then **Settings** → name, role, and the two values.

**The three roles**

| | Supervisor | Office | Director |
|---|---|---|---|
| See the jobs and their documents | ✓ | ✓ | ✓ |
| Download documents | ✓ | ✓ | ✓ |
| Keep the job diary, add photos | ✓ | ✓ | ✓ |
| Start a job, mark it completed | ✓ | ✓ | ✓ |
| Print reports | ✓ | ✓ | ✓ |
| Add documents | ✓ | ✓ | ✓ |
| See **office-only** documents | | ✓ | ✓ |
| Create and edit jobs | | ✓ | ✓ |
| Reopen a completed job | | ✓ | ✓ |
| Enter a job's value and cost | | ✓ | ✓ |
| Price a job — cost lines and expected invoice | | ✓ | ✓ |
| **See actuals, margin and the P&L** | | | ✓ |
| **Enter the final invoice and actual costs** | | | ✓ |
| **Archive a job** | | | ✓ |

A diary entry written from a director's phone reads *· Director* in the record. Supervisors
stay unlabelled, since that is the default on site and the tag would be noise on every line.

Set `officePin` in `config.js` if you want a code required before a device can switch
itself to Office or Director. It stops accidents; it is not a password, since the code
sits in a file anyone can read.

### 4. The office screen

On the office PC or a wall tablet: **⋮ → Office screen**, then **Full screen**. Leave it
there. It refreshes every 20 seconds and asks the device to stay awake. Bookmark
`…/dispatch/#/screen` so it comes straight back after a reboot.

---

## Hosting it

Plain HTML, CSS and JavaScript — no build step, no server. It sits alongside RCK
Workshop in the same repository and GitHub Pages serves it from
`https://shyamal22.github.io/rck-workshop/dispatch/`, updated on every push to `main`.

---

## Things worth knowing

- **No logins.** Everyone shares one key, so anyone holding that key can read and
  write. That's deliberate — no passwords for the crew to lose. The office/supervisor
  split keeps the app simple to use; it is **not** a security boundary. Don't put
  anything you'd mind an RCK phone seeing into the app, and don't publish the link.
- **Practice mode** in Settings lets someone try the whole app without touching the
  shared data. Nothing entered in practice mode is visible to anyone else.
- **Nothing is deleted by accident.** Archiving a job hides it from the board and keeps every
  record, and only a director can do it; a completed job can be reopened by the office. There
  is no permanent delete anywhere in the app, on purpose.
- **The money is not a secret from the database.** Value and cost are hidden from site phones
  by the app, not by the database — same as the office-only documents. See the note on logins
  below before deciding what to put in those boxes.
- **The board is filtered by crew.** Yellow, Subbie, Civil and Green, each with its own
  colour so a chip is recognised before it is read, plus **Unassigned** whenever a job has
  no crew on it yet. Type of work is still on every job, and in the reports and the
  spreadsheet — it just isn't a filter, because nobody looks for a job that way. Adding a
  fifth crew is one line in `CREWS` at the top of `app.js`.
- **Types of work aren't a fixed list.** Pick **+ Add a new type…** when creating a job
  and name it — "Chip seal", say — and from then on it's a type like any other, with
  its own filter on the board. Naming one that already exists in a different spelling
  reuses the existing one rather than making a near-duplicate. Diary entry types work
  the same way.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application |
| `app.css` | Styling, including the wall screen and the printed documents |
| `config.js` | Your Supabase URL and key |
| `supabase-schema.sql` | Run once in Supabase to create the database |
| `sw.js` | Offline caching |
