# RCK People

Staff information and compliance for RCK. Who is on the books, what is on
file for each of them, what is missing, and what runs out when.

**Green** = complete and current · **Orange** = expiring soon · **Red** = something missing or expired

No colour and no percentage is ever set by hand. Both come from what has
actually been filled in and uploaded, and from the dates on it.

---

## How it is laid out

Three screens deep, and no deeper.

**The landing page** — four options. The first is *Staff information*. The
other three are marked-out slots, left empty on purpose until you say what
belongs in them.

**Staff information** — everyone as a tile, showing their head shot, name,
role, crew and a ring with their compliance percentage. Filter by
**RCK employee**, **labour hire** or **subcontractor**, then by crew, or
search. Tapping one of the three counts on the landing page filters the
list to just those people.

**One person** — their name, date of birth and age, how long they have been
with RCK, role and crew across the top, then a tile for each thing that has
to be on file.

**One tile, open** — the manual details typed in, the documents uploaded
against it, and the switch that says it does not apply.

---

## The tiles

Everyone gets these ten:

| Tile | Typed in | Uploaded |
|---|---|---|
| **RCK contract** | Start date, role, sector of the business, hourly / salary / daily, the rate, ordinary hours, date signed | The signed contract |
| **Drug test result** | Date tested, kind of test, result, who tested, when the next is due | The result certificate |
| **Driver licence** | Number, full / restricted / learner, classes 1–6, endorsements (W T R F D P V O I), card version, issued, expires, conditions | Front **and** back |
| **Head shot photo** | — | The photo, which then appears on their tile |
| **Machinery competencies** | One line per competency: what it is, which machine it applies to, when assessed, when it expires, who assessed it | A certificate per line |
| **Site Safe & first aid** | Site Safe card number and expiry, first aid provider and expiry | Both cards |
| **10 Golden Rules** | Date accepted, version signed | The signed acceptance |
| **Vehicle agreement** | Date signed, vehicle assigned, registration | The signed agreement |
| **Emergency contact** | Name, relationship, phone, address, a second contact, anything medical | — |
| **Inductions** | One line per induction: which one, the client or site, completed, expires, reference | A certificate per line |

Labour hire and subcontractors get all ten — with *RCK contract* reading as
*Engagement details*, since they are not on RCK's books — **plus two more**:

| Tile | Typed in | Uploaded |
|---|---|---|
| **Subcontractor agreement** | Signed, runs to, what it covers, public liability cover and its expiry, H&S prequalification | The agreement, the certificate of insurance |
| **Account information** | Trading name, NZBN, GST number, account contact, phone, email, bank account, payment terms, charge rates, postal address | GST registration or supplier form |

Those last two belong to the **company**, not to each of its workers. Twelve
people from Standup are all checked against Standup's one agreement, entered
once. Link a person to their company on their own record, under *Where they
sit*, and both tiles appear on their page reading through to the firm.

Somebody marked labour hire or subcontractor with **no company against their
name** counts those two tiles as missing rather than skipping them — showing
them as fully compliant because we don't know whose agreement to check would
be the wrong answer.

---

## "Does not apply"

Every tile has a switch at the top. Turn it on and that tile **drops out of
that person's percentage entirely** — not counted for them, not counted
against them. An office administrator who never drives isn't marked down for
having no vehicle agreement.

There is a box for *why*, and the reason prints on their file, so a decision
made once is still explained a year later.

**How the percentage is worked out:** the tiles that are green or amber, over
the tiles that apply to them. A tile that is amber is still on file, so it
counts as done — the colour is what says it needs attention, not the number.
A tile that is red, whether because something is missing or because a date has
passed, does not count as done.

So somebody with ten tiles, one of which does not apply, is measured out of
nine. Get all nine on file and they read 100%, even with one of them going
amber next month.

---

## Adding the ninth tile, or the twelfth

Every tile on every screen, every field inside it, the reports and the
percentage all come from one list — `SECTIONS`, near the top of `app.js`.
Add an entry there and the tile appears on everybody's page, in the printed
file and in the percentage, with nothing else to change. Each entry says:

- `key` — what it is called in the database. Never change one that is in use.
- `label`, and `labelFor` where labour hire needs different words.
- `only` — which worker types get it. Leave it out and everybody does.
- `owner: 'company'` — for the two that belong to the firm.
- `fields` — what is typed in. `want: true` marks a field as part of what
  "filled in" means; anything else is welcome but not counted.
- `files` — the upload boxes, likewise.
- `rows` — for a tile that holds a list, like competencies.
- `expiries` — which fields are dates that run out, and how many days ahead
  to turn amber. Site Safe warns at 90 because renewals take a while; a drug
  test warns at 30.

The other lists worth editing sit just above it: crews, sectors of the
business, machinery, licence classes.

---

## How this is kept private

This holds contracts, pay, bank accounts and dates of birth, so:

- **Nothing opens without a sign-in.** Every person has their own email and
  password. The anonymous key can read nothing at all.
- **Signing in is not enough.** The account must also be on the `staff_users`
  list in the database — a list you add to by hand, in SQL. Nobody can grant
  themselves access from inside the app.
- **A `viewer` account genuinely cannot change anything.** The app hides the
  buttons, but hiding a button is not a permission — the database refuses
  their writes as well.
- **Staff data is never written to the device.** There is no offline cache.
  It lives in memory while the screen is unlocked and is gone the moment you
  lock, sign out or reload.
- **Uploaded documents sit in a private store.** There is no public URL. The
  app mints a link that works for a few minutes and then doesn't, fetches the
  file, shows it inside the app, and throws it away when you close it.
- **The screen locks itself** after 20 minutes with nothing happening.
  Change it in `config.js`.
- **Pay is left out of a printed file** unless *Include pay* is ticked, so it
  can be handed to a manager as it is.
- **Every change is recorded** against the person, with who made it and when.

Because of that it is safe for this repository and the published page to be
public. The key in `config.js` opens nothing on its own — a stranger with the
link gets a sign-in screen.

---

## Setting it up

Three jobs, about half an hour, done once.

### 1. The database

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. **New project** — any name, pick the Sydney region, set a database password
   (save it somewhere; you won't need it day to day).
3. Wait about two minutes for the project to build.
4. Open **SQL Editor** → **New query**.
5. Open `supabase-schema.sql` from this folder, copy the whole file, paste it
   in, press **Run**. It should say *Success*. It is safe to run again later —
   it only adds what is missing.
6. Go to **Settings → API** and copy two things:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting `eyJ…`
     (The *anon public* one. Never the `service_role` key.)

The free tier is far more than this will ever need.

### 2. The accounts

For each person who should have access:

1. In Supabase, go to **Authentication → Users → Add user**.
2. Enter their email and a starting password, tick **Auto Confirm User**.
   (Or use **Invite** and let them set their own password by email.)
3. Then open **SQL Editor** and run one line:

   ```sql
   select staff_grant('jane@rcknz.co.nz', 'Jane Smith', 'hr');
   ```

   Use `'director'` for you and the director, `'viewer'` for read-only. It
   tells you straight back whether it worked.

To take someone off later:

```sql
update staff_users set active = false where email = 'jane@rcknz.co.nz';
```

### 3. The app

Put the two values from step 1 into `config.js`:

```js
window.RCKP_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
  idleLockMinutes: 20,
  defaultWarnDays: 60
};
```

Commit that and the site redeploys itself. Every device is then connected
automatically — there is nothing for anyone to type in but their own password.

If you'd rather not commit the key, leave `config.js` blank and each device
asks for the URL and key once, on first open.

---

## Filling it in

1. **Companies first**, if you use labour hire or subcontractors — ⋮ →
   *Labour hire & subcontractors* → **+**. Then open each one and fill in its
   agreement and account tiles once.
2. **Then the people** — the **+** on the staff screen. Name, whether they are
   RCK / labour hire / subcontractor, which company they come from, role,
   crew, date of birth, start date.
3. **Then work down their tiles.** Everything is optional in the sense that
   nothing stops you saving a half-filled tile — it just stays red until it
   is done, which is the point.

Uploading a document saves the tile at the same time, so nothing typed is
lost to an upload. It says so above the upload boxes.

---

## Hosting it

Plain HTML, CSS and JavaScript — no build step, no server — so GitHub Pages
serves it straight from this repository:

**Settings → Pages → Source: Deploy from a branch → Branch `main`, folder
`/ (root)` → Save**

It is live at `https://shyamal22.github.io/rck-workshop/people/` a minute
later, and every push to `main` updates it.

On a phone or the office PC: open the URL, then **Add to Home Screen** (Share
menu on iPhone, ⋮ on Android, the install icon in the address bar on desktop).
It installs like a normal app.

---

## Things worth knowing

- **It needs a connection.** Unlike the workshop app there is no offline mode.
  That is the trade for not leaving staff data on the device.
- **Someone who leaves** should be set to **Finished**, not deleted. They drop
  off the counts and out of the list, but the record and the documents stay.
  Deleting is permanent and takes their documents with it.
- **Uploads are capped at 40 MB.** Anything larger belongs in SharePoint.
- **Removing a competency or induction line** also removes the certificate
  attached to it, since nothing else would ever reach it again.
- **A new line has to be saved before a certificate can go on it** — there is
  nothing to attach it to until then. The tile says so.
- **Reminders** are the colours and the counts; the app does not send email.
- **This is separate from [`../hr/`](../hr/)**, an earlier and differently
  shaped HR app in this repository. They share no data and no database
  tables. Use one or the other, not both.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application, starting with the tile definitions |
| `app.css` | Styling, including the printed file |
| `config.js` | Your Supabase URL and key, and the lock timeout |
| `supabase-schema.sql` | Run once in Supabase to create the database |
| `sw.js` | Caches the app shell only — never any data |
