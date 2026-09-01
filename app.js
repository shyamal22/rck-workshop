/* =====================================================================
   RCK Workshop — gear status, damage reports, work orders, repair history
   Plain JavaScript, no build step, no frameworks.
   ===================================================================== */
'use strict';

const VERSION = '3.0.0';

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
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 3.5v3M16 3.5v3"/><path d="M8.5 13.5h3v3h-3z"/>',
  tick:    '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  book:    '<path d="M4 5.2A1.7 1.7 0 0 1 5.7 3.5H19v14H5.7A1.7 1.7 0 0 0 4 19.2z"/><path d="M4 19.2a1.7 1.7 0 0 0 1.7 1.7H19v-3.4"/><path d="M8 7.5h7"/>',
  broom:   '<path d="M13.5 4.5l6 6"/><path d="M11 12.5l-4.6 4.6a4 4 0 0 0-1.1 2.1L5 21l1.8-.3a4 4 0 0 0 2.1-1.1l4.6-4.6"/><path d="M9.4 10.9l3.7 3.7 4.2-4.2a2.6 2.6 0 0 0-3.7-3.7z"/>',
  spanner: '<path d="M15.5 8.5a3.8 3.8 0 0 0 4.6 4.6l-8 8a2.6 2.6 0 0 1-3.7-3.7l8-8a3.8 3.8 0 0 0-4.6-4.6l3 3-1.9 1.9-3-3a3.8 3.8 0 0 0 5.6 1.8z"/>'
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** Set when the database is missing a table, so the app can say so rather
    than looking empty and broken. */
let manualsTableMissing = false;
let serviceTableMissing = false;

/* A comment on its own never said whether someone was fixing the job or just
   talking about it, so a board full of notes told you nothing. Posting one now
   means saying which it is — and that answer becomes the job's live line,
   readable from the card without opening anything.

   Tone borrows the status vocabulary rather than inventing colours: red is bad
   news, yellow is held up, dark is happening now, grey is only words. */
const NOTE_KINDS = [
  { key: 'working', label: 'Working on it', tone: 'live',  hint: 'Spanners on it now' },
  { key: 'waiting', label: 'Waiting on',    tone: 'hold',  hint: 'Parts, a quote, the repairer' },
  { key: 'problem', label: 'Hit a problem', tone: 'stop',  hint: 'Needs a decision' },
  { key: 'looked',  label: 'Had a look',    tone: 'plain', hint: 'Checked it over, nothing done yet' },
  { key: 'info',    label: 'Just info',     tone: 'plain', hint: 'Nothing for anyone to do' }
];
const noteKind = k => NOTE_KINDS.find(n => n.key === k) || null;

/** What everything else on a job's history is, for the printed sheet. */
const UPDATE_LABELS = {
  created:  'Damage reported',
  status:   'Job updated',
  external: 'Repairer arranged',
  complete: 'Job completed',
  reopen:   'Job reopened'
};
const noteOf = u => noteKind(u && u.meta && u.meta.note);

/** What is actually happening on a job right now, read back off its own
    history — so every card can say it without anyone writing a status. */
function jobPulse(o) {
  const ups = updatesFor(o.id);
  if (!isOpen(o)) {
    const done = ups.filter(u => u.kind === 'complete').pop();
    return { label: 'Fixed', tone: 'done', at: o.completed_at || (done && done.created_at),
             who: o.completed_by || (done && done.author) || '' };
  }
  for (let i = ups.length - 1; i >= 0; i--) {
    const u = ups[i];
    const n = noteOf(u);
    if (n) return { label: n.key === 'waiting' && u.body
                      ? 'Waiting on ' + firstLine(u.body).replace(/^waiting on\s*/i, '')
                      : n.label,
                    tone: n.tone, at: u.created_at, who: String(u.author || '').trim() };
    if (u.kind === 'complete' || u.kind === 'reopen') break;
  }
  if (o.repairer === 'external') {
    return { label: 'With ' + (o.external_company || 'an external repairer'),
             tone: 'plain', at: o.updated_at, who: '' };
  }
  const last = ups[ups.length - 1];
  return { label: 'No word yet', tone: 'quiet',
           at: last ? last.created_at : o.reported_at, who: '' };
}

/** "3 days ago", short enough to sit on a card. */
function ago(v) {
  const t = new Date(v).getTime();
  if (isNaN(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : days + 'd ago';
}

const firstLine = t => String(t || '').split('\n')[0].trim();

function money(n) {
  const v = Number(n) || 0;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-NZ',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
const DB = { gear: [], work_orders: [], wo_updates: [], manuals: [],
             service_plans: [], service_log: [], localSeq: 0 };

function cacheKey() { return 'rckw.cache.' + (S.localMode ? 'local' : 'remote'); }

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (raw) {
      DB.gear = raw.gear || [];
      DB.work_orders = raw.work_orders || [];
      DB.wo_updates = raw.wo_updates || [];
      DB.manuals = raw.manuals || [];
      DB.service_plans = raw.service_plans || [];
      DB.service_log = raw.service_log || [];
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
    const [gear, orders, updates, manuals, plans, svc] = await Promise.all([
      rest('gear?select=*&order=code.asc', { headers: restHeaders() }),
      rest('work_orders?select=*&order=number.desc&limit=3000', { headers: restHeaders() }),
      rest('wo_updates?select=*&order=created_at.desc&limit=6000', { headers: restHeaders() }),
      // A table may not exist yet on an older database; the rest of the app
      // must keep working if it doesn't.
      rest('manuals?select=*&order=title.asc&limit=2000', { headers: restHeaders() }).catch(() => null),
      rest('service_plans?select=*&limit=4000', { headers: restHeaders() }).catch(() => null),
      rest('service_log?select=*&order=done_on.desc&limit=8000', { headers: restHeaders() }).catch(() => null)
    ]);
    DB.gear = gear || [];
    DB.work_orders = orders || [];
    DB.wo_updates = (updates || []).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    if (manuals) { DB.manuals = manuals; manualsTableMissing = false; }
    else manualsTableMissing = true;
    if (plans && svc) { DB.service_plans = plans; DB.service_log = svc; serviceTableMissing = false; }
    else serviceTableMissing = true;
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
  if (path.startsWith('/manuals')) return 'manuals';
  if (path.startsWith('/service')) return 'service';
  return 'maintenance';
}

const TABS = {
  maintenance: [
    { href: '#/gear',   label: 'Gear',        icon: 'grid',   on: p => p === '/gear' || p.startsWith('/gear/') },
    { href: '#/orders', label: 'Work orders', icon: 'orders', on: p => p === '/orders' || p.startsWith('/wo/') },
    { href: '#/report', label: 'Report',      icon: 'plus',   on: p => p === '/report', primary: true }
  ],
  service: [
    { href: '#/service',       label: 'Due',      icon: 'orders', on: p => p === '/service' },
    { href: '#/service/fleet', label: 'Machines', icon: 'grid',   on: p => p !== '/service' }
  ],
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
  '/service':        { title: 'Planned servicing', render: renderServiceBoard },
  '/service/fleet':  { title: 'Every machine',    render: renderServiceFleet },
  '/manuals':        { title: 'Manuals',      render: renderManuals },
  '/manuals/new':    { title: 'Add a manual', render: renderManualForm, back: true },
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
  const keepsPlace = ['/gear', '/orders'].includes(path);
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

  if (!screen && route.path.startsWith('/service/done/')) { screen = { title: 'Mark it done', render: renderServiceDone }; back = true; }
  else if (!screen && route.path.startsWith('/service/plan/')) { screen = { title: 'Service', render: renderServicePlan }; back = true; }
  else if (!screen && route.path.startsWith('/service/')) { screen = { title: 'Servicing', render: renderServiceGear }; back = true; }
  else if (!screen && route.path.startsWith('/gearedit/')) { screen = { title: 'Edit gear', render: renderGearEdit }; back = true; }
  else if (!screen && route.path.startsWith('/gear/')) { screen = { title: 'Gear', render: renderGearDetail }; back = true; }
  else if (!screen && route.path.startsWith('/wo/')) { screen = { title: 'Work order', render: renderWorkOrder }; back = true; }

  if (!screen) { go('#/'); return; }

  $('#title').textContent = screen.title;
  $('#backBtn').hidden = !(back || screen.back);
  $('#menu').hidden = true;

  const section = sectionOf(route.path);
  paintTabs(section, route.path);
  $('#homeBtn').hidden = !['maintenance', 'manuals', 'service'].includes(section) || (back || screen.back);

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

/** The one line that says whether a job is moving. */
function pulseLine(o, size) {
  const p = jobPulse(o);
  if (!p) return '';
  const when = p.at ? ago(p.at) : '';
  const meta = [p.who, when].filter(Boolean).join(' \u00b7 ');
  return `<div class="pulse tone-${p.tone}${size === 'big' ? ' big' : ''}">
    <span class="pdot"></span>
    <span class="pl">${esc(p.label)}</span>
    ${meta ? `<span class="pm">${esc(meta)}</span>` : ''}
  </div>`;
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
      ${pulseLine(o)}
      <div class="sub">
        <span class="pill"><span class="swatch"></span>${closed ? statusLabel(o.status) : STATUS_TEXT[o.severity]}</span>
        ${closed ? '' : `<span class="pill plain">${statusLabel(o.status)}</span>`}
        ${closed
          ? `<span>Completed ${fmtDate(o.completed_at)}</span>`
          : `<span class="${due.late ? 'overdue' : ''}">${due.none ? 'No fix date set' : due.text}</span>`}
        ${o.repairer === 'external' ? `<span>External${o.external_company ? ' · ' + esc(o.external_company) : ''}</span>` : ''}
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
      ${pulseLine(o, 'big')}
      ${o.description ? `<p class="small mt" style="white-space:pre-wrap;margin-bottom:0">${esc(o.description)}</p>` : ''}
    </div>

    <div class="card">
      <table class="data">
        <tr><th>Status</th><td>${statusLabel(o.status)}</td></tr>
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
      <label class="field"><span>Say what's happening</span>
        <textarea id="cmt" placeholder="What you found, what you're doing, what you're waiting on…"></textarea>
      </label>
      <p class="tiny muted" style="margin:-2px 2px 8px">Pick the one that fits — it becomes this job's live line, so
        everyone can see whether it's moving without opening it.</p>
      <div class="note-kinds">
        ${NOTE_KINDS.map(n => `
          <button class="note-chip tone-${n.tone}" data-note="${n.key}">
            <span class="nk">${esc(n.label)}</span>
            <span class="nh">${esc(n.hint)}</span>
          </button>`).join('')}
      </div>
    </div>`;

  $('#printWo', view).onclick = () => printWorkOrder(o);

  $$('[data-note]', view).forEach(b => b.onclick = async function () {
    const body = $('#cmt', view).value.trim();
    const n = noteKind(this.dataset.note);
    if (!body && n.key !== 'working') return toast('Write a line first');
    $$('[data-note]', view).forEach(x => x.disabled = true);
    await logUpdate(o.id, 'comment', body || 'On it now.', { note: n.key });
    toast(n.label + ' — posted');
    render();
  });

  if (isWorkshop()) wireWorkshopPanel(view, o);
}

function tlItem(u) {
  const m = u.meta || {};
  const isFile = u.kind === 'file' && m.url;
  const isImage = isFile && /^image\//.test(m.type || '');
  const strong = ['created', 'status', 'complete', 'external', 'reopen'].includes(u.kind);
  const n = noteOf(u);
  return `
    <div class="tl-item ${strong ? 'mark' : ''}">
      <div class="tl-when">${fmtDateTime(u.created_at)}</div>
      ${n ? `<span class="note-tag tone-${n.tone}">${esc(n.label)}</span>` : ''}
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

  const save = $('#wSave', view);
  if (save) save.onclick = async function () {
    const patch = {
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
        o.reported_by, fmtDateTime(o.reported_at), o.location_at_report, o.target_date ? fmtDate(o.target_date) : '',
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
function docHead(title, subtitle, meta) {
  return `
    <div class="doc-head">
      <div>
        <div class="org-name">RCK NZ</div>
        <div class="org-sub">Asphalt &amp; Civil Contracting</div>
        <div class="org-sub">Workshop — plant &amp; equipment</div>
      </div>
      <div>
        <div class="doc-kind">${esc(title).toUpperCase()}</div>
        <div class="doc-meta">
          ${(meta || []).map(m => `<div><b>${esc(m[0])}:</b> ${esc(m[1])}</div>`).join('')}
          ${subtitle ? `<div>${esc(subtitle)}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="rule"></div>`;
}

function docFoot(right) {
  return `
    <div class="foot">
      <span>RCK NZ · Workshop · generated ${fmtDateTime(new Date().toISOString())}${S.name ? ' by ' + esc(S.name) : ''}</span>
      <span>${esc(right || '')}</span>
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
  if (closed) return '<span class="badge done">Fixed</span>';
  return sev === 'red'
    ? '<span class="badge stop">Out of operation</span>'
    : '<span class="badge warn">Damaged — usable</span>';
}

function printWorkOrder(o) {
  const g = gearById(o.gear_id) || {};
  const closed = !isOpen(o);
  const cancelled = o.status === 'cancelled';
  const ups = updatesFor(o.id);
  const down = daysBetween(o.reported_at, o.completed_at || new Date().toISOString());
  const due = o.target_date ? dueText(o.target_date) : null;

  // the one line someone should read first
  const state = cancelled ? { cls: 'badge', word: 'Cancelled', line: 'This work order was cancelled.' }
    : closed ? { cls: 'badge done', word: 'Fixed — back in service',
        line: `Completed ${fmtDate(o.completed_at)}${o.completed_by ? ' by ' + o.completed_by : ''}` +
              (down != null ? ` · ${down} day${down === 1 ? '' : 's'} out of service` : '') }
    : o.severity === 'red' ? { cls: 'badge stop', word: 'Out of operation — do not use',
        line: `${statusLabel(o.status)}` + (down != null ? ` · ${down} day${down === 1 ? '' : 's'} down so far` : '') +
              (o.target_date ? ` · due back ${fmtDate(o.target_date)}${due.late ? ' (OVERDUE)' : ''}` : ' · no return date set') }
    : { cls: 'badge warn', word: 'Damaged — still usable',
        line: `${statusLabel(o.status)}` + (down != null ? ` · ${down} day${down === 1 ? '' : 's'} outstanding` : '') +
              (o.target_date ? ` · due to be fixed ${fmtDate(o.target_date)}${due.late ? ' (OVERDUE)' : ''}` : ' · no fix date set') };

  const repairer = o.repairer === 'external'
    ? `External — ${o.external_company || 'company not named'}`
    : o.repairer === 'internal' ? 'RCK workshop crew' : 'Not decided';

  const comments = ups.filter(u => u.kind !== 'file');

  printDoc(`
    ${docHead('Work order', '', [
      ['No', woNo(o)],
      ['Raised', fmtDate(o.reported_at)],
      ['Gear', g.code || '—']
    ])}

    <div class="facts">
      <div class="col">
        <div class="lab">Gear</div>
        <div class="big">${esc(g.code || '')}</div>
        <div class="line">${esc(g.name || '')}</div>
        ${g.make_model ? `<div class="line">${esc(g.make_model)}</div>` : ''}
        <div class="line">${esc(catLabel(catOf(g)))}</div>
      </div>
      <div class="col">
        <div class="lab">Reported by</div>
        <div class="big">${esc(o.reported_by || '—')}</div>
        <div class="line">${fmtDateTime(o.reported_at)}</div>
        <div class="line">${esc(o.location_at_report || g.location || 'Location not recorded')}</div>
      </div>
      <div class="col">
        <div class="lab">Repaired by</div>
        <div class="big">${esc(o.repairer === 'external' ? (o.external_company || 'External') : o.repairer === 'internal' ? 'RCK workshop' : 'Not decided')}</div>
        <div class="line">${esc(repairer)}</div>
        ${o.external_ref ? `<div class="line">Their ref: ${esc(o.external_ref)}</div>` : ''}
      </div>
    </div>

    <div class="callout">
      <div class="state"><span class="${state.cls}">${esc(state.word)}</span></div>
      <div class="sub">${esc(state.line)}</div>
      ${(() => { const p = jobPulse(o);
        return closed || !p ? '' : `<div class="sub"><strong>Last word:</strong> ${esc(p.label)}${
          p.who ? ' — ' + esc(p.who) : ''}${p.at ? ' (' + esc(ago(p.at)) + ')' : ''}</div>`; })()}
    </div>

    <h2>What is wrong</h2>
    <p class="prose"><strong>${esc(o.title)}</strong></p>
    ${o.description ? `<p class="prose">${esc(o.description)}</p>`
      : '<p class="prose quiet">No further detail was given when it was reported.</p>'}

    <h2>How it was fixed</h2>
    ${o.work_done
      ? `<p class="prose">${esc(o.work_done)}</p>
         <table class="kv">
           <tr><td>Completed</td><td>${fmtDateTime(o.completed_at)}</td></tr>
           <tr><td>Signed off by</td><td>${esc(o.completed_by || '—')}</td></tr>
           <tr><td>Time out of service</td><td>${down != null ? `${down} day${down === 1 ? '' : 's'}` : '—'}</td></tr>
         </table>`
      : `<p class="prose quiet">${['Not finished yet. Status: ' + statusLabel(o.status) + '.',
           o.target_date ? 'Expected back in service ' + fmtDate(o.target_date) + '.'
                         : 'No return date has been set.'].join(' ')}</p>`}

    <h2>Cost</h2>
    <div class="figure">
      <div class="lab">Repair cost (NZD)</div>
      <div class="amt">${o.cost != null && o.cost !== '' ? money(o.cost) : 'Not recorded'}</div>
    </div>
    <table class="kv">
      <tr><td>Repaired by</td><td>${esc(repairer)}</td></tr>
      <tr><td>Their reference</td><td>${esc(o.external_ref || '—')}</td></tr>
      <tr><td>Invoice on file</td><td>${ups.some(u => u.kind === 'file') ? 'Yes — see attachments below' : 'No'}</td></tr>
    </table>

    <h2>Comments &amp; history</h2>
    <table>
      <tr><th style="width:30mm">When</th><th style="width:28mm">Who</th>
          <th style="width:26mm">What</th><th>Entry</th></tr>
      ${comments.map(u => { const n = noteOf(u); return `<tr class="avoid-break">
        <td>${fmtDateTime(u.created_at)}</td>
        <td>${esc(u.author || '—')}${u.role === 'workshop' ? '<br><span class="quiet">Workshop</span>' : ''}</td>
        <td>${n ? `<strong>${esc(n.label)}</strong>` : esc(UPDATE_LABELS[u.kind] || 'Note')}</td>
        <td class="note">${esc(u.body || '')}</td>
      </tr>`; }).join('') || '<tr><td colspan="4" class="quiet">Nothing recorded.</td></tr>'}
    </table>

    ${photoSheet(ups)}

    <div class="sig">
      <div>Workshop sign-off &amp; date</div>
      <div>Returned to operator &amp; date</div>
    </div>

    ${docFoot(woNo(o) + ' · ' + (g.code || ''))}`);
}

/** Photos attached to a work order, laid out for the printed sheet. */
function photoSheet(updates) {
  const photos = updates.filter(u => u.kind === 'file' && u.meta && u.meta.url && /^image\//.test(u.meta.type || ''));
  const docs = updates.filter(u => u.kind === 'file' && u.meta && u.meta.url && !/^image\//.test(u.meta.type || ''));
  if (!photos.length && !docs.length) return '';
  return `
    <h2>Attachments</h2>
    ${docs.length ? `<table>
      <tr><th style="width:34mm">Added</th><th style="width:32mm">By</th><th>File</th></tr>
      ${docs.map(d => `<tr><td>${fmtDate(d.created_at)}</td><td>${esc(d.author || '')}</td>
        <td>${esc(d.meta.name || 'file')}${d.body ? ` — ${esc(d.body)}` : ''}</td></tr>`).join('')}
    </table>` : ''}
    ${photos.length ? `<div class="shots">
      ${photos.map(p => `
        <figure class="avoid-break">
          <img src="${esc(p.meta.url)}" alt="">
          <figcaption>${esc(p.body || 'Photo')} — ${fmtDate(p.created_at)}${p.author ? ', ' + esc(p.author) : ''}</figcaption>
        </figure>`).join('')}
    </div>` : ''}`;
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
    }).join('') : '<p class="quiet">No repairs recorded for this period.</p>'}
    ${docFoot(g ? g.code + ' · repair history' : 'Fleet repair history')}`);
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
      }).join('') || '<tr><td colspan="5" class="quiet">Nothing outstanding.</td></tr>'}
    </table>
    ${docFoot('Fleet status')}`);
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
                      <div class="kmeta">${(() => { const p = jobPulse(o);
                        return `<b class="kpulse tone-${p.tone}">${esc(p.label)}</b>${p.at ? ' ' + esc(ago(p.at)) : ''}`; })()}${
                        o.repairer === 'external'
                        ? ' · ' + esc(o.external_company || 'external') : ''}</div>
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
   Screen — the landing page
   ================================================================ */
function renderHub(view) {
  const gear = activeGear();
  const open = activeOrders().length;
  const red = gear.filter(g => gearStatus(g) === 'red').length;

  const board = serviceBoard();
  const svc = { total: board.length,
                red: board.filter(d => d.state === 'red').length,
                orange: board.filter(d => d.state === 'orange').length };

  view.innerHTML = `
    <div class="hub">
      <a class="hub-card" href="#/gear">
        <span class="hub-icon">${icon('spanner')}</span>
        <b>Maintenance</b>
        <span class="hub-sub">Gear status, damage reports and repairs</span>
        <span class="hub-stat">${open} open work order${open === 1 ? '' : 's'}${red ? ` · ${red} out of action` : ''}</span>
      </a>

      <a class="hub-card" href="#/service">
        <span class="hub-icon">${icon('calendar')}</span>
        <b>Planned servicing and maintenance</b>
        <span class="hub-sub">Services and inspections, before anything breaks</span>
        <span class="hub-stat">${svc.total
          ? (svc.red || svc.orange
              ? [svc.red ? `${svc.red} overdue` : '', svc.orange ? `${svc.orange} due soon` : ''].filter(Boolean).join(' · ')
              : 'Everything up to date')
          : 'Nothing planned yet'}</span>
      </a>
      <a class="hub-card" href="#/manuals">
        <span class="hub-icon">${icon('book')}</span>
        <b>Manuals</b>
        <span class="hub-sub">Operator and workshop books, on every phone</span>
        <span class="hub-stat">${DB.manuals.length
          ? `${DB.manuals.length} manual${DB.manuals.length === 1 ? '' : 's'} on file`
          : 'Nothing uploaded yet'}</span>
      </a>
    </div>

    <p class="muted small center mt">Everything else is in the ⋮ menu.</p>`;
}

/* ================================================================
   Planned servicing and maintenance

   The other half of the job: the work done so gear doesn't break, rather
   than because it has. A plan is a rule — this service, every so many
   months and/or so many hours. The log is what actually happened. When
   something is next due is worked out from the two every time it is
   asked for, never stored, so it cannot drift out of step.

   Deliberately apart from work orders. A service coming due does not take
   a machine out of operation and does not touch its colour on the gear
   board, which still answers only "can we use it today".
   ================================================================ */
function serviceBanner() {
  return serviceTableMissing
    ? `<div class="banner">The servicing tables aren't in the database yet, so plans
       you set up here stay on this phone. Run <code>supabase-schema.sql</code> in
       Supabase again — it is safe to re-run — then reopen the app.</div>`
    : '';
}

/* Common intervals, so setting up thirty-odd machines isn't an evening's
   typing. These fill the form in; nothing is forced. */
const SERVICE_PRESETS = [
  { name: '250 hour service',   every_hours: 250 },
  { name: '500 hour service',   every_hours: 500 },
  { name: '1000 hour service',  every_hours: 1000 },
  { name: 'Six-monthly service', every_months: 6 },
  { name: 'Annual service',     every_months: 12 },
  { name: 'CoF',                every_months: 6 },
  { name: 'Grease and check over', every_months: 1 }
];

const plansFor = id => DB.service_plans
  .filter(p => p.gear_id === id && p.active !== false)
  .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
const planById = id => DB.service_plans.find(p => p.id === id);
const activePlans = () => DB.service_plans.filter(p => p.active !== false && gearById(p.gear_id));

/** The services done against a plan, newest first. */
const serviceHistory = planId => DB.service_log
  .filter(e => e.plan_id === planId)
  .sort((a, b) => String(b.done_on || '').localeCompare(String(a.done_on || '')));

const gearHistory = gearId => DB.service_log
  .filter(e => e.gear_id === gearId)
  .sort((a, b) => String(b.done_on || '').localeCompare(String(a.done_on || '')));

/** Same day of the month, n months on, without rolling into the next one. */
function addMonths(dateStr, n) {
  const d = new Date(String(dateStr) + 'T00:00:00');
  if (isNaN(d)) return null;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(n));
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** How close a service is, worked out from the plan and what has been done.

    Months and hours are answered separately and the tighter one wins, so a
    machine that has sat in the yard all winter still comes up for its annual,
    and one working double shifts comes up on hours long before the date. */
function serviceDue(plan) {
  const g = gearById(plan.gear_id) || {};
  const last = serviceHistory(plan.id)[0] || null;
  const out = {
    plan, gear: g, last,
    dueDate: null, daysLeft: null,
    dueHours: null, hoursLeft: null,
    state: 'green', text: '', sub: '', rank: 1e9
  };

  if (plan.every_months) {
    const from = (last && last.done_on) || plan.starts_on || (plan.created_at || '').slice(0, 10);
    if (from) {
      out.dueDate = addMonths(from, plan.every_months);
      out.daysLeft = daysFromToday(out.dueDate);
    }
  }

  if (plan.every_hours) {
    const base = last && last.hours != null ? Number(last.hours)
               : plan.start_hours != null ? Number(plan.start_hours) : null;
    if (base != null) {
      out.dueHours = base + Number(plan.every_hours);
      if (g.hours != null && g.hours !== '') out.hoursLeft = out.dueHours - Number(g.hours);
    }
  }

  // how urgent each measure is, on the same scale, so they can be compared
  const byDays = out.daysLeft;
  // a working day is roughly eight hours on the meter; near enough to rank by
  const byHoursAsDays = out.hoursLeft == null ? null : out.hoursLeft / 8;
  const worst = [byDays, byHoursAsDays].filter(v => v != null).sort((a, b) => a - b)[0];

  const dateBits = [];
  if (out.dueDate) {
    dateBits.push(out.daysLeft < 0 ? `${-out.daysLeft} day${out.daysLeft === -1 ? '' : 's'} overdue`
      : out.daysLeft === 0 ? 'due today'
      : `${out.daysLeft} day${out.daysLeft === 1 ? '' : 's'}`);
  }
  if (out.hoursLeft != null) {
    dateBits.push(out.hoursLeft < 0 ? `${Math.round(-out.hoursLeft)} hours over`
      : `${Math.round(out.hoursLeft)} hours`);
  } else if (plan.every_hours) {
    dateBits.push(g.hours == null || g.hours === '' ? 'no hour reading' : 'no starting hours');
  }

  if (worst == null) {
    out.state = 'unknown';
    out.text = 'Not enough to go on';
    out.sub = plan.every_hours ? 'Log the machine\u2019s hours to start the clock' : 'Set a start date';
    out.rank = 1e8;
  } else {
    // due soon is the fortnight before, or the last tenth of an hours interval
    const hoursSoon = plan.every_hours ? Math.max(25, plan.every_hours * 0.1) : 0;
    const soon = (byDays != null && byDays <= 14) ||
                 (out.hoursLeft != null && out.hoursLeft <= hoursSoon);
    out.state = worst < 0 ? 'red' : soon ? 'orange' : 'green';
    out.text = worst < 0 ? 'Overdue' : soon ? 'Due soon' : 'Up to date';
    out.sub = dateBits.join(' \u00b7 ');
    out.rank = worst;
  }

  return out;
}

/** Everything due, worst first — the planner's list. */
function serviceBoard() {
  return activePlans().map(serviceDue).sort((a, b) => a.rank - b.rank);
}

/** How a machine is tracking overall: its tightest plan. */
function gearServiceState(gearId) {
  const dues = plansFor(gearId).map(serviceDue);
  if (!dues.length) return null;
  if (dues.some(d => d.state === 'red')) return 'red';
  if (dues.some(d => d.state === 'orange')) return 'orange';
  if (dues.every(d => d.state === 'unknown')) return 'unknown';
  return 'green';
}

async function logHours(g, hours) {
  await Store.patch('gear', g.id, {
    hours: Number(hours), hours_at: new Date().toISOString(), hours_by: whoami()
  });
}

let serviceFilter = 'due';

function renderServiceBoard(view) {
  const board = serviceBoard();
  const counts = {
    red: board.filter(d => d.state === 'red').length,
    orange: board.filter(d => d.state === 'orange').length,
    green: board.filter(d => d.state === 'green').length,
    unknown: board.filter(d => d.state === 'unknown').length
  };
  const noPlan = activeGear().filter(g => !plansFor(g.id).length);
  const shown = serviceFilter === 'all' ? board
    : serviceFilter === 'due' ? board.filter(d => d.state === 'red' || d.state === 'orange')
    : board.filter(d => d.state === serviceFilter);

  view.innerHTML = `
    ${serviceBanner()}
    <div class="tally">
      <button class="status-red" data-f="red" aria-pressed="${serviceFilter === 'red'}">
        <span class="n">${counts.red}</span><span class="l">Overdue</span></button>
      <button class="status-orange" data-f="orange" aria-pressed="${serviceFilter === 'orange'}">
        <span class="n">${counts.orange}</span><span class="l">Due soon</span></button>
      <button class="status-green" data-f="green" aria-pressed="${serviceFilter === 'green'}">
        <span class="n">${counts.green}</span><span class="l">Up to date</span></button>
    </div>

    <div class="filters">
      <button class="chip" data-f="due" aria-pressed="${serviceFilter === 'due'}">Needs doing</button>
      <button class="chip" data-f="all" aria-pressed="${serviceFilter === 'all'}">Everything</button>
      ${counts.unknown ? `<button class="chip" data-f="unknown" aria-pressed="${serviceFilter === 'unknown'}">
        Waiting on a reading (${counts.unknown})</button>` : ''}
    </div>

    ${shown.length ? shown.map((d, i) => svcRow(d, i)).join('')
      : `<div class="empty"><b>${serviceFilter === 'due' ? 'Nothing due' : 'Nothing here'}</b>${
          board.length ? 'Every service on the fleet is up to date.'
                       : 'No servicing set up yet — start with a machine below.'}</div>`}

    ${noPlan.length ? `
      <div class="section-title">No servicing set up (${noPlan.length})</div>
      <p class="muted small" style="margin:-4px 4px 9px">These machines have no plan against them, so nothing will ever come due.</p>
      <div class="chipwrap">
        ${noPlan.map(g => `<button class="tagname tap" data-gear="${g.id}">${esc(g.code)}</button>`).join('')}
      </div>` : ''}`;

  $$('[data-f]', view).forEach(b => b.onclick = () => {
    serviceFilter = serviceFilter === b.dataset.f && b.classList.contains('chip') ? 'all' : b.dataset.f;
    renderServiceBoard(view);
  });
  $$('[data-gear]', view).forEach(b => b.onclick = () => go('#/service/' + b.dataset.gear));
  wireSvcRows(view);
}

function svcRow(d, i) {
  const g = d.gear;
  return `
    <button class="wo status-${d.state === 'unknown' ? 'grey' : d.state}" data-svc="${d.plan.id}"
            style="--i:${Math.min(i || 0, 10)}">
      <div class="hdr">
        <span class="num">${esc(g.code || '')}</span>
        <span class="num">${esc(catLabel(catOf(g)))}</span>
      </div>
      <div class="ttl">${esc(d.plan.name || 'Service')}</div>
      <div class="sub">
        <span class="pill"><span class="swatch"></span>${esc(d.text)}</span>
        ${d.sub ? `<span>${esc(d.sub)}</span>` : ''}
        ${d.dueDate ? `<span>due ${fmtDate(d.dueDate)}</span>` : ''}
        ${d.last ? `<span>last ${fmtDate(d.last.done_on)}</span>` : '<span>never done</span>'}
      </div>
    </button>`;
}
function wireSvcRows(root) {
  $$('[data-svc]', root).forEach(b => b.onclick = () => {
    const p = planById(b.dataset.svc);
    if (p) go('#/service/' + p.gear_id);
  });
}

/** Every machine and how its servicing is tracking. */
function renderServiceFleet(view) {
  const gear = sortedGear(activeGear());
  view.innerHTML = `
    ${serviceBanner()}
    ${gear.length ? `<div class="gear-grid">
      ${gear.map((g, i) => {
        const st = gearServiceState(g.id);
        const plans = plansFor(g.id);
        const next = plans.map(serviceDue).filter(d => d.state !== 'unknown').sort((a, b) => a.rank - b.rank)[0];
        return `
          <button class="gear-card status-${st === null || st === 'unknown' ? 'grey' : st}"
                  data-gear="${g.id}" style="--i:${Math.min(i, 14)}">
            <div class="code">${esc(g.code)}</div>
            <div class="name">${esc(g.name || catLabel(catOf(g)))}</div>
            <div class="loc">${plans.length
              ? `${plans.length} service${plans.length === 1 ? '' : 's'} planned`
              : 'Nothing planned'}</div>
            <div class="loc">${next ? esc(next.text + (next.sub ? ' \u00b7 ' + next.sub : ''))
              : plans.length ? 'Waiting on a reading' : '\u2014'}</div>
            ${g.hours != null && g.hours !== '' ? `<div class="hrs">${Number(g.hours).toLocaleString('en-NZ')} h</div>` : ''}
          </button>`;
      }).join('')}
    </div>` : `<div class="empty"><b>No gear yet</b>Add the fleet from the maintenance side first.</div>`}`;
  $$('[data-gear]', view).forEach(b => b.onclick = () => go('#/service/' + b.dataset.gear));
}

/** One machine: its hours, its plans, and what has been done. */
function renderServiceGear(view) {
  const g = gearById(route.path.split('/')[2]);
  if (!g) { view.innerHTML = `<div class="empty"><b>Gear not found</b></div>`; return; }
  const plans = plansFor(g.id);
  const dues = plans.map(serviceDue).sort((a, b) => a.rank - b.rank);
  const done = gearHistory(g.id);

  $('#title').textContent = g.code;

  view.innerHTML = `
    ${serviceBanner()}
    <div class="card">
      <div class="tiny" style="color:var(--ink-3);letter-spacing:.03em;font-weight:700">${esc(catLabel(catOf(g)))}</div>
      <h2 style="font-size:19px;margin:2px 0 4px">${esc(g.code)}${g.name ? ' — ' + esc(g.name) : ''}</h2>
      <a class="small muted" href="#/gear/${g.id}">Open it on the maintenance side</a>

      <label class="field mt"><span>Hour meter reading</span>
        <input type="number" id="svcHours" step="1" inputmode="numeric"
               value="${g.hours != null ? esc(g.hours) : ''}" placeholder="e.g. 4820">
      </label>
      <p class="tiny muted" style="margin:-4px 2px 9px">${g.hours_at
        ? `Last read ${fmtDate(g.hours_at)}${g.hours_by ? ' by ' + esc(g.hours_by) : ''}. Hour-based services count from here.`
        : 'Nothing read yet. Hour-based services stay quiet until there is a reading.'}</p>
      <button class="btn wide" id="svcSaveHours">Save the reading</button>
    </div>

    <div class="section-title">Planned (${plans.length})</div>
    ${dues.length ? dues.map(d => `
      <div class="card accent status-${d.state === 'unknown' ? 'grey' : d.state}">
        <div class="row" style="align-items:baseline;gap:10px">
          <h2 style="font-size:16px" class="grow">${esc(d.plan.name || 'Service')}</h2>
          <span class="pill"><span class="swatch"></span>${esc(d.text)}</span>
        </div>
        <div class="small mt" style="color:var(--ink-2)">
          Every ${[d.plan.every_months ? `${d.plan.every_months} month${d.plan.every_months === 1 ? '' : 's'}` : '',
                   d.plan.every_hours ? `${d.plan.every_hours} hours` : ''].filter(Boolean).join(' or ')}${
            d.sub ? ' \u00b7 ' + esc(d.sub) : ''}
        </div>
        <div class="small" style="color:var(--ink-3);margin-top:3px">
          ${d.last ? `Last done ${fmtDate(d.last.done_on)}${d.last.hours != null ? ` at ${Number(d.last.hours).toLocaleString('en-NZ')} h` : ''}${d.last.done_by ? ' by ' + esc(d.last.done_by) : ''}`
                   : 'Never done'}${d.dueDate ? ` \u00b7 next due ${fmtDate(d.dueDate)}` : ''}${
            d.dueHours != null ? ` \u00b7 at ${Number(d.dueHours).toLocaleString('en-NZ')} h` : ''}
        </div>
        <div class="btn-row mt">
          <a class="btn sm primary" href="#/service/done/${d.plan.id}">${icon('tick')}Mark it done</a>
          <a class="btn sm" href="#/service/plan/${d.plan.id}">Edit</a>
        </div>
      </div>`).join('')
      : `<div class="card muted small">Nothing planned for this machine yet.</div>`}

    <a class="btn primary wide mt" href="#/service/plan/new?gear=${g.id}">${icon('plus')}Add a service</a>

    <div class="section-title">Done (${done.length})</div>
    ${done.length ? `<div class="card">
      ${done.slice(0, 20).map(e => `
        <div class="m-row">
          <span class="grow">
            <b>${esc(e.name || 'Service')}</b>
            <span class="tiny" style="display:block;color:var(--ink-3)">
              ${fmtDate(e.done_on)}${e.hours != null ? ` \u00b7 ${Number(e.hours).toLocaleString('en-NZ')} h` : ''}${
                e.done_by ? ' \u00b7 ' + esc(e.done_by) : ''}${e.note ? ' \u00b7 ' + esc(e.note) : ''}
            </span>
          </span>
        </div>`).join('')}
    </div>` : `<div class="card muted small">Nothing recorded yet.</div>`}
    ${done.length > 20 ? '<p class="muted small center">Showing the 20 most recent.</p>' : ''}`;

  $('#svcSaveHours', view).onclick = async function () {
    const v = $('#svcHours', view).value;
    if (v === '') return toast('Put the reading in first');
    this.disabled = true;
    await logHours(g, v);
    toast('Reading saved');
    render();
  };
}

/** Recording a service. Doing it here is what resets the clock. */
function renderServiceDone(view) {
  const plan = planById(route.path.split('/')[3]);
  if (!plan) { view.innerHTML = `<div class="empty"><b>Service not found</b></div>`; return; }
  const g = gearById(plan.gear_id) || {};
  const d = serviceDue(plan);

  $('#title').textContent = 'Mark it done';

  view.innerHTML = `
    <div class="card">
      <div class="tiny" style="color:var(--ink-3);letter-spacing:.03em;font-weight:700">${esc(g.code || '')}</div>
      <h2 style="font-size:18px;margin:2px 0 8px">${esc(plan.name || 'Service')}</h2>
      <p class="small muted" style="margin:0">${d.last
        ? `Last done ${fmtDate(d.last.done_on)}. Recording it again starts the clock from the date you put in.`
        : 'This is the first one. Everything after it is counted from here.'}</p>

      <label class="field mt"><span>Done on</span>
        <input type="date" id="dOn" value="${esc(today())}"></label>
      <label class="field"><span>Hour meter at the time${plan.every_hours ? '' : ' (optional)'}</span>
        <input type="number" id="dHours" step="1" inputmode="numeric"
               value="${g.hours != null ? esc(g.hours) : ''}" placeholder="e.g. 4820"></label>
      <label class="field"><span>What was done (optional)</span>
        <textarea id="dNote" placeholder="Oils and filters, greased, checked the tracks…"></textarea></label>
      <button class="btn primary wide" id="dSave">Record it</button>
    </div>`;

  $('#dSave', view).onclick = async function () {
    const on = $('#dOn', view).value || today();
    const hoursRaw = $('#dHours', view).value;
    if (plan.every_hours && hoursRaw === '') return toast('This one counts hours — put the reading in');
    this.disabled = true;
    const hours = hoursRaw === '' ? null : Number(hoursRaw);
    await Store.insert('service_log', {
      id: uid(), plan_id: plan.id, gear_id: plan.gear_id, name: plan.name,
      done_on: on, hours, done_by: whoami(), note: $('#dNote', view).value.trim(),
      created_at: new Date().toISOString()
    });
    // the meter only goes forwards; don't wind a machine back on an old entry
    if (hours != null && (g.hours == null || g.hours === '' || hours >= Number(g.hours))) await logHours(g, hours);
    toast('Recorded — the clock starts again');
    go('#/service/' + plan.gear_id);
  };
}

/** Setting up or changing a plan. */
function renderServicePlan(view) {
  const seg = route.path.split('/')[3];
  const editing = seg === 'new' ? null : planById(seg);
  const g = editing ? gearById(editing.gear_id) : gearById(route.query.gear);
  if (!g) { view.innerHTML = `<div class="empty"><b>Pick a machine first</b></div>`; return; }
  const p = editing || {};

  $('#title').textContent = editing ? 'Edit service' : 'Add a service';

  view.innerHTML = `
    <div class="card">
      <div class="tiny" style="color:var(--ink-3);letter-spacing:.03em;font-weight:700">${esc(g.code)}${
        g.name ? ' — ' + esc(g.name) : ''}</div>

      ${editing ? '' : `<p class="small muted mt">Start from one of these, or write your own.</p>
        <div class="chipwrap mt">
          ${SERVICE_PRESETS.map((x, i) => `<button class="tagname tap" data-preset="${i}">${esc(x.name)}</button>`).join('')}
        </div>`}

      <label class="field mt"><span>What is it?</span>
        <input type="text" id="pName" value="${esc(p.name || '')}" placeholder="e.g. 500 hour service"></label>

      <p class="small muted">How often? Fill in one or both — whichever comes first wins.</p>
      <div class="row" style="gap:10px">
        <label class="field grow"><span>Every … months</span>
          <input type="number" id="pMonths" step="1" min="1" inputmode="numeric"
                 value="${p.every_months != null ? esc(p.every_months) : ''}" placeholder="—"></label>
        <label class="field grow"><span>Every … hours</span>
          <input type="number" id="pHours" step="1" min="1" inputmode="numeric"
                 value="${p.every_hours != null ? esc(p.every_hours) : ''}" placeholder="—"></label>
      </div>

      <label class="field"><span>Counting from</span>
        <input type="date" id="pFrom" value="${esc((p.starts_on || today()).slice(0, 10))}"></label>
      <label class="field"><span>Hours at that point (optional)</span>
        <input type="number" id="pStartHours" step="1" inputmode="numeric"
               value="${p.start_hours != null ? esc(p.start_hours) : (g.hours != null ? esc(g.hours) : '')}"
               placeholder="e.g. 4820"></label>
      <p class="tiny muted" style="margin:-4px 2px 10px">Only used until the first one is recorded — after that it counts
        from what was actually done.</p>

      <button class="btn primary wide" id="pSave">${editing ? 'Save changes' : 'Add it'}</button>
      ${editing ? `<button class="btn wide mt" id="pDrop">Remove this service</button>` : ''}
    </div>`;

  $$('[data-preset]', view).forEach(b => b.onclick = () => {
    const x = SERVICE_PRESETS[Number(b.dataset.preset)];
    $('#pName', view).value = x.name;
    $('#pMonths', view).value = x.every_months || '';
    $('#pHours', view).value = x.every_hours || '';
  });

  $('#pSave', view).onclick = async function () {
    const name = $('#pName', view).value.trim();
    const months = $('#pMonths', view).value;
    const hours = $('#pHours', view).value;
    if (!name) return toast('Give it a name');
    if (!months && !hours) return toast('Say how often — months, hours, or both');
    const startHours = $('#pStartHours', view).value;
    const row = {
      gear_id: g.id, name,
      every_months: months ? Number(months) : null,
      every_hours: hours ? Number(hours) : null,
      starts_on: $('#pFrom', view).value || today(),
      start_hours: startHours === '' ? null : Number(startHours),
      active: true
    };
    this.disabled = true;
    if (editing) await Store.patch('service_plans', editing.id, row);
    else await Store.insert('service_plans', Object.assign({ id: uid(), note: '',
      created_at: new Date().toISOString() }, row));
    toast(editing ? 'Saved' : 'Added');
    go('#/service/' + g.id);
  };

  const drop = $('#pDrop', view);
  if (drop) drop.onclick = async () => {
    if (!confirm(`Remove "${p.name}" from ${g.code}?\n\nWhat has already been done stays on the record.`)) return;
    await Store.patch('service_plans', editing.id, { active: false });
    toast('Removed');
    go('#/service/' + g.id);
  };
}

/* ================================================================
   Manuals — the books the crew need on site

   Not tied to a machine or a job: a manual covers a model, and the same
   book serves every one of them. Uploaded once, it is in everyone's
   pocket. Nothing here carries a status colour — colour still only means
   whether gear is working.
   ================================================================ */
function manualsBanner() {
  return manualsTableMissing
    ? `<div class="banner">The manuals table isn't in the database yet, so anything
       you add here stays on this phone. Run the <strong>Manuals</strong> section at the
       end of <code>supabase-schema.sql</code> in Supabase — it is safe to re-run —
       then reopen the app.</div>`
    : '';
}

const manualsSorted = () => DB.manuals.slice()
  .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));

/** What kind of book this is, from the file itself. */
function fileKind(f) {
  const t = String((f && f.type) || '').toLowerCase();
  const n = String((f && f.name) || '').toLowerCase();
  if (t.includes('pdf') || n.endsWith('.pdf')) return 'PDF';
  if (t.startsWith('image/')) return 'Image';
  if (/word|document/.test(t) || /\.docx?$/.test(n)) return 'Word';
  if (/sheet|excel/.test(t) || /\.xlsx?$/.test(n)) return 'Sheet';
  const ext = (n.split('.').pop() || '').toUpperCase();
  return ext && ext.length <= 4 ? ext : 'File';
}

function fileSize(f) {
  const b = Number((f && f.size) || 0);
  if (!b) return '';
  if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
  return (b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
}

let manualQuery = '';

function renderManuals(view) {
  const all = manualsSorted();
  const needle = manualQuery.trim().toLowerCase();
  const list = needle
    ? all.filter(m => `${m.title} ${m.note || ''} ${(m.file || {}).name || ''}`.toLowerCase().includes(needle))
    : all;

  view.innerHTML = `
    ${manualsBanner()}
    ${all.length > 6 ? `<label class="field"><input type="text" id="mq"
      placeholder="Search manuals" value="${esc(manualQuery)}"></label>` : ''}

    ${list.length ? `<div class="manual-grid">
      ${list.map((m, i) => {
        const f = m.file || {};
        const size = fileSize(f);
        return `
          <a class="manual-card" href="${esc(f.url || '#')}" ${f.url ? 'target="_blank" rel="noopener"' : ''}
             data-id="${esc(m.id)}" style="--i:${Math.min(i, 14)}">
            <span class="m-kind">${esc(fileKind(f))}</span>
            <span class="m-title">${esc(m.title || f.name || 'Untitled')}</span>
            ${m.note ? `<span class="m-note">${esc(m.note)}</span>` : ''}
            <span class="m-meta">${[size, m.added_by ? 'added by ' + m.added_by : ''].filter(Boolean).join(' · ')}</span>
            ${f.pending || f.local ? '<span class="m-meta">Held on this device until there is signal.</span>' : ''}
          </a>`;
      }).join('')}
    </div>` : all.length
      ? `<div class="empty"><b>Nothing matches</b>No manual has "${esc(manualQuery.trim())}" in it.</div>`
      : `<div class="empty"><b>No manuals yet</b>Upload the operator and workshop books
         and they will be in everyone's pocket.</div>`}

    <div class="btn-row mt">
      <a class="btn primary" href="#/manuals/new">${icon('plus')}Add a manual</a>
    </div>`;

  const q = $('#mq', view);
  if (q) q.oninput = () => {
    manualQuery = q.value;
    const at = q.selectionStart;
    renderManuals(view);
    const again = $('#mq', view);
    if (again) { again.focus(); again.setSelectionRange(at, at); }
  };
}

function renderManualForm(view) {
  $('#title').textContent = 'Add a manual';
  view.innerHTML = `
    ${manualsBanner()}
    <div class="card">
      <label class="field"><span>What is it?</span>
        <input type="text" id="mTitle" placeholder="e.g. Wirtgen W100 operator manual" autocomplete="off">
      </label>
      <label class="field"><span>Anything worth noting (optional)</span>
        <input type="text" id="mNote" placeholder="e.g. covers the 2019 model onwards">
      </label>
      <input type="file" id="mFile" hidden>
      <button class="btn wide" id="mPick">${icon('clip')}Choose the file</button>
      <p class="small muted mt" id="mChosen">A PDF is best — it opens on any phone.</p>
      <button class="btn primary wide mt" id="mSave">Add it</button>
    </div>

    ${DB.manuals.length ? `
      <div class="section-title">Already there (${DB.manuals.length})</div>
      <div class="card">
        ${manualsSorted().map(m => `
          <div class="m-row">
            <span class="grow">${esc(m.title || (m.file || {}).name || 'Untitled')}</span>
            <button class="linky danger" data-drop="${esc(m.id)}">Remove</button>
          </div>`).join('')}
      </div>` : ''}`;

  let picked = null;
  const input = $('#mFile', view);
  $('#mPick', view).onclick = () => input.click();
  input.onchange = () => {
    picked = (input.files || [])[0] || null;
    $('#mChosen', view).textContent = picked
      ? `${picked.name} · ${fileSize(picked) || 'ready'}`
      : 'A PDF is best — it opens on any phone.';
    // save typing: the file name makes a decent title if none was given
    const t = $('#mTitle', view);
    if (picked && !t.value.trim()) {
      t.value = picked.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    }
  };

  $('#mSave', view).onclick = async function () {
    const title = $('#mTitle', view).value.trim();
    if (!picked) return toast('Choose the file first');
    if (!title) return toast('Give it a title');
    this.disabled = true;
    this.textContent = 'Uploading…';
    const up = await Store.upload(picked);
    await Store.insert('manuals', {
      id: uid(), title, note: $('#mNote', view).value.trim(),
      file: up, added_by: whoami(), created_at: new Date().toISOString()
    });
    toast('Manual added');
    go('#/manuals');
  };

  $$('[data-drop]', view).forEach(b => b.onclick = async () => {
    const m = DB.manuals.find(x => x.id === b.dataset.drop);
    if (!m) return;
    if (!confirm(`Remove "${m.title || 'this manual'}"?\n\nThe file itself stays in storage.`)) return;
    await Store.remove('manuals', m.id);
    toast('Removed');
    render();
  });
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
      <p class="muted small">This name goes on everything you report and every note you
        post, so put something the workshop will recognise.</p>
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
  keepUpToDate();
})();

/* ----------------------------------------------------------------------
   Staying current.

   A phone that keeps the app open — a home-screen app resumed rather than
   relaunched — can sit on an old build for days without anyone knowing.
   The worker is asked for a fresh copy whenever the app is brought back to
   the front, and when a new one takes over the page reloads itself once,
   so what is on screen is what was deployed.
   ---------------------------------------------------------------------- */
function keepUpToDate() {
  if (!('serviceWorker' in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then(reg => {
    const check = () => { reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    window.addEventListener('focus', check);
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
}
