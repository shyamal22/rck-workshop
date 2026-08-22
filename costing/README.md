# RCK Costing

What each job was priced at, what it actually cost, what was claimed from the client,
and what it made. Built for two people — you and the director — and set up the same
way as RCK Dispatch: no logins, one key entered once per device, or no database at
all if the figures only ever need to live on yours.

**Green** = money made · **Red** = money lost · **an em dash** = nobody has entered
that number yet, which is never the same as a zero.

---

## What it does

**Before the job**
- Enter the job — name, client, site, type of work, the client's order number, dates.
- Enter the **agreed price**, and the **expected costs** broken down by line: labour,
  plant, materials, subcontractors, traffic management, cartage, other.
- The app works out what the job is priced to make, and the margin on it.

**After the job**
- Enter the **actual costs** against the same lines, and the **claim** sent to the
  client, with the invoice number and the date it was claimed.
- Every line shows **over or under** the estimate, so the overrun can be pointed at
  rather than guessed. Red is money the job spent that it wasn't priced to spend.

**Variations**
- Each one is a line of its own: what it is, what it cost us, what was claimed for it,
  and what it made. Numbered VAR-1, VAR-2 … in the order they were raised.
- **Approved**, **Pending** or **Declined**. A declined variation stays on the record
  and is left out of every total — the only honest way to show one.

**The profit**
- Total claimed (base job + variations), total cost (actual + variations), what it made
  and the margin, on the job page and on the board.
- Against that, what it was *priced* to make, and how far it landed either side of it.

**Comments**
- The two of you, on the record, against the job: why labour ran over, what to price
  differently next time, what the client said. Each one signed and dated by itself.

**Reports** — this month, last month, a financial year, or between any two dates:
- Claimed, cost, profit and margin for the period, with the best and worst job in it.
- Every job in the period as a table, and the same thing as a printed summary.
- **Print the costing sheet** for any one job: the estimate against the actual, every
  variation, the claim, the profit, and the comments — one page, letterheaded.
- **CSV** of every job with all its cost lines, and of every variation, for Excel.

A job only joins a total once both its actual cost and its claim are in. Until then it
is listed but left out, and the app says how many are waiting — a half-costed job makes
a total that reads worse than no total at all.

All figures exclude GST.

---

## Setting it up

Two ways, and the app works the same either way. Pick the first if the director
wants to see the jobs on his own phone; pick the second if you are the only one
entering them and all you do is print the sheet to PDF and send it on.

### Either: this device only, in about a minute

1. Open the app URL in the browser, **Add to Home Screen**.
2. **Settings** → enter your name → **Save**.
3. **Use it without a database** → *This device only* → **Switch mode**.

That's it. The figures live on that one device. Nothing is shared, and nothing is
backed up anywhere — so take a backup now and then from **Settings → Download a
backup**, because it is the only copy there is.

### Or: shared between the two of you, in about fifteen

**The database, once:**

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. **New project** — any name, pick the Sydney region, set a database password
   (you won't need it again, but save it somewhere).
   It can be the same project as RCK Workshop, Dispatch and HR — no names clash.
3. Wait about two minutes for the project to build.
4. **SQL Editor → New query**, paste the whole of `supabase-schema.sql` from this
   folder, press **Run**. It should say *Success*.
5. **Settings → API** and copy two things:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting `eyJ…`
     (The *anon public* one. Never `service_role`.)

The free tier is far more than this app will ever need.

**Your device:** open the app, go to **Settings → Where the figures are kept**, paste
the two values in, press **Test connection** — it says in words if anything is wrong —
then **Save & connect**.

**The director's device:** on your phone, **Settings → Set up the other device →
Share link**, and send him that link. One tap connects him: he enters his name and
he's in, never typing the key. Because the details ride in the URL's `#` fragment
they are never sent to the web server.

`config.js` is deliberately left **blank**. This repository and the published site
are public, so putting the key in that file would publish it — and this app holds
what every job made. Entering it once per device keeps it off the public page.
Treat the setup link the same way: anyone who has it can read and write the figures,
so it only ever goes to the two of you.

## Using it

The order the app expects, and the order the money actually becomes known:

1. **New job** → the details. It saves and takes you straight to the figures.
2. **Costs & claim** → the agreed price and the expected costs. Leave the rest empty.
3. Set the job to **Running** when the crew goes on site.
4. **Add** a variation as each one comes up, rather than remembering them at the end.
5. When it's finished: **Costs & claim** again for the actual costs, the claim, the
   invoice number and the date. Set the job to **Completed**.
6. **Print the costing sheet**, and say what happened in the comments while it's fresh.

Every box you leave empty stays empty. The app never turns a blank into a zero, and it
never shows a profit worked out from a number nobody has entered.

---

## Hosting it

Plain HTML, CSS and JavaScript — no build step, no server. GitHub Pages serves it from
this repository along with the other apps, so it is live at
`https://shyamal22.github.io/rck-workshop/costing/` and updates on every push to `main`.

Nothing links to it from anywhere. Bookmark it, or install it to the home screen, and
that is the whole of the distribution — what leaves the app is a printed PDF.

---

## Things worth knowing

- **No logins.** Both devices share one key, so anyone holding that key can read and
  write. That's the same bargain as the workshop and dispatch apps — nothing to
  remember, nothing to lose — but it is a bargain, and this app holds the margins.
  Don't publish the app link with the key, and don't hand the setup link on.
- **A bad connection is fine.** The app opens from its own copy and shows the last
  figures it had. Anything entered with no signal is kept on the device and sent as
  soon as there is a connection — the dot next to the title turns orange while
  something is waiting, and every screen says so until it has gone.
- **Cost lines aren't fixed.** Add one to `COST_LINES` in `app.js` and both forms, the
  comparison table, the printed sheet and the CSV all grow the line by themselves — the
  database needs no change, because the breakdown is stored as a map.
- **Types of work aren't a fixed list either.** Pick **+ Add a new type…** when creating
  a job and name it; from then on it's a type like any other. Naming one that already
  exists in a different spelling reuses the existing one.
- **A job's period** is the month it was *claimed* in, or if it hasn't been claimed, the
  month it was last on site. So a job that ran in March and was claimed in April lands
  in April, where the accountant will look for it.
- **Deleting a job** takes its variations and comments with it and cannot be undone. It
  asks twice. Print the costing sheet first if there's any doubt.
- **Switching between shared and this-device-only** doesn't merge anything: each mode
  keeps its own copy, and switching back finds what was there before.
- **Reports print** through the browser's print dialog — choose *Save as PDF* to email
  or file one.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application |
| `app.css` | Styling, including the printed sheets |
| `config.js` | The letterhead (the Supabase key is left blank on purpose) |
| `supabase-schema.sql` | Run once in Supabase to create the database |
| `sw.js` | Offline caching of the app itself |

## The other RCK apps in this repository

| Folder | What it is |
|---|---|
| [`../`](../) | **RCK Workshop** — plant and truck damage, work orders and repairs |
| [`../hr/`](../hr/) | **RCK HR** — staff records, licences and compliance |
| [`../dispatch/`](../dispatch/) | **RCK Dispatch** — jobs, site paperwork and the daily job diary |
