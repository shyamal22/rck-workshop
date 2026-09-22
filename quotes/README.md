# RCK Quotes

Every quote that leaves the office: what it stands at, the cost allowed inside it,
whether the client has answered — and the margin that was priced in, before a wheel turns.

It is a home-screen app on your phone and nothing else. No account, no server, no
database — the quotes live in the phone's own storage, the app itself is a handful of
files served by GitHub Pages, and what leaves it is a printed PDF quote for the client.
The client's copy never shows the internal figures.

**Blue** = sent, waiting · **Green** = won · **Red** = lost · **Grey** = still a draft.
"Expired" is never set by hand — it comes straight from the valid-until date on a sent
quote, so it can never be forgotten and never be wrong.

---

## Putting it on your phone

1. Open **https://shyamal22.github.io/rck-workshop/quotes/** in the phone's browser.
2. **Add to Home Screen** — the Share menu on an iPhone, ⋮ on Android.
3. Open it from the home screen, type your name, tap **Start**.

That's the whole setup. There is nothing to connect and nothing to sign into, and from
then on it works with no signal at all — it never had one.

**Keep it on the home screen.** On an iPhone, a site that is only ever visited in
Safari can have its stored data cleared after a few weeks of not being opened. An
installed app is not treated that way, which is why step 2 matters.

---

## What it does

**Writing a quote**
- The job — who it's for, the contact the quote goes to, the site, the type of work,
  their RFQ number, and the scope in the client's language.
- The **prices**, line by line: a description, a quantity, a unit and a rate — or just
  a lump sum. The total, the GST and the incl-GST figure follow every keystroke.
- The **allowances**: what that price is allowed to cost us, broken down by the same
  lines RCK Costing uses — labour, plant, materials, subcontractors, traffic
  management, cartage, and any line you name yourself. The app shows the **margin
  priced in**, in dollars and per cent, while you type.
- The allowances and the margin are **internal only**. They are on your screen and
  nowhere on the client's page.

**Sending it**
- **Print the quote** — letterheaded, one page: the scope, the prices, subtotal,
  GST and total, the terms from `config.js`, and an acceptance block the client can
  sign and send straight back. Save as PDF from the print dialog and share it.
- **Mark as sent** starts the clock. Every quote states how long it stands
  (30 days unless you change it) and works out its own expiry date.

**The answers**
- **Accepted** or **Declined**, each with the date and — because future you will ask —
  the client's order number on a win, and *why it went elsewhere* on a loss.
- A declined quote stays on the record. That is what makes the win rate honest.

**The board** — what the app opens on:
- **Waiting on clients** — the pipeline: every sent quote and what it adds up to.
- **Won this month**, the **12-month win rate**, and the **margin priced into** what's
  out right now.
- **Needs a look**: quotes that have expired unanswered, quotes about to expire, and
  quotes sent more than ten days ago with no answer — the ones worth a call, surfaced
  so nobody has to remember them.
- **Quoted against won**, month by month, for the last six months. Tap a month for
  the figures.
- Every quote below that, filterable by status and searchable by name, client, site
  or number.

**Notes**
- Who you spoke to, what the client said, what to remember at re-price time. Each one
  signed with your name and dated.

**When a quote is won: hand it to Costing**
- One tap on an accepted quote — **Hand it to RCK Costing** — and it becomes a job in
  the [Costing app](../costing/): the quote total lands as the agreed price, the
  allowances land as the expected costs, line for line, and the job starts as *Quoted*.
  Nothing is retyped, so the job is measured against exactly what was priced.
- This works because both apps live at the same address and share the phone's storage.
  It reaches the Costing app **on the same phone** — quotes still don't travel between
  phones.

**For the spreadsheet**
- CSV of every quote — status, dates, totals, allowance, margin — and CSV of every
  line item, from Settings.

All figures exclude GST; the printed quote says the GST out loud.

---

## The one thing to remember: back it up

Your phone holds the only copy. There is no server keeping a second one.

**Settings → Send a backup** writes every quote and note into a single file and hands
it to the phone's share sheet — email it to yourself once a month and you can never
lose more than a month. **Save the file** does the same into Files instead.
**Restore from a backup** reads one back, onto this phone or a new one. It replaces
everything on the device, so it is how you move to a new phone, not how you merge two.

The board tells you when it has been more than a month, or when you have never taken
one at all.

---

## Hosting it

Plain HTML, CSS and JavaScript — no build step, no server, no dependencies. GitHub
Pages serves it from this repository alongside the other RCK apps; every push to
`main` updates it, and the app says so in Settings when a new version is ready.

## Things worth knowing

- **Nothing is shared, ever.** No key, no link, no sync. The figures are on the phone
  they were entered on, and the published app is an empty shell until someone types
  into it.
- **A rate with no quantity is a lump sum** — the rate is the price. A line with no
  rate at all isn't priced yet, and the app never counts it as zero: the total is only
  ever what has a figure on it, and the quote page says how many lines are still bare.
- **Cost lines aren't fixed.** Add one on the Allowances screen — accommodation, a
  ferry crossing — and it is a line like any other from then on, in the CSV and in the
  hand-over to Costing.
- **Re-quoting**: **Copy as a new draft** takes everything — items, allowances, scope —
  into a fresh quote number.
- **Deleting a quote** takes its notes with it, cannot be undone, and there is no copy
  anywhere else. It asks twice.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application |
| `app.css` | Styling — the iOS-style screens and the printed quote |
| `config.js` | The letterhead, the GST rate, the default validity and the printed terms |
| `sw.js` | Caches the app so it opens with no connection |

## The other RCK apps in this repository

| Folder | What it is |
|---|---|
| [`../`](../) | **RCK Workshop** — plant and truck damage, work orders and repairs |
| [`../costing/`](../costing/) | **RCK Costing** — what a job was priced at, what it cost, what was claimed, and what it made |
| [`../dispatch/`](../dispatch/) | **RCK Dispatch** — jobs, site paperwork and the daily job diary |
| [`../hr/`](../hr/) | **RCK HR** — staff records, licences and compliance |
