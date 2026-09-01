/* =====================================================================
   RCK Workshop — gear status, damage reports, work orders, repair history
   Plain JavaScript, no build step, no frameworks.
   ===================================================================== */
'use strict';

const VERSION = '2.4.0';

/* ------------------------------------------------------------ fleet */
/* The types RCK started with. Anyone can add more when adding gear — a new
   type simply exists from the moment a machine is filed under it, so there is
   no separate list to maintain and nothing to migrate. */
const BUILTIN_CATEGORIES = [
  { key: 'miller',  label: 'Millers',  one: 'Miller',  prefix: 'MIL' },
  { key: 'paver',   label: 'Pavers',   one: 'Paver',   prefix: 'PAV' },
  { key: 'roller',  label: 'Rollers',  one: 'Roller',  prefix: 'ROL' },
  { key: 'bobcat',  label: 'Bobcats',  one: 'Bobcat',  prefix: 'BOB' },
  { key: 'truck',   label: 'Trucks',   one: 'Truck',   prefix: 'TRK' },
  { key: 'trailer', label: 'Trailers', one: 'Trailer', prefix: 'TRL' },
  { key: 'other',   label: 'Other',    one: 'Other',   prefix: 'GEN' }
];
const SEED_FLEET = [
  ['miller', 5], ['paver', 5], ['roller', 7], ['bobcat', 4], ['truck', 6], ['trailer', 6]
];

const WO_STATUS = [
  { key: 'new',            label: 'Reported',              open: true  },
  { key: 'in_progress',    label: 'Being repaired',        open: true  },
  { key: 'awaiting_parts', label: 'Waiting on parts',      open: true  },
  { key: 'with_external',  label: 'With external repairer', open: true  },
  { key: 'complete',       label: 'Fixed',                 open: false },
  { key: 'cancelled',      label: 'Cancelled',             open: false }
];

const STATUS_TEXT = {
  green:  'Working',
  orange: 'Damaged — still usable',
  red:    'Out of operation'
};

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
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  let h = d.getHours(), ap = h < 12 ? 'am' : 'pm';
  h = h % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${String(d.getMinutes()).padStart(2, '0')}${ap}`;
}
function fmtShort(v) {
  if (!v) return '';
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
  return isNaN(d) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysFromToday(dateStr) {
  if (!dateStr) return null;
  const a = new Date(today() + 'T00:00:00');
  const b = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  if (isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}
function daysBetween(a, b) {
  if (!a || !b) return null;
  const d = (new Date(b) - new Date(a)) / 86400000;
  return isNaN(d) ? null : Math.max(0, Math.round(d));
}
/** Human "due" text for a target date. */
function dueText(dateStr) {
  const n = daysFromToday(dateStr);
  if (n === null) return { text: 'No date set', late: false, none: true };
  if (n < 0)  return { text: `${-n} day${-n === 1 ? '' : 's'} overdue`, late: true };
  if (n === 0) return { text: 'Due today', late: false };
  if (n === 1) return { text: 'Due tomorrow', late: false };
  return { text: `Due in ${n} days`, late: false };
}
/** Whole percentages that always add up to exactly 100 (largest remainder),
    so the three status boxes can never read 99% or 101% between them. */
function sharePercents(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map(c => c * 100 / total);
  const out = exact.map(Math.floor);
  let spare = 100 - out.reduce((a, b) => a + b, 0);
  exact
    .map((v, i) => ({ rem: v - Math.floor(v), i }))
    .sort((a, b) => b.rem - a.rem)
    .forEach(x => { if (spare > 0 && x.rem > 0) { out[x.i]++; spare--; } });
  return out;
}

function woNo(o) {
  return o.number ? `WO-${String(o.number).padStart(4, '0')}` : 'WO — not synced';
}
function statusLabel(key) {
  const s = WO_STATUS.find(x => x.key === key);
  return s ? s.label : key;
}
function isOpen(o) {
  const s = WO_STATUS.find(x => x.key === o.status);
  return s ? s.open : true;
}
/** The type a gear item belongs to, with blanks treated as Other. */
function catOf(g) { return ((g && g.category) || '').trim() || 'other'; }

function builtinCat(key) { return BUILTIN_CATEGORIES.find(c => c.key === key); }

/** Built-in types, then any type someone has added, then Other last. */
function allCategoryKeys() {
  const keys = BUILTIN_CATEGORIES.filter(c => c.key !== 'other').map(c => c.key);
  const seen = new Set(keys.concat('other'));
  const custom = [];
  DB.gear.forEach(g => {
    const k = catOf(g);
    if (!seen.has(k)) { seen.add(k); custom.push(k); }
  });
  custom.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return keys.concat(custom, 'other');
}

/** Singular, for one machine: "Emulsion trailer". */
function catLabel(key) {
  const c = builtinCat(key);
  return c ? c.one : (key || 'Other');
}

/** Plural, for a heading or filter: "Emulsion trailers". */
function catPlural(key) {
  const c = builtinCat(key);
  if (c) return c.label;
  const w = key || 'Other';
  if (/s$/i.test(w)) return w;
  if (/(x|ch|sh|ss|z)$/i.test(w)) return w + 'es';
  if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

function catRank(key) {
  if (key === 'other') return 999;
  const i = BUILTIN_CATEGORIES.findIndex(c => c.key === key);
  return i >= 0 ? i : 100;
}

/** Existing spelling of a type if one matches, so near-duplicates can't creep in. */
function matchCategory(name) {
  const n = (name || '').trim().toLowerCase();
  return allCategoryKeys().find(k => k.toLowerCase() === n) || null;
}

/* Inline icons — no icon font, no network request, they inherit text colour. */
const ICONS = {
  pin:     '<path d="M12 21.5s6.5-5.2 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 16.3 12 21.5 12 21.5z"/><circle cx="12" cy="10.7" r="2.4"/>',
  clip:    '<path d="M20.4 11.6l-8.5 8.5a5.2 5.2 0 0 1-7.3-7.3l8.9-8.9a3.4 3.4 0 0 1 4.9 4.9l-8.8 8.8a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>',
  camera:  '<path d="M3.5 8.5h3l1.4-2.2h8.2L17.5 8.5h3v10h-17z"/><circle cx="12" cy="13" r="3.3"/>',
  printer: '<path d="M7 9V3.5h10V9"/><path d="M4 9h16v7h-3"/><path d="M7 16v4.5h10V16"/>',
  share:   '<path d="M12 15.5V3.5"/><path d="M8.5 7L12 3.5 15.5 7"/><path d="M5.5 13v6.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V13"/>',
  copy:    '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15"/>',
  file:    '<path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z"/><path d="M14 3.5V8h4"/>',
  plus:    '<path d="M12 5.5v13M5.5 12h13"/>',
  grid:    '<rect x="3.75" y="3.75" width="6.5" height="6.5" rx="2"/><rect x="13.75" y="3.75" width="6.5" height="6.5" rx="2"/><rect x="3.75" y="13.75" width="6.5" height="6.5" rx="2"/><rect x="13.75" y="13.75" width="6.5" height="6.5" rx="2"/>',
  orders:  '<path d="M8 4h8a2 2 0 0 1 2 2v13.1a1 1 0 0 1-1.47.88L12 17.4l-4.53 2.58A1 1 0 0 1 6 19.1V6a2 2 0 0 1 2-2z"/><path d="M9.25 8.5h5.5"/>',
  chart:   '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  coin:    '<circle cx="12" cy="12" r="8.2"/><path d="M14.4 9.3a2.9 2.9 0 0 0-2.4-1.1c-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.3 5 3.9 0 1.1-1 1.9-2.5 1.9a2.9 2.9 0 0 1-2.5-1.2"/><path d="M12 6.6v10.8"/>',
  people:  '<circle cx="9" cy="8" r="3.4"/><path d="M3.2 20a5.8 5.8 0 0 1 11.6 0"/><path d="M16.2 5.3a3.4 3.4 0 0 1 0 5.5"/><path d="M17.6 14.6A5.8 5.8 0 0 1 21 20"/>',
  spanner: '<path d="M15.5 8.5a3.8 3.8 0 0 0 4.6 4.6l-8 8a2.6 2.6 0 0 1-3.7-3.7l8-8a3.8 3.8 0 0 0-4.6-4.6l3 3-1.9 1.9-3-3a3.8 3.8 0 0 0 5.6 1.8z"/>'
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** Set when the database has no costs table yet, so the app can say so
    rather than looking empty and broken. */
let costsTableMissing = false;
let crewTableMissing = false;
let logTableMissing = false;

/* What a workshop day is actually made of. Anyone can add a type; it is kept
   on the entry itself so a phone that has never seen it still reads right. */
const CREW_LOG_TYPES = [
  { key: 'on_tools',       label: 'On the tools' },
  { key: 'inspection',     label: 'Inspection / service' },
  { key: 'quote_request',  label: 'Quote requested' },
  { key: 'quote_received', label: 'Quote received', money: true },
  { key: 'parts_ordered',  label: 'Parts ordered',  money: true },
  { key: 'parts_arrived',  label: 'Parts arrived' },
  { key: 'dropped_off',    label: 'Dropped at repairer' },
  { key: 'picked_up',      label: 'Picked up from repairer' },
  { key: 'admin',          label: 'Admin / paperwork' },
  { key: 'note',           label: 'Note' }
];

const builtinLogType = k => CREW_LOG_TYPES.find(t => t.key === k);

/* Work on a job writes itself into the doer's diary, so a day's timeline
   builds up on its own instead of waiting for someone to write it up.
   A kind missing from here is not captured — file uploads are summarised
   by their caller as one line rather than one per photo. */
const AUTO_LOG_LABELS = {
  comment:  'Note added to a job',
  status:   'Job updated',
  external: 'Repairer arranged',
  complete: 'Job completed',
  reopen:   'Job reopened'
};

function logLabel(e) {
  if (e && e.label) return e.label;
  const b = builtinLogType(e && e.kind);
  return b ? b.label : (e && e.kind ? e.kind : 'Note');
}
const logTakesMoney = k => !!(builtinLogType(k) || {}).money;

/** Built-in types plus any anyone has added. */
function allLogTypes() {
  const out = CREW_LOG_TYPES.slice();
  const seen = new Set(out.map(t => t.key));
  DB.crew_log.forEach(e => {
    if (e.auto) return;
    if (e.kind && !seen.has(e.kind)) { seen.add(e.kind); out.push({ key: e.kind, label: logLabel(e) }); }
  });
  return out;
}

/** A diary day is the day on the calendar, so a late entry stays on its day. */
const logDay = e => (e.entry_date || (e.at || '').slice(0, 10) || '');

function logFor(name, date) {
  const n = String(name || '').toLowerCase();
  return DB.crew_log
    .filter(e => String(e.crew_name || '').toLowerCase() === n && (!date || logDay(e) === date))
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

const logOnDay = date => DB.crew_log
  .filter(e => logDay(e) === date)
  .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));

/** The days one person has written anything on, newest first. */
function logDays(name) {
  const seen = new Set();
  logFor(name).forEach(e => { const d = logDay(e); if (d) seen.add(d); });
  return Array.from(seen).sort().reverse();
}

const logById = id => DB.crew_log.find(e => e.id === id);

/** A day's work for one person, counted from their diary. */
function dayTally(name, date) {
  const t = { entries: 0, reported: 0, updates: 0, photos: 0, docs: 0, closed: 0, notes: 0 };
  logFor(name, date).forEach(e => {
    t.entries++;
    (Array.isArray(e.files) ? e.files : []).forEach(f => {
      if (/^image\//.test(f.type || '')) t.photos++; else t.docs++;
    });
    if (!e.auto) { t.notes++; return; }
    const k = String(e.kind || '').replace(/^auto_/, '');
    if (k === 'complete') t.closed++;
    else if (k === 'created') t.reported++;
    else if (k !== 'file') t.updates++;
  });
  return t;
}

/** "3 updates · 2 photos · 1 closed" — zeros left out. */
function tallyLine(t) {
  const bits = [];
  const add = (n, one, many) => { if (n) bits.push(`${n} ${n === 1 ? one : (many || one + 's')}`); };
  add(t.reported, 'reported');
  add(t.updates, 'update');
  add(t.photos, 'photo');
  add(t.docs, 'document');
  add(t.closed, 'closed', 'closed');
  add(t.notes, 'note');
  return bits.join(' · ');
}

/** 24-hour, because that is how a diary is written. */
function fmtTime(v) {
  const d = new Date(v);
  if (isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}


/** The crew RCK started with. Anyone can be added later. */
const CREW_SEED = ['Milian', 'Clint', 'Ryder', 'Sebastion', 'Lyndon', 'Barry'];

/** Everyone who can manage a job: the crew list, the built-in six as a
    fallback before the database is migrated, and anyone already holding a
    job who somehow isn't on either list — so no work can go invisible. */
function crewNames() {
  const out = [];
  const seen = new Set();
  const add = n => {
    const k = String(n || '').trim();
    if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.push(k); }
  };
  DB.crew.filter(c => c.active !== false).forEach(c => add(c.name));
  CREW_SEED.forEach(add);
  DB.work_orders.forEach(o => add(o.assigned_to));
  return out;
}

const matchCrew = name => {
  const n = String(name || '').trim().toLowerCase();
  return crewNames().find(x => x.toLowerCase() === n) || null;
};

const assignedTo = o => String(o.assigned_to || '').trim();

function ordersFor(name) {
  const n = name.toLowerCase();
  return DB.work_orders.filter(o => assignedTo(o).toLowerCase() === n);
}

/** How one person is tracking: what they hold, and what is slipping. */
function crewStats(name) {
  const mine = ordersFor(name);
  const open = mine.filter(isOpen);
  return {
    open: open.length,
    red: open.filter(o => o.severity === 'red').length,
    overdue: open.filter(o => { const d = daysFromToday(o.target_date); return d !== null && d < 0; }).length,
    noDate: open.filter(o => !o.target_date).length,
    done: mine.filter(o => o.status === 'complete').length,
    oldest: open.map(o => o.reported_at).filter(Boolean).sort()[0] || null
  };
}

const unassignedOrders = () => activeOrders().filter(o => !assignedTo(o));

async function addCrewMember(name) {
  const clean = String(name || '').trim();
  if (!clean || matchCrew(clean)) return;
  await Store.insert('crew', { id: uid(), name: clean, active: true, created_at: new Date().toISOString() });
}


function money(n) {
  const v = Number(n) || 0;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-NZ',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Compact form for cards and tiles: $8,400 → $8.4k */
function moneyShort(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1000000) return `${sign}$${(a / 1000000).toFixed(a >= 10000000 ? 0 : 1)}m`;
  if (a >= 10000) return `${sign}$${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}k`;
  return sign + '$' + Math.round(a).toLocaleString('en-NZ');
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ================================================================
   Settings and identity — kept per device
   ================================================================ */
const SITE = window.RCKW_CONFIG || {};

const Settings = {
  read() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('rckw.settings') || '{}'); } catch (e) {}
    return Object.assign({
      supabaseUrl: SITE.supabaseUrl || '',
      supabaseKey: SITE.supabaseKey || '',
      name: '',
      role: 'crew',
      localMode: false
    }, saved);
  },
  write(patch) {
    const next = Object.assign(Settings.read(), patch);
    localStorage.setItem('rckw.settings', JSON.stringify(next));
    S = next;
    return next;
  }
};
let S = Settings.read();

const isWorkshop = () => S.role === 'workshop';
const connected  = () => !S.localMode && !!S.supabaseUrl && !!S.supabaseKey;

/* ================================================================
   Local cache — the app opens instantly and stays readable offline
   ================================================================ */
const DB = { gear: [], work_orders: [], wo_updates: [], costs: [], crew: [], crew_log: [], localSeq: 0 };

function cacheKey() { return 'rckw.cache.' + (S.localMode ? 'local' : 'remote'); }

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (raw) {
      DB.gear = raw.gear || [];
      DB.work_orders = raw.work_orders || [];
      DB.wo_updates = raw.wo_updates || [];
      DB.costs = raw.costs || [];
      DB.crew = raw.crew || [];
      DB.crew_log = raw.crew_log || [];
      DB.localSeq = raw.localSeq || 0;
    }
  } catch (e) {}
}
function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(DB));
  } catch (e) {
    // Storage full — most likely photos in local mode.
    toast('Device storage is full. Connect to Supabase or clear old photos.');
  }
}

function upsert(table, row) {
  const list = DB[table];
  const i = list.findIndex(r => r.id === row.id);
  if (i >= 0) list[i] = Object.assign({}, list[i], row);
  else list.push(row);
}

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
   Store — one interface, two backings (Supabase or this device only)
   ================================================================ */
const Store = {
  async pull() {
    if (!connected()) return;
    const [gear, orders, updates, costs, crew, log] = await Promise.all([
      rest('gear?select=*&order=code.asc', { headers: restHeaders() }),
      rest('work_orders?select=*&order=number.desc&limit=3000', { headers: restHeaders() }),
      rest('wo_updates?select=*&order=created_at.desc&limit=6000', { headers: restHeaders() }),
      // The cost table may not exist yet on an older database; the rest of
      // the app must keep working if it doesn't.
      rest('costs?select=*&order=created_at.desc&limit=6000', { headers: restHeaders() }).catch(() => null),
      rest('crew?select=*&order=created_at.asc', { headers: restHeaders() }).catch(() => null),
      rest('crew_log?select=*&order=at.desc&limit=8000', { headers: restHeaders() }).catch(() => null)
    ]);
    DB.gear = gear || [];
    DB.work_orders = orders || [];
    DB.wo_updates = (updates || []).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    if (costs) { DB.costs = costs; costsTableMissing = false; }
    else costsTableMissing = true;
    if (crew) { DB.crew = crew; crewTableMissing = false; }
    else crewTableMissing = true;
    if (log) { DB.crew_log = log; logTableMissing = false; }
    else logTableMissing = true;
    saveCache();
  },

  async insert(table, row) {
    if (!row.id) row.id = uid();
    if (!connected()) {
      if (table === 'work_orders' && !row.number) row.number = ++DB.localSeq;
      if (!row.created_at && table === 'wo_updates') row.created_at = new Date().toISOString();
      upsert(table, row);
      saveCache();
      return row;
    }
    upsert(table, row);            // show it straight away
    saveCache();
    try {
      const out = await rest(table, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(row)
      });
      const saved = Array.isArray(out) ? out[0] : out;
      if (saved) { upsert(table, saved); saveCache(); }
      return saved || row;
    } catch (err) {
      Outbox.add({ kind: 'insert', table, row });
      return row;
    }
  },

  async patch(table, id, patch) {
    upsert(table, Object.assign({ id }, patch));
    saveCache();
    if (!connected()) return;
    try {
      await rest(`${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(patch)
      });
    } catch (err) {
      Outbox.add({ kind: 'patch', table, id, patch });
    }
  },

  async remove(table, id) {
    const list = DB[table];
    const i = list.findIndex(r => r.id === id);
    if (i >= 0) list.splice(i, 1);
    saveCache();
    if (!connected()) return;
    try {
      await rest(`${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: restHeaders({ Prefer: 'return=minimal' })
      });
    } catch (err) {
      Outbox.add({ kind: 'delete', table, id });
    }
  },

  /** Returns { name, url, type, size } — a public URL, or a data URL offline. */
  async upload(file) {
    const dataUrl = await fileToDataUrl(file);
    const meta = { name: file.name || 'file', type: file.type || '', size: file.size || 0 };
    if (!connected()) return Object.assign(meta, { url: dataUrl, local: true });
    try {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${(file.name || 'file').replace(/[^\w.\-]+/g, '_')}`;
      const base = S.supabaseUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/storage/v1/object/workshop-files/${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }),
        body: file
      });
      if (!res.ok) throw new Error(await res.text());
      return Object.assign(meta, { url: `${base}/storage/v1/object/public/workshop-files/${encodeURIComponent(path)}` });
    } catch (err) {
      // Keep the file rather than lose it; it uploads on the next sync.
      return Object.assign(meta, { url: dataUrl, local: true, pending: true });
    }
  }
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ------------- outbox: writes made with no signal, replayed later ---- */
const Outbox = {
  all() {
    try { return JSON.parse(localStorage.getItem('rckw.outbox') || '[]'); } catch (e) { return []; }
  },
  save(list) { localStorage.setItem('rckw.outbox', JSON.stringify(list)); },
  add(op) {
    const list = Outbox.all();
    list.push(Object.assign({ opId: uid() }, op));
    Outbox.save(list);
    paintSync();
  },
  count() { return Outbox.all().length; },
  async flush() {
    if (!connected()) return;
    let list = Outbox.all();
    if (!list.length) return;
    const left = [];
    for (const op of list) {
      try {
        if (op.kind === 'delete') {
          await rest(`${op.table}?id=eq.${encodeURIComponent(op.id)}`, {
            method: 'DELETE',
            headers: restHeaders({ Prefer: 'return=minimal' })
          });
        } else if (op.kind === 'insert') {
          await rest(op.table, {
            method: 'POST',
            headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify(op.row)
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
      }
    }
    Outbox.save(left);
    paintSync();
  }
};

/* ================================================================
   Status logic — the colour of every piece of gear
   ================================================================ */
function openOrdersFor(gearId) {
  return DB.work_orders.filter(o => o.gear_id === gearId && isOpen(o));
}
function gearStatus(g) {
  const open = openOrdersFor(g.id);
  if (open.some(o => o.severity === 'red')) return 'red';
  if (open.length) return 'orange';
  return 'green';
}
/** When this machine stopped being green — its oldest still-open fault.
    Deliberately measured from the first open fault rather than from the last
    change of colour: a machine that worsens from yellow to red would otherwise
    reset to zero and drop down a board that is sorted by neglect. */
function downSince(g) {
  const dates = openOrdersFor(g.id).map(o => o.reported_at).filter(Boolean).sort();
  return dates[0] || null;
}

/** Whole calendar days since then — reported yesterday reads 1, not 0. */
function daysDown(g) {
  const since = downSince(g);
  if (!since) return null;
  const from = new Date(since);
  if (isNaN(from)) return null;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Longest-standing problems first, then healthy gear in its tidy order. */
function boardOrder(list) {
  const tidy = sortedGear(list);
  return tidy.slice().sort((a, b) => {
    const da = downSince(a), db = downSince(b);
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return tidy.indexOf(a) - tidy.indexOf(b);
  });
}

/** Soonest promised back-in-service date across a gear item's open work. */
function gearEta(g) {
  const dates = openOrdersFor(g.id).map(o => o.target_date).filter(Boolean).sort();
  return dates[0] || null;
}
const gearById  = id => DB.gear.find(g => g.id === id);
const orderById = id => DB.work_orders.find(o => o.id === id);
const updatesFor = id => DB.wo_updates
  .filter(u => u.work_order_id === id)
  .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

function activeGear() {
  return DB.gear.filter(g => !g.retired);
}
function sortedGear(list) {
  return list.slice().sort((a, b) => {
    const d = catRank(catOf(a)) - catRank(catOf(b));
    if (d !== 0) return d;
    const c = catOf(a).localeCompare(catOf(b), undefined, { sensitivity: 'base' });
    if (c !== 0) return c;
    return String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
  });
}
/** Open work orders, worst and oldest first. */
function activeOrders() {
  return DB.work_orders.filter(isOpen).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'red' ? -1 : 1;
    return String(a.reported_at || '').localeCompare(String(b.reported_at || ''));
  });
}

/* ================================================================
   Writing changes — every one leaves a trail on the work order
   ================================================================ */
function whoami() { return S.name || 'Unnamed user'; }

/** Puts what someone just did on a job into their own diary for today. */
async function autoDiary(workOrderId, kind, body, opts) {
  const o = opts || {};
  const label = o.label || AUTO_LOG_LABELS[kind];
  if (!label) return;
  const who = matchCrew(whoami()) || whoami();
  if (!who) return;
  const now = new Date();
  await Store.insert('crew_log', {
    id: uid(),
    crew_name: who,
    entry_date: today(),
    at: now.toISOString(),
    kind: 'auto_' + kind,
    label,
    // keep it to the gist; the work order holds the full record
    body: String(body || '').split('\n').slice(0, 3).join('\n').slice(0, 400),
    work_order_id: workOrderId || null,
    amount: null,
    files: o.files || [],
    auto: true,
    author: whoami(),
    role: S.role,
    created_at: now.toISOString()
  });
}

async function logUpdate(workOrderId, kind, body, meta) {
  const saved = await Store.insert('wo_updates', {
    id: uid(),
    work_order_id: workOrderId,
    created_at: new Date().toISOString(),
    author: whoami(),
    role: S.role,
    kind,
    body: body || '',
    meta: meta || {}
  });
  await autoDiary(workOrderId, kind, body);
  return saved;
}

async function createWorkOrder(data, files) {
  const order = {
    id: uid(),
    gear_id: data.gear_id,
    title: data.title,
    description: data.description || '',
    severity: data.severity,
    status: 'new',
    reported_by: whoami(),
    reported_at: new Date().toISOString(),
    location_at_report: data.location || '',
    target_date: data.target_date || null
  };
  const saved = await Store.insert('work_orders', order);

  await logUpdate(saved.id, 'created',
    `Damage reported: ${data.title}` + (data.severity === 'red'
      ? ' — gear taken out of operation.'
      : ' — gear is damaged but still usable.'));

  const shots = [];
  for (const f of files || []) {
    const up = await Store.upload(f);
    shots.push(up);
    await logUpdate(saved.id, 'file', 'Photo of the damage', up);
  }

  // One diary line for the whole report, carrying the photos, rather than
  // one per photo.
  await autoDiary(saved.id, 'created',
    `${data.title}${shots.length ? ` — ${shots.length} photo${shots.length === 1 ? '' : 's'}` : ''}`,
    { label: 'Damage reported', files: shots });

  if (data.location) {
    await Store.patch('gear', data.gear_id, {
      location: data.location,
      location_updated_at: new Date().toISOString(),
      location_updated_by: whoami()
    });
  }
  return saved;
}

/* ================================================================
   Photos — shrunk on the phone so they upload on a bad connection
   ================================================================ */
async function compressImage(file) {
  if (!/^image\//.test(file.type)) return file;
  try {
    const dataUrl = await fileToDataUrl(file);
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const max = 1400;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 600000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.72));
    if (!blob) return file;
    return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    return file;
  }
}

/* ================================================================
   Router
   ================================================================ */
let route = { path: '/', query: {} };

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = {};
  new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
  return { path: path || '/', query };
}
function go(hash) { location.hash = hash; }

/** Which half of the app a path belongs to. The two never share a screen. */
function sectionOf(path) {
  if (path === '/') return 'hub';
  if (path === '/screen') return 'kiosk';
  if (path.startsWith('/crew')) return 'crew';
  if (path.startsWith('/costs')) return 'costs';
  return 'maintenance';
}

const TABS = {
  maintenance: [
    { href: '#/gear',   label: 'Gear',        icon: 'grid',   on: p => p === '/gear' || p.startsWith('/gear/') },
    { href: '#/orders', label: 'Work orders', icon: 'orders', on: p => p === '/orders' || p.startsWith('/wo/') },
    { href: '#/report', label: 'Report',      icon: 'plus',   on: p => p === '/report', primary: true }
  ],
  costs: [
    { href: '#/costs',         label: 'Assets',   icon: 'grid',  on: p => p === '/costs' || /^\/costs\/[^/]+$/.test(p) && p !== '/costs/new' && p !== '/costs/summary' },
    { href: '#/costs/summary', label: 'Tracker',  icon: 'chart', on: p => p === '/costs/summary' },
    { href: '#/costs/new',     label: 'Add cost', icon: 'plus',  on: p => p === '/costs/new' || p.startsWith('/costs/edit/'), primary: true }
  ]
};

function paintTabs(section, path) {
  const bar = $('#tabbar');
  const tabs = TABS[section];
  if (!tabs) { bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;
  bar.innerHTML = tabs.map(t => `
    <a href="${t.href}" class="${t.on(path) ? 'on' : ''}${t.primary ? ' tab-primary' : ''}">
      ${t.primary ? `<span class="fab">${icon(t.icon)}</span>` : icon(t.icon)}
      <span>${t.label}</span>
    </a>`).join('');
}

const SCREENS = {
  '/':          { title: 'RCK Workshop',  render: renderHub },
  '/gear':      { title: 'Gear',          render: renderBoard },
  '/crew':           { title: 'Maintenance crew', render: renderCrewBoard },
  '/crew-unassigned': { title: 'Unassigned jobs',  render: renderUnassigned, back: true },
  '/crew-today':      { title: 'Daily diary',      render: renderCrewDiary,  back: true },
  '/crew-log':        { title: 'Diary entry',      render: renderCrewLogForm, back: true },
  '/costs':          { title: 'Costs',        render: renderCostsBoard },
  '/costs/new':      { title: 'Add a cost',   render: renderCostForm,    back: true },
  '/costs/summary':  { title: 'Cost tracker', render: renderCostSummary },
  '/orders':    { title: 'Work orders',   render: renderOrders },
  '/report':    { title: 'Report damage', render: renderReport,   back: true },
  '/reports':   { title: 'Reports',       render: renderReports,  back: true },
  '/gearadmin': { title: 'Manage gear',   render: renderGearAdmin, back: true },
  '/setup':     { title: 'Settings',      render: renderSetup,    back: true },
  '/join':      { title: 'Set up',        render: renderJoin },
  '/screen':    { title: 'Workshop screen', render: renderKiosk }
};

/* Coming back to a list should put you where you left it, not at the top. */
const scrollMemory = {};
let lastPath = null;

function restoreScroll(path) {
  const keepsPlace = ['/gear', '/orders', '/costs'].includes(path);
  const y = keepsPlace ? (scrollMemory[path] || 0) : 0;
  requestAnimationFrame(() => window.scrollTo(0, y));
}

function render() {
  if (lastPath !== null) scrollMemory[lastPath] = window.scrollY;
  route = parseHash();
  lastPath = route.path;
  stopKiosk();
  document.body.classList.toggle('kiosk', route.path === '/screen');

  let screen = SCREENS[route.path];
  let back = false;
  if (screen) { /* an exact route always wins over the patterns below */ }

  if (!screen && route.path.startsWith('/crew-log/edit/')) { screen = { title: 'Edit entry', render: renderCrewLogForm }; back = true; }
  else if (!screen && route.path.startsWith('/crew/')) { screen = { title: 'Crew', render: renderCrewPerson }; back = true; }
  else if (!screen && route.path.startsWith('/costs/edit/')) { screen = { title: 'Edit cost', render: renderCostForm }; back = true; }
  else if (!screen && route.path.startsWith('/costs/')) { screen = { title: 'Costs', render: renderCostsAsset }; back = true; }
  else if (!screen && route.path.startsWith('/gearedit/')) { screen = { title: 'Edit gear', render: renderGearEdit }; back = true; }
  else if (!screen && route.path.startsWith('/gear/')) { screen = { title: 'Gear', render: renderGearDetail }; back = true; }
  else if (!screen && route.path.startsWith('/wo/')) { screen = { title: 'Work order', render: renderWorkOrder }; back = true; }

  if (!screen) { go('#/'); return; }

  $('#title').textContent = screen.title;
  $('#backBtn').hidden = !(back || screen.back);
  $('#menu').hidden = true;

  const section = sectionOf(route.path);
  document.body.classList.toggle('in-costs', section === 'costs');
  paintTabs(section, route.path);
  $('#homeBtn').hidden = !['costs', 'maintenance', 'crew'].includes(section) || (back || screen.back);

  const view = $('#view');
  view.innerHTML = '';
  // Restart the entrance animation on every navigation.
  view.classList.remove('enter');
  void view.offsetWidth;
  view.classList.add('enter');

  if (needsSetup() && route.path !== '/setup' && route.path !== '/join') { renderWelcome(view); return; }
  screen.render(view);
  restoreScroll(route.path);
}

function needsSetup() {
  return !S.name || (!connected() && !S.localMode);
}

/* ================================================================
   Screen — one-tap setup from a shared link
   The connection details ride in the URL's hash, which browsers never
   send to the web server, so the key stays off the public site.
   ================================================================ */
function setupLink() {
  return location.origin + location.pathname +
    '#/join?u=' + encodeURIComponent(S.supabaseUrl) +
    '&k=' + encodeURIComponent(S.supabaseKey);
}

function renderJoin(view) {
  const url = route.query.u || '';
  const key = route.query.k || '';

  if (!url || !key) {
    view.innerHTML = `
      <div class="card">
        <h2>That link is incomplete</h2>
        <p class="muted small">Ask whoever sent it to share it again from
        <strong>Settings → Share setup link</strong>, or enter the details by hand.</p>
        <a class="btn wide mt" href="#/setup">Enter them by hand</a>
      </div>`;
    return;
  }

  view.innerHTML = `
    <div class="card">
      <h2>Set up RCK Workshop</h2>
      <p class="muted small">This links your phone to the shared gear list. You only do this once.</p>
      <label class="field"><span>Your name</span>
        <input type="text" id="jName" value="${esc(S.name)}" placeholder="e.g. Dave T"></label>
      <label class="field"><span>You are</span>
        <select id="jRole">
          <option value="crew">Crew — report damage, see status</option>
          <option value="workshop">Workshop — also update and close jobs</option>
        </select></label>
      <button class="btn primary wide" id="jGo">Connect</button>
      <div id="jOut" class="small mt"></div>
    </div>

    <p class="muted small center">Once connected, use <strong>Add to Home Screen</strong>
    in your browser's share menu so it opens like a normal app.</p>`;

  $('#jGo', view).onclick = async function () {
    const name = $('#jName', view).value.trim();
    const role = $('#jRole', view).value;
    if (!name) return toast('Enter your name');
    if (role === 'workshop' && SITE.workshopPin) {
      const pin = prompt('Workshop code:');
      if (pin !== SITE.workshopPin) return toast('Wrong code');
    }

    this.disabled = true;
    this.textContent = 'Connecting…';
    const out = $('#jOut', view);
    let problem = 'Could not reach the database. Check you have signal and try again, or ask for a new link.';
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/gear?select=id&limit=1`, {
        headers: { apikey: key, Authorization: 'Bearer ' + key }
      });
      if (!res.ok) {
        problem = res.status === 404
          ? 'The database is not set up yet — tell whoever sent you this link.'
          : `This link is out of date (error ${res.status}). Ask for a new one.`;
        throw new Error(problem);
      }
    } catch (err) {
      this.disabled = false;
      this.textContent = 'Connect';
      out.innerHTML = `<span style="color:var(--red)">${esc(problem)}</span>`;
      return;
    }

    Settings.write({ supabaseUrl: url.replace(/\/+$/, ''), supabaseKey: key, name, role, localMode: false });
    loadCache();
    await refresh();
    toast('Connected — you\'re all set');
    go('#/');
  };
}

/* ================================================================
   Screen — first run
   ================================================================ */
function renderWelcome(view) {
  view.innerHTML = `
    <div class="card">
      <h2>Set this device up</h2>
      <p class="muted small">Two things before you start: your name, so the workshop knows who
      reported what, and the connection to the shared gear list.</p>
      <a class="btn primary wide mt" href="#/setup">Open settings</a>
    </div>`;
}

/* ================================================================
   Screen — gear board (home)
   ================================================================ */
const boardFilter = { cat: 'all', status: 'all', q: '' };

function renderBoard(view) {
  const gear = sortedGear(activeGear());

  if (!gear.length) {
    view.innerHTML = `
      <div class="empty">
        <b>No gear yet</b>
        Add the fleet once and everyone sees it.
      </div>
      <a class="btn primary wide" href="#/gearadmin">Set up the fleet</a>`;
    return;
  }

  const counts = { green: 0, orange: 0, red: 0 };
  gear.forEach(g => counts[gearStatus(g)]++);
  const pct = sharePercents([counts.green, counts.orange, counts.red]);

  const cats = allCategoryKeys().filter(k => gear.some(g => catOf(g) === k));

  view.innerHTML = `
    <div class="tally">
      ${['green', 'orange', 'red'].map((k, i) => `
        <button class="status-${k}" data-status="${k}" aria-pressed="${boardFilter.status === k}">
          <span class="n">${counts[k]}<em>${pct[i]}%</em></span>
          <span class="l">${k === 'green' ? 'Working' : k === 'orange' ? 'Usable' : 'Out of action'}</span>
        </button>`).join('')}
    </div>

    <div class="filters">
      <button class="chip" data-cat="all" aria-pressed="${boardFilter.cat === 'all'}">All gear</button>
      ${cats.map(k => `<button class="chip" data-cat="${esc(k)}" aria-pressed="${boardFilter.cat === k}">${esc(catPlural(k))}</button>`).join('')}
    </div>

    <label class="field"><input type="text" id="q" placeholder="Search code, name or location" value="${esc(boardFilter.q)}"></label>

    <div class="gear-grid" id="grid"></div>`;

  $$('[data-status]', view).forEach(b => b.onclick = () => {
    boardFilter.status = boardFilter.status === b.dataset.status ? 'all' : b.dataset.status;
    renderBoard(view);
  });
  $$('[data-cat]', view).forEach(b => b.onclick = () => {
    boardFilter.cat = b.dataset.cat;
    renderBoard(view);
  });
  const q = $('#q', view);
  q.oninput = () => { boardFilter.q = q.value; paintGrid(); };

  paintGrid();

  function paintGrid() {
    const needle = boardFilter.q.trim().toLowerCase();
    const list = gear.filter(g => {
      if (boardFilter.cat !== 'all' && catOf(g) !== boardFilter.cat) return false;
      if (boardFilter.status !== 'all' && gearStatus(g) !== boardFilter.status) return false;
      if (needle && !`${g.code} ${g.name} ${g.location} ${g.make_model}`.toLowerCase().includes(needle)) return false;
      return true;
    });

    const grid = $('#grid', view);
    if (!list.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Nothing matches</b>Try another filter.</div>`;
      return;
    }
    grid.innerHTML = boardOrder(list).map((g, i) => {
      const st = gearStatus(g);
      const eta = gearEta(g);
      const open = openOrdersFor(g.id).length;
      const due = eta ? dueText(eta) : null;
      const days = daysDown(g);
      return `
        <button class="gear-card status-${st}${days === null ? '' : ' has-days'}" data-id="${g.id}" style="--i:${Math.min(i, 14)}">
          ${days === null ? '' : `<span class="days" title="${days} day${days === 1 ? '' : 's'} since the fault was reported">${days}d</span>`}
          <div class="code">${esc(g.code)}</div>
          <div class="name">${esc(g.name || catLabel(catOf(g)))}</div>
          <div class="meta"><span class="swatch"></span>${STATUS_TEXT[st]}</div>
          ${open ? `<div class="loc">${open} open job${open === 1 ? '' : 's'}${due ? ` · <span class="${due.late ? 'overdue' : ''}">${due.none ? 'no date' : due.text}</span>` : ''}</div>` : ''}
          <div class="loc">${g.location
            ? icon('pin') + esc(g.location)
            : '<span style="opacity:.7">Location not set</span>'}</div>
        </button>`;
    }).join('');
    $$('.gear-card', grid).forEach(b => b.onclick = () => go('#/gear/' + b.dataset.id));
  }
}

/* ================================================================
   Screen — one piece of gear
   ================================================================ */
function renderGearDetail(view) {
  const g = gearById(route.path.split('/')[2]);
  if (!g) { view.innerHTML = `<div class="empty"><b>Gear not found</b></div>`; return; }

  const st = gearStatus(g);
  const open = openOrdersFor(g.id);
  const done = DB.work_orders
    .filter(o => o.gear_id === g.id && !isOpen(o))
    .sort((a, b) => String(b.completed_at || b.reported_at || '').localeCompare(String(a.completed_at || a.reported_at || '')));

  $('#title').textContent = g.code;

  view.innerHTML = `
    <div class="card accent status-${st}">
      <div class="row spread">
        <div class="grow">
          <h2 style="font-size:20px">${esc(g.code)}</h2>
          <div class="muted small">${esc(g.name || '')}${g.make_model ? ' · ' + esc(g.make_model) : ''}</div>
        </div>
        <span class="pill"><span class="swatch"></span>${STATUS_TEXT[st]}</span>
      </div>
      <div class="mt small">
        <div><strong>Where:</strong> ${g.location ? esc(g.location) : '<span class="muted">not recorded</span>'}</div>
        ${g.location_updated_at ? `<div class="muted tiny">Updated ${fmtDateTime(g.location_updated_at)}${g.location_updated_by ? ' by ' + esc(g.location_updated_by) : ''}</div>` : ''}
      </div>
      <div class="btn-row mt">
        <button class="btn sm" id="editLoc">Update location</button>
        <button class="btn sm" id="gps">Use my GPS</button>
      </div>
    </div>

    <div class="btn-row">
      <a class="btn primary" href="#/report?gear=${g.id}">Report damage</a>
      <button class="btn" id="hist">${icon('file')}History report</button>
    </div>

    <div class="section-title">Open work orders</div>
    <div id="openList">${open.length ? open.map(woCard).join('') : `<div class="card muted small">Nothing outstanding — this gear is signed off as working.</div>`}</div>

    <div class="section-title">Repair history (${done.length})</div>
    <div id="doneList">${done.length ? done.slice(0, 12).map(woCard).join('') : `<div class="card muted small">No completed repairs recorded yet.</div>`}</div>
    ${done.length > 12 ? `<p class="muted small center">Showing the 12 most recent. The history report has them all.</p>` : ''}`;

  wireWoCards(view);

  $('#hist', view).onclick = () => printGearHistory(g);

  $('#editLoc', view).onclick = async () => {
    const v = prompt('Where is ' + g.code + ' right now?', g.location || '');
    if (v === null) return;
    await setLocation(g, v.trim());
    render();
  };

  $('#gps', view).onclick = () => {
    if (!navigator.geolocation) return toast('This device has no GPS');
    toast('Getting GPS…');
    navigator.geolocation.getCurrentPosition(async pos => {
      const c = pos.coords;
      const txt = `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`;
      const label = prompt('Site or address for these coordinates (optional):', g.location || '');
      await setLocation(g, label ? `${label.trim()} (${txt})` : txt);
      render();
    }, () => toast('Could not get GPS'), { enableHighAccuracy: true, timeout: 12000 });
  };
}

async function setLocation(g, text) {
  await Store.patch('gear', g.id, {
    location: text,
    location_updated_at: new Date().toISOString(),
    location_updated_by: whoami()
  });
  toast('Location updated');
}

function woCard(o, i) {
  const g = gearById(o.gear_id) || {};
  const due = dueText(o.target_date);
  const closed = !isOpen(o);
  return `
    <button class="wo status-${closed ? 'green' : o.severity}" data-wo="${o.id}" style="--i:${Math.min(i || 0, 10)}">
      <div class="hdr">
        <span class="num">${woNo(o)}</span>
        <span class="num">${esc(g.code || '')}</span>
      </div>
      <div class="ttl">${esc(o.title)}</div>
      <div class="sub">
        <span class="pill"><span class="swatch"></span>${closed ? statusLabel(o.status) : STATUS_TEXT[o.severity]}</span>
        ${closed ? '' : `<span class="pill plain">${statusLabel(o.status)}</span>`}
        ${closed
          ? `<span>Completed ${fmtDate(o.completed_at)}</span>`
          : `<span class="${due.late ? 'overdue' : ''}">${due.none ? 'No fix date set' : due.text}</span>`}
        ${o.repairer === 'external' ? `<span>External${o.external_company ? ' · ' + esc(o.external_company) : ''}</span>` : ''}
        ${assignedTo(o) ? `<span class="who">${esc(assignedTo(o))}</span>` : `<span class="who none">Unassigned</span>`}
      </div>
    </button>`;
}
function wireWoCards(root) {
  $$('[data-wo]', root).forEach(b => b.onclick = () => go('#/wo/' + b.dataset.wo));
}

/* ================================================================
   Screen — work orders list
   ================================================================ */
let orderFilter = 'active';

function renderOrders(view) {
  const filters = [
    ['active', 'Active'],
    ['red', 'Out of action'],
    ['orange', 'Usable'],
    ['overdue', 'Overdue'],
    ['complete', 'Completed'],
    ['all', 'All']
  ];

  let list;
  if (orderFilter === 'active') list = activeOrders();
  else if (orderFilter === 'red') list = activeOrders().filter(o => o.severity === 'red');
  else if (orderFilter === 'orange') list = activeOrders().filter(o => o.severity === 'orange');
  else if (orderFilter === 'overdue') list = activeOrders().filter(o => { const d = daysFromToday(o.target_date); return d !== null && d < 0; });
  else if (orderFilter === 'complete') list = DB.work_orders.filter(o => !isOpen(o))
    .sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
  else list = DB.work_orders.slice().sort((a, b) => (b.number || 0) - (a.number || 0));

  view.innerHTML = `
    <div class="filters">
      ${filters.map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${orderFilter === k}">${l}</button>`).join('')}
    </div>
    ${list.length ? list.map(woCard).join('')
      : `<div class="empty"><b>Nothing here</b>No work orders match this filter.</div>`}`;

  $$('[data-f]', view).forEach(b => b.onclick = () => { orderFilter = b.dataset.f; renderOrders(view); });
  wireWoCards(view);
}

/* ================================================================
   Screen — report damage (creates the work order)
   ================================================================ */
function renderReport(view) {
  const gear = sortedGear(activeGear());
  if (!gear.length) {
    view.innerHTML = `<div class="empty"><b>No gear on the list yet</b>Add the fleet first.</div>
      <a class="btn primary wide" href="#/gearadmin">Manage gear</a>`;
    return;
  }

  const preset = route.query.gear || '';
  const draft = { severity: 'orange', files: [] };

  view.innerHTML = `
    <div class="card">
      <label class="field">
        <span>Which gear?</span>
        <select id="gearSel">
          <option value="">Choose…</option>
          ${allCategoryKeys().filter(k => gear.some(g => catOf(g) === k)).map(k => `
            <optgroup label="${esc(catPlural(k))}">
              ${gear.filter(g => catOf(g) === k).map(g =>
                `<option value="${g.id}" ${g.id === preset ? 'selected' : ''}>${esc(g.code)}${g.name ? ' — ' + esc(g.name) : ''}</option>`).join('')}
            </optgroup>`).join('')}
        </select>
      </label>

      <label class="field">
        <span>What's wrong? (short)</span>
        <input type="text" id="woTitle" placeholder="e.g. Hydraulic leak on left ram" maxlength="120">
      </label>

      <label class="field">
        <span>Details for the workshop</span>
        <textarea id="desc" placeholder="What happened, when, anything the workshop needs to know."></textarea>
      </label>
    </div>

    <div class="card">
      <h2>Can it still be used?</h2>
      <div class="choice" id="sev">
        <button type="button" class="status-orange" data-sev="orange" aria-pressed="true">
          <span class="bulb"></span>
          <span><b>Damaged but usable</b><span>It can keep working. Fix it when you can.</span></span>
        </button>
        <button type="button" class="status-red" data-sev="red" aria-pressed="false">
          <span class="bulb"></span>
          <span><b>Out of operation</b><span>Do not use. Off the job until it's fixed.</span></span>
        </button>
      </div>
    </div>

    <div class="card">
      <label class="field">
        <span>Where is the gear now?</span>
        <input type="text" id="loc" placeholder="Site, yard or address">
      </label>
      <button class="btn sm" id="gps" type="button">Use my GPS</button>
    </div>

    <div class="card">
      <h2>Photos of the damage</h2>
      <input type="file" id="photos" accept="image/*" multiple hidden>
      <button class="btn wide" id="addPhoto" type="button">${icon('camera')}Add photos</button>
      <div class="thumbs" id="thumbs"></div>
    </div>

    <div class="card">
      <label class="field">
        <span>Reported by</span>
        <input type="text" id="by" value="${esc(S.name)}" placeholder="Your name">
      </label>
    </div>

    <button class="btn primary wide" id="submit">Raise work order</button>
    <p class="muted small center mt">A work order is created and appears on the workshop screen straight away.</p>`;

  $$('#sev button', view).forEach(b => b.onclick = () => {
    draft.severity = b.dataset.sev;
    $$('#sev button', view).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });

  const gearSel = $('#gearSel', view);
  const locInput = $('#loc', view);
  const syncLoc = () => {
    const g = gearById(gearSel.value);
    if (g && !locInput.value) locInput.value = g.location || '';
  };
  gearSel.onchange = syncLoc;
  syncLoc();

  $('#gps', view).onclick = () => {
    if (!navigator.geolocation) return toast('This device has no GPS');
    toast('Getting GPS…');
    navigator.geolocation.getCurrentPosition(pos => {
      const c = pos.coords;
      const txt = `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`;
      locInput.value = locInput.value ? `${locInput.value} (${txt})` : txt;
      toast('GPS added');
    }, () => toast('Could not get GPS'), { enableHighAccuracy: true, timeout: 12000 });
  };

  const fileInput = $('#photos', view);
  $('#addPhoto', view).onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    for (const f of Array.from(fileInput.files || [])) {
      draft.files.push(await compressImage(f));
    }
    fileInput.value = '';
    paintThumbs();
  };
  function paintThumbs() {
    const box = $('#thumbs', view);
    box.innerHTML = '';
    draft.files.forEach((f, i) => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.title = 'Tap to remove';
      img.onclick = () => { draft.files.splice(i, 1); paintThumbs(); };
      box.appendChild(img);
    });
  }

  $('#submit', view).onclick = async function () {
    const gear_id = gearSel.value;
    const title = $('#woTitle', view).value.trim();
    const by = $('#by', view).value.trim();

    if (!gear_id) return toast('Pick which gear it is');
    if (!title) return toast('Say what is wrong');
    if (!by) return toast('Enter your name');

    if (by !== S.name) Settings.write({ name: by });

    this.disabled = true;
    this.textContent = 'Raising work order…';
    try {
      const order = await createWorkOrder({
        gear_id,
        title,
        description: $('#desc', view).value.trim(),
        severity: draft.severity,
        location: locInput.value.trim()
      }, draft.files);
      toast(connected() ? 'Work order raised' : 'Saved on this device');
      go('#/wo/' + order.id);
    } catch (err) {
      this.disabled = false;
      this.textContent = 'Raise work order';
      toast('Could not save: ' + err.message);
    }
  };
}

/* ================================================================
   Screen — work order detail
   ================================================================ */
function renderWorkOrder(view) {
  const o = orderById(route.path.split('/')[2]);
  if (!o) { view.innerHTML = `<div class="empty"><b>Work order not found</b></div>`; return; }
  const g = gearById(o.gear_id) || {};
  const closed = !isOpen(o);
  const due = dueText(o.target_date);
  const ups = updatesFor(o.id);

  $('#title').textContent = woNo(o);

  view.innerHTML = `
    <div class="card accent status-${closed ? 'green' : o.severity}">
      <div class="tiny" style="color:var(--ink-3);letter-spacing:.03em;font-weight:700">${woNo(o)}</div>
      <h2 style="font-size:19px;margin:2px 0 4px">${esc(o.title)}</h2>
      <a class="small muted" href="#/gear/${o.gear_id}">${esc(g.code || '')}${g.name ? ' — ' + esc(g.name) : ''}</a>
      <div style="margin-top:11px">
        <span class="pill"><span class="swatch"></span>${closed ? 'Fixed' : STATUS_TEXT[o.severity]}</span>
      </div>
      ${o.description ? `<p class="small mt" style="white-space:pre-wrap;margin-bottom:0">${esc(o.description)}</p>` : ''}
    </div>

    <div class="card">
      <table class="data">
        <tr><th>Status</th><td>${statusLabel(o.status)}</td></tr>
        <tr><th>Managed by</th><td>${assignedTo(o)
          ? `<a href="#/crew/${encodeURIComponent(assignedTo(o))}">${esc(assignedTo(o))}</a>`
          : '<span class="muted">nobody yet</span>'}</td></tr>
        <tr><th>Reported</th><td>${esc(o.reported_by || '—')} · ${fmtDateTime(o.reported_at)}</td></tr>
        <tr><th>Location</th><td>${esc(o.location_at_report || g.location || '—')}</td></tr>
        <tr><th>Back in service</th><td>${o.target_date
            ? `${fmtDate(o.target_date)} <span class="${due.late && !closed ? 'overdue' : 'muted'}">(${due.text})</span>`
            : '<span class="muted">not set</span>'}</td></tr>
        <tr><th>Repaired by</th><td>${o.repairer === 'external'
            ? 'External — ' + esc(o.external_company || 'company not named') + (o.external_ref ? ` (ref ${esc(o.external_ref)})` : '')
            : o.repairer === 'internal' ? 'RCK workshop crew' : '<span class="muted">not decided</span>'}</td></tr>
        ${o.cost ? `<tr><th>Cost</th><td>$${esc(Number(o.cost).toFixed(2))}</td></tr>` : ''}
        ${closed ? `<tr><th>Completed</th><td>${fmtDateTime(o.completed_at)}${o.completed_by ? ' · ' + esc(o.completed_by) : ''}</td></tr>` : ''}
        ${closed && o.work_done ? `<tr><th>Work done</th><td style="white-space:pre-wrap">${esc(o.work_done)}</td></tr>` : ''}
      </table>
      <div class="btn-row mt">
        <button class="btn sm" id="printWo">${icon('printer')}Print work order</button>
      </div>
    </div>

    ${isWorkshop() ? workshopPanel(o) : `<div class="banner info">Only devices set to <strong>Workshop</strong> can change status,
      set a fix date or close this job. You can still add a comment below.</div>`}

    <div class="section-title">History</div>
    <div class="card">
      <div class="tl">${ups.map(tlItem).join('') || '<p class="muted small">Nothing yet.</p>'}</div>
    </div>

    <div class="card">
      <label class="field"><span>Add a comment</span>
        <textarea id="cmt" placeholder="Notes on the fault, parts ordered, what you found…"></textarea>
      </label>
      <button class="btn wide" id="postCmt">Post comment</button>
    </div>`;

  $('#printWo', view).onclick = () => printWorkOrder(o);

  $('#postCmt', view).onclick = async function () {
    const body = $('#cmt', view).value.trim();
    if (!body) return toast('Write something first');
    this.disabled = true;
    await logUpdate(o.id, 'comment', body);
    toast('Comment added');
    render();
  };

  if (isWorkshop()) wireWorkshopPanel(view, o);
}

function tlItem(u) {
  const m = u.meta || {};
  const isFile = u.kind === 'file' && m.url;
  const isImage = isFile && /^image\//.test(m.type || '');
  const strong = ['created', 'status', 'complete', 'external', 'reopen'].includes(u.kind);
  return `
    <div class="tl-item ${strong ? 'mark' : ''}">
      <div class="tl-when">${fmtDateTime(u.created_at)}</div>
      <div class="tl-who">${esc(u.author || 'Unknown')}${u.role === 'workshop' ? ' · Workshop' : ''}</div>
      ${u.body ? `<div class="tl-body">${esc(u.body)}</div>` : ''}
      ${isImage
        ? `<div class="thumbs"><a href="${esc(m.url)}" target="_blank" rel="noopener"><img src="${esc(m.url)}" alt=""></a></div>`
        : isFile
          ? `<a class="attach" href="${esc(m.url)}" target="_blank" rel="noopener">${icon('clip')}${esc(m.name || 'Attachment')}</a>`
          : ''}
      ${m.pending ? '<div class="tiny muted">Held on this device until there is signal.</div>' : ''}
    </div>`;
}

function workshopPanel(o) {
  const closed = !isOpen(o);
  return `
    <div class="section-title">Workshop</div>
    <div class="card">
      <div class="row" style="gap:10px">
        <label class="field grow"><span>Status</span>
          <select id="wStatus">
            ${WO_STATUS.filter(s => s.open || closed).map(s =>
              `<option value="${s.key}" ${o.status === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </label>
        <label class="field grow"><span>Severity</span>
          <select id="wSeverity">
            <option value="orange" ${o.severity === 'orange' ? 'selected' : ''}>Usable (yellow)</option>
            <option value="red" ${o.severity === 'red' ? 'selected' : ''}>Out of operation (red)</option>
          </select>
        </label>
      </div>

      <label class="field"><span>Managed by</span>
        <select id="wAssign">
          <option value="">Nobody yet</option>
          ${crewNames().map(n =>
            `<option value="${esc(n)}" ${assignedTo(o).toLowerCase() === n.toLowerCase() ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          <option value="__new">+ Add someone…</option>
        </select>
      </label>

      <label class="field"><span>Expected back in service</span>
        <input type="date" id="wTarget" value="${esc((o.target_date || '').slice(0, 10))}">
      </label>

      <label class="field"><span>Who is doing the repair?</span>
        <select id="wRepairer">
          <option value="" ${!o.repairer ? 'selected' : ''}>Not decided</option>
          <option value="internal" ${o.repairer === 'internal' ? 'selected' : ''}>RCK workshop crew</option>
          <option value="external" ${o.repairer === 'external' ? 'selected' : ''}>External company</option>
        </select>
      </label>

      <div id="extBox" ${o.repairer === 'external' ? '' : 'hidden'}>
        <label class="field"><span>Company</span>
          <input type="text" id="wCompany" value="${esc(o.external_company || '')}" placeholder="e.g. Hydraulink"></label>
        <label class="field"><span>Their job / invoice number</span>
          <input type="text" id="wRef" value="${esc(o.external_ref || '')}" placeholder="Optional"></label>
        <label class="field"><span>Cost (NZD)</span>
          <input type="number" id="wCost" step="0.01" value="${o.cost != null ? esc(o.cost) : ''}" placeholder="Optional"></label>
      </div>

      <button class="btn primary wide" id="wSave">Save changes</button>
    </div>

    <div class="card">
      <h2>Upload paperwork</h2>
      <p class="muted small">Report, invoice or photos from the external repairer — or your own photos of the fix.</p>
      <input type="file" id="wFile" hidden multiple>
      <label class="field mt"><span>Note to go with the files</span>
        <input type="text" id="wFileNote" placeholder="e.g. Hydraulink service report, 12 Aug"></label>
      <button class="btn wide" id="wUpload">Choose files &amp; upload</button>
    </div>

    <div class="card">
      ${closed
        ? `<button class="btn wide" id="wReopen">Reopen this work order</button>`
        : `<h2>Sign it off</h2>
           <label class="field"><span>What was done?</span>
             <textarea id="wDone" placeholder="Describe the repair: parts replaced, work carried out, who did it."></textarea></label>
           <button class="btn primary wide" id="wComplete">Mark fixed &amp; back in service</button>
           <button class="btn wide mt" id="wCancel">Cancel this work order</button>`}
    </div>`;
}

function wireWorkshopPanel(view, o) {
  const repairer = $('#wRepairer', view);
  if (repairer) {
    repairer.onchange = () => { $('#extBox', view).hidden = repairer.value !== 'external'; };
  }

  const assign = $('#wAssign', view);
  if (assign) {
    let previous = assign.value;
    assign.onchange = async () => {
      if (assign.value !== '__new') { previous = assign.value; return; }
      const typed = (prompt('Who is managing this job?\n\nEnter their name to add them to the crew.') || '').trim();
      if (!typed) { assign.value = previous; return; }
      const existing = matchCrew(typed);
      const name = existing || typed;
      if (existing) {
        toast(`${existing} is already on the crew`);
      } else {
        await addCrewMember(name);
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        assign.insertBefore(opt, assign.querySelector('option[value="__new"]'));
      }
      assign.value = name;
      previous = name;
    };
  }

  const save = $('#wSave', view);
  if (save) save.onclick = async function () {
    const assign = $('#wAssign', view).value;
    if (assign === '__new') return toast('Name the person first');

    const patch = {
      assigned_to: assign,
      status: $('#wStatus', view).value,
      severity: $('#wSeverity', view).value,
      target_date: $('#wTarget', view).value || null,
      repairer: repairer.value || null,
      external_company: repairer.value === 'external' ? $('#wCompany', view).value.trim() : '',
      external_ref: repairer.value === 'external' ? $('#wRef', view).value.trim() : '',
      cost: repairer.value === 'external' && $('#wCost', view).value ? Number($('#wCost', view).value) : null,
      updated_at: new Date().toISOString()
    };

    const notes = [];
    if (patch.assigned_to !== assignedTo(o)) {
      notes.push(patch.assigned_to
        ? `Assigned to ${patch.assigned_to}`
        : `Unassigned${assignedTo(o) ? ' (was ' + assignedTo(o) + ')' : ''}`);
    }
    if (patch.status !== o.status) notes.push(`Status: ${statusLabel(o.status)} → ${statusLabel(patch.status)}`);
    if (patch.severity !== o.severity) notes.push(`Now ${STATUS_TEXT[patch.severity].toLowerCase()}`);
    if ((patch.target_date || '') !== (o.target_date || '')) {
      notes.push(patch.target_date ? `Back in service expected ${fmtDate(patch.target_date)}` : 'Fix date cleared');
    }
    if ((patch.repairer || '') !== (o.repairer || '')) {
      notes.push(patch.repairer === 'external'
        ? `Sent to external repairer${patch.external_company ? ': ' + patch.external_company : ''}`
        : patch.repairer === 'internal' ? 'Being repaired in-house by the RCK workshop crew' : 'Repairer cleared');
    }

    this.disabled = true;
    await Store.patch('work_orders', o.id, patch);
    if (notes.length) {
      // normalise both sides: an unset repairer is null on one and undefined
      // on the other, which used to log every plain save as "repairer arranged"
      const repairerChanged = (patch.repairer || '') !== (o.repairer || '');
      await logUpdate(o.id, repairerChanged ? 'external' : 'status', notes.join('\n'), {
        status_from: o.status, status_to: patch.status
      });
    }
    toast('Saved');
    render();
  };

  const upBtn = $('#wUpload', view);
  if (upBtn) {
    const input = $('#wFile', view);
    upBtn.onclick = () => input.click();
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      input.value = '';
      if (!files.length) return;
      const note = ($('#wFileNote', view).value || '').trim();
      upBtn.disabled = true;
      upBtn.textContent = 'Uploading…';
      const added = [];
      for (const raw of files) {
        const f = await compressImage(raw);
        const up = await Store.upload(f);
        await logUpdate(o.id, 'file', note || (o.repairer === 'external' ? 'Paperwork from external repairer' : 'Attachment'), up);
        added.push(up);
      }
      const n = added.length;
      if (n) {
        const pics = added.filter(f => /^image\//.test(f.type || '')).length;
        const label = pics === n ? `Photo${n === 1 ? '' : 's'} added`
                    : pics ? 'Photos and paperwork added' : 'Paperwork added';
        await autoDiary(o.id, 'file', note || `${n} file${n === 1 ? '' : 's'} added`,
          { label, files: added });
      }
      toast(`${n} file${n === 1 ? '' : 's'} added`);
      render();
    };
  }

  const complete = $('#wComplete', view);
  if (complete) complete.onclick = async function () {
    const done = $('#wDone', view).value.trim();
    if (!done) return toast('Record what was done first');
    this.disabled = true;
    const now = new Date().toISOString();
    await Store.patch('work_orders', o.id, {
      status: 'complete', completed_at: now, completed_by: whoami(), work_done: done, updated_at: now
    });
    await logUpdate(o.id, 'complete', `Fixed and back in service.\n${done}`);
    toast('Signed off — gear is green again');
    render();
  };

  const cancel = $('#wCancel', view);
  if (cancel) cancel.onclick = async function () {
    const why = prompt('Cancel this work order. Why?', '');
    if (why === null) return;
    const now = new Date().toISOString();
    await Store.patch('work_orders', o.id, { status: 'cancelled', completed_at: now, completed_by: whoami(), updated_at: now });
    await logUpdate(o.id, 'status', 'Work order cancelled.' + (why ? ' ' + why : ''));
    render();
  };

  const reopen = $('#wReopen', view);
  if (reopen) reopen.onclick = async function () {
    await Store.patch('work_orders', o.id, {
      status: 'in_progress', completed_at: null, updated_at: new Date().toISOString()
    });
    await logUpdate(o.id, 'reopen', 'Work order reopened — the fault is back or the repair was not complete.');
    render();
  };
}

/* ================================================================
   Screen — manage gear
   ================================================================ */

/** Every known type, plus the option to name a new one. */
function typeOptions(selected) {
  return allCategoryKeys().map(k =>
      `<option value="${esc(k)}" ${k === selected ? 'selected' : ''}>${esc(catLabel(k))}</option>`).join('')
    + `<option value="__new">+ Add a new type…</option>`;
}

/** Turns "+ Add a new type…" into a real, immediately usable type. */
function wireTypeSelect(sel) {
  let previous = sel.value;
  sel.onchange = () => {
    if (sel.value !== '__new') { previous = sel.value; return; }

    const typed = (prompt('What type of gear is this?\n\nName one of them, e.g. "Emulsion trailer".') || '').trim();
    if (!typed) { sel.value = previous; return; }

    // Reuse an existing type if it is the same thing spelled differently,
    // so the fleet doesn't end up with three flavours of the same word.
    const existing = matchCategory(typed);
    const key = existing || typed;
    if (existing) {
      toast(`Already have "${catLabel(existing)}" — using that`);
    } else {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      sel.insertBefore(opt, sel.querySelector('option[value="__new"]'));
    }
    sel.value = key;
    previous = key;
  };
}

function renderGearAdmin(view) {
  const gear = sortedGear(DB.gear);

  view.innerHTML = `
    <div class="card">
      <h2>Add gear</h2>
      <div class="row" style="gap:10px">
        <label class="field grow"><span>Code</span><input type="text" id="nCode" placeholder="TRK-07"></label>
        <label class="field grow"><span>Type</span>
          <select id="nCat">${typeOptions()}</select>
        </label>
      </div>
      <label class="field"><span>Name</span><input type="text" id="nName" placeholder="Truck 7"></label>
      <label class="field"><span>Make / model (optional)</span><input type="text" id="nModel" placeholder="Isuzu FVZ"></label>
      <label class="field"><span>Location (optional)</span><input type="text" id="nLoc" placeholder="Yard"></label>
      <button class="btn primary wide" id="addGear">Add to the fleet</button>
    </div>

    ${!DB.gear.length ? `
      <div class="card">
        <h2>Load the RCK fleet</h2>
        <p class="muted small">Creates 5 millers, 5 pavers, 7 rollers, 4 bobcats, 6 trucks and 6 trailers
        with codes like MIL-01 and TRK-03. Rename or add to them any time.</p>
        <button class="btn wide" id="seed">Load the standard fleet (33 items)</button>
      </div>` : ''}

    <div class="section-title">Fleet (${gear.length})</div>
    ${gear.map(g => `
      <div class="card row spread" style="padding:11px 13px">
        <div class="grow">
          <strong>${esc(g.code)}</strong> <span class="muted small">${esc(g.name || '')}</span>
          <div class="tiny muted">${catLabel(catOf(g))}${g.make_model ? ' · ' + esc(g.make_model) : ''}${g.retired ? ' · RETIRED' : ''}</div>
        </div>
        <a class="btn sm" href="#/gearedit/${g.id}">Edit</a>
        <button class="btn sm" data-retire="${g.id}">${g.retired ? 'Restore' : 'Retire'}</button>
      </div>`).join('') || '<div class="card muted small">No gear yet.</div>'}`;

  wireTypeSelect($('#nCat', view));

  $('#addGear', view).onclick = async function () {
    const code = $('#nCode', view).value.trim().toUpperCase();
    const category = $('#nCat', view).value;
    if (category === '__new') return toast('Name the new type first');
    if (!code) return toast('Give it a code');
    if (DB.gear.some(g => (g.code || '').toUpperCase() === code)) return toast('That code is already used');
    this.disabled = true;
    await Store.insert('gear', {
      id: uid(),
      code,
      name: $('#nName', view).value.trim(),
      category,
      make_model: $('#nModel', view).value.trim(),
      location: $('#nLoc', view).value.trim(),
      location_updated_at: $('#nLoc', view).value.trim() ? new Date().toISOString() : null,
      location_updated_by: $('#nLoc', view).value.trim() ? whoami() : '',
      retired: false
    });
    toast('Gear added');
    render();
  };

  const seed = $('#seed', view);
  if (seed) seed.onclick = async function () {
    this.disabled = true;
    this.textContent = 'Creating…';
    for (const [cat, n] of SEED_FLEET) {
      const c = builtinCat(cat);
      for (let i = 1; i <= n; i++) {
        await Store.insert('gear', {
          id: uid(),
          code: `${c.prefix}-${String(i).padStart(2, '0')}`,
          name: `${c.one} ${i}`,
          category: cat,
          make_model: '', location: '', retired: false
        });
      }
    }
    toast('Fleet created');
    render();
  };

  $$('[data-retire]', view).forEach(b => b.onclick = async () => {
    const g = gearById(b.dataset.retire);
    await Store.patch('gear', g.id, { retired: !g.retired });
    render();
  });
}

/* ================================================================
   Screen — edit one piece of gear
   ================================================================ */
function renderGearEdit(view) {
  const g = gearById(route.path.split('/')[2]);
  if (!g) { view.innerHTML = `<div class="empty"><b>Gear not found</b></div>`; return; }

  $('#title').textContent = g.code;

  view.innerHTML = `
    <div class="card">
      <div class="row" style="gap:10px">
        <label class="field grow"><span>Code</span>
          <input type="text" id="eCode" value="${esc(g.code)}"></label>
        <label class="field grow"><span>Type</span>
          <select id="eCat">${typeOptions(catOf(g))}</select></label>
      </div>
      <label class="field"><span>Name</span>
        <input type="text" id="eName" value="${esc(g.name || '')}" placeholder="e.g. Emulsion trailer 1"></label>
      <label class="field"><span>Make / model</span>
        <input type="text" id="eModel" value="${esc(g.make_model || '')}" placeholder="Optional"></label>
      <label class="field"><span>Location</span>
        <input type="text" id="eLoc" value="${esc(g.location || '')}" placeholder="Site, yard or address"></label>
      <button class="btn primary wide" id="eSave">Save changes</button>
    </div>

    <div class="card">
      <h2>${g.retired ? 'Retired' : 'Retire this gear'}</h2>
      <p class="muted small">${g.retired
        ? 'It is hidden from the board and cannot have damage reported against it. Its repair history is kept.'
        : 'For gear that has been sold or scrapped. It disappears from the board but keeps its full repair history.'}</p>
      <button class="btn wide" id="eRetire">${g.retired ? 'Put back in the fleet' : 'Retire it'}</button>
    </div>`;

  wireTypeSelect($('#eCat', view));

  $('#eSave', view).onclick = async function () {
    const code = $('#eCode', view).value.trim().toUpperCase();
    const category = $('#eCat', view).value;
    if (!code) return toast('It needs a code');
    if (category === '__new') return toast('Name the new type first');
    if (DB.gear.some(x => x.id !== g.id && (x.code || '').toUpperCase() === code)) {
      return toast('Another machine already uses that code');
    }

    this.disabled = true;
    const loc = $('#eLoc', view).value.trim();
    const patch = {
      code,
      category,
      name: $('#eName', view).value.trim(),
      make_model: $('#eModel', view).value.trim(),
      location: loc
    };
    if (loc !== (g.location || '')) {
      patch.location_updated_at = new Date().toISOString();
      patch.location_updated_by = whoami();
    }
    await Store.patch('gear', g.id, patch);
    toast('Saved');
    go('#/gearadmin');
  };

  $('#eRetire', view).onclick = async () => {
    await Store.patch('gear', g.id, { retired: !g.retired });
    toast(g.retired ? 'Back in the fleet' : 'Retired');
    go('#/gearadmin');
  };
}

/* ================================================================
   Screen — reports
   ================================================================ */
function renderReports(view) {
  const gear = sortedGear(activeGear());
  view.innerHTML = `
    <div class="card">
      <h2>Fleet status report</h2>
      <p class="muted small">Every piece of gear, its colour, where it is and what is outstanding.</p>
      <button class="btn primary wide" id="fleet">Generate</button>
    </div>

    <div class="card">
      <h2>Repair history report</h2>
      <p class="muted small">Every repair with what was done, who did it, how long it was down and any cost.</p>
      <label class="field"><span>Gear</span>
        <select id="hGear">
          <option value="all">All gear</option>
          ${gear.map(g => `<option value="${g.id}">${esc(g.code)}${g.name ? ' — ' + esc(g.name) : ''}</option>`).join('')}
        </select>
      </label>
      <div class="row" style="gap:10px">
        <label class="field grow"><span>From</span><input type="date" id="hFrom"></label>
        <label class="field grow"><span>To</span><input type="date" id="hTo"></label>
      </div>
      <button class="btn primary wide" id="hist">Generate history report</button>
    </div>

    <div class="card">
      <h2>Spreadsheet export</h2>
      <p class="muted small">All work orders as a CSV file for Excel.</p>
      <button class="btn wide" id="csv">Download CSV</button>
    </div>`;

  $('#fleet', view).onclick = () => printFleetStatus();
  $('#hist', view).onclick = () => {
    const id = $('#hGear', view).value;
    printHistory(id === 'all' ? null : gearById(id), $('#hFrom', view).value, $('#hTo', view).value);
  };
  $('#csv', view).onclick = exportCsv;
}

function exportCsv() {
  const head = ['Work order', 'Gear', 'Name', 'Type', 'Fault', 'Detail', 'Usable', 'Status',
    'Managed by', 'Reported by', 'Reported', 'Location', 'Expected back', 'Repairer', 'Company',
    'Their ref', 'Cost', 'Completed', 'Completed by', 'Work done', 'Days down'];
  const rows = DB.work_orders
    .slice().sort((a, b) => (a.number || 0) - (b.number || 0))
    .map(o => {
      const g = gearById(o.gear_id) || {};
      return [woNo(o), g.code || '', g.name || '', catLabel(catOf(g)), o.title, o.description,
        o.severity === 'red' ? 'No — out of operation' : 'Yes — usable', statusLabel(o.status),
        assignedTo(o), o.reported_by, fmtDateTime(o.reported_at), o.location_at_report, o.target_date ? fmtDate(o.target_date) : '',
        o.repairer || '', o.external_company || '', o.external_ref || '', o.cost != null ? o.cost : '',
        o.completed_at ? fmtDateTime(o.completed_at) : '', o.completed_by || '', o.work_done || '',
        daysBetween(o.reported_at, o.completed_at) ?? ''];
    });
  downloadCsv([head, ...rows], `rck-work-orders-${today()}.csv`);
}

/** One CSV writer for both portals. The BOM keeps Excel happy with macrons. */
function downloadCsv(rows, filename) {
  const csv = rows
    .map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ================================================================
   Printable documents
   ================================================================ */
function docHead(title, subtitle) {
  return `
    <div class="doc-head">
      <div class="org">RCK</div>
      <h1>${esc(title)}</h1>
      <div>${esc(subtitle || '')}</div>
      <div style="font-size:9.5pt;color:#555">Generated ${fmtDateTime(new Date().toISOString())}${S.name ? ' by ' + esc(S.name) : ''}</div>
    </div>`;
}
/** Render, wait for any photos to load (so they aren't blank on the PDF), then print. */
async function printDoc(html) {
  const area = $('#printArea');
  area.innerHTML = `<div class="doc">${html}</div>`;
  const imgs = $$('img', area);
  if (imgs.length) {
    toast('Preparing document…');
    await Promise.race([
      Promise.all(imgs.map(img => img.complete ? Promise.resolve()
        : new Promise(res => { img.onload = img.onerror = res; }))),
      new Promise(res => setTimeout(res, 6000))
    ]);
  }
  setTimeout(() => window.print(), 80);
}
function badge(sev, closed) {
  return `<span class="badge">${closed ? 'FIXED — GREEN' : sev === 'red' ? 'OUT OF OPERATION — RED' : 'USABLE — YELLOW'}</span>`;
}

function printWorkOrder(o) {
  const g = gearById(o.gear_id) || {};
  const closed = !isOpen(o);
  const ups = updatesFor(o.id);

  printDoc(`
    ${docHead('Work order ' + woNo(o), `${g.code || ''} — ${g.name || catLabel(catOf(g))}`)}
    <p>${badge(o.severity, closed)}</p>

    <h2>Gear</h2>
    <table class="kv">
      <tr><td>Code</td><td><strong>${esc(g.code || '')}</strong></td></tr>
      <tr><td>Name</td><td>${esc(g.name || '')}</td></tr>
      <tr><td>Type</td><td>${catLabel(catOf(g))}</td></tr>
      <tr><td>Make / model</td><td>${esc(g.make_model || '—')}</td></tr>
      <tr><td>Location</td><td>${esc(o.location_at_report || g.location || '—')}</td></tr>
    </table>

    <h2>Fault reported</h2>
    <table class="kv">
      <tr><td>Fault</td><td><strong>${esc(o.title)}</strong></td></tr>
      <tr><td>Reported by</td><td>${esc(o.reported_by || '—')}</td></tr>
      <tr><td>Reported</td><td>${fmtDateTime(o.reported_at)}</td></tr>
      <tr><td>Still usable?</td><td>${o.severity === 'red' ? 'NO — out of operation' : 'Yes — damaged but usable'}</td></tr>
    </table>
    ${o.description ? `<p class="note">${esc(o.description)}</p>` : ''}

    <h2>Repair</h2>
    <table class="kv">
      <tr><td>Status</td><td>${statusLabel(o.status)}</td></tr>
      <tr><td>Managed by</td><td>${esc(assignedTo(o) || 'Not assigned')}</td></tr>
      <tr><td>Expected back in service</td><td>${o.target_date ? fmtDate(o.target_date) : 'Not set'}</td></tr>
      <tr><td>Repaired by</td><td>${o.repairer === 'external'
        ? 'External — ' + esc(o.external_company || '—') : o.repairer === 'internal' ? 'RCK workshop crew' : 'Not decided'}</td></tr>
      ${o.external_ref ? `<tr><td>Their reference</td><td>${esc(o.external_ref)}</td></tr>` : ''}
      ${o.cost != null ? `<tr><td>Cost</td><td>$${esc(Number(o.cost).toFixed(2))}</td></tr>` : ''}
      ${closed ? `<tr><td>Completed</td><td>${fmtDateTime(o.completed_at)} · ${esc(o.completed_by || '')}</td></tr>` : ''}
      ${closed ? `<tr><td>Days out</td><td>${daysBetween(o.reported_at, o.completed_at) ?? '—'}</td></tr>` : ''}
    </table>
    ${o.work_done ? `<p class="note"><strong>Work done:</strong> ${esc(o.work_done)}</p>` : ''}

    <h2>History</h2>
    <table>
      <tr><th style="width:34mm">When</th><th style="width:32mm">Who</th><th>Entry</th></tr>
      ${ups.map(u => `<tr class="avoid-break">
        <td>${fmtDateTime(u.created_at)}</td>
        <td>${esc(u.author || '')}${u.role === 'workshop' ? '<br><em>Workshop</em>' : ''}</td>
        <td class="note">${esc(u.body || '')}${u.kind === 'file' && u.meta && u.meta.name ? `<br><em>Attached: ${esc(u.meta.name)}</em>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="3">No entries.</td></tr>'}
    </table>

    ${photoSheet(ups)}

    <div class="sig">
      <div>Workshop sign-off &amp; date</div>
      <div>Returned to operator &amp; date</div>
    </div>`);
}

/** Photos attached to a work order, laid out for the printed sheet. */
function photoSheet(updates) {
  const photos = updates.filter(u => u.kind === 'file' && u.meta && u.meta.url && /^image\//.test(u.meta.type || ''));
  if (!photos.length) return '';
  return `
    <h2>Photos</h2>
    <div style="display:flex;flex-wrap:wrap;gap:4mm">
      ${photos.map(p => `
        <div class="avoid-break" style="width:80mm">
          <img src="${esc(p.meta.url)}" style="width:100%;border:.6pt solid #999">
          <div style="font-size:9pt;color:#444">${esc(p.body || '')} — ${fmtDate(p.created_at)}</div>
        </div>`).join('')}
    </div>`;
}

function printGearHistory(g) { printHistory(g, '', ''); }

function printHistory(g, from, to) {
  const inRange = o => {
    const d = (o.completed_at || o.reported_at || '').slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };
  const list = DB.work_orders
    .filter(o => (!g || o.gear_id === g.id) && inRange(o))
    .sort((a, b) => String(b.reported_at || '').localeCompare(String(a.reported_at || '')));

  const closedList = list.filter(o => o.status === 'complete');
  const totalCost = list.reduce((s, o) => s + (Number(o.cost) || 0), 0);
  const downDays = closedList.reduce((s, o) => s + (o.severity === 'red' ? (daysBetween(o.reported_at, o.completed_at) || 0) : 0), 0);

  const range = from || to
    ? `${from ? fmtDate(from) : 'start'} to ${to ? fmtDate(to) : 'today'}`
    : 'All records';

  printDoc(`
    ${docHead('Repair history', g ? `${g.code} — ${g.name || catLabel(catOf(g))} · ${range}` : `Whole fleet · ${range}`)}

    <h2>Summary</h2>
    <table class="kv">
      <tr><td>Work orders</td><td>${list.length} (${closedList.length} completed, ${list.filter(isOpen).length} still open)</td></tr>
      <tr><td>Out-of-operation days</td><td>${downDays}</td></tr>
      <tr><td>Recorded repair cost</td><td>$${totalCost.toFixed(2)}</td></tr>
      <tr><td>External repairs</td><td>${list.filter(o => o.repairer === 'external').length}</td></tr>
      <tr><td>In-house repairs</td><td>${list.filter(o => o.repairer === 'internal').length}</td></tr>
    </table>

    <h2>Repairs</h2>
    ${list.length ? list.map(o => {
      const gg = gearById(o.gear_id) || {};
      const ups = updatesFor(o.id);
      return `
        <div class="avoid-break" style="margin-bottom:6mm">
          <table class="kv" style="margin-bottom:1mm">
            <tr><td style="width:34mm"><strong>${woNo(o)}</strong></td>
                <td><strong>${esc(gg.code || '')}</strong> — ${esc(o.title)} ${badge(o.severity, !isOpen(o))}</td></tr>
          </table>
          <table>
            <tr><th style="width:32mm">Reported</th><td>${fmtDate(o.reported_at)} by ${esc(o.reported_by || '—')}</td></tr>
            <tr><th>Fault</th><td class="note">${esc(o.description || o.title)}</td></tr>
            <tr><th>Repaired by</th><td>${o.repairer === 'external'
                ? 'External — ' + esc(o.external_company || '—') + (o.external_ref ? ` (ref ${esc(o.external_ref)})` : '')
                : o.repairer === 'internal' ? 'RCK workshop crew' : '—'}</td></tr>
            <tr><th>Work done</th><td class="note">${esc(o.work_done || (isOpen(o) ? '(still open — ' + statusLabel(o.status) + ')' : '—'))}</td></tr>
            <tr><th>Completed</th><td>${o.completed_at ? fmtDate(o.completed_at) + ' by ' + esc(o.completed_by || '—') : '—'}${
                o.completed_at ? ` · ${daysBetween(o.reported_at, o.completed_at)} days` : ''}</td></tr>
            ${o.cost != null ? `<tr><th>Cost</th><td>$${Number(o.cost).toFixed(2)}</td></tr>` : ''}
            ${ups.some(u => u.kind === 'file') ? `<tr><th>Paperwork</th><td>${
                ups.filter(u => u.kind === 'file').map(u => esc((u.meta || {}).name || 'file')).join(', ')}</td></tr>` : ''}
          </table>
        </div>`;
    }).join('') : '<p>No repairs recorded for this period.</p>'}`);
}

function printFleetStatus() {
  const gear = sortedGear(activeGear());
  const counts = { green: 0, orange: 0, red: 0 };
  gear.forEach(g => counts[gearStatus(g)]++);

  printDoc(`
    ${docHead('Fleet status', `${gear.length} items · ${counts.green} working · ${counts.orange} usable · ${counts.red} out of operation`)}
    ${allCategoryKeys().filter(k => gear.some(g => catOf(g) === k)).map(k => `
      <h2>${esc(catPlural(k))}</h2>
      <table>
        <tr><th style="width:24mm">Code</th><th>Name</th><th style="width:34mm">Status</th>
            <th>Location</th><th style="width:28mm">Back in service</th></tr>
        ${gear.filter(g => catOf(g) === k).map(g => {
          const st = gearStatus(g);
          const eta = gearEta(g);
          return `<tr>
            <td><strong>${esc(g.code)}</strong></td>
            <td>${esc(g.name || '')}</td>
            <td>${st === 'green' ? 'GREEN — working' : st === 'orange' ? 'YELLOW — usable' : 'RED — out of operation'}</td>
            <td>${esc(g.location || '—')}</td>
            <td>${eta ? fmtDate(eta) : st === 'green' ? '—' : 'not set'}</td>
          </tr>`;
        }).join('')}
      </table>`).join('')}

    <h2>Open work orders</h2>
    <table>
      <tr><th style="width:22mm">WO</th><th style="width:20mm">Gear</th><th>Fault</th>
          <th style="width:32mm">Status</th><th style="width:26mm">Due</th></tr>
      ${activeOrders().map(o => {
        const g = gearById(o.gear_id) || {};
        return `<tr>
          <td>${woNo(o)}</td><td><strong>${esc(g.code || '')}</strong></td>
          <td>${esc(o.title)}</td><td>${statusLabel(o.status)}</td>
          <td>${o.target_date ? fmtDate(o.target_date) : 'not set'}</td></tr>`;
      }).join('') || '<tr><td colspan="5">Nothing outstanding.</td></tr>'}
    </table>`);
}

/* ================================================================
   Screen — workshop wall display
   ================================================================ */
let kioskTimer = null;
let wakeLock = null;

function stopKiosk() {
  if (kioskTimer) { clearInterval(kioskTimer); kioskTimer = null; }
  if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
}

async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {}
}

function renderKiosk(view) {
  keepAwake();
  paint();
  kioskTimer = setInterval(async () => {
    try { await Store.pull(); } catch (e) {}
    if (route.path === '/screen') paint();
  }, 15000);

  function paint() {
    const gear = sortedGear(activeGear());
    const counts = { green: 0, orange: 0, red: 0 };
    gear.forEach(g => counts[gearStatus(g)]++);
    const pct = sharePercents([counts.green, counts.orange, counts.red]);
    const orders = activeOrders();
    const now = new Date();
    const clock = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() < 12 ? 'am' : 'pm'}`;

    const attention = boardOrder(gear.filter(g => gearStatus(g) !== 'green'));

    view.innerHTML = `
      <div class="k">
        <div class="k-head">
          <h1>RCK Workshop</h1>
          <div class="grow muted">${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}</div>
          <div class="k-clock">${clock}</div>
        </div>

        <div class="k-tally">
          <div class="status-green"><div class="n">${counts.green}<em>${pct[0]}%</em></div><div class="l">Working</div></div>
          <div class="status-orange"><div class="n">${counts.orange}<em>${pct[1]}%</em></div><div class="l">Damaged — usable</div></div>
          <div class="status-red"><div class="n">${counts.red}<em>${pct[2]}%</em></div><div class="l">Out of operation</div></div>
        </div>

        <div class="k-body">
          <div class="k-col">
            <h2>Active work orders (${orders.length})</h2>
            <div class="k-scroll">
              ${orders.slice(0, 9).map((o, i) => {
                const g = gearById(o.gear_id) || {};
                const due = dueText(o.target_date);
                return `
                  <div class="k-wo status-${o.severity}" style="--i:${i}">
                    <div>
                      <div class="kcode">${esc(g.code || '')}</div>
                      <div class="kno">${woNo(o)}</div>
                    </div>
                    <div style="min-width:0">
                      <div class="kttl">${esc(o.title)}</div>
                      <div class="kmeta">${statusLabel(o.status)}${o.repairer === 'external'
                        ? ' · ' + esc(o.external_company || 'external') : o.repairer === 'internal' ? ' · in-house' : ''}${
                        assignedTo(o) ? ' · ' + esc(assignedTo(o)) : ''}</div>
                    </div>
                    <div class="keta">
                      ${o.target_date
                        ? `<b class="${due.late ? 'late' : ''}">${fmtDate(o.target_date)}</b><span class="${due.late ? 'late' : ''}">${due.text}</span>`
                        : `<b>—</b><span>no date set</span>`}
                    </div>
                  </div>`;
              }).join('') || `<div class="k-allclear status-green">
                    <div class="big">All gear working</div>
                    <div>Nothing outstanding in the workshop.</div>
                  </div>`}
              ${orders.length > 9 ? `<div class="muted" style="padding:6px 4px">+ ${orders.length - 9} more</div>` : ''}
            </div>
          </div>

          <div class="k-col">
            <h2>Gear needing attention</h2>
            <div class="k-scroll k-grid">
              ${attention.map((g, i) => {
                const st = gearStatus(g);
                const eta = gearEta(g);
                const days = daysDown(g);
                return `<div class="k-chip status-${st}" style="--i:${i}">
                  <div class="c">${esc(g.code)}${days === null ? '' : `<em>${days}d</em>`}</div>
                  <div class="s">${st === 'red' ? 'Out of action' : 'Usable'}${eta ? ' · ' + fmtShort(eta) : ''}</div>
                </div>`;
              }).join('') || '<div class="muted">Whole fleet is green.</div>'}
            </div>
          </div>
        </div>

        <div class="k-foot">
          <span>Updated ${clock} · refreshes every 15 seconds${
            connected() ? '' : S.localMode ? ' · PRACTICE MODE (this device only)' : ' · NOT CONNECTED'}</span>
          <span>
            <button id="kFull">Full screen</button>
            <button id="kExit">Exit</button>
          </span>
        </div>
      </div>`;

    $('#kFull', view).onclick = () => {
      const el = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen();
    };
    $('#kExit', view).onclick = () => go('#/');
  }
}

/* ================================================================
   Screen — the landing page: costs or maintenance
   ================================================================ */
function renderHub(view) {
  const gear = activeGear();
  const open = activeOrders().length;
  const red = gear.filter(g => gearStatus(g) === 'red').length;

  const unassigned = unassignedOrders().length;

  view.innerHTML = `
    <div class="hub">
      <a class="hub-card" href="#/gear">
        <span class="hub-icon">${icon('spanner')}</span>
        <b>Maintenance</b>
        <span class="hub-sub">Gear status, damage reports and repairs</span>
        <span class="hub-stat">${open} open work order${open === 1 ? '' : 's'}${red ? ` · ${red} out of action` : ''}</span>
      </a>

      <a class="hub-card" href="#/crew">
        <span class="hub-icon">${icon('people')}</span>
        <b>Maintenance crew</b>
        <span class="hub-sub">Who is managing which job, and how it is tracking</span>
        <span class="hub-stat">${unassigned
          ? `${unassigned} job${unassigned === 1 ? '' : 's'} not assigned to anyone`
          : (open ? 'Every open job has someone on it' : 'Nothing outstanding')}</span>
      </a>
    </div>

    <p class="muted small center mt">Costs are still in the ⋮ menu.</p>`;
}

/* ================================================================
   Maintenance crew — who is managing what
   ================================================================ */
function crewBanner() {
  return crewTableMissing
    ? `<div class="banner">The crew table isn't in the database yet, so anyone you
       add here won't stick. Run the <strong>Maintenance crew</strong> section at the
       end of <code>supabase-schema.sql</code> in Supabase, then reopen the app.
       Assigning jobs still works meanwhile.</div>`
    : '';
}

function renderCrewBoard(view) {
  const names = crewNames();
  const loose = unassignedOrders();
  const todayCount = logOnDay(today()).length;

  view.innerHTML = `
    ${crewBanner()}
    ${loose.length ? `
      <button class="wo status-red unassigned-tile" id="looseTile">
        <div class="ttl">${loose.length} job${loose.length === 1 ? '' : 's'} not assigned to anyone</div>
        <div class="sub"><span>Nobody is accountable for these yet — tap to assign them</span></div>
      </button>` : `
      <div class="card muted small">Every open job has someone managing it.</div>`}

    <a class="wo diary-tile" href="#/crew-today">
      <div class="hdr"><span class="num">DAILY DIARY</span></div>
      <div class="ttl">${todayCount ? `${todayCount} entr${todayCount === 1 ? 'y' : 'ies'} logged today` : 'Nothing logged today yet'}</div>
      <div class="sub"><span>What everyone has been doing — quotes, parts, time on the tools</span></div>
    </a>

    <div class="section-title">Crew (${names.length})</div>
    <div class="crew-grid">
      ${names.map((n, i) => {
        const st = crewStats(n);
        const tone = st.overdue ? 'status-red' : st.open ? 'status-orange' : 'status-green';
        return `
          <button class="crew-tile ${tone}" data-name="${esc(n)}" style="--i:${Math.min(i, 14)}">
            <span class="avatar">${esc(initials(n))}</span>
            <span class="who">${esc(n)}</span>
            <span class="load">${st.open === 0 ? 'No open jobs'
              : `${st.open} open job${st.open === 1 ? '' : 's'}`}</span>
            ${(() => { const line = tallyLine(dayTally(n, today()));
              return line ? `<span class="today">Today: ${esc(line)}</span>` : ''; })()}
            ${st.overdue ? `<span class="flag">${st.overdue} overdue</span>`
              : st.red ? `<span class="flag amber">${st.red} out of action</span>` : ''}
          </button>`;
      }).join('')}
    </div>

    <button class="btn wide mt" id="addCrew">${icon('plus')}Add someone to the crew</button>`;

  const loose_ = $('#looseTile', view);
  if (loose_) loose_.onclick = () => go('#/crew-unassigned');
  $$('[data-name]', view).forEach(b => b.onclick = () => go('#/crew/' + encodeURIComponent(b.dataset.name)));

  $('#addCrew', view).onclick = async () => {
    const typed = (prompt('Name of the person to add to the maintenance crew:') || '').trim();
    if (!typed) return;
    if (matchCrew(typed)) return toast(`${matchCrew(typed)} is already on the crew`);
    await addCrewMember(typed);
    toast(`${typed} added`);
    render();
  };
}

/** "Sebastion" → "S", "Jo Baker" → "JB" */
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderUnassigned(view) {
  const loose = unassignedOrders();
  $('#title').textContent = 'Unassigned jobs';
  view.innerHTML = loose.length
    ? `<p class="muted small">Open the job and set <strong>Managed by</strong> in the workshop panel.</p>
       ${loose.map(woCard).join('')}`
    : `<div class="empty"><b>Nothing unassigned</b>Every open job has someone on it.</div>`;
  wireWoCards(view);
}

function renderCrewPerson(view) {
  const name = decodeURIComponent(route.path.split('/')[2] || '');
  if (!name) { view.innerHTML = `<div class="empty"><b>Nobody selected</b></div>`; return; }

  const st = crewStats(name);
  const mine = ordersFor(name);
  const open = mine.filter(isOpen).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'red' ? -1 : 1;
    return String(a.reported_at || '').localeCompare(String(b.reported_at || ''));
  });
  const done = mine.filter(o => !isOpen(o))
    .sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
  const days = logDays(name);

  $('#title').textContent = name;

  view.innerHTML = `
    <div class="card crew-head">
      <span class="avatar big">${esc(initials(name))}</span>
      <div class="grow">
        <h2 style="font-size:20px">${esc(name)}</h2>
        <div class="muted small">${st.open ? `Managing ${st.open} open job${st.open === 1 ? '' : 's'}` : 'No open jobs'}</div>
        ${(() => { const line = tallyLine(dayTally(name, today()));
          return line ? `<div class="small" style="margin-top:2px"><strong>Today:</strong> ${esc(line)}</div>` : ''; })()}
      </div>
    </div>

    <div class="tally">
      <button class="status-orange" disabled><span class="n">${st.open}</span><span class="l">Open</span></button>
      <button class="status-red" disabled><span class="n">${st.overdue}</span><span class="l">Overdue</span></button>
      <button class="status-green" disabled><span class="n">${st.done}</span><span class="l">Fixed</span></button>
    </div>

    ${st.noDate ? `<div class="banner">${st.noDate} of these ${st.noDate === 1 ? 'has' : 'have'} no
      back-in-service date set, so nobody can tell if ${st.noDate === 1 ? 'it is' : 'they are'} slipping.</div>` : ''}

    <div class="section-title">Open jobs (${open.length})</div>
    ${open.length ? open.map(woCard).join('')
      : `<div class="card muted small">Nothing outstanding.</div>`}

    <div class="section-title">Diary</div>
    <a class="btn primary wide" href="#/crew-log?who=${encodeURIComponent(name)}">${icon('plus')}Log what you're doing</a>
    ${days.length ? days.slice(0, 5).map(d => `
      <div class="log-day">
        <div class="log-date">${fmtDate(d)}${d === today() ? ' · today' : ''}</div>
        <div class="tally-line">${esc(tallyLine(dayTally(name, d)) || 'nothing counted')}</div>
        <div class="card log-card">${logFor(name, d).map(e => logRow(e)).join('')}</div>
      </div>`).join('')
      : `<div class="card muted small mt">Nothing logged yet.</div>`}
    ${days.length > 5 ? `<p class="muted small center">Showing the last 5 days.
      <a href="#/crew-today">Open the daily diary</a> for any other day.</p>` : ''}

    <div class="section-title">Completed (${done.length})</div>
    ${done.length ? done.slice(0, 10).map(woCard).join('')
      : `<div class="card muted small">Nothing completed yet.</div>`}
    ${done.length > 10 ? `<p class="muted small center">Showing the 10 most recent.</p>` : ''}`;

  wireWoCards(view);
  wireLogRows(view);
}

/* ================================================================
   Crew diary — what each person did today
   ================================================================ */
function logBanner() {
  return logTableMissing
    ? `<div class="banner">The diary table isn't in the database yet. Run the
       <strong>Crew diary</strong> section at the end of <code>supabase-schema.sql</code>
       in Supabase, then reopen the app. Entries won't save until then.</div>`
    : '';
}

/** One line of the diary. */
function logRow(e, opts) {
  const o = opts || {};
  const wo = e.work_order_id ? orderById(e.work_order_id) : null;
  const g = wo ? gearById(wo.gear_id) : null;
  const files = Array.isArray(e.files) ? e.files : [];
  return `
    <div class="log-item${e.auto ? ' to-job' : ''}"
         ${e.auto && e.work_order_id ? `data-wo="${e.work_order_id}"` : `data-log="${e.id}"`}>
      <div class="log-time">${fmtTime(e.at)}</div>
      <div class="log-body">
        <div class="log-head">
          <span class="log-kind">${esc(logLabel(e))}</span>
          ${e.auto ? '<span class="log-auto">captured</span>' : ''}
          ${o.showWho && e.crew_name ? `<span class="log-who">${esc(e.crew_name)}</span>` : ''}
          ${e.amount != null && e.amount !== '' ? `<span class="log-amt">${money(e.amount)}</span>` : ''}
        </div>
        ${wo ? `<div class="log-job">${esc(g ? g.code : '')} · ${woNo(wo)} — ${esc(wo.title)}</div>` : ''}
        ${e.body ? `<div class="log-note">${esc(e.body)}</div>` : ''}
        ${files.length ? `<div class="thumbs">${files.map(f => /^image\//.test(f.type || '')
          ? `<a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt=""></a>`
          : `<a class="attach" href="${esc(f.url)}" target="_blank" rel="noopener">${icon('file')}${esc(f.name || 'file')}</a>`
        ).join('')}</div>` : ''}
        <div class="log-by">${esc(e.author || '')}</div>
      </div>
    </div>`;
}

/* ------------------------------------------- the whole day, everyone */
const diaryState = { date: '' };

/** Captured lines open the job they came from; hand-written ones open to edit. */
function wireLogRows(root) {
  $$('[data-log]', root).forEach(b => b.onclick = () => go('#/crew-log/edit/' + b.dataset.log));
  $$('.log-item[data-wo]', root).forEach(b => b.onclick = () => go('#/wo/' + b.dataset.wo));
}

function renderCrewDiary(view) {
  if (!diaryState.date) diaryState.date = today();
  const day = diaryState.date;
  const entries = logOnDay(day);

  // group by person, keeping the order the crew board uses
  const order = crewNames();
  const groups = {};
  entries.forEach(e => {
    const who = String(e.crew_name || '').trim() || 'Unattributed';
    (groups[who] = groups[who] || []).push(e);
  });
  const people = Object.keys(groups).sort((a, b) => {
    const ia = order.findIndex(n => n.toLowerCase() === a.toLowerCase());
    const ib = order.findIndex(n => n.toLowerCase() === b.toLowerCase());
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });

  $('#title').textContent = 'Daily diary';

  view.innerHTML = `
    ${logBanner()}
    <div class="row" style="gap:10px">
      <button class="btn sm" id="dPrev">&#8592;</button>
      <label class="field grow" style="margin:0"><input type="date" id="dDate" value="${esc(day)}"></label>
      <button class="btn sm" id="dNext">&#8594;</button>
    </div>
    <p class="muted small center mt">${fmtDate(day)}${day === today() ? ' · today' : ''} ·
      ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from ${people.length} ${people.length === 1 ? 'person' : 'people'}</p>

    ${people.length ? people.map(who => {
      const t = dayTally(who, day);
      return `
      <div class="section-title">${esc(who)}</div>
      <div class="tally-line">${esc(tallyLine(t) || `${t.entries} entries`)}</div>
      <div class="card log-card">${groups[who].map(e => logRow(e)).join('')}</div>`;
    }).join('') : `<div class="empty"><b>Nothing logged</b>No one has written anything for this day yet.</div>`}

    <div class="btn-row mt">
      <a class="btn primary" href="#/crew-log?date=${day}">${icon('plus')}Add an entry</a>
      <button class="btn" id="dPrint">${icon('printer')}Print the day</button>
    </div>`;

  const step = n => {
    const d = new Date(day + 'T00:00:00');
    d.setDate(d.getDate() + n);
    diaryState.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    renderCrewDiary(view);
  };
  $('#dPrev', view).onclick = () => step(-1);
  $('#dNext', view).onclick = () => step(1);
  $('#dDate', view).onchange = e => { diaryState.date = e.target.value || today(); renderCrewDiary(view); };
  $('#dPrint', view).onclick = () => printDiaryDay(day, people, groups);
  wireLogRows(view);
}

function printDiaryDay(day, people, groups) {
  printDoc(`
    ${docHead('Workshop diary', fmtDate(day))}
    ${people.length ? people.map(who => `
      <h2>${esc(who)}</h2>
      <p><strong>${esc(tallyLine(dayTally(who, day)) || 'no activity counted')}</strong></p>
      <table>
        <tr><th style="width:16mm">Time</th><th style="width:34mm">Entry</th>
            <th style="width:38mm">Job</th><th>Detail</th><th style="width:24mm">Amount</th></tr>
        ${groups[who].map(e => {
          const wo = e.work_order_id ? orderById(e.work_order_id) : null;
          const g = wo ? gearById(wo.gear_id) : null;
          return `<tr class="avoid-break">
            <td>${fmtTime(e.at)}</td>
            <td>${esc(logLabel(e))}</td>
            <td>${wo ? `<strong>${esc(g ? g.code : '')}</strong> ${woNo(wo)}` : '—'}</td>
            <td class="note">${esc(e.body || '')}</td>
            <td>${e.amount != null && e.amount !== '' ? money(e.amount) : ''}</td>
          </tr>`;
        }).join('')}
      </table>`).join('') : '<p>Nothing logged for this day.</p>'}
    <div class="sig"><div>Workshop manager &amp; date</div></div>`);
}

/* ------------------------------------------------- add / edit an entry */
function renderCrewLogForm(view) {
  const editing = route.path.startsWith('/crew-log/edit/');
  const existing = editing ? logById(route.path.split('/')[3]) : null;
  if (editing && !existing) { view.innerHTML = `<div class="empty"><b>Entry not found</b></div>`; return; }

  const names = crewNames();
  const draft = {
    kind: existing ? existing.kind : 'on_tools',
    files: existing && Array.isArray(existing.files) ? existing.files.slice() : [],
    newFiles: []
  };
  const who = existing ? existing.crew_name : (route.query.who || (matchCrew(S.name) || ''));
  const day = existing ? logDay(existing) : (route.query.date || today());
  const at = existing ? new Date(existing.at) : new Date();
  const timeVal = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

  // jobs worth offering: whoever's, open first, then everything else
  const jobs = DB.work_orders.slice().sort((a, b) => {
    const ao = isOpen(a) ? 0 : 1, bo = isOpen(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return (b.number || 0) - (a.number || 0);
  });

  $('#title').textContent = editing ? 'Edit entry' : 'Diary entry';

  view.innerHTML = `
    ${logBanner()}
    <div class="card">
      <label class="field"><span>Who</span>
        <select id="lWho">
          ${names.map(n => `<option value="${esc(n)}" ${n.toLowerCase() === String(who).toLowerCase() ? 'selected' : ''}>${esc(n)}</option>`).join('')}
        </select></label>
      <div class="row" style="gap:10px">
        <label class="field grow"><span>Day</span><input type="date" id="lDate" value="${esc(day)}"></label>
        <label class="field grow"><span>Time</span><input type="time" id="lTime" value="${esc(timeVal)}"></label>
      </div>
    </div>

    <div class="card">
      <label class="field"><span>What happened</span>
        <select id="lKind">
          ${allLogTypes().map(t => `<option value="${esc(t.key)}" ${t.key === draft.kind ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          <option value="__new">+ Add a type…</option>
        </select></label>

      <label class="field" id="lAmtBox" ${logTakesMoney(draft.kind) ? '' : 'hidden'}>
        <span>Amount (NZD)</span>
        <input type="number" id="lAmt" step="0.01" inputmode="decimal" placeholder="0.00"
               value="${existing && existing.amount != null ? esc(existing.amount) : ''}"></label>

      <label class="field"><span>Notes</span>
        <textarea id="lBody" placeholder="What you did, what you found, who you spoke to.">${esc(existing ? existing.body : '')}</textarea></label>

      <label class="field"><span>Against a job (optional)</span>
        <select id="lWo">
          <option value="">Not about one job</option>
          ${jobs.map(o => {
            const g = gearById(o.gear_id) || {};
            return `<option value="${o.id}" ${existing && existing.work_order_id === o.id ? 'selected' : ''}>${
              esc(g.code || '')} · ${woNo(o)} — ${esc(o.title)}${isOpen(o) ? '' : ' (closed)'}</option>`;
          }).join('')}
        </select></label>
    </div>

    <div class="card">
      <h2>Photos or paperwork</h2>
      <input type="file" id="lFile" hidden multiple>
      <button class="btn wide" id="lAddFile" type="button">${icon('camera')}Attach</button>
      <div id="lFiles" class="mt"></div>
    </div>

    <button class="btn primary wide" id="lSave">${editing ? 'Save changes' : 'Add to the diary'}</button>
    ${editing ? `<button class="btn wide mt" id="lDelete">Delete this entry</button>` : ''}`;

  const kindSel = $('#lKind', view);
  let previousKind = kindSel.value;
  kindSel.onchange = () => {
    if (kindSel.value === '__new') {
      const typed = (prompt('Name the kind of entry, e.g. "Warranty claim":') || '').trim();
      if (!typed) { kindSel.value = previousKind; }
      else {
        const existingType = allLogTypes().find(t => t.label.toLowerCase() === typed.toLowerCase());
        const key = existingType ? existingType.key : typed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (!existingType) {
          const opt = document.createElement('option');
          opt.value = key; opt.textContent = typed;
          kindSel.insertBefore(opt, kindSel.querySelector('option[value="__new"]'));
        }
        kindSel.value = key;
      }
    }
    previousKind = kindSel.value;
    draft.kind = kindSel.value;
    $('#lAmtBox', view).hidden = !logTakesMoney(draft.kind);
  };

  const fileInput = $('#lFile', view);
  $('#lAddFile', view).onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    for (const f of Array.from(fileInput.files || [])) draft.newFiles.push(await compressImage(f));
    fileInput.value = '';
    paintFiles();
  };
  paintFiles();

  function paintFiles() {
    const box = $('#lFiles', view);
    const saved = draft.files.map((f, i) =>
      `<div class="filerow"><a class="attach" href="${esc(f.url)}" target="_blank" rel="noopener">${icon('file')}${esc(f.name || 'file')}</a>
       <button class="btn sm" data-drop="${i}">Remove</button></div>`).join('');
    const pending = draft.newFiles.map((f, i) =>
      `<div class="filerow"><span class="attach">${icon('file')}${esc(f.name || 'file')}</span>
       <button class="btn sm" data-dropnew="${i}">Remove</button></div>`).join('');
    box.innerHTML = (saved + pending) || '<p class="muted small" style="margin:0">Nothing attached.</p>';
    $$('[data-drop]', box).forEach(b => b.onclick = () => { draft.files.splice(+b.dataset.drop, 1); paintFiles(); });
    $$('[data-dropnew]', box).forEach(b => b.onclick = () => { draft.newFiles.splice(+b.dataset.dropnew, 1); paintFiles(); });
  }

  $('#lSave', view).onclick = async function () {
    const crew_name = $('#lWho', view).value;
    const entry_date = $('#lDate', view).value || today();
    const kind = kindSel.value;
    if (kind === '__new') return toast('Name the type first');
    if (!crew_name) return toast('Pick who this is for');

    const [hh, mm] = ($('#lTime', view).value || '00:00').split(':');
    const stamp = new Date(entry_date + 'T00:00:00');
    stamp.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);

    this.disabled = true;
    this.textContent = 'Saving…';
    const files = draft.files.slice();
    for (const f of draft.newFiles) files.push(await Store.upload(f));

    const amtRaw = $('#lAmt', view).value.trim();
    const row = {
      crew_name,
      entry_date,
      at: stamp.toISOString(),
      kind,
      label: kindSel.selectedOptions[0] ? kindSel.selectedOptions[0].textContent : '',
      body: $('#lBody', view).value.trim(),
      work_order_id: $('#lWo', view).value || null,
      amount: logTakesMoney(kind) && amtRaw ? Number(amtRaw) : null,
      files
    };

    if (editing) await Store.patch('crew_log', existing.id, row);
    else await Store.insert('crew_log', Object.assign(
      { id: uid(), author: whoami(), role: S.role, created_at: new Date().toISOString() }, row));

    diaryState.date = entry_date;
    toast(editing ? 'Saved' : 'Added to the diary');
    go('#/crew/' + encodeURIComponent(crew_name));
  };

  const del = $('#lDelete', view);
  if (del) del.onclick = async () => {
    if (!confirm('Delete this diary entry?')) return;
    const back = existing.crew_name;
    await Store.remove('crew_log', existing.id);
    toast('Deleted');
    go('#/crew/' + encodeURIComponent(back));
  };
}

/* ================================================================
   Costs — a portal of its own, sharing only the asset list
   ================================================================ */
const costsFor = id => DB.costs
  .filter(c => c.gear_id === id)
  .sort((a, b) => String(costDate(b)).localeCompare(String(costDate(a))));

const costById = id => DB.costs.find(c => c.id === id);

/** The date a cost belongs to for period reporting. */
const costDate = c => (c.incurred_on || (c.created_at || '').slice(0, 10) || '');

function costTotals(list) {
  return list.reduce((t, c) => {
    const v = Number(c.amount) || 0;
    if (c.kind === 'planned') t.planned += v; else t.actual += v;
    return t;
  }, { planned: 0, actual: 0 });
}

function costsInRange(from, to) {
  return DB.costs.filter(c => {
    const d = costDate(c);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function costsBanner() {
  return costsTableMissing
    ? `<div class="banner">The costs table isn't in the database yet. Run the
       <strong>Costs</strong> section at the end of <code>supabase-schema.sql</code>
       in Supabase, then reopen the app. Nothing entered here will save until then.</div>`
    : '';
}

/* ---------------------------------------------------- costs: asset board */
const costFilter = { cat: 'all', q: '' };

function renderCostsBoard(view) {
  const gear = sortedGear(activeGear());
  if (!gear.length) {
    view.innerHTML = costsBanner() + `<div class="empty"><b>No assets yet</b>Add the fleet from the maintenance side first.</div>`;
    return;
  }

  const totals = costTotals(DB.costs);
  const cats = allCategoryKeys().filter(k => gear.some(g => catOf(g) === k));

  view.innerHTML = `
    ${costsBanner()}
    <div class="tally cost-tally">
      <button class="cost-tile" data-jump="1"><span class="n">${moneyShort(totals.actual)}</span><span class="l">Actual, all time</span></button>
      <button class="cost-tile" data-jump="1"><span class="n planned">${moneyShort(totals.planned)}</span><span class="l">Planned</span></button>
      <button class="cost-tile" data-jump="1"><span class="n">${DB.costs.length}</span><span class="l">Entries</span></button>
    </div>

    <div class="filters">
      <button class="chip" data-cat="all" aria-pressed="${costFilter.cat === 'all'}">All assets</button>
      ${cats.map(k => `<button class="chip" data-cat="${esc(k)}" aria-pressed="${costFilter.cat === k}">${esc(catPlural(k))}</button>`).join('')}
    </div>

    <label class="field"><input type="text" id="cq" placeholder="Search code or name" value="${esc(costFilter.q)}"></label>
    <div class="gear-grid" id="cgrid"></div>`;

  $$('[data-cat]', view).forEach(b => b.onclick = () => { costFilter.cat = b.dataset.cat; renderCostsBoard(view); });
  $$('[data-jump]', view).forEach(b => b.onclick = () => go('#/costs/summary'));
  const q = $('#cq', view);
  q.oninput = () => { costFilter.q = q.value; paint(); };
  paint();

  function paint() {
    const needle = costFilter.q.trim().toLowerCase();
    const list = gear.filter(g => {
      if (costFilter.cat !== 'all' && catOf(g) !== costFilter.cat) return false;
      if (needle && !`${g.code} ${g.name}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const grid = $('#cgrid', view);
    grid.innerHTML = list.map((g, i) => {
      const mine = costsFor(g.id);
      const t = costTotals(mine);
      return `
        <button class="gear-card cost-card" data-id="${g.id}" style="--i:${Math.min(i, 14)}">
          <div class="code">${esc(g.code)}</div>
          <div class="name">${esc(g.name || catLabel(catOf(g)))}</div>
          <div class="cost-line"><span>Actual</span><b>${moneyShort(t.actual)}</b></div>
          <div class="cost-line"><span>Planned</span><b class="planned">${moneyShort(t.planned)}</b></div>
          <div class="loc">${mine.length ? `${mine.length} entr${mine.length === 1 ? 'y' : 'ies'}` : 'Nothing recorded'}</div>
        </button>`;
    }).join('') || `<div class="empty" style="grid-column:1/-1"><b>Nothing matches</b></div>`;
    $$('.cost-card', grid).forEach(b => b.onclick = () => go('#/costs/' + b.dataset.id));
  }
}

/* --------------------------------------------------- costs: one asset */
function renderCostsAsset(view) {
  const g = gearById(route.path.split('/')[2]);
  if (!g) { view.innerHTML = `<div class="empty"><b>Asset not found</b></div>`; return; }

  const list = costsFor(g.id);
  const t = costTotals(list);
  $('#title').textContent = g.code;

  view.innerHTML = `
    ${costsBanner()}
    <div class="card">
      <h2 style="font-size:19px">${esc(g.code)}</h2>
      <div class="muted small">${esc(g.name || '')}${g.make_model ? ' · ' + esc(g.make_model) : ''}</div>
      <div class="cost-totals mt">
        <div><span class="l">Actual</span><b>${money(t.actual)}</b></div>
        <div><span class="l">Planned</span><b class="planned">${money(t.planned)}</b></div>
        <div><span class="l">Variance</span><b class="${t.actual > t.planned ? 'over' : ''}">${money(t.actual - t.planned)}</b></div>
      </div>
    </div>

    <a class="btn primary wide" href="#/costs/new?gear=${g.id}">${icon('plus')}Add a cost</a>

    <div class="section-title">Costs (${list.length})</div>
    ${list.length ? list.map(costRow).join('')
      : `<div class="card muted small">Nothing recorded against this asset yet.</div>`}`;

  $$('[data-cost]', view).forEach(b => b.onclick = () => go('#/costs/edit/' + b.dataset.cost));
}

function costRow(c) {
  const files = Array.isArray(c.files) ? c.files : [];
  const due = c.payment_on ? dueText(c.payment_on) : null;
  const chasing = c.kind === 'planned' && due && due.late;
  return `
    <button class="wo cost-entry ${c.kind}" data-cost="${c.id}">
      <div class="hdr">
        <span class="num">${c.kind === 'planned' ? 'PLANNED' : 'ACTUAL'}</span>
        <span class="grow"></span>
        <span class="amount">${money(c.amount)}</span>
      </div>
      <div class="ttl">${esc(c.description || 'No description')}</div>
      <div class="sub">
        <span>Incurred ${c.incurred_on ? fmtDate(c.incurred_on) : '—'}</span>
        ${c.payment_on ? `<span class="${chasing ? 'overdue' : ''}">Payment ${fmtDate(c.payment_on)}</span>` : ''}
        ${files.length ? `<span>${files.length} file${files.length === 1 ? '' : 's'}</span>` : ''}
      </div>
    </button>`;
}

/* ------------------------------------------- costs: add / edit one cost */
function renderCostForm(view) {
  const editing = route.path.startsWith('/costs/edit/');
  const existing = editing ? costById(route.path.split('/')[3]) : null;
  if (editing && !existing) { view.innerHTML = `<div class="empty"><b>Cost not found</b></div>`; return; }

  const gear = sortedGear(activeGear());
  if (!gear.length) { view.innerHTML = `<div class="empty"><b>No assets yet</b></div>`; return; }

  const preset = existing ? existing.gear_id : (route.query.gear || '');
  const draft = {
    kind: existing ? existing.kind : 'actual',
    files: existing && Array.isArray(existing.files) ? existing.files.slice() : [],
    newFiles: []
  };

  view.innerHTML = `
    ${costsBanner()}
    <div class="card">
      <label class="field"><span>Which asset?</span>
        <select id="cGear">
          <option value="">Choose…</option>
          ${allCategoryKeys().filter(k => gear.some(x => catOf(x) === k)).map(k => `
            <optgroup label="${esc(catPlural(k))}">
              ${gear.filter(x => catOf(x) === k).map(x =>
                `<option value="${x.id}" ${x.id === preset ? 'selected' : ''}>${esc(x.code)}${x.name ? ' — ' + esc(x.name) : ''}</option>`).join('')}
            </optgroup>`).join('')}
        </select></label>
    </div>

    <div class="card">
      <h2>Planned or actual?</h2>
      <div class="choice cost-choice" id="cKind">
        <button type="button" data-kind="planned" aria-pressed="${draft.kind === 'planned'}">
          <span class="bulb"></span>
          <span><b>Planned</b><span>Expected, not yet incurred.</span></span>
        </button>
        <button type="button" data-kind="actual" aria-pressed="${draft.kind === 'actual'}">
          <span class="bulb"></span>
          <span><b>Actual</b><span>A cost that has been incurred.</span></span>
        </button>
      </div>
    </div>

    <div class="card">
      <label class="field"><span>Amount (NZD)</span>
        <input type="number" id="cAmt" step="0.01" inputmode="decimal" placeholder="0.00"
               value="${existing && existing.amount != null ? esc(existing.amount) : ''}"></label>
      <label class="field"><span>What is it for?</span>
        <textarea id="cDesc" placeholder="e.g. 500-hour service, new drum teeth">${esc(existing ? existing.description : '')}</textarea></label>
      <div class="row" style="gap:10px">
        <label class="field grow"><span>Date incurred</span>
          <input type="date" id="cInc" value="${esc(existing ? (existing.incurred_on || '') : today())}"></label>
        <label class="field grow"><span>Payment date</span>
          <input type="date" id="cPay" value="${esc(existing ? (existing.payment_on || '') : '')}"></label>
      </div>
    </div>

    <div class="card">
      <h2>Invoice or paperwork</h2>
      <input type="file" id="cFile" hidden multiple>
      <button class="btn wide" id="cAddFile" type="button">${icon('clip')}Attach a file</button>
      <div id="cFiles" class="mt"></div>
    </div>

    <button class="btn primary wide" id="cSave">${editing ? 'Save changes' : 'Save cost'}</button>
    ${editing ? `
      <div class="btn-row mt">
        ${existing.kind === 'planned' ? `<button class="btn" id="cActualise">Mark as actual</button>` : ''}
        <button class="btn" id="cDelete">Delete</button>
      </div>` : ''}`;

  $$('#cKind button', view).forEach(b => b.onclick = () => {
    draft.kind = b.dataset.kind;
    $$('#cKind button', view).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });

  const fileInput = $('#cFile', view);
  $('#cAddFile', view).onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    for (const f of Array.from(fileInput.files || [])) draft.newFiles.push(await compressImage(f));
    fileInput.value = '';
    paintFiles();
  };
  paintFiles();

  function paintFiles() {
    const box = $('#cFiles', view);
    const saved = draft.files.map((f, i) =>
      `<div class="filerow"><a class="attach" href="${esc(f.url)}" target="_blank" rel="noopener">${icon('file')}${esc(f.name || 'file')}</a>
       <button class="btn sm" data-drop="${i}">Remove</button></div>`).join('');
    const pending = draft.newFiles.map((f, i) =>
      `<div class="filerow"><span class="attach">${icon('file')}${esc(f.name || 'file')}</span>
       <button class="btn sm" data-dropnew="${i}">Remove</button></div>`).join('');
    box.innerHTML = (saved + pending) || '<p class="muted small" style="margin:0">Nothing attached.</p>';
    $$('[data-drop]', box).forEach(b => b.onclick = () => { draft.files.splice(+b.dataset.drop, 1); paintFiles(); });
    $$('[data-dropnew]', box).forEach(b => b.onclick = () => { draft.newFiles.splice(+b.dataset.dropnew, 1); paintFiles(); });
  }

  $('#cSave', view).onclick = async function () {
    const gear_id = $('#cGear', view).value;
    const raw = $('#cAmt', view).value.trim();
    const amount = Number(raw);
    if (!gear_id) return toast('Pick an asset');
    if (!raw || isNaN(amount)) return toast('Enter an amount');

    this.disabled = true;
    this.textContent = 'Saving…';
    const files = draft.files.slice();
    for (const f of draft.newFiles) files.push(await Store.upload(f));

    const row = {
      gear_id,
      kind: draft.kind,
      amount,
      description: $('#cDesc', view).value.trim(),
      incurred_on: $('#cInc', view).value || null,
      payment_on: $('#cPay', view).value || null,
      files,
      updated_at: new Date().toISOString()
    };

    if (editing) await Store.patch('costs', existing.id, row);
    else await Store.insert('costs', Object.assign(
      { id: uid(), created_by: whoami(), created_at: new Date().toISOString() }, row));

    toast(editing ? 'Saved' : 'Cost added');
    go('#/costs/' + gear_id);
  };

  const actualise = $('#cActualise', view);
  if (actualise) actualise.onclick = async () => {
    await Store.patch('costs', existing.id, {
      kind: 'actual',
      incurred_on: existing.incurred_on || today(),
      updated_at: new Date().toISOString()
    });
    toast('Moved to actual');
    go('#/costs/' + existing.gear_id);
  };

  const del = $('#cDelete', view);
  if (del) del.onclick = async () => {
    if (!confirm('Delete this cost? It cannot be undone.')) return;
    const gid = existing.gear_id;
    await Store.remove('costs', existing.id);
    toast('Deleted');
    go('#/costs/' + gid);
  };
}

/* ------------------------------------------------- costs: the tracker */
const trackRange = { from: '', to: '', preset: 'month' };

function presetRange(key) {
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (key === 'month')   return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (key === 'last')    return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (key === 'quarter') { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))]; }
  // NZ financial year runs April to March
  if (key === 'year')    { const fy = m >= 3 ? y : y - 1; return [`${fy}-04-01`, `${fy + 1}-03-31`]; }
  return ['', ''];
}

function renderCostSummary(view) {
  if (trackRange.preset !== 'custom' && !trackRange.from) {
    const r = presetRange(trackRange.preset);
    trackRange.from = r[0]; trackRange.to = r[1];
  }
  const list = costsInRange(trackRange.from, trackRange.to);
  const t = costTotals(list);
  const variance = t.actual - t.planned;

  const byAsset = {};
  list.forEach(c => {
    byAsset[c.gear_id] = byAsset[c.gear_id] || { planned: 0, actual: 0 };
    const v = Number(c.amount) || 0;
    if (c.kind === 'planned') byAsset[c.gear_id].planned += v;
    else byAsset[c.gear_id].actual += v;
  });
  const assets = Object.keys(byAsset)
    .map(id => ({ g: gearById(id), planned: byAsset[id].planned, actual: byAsset[id].actual }))
    .filter(r => r.g)
    .sort((a, b) => (b.actual + b.planned) - (a.actual + a.planned));

  const months = {};
  list.forEach(c => {
    const key = costDate(c).slice(0, 7);
    if (!key) return;
    months[key] = months[key] || { planned: 0, actual: 0 };
    const v = Number(c.amount) || 0;
    if (c.kind === 'planned') months[key].planned += v; else months[key].actual += v;
  });
  const monthRows = Object.keys(months).sort((a, b) => b.localeCompare(a)).map(k => [k, months[k]]);
  const peak = Math.max(1, ...monthRows.map(r => Math.max(r[1].actual, r[1].planned)));

  const upcoming = DB.costs
    .filter(c => c.kind === 'planned' && c.payment_on)
    .sort((a, b) => a.payment_on.localeCompare(b.payment_on))
    .slice(0, 8);

  const presets = [['month', 'This month'], ['last', 'Last month'], ['quarter', 'This quarter'],
                   ['year', 'Financial year'], ['custom', 'Custom']];

  view.innerHTML = `
    ${costsBanner()}
    <div class="filters">
      ${presets.map(pr => `<button class="chip" data-preset="${pr[0]}" aria-pressed="${trackRange.preset === pr[0]}">${pr[1]}</button>`).join('')}
    </div>

    ${trackRange.preset === 'custom' ? `
      <div class="row" style="gap:10px">
        <label class="field grow"><span>From</span><input type="date" id="rFrom" value="${esc(trackRange.from)}"></label>
        <label class="field grow"><span>To</span><input type="date" id="rTo" value="${esc(trackRange.to)}"></label>
      </div>` : ''}

    <div class="cost-totals big">
      <div><span class="l">Actual</span><b>${money(t.actual)}</b></div>
      <div><span class="l">Planned</span><b class="planned">${money(t.planned)}</b></div>
      <div><span class="l">Variance</span><b class="${variance > 0 ? 'over' : ''}">${money(variance)}</b></div>
    </div>
    <p class="muted tiny center">${trackRange.from ? fmtDate(trackRange.from) : 'start'} to ${trackRange.to ? fmtDate(trackRange.to) : 'today'} · ${list.length} entr${list.length === 1 ? 'y' : 'ies'}</p>

    <div class="section-title">By month</div>
    <div class="card">
      ${monthRows.length ? monthRows.map(r => {
        const d = new Date(r[0] + '-01T00:00:00');
        return `
          <div class="mrow">
            <div class="mlabel">${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}</div>
            <div class="mbars">
              <div class="mbar actual" style="width:${(r[1].actual / peak * 100).toFixed(1)}%"></div>
              <div class="mbar planned" style="width:${(r[1].planned / peak * 100).toFixed(1)}%"></div>
            </div>
            <div class="mamt">${moneyShort(r[1].actual)}</div>
          </div>`;
      }).join('') : '<p class="muted small" style="margin:0">Nothing in this period.</p>'}
      ${monthRows.length ? '<p class="muted tiny mt" style="margin-bottom:0">Solid bar actual, outline planned.</p>' : ''}
    </div>

    <div class="section-title">By asset</div>
    ${assets.length ? `<div class="card"><table class="data">
      <tr><th style="width:auto">Asset</th><th style="width:26%">Actual</th><th style="width:26%">Planned</th></tr>
      ${assets.map(r => `<tr>
        <td><strong>${esc(r.g.code)}</strong> <span class="muted">${esc(r.g.name || '')}</span></td>
        <td>${money(r.actual)}</td>
        <td class="muted">${money(r.planned)}</td>
      </tr>`).join('')}
    </table></div>` : '<div class="card muted small">Nothing in this period.</div>'}

    <div class="section-title">Payments coming up</div>
    ${upcoming.length ? upcoming.map(c => {
      const g = gearById(c.gear_id) || {};
      const due = dueText(c.payment_on);
      return `<button class="wo cost-entry planned" data-cost="${c.id}">
        <div class="hdr"><span class="num">${esc(g.code || '')}</span><span class="grow"></span>
          <span class="amount">${money(c.amount)}</span></div>
        <div class="ttl">${esc(c.description || 'No description')}</div>
        <div class="sub"><span class="${due.late ? 'overdue' : ''}">${fmtDate(c.payment_on)} · ${due.text}</span></div>
      </button>`;
    }).join('') : '<div class="card muted small">No planned payments with a date.</div>'}

    <div class="btn-row mt">
      <button class="btn" id="costPrint">${icon('printer')}Print</button>
      <button class="btn" id="costCsv">Download CSV</button>
    </div>`;

  $$('[data-preset]', view).forEach(b => b.onclick = () => {
    trackRange.preset = b.dataset.preset;
    if (trackRange.preset !== 'custom') {
      const r = presetRange(trackRange.preset);
      trackRange.from = r[0]; trackRange.to = r[1];
    }
    renderCostSummary(view);
  });
  const f = $('#rFrom', view), tt = $('#rTo', view);
  if (f) f.onchange = () => { trackRange.from = f.value; renderCostSummary(view); };
  if (tt) tt.onchange = () => { trackRange.to = tt.value; renderCostSummary(view); };
  $$('[data-cost]', view).forEach(b => b.onclick = () => go('#/costs/edit/' + b.dataset.cost));
  $('#costPrint', view).onclick = () => printCosts(list, assets, t);
  $('#costCsv', view).onclick = () => exportCostsCsv(list);
}

function printCosts(list, assets, t) {
  const range = `${trackRange.from ? fmtDate(trackRange.from) : 'start'} to ${trackRange.to ? fmtDate(trackRange.to) : 'today'}`;
  printDoc(`
    ${docHead('Cost report', range)}
    <h2>Summary</h2>
    <table class="kv">
      <tr><td>Actual</td><td><strong>${money(t.actual)}</strong></td></tr>
      <tr><td>Planned</td><td>${money(t.planned)}</td></tr>
      <tr><td>Variance</td><td>${money(t.actual - t.planned)}</td></tr>
      <tr><td>Entries</td><td>${list.length}</td></tr>
    </table>

    <h2>By asset</h2>
    <table>
      <tr><th>Asset</th><th>Name</th><th>Actual</th><th>Planned</th></tr>
      ${assets.map(r => `<tr><td><strong>${esc(r.g.code)}</strong></td><td>${esc(r.g.name || '')}</td>
        <td>${money(r.actual)}</td><td>${money(r.planned)}</td></tr>`).join('')
        || '<tr><td colspan="4">Nothing in this period.</td></tr>'}
    </table>

    <h2>Every entry</h2>
    <table>
      <tr><th style="width:22mm">Incurred</th><th style="width:17mm">Type</th><th style="width:19mm">Asset</th>
          <th>Description</th><th style="width:22mm">Payment</th><th style="width:23mm">Amount</th></tr>
      ${list.slice().sort((a, b) => costDate(a).localeCompare(costDate(b))).map(c => {
        const g = gearById(c.gear_id) || {};
        return `<tr class="avoid-break">
          <td>${c.incurred_on ? fmtDate(c.incurred_on) : '—'}</td>
          <td>${c.kind === 'planned' ? 'Planned' : 'Actual'}</td>
          <td><strong>${esc(g.code || '')}</strong></td>
          <td class="note">${esc(c.description || '')}</td>
          <td>${c.payment_on ? fmtDate(c.payment_on) : '—'}</td>
          <td>${money(c.amount)}</td></tr>`;
      }).join('') || '<tr><td colspan="6">Nothing in this period.</td></tr>'}
    </table>`);
}

function exportCostsCsv(list) {
  const head = ['Type', 'Asset', 'Name', 'Amount', 'Description', 'Date incurred',
                'Payment date', 'Attachments', 'Entered by', 'Entered'];
  const rows = list.slice().sort((a, b) => costDate(a).localeCompare(costDate(b))).map(c => {
    const g = gearById(c.gear_id) || {};
    const files = Array.isArray(c.files) ? c.files : [];
    return [c.kind === 'planned' ? 'Planned' : 'Actual', g.code || '', g.name || '',
      Number(c.amount) || 0, c.description || '', c.incurred_on || '', c.payment_on || '',
      files.map(f => f.name).join('; '), c.created_by || '', fmtDateTime(c.created_at)];
  });
  downloadCsv([head, ...rows], `rck-costs-${today()}.csv`);
}

/* ================================================================
   Screen — settings
   ================================================================ */
function renderSetup(view) {
  view.innerHTML = `
    <div class="card">
      <h2>You</h2>
      <label class="field"><span>Your name</span>
        <input type="text" id="sName" value="${esc(S.name)}" placeholder="e.g. Dave T"></label>
      ${(() => {
        const m = matchCrew(S.name);
        if (!S.name) return '';
        return m
          ? `<p class="muted small">Work you do on a job is logged to
             <strong>${esc(m)}</strong>'s diary automatically.</p>`
          : `<div class="banner">Your name doesn't match anyone on the maintenance crew, so
             what you do on a job is logged under "<strong>${esc(S.name)}</strong>" rather than
             a crew member's diary. Set it to match a crew name if it should be theirs.</div>`;
      })()}
      <label class="field"><span>This device is used by</span>
        <select id="sRole">
          <option value="crew" ${S.role === 'crew' ? 'selected' : ''}>Crew — report damage, see status</option>
          <option value="workshop" ${S.role === 'workshop' ? 'selected' : ''}>Workshop — also update and close jobs</option>
        </select></label>
      <button class="btn primary wide" id="saveMe">Save</button>
    </div>

    <div class="card">
      <h2>Shared data</h2>
      <p class="muted small">These come from Supabase → Settings → API. Everyone who enters the same
      two values sees the same gear and work orders.</p>
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
      <h2>Set up someone else's phone</h2>
      <p class="muted small">Send this link to the crew. One tap connects their phone —
      they never type the key. Treat it like a key: only send it to RCK people.</p>
      <label class="field"><span>Setup link</span>
        <input type="text" id="sLink" value="${esc(setupLink())}" readonly onclick="this.select()"></label>
      <div class="btn-row">
        <button class="btn primary" id="shareLink">${icon('share')}Share link</button>
        <button class="btn" id="copyLink">${icon('copy')}Copy link</button>
      </div>
    </div>` : ''}

    <div class="card">
      <h2>Try it without a connection</h2>
      <p class="muted small">Practice mode: everything works, but the data stays on this phone only.
      Nobody else sees it and the workshop screen won't show it.</p>
      <label class="field"><span>Mode</span>
        <select id="sLocal">
          <option value="0" ${!S.localMode ? 'selected' : ''}>Shared (Supabase)</option>
          <option value="1" ${S.localMode ? 'selected' : ''}>This device only (practice)</option>
        </select></label>
      <button class="btn wide" id="saveMode">Switch mode</button>
    </div>

    <div class="card">
      <h2>Status</h2>
      <table class="data">
        <tr><th>Connection</th><td>${S.localMode ? 'This device only' : connected() ? 'Shared database' : 'Not set up'}</td></tr>
        <tr><th>Gear</th><td>${DB.gear.length}</td></tr>
        <tr><th>Work orders</th><td>${DB.work_orders.length}</td></tr>
        <tr><th>Waiting to send</th><td>${Outbox.count()}</td></tr>
        <tr><th>Version</th><td>${VERSION}</td></tr>
      </table>
      <div class="btn-row mt">
        <button class="btn sm" id="refresh">Refresh now</button>
        <button class="btn sm" id="clear">Clear this device</button>
      </div>
    </div>`;

  $('#saveMe', view).onclick = async () => {
    const role = $('#sRole', view).value;
    const name = $('#sName', view).value.trim();
    if (!name) return toast('Enter your name');
    if (role === 'workshop' && S.role !== 'workshop' && SITE.workshopPin) {
      const pin = prompt('Workshop code:');
      if (pin !== SITE.workshopPin) return toast('Wrong code');
    }
    Settings.write({ name, role });
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
      const res = await fetch(`${url}/rest/v1/gear?select=id&limit=1`, {
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
    go('#/');
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
          await navigator.share({ title: 'RCK Workshop setup', text: 'Tap this to set up RCK Workshop on your phone', url: link });
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

  $('#refresh', view).onclick = async () => { await refresh(); toast('Up to date'); render(); };

  $('#clear', view).onclick = () => {
    if (!confirm('Clear the copy held on this device? Shared data in Supabase is not touched.')) return;
    localStorage.removeItem(cacheKey());
    localStorage.removeItem('rckw.outbox');
    DB.gear = []; DB.work_orders = []; DB.wo_updates = [];
    refresh().then(render);
  };
}

/* ================================================================
   Sync loop
   ================================================================ */
let syncState = 'idle';

function paintSync() {
  const dot = $('#syncDot');
  const pending = Outbox.count();
  dot.className = 'dot ' + (syncState === 'bad' ? 'bad' : pending ? 'warn' : connected() || S.localMode ? 'ok' : '');
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
    if (document.hidden || route.path === '/screen') return;
    const before = JSON.stringify([DB.work_orders.length, DB.gear.length, DB.wo_updates.length]);
    await refresh();
    const after = JSON.stringify([DB.work_orders.length, DB.gear.length, DB.wo_updates.length]);
    if (before !== after && ['/', '/orders'].includes(route.path)) render();
  }, 20000);
}

/* ================================================================
   Boot
   ================================================================ */
$('#menuBtn').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
$('#backBtn').onclick = () => history.back();
$('#homeBtn').onclick = () => go('#/');
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

(async function boot() {
  loadCache();
  paintSync();
  render();
  await refresh();
  render();
  startPolling();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
