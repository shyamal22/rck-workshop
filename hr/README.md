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
- Pay, hidden behind a **Show pay** button so it isn't on screen by accident.
- A history of every change, with who made it and when.

**Documents, both ways**
- **Upload them here** and they go into a private store. Nobody can reach them
  without signing in, and even then the link that opens a document stops working
  after five minutes.
- **Or leave them in SharePoint** and paste the link. The file never moves; the
  app just knows where it is.
- Each person can also carry a link to their whole SharePoint folder, so their
  file is one tap from their record.

Most people use both: contracts and licence scans uploaded here so expiry dates
and documents sit together, everything else left in SharePoint.

**The licence matrix** — everyone down the side, every requirement across the
top, every expiry date in the grid. The one to print for a toolbox meeting.

**Reports** — one button each, all printable as PDF:
- **Compliance register** — everyone, every requirement, every date, problems
  marked. The one to hand an auditor.
- **Expiring and expired** — 30, 60, 90 days or six months ahead.
- **Licence and ticket matrix** — the whole grid on one page.
- **One person's file** — their record in full, with or without pay.
- **CSV exports** of staff, licences and documents, for Excel.

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

⋮ → **Requirements** is the list of what RCK requires people to hold. It starts
with the usual set for a New Zealand roading crew:

Driver Licence · WTR endorsement (wheels, tracks, rollers) · Forklift (F) ·
Dangerous Goods (D) · Passenger (P) · Driver Medical Certificate · Site Safe
Construction Card · First Aid · TTM Traffic Controller · TTM STMS Level 1 ·
Confined Space · Working at Heights · Drug & Alcohol Test · Employment Agreement
Signed · Right to Work / Visa · Site Induction · IRD & KiwiSaver Forms

For each one you set:

- **Whether it expires**, and **how many days before** it should turn amber.
  Site Safe warns at 90 days because renewals take a while; a drug test warns at
  30.
- **Who it is required of** — driver, operator, crew, office, management. This is
  the important one: anything ticked for a role shows as **Missing** in red on
  that person's file until it's recorded. Anything not ticked is optional, and
  only appears if they happen to hold it.

Change them, delete them, add your own. A requirement people already hold can't
be deleted, but it can be hidden, which keeps the history.

### The staff

Either add people one at a time, or ⋮ → **Import from spreadsheet**:

**Staff** — `employee_no, first_name, last_name, job_type, position, crew,
employment_type, start_date, status, phone, email, sharepoint_url`.
Only the two name columns are required. `job_type` must be one of
driver / operator / crew / office / management, and dates go in as `YYYY-MM-DD`.

**Licences and tickets** — `employee_no` (or `name`), `type`, `detail`,
`reference`, `issued_on`, `expires_on`. `type` must match a requirement's name
exactly, e.g. `Driver Licence`.

It checks every row against what's already on file and shows you what it can't
match before importing anything.

---

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

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application |
| `app.css` | Styling, including the printed reports |
| `config.js` | Your Supabase URL and key, and the lock timeout |
| `supabase-schema.sql` | Run once in Supabase to create the database |
| `sw.js` | Caches the app shell only — never any data |
