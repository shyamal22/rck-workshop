# RCK HR

Staff records, licences and compliance for RCK. Who is on the books, what they
are licensed to do, what runs out when, and where every document lives.

**Green** = current · **Orange** = expiring soon · **Red** = expired or missing

The colour is never set by hand. It comes from the expiry dates: anything past
its date goes red, anything inside its warning window goes amber, and a person
turns red the moment a licence their job requires is missing or out of date.

---

## What it does

**The compliance picture, on one screen**
- Three counts: all current, due soon, action needed.
- Everything expired or missing, worst first, with the person's name against it.
- Everything expiring soon, soonest first.

**Every person's file**
- Their details, employment, length of service, emergency contact.
- Every licence, endorsement, ticket and certificate they hold, with numbers,
  issue dates and expiry dates.
- Anything their role requires that they *don't* hold, marked **Missing** in red.
- Their documents — contracts, addendums, pay letters, licence scans.
- Every contract change, and every disciplinary action.
- Pay, hidden behind a **Show pay** button so it isn't on screen by accident.
- A history of every change, with who made it and when.

**Contract changes and addendums**

An addendum is a PDF, which is no use for answering *when did this person last
get a rise*. So each one is recorded as a dated line — what changed, what it went
from and to, when it took effect, when it was signed — with the PDF attached to
it. Recording a pay rise updates their pay-review date by itself.

**Pay & addendums** then lists everyone by how long since their last rise, longest
wait first — amber past eighteen months, red past two years. Where somebody has no
rise on record it counts from their last review, or from their start date, and says
which. The second tab is every contract change across the company, newest first.

**Disciplinary**

Two dates on purpose: when the incident happened, and when action was actually
taken. Warnings carry an **in force until** date — choose a warning level and it
offers twelve months, the usual New Zealand practice — so the register shows
warnings still in force separately from spent ones. Informal chats are recorded
but never count as live warnings. The letter attaches to the record.

**Documents, three ways**
- **Upload them here** and they go into a private store, then **open on the
  device** — PDFs and photos render inside the app, with a download button. No
  trip to SharePoint, and nothing is left behind when you close it.
- **Or leave them in SharePoint** and paste the link. The file never moves; the
  app just knows where it is, and opens it there.
- Each person can also carry a link to their whole SharePoint folder, so their
  file is one tap from their record.

Most people use both: contracts, addendums and licence scans uploaded here so the
dates and the documents sit together, everything else left in SharePoint.

**Crews**

Staff belong to a crew, and the list is taken straight from the folders under
**6. RCK STAFF** in SharePoint: **Yellow Crew, Green Crew, Office, Transport,
Yard / Workshop, STMS & Traffic Management, Sub Contractors, Watercare & Civils,
Civil, Recruitment Agencies**. The compliance screen breaks the numbers down by
crew, and tapping one filters the staff list to it. To rename a crew or add one,
edit `CREWS` near the top of `app.js` — anything already recorded under an old
name keeps working and stays selectable.

Contract types follow the **Contract Type** column of the staff spreadsheet, and
keep its wording: Employee, Employee — casual, Subcontractor, Recruitment agency,
and the labour-hire firms **Standup, Cellwatch** and **Pacific**. Pay can be
hourly, salary or daily, matching the **Unit** column.

**Reports** — one button each, all printable as PDF:
- **Compliance register** — everyone, every requirement, every date, problems
  marked. The one to hand an auditor.
- **Expiring and expired** — 30, 60, 90 days or six months ahead.
- **Pay review** — everyone by how long since their last rise. The one for a
  pay round.
- **Every contract change** — all addendums with what moved and when.
- **Disciplinary register** — in force first, then spent, with outcomes and who
  issued them.
- **Licence and ticket matrix** — the whole grid on one page.
- **One person's file** — their record in full, including contract changes and
  disciplinary history. Pay figures are withheld unless **Include pay** is
  ticked, so it can be handed to a manager as it is.
- **CSV exports** of staff, licences, documents, pay review, contract changes
  and disciplinary, for Excel.

**Getting started quickly** — ⋮ → *Import from spreadsheet* takes a CSV straight
out of Excel and creates the staff list, then a second CSV for their licences and
expiry dates. It checks every row and tells you what it can't match before it
writes anything.

---

## How this is kept private

This is the opposite of the workshop app, on purpose. That one has no logins and
its README says not to put anything confidential in it. This one holds contracts,
pay and personal details, so:

- **Nothing opens without a sign-in.** Every person has their own email and
  password. The anonymous key can read nothing at all.
- **Signing in is not enough.** The account must also be on the `hr_users` list
  in the database — a list you add to by hand, in SQL. An account that isn't on
  it gets turned away with everything still hidden.
- **Staff data is never written to the device.** There is no offline cache. It
  lives in memory while the screen is unlocked and is gone the moment you lock,
  sign out or reload. Compare the workshop app, which caches everything so it
  works with no signal — right for a truck, wrong for an HR file.
- **Uploaded documents sit in a private store.** There is no public URL. The app
  mints a signed link that works for five minutes and then doesn't.
- **The screen locks itself** after 20 minutes with nothing happening, so an open
  laptop doesn't leave staff files on display. Change it in `config.js`.
- **Every change is recorded** against the person, with who made it and when.

Because of all that, it is safe for this repository and the published page to be
public. There is nothing confidential in the code, and the key in `config.js`
opens nothing on its own — a stranger with the link gets a sign-in screen.

---

## Setting it up

Three jobs, about half an hour, done once.

### 1. The database

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. **New project** — any name, pick the Sydney region, set a database password
   (save it somewhere; you won't need it day to day).
3. Wait about two minutes for the project to build.
4. Open **SQL Editor** → **New query**.
5. Open `supabase-schema.sql` from this repo, copy the whole file, paste it in,
   press **Run**. It should say *Success*. It is safe to run again later.
6. Go to **Settings → API** and copy two things:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting `eyJ…`
     (The *anon public* one. Never the `service_role` key.)

Keep the free tier — this app will never come close to its limits.

### 2. The three or four accounts

For each person who should have access:

1. In Supabase, go to **Authentication → Users → Add user**.
2. Enter their email and a starting password, and tick **Auto Confirm User**.
   (Or use **Invite** and let them set their own password by email.)
3. Then open **SQL Editor** and run one line to put them on the HR list:

   ```sql
   select hr_grant('jane@rcknz.co.nz', 'Jane Smith', 'hr');
   ```

   Use `'director'` instead of `'hr'` for you and the director. It tells you
   straight back whether it worked.

Creating an account is deliberately two steps. Nobody can give themselves access
from inside the app — the guest list is only editable in the database.

To take someone off later:

```sql
update hr_users set active = false where email = 'someone@rcknz.co.nz';
```

### 3. The app

Put the two values from step 1 into `config.js`:

```js
window.RCKHR_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
  idleLockMinutes: 20,
  defaultWarnDays: 60
};
```

Commit that and the site redeploys itself. Every device is then connected
automatically — there is nothing for anyone to type in but their own password.

If you'd rather not commit the key, leave `config.js` blank and each device asks
for the URL and key once, on first open.

---

## Hosting it

Plain HTML, CSS and JavaScript — no build step, no server — so GitHub Pages
serves it straight from this repository:

**Settings → Pages → Source: Deploy from a branch → Branch `main`, folder
`/ (root)` → Save**

It is live a minute later, and every push to `main` updates it.

On a phone or the office PC: open the URL, then **Add to Home Screen** (Share
menu on iPhone, ⋮ on Android, the install icon in the address bar on desktop).
It installs like a normal app.

---

## Filling it in

### The requirements

⋮ → **Requirements** is the list of what RCK requires people to hold. It is
seeded from what the staff spreadsheet already tracks, in the same three groups:

- **Paperwork on file, no expiry** — Employment Agreement, Application of
  Employment, 10 Golden Rules, Company Vehicle Policy, Induction Checklist,
  Employee Handbook, IRD & KiwiSaver, Right to Work.
- **Licences and tickets that expire** — Driver Licence (with the classes held),
  WTR endorsement, NZTA Driver Check, Site Safe Card (with the card number),
  ConstructSafe, STMS (with the category), Traffic Controller, First Aid,
  Medical Certificate, Drug & Alcohol, plus forklift, dangerous goods, confined
  space and heights if you want them.
- **Site inductions and the competency matrix, held or not** — Fulton Hogan,
  RNZDF and KiwiRail inductions; Power Tools, Spotter, Excavator, Bobcat / Skid
  Steer, Roller / Compactor, Tractor, Loader, Concrete Saw, Asphalt Paving,
  Miller Machine, Transporter, Truck.

For each one you set:

- **Whether it expires**, and **how many days before** it should turn amber.
  Site Safe warns at 90 days because renewals take a while; a drug test warns at
  30. Competencies and signed paperwork never expire, so they read simply as
  on file or missing.
- **Who it is required of** — driver, operator, labourer, STMS/traffic, yard,
  office, management. This is the important one: anything ticked for a role
  shows as **Missing** in red on that person's file until it's recorded.
  Anything not ticked is optional, and only appears if they happen to hold it.

Change them, delete them, add your own. A requirement people already hold can't
be deleted, but it can be hidden, which keeps the history. Renaming one in this
file has no effect once the database is set up — rename it in the app instead.

### The staff

Either add people one at a time, or ⋮ → **Import from spreadsheet**:

**Staff** — `employee_no, first_name, last_name, preferred_name, job_type,
position, crew, employment_type, start_date, end_date, status, phone, email,
address, date_of_birth, pay_type, pay_rate, sharepoint_url, notes`. Only the two
name columns are required; leave any other column out entirely. `job_type` is
one of driver / operator / labourer / traffic / yard / office / management,
`crew` one of yellow / green / office / transport / yard / stms / subcontractor /
watercare / civil / agency, and dates go in as `YYYY-MM-DD`. Pay rates may be
written `$34.50` or `95,000.00` — both are read correctly.

**Licences and tickets** — `employee_no` (or `name`), `type`, `detail`,
`reference`, `issued_on`, `expires_on`. `type` must match a requirement's name
exactly, e.g. `Driver Licence`.

It checks every row against what's already on file and shows you what it can't
match before importing anything.

---

## About connecting SharePoint

Two different things get called "connecting SharePoint", and only one of them is
about the app.

**Letting Claude read the folders while building.** There is a Microsoft 365
connector on claude.ai that can search SharePoint and read files. Connecting it
lets whoever is building this look at the real folder layout and file naming, so
the crews, requirements and document kinds match what is actually there instead
of being guessed at. It changes nothing about the app itself, and can be
disconnected afterwards.

**Making the app read SharePoint live.** That is a separate job: an app
registration in the RCK Microsoft tenant, so the app can sign people in with
their work account and list folders through Microsoft Graph. It needs someone
with Microsoft 365 admin rights, it is free, and it takes about ten minutes.
Worth doing only if you want the app to pull the file list out of SharePoint by
itself rather than being told where things are.

Neither is required. Uploading documents here and pasting SharePoint links covers
the job as it stands.

## Things worth knowing

- **It needs a connection.** Unlike the workshop app, there is no offline mode —
  that's the trade for not leaving staff data on the device.
- **Someone who leaves** should be set to **Finished**, not deleted. They drop
  off the compliance counts but the record and the documents stay. Deleting is
  permanent and takes their documents with it.
- **Reminders** are the dashboard and the expiry reports — the app doesn't send
  email. Printing the *Expiring and expired* report on the first of the month
  covers it.
- **Bank accounts and IRD numbers are deliberately not stored.** They belong in
  payroll. This holds the rate and when it was last reviewed, which is what HR
  usually needs to answer a question.
- **Uploads** are capped at 40 MB. Anything larger should live in SharePoint with
  a link here.
- **Removing a contract change or disciplinary record** deletes the line, not the
  document — the PDF stays under Documents. Only remove one if it was entered in
  error; these are employment records.
- **Already run the schema?** Re-run `supabase-schema.sql` after pulling this
  version. It only adds what is missing, so nothing you have entered is touched.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application |
| `app.css` | Styling, including the printed reports |
| `config.js` | Your Supabase URL and key, and the lock timeout |
| `supabase-schema.sql` | Run once in Supabase to create the database |
| `sw.js` | Caches the app shell only — never any data |
