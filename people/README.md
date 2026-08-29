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

No logins, no accounts, no passwords — the same arrangement as
[RCK Workshop](../) and [RCK Dispatch](../dispatch/). Every phone shares one
key, and a phone is set up by tapping a link.

Each phone is in one of two modes, chosen when it is set up and changeable in
Settings:

| | Supervisor | Director / HR |
|---|---|---|
| Everyone's record, tiles, documents, compliance | Yes | Yes |
| Wage, salary, bank account, charge rates | **No** | Yes |
| The signed contract & account paperwork | **No** | Yes |
| Adding people, filling tiles, uploading | **No** | Yes |

**Supervisor** is the default: every person, every tile, every date and every
compliance percentage — everything needed to know whether someone can be sent
to a site — but no money, and nothing can be changed. Where a wage would be,
the tile says *On file — director mode only*. Both modes show the same
compliance percentage, so nobody is working off a different number.

**Director** is for you and the HR manager. Everything, and editing.

### Be clear about what that split is

It is a **speed bump, not secrecy** — exactly like the office code in RCK
Dispatch, which does the same job for job margins.

Switching to director mode asks for `directorPin` from `config.js`, if you set
one. But that file is public, and there are no logins, so **anyone holding the
setup link can read the pay straight out of the database** whatever this app
chooses to show them. What the split actually buys you is a simple screen for
the crew and no accidental edits from a site phone.

**The key is the real protection.** That is why `config.js` is left blank and
the key only ever travels in a setup link. Treat that link the way you would
treat a key to the office.

If pay must be genuinely secret from supervisors rather than merely out of
sight, this needs one real account for the director, with the pay behind it.
It is about thirty seconds of extra setup and the code for it is written; ask
and it goes back in.

### Handing out the link

On a phone that already has the app: **⋮ → Settings → Set up someone else's
phone → Copy the link** (or **Share**, which opens the phone's own share
sheet). Send it to them, they tap it once, put in their name and whether they
are a supervisor or a director, and they're done.

Same link for everybody, and it keeps working. Only send it to RCK people, and
person to person rather than into a group chat everyone can scroll back
through.

**To cut everyone off** — a link goes astray, someone leaves with a phone —
generate a new anon key in Supabase (**Settings → API → rotate**), then send a
fresh setup link round. There's no way to revoke one phone on its own; that's
the trade for nobody having a password.

---

## How this is kept private

- **The key never appears on the published page.** `config.js` is blank on
  purpose. A stranger who finds the URL gets a *Not connected yet* screen and
  nothing else.
- **The setup link keeps the key after the `#`**, which browsers never send to
  a web server, so it doesn't turn up in a server log.
- **Staff details are never written to the phone.** There is no offline cache.
  They live in memory while the screen is awake and are gone the moment it
  clears or you reload. (Compare the workshop app, which caches everything so
  it works with no signal — right for a truck, wrong for an HR file.)
- **Documents sit in a private bucket.** There is no public URL. The app mints
  a link that works for a few minutes and then doesn't, shows the file inside
  the app, and throws it away when you close it. That keeps contracts off
  search engines; it does not hide them from someone holding the key.
- **The screen clears itself** after 20 minutes idle, so a phone left face-up
  on a seat isn't showing somebody's file. Carrying on is one tap. Change the
  timeout in `config.js`.
- **Pay is left out of a printed file** unless *Include pay* is ticked.
- **Every change is recorded** against the person, with who made it and when —
  which is what the name on each phone is for.

What this does **not** protect against: anyone who has the setup link. There
are no logins, so the link is the whole of it. That is the trade for a crew
with nothing to remember, and it is the same trade the other two RCK apps
already make — but those don't hold bank account numbers, so it is worth
saying plainly here.

---

## Setting it up

Two jobs, about ten minutes, done once. There are no accounts to create.

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

### 2. The first phone, then everyone else

1. Open the app. It says **Not connected yet**. Paste in the Project URL and
   the anon key, and it connects.
2. Go to **⋮ → Settings**, put in your name, and set yourself to
   **Director / HR**.
3. Still in Settings, under **Set up someone else's phone**, copy the link and
   send it to everyone who needs the app.

That's it. If you want a code required before a phone can switch itself into
director mode, set `directorPin` in `config.js` — read the note above first
about what it does and doesn't do.

---

## Filling it in

On a phone in director mode — a supervisor can see all of this but change none
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

- **Someone who leaves** should be set to **Finished**, not deleted. They drop
  off the counts and out of the list, but the record and the documents stay.
  Deleting is permanent and takes their documents with it.
- **Uploads are capped at 40 MB.** Anything larger belongs in SharePoint.
- **Removing a competency or induction line** also removes the certificate
  attached to it, since nothing else would ever reach it again.
- **A new line has to be saved before a certificate can go on it** — there is
  nothing to attach it to until then. The tile says so.
- **Reminders** are the colours and the counts; the app does not send email.
- **Nothing here is offline.** Unlike the workshop app there is no offline
  cache, which is the trade for not leaving staff files on a phone.
- **The name on each phone** is what goes against every change, so it is worth
  everyone putting their own in rather than leaving it as someone else's.
- **This is separate from [`../hr/`](../hr/)**, an earlier and differently
  shaped HR app in this repository. They share no data and no database
  tables. Use one or the other, not both.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application, starting with the tile definitions |
| `app.css` | Styling, including the printed file |
| `config.js` | Left blank on purpose. The director code and the screen timeout |
| `supabase-schema.sql` | Run once in Supabase to create the database |
| `sw.js` | Caches the app shell only — never any data |
