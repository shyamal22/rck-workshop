# RCK QA

Asphalt quality assurance, captured on the phone while the crew are still on site.

A QA loads the job before leaving the yard — site, client, date, what kind of work
it is. On site they set the weather and then work the job **patch by patch**:
milling, the depth check, spraying, chip seal, paving. Every step takes as many
photos as it takes. The depths get punched in as they're written on the ground,
and the app says on the spot whether they're inside the design depth — while
there's still a crew standing on the patch who can do something about it.

At the end it prints the **QA record**, the **depth sheet** and the **photo
record**. That's the workbook and the string sheet done.

**It does not draw the as-built.** That's still a separate job.

---

## What a day looks like

**Before you leave**

- **New QA job** — site name, client, address, the client's job number, the date.
- Tick the **type of work**: milling, paving, spraying, chip sealing, or any
  combination. Most jobs are two or three. A car park can be all four.
- That's it. Everything below can be done with no signal at all.

**When you get there**

- **Weather on site** — conditions, air temperature, whether the surface is dry,
  damp or wet, and the wind. It's the first thing asked when a seal fails, and
  nobody remembers in March what November was doing.
- If you record spraying or chip sealing in rain or onto a wet surface, the app
  says so once, on the job screen. It doesn't stop you — it just makes sure it
  isn't a surprise later.
- **Start on site.**

**Patch by patch**

Add a patch — *Patch 1*, or name it *loading dock* or *bay 3*, whatever it's
called on the day. It arrives with the steps that match what the job is ticked
for, in the order they happen on the ground:

> Before → Milling → Depth check → Spraying → Chip seal → Pre-levelling →
> Paving temperature → Paving → After

Untick what this patch doesn't get. Add a step of your own — *tack coat*,
*second coat* — by typing its name; it's added to that patch and appears on the
report like any other.

Tap a step and shoot. As many photos as it needs: a big patch has twenty milling
photos and twenty depth photos, and nothing here counts them. Each photo carries
the time, who took it, and (if you leave the location stamp on) the spot on the
ground it was taken from — which is what settles an argument about which patch a
photo belongs to.

A step turns green once there's something against it, so the patch screen shows
what's still owed without anyone keeping a list.

**The depths**

The **Depth check** step carries the numbers as well as the photos, because on
site they happen together: the string goes across, the number gets written on the
seal, the photo is taken of the number.

- Set the **design depth** and the **tolerance** — 40mm ± 5mm to start with, from
  `config.js`.
- Punch the readings in one after another. The keyboard never closes and the
  caret never moves, so twenty readings go in as fast as they can be read off the
  ground.
- Every one is judged as it lands. In spec is green; out of spec is red, says
  **LOW** or **HIGH**, and raises a toast.
- Underneath: how many taken, the average, the lowest, the highest, and how many
  are out.
- **Where** is optional. Write *Ch 12 LHS* and it sticks between readings, so a
  whole string line goes in without retyping it — and the printed sheet becomes a
  full table instead of a compact grid.
- Get the design depth wrong and fix it later? Every reading is re-judged. The
  app never stores a "failed" against a number that didn't.
- Delete a mistyped reading and the sheet renumbers 1…n, the way the paper one does.

**Paving temperature** works the same way, with a floor instead of a band: set the
minimum the mat must not go under, and anything colder is called out.

**Site photos** are the ones that belong to the job rather than any patch — how it
looked before anyone touched it, the closure, the mix dockets, the finished job.

**Signing off**

The sign-off screen says plainly what's still short — *Patch 7: after* — and how
many readings are out of spec, with room to say why. You can sign off anyway; the
report is honest about it either way, with a **Not captured** section listing
every gap.

## What comes out

One button each. They open the phone's print dialog — choose *Save as PDF* to
email or file it.

- **QA record** — the whole thing: job, weather, every patch with its numbers,
  every photo, and a signature block. This is the workbook.
- **Depth sheet** — just the numbers, patch by patch, out-of-spec readings in red,
  with the design depth and the average against each patch. This is the string
  sheet, and it's the page that gets asked for two years later when a joint opens up.
- **Photo record** — every photo in the order the work happened, captioned with the
  patch, the step and the time.
- **CSV** — every reading, for one job or for any stretch of dates, for Excel.

## Things worth knowing

- **Bad signal is fine.** The app opens from its own cache and shows the last data
  it had. Photos taken with no signal are held on the phone — the picture itself,
  not a broken link — and go up whole as soon as there's coverage. The dot next to
  the title turns orange while anything is waiting, and every screen says so.
- **Nothing is lost quietly.** If the database refuses something, the app says
  what it said, in words, and Settings has a **Download a backup** button that
  writes everything on the device — photos included — to one file.
- **No logins.** Everyone shares one key, so anyone holding it can read and write.
  That's deliberate — no password to lose in a wet high-vis. Because this repo and
  the published site are public, `config.js` is left **blank on purpose**: the key
  is entered once per device in Settings instead.
- **QA or Manager.** Everyone captures. A Manager can also edit or delete somebody
  else's record — which is exactly what you don't want a gloved thumb doing on a
  tailgate. Set `managerPin` in `config.js` to put a code in front of it.
- **Practice mode** in Settings runs the whole app on the phone alone. Nothing
  entered there is visible to anyone else. It's the place to learn the app, not a
  live job.
- **Photos are shrunk on the phone** before upload, so a patch's worth goes
  through on one bar.

---

## Setting it up

Two jobs, about 15 minutes, done once.

### 1. The database

1. Go to [supabase.com](https://supabase.com) and create a free account — or use
   the project the other RCK apps are already on. None of the names clash.
2. **New project** — any name, pick the Sydney region, set a database password.
3. Wait about two minutes for it to build.
4. **SQL Editor** → **New query**. Open `supabase-schema.sql` from this folder,
   paste the whole file in, press **Run**. It should say *Success*. Re-running it
   later is safe, and is how an older database catches up with a new version.
5. **Settings → API** and copy two things:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting `eyJ…`
     (Use the *anon public* key. Never the `service_role` one.)

### 2. The first phone

Open the app, go to **Settings**, put your name in, paste the two values into
**Shared data** and press **Save & connect**. There's a **Test connection** button
that says exactly what's wrong if something isn't right.

While you're there, set the defaults that suit RCK in `config.js`:

```js
window.RCKQ_CONFIG = {
  supabaseUrl: '',        // left blank on purpose — see above
  supabaseKey: '',
  defaults: {
    designDepth:    40,   // mm
    depthTolerance:  5,   // ± mm
    minTemperature: 130   // °C
  },
  managerPin: ''          // optional
};
```

### 3. Everyone else's phone

On the phone that's already connected: **Settings → Set up someone else's phone →
Share link**, and send that link to the other QAs. One tap connects their phone —
they never type the key, and because the details ride in the URL's `#` fragment
they're never sent to the web server. Treat the link like a key: only send it to
RCK people.

Then on each phone: **Add to Home Screen** (Share menu on iPhone, ⋮ on Android).
It installs like a normal app.

## Hosting it

Plain HTML, CSS and JavaScript — no build step, no server — so GitHub Pages serves
it straight from this repository. It's live at
`https://shyamal22.github.io/rck-workshop/qa/` and every push to `main` updates it.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application |
| `app.css` | Styling, including the printed documents |
| `config.js` | Your Supabase URL and key, and the QA defaults |
| `supabase-schema.sql` | Run once in Supabase to create the database |
| `sw.js` | Offline caching |

## The other RCK apps in this repository

| Folder | What it is |
|---|---|
| [`../`](../) | **RCK Workshop** — plant and truck damage, work orders and repairs |
| [`../hr/`](../hr/) | **RCK HR** — staff records, licences and compliance |
| [`../dispatch/`](../dispatch/) | **RCK Dispatch** — jobs, site paperwork and the daily job diary |
| [`../costing/`](../costing/) | **RCK Costing** — what a job was priced at, what it cost, and what it made |
