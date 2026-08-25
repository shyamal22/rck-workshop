# RCK Costing

What each job was priced at, what it actually cost, what was claimed from the client,
and what it made.

It is a home-screen app on your phone and nothing else. No account, no server, no
database — the jobs live in the phone's own storage, the app itself is a handful of
files served by GitHub Pages, and what leaves it is a printed PDF you send to whoever
needs it.

**Green** = money made · **Red** = money lost · **an em dash** = nobody has entered
that number yet, which is never the same as a zero.

---

## Putting it on your phone

1. Open **https://shyamal22.github.io/rck-workshop/costing/** in the phone's browser.
2. **Add to Home Screen** — the Share menu on an iPhone, ⋮ on Android.
3. Open it from the home screen, type your name, tap **Start**.

That's the whole setup. There is nothing to connect and nothing to sign into, and from
then on it works with no signal at all — it never had one.

**Keep it on the home screen.** On an iPhone, a site that is only ever visited in
Safari can have its stored data cleared after a few weeks of not being opened. An
installed app is not treated that way, which is why step 2 matters.

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
- Why labour ran over, what to price differently next time, what the client said. Each
  one signed with your name and dated.

**Reports** — this month, last month, a financial year, or between any two dates:
- Claimed, cost, profit and margin for the period, with the best and worst job in it.
- Every job in the period as a table, and the same thing as a printed summary.
- **Print the costing sheet** for any one job: the estimate against the actual, every
  variation, the claim, the profit, and the comments — letterheaded, on one page.
- **CSV** of every job with all its cost lines, and of every variation, for Excel.

A job only joins a total once both its actual cost and its claim are in. Until then it
is listed but left out, and the app says how many are waiting — a half-costed job makes
a total that reads worse than no total at all.

All figures exclude GST.

---

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

**Sending a job to the team.** Open the job → **Print the costing sheet** → choose
*Save as PDF* in the print dialog → share it from there. Same for the period summary
under Reports. Nothing else leaves the phone.

---

## The one thing to remember: back it up

Your phone holds the only copy. There is no server keeping a second one.

**Settings → Send a backup** writes every job, variation and comment into a single file
and hands it to the phone's share sheet — email it to yourself once a month and you can
never lose more than a month. **Save the file** does the same into Files instead.

**Settings → Restore from a backup** reads one back, onto this phone or a new one. It
replaces everything on the device, so it is how you move to a new phone, not how you
merge two.

The board tells you when it has been more than a month, or when you have never taken
one at all. It is the only nagging the app does, and it is worth listening to.

If the director wants his own copy, send him the backup file and he can load it into the
same app on his phone — but the two phones don't talk to each other. Whichever one you
enter the jobs on is the one that has them.

---

## Hosting it

Plain HTML, CSS and JavaScript — no build step, no server, no dependencies. GitHub Pages
serves it from this repository alongside the other RCK apps:

**Settings → Pages → Source: Deploy from a branch → Branch `main`, folder `/ (root)` → Save**

It is live at `https://shyamal22.github.io/rck-workshop/costing/` a minute later, and
every push to `main` updates it — the app checks for a new version whenever you open it
and says so in Settings when one is ready.

Nothing links to it from anywhere. The home-screen icon is the whole of the distribution.

---

## Things worth knowing

- **Nothing is shared, ever.** No key, no link, no sync. The figures are on the phone
  they were entered on. That is also the security: there is nothing on the internet to
  find, and the published app is an empty shell until someone types into it.
- **It works with no signal**, including on a plane or down a hole, because it never
  asks the network for anything after the first visit.
- **Cost lines aren't fixed.** Add one to `COST_LINES` in `app.js` and both forms, the
  comparison table, the printed sheet and the CSV all grow the line by themselves.
- **Types of work aren't a fixed list either.** Pick **+ Add a new type…** when creating
  a job and name it; from then on it's a type like any other. Naming one that already
  exists in a different spelling reuses the existing one.
- **A job's period** is the month it was *claimed* in, or if it hasn't been claimed, the
  month it was last on site. So a job that ran in March and was claimed in April lands
  in April, where the accountant will look for it.
- **Deleting a job** takes its variations and comments with it, cannot be undone, and
  there is no copy anywhere else. It asks twice. Print the sheet first if there's doubt.
- **Clearing the browser's website data** or deleting the installed app takes everything
  with it. So does a lost phone. The backup file is what survives all three.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application |
| `app.css` | Styling, including the printed sheets |
| `config.js` | The letterhead on the printed sheets |
| `sw.js` | Caches the app so it opens with no connection |

## The other RCK apps in this repository

| Folder | What it is |
|---|---|
| [`../`](../) | **RCK Workshop** — plant and truck damage, work orders and repairs |
| [`../hr/`](../hr/) | **RCK HR** — staff records, licences and compliance |
| [`../dispatch/`](../dispatch/) | **RCK Dispatch** — jobs, site paperwork and the daily job diary |
