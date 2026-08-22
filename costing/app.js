/* =====================================================================
   RCK Costing — what a job was priced at, what it cost, what was
   claimed, and what it made.
   Plain JavaScript, no build step, no frameworks.

   Two people use this: you and the director. It is set up like RCK
   Dispatch — no logins, one shared key entered once per device, a copy
   kept on the device so it opens instantly and still works with no
   signal, and anything written offline queued until it can be sent. It
   also runs with no database at all, holding the figures on the one
   device, for whoever only wants to print the sheets to PDF.

   The shape of a job, in the order it is filled in:

     1. Job details, and the price agreed with the client.
     2. Expected costs, broken down by line, before a machine moves.
     3. Actual costs and the claim, once the job is finished.
     4. Variations along the way — what each one cost and what was
        claimed for it.

   Everything else on screen is worked out from those four things. The
   app never asks for a number it can add up itself.
   ===================================================================== */
'use strict';

const VERSION = '1.0.0';
const SITE = window.RCKC_CONFIG || {};

/* A newer version has downloaded but can't take over until every tab of the
   old one is gone. Rather than leave someone tapping a feature that isn't
   there yet, Settings says so. */
let updateReady = false;

/* --------------------------------------------------------- job states */
/* Three, and only three. A job is priced, being done, or finished. */
const JOB_STATUS = [
  { key: 'quoted',    label: 'Quoted',    tone: 'blue',
    blurb: 'Priced up, not started' },
  { key: 'running',   label: 'Running',   tone: 'green',
    blurb: 'On site now' },
  { key: 'completed', label: 'Completed', tone: 'slate',
    blurb: 'Finished — actuals and claim entered' }
];

/* ------------------------------------------------------- types of work */
/* What RCK started with. Anyone can add more when creating a job — a type
   exists from the moment a job is filed under it, so there is no separate
   list to keep tidy and nothing to migrate. */
const BUILTIN_WORK_TYPES = [
  { key: 'milling',     label: 'Milling' },
  { key: 'paving',      label: 'Paving' },
  { key: 'mill_pave',   label: 'Mill & pave' },
  { key: 'resurfacing', label: 'Resurfacing' },
  { key: 'kerb',        label: 'Kerb & channel' },
  { key: 'footpath',    label: 'Footpath' },
  { key: 'drainage',    label: 'Drainage' },
  { key: 'maintenance', label: 'Maintenance & repairs' },
  { key: 'other',       label: 'Other' }
];

/* ---------------------------------------------------------- cost lines */
/* The breakdown both estimates and actuals are entered against, so
   expected and actual can be read side by side and the overrun can be
   pointed at rather than guessed. Every line is optional: an empty box
   means nobody has said yet, and is never counted as a zero.

   Adding a line here is all it takes — the two forms, the comparison
   table, the printed sheet and the CSV all build themselves from it, and
   the database needs no change because the breakdown is stored as a map. */
const COST_LINES = [
  { key: 'labour',    label: 'Labour',             hint: 'Wages, hours, overtime' },
  { key: 'plant',     label: 'Plant & equipment',  hint: 'Machine hire, floats, fuel' },
  { key: 'materials', label: 'Materials',          hint: 'Asphalt, aggregate, emulsion' },
  { key: 'subbies',   label: 'Subcontractors',     hint: 'Anyone invoicing us for the work' },
  { key: 'tm',        label: 'Traffic management', hint: 'TM crews, signs, closures' },
  { key: 'cartage',   label: 'Cartage & disposal', hint: 'Trucking, tip fees' },
  { key: 'other',     label: 'Other',              hint: 'Anything that fits nowhere else' }
];

/* ----------------------------------------------------- variation states */
/* A declined variation is kept on the record and left out of every total,
   which is the only honest way to show one. */
const VARIATION_STATUS = [
  { key: 'approved', label: 'Approved', tone: 'green',
    blurb: 'Agreed with the client' },
  { key: 'pending',  label: 'Pending',  tone: 'yellow',
    blurb: 'Not agreed yet — still counted' },
  { key: 'declined', label: 'Declined', tone: 'red',
    blurb: 'Left out of every total' }
];

/* ------------------------------------------------------- small tools */
const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
/** "chip_seal" → "Chip seal". */
function humanise(key) {
  return String(key || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
/** The other way round: "Chip seal" → "chip_seal". Used for added types. */
function slug(text) {
  return String(text || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'other';
}
function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtShort(v) {
  if (!v) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return `${fmtDate(v)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ------------------------------------------------------------- money */
/* An empty money box means "nobody knows yet". That is a null, and it
   stays a null all the way through: a figure worked out from a number
   nobody has entered is a guess wearing a dollar sign. */
function hasMoney(v) { return v != null && v !== '' && isFinite(Number(v)); }

/** What a typed money box is worth: a number, or null for "not known". */
function readMoney(raw) {
  const v = String(raw == null ? '' : raw).trim().replace(/[$,\s]/g, '');
  if (!v) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/** Dollars the way they read on a New Zealand invoice. Cents are shown
    only when there are cents to show, so a table of round estimates isn't
    a wall of ".00" and an invoice figure is still exact. */
function fmtMoney(v, forceCents) {
  if (!hasMoney(v)) return '—';
  const n = Number(v);
  const dp = forceCents || Math.abs(n % 1) > 0.0049 ? 2 : 0;
  try {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency', currency: 'NZD',
      minimumFractionDigits: dp, maximumFractionDigits: dp
    }).format(n);
  } catch (e) {
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}
/** Same, with a sign in front, for a number whose direction is the point. */
function fmtSigned(v, forceCents) {
  if (!hasMoney(v)) return '—';
  const n = Number(v);
  return (n > 0 ? '+' : '') + fmtMoney(n, forceCents);
}
function fmtPct(v, dp) {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(dp == null ? 1 : dp) + '%';
}
/** Green for money made, red for money lost, nothing for a number that
    is neither. Colour means state here as it does everywhere else. */
function toneOf(v) {
  if (!hasMoney(v)) return '';
  return Number(v) > 0 ? 'pos' : Number(v) < 0 ? 'neg' : '';
}

function jobNo(j) { return 'JC-' + String((j && j.number) || 0).padStart(4, '0'); }

function statusDef(key) { return JOB_STATUS.find(s => s.key === key) || JOB_STATUS[0]; }
function statusLabel(key) { return statusDef(key).label; }
function statusTone(key) { return statusDef(key).tone; }

function varStatusDef(key) { return VARIATION_STATUS.find(s => s.key === key) || VARIATION_STATUS[0]; }

/* --------------------------------------------------- types of work */
function typeOf(j) { return ((j && j.work_type) || '').trim() || 'other'; }
function builtinType(key) { return BUILTIN_WORK_TYPES.find(t => t.key === key); }
function typeLabel(key) {
  const b = builtinType(key);
  return b ? b.label : humanise(key);
}
/** Built-in types, then any type someone has added, then Other last. */
function allTypeKeys() {
  const seen = new Set(BUILTIN_WORK_TYPES.map(t => t.key));
  const extra = [];
  DB.jobs.forEach(j => {
    const k = typeOf(j);
    if (!seen.has(k)) { seen.add(k); extra.push(k); }
  });
  extra.sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)));
  return BUILTIN_WORK_TYPES.filter(t => t.key !== 'other').map(t => t.key)
    .concat(extra, ['other']);
}
/** Existing spelling of a type if one matches, so near-duplicates can't creep in. */
function matchType(name) {
  const want = slug(name);
  return allTypeKeys().find(k => k === want) || want;
}

/* Inline icons — no icon font, no network request, they inherit text colour. */
const ICONS = {
  lock:     '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
  chart:    '<rect x="3.5" y="12.5" width="4.5" height="8" rx="1.6"/><rect x="9.75" y="8.5" width="4.5" height="12" rx="1.6"/><rect x="16" y="3.5" width="4.5" height="17" rx="1.6"/>',
  pin:      '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/>',
  printer:  '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  download: '<path d="M12 3.5v11M12 14.5L8 10.6M12 14.5l4-3.9"/><path d="M4.5 15.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5"/>',
  trash:    '<path d="M4.5 6.5h15M9.5 6.5V4.2h5v2.3"/><path d="M6.5 6.5l.9 12.4a1.6 1.6 0 0 0 1.6 1.4h6a1.6 1.6 0 0 0 1.6-1.4l.9-12.4"/>',
  doc:      '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3.5V8.5h5"/>',
  pencil:   '<path d="M16.2 4.3l3.5 3.5"/><path d="M14.4 6.1L5 15.5V19h3.5l9.4-9.4z"/>',
  plus:     '<path d="M12 5.5v13M5.5 12h13"/>',
  chat:     '<path d="M20.5 12.2c0 3.9-3.8 7-8.5 7a10 10 0 0 1-2.6-.34L4.5 20.5l1.2-3.6A6.6 6.6 0 0 1 3.5 12.2c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z"/>'
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

/* ================================================================
   Settings and identity — kept per device
   ================================================================ */
const Settings = {
  read() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('rckc.settings') || '{}'); } catch (e) {}
    return Object.assign({
      supabaseUrl: SITE.supabaseUrl || '',
      supabaseKey: SITE.supabaseKey || '',
      name: '',
      localMode: false
    }, saved);
  },
  write(patch) {
    const next = Object.assign(Settings.read(), patch);
    localStorage.setItem('rckc.settings', JSON.stringify(next));
    S = next;
    return next;
  }
};
let S = Settings.read();

const connected = () => !S.localMode && !!S.supabaseUrl && !!S.supabaseKey;
function whoami() { return S.name || 'Unnamed user'; }

/* ================================================================
   Local copy — the app opens instantly and still works with no signal
   ================================================================ */
const DB = { jobs: [], variations: [], comments: [], localSeq: 0 };

function cacheKey() { return 'rckc.cache.' + (S.localMode ? 'local' : 'remote'); }

function loadCache() {
  DB.jobs = []; DB.variations = []; DB.comments = []; DB.localSeq = 0;
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (raw) {
      DB.jobs = raw.jobs || [];
      DB.variations = raw.variations || [];
      DB.comments = raw.comments || [];
      DB.localSeq = raw.localSeq || 0;
    }
  } catch (e) {}
}
function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(DB));
  } catch (e) {
    toast('Device storage is full.');
  }
}

function upsert(table, row) {
  const list = DB[table];
  const i = list.findIndex(r => r.id === row.id);
  if (i >= 0) list[i] = Object.assign({}, list[i], row);
  else list.push(row);
}
function drop(table, id) {
  const list = DB[table];
  const i = list.findIndex(r => r.id === id);
  if (i >= 0) list.splice(i, 1);
}

/* The table each list is held in, so one name does for both ends. */
const TABLES = { jobs: 'cost_jobs', variations: 'cost_variations', comments: 'cost_comments' };

/* ================================================================
   Supabase REST access
   ================================================================ */
function restHeaders(extra) {
  return Object.assign({
    apikey: S.supabaseKey,
    Authorization: 'Bearer ' + S.supabaseKey
  }, extra || {});
}
async function rest(path, opts) {
  const base = S.supabaseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/rest/v1/${path}`, opts);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) {}
    throw new Error(`${res.status} ${detail || res.statusText}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ================================================================
   Store — one interface, two backings (Supabase, or this device only)
   ================================================================ */
/* Work written on this device that the server has not taken yet — held in
   the outbox until it can be sent. A pull must fold these back in, or the
   server's answer silently deletes a job somebody has just entered: it
   vanishes off the screen and out of the local copy while the only copy of
   it sits in a queue nobody was told about. */
function reconcile(list, fromServer) {
  const table = TABLES[list];
  const ops = Outbox.all().filter(op => op.table === table);
  if (!ops.length) return fromServer;

  const out = (fromServer || []).slice();
  const byId = new Map(out.map((r, i) => [r.id, i]));

  ops.forEach(op => {
    if (op.kind === 'insert') {
      // Not on the server yet — keep ours, and mark it so the app can say so.
      if (!byId.has(op.row.id)) {
        byId.set(op.row.id, out.length);
        out.push(Object.assign({}, op.row, { _unsent: true }));
      }
    } else if (op.kind === 'patch') {
      const i = byId.get(op.id);
      if (i != null) out[i] = Object.assign({}, out[i], op.patch, { _unsent: true });
    } else if (op.kind === 'delete') {
      const i = byId.get(op.id);
      if (i != null) { out.splice(i, 1); byId.clear(); out.forEach((r, j) => byId.set(r.id, j)); }
    }
  });
  return out;
}

const Store = {
  async pull() {
    if (!connected()) return;
    const [jobs, variations, comments] = await Promise.all([
      rest('cost_jobs?select=*&order=number.desc&limit=3000', { headers: restHeaders() }),
      rest('cost_variations?select=*&order=created_at.asc&limit=10000', { headers: restHeaders() }),
      rest('cost_comments?select=*&order=at.asc&limit=10000', { headers: restHeaders() })
    ]);
    DB.jobs = reconcile('jobs', jobs || []);
    DB.variations = reconcile('variations', variations || []);
    DB.comments = reconcile('comments', comments || []);
    saveCache();
  },

  async insert(list, row) {
    const table = TABLES[list];
    if (!row.id) row.id = uid();
    if (!row.created_at) row.created_at = new Date().toISOString();
    if (!connected()) {
      if (list === 'jobs' && !row.number) row.number = ++DB.localSeq;
      upsert(list, row);
      saveCache();
      return row;
    }
    upsert(list, row);              // show it straight away
    saveCache();
    try {
      const out = await rest(table, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(row)
      });
      const saved = Array.isArray(out) ? out[0] : out;
      if (saved) { upsert(list, saved); saveCache(); }
      return saved || row;
    } catch (err) {
      Outbox.add({ kind: 'insert', table, row });
      return row;
    }
  },

  async patch(list, id, patch) {
    upsert(list, Object.assign({ id }, patch));
    saveCache();
    if (!connected()) return;
    try {
      await rest(`${TABLES[list]}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(patch)
      });
    } catch (err) {
      Outbox.add({ kind: 'patch', table: TABLES[list], id, patch });
    }
  },

  async remove(list, id) {
    drop(list, id);
    saveCache();
    if (!connected()) return;
    try {
      await rest(`${TABLES[list]}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: restHeaders({ Prefer: 'return=minimal' })
      });
    } catch (err) {
      Outbox.add({ kind: 'delete', table: TABLES[list], id });
    }
  }
};

/* ------------- outbox: writes made with no signal, replayed later ---- */
const Outbox = {
  all() {
    try { return JSON.parse(localStorage.getItem('rckc.outbox') || '[]'); } catch (e) { return []; }
  },
  save(list) { localStorage.setItem('rckc.outbox', JSON.stringify(list)); },
  add(op) {
    const list = Outbox.all();
    list.push(Object.assign({ opId: uid() }, op));
    Outbox.save(list);
    paintSync();
  },
  count() { return Outbox.all().length; },

  /* Why the queue isn't draining. A dropped connection is normal and fixes
     itself; a refusal from the database never does, and has to be put in
     front of somebody. */
  problem() {
    try { return JSON.parse(localStorage.getItem('rckc.outbox.problem') || 'null'); } catch (e) { return null; }
  },
  setProblem(p) {
    if (p) localStorage.setItem('rckc.outbox.problem', JSON.stringify(p));
    else localStorage.removeItem('rckc.outbox.problem');
  },

  async flush() {
    if (!connected()) return;
    const list = Outbox.all();
    if (!list.length) { Outbox.setProblem(null); return; }
    const left = [];
    let refused = null;
    for (const op of list) {
      try {
        if (op.kind === 'insert') {
          await rest(op.table, {
            method: 'POST',
            headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify(op.row)
          });
        } else if (op.kind === 'delete') {
          await rest(`${op.table}?id=eq.${encodeURIComponent(op.id)}`, {
            method: 'DELETE',
            headers: restHeaders({ Prefer: 'return=minimal' })
          });
        } else {
          await rest(`${op.table}?id=eq.${encodeURIComponent(op.id)}`, {
            method: 'PATCH',
            headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
            body: JSON.stringify(op.patch)
          });
        }
      } catch (err) {
        left.push(op);
        // A 4xx is the database saying no. Retrying forever won't help and
        // whoever is using the app needs to know, in words, what it said.
        if (/^\s*4\d\d/.test(err.message || '')) refused = err.message;
      }
    }
    Outbox.save(left);
    Outbox.setProblem(left.length && refused
      ? { message: refused, at: new Date().toISOString(), count: left.length }
      : null);
    paintSync();
  }
};
/* ================================================================
   Reading the data — every figure on every screen comes from here,
   and from nowhere else
   ================================================================ */
const jobById = id => DB.jobs.find(j => j.id === id);
const varById = id => DB.variations.find(v => v.id === id);

function activeJobs() { return DB.jobs.filter(j => !j.archived); }

/** A cost breakdown added up. Null when not one line has been filled in,
    because "nothing entered" and "it cost nothing" are different answers
    and only one of them is ever true. */
function sumCosts(map) {
  if (!map || typeof map !== 'object') return null;
  let any = false, total = 0;
  Object.keys(map).forEach(k => {
    if (hasMoney(map[k])) { any = true; total += Number(map[k]); }
  });
  return any ? total : null;
}
/** Variations on a job, oldest first — the order they were raised. */
function varsFor(jobId) {
  return DB.variations.filter(v => v.job_id === jobId)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
/** VAR-1, VAR-2 … within the job. Numbered by when they were raised, so a
    number never moves once it has been said out loud. */
function varNo(v) {
  const list = varsFor(v.job_id);
  return 'VAR-' + (list.findIndex(x => x.id === v.id) + 1);
}
/** The ones that count. A declined variation stays on the record and out
    of every total. */
function countedVars(jobId) {
  return varsFor(jobId).filter(v => v.status !== 'declined');
}
function varTotals(jobId) {
  const list = countedVars(jobId);
  let cost = 0, claim = 0;
  list.forEach(v => {
    if (hasMoney(v.cost)) cost += Number(v.cost);
    if (hasMoney(v.claim_value)) claim += Number(v.claim_value);
  });
  return { cost, claim, profit: claim - cost, n: list.length, all: varsFor(jobId).length };
}

function commentsFor(jobId) {
  return DB.comments.filter(c => c.job_id === jobId)
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

/**
 * Everything about one job's money, worked out once and read everywhere.
 *
 *   agreed      the price agreed for the base job
 *   ex / ac     expected and actual cost of the base job
 *   claimed     what was actually claimed for the base job
 *   v           the variations, added up, declined ones left out
 *
 * Nothing is invented. A figure that needs a number nobody has entered
 * comes back null, and every screen prints an em dash for it rather than
 * a confident zero.
 */
function jobMoney(j) {
  const ex = sumCosts(j.expected_costs);
  const ac = sumCosts(j.actual_costs);
  const v  = varTotals(j.id);
  const agreed  = hasMoney(j.contract_value) ? Number(j.contract_value) : null;
  const claimed = hasMoney(j.claim_value)    ? Number(j.claim_value)    : null;

  const totalClaim = claimed == null ? null : claimed + v.claim;
  const totalCost  = ac == null ? null : ac + v.cost;
  const profit     = (totalClaim == null || totalCost == null) ? null : totalClaim - totalCost;
  const expProfit  = (agreed == null || ex == null) ? null : agreed - ex;

  return {
    ex, ac, v, agreed, claimed, totalClaim, totalCost, profit, expProfit,
    /* margin on what was claimed, which is the number a director asks for */
    margin:    (profit == null || !totalClaim) ? null : (profit / totalClaim) * 100,
    expMargin: (expProfit == null || !agreed)  ? null : (expProfit / agreed) * 100,
    /* how it actually went against how it was priced */
    swing:     (profit == null || expProfit == null) ? null : profit - expProfit,
    /* and the same for the cost side alone, variations included */
    costSwing: (ac == null || ex == null) ? null : (ac + v.cost) - ex,
    /* the figure to show while a job is still running and has no claim */
    forecast:  claimed != null ? null : (agreed == null ? null : agreed + v.claim)
  };
}

/** Variance on one cost line: what it came in over or under the estimate. */
function lineVariance(j, key) {
  const e = j.expected_costs && j.expected_costs[key];
  const a = j.actual_costs && j.actual_costs[key];
  if (!hasMoney(e) || !hasMoney(a)) return null;
  return Number(a) - Number(e);
}

/** Board order: what is running first, then what is priced and waiting,
    then what is finished, newest first within each. */
function boardOrder(list) {
  const rank = { running: 0, quoted: 1, completed: 2 };
  return list.slice().sort((a, b) => {
    const r = (rank[a.status] == null ? 3 : rank[a.status]) - (rank[b.status] == null ? 3 : rank[b.status]);
    if (r) return r;
    return (b.number || 0) - (a.number || 0);
  });
}

/** Everything a set of jobs made, added up honestly: a job only joins a
    total once the number it needs has actually been entered, and the
    count of the ones left out is carried alongside so no screen can imply
    the total is the whole story. */
function totalsFor(list) {
  let claim = 0, cost = 0, counted = 0;
  let expClaim = 0, expCost = 0, expCounted = 0;
  list.forEach(j => {
    const m = jobMoney(j);
    if (m.totalClaim != null && m.totalCost != null) {
      claim += m.totalClaim; cost += m.totalCost; counted++;
    }
    if (m.agreed != null && m.ex != null) {
      expClaim += m.agreed; expCost += m.ex; expCounted++;
    }
  });
  return {
    jobs: list.length, counted, waiting: list.length - counted,
    claim: counted ? claim : null,
    cost:  counted ? cost  : null,
    profit: counted ? claim - cost : null,
    margin: counted && claim ? ((claim - cost) / claim) * 100 : null,
    expCounted,
    expProfit: expCounted ? expClaim - expCost : null
  };
}

/* --------------------------------------------------------- periods */
/* A director thinks in months and financial years, not in dates typed
   into two boxes. The boxes are still there for the odd question. */
const PERIODS = [
  { key: 'month',     label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
  { key: 'quarter',   label: 'Last 3 months' },
  { key: 'fy',        label: 'This financial year' },
  { key: 'lastfy',    label: 'Last financial year' },
  { key: 'all',       label: 'Everything' },
  { key: 'custom',    label: 'Between two dates' }
];

/** New Zealand financial years run 1 April to 31 March. */
function periodRange(key) {
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fyStart = m >= 3 ? y : y - 1;
  switch (key) {
    case 'month':     return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case 'lastmonth': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case 'quarter':   return [iso(new Date(y, m - 2, 1)), iso(new Date(y, m + 1, 0))];
    case 'fy':        return [`${fyStart}-04-01`, `${fyStart + 1}-03-31`];
    case 'lastfy':    return [`${fyStart - 1}-04-01`, `${fyStart}-03-31`];
    default:          return ['', ''];
  }
}
function periodLabel(key, from, to) {
  if (key === 'all') return 'Every job';
  if (key === 'custom') {
    if (!from && !to) return 'Every job';
    return `${from ? fmtDate(from) : 'the start'} to ${to ? fmtDate(to) : 'today'}`;
  }
  const p = PERIODS.find(x => x.key === key);
  return (p ? p.label : 'Period') + ` — ${fmtDate(from)} to ${fmtDate(to)}`;
}

/** The date a job belongs to a period by. What was claimed is dated by
    the claim; anything else by when the crew was on site, and by the day
    it was created if it has no dates at all yet. */
function jobDate(j) {
  return j.claimed_on || j.end_date || j.start_date || (j.created_at || '').slice(0, 10);
}
function jobInPeriod(j, from, to) {
  const d = jobDate(j);
  if (!d) return !from && !to;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/* ================================================================
   Routing
   ================================================================ */
function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
  return { path: parts[0] || '', args: parts.slice(1) };
}
function go(hash) { location.hash = hash; }

const SCREENS = {
  '':          { title: 'Jobs',        render: renderBoard,     tab: 'board' },
  'job':       { title: 'Job',         render: renderJob,       back: '#/' },
  'new':       { title: 'New job',     render: renderJobEdit,   back: '#/', tab: 'new' },
  'edit':      { title: 'Job details', render: renderJobEdit,   back: true },
  'costs':     { title: 'Costs & claim', render: renderCosts,   back: true },
  'variation': { title: 'Variation',   render: renderVariation, back: true },
  'reports':   { title: 'Reports',     render: renderReports,   back: '#/', tab: 'reports' },
  'settings':  { title: 'Settings',    render: renderSettings,  back: '#/' },
  'join':      { title: 'Set up',      render: renderJoin }
};

const scrollMemory = {};
let currentKey = null;
let route = { path: '', args: [] };

function render() {
  route = parseHash();
  const { path, args } = route;
  const view = $('#view');

  if (currentKey !== null) scrollMemory[currentKey] = window.scrollY;

  const screen = SCREENS[path] || SCREENS[''];
  $('#title').textContent = screen.title;

  const back = $('#backBtn');
  back.hidden = !screen.back;
  back.onclick = () => {
    if (screen.back === true) history.back();
    else go(screen.back);
  };

  $$('#tabbar a').forEach(a => a.classList.toggle('on', !!screen.tab && a.dataset.tab === screen.tab));
  $('#menu').hidden = true;

  view.className = '';
  void view.offsetWidth;
  view.classList.add('enter');

  // Until there is a name and somewhere to keep the figures, there is only
  // one thing worth showing.
  if (needsSetup() && path !== 'settings' && path !== 'join') {
    renderWelcome(view);
    return;
  }

  screen.render(view, args);
  paintUnsent(view);

  currentKey = path + '/' + args.join('/');
  const y = scrollMemory[currentKey];
  requestAnimationFrame(() => window.scrollTo(0, y || 0));
}

/* ================================================================
   Screen — the first time the app is opened
   ================================================================ */
function needsSetup() {
  return !S.name || (!connected() && !S.localMode);
}

function renderWelcome(view) {
  view.innerHTML = `
    <div class="card">
      <h2>RCK Costing</h2>
      <p class="muted small">What a job was priced at, what it cost, what was claimed,
        and what it made. Two things to set before it can be used: your name, and where
        the figures are kept.</p>
      <a class="btn primary wide mt" href="#/settings">Set it up</a>
    </div>`;
}

/* ================================================================
   Screen — one-tap setup from a shared link
   The connection details ride in the URL's hash, which browsers never
   send to the web server, so the key stays off the public site.
   ================================================================ */
function setupLink() {
  return location.origin + location.pathname +
    '#/join/' + encodeURIComponent(S.supabaseUrl) +
    '/' + encodeURIComponent(S.supabaseKey);
}

function renderJoin(view, args) {
  const url = args[0] || '';
  const key = args[1] || '';
  if (!url || !key) {
    view.innerHTML = `<div class="empty"><b>That link is incomplete</b>
      Ask for it again, or enter the details in Settings.</div>
      <a class="btn wide" href="#/settings">Settings</a>`;
    return;
  }
  view.innerHTML = `
    <div class="card">
      <h2>Connect this device</h2>
      <p class="muted small">This link carries the RCK Costing database details.
        Enter your name and you are in.</p>
      <label class="field"><span>Your name</span>
        <input type="text" id="jName" value="${esc(S.name)}" placeholder="e.g. Shyamal"></label>
      <button class="btn primary wide" id="jGo">Connect</button>
      <p class="tiny muted mt mb0">Project <code>${esc(url.replace(/^https?:\/\//, ''))}</code></p>
    </div>`;

  $('#jGo', view).onclick = async function () {
    const name = $('#jName', view).value.trim();
    if (!name) return toast('Enter your name');
    this.disabled = true;
    this.textContent = 'Connecting…';
    Settings.write({ name, supabaseUrl: url.replace(/\/+$/, ''), supabaseKey: key, localMode: false });
    loadCache();
    await refresh();
    toast('Connected');
    go('#/');
  };
}

/* Nothing on this device should ever be lost quietly. While anything is
   still waiting to reach the database, say so on every screen — and if the
   database refused it, say what it said, because that never fixes itself. */
function paintUnsent(view) {
  const n = Outbox.count();
  if (!n) return;
  const problem = Outbox.problem();
  // Screens build themselves with innerHTML, so this goes in after them —
  // at the top, where it is read before anything else on the page.
  const box = document.createElement('div');
  box.className = 'banner' + (problem ? ' bad' : '');
  box.innerHTML = problem
    ? `<strong>${n} change${n > 1 ? 's have' : ' has'} not saved.</strong>
       The database refused them, so waiting will not help:
       <em>${esc(problem.message)}</em>
       <a href="#/settings" style="display:inline-block;margin-top:8px;font-weight:640">What to do →</a>`
    : `<strong>${n} change${n > 1 ? 's are' : ' is'} waiting to send.</strong>
       They are safe on this device and will go as soon as there is a connection.`;
  view.insertBefore(box, view.firstChild);
}
/* ================================================================
   Pieces of interface used on more than one screen
   ================================================================ */
/** A figure, its label, and the colour of the news. */
function figure(label, value, opts) {
  const o = opts || {};
  const cls = o.tone ? ' ' + o.tone : '';
  return `
    <div class="fig">
      <span class="n${cls}">${esc(value)}</span>
      <span class="l">${esc(label)}</span>
      ${o.note ? `<span class="s">${esc(o.note)}</span>` : ''}
    </div>`;
}

/** One line of a cost breakdown, as a money box. The empty box shows a dash
    rather than a nought, because that is what an empty one means. */
function costInput(prefix, line, map) {
  const v = map && hasMoney(map[line.key]) ? map[line.key] : '';
  return `
    <label class="numline">
      <span class="nl-label">${esc(line.label)}</span>
      <span class="nl-box">
        <em>$</em>
        <input type="number" inputmode="decimal" step="0.01"
               id="${prefix}_${line.key}" data-sum="${prefix}"
               value="${esc(v)}" placeholder="—">
      </span>
    </label>`;
}

/** Reads a breakdown back off the form. Boxes left empty stay out of the
    map entirely, so "not said" survives the round trip. */
function readCosts(prefix, root) {
  const map = {};
  COST_LINES.forEach(line => {
    const el = $('#' + prefix + '_' + line.key, root);
    const n = readMoney(el ? el.value : '');
    if (n != null) map[line.key] = n;
  });
  return map;
}

/** Keeps a running total under a breakdown as it is typed. */
function wireSum(prefix, root) {
  const out = $('#' + prefix + '_total', root);
  if (!out) return;
  const paint = () => {
    const map = readCosts(prefix, root);
    const t = sumCosts(map);
    out.textContent = t == null ? 'nothing entered yet' : fmtMoney(t);
    out.classList.toggle('muted', t == null);
  };
  $$(`[data-sum="${prefix}"]`, root).forEach(el => { el.oninput = paint; });
  paint();
}

function statusPill(key) {
  return `<span class="pill status-${statusTone(key)}"><span class="swatch"></span>${esc(statusLabel(key))}</span>`;
}

/** The tabs across the top of every screen that belongs to one job. */
function jobTabs(j, on) {
  return `
    <div class="seg">
      <a href="#/job/${j.id}" class="${on === 'job' ? 'on' : ''}">The job</a>
      <a href="#/costs/${j.id}" class="${on === 'costs' ? 'on' : ''}">Costs &amp; claim</a>
      <a href="#/edit/${j.id}" class="${on === 'edit' ? 'on' : ''}">Details</a>
    </div>`;
}

function notFound(view, what) {
  view.innerHTML = `
    <div class="empty"><b>${esc(what)} not found</b>It may have been deleted.</div>
    <a class="btn wide" href="#/">Back to the jobs</a>`;
}

/* ================================================================
   Screen — the jobs
   ================================================================ */
let boardFilter = 'all';
let boardSearch = '';

function matchesSearch(j, q) {
  if (!q) return true;
  const hay = [jobNo(j), j.name, j.client, j.site, j.reference, j.invoice_ref,
               typeLabel(typeOf(j))].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

/** The money line on a job card: what it made if that is known yet, and
    what it was priced to make if it isn't. */
function cardMoney(m) {
  if (m.profit != null) {
    return `
      <div class="cm">
        <span><em>Claimed</em>${fmtMoney(m.totalClaim)}</span>
        <span><em>Cost</em>${fmtMoney(m.totalCost)}</span>
        <span class="big ${toneOf(m.profit)}"><em>Made</em>${fmtSigned(m.profit)}${
          m.margin == null ? '' : ` <i>${fmtPct(m.margin, 0)}</i>`}</span>
      </div>`;
  }
  if (m.expProfit != null) {
    return `
      <div class="cm">
        <span><em>Priced</em>${fmtMoney(m.agreed)}</span>
        <span><em>Expected cost</em>${fmtMoney(m.ex)}</span>
        <span class="big ${toneOf(m.expProfit)}"><em>Should make</em>${fmtSigned(m.expProfit)}${
          m.expMargin == null ? '' : ` <i>${fmtPct(m.expMargin, 0)}</i>`}</span>
      </div>`;
  }
  const bits = [];
  if (m.agreed != null) bits.push(`<span><em>Priced</em>${fmtMoney(m.agreed)}</span>`);
  if (m.ex != null)     bits.push(`<span><em>Expected cost</em>${fmtMoney(m.ex)}</span>`);
  if (m.ac != null)     bits.push(`<span><em>Cost so far</em>${fmtMoney(m.ac + m.v.cost)}</span>`);
  return `<div class="cm">${bits.length ? bits.join('') : '<span class="none">No figures entered yet</span>'}</div>`;
}

function jobCard(j, i) {
  const m = jobMoney(j);
  const vs = m.v.all;
  return `
    <button class="job-card status-${statusTone(j.status)}" data-id="${j.id}" style="--i:${i}">
      <div class="row spread">
        <span class="num">${jobNo(j)}</span>
        ${statusPill(j.status)}
      </div>
      <div class="name">${esc(j.name)}</div>
      <div class="client">${esc(j.client || 'No client named')} · ${esc(typeLabel(typeOf(j)))}</div>
      ${cardMoney(m)}
      <div class="foot">
        ${j.site ? `<span class="tiny muted">${esc(j.site)}</span>` : ''}
        ${vs ? `<span class="tiny muted">${plural(vs, 'variation')}</span>` : ''}
        ${commentsFor(j.id).length ? `<span class="tiny muted">${plural(commentsFor(j.id).length, 'comment')}</span>` : ''}
      </div>
    </button>`;
}

function renderBoard(view) {
  const all = activeJobs();
  const counts = {
    all: all.length,
    quoted: all.filter(j => j.status === 'quoted').length,
    running: all.filter(j => j.status === 'running').length,
    completed: all.filter(j => j.status === 'completed').length
  };
  const shown = boardOrder(all
    .filter(j => boardFilter === 'all' || j.status === boardFilter)
    .filter(j => matchesSearch(j, boardSearch)));

  const t = totalsFor(shown);

  view.innerHTML = `
    ${all.length ? `
    <div class="card figures">
      ${figure('Claimed', fmtMoney(t.claim))}
      ${figure('Cost', fmtMoney(t.cost))}
      ${figure(t.counted === 1 ? 'Made on 1 job' : `Made on ${t.counted} jobs`,
               fmtSigned(t.profit), { tone: toneOf(t.profit),
               note: t.margin == null ? '' : fmtPct(t.margin) + ' margin' })}
      ${t.waiting ? `<p class="tiny muted figures-note">${
        plural(t.waiting, 'job')} left out — the actual cost or the claim hasn't been entered yet.</p>` : ''}
    </div>` : ''}

    <div class="filters">
      <button class="chip" data-f="all" aria-pressed="${boardFilter === 'all'}">All <b>${counts.all}</b></button>
      ${JOB_STATUS.map(s => `
        <button class="chip" data-f="${s.key}" aria-pressed="${boardFilter === s.key}">${esc(s.label)} <b>${counts[s.key]}</b></button>`).join('')}
    </div>

    <label class="search">
      <input type="search" id="q" value="${esc(boardSearch)}" placeholder="Search job, client, site or number" autocapitalize="off">
    </label>

    ${shown.length ? `<div class="job-grid">${shown.map(jobCard).join('')}</div>` : `
      <div class="empty">
        <b>${all.length ? 'Nothing matches' : 'No jobs yet'}</b>
        ${all.length ? 'Try a different search or filter.'
                     : 'Add the first job, price it, and the rest follows.'}
      </div>
      ${all.length ? '' : '<a class="btn primary wide" href="#/new">Add a job</a>'}`}`;

  $$('.chip', view).forEach(b => b.onclick = () => {
    boardFilter = b.dataset.f;
    render();
  });
  const q = $('#q', view);
  q.oninput = () => {
    boardSearch = q.value;
    const pos = q.selectionStart;
    render();
    const again = $('#q');
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
  };
  $$('.job-card', view).forEach(b => b.onclick = () => go('#/job/' + b.dataset.id));
}

/* ================================================================
   Screen — one job
   Everything known about what it was priced at, what it cost, what was
   claimed and what it made, on one page in that order.
   ================================================================ */
function renderJob(view, args) {
  const j = jobById(args[0]);
  if (!j) return notFound(view, 'Job');

  const m = jobMoney(j);
  const vars = varsFor(j.id);
  const comments = commentsFor(j.id);

  /* Only the lines somebody has put a number against — an empty row for a
     cost that was never going to apply is noise on the page. */
  const usedLines = COST_LINES.filter(l =>
    hasMoney((j.expected_costs || {})[l.key]) || hasMoney((j.actual_costs || {})[l.key]));

  view.innerHTML = `
    <div class="card accent status-${statusTone(j.status)}">
      <div class="row spread" style="align-items:flex-start">
        <div class="grow">
          <div class="tiny" style="color:var(--ink-3);letter-spacing:.04em;font-weight:700">${jobNo(j)}</div>
          <h2 style="font-size:19px;margin:2px 0 3px">${esc(j.name)}</h2>
          <div class="small muted">${esc(j.client || 'No client named')} · ${esc(typeLabel(typeOf(j)))}</div>
        </div>
        ${statusPill(j.status)}
      </div>
      <div class="factline">
        ${j.site ? `<span>${icon('pin')}${esc(j.site)}</span>` : ''}
        ${j.start_date || j.end_date ? `<span>${icon('calendar')}${
          j.start_date ? fmtShort(j.start_date) : '?'}${
          j.end_date && j.end_date !== j.start_date ? ' – ' + fmtDate(j.end_date) : ''}</span>` : ''}
        ${j.reference ? `<span>${icon('doc')}${esc(j.reference)}</span>` : ''}
      </div>
      <label class="field inline mt"><span>Status</span>
        <select id="st">
          ${JOB_STATUS.map(s => `<option value="${s.key}" ${j.status === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select></label>
    </div>

    ${jobTabs(j, 'job')}

    <div class="card">
      <h2>What it made</h2>
      <div class="figures">
        ${figure('Claimed', fmtMoney(m.totalClaim), { note: m.v.claim ? 'incl. variations' : '' })}
        ${figure('Cost', fmtMoney(m.totalCost), { note: m.v.cost ? 'incl. variations' : '' })}
        ${figure('Profit', fmtSigned(m.profit), { tone: toneOf(m.profit),
                 note: m.margin == null ? '' : fmtPct(m.margin) + ' margin' })}
      </div>
      ${m.profit == null ? `
        <p class="muted small mb0">${
          m.claimed == null && m.ac == null ? 'Nothing has been claimed or costed yet.'
          : m.claimed == null ? 'The claim to the client hasn\'t been entered yet.'
          : 'The actual cost hasn\'t been entered yet.'}
          <a href="#/costs/${j.id}">Enter it →</a></p>` : ''}
      ${m.expProfit != null ? `
        <div class="against">
          <span>Priced to make <b>${fmtMoney(m.expProfit)}</b>${
            m.expMargin == null ? '' : ` (${fmtPct(m.expMargin, 0)})`}</span>
          ${m.swing == null ? '' : `<span class="${toneOf(m.swing)}">${
            Math.abs(m.swing) < 0.005 ? 'exactly as priced'
              : fmtSigned(m.swing) + (m.swing > 0 ? ' better than priced' : ' worse than priced')}</span>`}
        </div>` : ''}
    </div>

    <div class="card">
      <div class="row spread mb">
        <h2 style="margin:0">Costs — expected against actual</h2>
        <a class="btn sm" href="#/costs/${j.id}">${icon('pencil')}Enter</a>
      </div>
      ${usedLines.length ? `
      <table class="data cost-table">
        <thead><tr><th>Line</th><th class="r">Expected</th><th class="r">Actual</th><th class="r">Over / under</th></tr></thead>
        <tbody>
          ${usedLines.map(l => {
            const vv = lineVariance(j, l.key);
            return `<tr>
              <td>${esc(l.label)}</td>
              <td class="r">${fmtMoney((j.expected_costs || {})[l.key])}</td>
              <td class="r">${fmtMoney((j.actual_costs || {})[l.key])}</td>
              <td class="r ${vv == null ? '' : toneOf(-vv)}">${vv == null ? '—' : fmtSigned(vv)}</td>
            </tr>`;
          }).join('')}
          <tr class="tot">
            <td>Base job</td>
            <td class="r">${fmtMoney(m.ex)}</td>
            <td class="r">${fmtMoney(m.ac)}</td>
            <td class="r ${m.ex == null || m.ac == null ? '' : toneOf(-(m.ac - m.ex))}">${
              m.ex == null || m.ac == null ? '—' : fmtSigned(m.ac - m.ex)}</td>
          </tr>
          ${m.v.cost ? `
          <tr><td>Variations</td><td class="r">—</td><td class="r">${fmtMoney(m.v.cost)}</td><td class="r">—</td></tr>
          <tr class="tot">
            <td>Everything</td>
            <td class="r">${fmtMoney(m.ex)}</td>
            <td class="r">${fmtMoney(m.totalCost)}</td>
            <td class="r ${m.costSwing == null ? '' : toneOf(-m.costSwing)}">${
              m.costSwing == null ? '—' : fmtSigned(m.costSwing)}</td>
          </tr>` : ''}
        </tbody>
      </table>
      <p class="tiny muted mb0 mt">Over / under is the actual against the estimate — red is money
        the job spent that it wasn't priced to spend.</p>
      ` : `<p class="muted small mb0">No costs entered yet.
        <a href="#/costs/${j.id}">Put the estimate in →</a></p>`}
    </div>

    <div class="card">
      <div class="row spread mb">
        <h2 style="margin:0">The claim</h2>
      </div>
      <table class="data kvtable">
        <tr><th>Agreed price</th><td class="r">${fmtMoney(m.agreed)}</td></tr>
        <tr><th>Claimed for the base job</th><td class="r">${fmtMoney(m.claimed)}</td></tr>
        <tr><th>Claimed for variations</th><td class="r">${m.v.n ? fmtMoney(m.v.claim) : '—'}</td></tr>
        <tr class="tot"><th>Total claimed</th><td class="r">${fmtMoney(m.totalClaim)}</td></tr>
        ${j.invoice_ref ? `<tr><th>Invoice</th><td class="r">${esc(j.invoice_ref)}</td></tr>` : ''}
        ${j.claimed_on ? `<tr><th>Claimed on</th><td class="r">${fmtDate(j.claimed_on)}</td></tr>` : ''}
      </table>
      ${m.agreed != null && m.claimed != null && Math.abs(m.claimed - m.agreed) > 0.005 ? `
        <p class="tiny muted mb0 mt">The base claim is ${fmtSigned(m.claimed - m.agreed)} against the
        agreed price. Variations are counted separately, below.</p>` : ''}
    </div>

    <div class="card">
      <div class="row spread mb">
        <h2 style="margin:0">Variations</h2>
        <a class="btn sm primary" href="#/variation/${j.id}">${icon('plus')}Add</a>
      </div>
      ${vars.length ? `
        <div class="vars">
          ${vars.map(v => {
            const s = varStatusDef(v.status);
            const cost = hasMoney(v.cost) ? Number(v.cost) : null;
            const claim = hasMoney(v.claim_value) ? Number(v.claim_value) : null;
            const p = (cost == null || claim == null) ? null : claim - cost;
            return `
              <button class="varrow status-${s.tone} ${v.status === 'declined' ? 'off' : ''}" data-id="${v.id}">
                <div class="row spread">
                  <span class="vno">${varNo(v)}</span>
                  <span class="pill"><span class="swatch"></span>${esc(s.label)}</span>
                </div>
                <div class="vt">${esc(v.title || 'Untitled variation')}</div>
                ${v.detail ? `<div class="vd">${esc(v.detail)}</div>` : ''}
                <div class="cm">
                  <span><em>Claimed</em>${fmtMoney(claim)}</span>
                  <span><em>Cost</em>${fmtMoney(cost)}</span>
                  ${v.status === 'declined'
                    ? '<span class="big out"><em>Made</em>not counted</span>'
                    : `<span class="big ${toneOf(p)}"><em>Made</em>${fmtSigned(p)}</span>`}
                </div>
              </button>`;
          }).join('')}
        </div>
        <div class="sumline">
          <span>${m.v.n === m.v.all ? plural(m.v.n, 'variation') : `${m.v.n} of ${m.v.all} counted`}
            · ${fmtMoney(m.v.claim)} claimed · ${fmtMoney(m.v.cost)} cost</span>
          <b class="${toneOf(m.v.profit)}">${fmtSigned(m.v.profit)}</b>
        </div>
        ${vars.some(v => v.status === 'declined') ? `
          <p class="tiny muted mb0 mt">Declined variations stay on the record and are left out of
          every total.</p>` : ''}
      ` : `<p class="muted small mb0">None on this job.</p>`}
    </div>

    <div class="card">
      <div class="row spread mb">
        <h2 style="margin:0">Comments</h2>
      </div>
      ${comments.length ? `
        <div class="comments">
          ${comments.map(c => `
            <div class="comment">
              <div class="chead">
                <b>${esc(c.author || 'Someone')}</b>
                <span>${fmtDateTime(c.at)}</span>
                <button class="linkbtn del" data-del="${c.id}" aria-label="Delete comment">${icon('trash')}</button>
              </div>
              <div class="cbody">${esc(c.body)}</div>
            </div>`).join('')}
        </div>` : '<p class="muted small">Nothing said about this job yet.</p>'}
      <label class="field mt"><span>Add a comment</span>
        <textarea id="cNew" placeholder="Why it came in where it did, what to price differently next time, what the client said."></textarea></label>
      <button class="btn primary wide" id="cAdd">${icon('chat')}Post comment</button>
    </div>

    <div class="card">
      <h2>This job on paper</h2>
      <p class="muted small">The whole costing on one sheet — the estimate against the actual,
        every variation, the claim, and what it made. Choose <em>Save as PDF</em> to email it.</p>
      <div class="btn-row">
        <button class="btn primary" id="print">${icon('printer')}Print the costing sheet</button>
        <button class="btn" id="del">${icon('trash')}Delete this job</button>
      </div>
    </div>`;

  /* Status is changed here because this is where it is noticed. */
  $('#st', view).onchange = async function () {
    const before = j.status;
    this.disabled = true;
    try {
      await Store.patch('jobs', j.id, { status: this.value });
      toast('Marked ' + statusLabel(this.value).toLowerCase());
      render();
    } catch (e) {
      this.value = before;
      this.disabled = false;
      toast('Could not save: ' + e.message);
    }
  };

  $$('.varrow', view).forEach(b => b.onclick = () => go('#/variation/' + j.id + '/' + b.dataset.id));

  $('#cAdd', view).onclick = async function () {
    const body = $('#cNew', view).value.trim();
    if (!body) return toast('Write something first');
    this.disabled = true;
    this.textContent = 'Posting…';
    try {
      await Store.insert('comments', {
        job_id: j.id, body, author: whoami(), at: new Date().toISOString()
      });
      render();
    } catch (e) {
      this.disabled = false;
      this.textContent = 'Post comment';
      toast('Could not post: ' + e.message);
    }
  };

  $$('[data-del]', view).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (!confirm('Delete this comment? It cannot be brought back.')) return;
    try {
      await Store.remove('comments', b.dataset.del);
      render();
    } catch (err) { toast('Could not delete: ' + err.message); }
  });

  $('#print', view).onclick = () => printJobSheet(j);

  $('#del', view).onclick = async () => {
    if (!confirm(`Delete ${jobNo(j)} — ${j.name}?\n\nIts variations and comments go with it. ` +
                 'This cannot be undone.')) return;
    if (!confirm('Really delete it? Print the costing sheet first if you want a copy.')) return;
    try {
      // The database removes the job's variations and comments with it;
      // the copy on this device has to be told.
      varsFor(j.id).forEach(v => drop('variations', v.id));
      commentsFor(j.id).forEach(c => drop('comments', c.id));
      await Store.remove('jobs', j.id);
      toast('Deleted');
      go('#/');
    } catch (e) { toast('Could not delete: ' + e.message); }
  };
}

/* ================================================================
   Screen — the job's details
   Everything except the money, which has a screen of its own.
   ================================================================ */
function renderJobEdit(view, args) {
  const editing = args[0] ? jobById(args[0]) : null;
  if (args[0] && !editing) return notFound(view, 'Job');
  $('#title').textContent = editing ? 'Job details' : 'New job';

  const j = editing || {};
  const keys = allTypeKeys();
  const cur = editing ? typeOf(editing) : 'milling';
  const clients = Array.from(new Set(DB.jobs.map(x => (x.client || '').trim()).filter(Boolean))).sort();

  view.innerHTML = `
    ${editing ? jobTabs(editing, 'edit') : ''}
    <div class="card">
      <label class="field"><span>Job name</span>
        <input type="text" id="name" value="${esc(j.name || '')}" placeholder="e.g. Great South Rd resurfacing" maxlength="140"></label>

      <label class="field"><span>Client</span>
        <input type="text" id="client" value="${esc(j.client || '')}" placeholder="e.g. Auckland Transport" list="clients">
        <datalist id="clients">${clients.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>

      <label class="field"><span>Site</span>
        <input type="text" id="site" value="${esc(j.site || '')}" placeholder="Address, or the stretch of road"></label>

      <label class="field"><span>Type of work</span>
        <select id="type">
          ${keys.map(k => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(typeLabel(k))}</option>`).join('')}
          <option value="__new">+ Add a new type…</option>
        </select></label>

      <label class="field"><span>Client order or contract number <span class="muted">(optional)</span></span>
        <input type="text" id="ref" value="${esc(j.reference || '')}" placeholder="e.g. PO 44821"></label>

      <label class="field"><span>What the job is</span>
        <textarea id="desc" placeholder="A sentence or two — enough that the figures below make sense in a year.">${esc(j.description || '')}</textarea></label>
    </div>

    <div class="card">
      <h2>When</h2>
      <div class="row">
        <label class="field grow"><span>First day on site</span>
          <input type="date" id="start" value="${esc(j.start_date || '')}"></label>
        <label class="field grow"><span>Last day</span>
          <input type="date" id="end" value="${esc(j.end_date || '')}"></label>
      </div>
      <label class="field mb0"><span>Status</span>
        <select id="status">
          ${JOB_STATUS.map(s => `<option value="${s.key}" ${(j.status || 'quoted') === s.key ? 'selected' : ''}>${esc(s.label)} — ${esc(s.blurb)}</option>`).join('')}
        </select></label>
    </div>

    <button class="btn primary wide" id="save">${editing ? 'Save details' : 'Create the job'}</button>
    ${editing ? '' : '<p class="muted small center mt">The costs and the claim go in next.</p>'}`;

  // "+ Add a new type…" becomes a real type the moment it is named.
  const typeSel = $('#type', view);
  typeSel.onchange = () => {
    if (typeSel.value !== '__new') return;
    const name = (prompt('Name the type of work, e.g. "Chip seal"') || '').trim();
    if (!name) { typeSel.value = cur; return; }
    const key = matchType(name);
    if (!Array.from(typeSel.options).some(o => o.value === key)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = typeLabel(key);
      typeSel.insertBefore(opt, typeSel.lastElementChild);
    }
    typeSel.value = key;
  };

  $('#save', view).onclick = async function () {
    const name = $('#name', view).value.trim();
    if (!name) return toast('Give the job a name');
    if (typeSel.value === '__new') return toast('Pick the type of work');

    const start = $('#start', view).value || null;
    const end = $('#end', view).value || null;
    if (start && end && end < start) return toast('The last day is before the first day');

    const data = {
      name,
      client: $('#client', view).value.trim(),
      site: $('#site', view).value.trim(),
      work_type: typeSel.value,
      reference: $('#ref', view).value.trim(),
      description: $('#desc', view).value.trim(),
      start_date: start,
      end_date: end,
      status: $('#status', view).value
    };

    this.disabled = true;
    this.textContent = 'Saving…';
    try {
      if (editing) {
        await Store.patch('jobs', editing.id, data);
        toast('Saved');
        go('#/job/' + editing.id);
      } else {
        const saved = await Store.insert('jobs', Object.assign({ created_by: whoami() }, data));
        toast(connected() ? 'Job created — now price it' : 'Saved on this device');
        go('#/costs/' + saved.id);
      }
    } catch (e) {
      this.disabled = false;
      this.textContent = editing ? 'Save details' : 'Create the job';
      toast('Could not save: ' + e.message);
    }
  };
}

/* ================================================================
   Screen — costs and claim
   The four sets of numbers the whole app is built on, in the order they
   become known: the price, the estimate, what it really cost, what was
   claimed.
   ================================================================ */
function renderCosts(view, args) {
  const j = jobById(args[0]);
  if (!j) return notFound(view, 'Job');

  view.innerHTML = `
    ${jobTabs(j, 'costs')}

    <p class="muted small mb">Every figure here excludes GST. Leave a box empty until somebody
      knows the number — an empty box means <em>not known yet</em>, and is never counted as zero.</p>

    <div class="card">
      <h2>The price</h2>
      <label class="field mb0"><span>Agreed price for the job</span>
        <span class="nl-box wide">
          <em>$</em>
          <input type="number" id="agreed" inputmode="decimal" step="0.01"
                 value="${esc(hasMoney(j.contract_value) ? j.contract_value : '')}" placeholder="e.g. 84000">
        </span></label>
    </div>

    <div class="card">
      <h2>Expected costs</h2>
      <p class="muted small">What the job was priced to cost, before anyone turned a wheel.</p>
      ${COST_LINES.map(l => costInput('ex', l, j.expected_costs || {})).join('')}
      <div class="sumline"><span>Expected cost</span><b id="ex_total">—</b></div>
    </div>

    <div class="card">
      <h2>Actual costs</h2>
      <p class="muted small">What it really cost, once the invoices and the timesheets are in.
        Variations are costed separately, further down the job page.</p>
      ${COST_LINES.map(l => costInput('ac', l, j.actual_costs || {})).join('')}
      <div class="sumline"><span>Actual cost</span><b id="ac_total">—</b></div>
    </div>

    <div class="card">
      <h2>The claim</h2>
      <p class="muted small">What was actually claimed from the client for the base job. What was
        claimed for variations is entered on each variation, and added to this.</p>
      <label class="field"><span>Claimed for the base job</span>
        <span class="nl-box wide">
          <em>$</em>
          <input type="number" id="claim" inputmode="decimal" step="0.01"
                 value="${esc(hasMoney(j.claim_value) ? j.claim_value : '')}" placeholder="e.g. 84000">
        </span></label>
      <div class="row">
        <label class="field grow"><span>Invoice number <span class="muted">(optional)</span></span>
          <input type="text" id="inv" value="${esc(j.invoice_ref || '')}" placeholder="e.g. INV-1042"></label>
        <label class="field grow"><span>Claimed on</span>
          <input type="date" id="claimed" value="${esc(j.claimed_on || '')}"></label>
      </div>
      <p class="tiny muted mb0">The claim date is what the reports count a job under, so a job
        claimed in April lands in the right month however long it ran.</p>
    </div>

    <button class="btn primary wide" id="save">Save the figures</button>
    <a class="btn wide mt" href="#/job/${j.id}">Back to the job</a>`;

  wireSum('ex', view);
  wireSum('ac', view);

  $('#save', view).onclick = async function () {
    const data = {
      contract_value: readMoney($('#agreed', view).value),
      expected_costs: readCosts('ex', view),
      actual_costs: readCosts('ac', view),
      claim_value: readMoney($('#claim', view).value),
      invoice_ref: $('#inv', view).value.trim(),
      claimed_on: $('#claimed', view).value || null
    };
    this.disabled = true;
    this.textContent = 'Saving…';
    try {
      await Store.patch('jobs', j.id, data);
      toast('Saved');
      go('#/job/' + j.id);
    } catch (e) {
      this.disabled = false;
      this.textContent = 'Save the figures';
      toast('Could not save: ' + e.message);
    }
  };
}

/* ================================================================
   Screen — a variation
   Work outside the agreed price: what it cost us, and what was claimed
   for it. Those two numbers are the whole point of the screen.
   ================================================================ */
function renderVariation(view, args) {
  const j = jobById(args[0]);
  if (!j) return notFound(view, 'Job');
  const editing = args[1] ? varById(args[1]) : null;
  if (args[1] && !editing) return notFound(view, 'Variation');

  const v = editing || {};
  $('#title').textContent = editing ? varNo(editing) : 'New variation';

  view.innerHTML = `
    <div class="card accent status-${statusTone(j.status)}">
      <div class="tiny" style="color:var(--ink-3);letter-spacing:.04em;font-weight:700">${jobNo(j)}</div>
      <h2 style="font-size:17px;margin:2px 0 0">${esc(j.name)}</h2>
    </div>

    <div class="card">
      <label class="field"><span>What the variation is</span>
        <input type="text" id="vt" value="${esc(v.title || '')}" maxlength="140"
               placeholder="e.g. Extra 120m² of dig-out at the entrance"></label>

      <label class="field"><span>Detail <span class="muted">(optional)</span></span>
        <textarea id="vd" placeholder="Who asked for it, when it was agreed, anything worth remembering.">${esc(v.detail || '')}</textarea></label>

      <div class="row">
        <label class="field grow"><span>Dated</span>
          <input type="date" id="vdate" value="${esc(v.dated || today())}"></label>
        <label class="field grow"><span>Status</span>
          <select id="vs">
            ${VARIATION_STATUS.map(s => `<option value="${s.key}" ${(v.status || 'approved') === s.key ? 'selected' : ''}>${esc(s.label)} — ${esc(s.blurb)}</option>`).join('')}
          </select></label>
      </div>
    </div>

    <div class="card">
      <h2>The money</h2>
      <label class="field"><span>What it cost us</span>
        <span class="nl-box wide"><em>$</em>
          <input type="number" id="vc" inputmode="decimal" step="0.01"
                 value="${esc(hasMoney(v.cost) ? v.cost : '')}" placeholder="e.g. 3400"></span></label>
      <label class="field mb0"><span>What was claimed for it</span>
        <span class="nl-box wide"><em>$</em>
          <input type="number" id="vk" inputmode="decimal" step="0.01"
                 value="${esc(hasMoney(v.claim_value) ? v.claim_value : '')}" placeholder="e.g. 4600"></span></label>
      <div class="sumline"><span>Made on this variation</span><b id="vp">—</b></div>
    </div>

    <button class="btn primary wide" id="save">${editing ? 'Save the variation' : 'Add the variation'}</button>
    ${editing ? `<button class="btn wide mt" id="del">${icon('trash')}Delete this variation</button>` : ''}
    <a class="btn wide mt" href="#/job/${j.id}">Back to the job</a>`;

  /* The profit on the variation, kept live as the two boxes are typed. */
  const paint = () => {
    const cost = readMoney($('#vc', view).value);
    const claim = readMoney($('#vk', view).value);
    const out = $('#vp', view);
    const p = (cost == null || claim == null) ? null : claim - cost;
    out.textContent = p == null ? 'both boxes needed' : fmtSigned(p);
    out.className = p == null ? 'muted' : toneOf(p);
  };
  $('#vc', view).oninput = paint;
  $('#vk', view).oninput = paint;
  paint();

  $('#save', view).onclick = async function () {
    const title = $('#vt', view).value.trim();
    if (!title) return toast('Say what the variation is');
    const data = {
      title,
      detail: $('#vd', view).value.trim(),
      status: $('#vs', view).value,
      cost: readMoney($('#vc', view).value),
      claim_value: readMoney($('#vk', view).value),
      dated: $('#vdate', view).value || null
    };
    this.disabled = true;
    this.textContent = 'Saving…';
    try {
      if (editing) {
        await Store.patch('variations', editing.id, data);
      } else {
        await Store.insert('variations', Object.assign({ job_id: j.id, created_by: whoami() }, data));
      }
      toast('Saved');
      go('#/job/' + j.id);
    } catch (e) {
      this.disabled = false;
      this.textContent = editing ? 'Save the variation' : 'Add the variation';
      toast('Could not save: ' + e.message);
    }
  };

  const del = $('#del', view);
  if (del) del.onclick = async () => {
    if (!confirm('Delete this variation? If the client turned it down, set it to Declined ' +
                 'instead — that keeps it on the record and out of the totals.')) return;
    try {
      await Store.remove('variations', editing.id);
      toast('Deleted');
      go('#/job/' + j.id);
    } catch (e) { toast('Could not delete: ' + e.message); }
  };
}

/* ================================================================
   Screen — reports
   The question a director actually asks: over this period, what did we
   claim, what did it cost, and what did we make.
   ================================================================ */
let repPeriod = 'fy';
let repFrom = '';
let repTo = '';

function reportRange() {
  if (repPeriod === 'all') return ['', ''];
  if (repPeriod === 'custom') return [repFrom, repTo];
  return periodRange(repPeriod);
}
function reportJobs() {
  const [from, to] = reportRange();
  return boardOrder(activeJobs().filter(j => jobInPeriod(j, from, to)));
}

function renderReports(view) {
  const [from, to] = reportRange();
  const list = reportJobs();
  const t = totalsFor(list);
  const done = list.filter(j => jobMoney(j).profit != null);
  const best = done.slice().sort((a, b) => jobMoney(b).profit - jobMoney(a).profit)[0];
  const worst = done.slice().sort((a, b) => jobMoney(a).profit - jobMoney(b).profit)[0];

  view.innerHTML = `
    <div class="card">
      <label class="field ${repPeriod === 'custom' ? '' : 'mb0'}"><span>Period</span>
        <select id="per">
          ${PERIODS.map(p => `<option value="${p.key}" ${repPeriod === p.key ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
        </select></label>
      ${repPeriod === 'custom' ? `
        <div class="row">
          <label class="field grow mb0"><span>From</span><input type="date" id="rf" value="${esc(repFrom)}"></label>
          <label class="field grow mb0"><span>To</span><input type="date" id="rt" value="${esc(repTo)}"></label>
        </div>` : ''}
      <p class="tiny muted mt mb0">A job counts in the period it was claimed in, or if it hasn't been
        claimed, the period it was last on site.</p>
    </div>

    <div class="card">
      <h2>${esc(periodLabel(repPeriod, from, to))}</h2>
      <div class="figures">
        ${figure('Claimed', fmtMoney(t.claim))}
        ${figure('Cost', fmtMoney(t.cost))}
        ${figure('Profit', fmtSigned(t.profit), { tone: toneOf(t.profit),
                 note: t.margin == null ? '' : fmtPct(t.margin) + ' margin' })}
      </div>
      <table class="data kvtable mt">
        <tr><th>Jobs in the period</th><td class="r">${t.jobs}</td></tr>
        <tr><th>Counted in the figures</th><td class="r">${t.counted}</td></tr>
        ${t.waiting ? `<tr><th>Still waiting on a cost or a claim</th><td class="r">${t.waiting}</td></tr>` : ''}
        ${t.expProfit != null ? `<tr><th>Priced to make${t.expCounted !== t.jobs ? ` (${t.expCounted} of ${t.jobs} priced)` : ''}</th>
          <td class="r">${fmtMoney(t.expProfit)}</td></tr>` : ''}
      </table>
      ${t.waiting ? `<p class="tiny muted mb0 mt">A job joins the figures once both its actual cost
        and its claim are in. Until then it is listed below but left out of the totals, because a
        half-costed job makes a total that reads worse than no total at all.</p>` : ''}
    </div>

    ${done.length > 1 ? `
    <div class="card">
      <h2>The ends of the range</h2>
      <table class="data kvtable">
        <tr><th>Best job</th><td class="r"><a href="#/job/${best.id}">${esc(best.name)}</a>
          <b class="${toneOf(jobMoney(best).profit)}">${fmtSigned(jobMoney(best).profit)}</b></td></tr>
        <tr><th>Worst job</th><td class="r"><a href="#/job/${worst.id}">${esc(worst.name)}</a>
          <b class="${toneOf(jobMoney(worst).profit)}">${fmtSigned(jobMoney(worst).profit)}</b></td></tr>
      </table>
    </div>` : ''}

    <div class="card">
      <h2>Every job in the period</h2>
      ${list.length ? `
      <div class="scroller">
      <table class="data joblist">
        <thead><tr><th>Job</th><th class="r">Claimed</th><th class="r">Cost</th><th class="r">Made</th><th class="r">Margin</th></tr></thead>
        <tbody>
          ${list.map(j => {
            const m = jobMoney(j);
            return `<tr data-id="${j.id}">
              <td><b>${esc(j.name)}</b><span class="sub">${jobNo(j)} · ${esc(j.client || 'no client')} · ${esc(statusLabel(j.status))}</span></td>
              <td class="r">${fmtMoney(m.totalClaim)}</td>
              <td class="r">${fmtMoney(m.totalCost)}</td>
              <td class="r ${toneOf(m.profit)}">${fmtSigned(m.profit)}</td>
              <td class="r">${fmtPct(m.margin, 0)}</td>
            </tr>`;
          }).join('')}
          <tr class="tot">
            <td>${plural(t.counted, 'job')} counted</td>
            <td class="r">${fmtMoney(t.claim)}</td>
            <td class="r">${fmtMoney(t.cost)}</td>
            <td class="r ${toneOf(t.profit)}">${fmtSigned(t.profit)}</td>
            <td class="r">${fmtPct(t.margin, 0)}</td>
          </tr>
        </tbody>
      </table>
      </div>` : '<p class="muted small mb0">No jobs in this period.</p>'}
    </div>

    <div class="card">
      <h2>Take it away</h2>
      <div class="btn-row">
        <button class="btn primary" id="pSum">${icon('printer')}Print the summary</button>
        <button class="btn" id="cJobs">${icon('download')}Jobs as CSV</button>
        <button class="btn" id="cVars">${icon('download')}Variations as CSV</button>
      </div>
      <p class="tiny muted mt mb0">The CSV opens in Excel. It holds every cost line, so the numbers
        can be pivoted any way the accountant likes.</p>
    </div>`;

  $('#per', view).onchange = function () {
    repPeriod = this.value;
    if (repPeriod === 'custom' && !repFrom && !repTo) {
      const [f, t2] = periodRange('fy');
      repFrom = f; repTo = t2;
    }
    render();
  };
  const rf = $('#rf', view); if (rf) rf.onchange = () => { repFrom = rf.value; render(); };
  const rt = $('#rt', view); if (rt) rt.onchange = () => { repTo = rt.value; render(); };

  $$('.joblist tbody tr[data-id]', view).forEach(tr => {
    tr.style.cursor = 'pointer';
    tr.onclick = () => go('#/job/' + tr.dataset.id);
  });

  $('#pSum', view).onclick = () => printSummary(list, from, to);
  $('#cJobs', view).onclick = () => exportJobsCsv(list);
  $('#cVars', view).onclick = () => exportVarsCsv(list);
}

/* ================================================================
   Screen — settings
   ================================================================ */
function renderSettings(view) {
  view.innerHTML = `
    <div class="card">
      <h2>You</h2>
      <p class="muted small">Your name goes on the comments you write and on the sheets you print.</p>
      <label class="field"><span>Your name</span>
        <input type="text" id="sName" value="${esc(S.name)}" placeholder="e.g. Shyamal"></label>
      <button class="btn primary wide" id="saveMe">Save</button>
    </div>

    <div class="card">
      <h2>Where the figures are kept</h2>
      <p class="muted small">Two values from Supabase → Settings → API. Both devices that enter the
        same two see the same jobs. Leave them blank and use <strong>this device only</strong> below
        instead — the app works either way.</p>
      <label class="field"><span>Project URL</span>
        <input type="text" id="sUrl" value="${esc(S.supabaseUrl)}" placeholder="https://xxxx.supabase.co" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>Anon public key</span>
        <input type="text" id="sKey" value="${esc(S.supabaseKey)}" placeholder="eyJhbGciOi…" autocapitalize="off" spellcheck="false"></label>
      <div class="btn-row">
        <button class="btn" id="test">Test connection</button>
        <button class="btn primary" id="saveDb">Save &amp; connect</button>
      </div>
      <div id="testOut" class="small mt"></div>
    </div>

    ${connected() ? `
    <div class="card">
      <h2>Set up the other device</h2>
      <p class="muted small">Send this link to the director. One tap connects their phone —
        they never type the key. Treat it like a key: it opens the figures for anyone who has it.</p>
      <label class="field"><span>Setup link</span>
        <input type="text" id="sLink" value="${esc(setupLink())}" readonly onclick="this.select()"></label>
      <div class="btn-row">
        <button class="btn primary" id="shareLink">Share link</button>
        <button class="btn" id="copyLink">Copy link</button>
      </div>
    </div>` : ''}

    <div class="card">
      <h2>Use it without a database</h2>
      <p class="muted small">Everything works, but the figures stay on this device only —
        nothing is shared and nothing is backed up anywhere. Fine if you are the only one
        entering jobs and you print the sheets to PDF.</p>
      <label class="field"><span>Mode</span>
        <select id="sLocal">
          <option value="0" ${!S.localMode ? 'selected' : ''}>Shared (Supabase)</option>
          <option value="1" ${S.localMode ? 'selected' : ''}>This device only</option>
        </select></label>
      <button class="btn wide" id="saveMode">Switch mode</button>
      ${S.localMode ? `<p class="tiny muted mt mb0">Take a backup now and then — the button is
        further down. It is the only copy there is.</p>` : ''}
    </div>

    ${Outbox.count() ? `
    <div class="card">
      <h2>${Outbox.count()} change${Outbox.count() > 1 ? 's' : ''} waiting to send</h2>
      ${Outbox.problem() ? `
        <div class="banner bad">The database refused them, so they will not go on their own.
          <em>${esc(Outbox.problem().message)}</em></div>
        ${/column|schema cache|PGRST204/i.test(Outbox.problem().message) ? `
          <p class="muted small"><strong>This one has a known cause.</strong> The database was set up
          from an older copy of <code>supabase-schema.sql</code> and is missing a column the app now
          sends. Open Supabase → SQL Editor, paste the current <code>supabase-schema.sql</code> and
          press Run — it is safe over a live database and adds what is missing. Then come back here
          and press <strong>Try again</strong>. Nothing is lost in the meantime.</p>` : ''}
      ` : '<p class="muted small">They are safe on this device and go as soon as there is a connection.</p>'}
      <div class="btn-row">
        <button class="btn primary" id="retry">Try again now</button>
        <button class="btn" id="backup">${icon('download')}Download a backup</button>
      </div>
    </div>` : ''}

    <div class="card">
      <h2>Status</h2>
      <table class="data kvtable">
        <tr><th>Figures kept</th><td class="r">${S.localMode ? 'On this device only'
          : connected() ? 'Shared database' : 'Not set up'}</td></tr>
        <tr><th>Jobs</th><td class="r">${DB.jobs.length}</td></tr>
        <tr><th>Variations</th><td class="r">${DB.variations.length}</td></tr>
        <tr><th>Comments</th><td class="r">${DB.comments.length}</td></tr>
        <tr><th>Waiting to send</th><td class="r">${Outbox.count()}</td></tr>
        <tr><th>Version</th><td class="r">${VERSION}${updateReady
          ? ' — <strong>an update is ready, close and reopen the app</strong>' : ''}</td></tr>
      </table>
      <div class="btn-row mt">
        <button class="btn sm" id="refresh">Refresh now</button>
        <button class="btn sm" id="backupAll">Download a backup</button>
        <button class="btn sm" id="clear">Clear this device</button>
      </div>
      <p class="tiny muted mt mb0">The backup is one file holding every job, variation and comment
        this device knows about — for the accountant, or for peace of mind.</p>
    </div>`;

  $('#saveMe', view).onclick = () => {
    const name = $('#sName', view).value.trim();
    if (!name) return toast('Enter your name');
    Settings.write({ name });
    toast('Saved');
    render();
  };

  $('#test', view).onclick = async function () {
    const out = $('#testOut', view);
    const url = $('#sUrl', view).value.trim().replace(/\/+$/, '');
    const key = $('#sKey', view).value.trim();
    if (!url || !key) { out.textContent = 'Fill in both fields first.'; return; }
    out.textContent = 'Checking…';
    try {
      const res = await fetch(`${url}/rest/v1/cost_jobs?select=id&limit=1`, {
        headers: { apikey: key, Authorization: 'Bearer ' + key }
      });
      if (res.ok) out.innerHTML = '<span style="color:var(--green)">Connected. The database is ready.</span>';
      else if (res.status === 404) out.innerHTML = '<span style="color:var(--red)">Reached Supabase, but the tables are missing. Run supabase-schema.sql first.</span>';
      else out.innerHTML = `<span style="color:var(--red)">Supabase said ${res.status}. Check the key is the <em>anon public</em> one.</span>`;
    } catch (e) {
      out.innerHTML = '<span style="color:var(--red)">Could not reach that URL.</span>';
    }
  };

  $('#saveDb', view).onclick = async () => {
    Settings.write({
      supabaseUrl: $('#sUrl', view).value.trim().replace(/\/+$/, ''),
      supabaseKey: $('#sKey', view).value.trim(),
      localMode: false
    });
    loadCache();
    await refresh();
    toast('Connected');
    render();
  };

  const share = $('#shareLink', view);
  if (share) {
    const link = setupLink();
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast('Link copied — paste it into a text or email');
      } catch (e) {
        $('#sLink', view).select();
        toast('Press and hold the link above to copy it');
      }
    };
    share.onclick = async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: 'RCK Costing setup', text: 'Tap this to set up RCK Costing', url: link });
          return;
        } catch (e) { /* cancelled, or not allowed — fall back to copying */ }
      }
      copy();
    };
    $('#copyLink', view).onclick = copy;
  }

  $('#saveMode', view).onclick = async () => {
    Settings.write({ localMode: $('#sLocal', view).value === '1' });
    loadCache();
    await refresh();
    render();
  };

  /* Everything this device holds, in one file. The last resort that means
     no amount of going wrong can put the work beyond reach. */
  function downloadBackup() {
    const dump = {
      app: 'RCK Costing', version: VERSION, taken: new Date().toISOString(),
      device: { name: S.name, localMode: S.localMode },
      waitingToSend: Outbox.all(),
      problem: Outbox.problem(),
      jobs: DB.jobs, variations: DB.variations, comments: DB.comments
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    saveAs(URL.createObjectURL(blob), `rck-costing-backup-${today()}.json`);
    toast('Backup saved');
  }

  const retry = $('#retry', view);
  if (retry) retry.onclick = async function () {
    this.disabled = true;
    this.textContent = 'Sending…';
    await Outbox.flush();
    await refresh();
    const left = Outbox.count();
    toast(left ? `${left} still waiting — see the message above` : 'All sent');
    render();
  };
  const b1 = $('#backup', view);    if (b1) b1.onclick = downloadBackup;
  const b2 = $('#backupAll', view); if (b2) b2.onclick = downloadBackup;

  $('#refresh', view).onclick = async () => { await refresh(); toast('Up to date'); render(); };

  $('#clear', view).onclick = () => {
    const waiting = Outbox.count();
    if (waiting) {
      // This is the one button that can destroy work. Make it take a backup first.
      if (!confirm(`${waiting} change(s) have not reached the database yet.\n\n` +
                   'Clearing now would destroy them for good. A backup file will be saved first.')) return;
      downloadBackup();
      if (!confirm('Backup saved. Clear this device now?')) return;
    } else if (!confirm(S.localMode
      ? 'This device holds the only copy of these figures. Clearing wipes them for good. Carry on?'
      : 'Clear the copy held on this device? The shared database is not touched.')) {
      return;
    }
    localStorage.removeItem(cacheKey());
    localStorage.removeItem('rckc.outbox');
    localStorage.removeItem('rckc.outbox.problem');
    DB.jobs = []; DB.variations = []; DB.comments = []; DB.localSeq = 0;
    refresh().then(render);
  };
}

/** Save a file without navigating the app away to it. */
function saveAs(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(href); } catch (e) {} }, 20000);
}
/* ================================================================
   CSV — the same figures, for a spreadsheet
   ================================================================ */
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv(name, rows) {
  // The BOM is what makes Excel open a file full of $ and macrons correctly.
  const body = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  saveAs(URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' })), name);
  toast('Saved');
}

function exportJobsCsv(list) {
  const head = ['Job', 'Name', 'Client', 'Site', 'Type', 'Status', 'First day', 'Last day', 'Reference']
    .concat(COST_LINES.map(l => 'Expected ' + l.label))
    .concat(['Expected cost'])
    .concat(COST_LINES.map(l => 'Actual ' + l.label))
    .concat(['Actual cost', 'Agreed price', 'Base claim', 'Variation cost', 'Variation claim',
             'Total claimed', 'Total cost', 'Profit', 'Margin %', 'Invoice', 'Claimed on']);

  const rows = [head];
  list.forEach(j => {
    const m = jobMoney(j);
    const ex = j.expected_costs || {}, ac = j.actual_costs || {};
    rows.push([jobNo(j), j.name, j.client, j.site, typeLabel(typeOf(j)), statusLabel(j.status),
               j.start_date || '', j.end_date || '', j.reference || '']
      .concat(COST_LINES.map(l => hasMoney(ex[l.key]) ? ex[l.key] : ''))
      .concat([m.ex == null ? '' : m.ex])
      .concat(COST_LINES.map(l => hasMoney(ac[l.key]) ? ac[l.key] : ''))
      .concat([m.ac == null ? '' : m.ac,
               m.agreed == null ? '' : m.agreed,
               m.claimed == null ? '' : m.claimed,
               m.v.cost, m.v.claim,
               m.totalClaim == null ? '' : m.totalClaim,
               m.totalCost == null ? '' : m.totalCost,
               m.profit == null ? '' : m.profit,
               m.margin == null ? '' : m.margin.toFixed(1),
               j.invoice_ref || '', j.claimed_on || '']));
  });
  downloadCsv(`rck-costing-jobs-${today()}.csv`, rows);
}

function exportVarsCsv(list) {
  const rows = [['Job', 'Job name', 'Variation', 'What it is', 'Status', 'Dated',
                 'Cost', 'Claimed', 'Made', 'Detail']];
  list.forEach(j => varsFor(j.id).forEach(v => {
    const cost = hasMoney(v.cost) ? Number(v.cost) : null;
    const claim = hasMoney(v.claim_value) ? Number(v.claim_value) : null;
    rows.push([jobNo(j), j.name, varNo(v), v.title, varStatusDef(v.status).label, v.dated || '',
               cost == null ? '' : cost, claim == null ? '' : claim,
               (cost == null || claim == null) ? '' : claim - cost, v.detail || '']);
  }));
  if (rows.length === 1) return toast('No variations in this period');
  downloadCsv(`rck-costing-variations-${today()}.csv`, rows);
}

/* ================================================================
   Printable documents
   ================================================================ */
/* Who the document is from. Taken from the letterhead on an RCK quote, and
   kept here so it changes in one place when a number does. */
const BRAND = Object.assign({
  name:  'RCK NZ',
  trade: 'Asphalt & Civil Contracting',
  email: 'office@rcknz.co.nz',
  phone: ''
}, SITE.brand || {});

/* The mark from the app icon, drawn inline so it needs no network and
   prints at any size: three columns, the last one paid. */
const MARK = `
  <svg class="mark" viewBox="0 0 512 512" aria-hidden="true">
    <rect width="512" height="512" rx="112" fill="#1b1e22"/>
    <rect x="118" y="276" width="68" height="120" rx="26" fill="#4c525a"/>
    <rect x="222" y="210" width="68" height="186" rx="26" fill="#4c525a"/>
    <rect x="326" y="134" width="68" height="262" rx="26" fill="#c8971b"/>
  </svg>`;

/** The letterhead: who we are on the left, what this is on the right. */
function docHead(kind, title, subtitle) {
  const contact = [BRAND.email, BRAND.phone].filter(Boolean).join(' · ');
  return `
    <div class="doc-head">
      <div class="top">
        ${MARK}
        <div>
          <div class="org">${esc(BRAND.name)}</div>
          <div class="trade">${esc(BRAND.trade)}</div>
          ${contact ? `<div class="contact">${esc(contact)}</div>` : ''}
        </div>
        <div class="meta">
          <div class="kind">${esc(kind)}</div>
          <div class="when">${fmtDate(new Date().toISOString())}<br>Prepared by ${esc(whoami())}</div>
        </div>
      </div>
      <h1>${esc(title)}</h1>
      ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
      <div class="rule"></div>
    </div>`;
}

/** Render it, then print.
    The sheet is a table because a browser will repeat a thead on every
    printed page and will not repeat anything else — that is what puts the
    RCK line at the top of page two. */
function printDoc(html, running) {
  $('#printArea').innerHTML = `
    <div class="doc">
      <table class="sheet">
        <thead><tr><td>
          <div class="brandbar"><b>${esc(BRAND.name)}</b> ${esc(BRAND.trade)}
            <span class="right">${esc(running || '')}</span></div>
        </td></tr></thead>
        <tbody><tr><td>${html}</td></tr></tbody>
      </table>
    </div>`;
  setTimeout(() => window.print(), 80);
}

/** A money cell that carries its own colour when the number is the point. */
function pcell(v) {
  if (!hasMoney(v)) return '<td class="r">—</td>';
  const cls = Number(v) > 0 ? 'pos' : Number(v) < 0 ? 'neg' : '';
  return `<td class="r ${cls}">${fmtSigned(v, true)}</td>`;
}

/** One job's whole costing on one sheet: the estimate against the actual,
    every variation, the claim, what it made, and what was said about it. */
function printJobSheet(j) {
  const m = jobMoney(j);
  const vars = varsFor(j.id);
  const comments = commentsFor(j.id);
  const lines = COST_LINES.filter(l =>
    hasMoney((j.expected_costs || {})[l.key]) || hasMoney((j.actual_costs || {})[l.key]));

  const html = `
    ${docHead('Job costing', j.name, `${jobNo(j)} · ${j.client || 'No client named'}`)}

    <div class="figures">
      <div><div class="n">${fmtMoney(m.totalClaim, true)}</div><div class="l">Total claimed</div></div>
      <div><div class="n">${fmtMoney(m.totalCost, true)}</div><div class="l">Total cost</div></div>
      <div><div class="n ${toneOf(m.profit)}">${fmtSigned(m.profit, true)}</div>
        <div class="l">Profit${m.margin == null ? '' : ' · ' + fmtPct(m.margin) + ' margin'}</div></div>
    </div>

    <h2>The job</h2>
    <table class="kv">
      <tr><td>Job number</td><td><strong>${jobNo(j)}</strong></td></tr>
      <tr><td>Client</td><td>${esc(j.client || '—')}</td></tr>
      <tr><td>Site</td><td>${esc(j.site || '—')}</td></tr>
      <tr><td>Type of work</td><td>${esc(typeLabel(typeOf(j)))}</td></tr>
      <tr><td>Status</td><td><span class="badge">${esc(statusLabel(j.status))}</span></td></tr>
      <tr><td>On site</td><td>${j.start_date ? fmtDate(j.start_date) : 'not set'}${
        j.end_date && j.end_date !== j.start_date ? ' to ' + fmtDate(j.end_date) : ''}</td></tr>
      ${j.reference ? `<tr><td>Client reference</td><td>${esc(j.reference)}</td></tr>` : ''}
    </table>
    ${j.description ? `<p class="note">${esc(j.description)}</p>` : ''}

    <h2>Costs — expected against actual</h2>
    ${lines.length ? `
    <table>
      <thead><tr><th>Line</th><th class="r">Expected</th><th class="r">Actual</th><th class="r">Over / under</th></tr></thead>
      <tbody>
        ${lines.map(l => {
          const vv = lineVariance(j, l.key);
          return `<tr>
            <td>${esc(l.label)}</td>
            <td class="r">${fmtMoney((j.expected_costs || {})[l.key], true)}</td>
            <td class="r">${fmtMoney((j.actual_costs || {})[l.key], true)}</td>
            ${vv == null ? '<td class="r">—</td>' : `<td class="r ${toneOf(-vv)}">${fmtSigned(vv, true)}</td>`}
          </tr>`;
        }).join('')}
        <tr class="tot"><td>Base job</td>
          <td class="r">${fmtMoney(m.ex, true)}</td>
          <td class="r">${fmtMoney(m.ac, true)}</td>
          ${m.ex == null || m.ac == null ? '<td class="r">—</td>'
            : `<td class="r ${toneOf(-(m.ac - m.ex))}">${fmtSigned(m.ac - m.ex, true)}</td>`}
        </tr>
        ${m.v.cost ? `
        <tr><td>Variations</td><td class="r">—</td><td class="r">${fmtMoney(m.v.cost, true)}</td><td class="r">—</td></tr>
        <tr class="tot"><td>Everything</td>
          <td class="r">${fmtMoney(m.ex, true)}</td>
          <td class="r">${fmtMoney(m.totalCost, true)}</td>
          <td class="r ${m.costSwing == null ? '' : toneOf(-m.costSwing)}">${
            m.costSwing == null ? '—' : fmtSigned(m.costSwing, true)}</td></tr>` : ''}
      </tbody>
    </table>
    <p class="lede">Over / under is the actual against the estimate. A positive number is money the
      job spent that it was not priced to spend.</p>`
    : '<p class="lede">No costs have been entered for this job.</p>'}

    <h2>Variations</h2>
    ${vars.length ? `
    <table>
      <thead><tr><th>No.</th><th>What it is</th><th>Status</th><th class="r">Cost</th><th class="r">Claimed</th><th class="r">Made</th></tr></thead>
      <tbody>
        ${vars.map(v => {
          const cost = hasMoney(v.cost) ? Number(v.cost) : null;
          const claim = hasMoney(v.claim_value) ? Number(v.claim_value) : null;
          const p = (cost == null || claim == null) ? null : claim - cost;
          const off = v.status === 'declined';
          return `<tr${off ? ' class="off"' : ''}>
            <td>${varNo(v)}</td>
            <td>${esc(v.title || '—')}${v.detail ? `<div class="sub">${esc(v.detail)}</div>` : ''}</td>
            <td>${esc(varStatusDef(v.status).label)}</td>
            <td class="r">${fmtMoney(cost, true)}</td>
            <td class="r">${fmtMoney(claim, true)}</td>
            ${off ? '<td class="r">not counted</td>' : pcell(p)}
          </tr>`;
        }).join('')}
        <tr class="tot"><td colspan="3">Counted (${m.v.n} of ${m.v.all})</td>
          <td class="r">${fmtMoney(m.v.cost, true)}</td>
          <td class="r">${fmtMoney(m.v.claim, true)}</td>
          ${pcell(m.v.profit)}</tr>
      </tbody>
    </table>` : '<p class="lede">None on this job.</p>'}

    <h2>The claim, and what it made</h2>
    <table class="kv">
      <tr><td>Agreed price</td><td>${fmtMoney(m.agreed, true)}</td></tr>
      <tr><td>Claimed — base job</td><td>${fmtMoney(m.claimed, true)}</td></tr>
      <tr><td>Claimed — variations</td><td>${m.v.n ? fmtMoney(m.v.claim, true) : '—'}</td></tr>
      <tr><td><strong>Total claimed</strong></td><td><strong>${fmtMoney(m.totalClaim, true)}</strong></td></tr>
      <tr><td>Total cost</td><td>${fmtMoney(m.totalCost, true)}</td></tr>
      <tr><td><strong>Profit</strong></td><td><strong class="${toneOf(m.profit)}">${fmtSigned(m.profit, true)}</strong>${
        m.margin == null ? '' : ` &nbsp;<span class="sub">${fmtPct(m.margin)} margin</span>`}</td></tr>
      ${m.expProfit != null ? `<tr><td>Priced to make</td><td>${fmtMoney(m.expProfit, true)}${
        m.expMargin == null ? '' : ` &nbsp;<span class="sub">${fmtPct(m.expMargin)} margin</span>`}</td></tr>` : ''}
      ${m.swing != null ? `<tr><td>Against the price</td><td class="${toneOf(m.swing)}">${fmtSigned(m.swing, true)}</td></tr>` : ''}
      ${j.invoice_ref ? `<tr><td>Invoice</td><td>${esc(j.invoice_ref)}</td></tr>` : ''}
      ${j.claimed_on ? `<tr><td>Claimed on</td><td>${fmtDate(j.claimed_on)}</td></tr>` : ''}
    </table>
    <p class="lede">All figures exclude GST.</p>

    ${comments.length ? `
    <h2>Comments</h2>
    ${comments.map(c => `
      <div class="entry">
        <div class="e-body">
          <div class="e-note">${esc(c.body)}</div>
          <div class="e-who">${esc(c.author || 'Someone')} · ${fmtDateTime(c.at)}</div>
        </div>
      </div>`).join('')}` : ''}`;

  printDoc(html, `${jobNo(j)} — job costing`);
}

/** The period on one sheet: the figures, then every job behind them. */
function printSummary(list, from, to) {
  const t = totalsFor(list);
  const html = `
    ${docHead('Costing summary', 'Job costing summary', periodLabel(repPeriod, from, to))}

    <div class="figures">
      <div><div class="n">${fmtMoney(t.claim, true)}</div><div class="l">Claimed</div></div>
      <div><div class="n">${fmtMoney(t.cost, true)}</div><div class="l">Cost</div></div>
      <div><div class="n ${toneOf(t.profit)}">${fmtSigned(t.profit, true)}</div>
        <div class="l">Profit${t.margin == null ? '' : ' · ' + fmtPct(t.margin) + ' margin'}</div></div>
    </div>

    <h2>The period</h2>
    <table class="kv">
      <tr><td>Jobs in the period</td><td>${t.jobs}</td></tr>
      <tr><td>Counted in the figures</td><td>${t.counted}</td></tr>
      ${t.waiting ? `<tr><td>Waiting on a cost or a claim</td><td>${t.waiting}</td></tr>` : ''}
      ${t.expProfit != null ? `<tr><td>Priced to make${
        t.expCounted !== t.jobs ? ` (${t.expCounted} of ${t.jobs} priced)` : ''}</td>
        <td>${fmtMoney(t.expProfit, true)}</td></tr>` : ''}
    </table>
    ${t.waiting ? `<p class="lede">A job joins the figures once both its actual cost and its claim
      are entered. The ${plural(t.waiting, 'job')} still waiting are listed below and left out of
      the totals.</p>` : ''}

    <h2>Every job</h2>
    ${list.length ? `
    <table>
      <thead><tr><th>Job</th><th>Client</th><th>Status</th><th class="r">Claimed</th><th class="r">Cost</th><th class="r">Made</th><th class="r">Margin</th></tr></thead>
      <tbody>
        ${list.map(j => {
          const m = jobMoney(j);
          return `<tr>
            <td><strong>${esc(j.name)}</strong><div class="sub">${jobNo(j)}</div></td>
            <td>${esc(j.client || '—')}</td>
            <td>${esc(statusLabel(j.status))}</td>
            <td class="r">${fmtMoney(m.totalClaim, true)}</td>
            <td class="r">${fmtMoney(m.totalCost, true)}</td>
            ${pcell(m.profit)}
            <td class="r">${fmtPct(m.margin, 0)}</td>
          </tr>`;
        }).join('')}
        <tr class="tot">
          <td colspan="3">${plural(t.counted, 'job')} counted</td>
          <td class="r">${fmtMoney(t.claim, true)}</td>
          <td class="r">${fmtMoney(t.cost, true)}</td>
          ${pcell(t.profit)}
          <td class="r">${fmtPct(t.margin, 0)}</td>
        </tr>
      </tbody>
    </table>` : '<p class="lede">No jobs in this period.</p>'}
    <p class="lede">All figures exclude GST.</p>`;

  printDoc(html, 'Job costing summary');
}

/* ================================================================
   Sync loop
   ================================================================ */
let syncState = 'idle';

function paintSync() {
  const dot = $('#syncDot');
  if (!dot) return;
  const pending = Outbox.count();
  dot.className = 'dot ' + (syncState === 'bad' ? 'bad' : pending ? 'warn'
    : connected() || S.localMode ? 'ok' : '');
  dot.title = S.localMode ? 'This device only'
    : !connected() ? 'Not set up'
    : pending ? `${pending} change(s) waiting to send`
    : syncState === 'bad' ? 'No connection — showing the last copy'
    : 'Connected';
}

async function refresh() {
  if (!connected()) { syncState = 'idle'; paintSync(); return; }
  try {
    await Outbox.flush();
    await Store.pull();
    syncState = 'ok';
  } catch (e) {
    syncState = 'bad';
  }
  paintSync();
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (document.hidden || !connected()) return;
    const before = JSON.stringify([DB.jobs.length, DB.variations.length, DB.comments.length]);
    await refresh();
    const after = JSON.stringify([DB.jobs.length, DB.variations.length, DB.comments.length]);
    if (before !== after && route.path === '') render();
  }, 30000);
}

/* ================================================================
   Boot
   ================================================================ */
$('#menuBtn').onclick = e => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; };
$('#backBtn').onclick = () => history.back();
$$('#menu [data-go]').forEach(b => b.onclick = () => { $('#menu').hidden = true; go(b.dataset.go); });
document.addEventListener('click', e => {
  if (!$('#menu').hidden && !e.target.closest('#menu') && !e.target.closest('#menuBtn')) $('#menu').hidden = true;
});

// The header only grows a shadow once there is content behind it.
let scrollTick = false;
window.addEventListener('scroll', () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    $('#topbar').classList.toggle('lifted', window.scrollY > 4);
    scrollTick = false;
  });
}, { passive: true });

window.addEventListener('hashchange', render);
window.addEventListener('online', () => refresh().then(render));
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

function watchForUpdate(reg) {
  const seen = w => {
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) {
        updateReady = true;
        toast('Update ready — close and reopen the app');
        if (route.path === 'settings') render();
      }
    });
  };
  seen(reg.installing);
  reg.addEventListener('updatefound', () => seen(reg.installing));
}

(async function boot() {
  loadCache();
  paintSync();
  render();
  await refresh();
  render();
  startPolling();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      watchForUpdate(reg);
      // Coming back to the app is the moment to look for a new one.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    }).catch(() => {});
  }
})();