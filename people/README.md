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

## Who gets in, and what they see

Nobody has an account of their own. There are **two accounts for the whole
company**, and everyone joins by opening a link on their phone.

| | Director | Supervisor |
|---|---|---|
| Everyone's record, tiles, documents, compliance | Yes | Yes |
| Wage, salary, bank account, charge rates | Yes | **No** |
| The signed contract and account paperwork | Yes | **No** — the pay is written inside them |
| Adding people, filling tiles, uploading, deleting | Yes | **No** |

**The director account** is for the director and the HR manager. It sees
everything and can change everything.

**The supervisor account** is for the supervisors. They see every person,
every tile, every date and every compliance percentage — everything they need
to know whether someone can be sent to a site — but no money, and they cannot
change anything.

A supervisor sees the contract tile, sees that it is complete, and sees the
start date, role and sector on it. Where the wage would be, it says
*Recorded — directors only*. The compliance percentage is identical for both
roles, so nobody is looking at a different number.

### Handing out the link

In the app, as a director: **⋮ → Settings → Set up someone's phone**. Enter
one of the two shared accounts, and it checks the password works before giving
you a link. Send that link to whoever needs it, they open it once, and their
phone is set up — no password for them to type, remember or lose.

Make it once per role and reuse it. The same supervisor link works for every
supervisor, this year and next.

**The link is the password.** Anyone it reaches, and anyone they forward it
to, gets that level of access. Send it person to person, not to a group chat
everyone can scroll back through. The details ride in the part of the URL
after the `#`, which browsers never send to a web server, so it will not turn
up in a server log — but that is the only thing it protects against.

**To cut somebody off** — a supervisor leaves, or a link goes astray — change
that account's password in Supabase (**Authentication → Users**) and hand out
a fresh link to everyone still in that role. There is no way to revoke one
phone on its own; that is the trade for nobody having their own password.

---

## How this is kept private

This holds contracts, pay, bank accounts and dates of birth, so:

- **Nothing opens without one of the two accounts.** The anonymous key in
  `config.js` reads nothing at all — a stranger who finds the page gets a
  sign-in screen.
- **Signing in is not enough.** The account must also be on the `staff_users`
  list in the database, which is only editable in SQL. Nobody can grant
  themselves access from inside the app.
- **A supervisor cannot see pay, and this is enforced in the database, not
  the app.** Hiding a field in the browser would prove nothing: the page is
  public and its key is readable, so anything the app can ask for, a
  determined person could ask for too. Instead the figures never leave the
  database — a supervisor's rows come back through a view that has already
  replaced them with `##hidden##`, and the storage rules refuse them the
  contract and account documents outright.
- **A supervisor cannot change anything**, for the same reason: the database
  refuses their writes. The app hiding the Save button is a courtesy, not the
  control.
- **Staff data is never written to the device.** There is no offline cache.
  It lives in memory while the screen is awake and is gone the moment it
  locks, signs out or reloads.
- **Uploaded documents sit in a private store.** There is no public URL. The
  app mints a link that works for a few minutes and then doesn't, fetches the
  file, shows it inside the app, and throws it away when you close it.
- **The screen clears itself** after 20 minutes with nothing happening, so a
  phone left on a seat isn't showing somebody's file. Carrying on afterwards
  is one tap — there is no password to retype. Change the timeout in
  `config.js`.
- **Pay is left out of a printed file** unless *Include pay* is ticked, so it
  can be handed to a supervisor as it is.
- **Every change is recorded** against the person, with who made it and when.

What this deliberately does **not** protect against: a phone that is unlocked
and in the wrong hands, or a link forwarded to somebody who shouldn't have it.
Both come with wanting no passwords, which is the right trade for a crew —
but worth knowing.

Because of all that it is safe for this repository and the published page to
be public.

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

### 2. The two accounts

Done once, for the whole company. Nobody else ever needs an account.

1. In Supabase, go to **Authentication → Users → Add user**, and make two,
   ticking **Auto Confirm User** on both. The addresses don't have to be real
   mailboxes — nothing is ever emailed to them.

   | Email | Password |
   |---|---|
   | `rck-director@rcknz.co.nz` | a long one — write it down somewhere safe |
   | `rck-supervisor@rcknz.co.nz` | a different long one |

2. Then open **SQL Editor** and run these two lines:

   ```sql
   select staff_grant('rck-director@rcknz.co.nz',   'Director',   'director');
   select staff_grant('rck-supervisor@rcknz.co.nz', 'Supervisor', 'supervisor');
   ```

   Each tells you straight back whether it worked.

Keep both passwords. You need the director one to sign in the first time, and
you need whichever one you're handing out to make a link.

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

Commit that and the site redeploys itself. Every phone is then connected
automatically, with nothing for anyone to type in.

Now open the app yourself, sign in with the director email and password, and
go to **⋮ → Settings → Set up someone's phone** to make the two links you hand
out. That sign-in screen is the only time anyone types a password, and only
you ever see it.

---

## Filling it in

Signed in as the director — a supervisor can see all of this but change none
of it.

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
- **Changing a shared password** signs out every phone using it. That is how
  you cut someone off, but it means everyone in that role needs a fresh link
  the same day.
- **Adding a third kind of access** — someone who should see less than a
  supervisor, say — means a new role in `staff_grant`, a rule for it in
  `supabase-schema.sql`, and nothing in `app.js` beyond what to show. The
  database is where access is decided.
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
