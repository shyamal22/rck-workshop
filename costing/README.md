# RCK Costing

What each job was priced at, what it actually cost, what was claimed from the client,
and what it made. Built for two people — you and the director — and nobody else can
open it.

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

Three jobs, about twenty minutes, done once.

### 1. The database

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. **New project** — any name, pick the Sydney region, set a database password.
   (It can be the same project as RCK Workshop, Dispatch and HR: no names clash.)
3. Open **SQL Editor** → **New query**, paste the whole of `supabase-schema.sql`
   from this folder, press **Run**. It should say *Success*.
4. Go to **Settings → API** and copy the **Project URL** and the **anon public** key.
   (The *anon public* one. Never `service_role`.)

### 2. The two accounts

There are no shared logins here. Each of you gets a real account.

1. **Authentication → Users → Add user**, for each of you: email address, a password,
   and tick **Auto Confirm User**.
2. Back in **SQL Editor**, put each of them on the costing list:

   ```sql
   select cost_grant('office@rcknz.co.nz', 'Your name', 'owner');
   select cost_grant('director@rcknz.co.nz', 'The director', 'director');
   ```

   It answers `… can now use RCK Costing as …`. If it says no account was found,
   create the user in step 1 first and run it again.

Both roles see and do exactly the same things. The role is only there so the list
says who is who.

To take someone off later, and keep every job they entered:

```sql
update cost_users set active = false where email = 'someone@rcknz.co.nz';
```

### 3. The app

Put the two values into `config.js`:

```js
window.RCKC_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
  idleLockMinutes: 20,
  brand: { name: 'RCK NZ', trade: 'Asphalt & Civil Contracting', email: 'office@rcknz.co.nz', phone: '' }
};
```

**Unlike the workshop and dispatch apps, it is safe to commit these**, even though this
repository is public. The key opens nothing on its own: every table needs a signed-in
account that is also on the `cost_users` list, so a stranger with the key and the app
URL gets a sign-in screen and no more. That is the point of building it this way — the
link can be sent to the director and it just works, with nothing to type in.

Commit the change and the site redeploys itself.

### 4. On each device

1. Open the app URL in the browser.
2. **Add to Home Screen** (Share menu on iPhone, ⋮ on Android). It installs like a
   normal app.
3. Sign in with your email and password. It stays signed in between visits.

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

---

## Hosting it

Plain HTML, CSS and JavaScript — no build step, no server. GitHub Pages serves it from
this repository along with the other apps, so it is live at
`https://shyamal22.github.io/rck-workshop/costing/` and updates on every push to `main`.

---

## Things worth knowing

- **Nothing is kept on the device.** No job, no cost, no margin is ever written to the
  phone or the laptop. Everything on screen is held in memory and thrown away when you
  lock, sign out or reload — only the sign-in token is kept. That is the trade for not
  leaving the company's margins in a browser cache: the app needs a connection.
- **It locks itself** after 20 minutes with nothing happening, so an open laptop doesn't
  leave the profit on a job on display. Change `idleLockMinutes` in `config.js`, or set
  it to `0` to never lock.
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
- **Reports print** through the browser's print dialog — choose *Save as PDF* to email
  or file one.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole application |
| `app.css` | Styling, including the printed sheets |
| `config.js` | Your Supabase URL and key, the lock timeout, and the letterhead |
| `supabase-schema.sql` | Run once in Supabase to create the database |
| `sw.js` | Caches the app shell only — never any data |

## The other RCK apps in this repository

| Folder | What it is |
|---|---|
| [`../`](../) | **RCK Workshop** — plant and truck damage, work orders and repairs |
| [`../hr/`](../hr/) | **RCK HR** — staff records, licences and compliance |
| [`../dispatch/`](../dispatch/) | **RCK Dispatch** — jobs, site paperwork and the daily job diary |
