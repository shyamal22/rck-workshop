/* =====================================================================
   RCK Quotes — every quote that leaves the office: what it stands at,
   the cost allowed inside it, and whether the client has answered.
   Plain JavaScript, no build step, no frameworks.

   It is set up like RCK Costing next door — no logins, no server, no
   database. The quotes live in the browser storage of the phone they
   were entered on, the app itself is a handful of files served by
   GitHub Pages, and what leaves it is a printed PDF quote for the
   client. The client's copy never shows the internal figures.

   The shape of a quote, in the order it is filled in:

     1. The job — who it's for, where, what kind of work.
     2. The prices — the line items the client will read.
     3. The allowances — what those prices are allowed to cost us,
        line by line. Internal, and never printed on the quote.
     4. The answer — sent, then accepted or declined, with the dates.

   Everything else on screen is worked out from those four things:
   the margin priced in, the pipeline waiting on clients, the win
   rate, and which quotes have sat unanswered long enough to chase.
   ===================================================================== */
'use strict';

const VERSION = '1.2.0';
const SITE = window.RCKQ_CONFIG || {};
const GST = isFinite(Number(SITE.gst)) ? Number(SITE.gst) : 0.15;
const DEFAULT_VALID_DAYS = Number(SITE.validDays) || 30;

/* A newer version has downloaded but can't take over until every tab of
   the old one is gone. Rather than leave someone tapping a feature that
   isn't there yet, Settings says so. */
let updateReady = false;

/* ------------------------------------------------------- quote states */
/* Four, and only four. A quote is being written, is with the client, or
   the client has said yes or no. "Expired" is not a state anyone sets —
   it is worked out from the valid-until date on a sent quote, so it can
   never be forgotten and never be wrong. */
const QUOTE_STATUS = [
  { key: 'draft',    label: 'Draft',    tone: 'grey',
    blurb: 'Being put together — not sent yet' },
  { key: 'sent',     label: 'Sent',     tone: 'blue',
    blurb: 'With the client, waiting on an answer' },
  { key: 'accepted', label: 'Accepted', tone: 'green',
    blurb: 'Won — the client said yes' },
  { key: 'declined', label: 'Declined', tone: 'red',
    blurb: 'Lost — kept on the record' }
];

/* Chasing: a sent quote that has waited this long is worth a call. */
const CHASE_DAYS = 10;

/* ------------------------------------------------------ types of work */
/* The same list RCK Costing starts with, so a quote that becomes a job
   lands under the same name. Anyone can add more when writing a quote. */
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
/* The internal allowances are broken down against the same lines RCK
   Costing uses, key for key — so when a won quote is handed to Costing,
   every allowance lands as that job's expected cost with nothing
   retyped and nothing renamed. */
const COST_LINES = [
  { key: 'labour',    label: 'Labour',             hint: 'Wages, hours, overtime' },
  { key: 'plant',     label: 'Plant & equipment',  hint: 'Machine hire, floats, fuel' },
  { key: 'materials', label: 'Materials',          hint: 'Asphalt, aggregate, emulsion' },
  { key: 'subbies',   label: 'Subcontractors',     hint: 'Anyone invoicing us for the work' },
  { key: 'tm',        label: 'Traffic management', hint: 'TM crews, signs, closures' },
  { key: 'cartage',   label: 'Cartage & disposal', hint: 'Trucking, tip fees' },
  { key: 'other',     label: 'Other',              hint: 'Anything that fits nowhere else' }
];

function allCostLines() {
  const builtin = new Set(COST_LINES.map(l => l.key));
  const added = (DB.lines || []).filter(l => l && l.key && !builtin.has(l.key));
  return COST_LINES.filter(l => l.key !== 'other')
    .concat(added, COST_LINES.filter(l => l.key === 'other'));
}
function costLineLabel(key) {
  const l = allCostLines().find(x => x.key === key);
  return l ? l.label : humanise(key);
}
function addCostLine(name) {
  const key = slug(name);
  if (!key) return null;
  if (!allCostLines().some(l => l.key === key)) {
    DB.lines.push({ key, label: String(name).trim() });
    saveData();
  }
  return key;
}
function costLineUsed(key) {
  return DB.quotes.some(q => hasMoney((q.allowances || {})[key]));
}

/** The existing line a typed name lands on — by key or by label, in any
    spelling — so "tm", "Traffic management" and "traffic_management" are
    one line, not three. Null means the name is new. */
function resolveLineKey(name) {
  const want = slug(name);
  if (!want || want === 'other' && !String(name).trim()) return null;
  const hit = allCostLines().find(l => l.key === want || slug(l.label) === want);
  return hit ? hit.key : null;
}

/** Custom lines nobody uses any more go quietly. Renaming a line in the
    allowance editor makes a fresh one under the new name; this is what
    keeps the old name from haunting the chips forever. */
function pruneCostLines() {
  DB.lines = (DB.lines || []).filter(l => l && l.key && costLineUsed(l.key));
  saveData();
}

/* The units a line item can be priced in. */
const UNITS = ['lump sum', 'm²', 'm', 'm³', 't', 'hr', 'day', 'each'];

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
function humanise(key) {
  return String(key || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
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
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(iso, n) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + Number(n || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  if (isNaN(da) || isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}

/* ------------------------------------------------------------- money */
/* An empty money box means "nobody knows yet". That is a null, and it
   stays a null all the way through: a figure worked out from a number
   nobody has entered is a guess wearing a dollar sign. */
function hasMoney(v) { return v != null && v !== '' && isFinite(Number(v)); }

function readMoney(raw) {
  const v = String(raw == null ? '' : raw).trim().replace(/[$,\s]/g, '');
  if (!v) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function readNum(raw) {
  const v = String(raw == null ? '' : raw).trim().replace(/,/g, '');
  if (!v) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

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
/** Short money for tiles and the chart: $84K, $1.2M, $640. */
function fmtCompact(v) {
  if (!hasMoney(v)) return '—';
  const n = Number(v), a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a < 1e7 ? 1 : 0).replace(/\.0$/, '') + 'M';
  if (a >= 1e4) return s + '$' + Math.round(a / 1e3) + 'K';
  if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return s + '$' + Math.round(a);
}
function fmtSigned(v, forceCents) {
  if (!hasMoney(v)) return '—';
  const n = Number(v);
  return (n > 0 ? '+' : '') + fmtMoney(n, forceCents);
}
function fmtPct(v, dp) {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(dp == null ? 1 : dp) + '%';
}
function toneOf(v) {
  if (!hasMoney(v)) return '';
  return Number(v) > 0 ? 'pos' : Number(v) < 0 ? 'neg' : '';
}
function fmtQty(v) {
  if (!hasMoney(v)) return '';
  const n = Number(v);
  return String(Math.abs(n % 1) > 0.0049 ? n.toFixed(2).replace(/0$/, '') : n);
}

function quoteNo(q) { return 'Q-' + String((q && q.number) || 0).padStart(4, '0'); }

function statusDef(key) { return QUOTE_STATUS.find(s => s.key === key) || QUOTE_STATUS[0]; }
function statusLabel(key) { return statusDef(key).label; }
function statusTone(key) { return statusDef(key).tone; }

/* --------------------------------------------------- types of work */
function typeOf(q) { return ((q && q.work_type) || '').trim() || 'other'; }
function builtinType(key) { return BUILTIN_WORK_TYPES.find(t => t.key === key); }
function typeLabel(key) {
  const b = builtinType(key);
  return b ? b.label : humanise(key);
}
function allTypeKeys() {
  const seen = new Set(BUILTIN_WORK_TYPES.map(t => t.key));
  const extra = [];
  DB.quotes.forEach(q => {
    const k = typeOf(q);
    if (!seen.has(k)) { seen.add(k); extra.push(k); }
  });
  extra.sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)));
  return BUILTIN_WORK_TYPES.filter(t => t.key !== 'other').map(t => t.key)
    .concat(extra, ['other']);
}
function matchType(name) {
  const want = slug(name);
  return allTypeKeys().find(k => k === want) || want;
}

/* ------------------------------------------------------------ settings */
let S = null;
const Settings = {
  read() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('rckq.settings') || '{}'); } catch (e) {}
    return Object.assign({ name: '', lastBackup: '' }, saved);
  },
  write(patch) {
    const next = Object.assign(Settings.read(), patch);
    localStorage.setItem('rckq.settings', JSON.stringify(next));
    S = next;
    return next;
  }
};
function whoami() { return (S && S.name) || 'Unknown'; }

/* ================================================================
   The data. Everything lives on this device:

   · Quotes, their line items and internal allowances, and the notes
     hung on them, in localStorage under one key.
   · This is the only copy. So the backup file is not a nicety here,
     it is the safety net: Settings writes every quote to one file,
     reads one back, and the app says so when it has been a while.
   ================================================================ */
const DB = { quotes: [], comments: [], lines: [], seq: 0 };

const CACHE_KEY = 'rckq.data';

function loadData() {
  DB.quotes = []; DB.comments = []; DB.lines = []; DB.seq = 0;
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (raw) {
      DB.quotes = raw.quotes || [];
      DB.comments = raw.comments || [];
      DB.lines = raw.lines || [];
      DB.seq = Number(raw.seq) || 0;
    }
  } catch (e) {}
  const highest = DB.quotes.reduce((n, q) => Math.max(n, Number(q.number) || 0), 0);
  if (DB.seq < highest) DB.seq = highest;
  adoptCostLines();
}

/* A restored backup, or an older version of the app, may carry an
   allowance under a line this device has never named. Adopt it, so the
   figure shows instead of silently vanishing from the totals. */
function adoptCostLines() {
  const known = new Set(allCostLines().map(l => l.key));
  DB.quotes.forEach(q => {
    Object.keys(q.allowances || {}).forEach(k => {
      if (!known.has(k)) { DB.lines.push({ key: k, label: humanise(k) }); known.add(k); }
    });
  });
}

/** Every write goes through here, so nothing can be entered and lost. */
function saveData() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      quotes: DB.quotes, comments: DB.comments, lines: DB.lines, seq: DB.seq
    }));
    return true;
  } catch (e) {
    toast('Could not save — the phone\'s storage may be full');
    return false;
  }
}

const Store = {
  insert(list, row) {
    if (!row.id) row.id = uid();
    if (!row.created_at) row.created_at = new Date().toISOString();
    if (list === 'quotes' && !row.number) row.number = ++DB.seq;
    DB[list].push(row);
    saveData();
    return row;
  },
  patch(list, id, patch) {
    const arr = DB[list];
    const i = arr.findIndex(r => r.id === id);
    if (i < 0) return null;
    arr[i] = Object.assign({}, arr[i], patch, { updated_at: new Date().toISOString() });
    saveData();
    return arr[i];
  },
  /** A quote takes its notes with it. */
  removeQuote(id) {
    DB.comments = DB.comments.filter(c => c.quote_id !== id);
    DB.quotes = DB.quotes.filter(q => q.id !== id);
    saveData();
  }
};

function quoteById(id) { return DB.quotes.find(q => q.id === id) || null; }
function commentsFor(id) {
  return DB.comments.filter(c => c.quote_id === id)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

/* ------------------------------------------------------------ backups */
const Backup = {
  make() {
    return {
      app: 'RCK Quotes', version: VERSION, taken: new Date().toISOString(),
      device: { name: S.name },
      quotes: DB.quotes, comments: DB.comments, lines: DB.lines, seq: DB.seq
    };
  },
  download() {
    const blob = new Blob([JSON.stringify(Backup.make(), null, 2)], { type: 'application/json' });
    saveAs(URL.createObjectURL(blob), `rck-quotes-${today()}.json`);
    Settings.write({ lastBackup: new Date().toISOString() });
  },
  async share() {
    const file = new File([JSON.stringify(Backup.make(), null, 2)],
      `rck-quotes-${today()}.json`, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'RCK Quotes backup' });
      Settings.write({ lastBackup: new Date().toISOString() });
      return true;
    }
    return false;
  },
  restore(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.quotes)) throw new Error('That is not an RCK Quotes backup.');
    DB.quotes = data.quotes || [];
    DB.comments = data.comments || [];
    DB.lines = data.lines || [];
    DB.seq = Number(data.seq) || 0;
    const highest = DB.quotes.reduce((n, q) => Math.max(n, Number(q.number) || 0), 0);
    if (DB.seq < highest) DB.seq = highest;
    adoptCostLines();
    saveData();
    return DB.quotes.length;
  },
  age() {
    if (!S.lastBackup) return null;
    const d = new Date(S.lastBackup);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }
};

function saveAs(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
}

function storageUsed() {
  try { return (localStorage.getItem(CACHE_KEY) || '').length; } catch (e) { return 0; }
}

/* ================================================================
   Reading a quote — every figure on every screen comes from here,
   and from nowhere else.
   ================================================================ */
/** What one line item comes to. A rate with no quantity is a lump sum:
    the rate IS the price. No rate means the line isn't priced yet, and
    an unpriced line never adds a silent zero to the total. */
function itemAmount(it) {
  if (!it || !hasMoney(it.rate)) return null;
  const qty = hasMoney(it.qty) ? Number(it.qty) : 1;
  return qty * Number(it.rate);
}

function sumAllowances(map) {
  let total = null;
  Object.keys(map || {}).forEach(k => {
    if (hasMoney(map[k])) total = (total || 0) + Number(map[k]);
  });
  return total;
}

/** Everything the money side of a quote can say, in one object. */
function quoteMoney(q) {
  const items = q.items || [];
  let total = null, unpriced = 0;
  items.forEach(it => {
    const a = itemAmount(it);
    if (a == null) { if ((it.desc || '').trim()) unpriced++; }
    else total = (total || 0) + a;
  });
  const allow = sumAllowances(q.allowances);
  const margin = (total != null && allow != null) ? total - allow : null;
  const marginPct = (margin != null && total) ? margin / total * 100 : null;
  return {
    total, unpriced, allow, margin, marginPct,
    gst: total != null ? total * GST : null,
    incl: total != null ? total * (1 + GST) : null
  };
}

function validUntil(q) {
  if (!q.sent_on) return null;
  return addDays(q.sent_on, q.valid_days == null ? DEFAULT_VALID_DAYS : q.valid_days);
}
function isExpired(q) {
  const vu = validUntil(q);
  return q.status === 'sent' && vu != null && vu < today();
}
function daysWaiting(q) {
  if (q.status !== 'sent' || !q.sent_on) return null;
  return daysBetween(q.sent_on, today());
}
function needsChase(q) {
  const w = daysWaiting(q);
  return w != null && w >= CHASE_DAYS && !isExpired(q);
}
function expiresSoon(q) {
  const vu = validUntil(q);
  if (q.status !== 'sent' || vu == null || isExpired(q)) return false;
  return daysBetween(today(), vu) <= 7;
}

/* Inline icons — no icon font, no network request, they inherit text colour. */
const ICONS = {
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  doc: '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3.5V8.5h5"/><path d="M8.75 13h6.5M8.75 16.5h4"/>',
  send: '<path d="M21 3.5 10.2 14.3M21 3.5l-6.8 17-3-7.2-7.2-3z"/>',
  print: '<path d="M7 8V3.5h10V8"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M7 13.5h10v7H7z"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 5.5v-.5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5"/>',
  tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  hand: '<path d="M8 12.5V6a1.6 1.6 0 0 1 3.2 0v5"/><path d="M11.2 11V4.6a1.6 1.6 0 0 1 3.2 0V11"/><path d="M14.4 11.2V6.3a1.6 1.6 0 0 1 3.2 0v7.9a6.4 6.4 0 0 1-6.4 6.3 6.4 6.4 0 0 1-5.4-2.9L3 13.6a1.6 1.6 0 0 1 2.6-1.8L8 14.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.6 4.6"/>'
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
const CHEV = '<span class="chev"><svg viewBox="0 0 8 14"><path d="M1.5 1.5 6.5 7l-5 5.5"/></svg></span>';

/* ================================================================
   Chrome — the navigation bar, routing, toast.
   ================================================================ */
const view = $('#view');
const topbar = $('#topbar');
const navTitle = $('#navTitle');
const backBtn = $('#backBtn');
const gearBtn = $('#gearBtn');
const addBtn = $('#addBtn');

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function go(hash) { location.hash = hash; }

/** What the bar shows on this screen. Home gets the gear and the plus;
    everything else gets a back button, iOS-fashion. */
function setNav(opts) {
  const o = opts || {};
  navTitle.textContent = o.title || '';
  backBtn.hidden = !o.back;
  gearBtn.hidden = !!o.back;
  addBtn.hidden = !o.add;
  backBtn.onclick = () => { o.back === true ? go('#/') : go(o.back); };
  $('#backLabel').textContent = o.backLabel || 'Back';
  topbar.classList.toggle('subpage', !!o.back);
  topbar.classList.toggle('scrolled', window.scrollY > 30);
}
gearBtn.onclick = () => go('#/settings');
addBtn.onclick = () => go('#/new');

window.addEventListener('scroll', () => {
  topbar.classList.toggle('scrolled', window.scrollY > 30);
}, { passive: true });

/* ------------------------------------------------------------- router */
const ROUTES = {
  '':        renderBoard,
  'new':     renderDetails,
  'edit':    renderDetails,
  'quote':   renderQuote,
  'items':   renderItems,
  'costs':   renderCosts,
  'paste':   renderPaste,
  'clients': renderClients,
  'client':  renderClient,
  'settings': renderSettings
};

function render() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
  const route = parts[0] || '';
  const fn = ROUTES[route] || renderBoard;
  window.scrollTo(0, 0);
  if (!S.name && route !== 'settings') return renderWelcome(view);
  fn(view, parts.slice(1));
}
window.addEventListener('hashchange', render);

function notFound(v, what) {
  setNav({ back: true, title: '' });
  v.innerHTML = `<div class="empty"><b>${esc(what)} not found</b>
    It may have been deleted on this phone.</div>`;
}

/* ================================================================
   Screen — first open. One name, once, so every note and every
   printed quote says who wrote it.
   ================================================================ */
function renderWelcome(v) {
  setNav({});
  v.innerHTML = `
    <div class="welcome">
      <img class="w-icon" src="icon-192.png" alt="">
      <h1>RCK Quotes</h1>
      <p>Every quote that leaves the office — what it stands at, the cost allowed
         inside it, and whether the client has answered. Everything stays on this
         phone; nothing is sent anywhere.</p>
      <div class="form">
        <label class="field"><span>Your name — it signs your notes and the printed quotes</span>
          <input type="text" id="wname" placeholder="e.g. Shyamal" autocomplete="name"></label>
      </div>
      <button class="btn primary" id="wstart">Start</button>
    </div>`;
  $('#wstart', v).onclick = () => {
    const name = $('#wname', v).value.trim();
    if (!name) return toast('Type your name first');
    Settings.write({ name });
    render();
  };
}

/* ================================================================
   Screen — the board. The dashboard the app opens on: the pipeline
   in four tiles, the quotes that need a look, six months of sent
   against won, and every quote beneath.
   ================================================================ */
let boardFilter = 'all';
let boardSearch = '';

/** This month's won work, this instant's pipeline, and a 12-month win
    rate — the three questions a director asks in the ute. */
function boardStats() {
  const sent = DB.quotes.filter(q => q.status === 'sent');
  const pipeline = sent.reduce((t, q) => {
    const m = quoteMoney(q);
    return m.total != null ? t + m.total : t;
  }, 0);

  const mNow = today().slice(0, 7);
  const wonMonth = DB.quotes.filter(q => q.status === 'accepted' &&
    (q.decided_on || '').slice(0, 7) === mNow);
  const wonMonthTotal = wonMonth.reduce((t, q) => {
    const m = quoteMoney(q);
    return m.total != null ? t + m.total : t;
  }, 0);

  const yearAgo = addDays(today(), -365);
  const decided = DB.quotes.filter(q =>
    (q.status === 'accepted' || q.status === 'declined') &&
    (q.decided_on || q.updated_at || q.created_at || '').slice(0, 10) >= yearAgo);
  const won = decided.filter(q => q.status === 'accepted').length;
  const winRate = decided.length ? won / decided.length * 100 : null;

  /* Margin priced into what is out with clients right now — only from
     quotes whose allowances are actually entered. */
  let mTotal = 0, mMargin = 0, mAny = false;
  sent.forEach(q => {
    const m = quoteMoney(q);
    if (m.total != null && m.margin != null) { mTotal += m.total; mMargin += m.margin; mAny = true; }
  });
  const pipeMargin = mAny && mTotal ? mMargin / mTotal * 100 : null;

  return { sent, pipeline, wonMonth, wonMonthTotal, decided, won, winRate, pipeMargin };
}

/** Six months of what was sent against what was won, by value. */
function monthlySeries() {
  const months = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push({
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
      label: MONTHS[m.getMonth()],
      sent: 0, won: 0
    });
  }
  const byKey = Object.fromEntries(months.map(m => [m.key, m]));
  DB.quotes.forEach(q => {
    const m = quoteMoney(q);
    if (m.total == null) return;
    if (q.sent_on) {
      const b = byKey[q.sent_on.slice(0, 7)];
      if (b) b.sent += m.total;
    }
    if (q.status === 'accepted' && q.decided_on) {
      const b = byKey[q.decided_on.slice(0, 7)];
      if (b) b.won += m.total;
    }
  });
  return months;
}

/** The chart: paired bars per month, the sent value in quiet grey and
    the won value in blue. Bars are thin with rounded tops, hairline
    baseline, and a tap on any month reads out the exact figures. */
function chartSvg(months) {
  const W = 320, H = 120, top = 14, bottom = 20;
  const max = Math.max(1, ...months.map(m => Math.max(m.sent, m.won)));
  const slot = W / months.length;
  const bw = 12, gap = 2;
  const y = v => top + (H - top - bottom) * (1 - v / max);
  const bar = (x, v, cls) => {
    if (v <= 0) return '';
    const h = Math.max(2, H - bottom - y(v));
    const r = Math.min(3, h / 2);
    const yy = H - bottom - h;
    return `<path class="${cls}" d="M${x} ${H - bottom}v${-(h - r)}a${r} ${r} 0 0 1 ${r} ${-r}h${bw - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - r}z"/>`;
  };
  const cols = months.map((m, i) => {
    const cx = i * slot + slot / 2;
    const label = m.won > 0 && m.won >= max * 0.18
      ? `<text class="c-val" x="${cx + gap / 2 + bw / 2}" y="${y(m.won) - 4}" text-anchor="middle">${fmtCompact(m.won)}</text>` : '';
    return `<g class="bar-hit" data-i="${i}">
      <rect x="${i * slot}" y="0" width="${slot}" height="${H}" fill="transparent"/>
      ${bar(cx - gap / 2 - bw, m.sent, 'b-sent')}
      ${bar(cx + gap / 2, m.won, 'b-won')}
      ${label}
      <text class="c-month" x="${cx}" y="${H - 6}" text-anchor="middle">${m.label}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Value quoted and value won over the last six months">
    <style>
      .b-sent { fill: var(--bar-dim); }
      .b-won  { fill: var(--accent); }
      .c-month { font: 600 9px -apple-system, sans-serif; fill: var(--ink-2); }
      .c-val { font: 600 8.5px -apple-system, sans-serif; fill: var(--ink-2); }
    </style>
    <line x1="0" y1="${H - bottom}" x2="${W}" y2="${H - bottom}" stroke="var(--sep)" stroke-width="1"/>
    ${cols}
  </svg>`;
}

function statusRank(q) {
  return { sent: 0, draft: 1, accepted: 2, declined: 3 }[q.status] ?? 4;
}

function quoteRow(q) {
  const m = quoteMoney(q);
  let flag = '';
  if (isExpired(q)) flag = `<div class="r-flag red">Expired ${fmtShort(validUntil(q))} — still unanswered</div>`;
  else if (needsChase(q)) flag = `<div class="r-flag orange">Sent ${plural(daysWaiting(q), 'day')} ago — worth a call</div>`;
  else if (expiresSoon(q)) flag = `<div class="r-flag orange">Expires ${fmtShort(validUntil(q))}</div>`;
  else if (q.status === 'sent') flag = `<div class="r-flag blue">Sent ${fmtShort(q.sent_on)} · valid to ${fmtShort(validUntil(q))}</div>`;
  else if (q.status === 'accepted' && q.start_date && q.start_date >= today())
    flag = `<div class="r-flag green">Starts ${fmtShort(q.start_date)} · in ${plural(daysBetween(today(), q.start_date), 'day')}</div>`;
  return `
    <a class="row-item" href="#/quote/${q.id}">
      <div class="r-main">
        <div class="r-title">${esc(q.name || 'Untitled quote')}</div>
        <div class="r-sub">${esc(q.client || 'No client named')} · ${quoteNo(q)}</div>
        ${flag}
      </div>
      <div class="r-side">
        <div class="r-money">${m.total != null ? fmtMoney(m.total) : '—'}</div>
        <span class="pill ${statusTone(q.status)}">${statusLabel(q.status)}</span>
      </div>
      ${CHEV}
    </a>`;
}

function renderBoard(v) {
  setNav({ add: true, title: 'Quotes' });
  const st = boardStats();
  const months = monthlySeries();
  const hasAny = DB.quotes.length > 0;

  /* The quotes that need a look, most urgent first: expired, then
     unanswered past the chase mark, then expiring within the week. */
  const attention = DB.quotes.filter(q => isExpired(q) || needsChase(q) || expiresSoon(q))
    .sort((a, b) => (isExpired(b) - isExpired(a)) || (needsChase(b) - needsChase(a)) ||
      String(a.sent_on || '').localeCompare(String(b.sent_on || '')));

  /* The work on the horizon: everything not lost with a start date still
     ahead, soonest first — won work to crew for, sent work that might land. */
  const comingUp = DB.quotes
    .filter(q => q.start_date && q.status !== 'declined' && q.start_date >= today())
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 6);

  const filters = [['all', 'All'], ['draft', 'Draft'], ['sent', 'Sent'],
                   ['accepted', 'Won'], ['declined', 'Lost']];
  let list = DB.quotes.slice();
  if (boardFilter !== 'all') list = list.filter(q => q.status === boardFilter);
  if (boardSearch.trim()) {
    const needle = boardSearch.trim().toLowerCase();
    list = list.filter(q => [quoteNo(q), q.name, q.client, q.site, q.reference, q.contact]
      .filter(Boolean).join(' ').toLowerCase().includes(needle));
  }
  list.sort((a, b) => statusRank(a) - statusRank(b) ||
    String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));

  const backupAge = Backup.age();
  const backupNag = hasAny && (backupAge == null || backupAge > 31) ? `
    <div class="card pad small">
      <b>${backupAge == null ? 'No backup has ever been taken.' : 'The last backup is ' + plural(backupAge, 'day') + ' old.'}</b>
      <span class="muted">This phone holds the only copy of every quote.</span>
      <a class="linkline" style="padding:8px 0 0" href="#/settings">Take one in Settings</a>
    </div>` : '';

  v.innerHTML = `
    <h1 class="large-title">Quotes</h1>
    <p class="page-sub">${hasAny
      ? `${plural(st.sent.length, 'quote')} out with clients`
      : 'Every quote, its status, and the margin priced inside it'}</p>

    ${hasAny ? `
    <div class="tiles">
      <button class="tile" data-filter="sent">
        <div class="t-label">Waiting on clients</div>
        <div class="t-value">${fmtCompact(st.pipeline)}</div>
        <div class="t-sub">${plural(st.sent.length, 'quote')} sent, unanswered</div>
      </button>
      <button class="tile" data-filter="accepted">
        <div class="t-label">Won — ${MONTHS[new Date().getMonth()]}</div>
        <div class="t-value ${st.wonMonth.length ? 'pos' : ''}">${fmtCompact(st.wonMonthTotal)}</div>
        <div class="t-sub">${plural(st.wonMonth.length, 'quote')} accepted</div>
      </button>
      <button class="tile" data-go="#/clients">
        <div class="t-label">Win rate — 12 months</div>
        <div class="t-value">${st.winRate == null ? '—' : Math.round(st.winRate) + '%'}</div>
        <div class="t-sub">${st.decided.length ? `${st.won} of ${plural(st.decided.length, 'decided quote')}` : 'Nothing decided yet'}</div>
      </button>
      <button class="tile" data-filter="sent">
        <div class="t-label">Margin priced in</div>
        <div class="t-value ${st.pipeMargin == null ? '' : st.pipeMargin >= 0 ? 'pos' : 'neg'}">${st.pipeMargin == null ? '—' : fmtPct(st.pipeMargin, 0)}</div>
        <div class="t-sub">on what's out right now</div>
      </button>
    </div>` : ''}

    ${backupNag}

    ${attention.length ? `
    <h2 class="sect">Needs a look <span class="count">· ${attention.length}</span></h2>
    <div class="card">${attention.map(quoteRow).join('')}</div>` : ''}

    ${comingUp.length ? `
    <h2 class="sect">Coming up <span class="count">· ${comingUp.length}</span></h2>
    <div class="card">${comingUp.map(q => `
      <a class="row-item" href="#/quote/${q.id}">
        <div class="r-main">
          <div class="r-title">${esc(q.name || 'Untitled quote')}</div>
          <div class="r-sub">${esc(q.client || 'No client named')} · ${quoteNo(q)}</div>
          <div class="r-flag ${q.status === 'accepted' ? 'green' : 'blue'}">Starts ${fmtShort(q.start_date)} · in ${plural(daysBetween(today(), q.start_date), 'day')}${q.status !== 'accepted' ? ' — if it lands' : ''}</div>
        </div>
        <div class="r-side">
          <div class="r-money">${(() => { const mm = quoteMoney(q); return mm.total != null ? fmtMoney(mm.total) : '—'; })()}</div>
          <span class="pill ${statusTone(q.status)}">${statusLabel(q.status)}</span>
        </div>
        ${CHEV}
      </a>`).join('')}</div>` : ''}

    ${hasAny ? `
    <h2 class="sect">By client</h2>
    <div class="card">
      <a class="row-item" href="#/clients">
        <div class="r-main">
          <div class="r-title">Clients</div>
          <div class="r-sub">Who the work comes from — win rate and margin by client</div>
        </div>
        ${CHEV}
      </a>
    </div>` : ''}

    ${hasAny && months.some(m => m.sent || m.won) ? `
    <h2 class="sect">The last six months</h2>
    <div class="card chartcard">
      <div class="c-head">
        <div class="c-title">Quoted against won</div>
        <div class="legend"><span><i style="background:var(--bar-dim)"></i>Sent</span>
          <span><i style="background:var(--accent)"></i>Won</span></div>
      </div>
      ${chartSvg(months)}
      <div class="c-readout" id="chartReadout">Tap a month for the figures</div>
    </div>` : ''}

    <h2 class="sect">Every quote ${DB.quotes.length ? `<span class="count">· ${DB.quotes.length}</span>` : ''}</h2>
    <div class="seg" id="seg">
      ${filters.map(([k, l]) => `<button data-f="${k}" class="${boardFilter === k ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    <div class="searchwrap">${icon('search')}
      <input type="search" id="q" value="${esc(boardSearch)}"
             placeholder="Search quote, client, site or number" autocapitalize="off">
    </div>
    ${list.length
      ? `<div class="card">${list.map(quoteRow).join('')}</div>`
      : `<div class="card"><div class="empty">${hasAny
          ? 'Nothing matches.'
          : `<b>No quotes yet</b>Tap <span style="color:var(--accent)">＋</span> and price the first one — or paste one straight from your Claude pricing chat. It stays a draft until you mark it sent.`}
        </div></div>`}
    <a class="linkline" href="#/paste">Paste a quote from your pricing chat</a>`;

  $$('#seg button', v).forEach(b => b.onclick = () => { boardFilter = b.dataset.f; render(); });
  /* A tile is the question; tapping it opens the list that answers it. */
  $$('.tile[data-filter]', v).forEach(t => t.onclick = () => {
    boardFilter = t.dataset.filter;
    render();
    const seg = $('#seg', view);
    if (seg) seg.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  $$('.tile[data-go]', v).forEach(t => t.onclick = () => go(t.dataset.go));
  const q = $('#q', v);
  if (q) {
    q.oninput = () => {
      boardSearch = q.value;
      /* Redraw only the list, so the keyboard stays up. */
      render();
      const nq = $('#q', view);
      if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
    };
  }
  $$('.bar-hit', v).forEach(g => g.onclick = () => {
    const m = months[Number(g.dataset.i)];
    $('#chartReadout', v).textContent =
      `${m.label}: sent ${fmtMoney(m.sent)} · won ${fmtMoney(m.won)}`;
  });
}

/* ================================================================
   Screen — quote details (new and edit).
   ================================================================ */
function renderDetails(v, args) {
  const editing = args && args[0] ? quoteById(args[0]) : null;
  if (args && args[0] && !editing) return notFound(v, 'Quote');
  const q = editing || {};
  setNav({ back: editing ? '#/quote/' + editing.id : true,
           backLabel: editing ? quoteNo(editing) : 'Quotes',
           title: editing ? 'Edit details' : 'New quote' });

  const cur = typeOf(q);
  const clients = Array.from(new Set(DB.quotes.map(x => (x.client || '').trim()).filter(Boolean))).sort();

  v.innerHTML = `
    <h1 class="large-title">${editing ? 'Details' : 'New quote'}</h1>
    <p class="page-sub">${editing ? quoteNo(editing) : 'The job and the client. The prices go in next.'}</p>
    ${editing ? '' : `<a class="btn tinted" href="#/paste">${icon('copy')}Priced it in your Claude chat? Paste it in</a>`}

    <div class="form">
      <label class="field"><span>What the job is</span>
        <input type="text" id="name" value="${esc(q.name || '')}" placeholder="e.g. Mill & pave — Great South Rd"></label>
      <label class="field"><span>Client</span>
        <input type="text" id="client" value="${esc(q.client || '')}" placeholder="e.g. Auckland Transport" list="clients">
        <datalist id="clients">${clients.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
      <label class="field"><span>Contact <span class="muted">— who the quote goes to</span></span>
        <input type="text" id="contact" value="${esc(q.contact || '')}" placeholder="Name, email or phone"></label>
      <label class="field"><span>Site</span>
        <input type="text" id="site" value="${esc(q.site || '')}" placeholder="Address, or the stretch of road"></label>
      <label class="field"><span>Type of work</span>
        <select id="type">
          ${allTypeKeys().map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(typeLabel(k))}</option>`).join('')}
          <option value="__new">+ Add a new type…</option>
        </select></label>
      <label class="field"><span>Their reference <span class="muted">(optional)</span></span>
        <input type="text" id="ref" value="${esc(q.reference || '')}" placeholder="RFQ / tender / enquiry number"></label>
      <label class="field"><span>Scope of work <span class="muted">— printed on the quote</span></span>
        <textarea id="desc" placeholder="What the price covers, in the client's language.">${esc(q.description || '')}</textarea></label>
    </div>

    <div class="form">
      <div class="frow">
        <label class="field"><span>Quote stands for</span>
          <input type="number" id="valid" inputmode="numeric" min="1"
                 value="${esc(q.valid_days == null ? DEFAULT_VALID_DAYS : q.valid_days)}"></label>
        ${editing && q.sent_on ? `
        <label class="field"><span>Sent on</span>
          <input type="date" id="senton" value="${esc(q.sent_on)}"></label>` : `
        <div class="field"><span>days from the day it is sent</span>
          <div class="muted small" style="padding-top:3px">The expiry works itself out.</div></div>`}
      </div>
      <label class="field"><span>Work likely to start <span class="muted">(optional)</span></span>
        <input type="date" id="workstart" value="${esc(q.start_date || '')}"></label>
      <div class="hintline">Won or not, the board's <b>Coming up</b> list runs off this date —
        it is how next month's workload is seen before it lands.</div>
    </div>

    <button class="btn primary" id="save">${editing ? 'Save details' : 'Create the quote'}</button>
    ${editing ? '' : '<p class="muted small center">It stays a draft until you mark it sent.</p>'}`;

  // "+ Add a new type…" becomes a real type the moment it is named.
  const typeSel = $('#type', v);
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

  $('#save', v).onclick = () => {
    const name = $('#name', v).value.trim();
    if (!name) return toast('Say what the job is');
    if (typeSel.value === '__new') return toast('Pick the type of work');
    const validDays = readNum($('#valid', v).value);

    const data = {
      name,
      client: $('#client', v).value.trim(),
      contact: $('#contact', v).value.trim(),
      site: $('#site', v).value.trim(),
      work_type: typeSel.value,
      reference: $('#ref', v).value.trim(),
      description: $('#desc', v).value.trim(),
      valid_days: validDays == null ? DEFAULT_VALID_DAYS : Math.max(1, Math.round(validDays)),
      start_date: $('#workstart', v).value || null
    };
    const sentEl = $('#senton', v);
    if (sentEl) data.sent_on = sentEl.value || q.sent_on;

    if (editing) {
      Store.patch('quotes', editing.id, data);
      toast('Saved');
      go('#/quote/' + editing.id);
    } else {
      const saved = Store.insert('quotes', Object.assign({
        status: 'draft', items: [], allowances: {}, created_by: whoami()
      }, data));
      toast('Quote created — now price it');
      go('#/items/' + saved.id);
    }
  };
}

/* ================================================================
   Screen — one quote. The status and its next step at the top, the
   money in one card, then everything the quote is made of.
   ================================================================ */
function renderQuote(v, args) {
  const q = quoteById(args[0]);
  if (!q) return notFound(v, 'Quote');
  const m = quoteMoney(q);
  const notes = commentsFor(q.id);
  const expired = isExpired(q);
  const vu = validUntil(q);
  const allowLines = allCostLines().filter(l => hasMoney((q.allowances || {})[l.key]));

  setNav({ back: true, backLabel: 'Quotes', title: quoteNo(q) });

  /* The one next step each status has, plus the quieter way back. */
  let actions = '';
  if (q.status === 'draft') {
    actions = `<button class="btn primary" id="markSent">${icon('send')}Mark as sent</button>`;
  } else if (q.status === 'sent') {
    actions = `
      <div class="btn-pair">
        <button class="btn green" id="accept">${icon('tick')}Accepted</button>
        <button class="btn danger" id="decline">${icon('cross')}Declined</button>
      </div>
      ${needsChase(q) ? `<p class="muted small center">Sent ${plural(daysWaiting(q), 'day')} ago with no answer — worth a call.</p>` : ''}
      ${expired ? `<p class="small center" style="color:var(--neg)">This quote expired on ${fmtDate(vu)}. Accept or decline it, or re-send it with today's date from Edit details.</p>` : ''}`;
  } else if (q.status === 'accepted') {
    const inCosting = q.costing_job_id && costingHasJob(q.costing_job_id);
    actions = inCosting
      ? `<a class="btn tinted" href="../costing/#/job/${esc(q.costing_job_id)}">${icon('doc')}Open the job in RCK Costing</a>`
      : `<button class="btn primary" id="toCosting">${icon('hand')}Hand it to RCK Costing</button>
         <p class="muted small center">Makes it a job in the Costing app on this phone — the quote
         becomes the agreed price, the allowances become the expected costs.</p>`;
  } else if (q.status === 'declined') {
    actions = q.outcome_note
      ? `<div class="card pad small"><b>Why it went elsewhere</b><br><span class="muted">${esc(q.outcome_note)}</span></div>` : '';
  }

  v.innerHTML = `
    <div class="card">
      <div class="hero">
        <span class="pill ${statusTone(q.status)}">${statusLabel(q.status)}${expired ? ' · expired' : ''}</span>
        <div class="h-label">${esc(q.name || 'Untitled quote')}</div>
        <div class="h-value">${m.total != null ? fmtMoney(m.total) : '—'}</div>
        <div class="h-gst">${m.total != null ? `+ GST ${fmtMoney(m.gst, true)} = ${fmtMoney(m.incl, true)} incl` : 'No prices entered yet'}</div>
      </div>
      <div class="split3">
        <div><div class="s-l">Allowed cost</div><div class="s-v">${fmtMoney(m.allow)}</div></div>
        <div><div class="s-l">Margin</div><div class="s-v ${toneOf(m.margin)}">${fmtSigned(m.margin)}</div></div>
        <div><div class="s-l">Margin %</div><div class="s-v ${toneOf(m.margin)}">${fmtPct(m.marginPct)}</div></div>
      </div>
      <div class="internal-note">Internal — never printed on the client's quote.</div>
    </div>

    ${m.unpriced ? `<div class="card pad small"><b>${plural(m.unpriced, 'line item')} not priced yet.</b>
      <span class="muted">The total above is only what has a rate on it.</span></div>` : ''}

    ${actions}

    <h2 class="sect">What the client sees</h2>
    <div class="card">
      <div class="moneyrows">
        ${(q.items || []).filter(it => (it.desc || '').trim()).length
          ? (q.items || []).filter(it => (it.desc || '').trim()).map(it => {
              const a = itemAmount(it);
              const qty = hasMoney(it.qty) && it.unit !== 'lump sum'
                ? `${fmtQty(it.qty)} ${esc(it.unit || '')} @ ${fmtMoney(it.rate)}` : '';
              return `<div><div class="m-l">${esc(it.desc)}${qty ? `<div class="m-d">${qty}</div>` : ''}</div>
                <div class="m-v ${a == null ? 'muted-v' : ''}">${a == null ? 'no rate' : fmtMoney(a)}</div></div>`;
            }).join('') +
            `<div class="tot"><div class="m-l">Total, excl GST</div><div class="m-v">${fmtMoney(m.total, true)}</div></div>`
          : `<div><div class="m-l muted">No line items yet — the quote can't be printed until it has prices.</div></div>`}
      </div>
      <button class="row-item" data-go="#/items/${q.id}">
        <div class="r-main" style="color:var(--accent)">Edit the prices</div>${CHEV}
      </button>
    </div>

    <h2 class="sect">What it's allowed to cost us</h2>
    <div class="card">
      <div class="moneyrows">
        ${allowLines.length
          ? allowLines.map(l => `<div><div class="m-l">${esc(l.label)}</div>
              <div class="m-v">${fmtMoney(q.allowances[l.key])}</div></div>`).join('') +
            `<div class="tot"><div class="m-l">Allowed cost</div><div class="m-v">${fmtMoney(m.allow, true)}</div></div>`
          : `<div><div class="m-l muted">No allowances entered — enter them and the margin works itself out.</div></div>`}
      </div>
      ${q.basis ? `<div class="hintline"><b>Priced on:</b> <span style="white-space:pre-wrap">${esc(q.basis)}</span></div>` : ''}
      <button class="row-item" data-go="#/costs/${q.id}">
        <div class="r-main" style="color:var(--accent)">Edit the allowances${q.basis ? '' : ' & what it was priced on'}</div>${CHEV}
      </button>
      ${allowLines.length || q.basis
        ? `<button class="row-item" id="printInternal">
             <div class="r-main" style="color:var(--accent)">Print the internal sheet</div>${CHEV}
           </button>` : ''}
    </div>

    <h2 class="sect">The job</h2>
    <div class="card">
      <div class="kv">
        <div><div class="k">Number</div><div class="v"><b>${quoteNo(q)}</b></div></div>
        <div><div class="k">Client</div><div class="v">${q.client
          ? `<a href="#/client/${encodeURIComponent(q.client.trim())}" style="color:var(--accent);text-decoration:none">${esc(q.client)}</a>`
          : '—'}</div></div>
        ${q.contact ? `<div><div class="k">Contact</div><div class="v">${esc(q.contact)}</div></div>` : ''}
        ${q.site ? `<div><div class="k">Site</div><div class="v">${esc(q.site)}</div></div>` : ''}
        <div><div class="k">Work</div><div class="v">${esc(typeLabel(typeOf(q)))}</div></div>
        ${q.start_date ? `<div><div class="k">Likely start</div><div class="v">${fmtDate(q.start_date)}${
          q.status !== 'declined' && q.start_date >= today()
            ? ` <span class="muted">· in ${plural(daysBetween(today(), q.start_date), 'day')}</span>` : ''}</div></div>` : ''}
        ${q.reference ? `<div><div class="k">Their ref</div><div class="v">${esc(q.reference)}</div></div>` : ''}
        ${q.sent_on ? `<div><div class="k">Sent</div><div class="v">${fmtDate(q.sent_on)}</div></div>` : ''}
        ${vu ? `<div><div class="k">Valid to</div><div class="v">${fmtDate(vu)}${expired ? ' <span class="neg">— expired</span>' : ''}</div></div>` : ''}
        ${q.decided_on ? `<div><div class="k">${q.status === 'accepted' ? 'Accepted' : q.status === 'declined' ? 'Declined' : 'Decided'}</div>
          <div class="v">${fmtDate(q.decided_on)}</div></div>` : ''}
        ${q.po_ref ? `<div><div class="k">Client order</div><div class="v">${esc(q.po_ref)}</div></div>` : ''}
      </div>
      ${q.description ? `<div class="hintline" style="white-space:pre-wrap">${esc(q.description)}</div>` : ''}
      <button class="row-item" data-go="#/edit/${q.id}">
        <div class="r-main" style="color:var(--accent)">Edit details</div>${CHEV}
      </button>
    </div>

    <button class="btn" id="print" ${m.total == null ? 'disabled style="opacity:.45"' : ''}>${icon('print')}Print the quote</button>

    <h2 class="sect">Notes</h2>
    <div class="card">
      <label class="field"><span>What the client said, who you spoke to, what to remember</span>
        <textarea id="noteNew" placeholder="Signed with your name and dated."></textarea></label>
      <button class="row-item" id="noteAdd"><div class="r-main" style="color:var(--accent)">Add the note</div></button>
      ${notes.map(n => `
        <div class="row-plain">
          <div class="small" style="white-space:pre-wrap">${esc(n.text)}</div>
          <div class="tiny muted" style="margin-top:3px">${esc(n.author || 'Unknown')} · ${fmtDate(n.created_at)}</div>
        </div>`).join('')}
    </div>

    <button class="linkline" id="dup">Copy as a new draft</button>
    ${q.status === 'accepted' || q.status === 'declined'
      ? `<button class="linkline" id="reopen">Put it back to Sent</button>`
      : q.status === 'sent'
        ? `<button class="linkline" id="unsend">Put it back to Draft</button>` : ''}
    <button class="linkline red" id="del">Delete this quote</button>`;

  $$('[data-go]', v).forEach(b => b.onclick = () => go(b.dataset.go));

  const markSent = $('#markSent', v);
  if (markSent) markSent.onclick = () => {
    if (!(q.items || []).some(it => itemAmount(it) != null) &&
        !confirm('No line has a price on it yet. Mark it sent anyway?')) return;
    Store.patch('quotes', q.id, { status: 'sent', sent_on: q.sent_on || today() });
    toast('Marked as sent — the clock is running');
    render();
  };
  const accept = $('#accept', v);
  if (accept) accept.onclick = () => {
    const po = (prompt('Client order / PO number, if they gave one (optional)') || '').trim();
    Store.patch('quotes', q.id, { status: 'accepted', decided_on: today(), po_ref: po || q.po_ref || '' });
    toast('Won. Hand it to Costing when the job is set up.');
    render();
  };
  const decline = $('#decline', v);
  if (decline) decline.onclick = () => {
    const why = (prompt('Why did it go elsewhere? (optional — future you will thank you)') || '').trim();
    Store.patch('quotes', q.id, { status: 'declined', decided_on: today(), outcome_note: why || q.outcome_note || '' });
    render();
  };
  const reopen = $('#reopen', v);
  if (reopen) reopen.onclick = () => {
    Store.patch('quotes', q.id, { status: 'sent', decided_on: null });
    render();
  };
  const unsend = $('#unsend', v);
  if (unsend) unsend.onclick = () => {
    Store.patch('quotes', q.id, { status: 'draft' });
    render();
  };
  const toCosting = $('#toCosting', v);
  if (toCosting) toCosting.onclick = () => sendToCosting(q);

  $('#noteAdd', v).onclick = () => {
    const text = $('#noteNew', v).value.trim();
    if (!text) return toast('Write the note first');
    Store.insert('comments', { quote_id: q.id, text, author: whoami() });
    render();
  };

  $('#print', v).onclick = () => {
    if (m.total == null) return toast('Put prices on the quote first');
    printQuote(q);
  };
  const printInternal = $('#printInternal', v);
  if (printInternal) printInternal.onclick = () => printInternalSheet(q);

  $('#dup', v).onclick = () => {
    const copy = Store.insert('quotes', {
      name: q.name, client: q.client, contact: q.contact, site: q.site,
      work_type: q.work_type, reference: q.reference, description: q.description,
      valid_days: q.valid_days, client_note: q.client_note, basis: q.basis,
      start_date: q.start_date,
      items: (q.items || []).map(it => Object.assign({}, it, { id: uid() })),
      allowances: Object.assign({}, q.allowances),
      status: 'draft', created_by: whoami()
    });
    toast('Copied — this one starts as a draft');
    go('#/quote/' + copy.id);
  };

  $('#del', v).onclick = () => {
    if (!confirm(`Delete ${quoteNo(q)} — ${q.name}? Its notes go with it.`)) return;
    if (!confirm('There is no copy anywhere else and no undo. Delete it?')) return;
    Store.removeQuote(q.id);
    toast('Deleted');
    go('#/');
  };
}

/* ================================================================
   Screen — the prices. The line items the client will read, each a
   description with a quantity, a unit and a rate — or just a lump
   sum. The total follows every keystroke.
   ================================================================ */
function renderItems(v, args) {
  const q = quoteById(args[0]);
  if (!q) return notFound(v, 'Quote');
  setNav({ back: '#/quote/' + q.id, backLabel: quoteNo(q), title: 'Prices' });

  /* Work on a copy: nothing touches the quote until Save. */
  let items = (q.items || []).map(it => Object.assign({}, it));
  if (!items.length) items.push({ id: uid(), desc: '', qty: null, unit: 'lump sum', rate: null });

  const itemHtml = (it) => `
    <div class="item-card" data-id="${it.id}">
      <div class="i-top">
        <input type="text" class="i-desc" value="${esc(it.desc || '')}"
               placeholder="e.g. Mill & pave 40mm, incl tack coat">
        <button class="i-x" aria-label="Remove line"><svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg></button>
      </div>
      <div class="i-grid">
        <label><span>Qty</span><input type="number" class="i-qty" inputmode="decimal" step="any"
          value="${esc(hasMoney(it.qty) ? it.qty : '')}" placeholder="—"></label>
        <label><span>Unit</span><select class="i-unit">
          ${UNITS.concat(it.unit && !UNITS.includes(it.unit) ? [it.unit] : [])
            .map(u => `<option value="${u}" ${u === (it.unit || 'lump sum') ? 'selected' : ''}>${u}</option>`).join('')}
        </select></label>
        <label style="flex:1.4"><span>Rate $</span><input type="number" class="i-rate" inputmode="decimal" step="any"
          value="${esc(hasMoney(it.rate) ? it.rate : '')}" placeholder="—"></label>
      </div>
      <div class="i-amt">= <b class="i-total">—</b></div>
    </div>`;

  v.innerHTML = `
    <h1 class="large-title">Prices</h1>
    <p class="page-sub">What the client will read, line by line. All figures exclude GST.
      A rate with no quantity is a lump sum.</p>
    <div class="card" id="itemsWrap">${items.map(itemHtml).join('')}</div>
    <button class="btn" id="addItem">${icon('plus')}Add a line</button>

    <div class="form">
      <label class="field"><span>A note under the prices <span class="muted">(optional, printed)</span></span>
        <textarea id="cnote" placeholder="e.g. Night work allowed for. Council fees excluded.">${esc(q.client_note || '')}</textarea></label>
    </div>

    <div class="card pad" id="liveTotals"></div>
    <button class="btn primary" id="save">Save the prices</button>`;

  const readItems = () => $$('.item-card', v).map(el => ({
    id: el.dataset.id,
    desc: $('.i-desc', el).value.trim(),
    qty: readNum($('.i-qty', el).value),
    unit: $('.i-unit', el).value,
    rate: readMoney($('.i-rate', el).value)
  }));

  const refresh = () => {
    let total = null;
    $$('.item-card', v).forEach(el => {
      const a = itemAmount({
        qty: readNum($('.i-qty', el).value),
        rate: readMoney($('.i-rate', el).value)
      });
      $('.i-total', el).textContent = a == null ? '—' : fmtMoney(a, true);
      if (a != null) total = (total || 0) + a;
    });
    const alw = sumAllowances(q.allowances);
    const margin = total != null && alw != null ? total - alw : null;
    $('#liveTotals', v).innerHTML = `
      <div class="moneyrows" style="margin:-14px -16px">
        <div><div class="m-l">Total, excl GST</div><div class="m-v">${fmtMoney(total, true)}</div></div>
        <div><div class="m-l">GST ${Math.round(GST * 100)}%</div><div class="m-v">${total == null ? '—' : fmtMoney(total * GST, true)}</div></div>
        <div class="tot"><div class="m-l">Quote total, incl GST</div><div class="m-v">${total == null ? '—' : fmtMoney(total * (1 + GST), true)}</div></div>
        ${alw != null ? `<div><div class="m-l muted">Against ${fmtMoney(alw)} allowed → margin</div>
          <div class="m-v ${toneOf(margin)}">${fmtSigned(margin)}</div></div>` : ''}
      </div>`;
  };

  const wire = () => {
    $$('.item-card', v).forEach(el => {
      $$('input, select', el).forEach(i => i.oninput = refresh);
      $('.i-x', el).onclick = () => {
        if (($('.i-desc', el).value.trim() || readMoney($('.i-rate', el).value) != null) &&
            !confirm('Remove this line?')) return;
        if ($$('.item-card', v).length === 1) {
          $('.i-desc', el).value = ''; $('.i-qty', el).value = ''; $('.i-rate', el).value = '';
          refresh(); return;
        }
        el.remove(); refresh();
      };
    });
  };
  wire(); refresh();

  $('#addItem', v).onclick = () => {
    const wrap = $('#itemsWrap', v);
    wrap.insertAdjacentHTML('beforeend',
      itemHtml({ id: uid(), desc: '', qty: null, unit: 'lump sum', rate: null }));
    wire(); refresh();
    const last = wrap.lastElementChild;
    $('.i-desc', last).focus();
  };

  $('#save', v).onclick = () => {
    const clean = readItems().filter(it => it.desc || it.rate != null || it.qty != null);
    Store.patch('quotes', q.id, { items: clean, client_note: $('#cnote', v).value.trim() });
    toast('Prices saved');
    go('#/quote/' + q.id);
  };
}

/* ================================================================
   Screen — the allowances. What the quoted price is allowed to cost,
   against the same lines RCK Costing uses. Internal only.

   One row per line: the name and the figure, both editable in place.
   The standard lines wait as one-tap chips underneath rather than as
   seven empty boxes, and a new line is typed straight into a row — no
   dialogs, no second screen, no scrolling past what isn't used.
   ================================================================ */
function renderCosts(v, args) {
  const q = quoteById(args[0]);
  if (!q) return notFound(v, 'Quote');
  setNav({ back: '#/quote/' + q.id, backLabel: quoteNo(q), title: 'Allowances' });
  const m = quoteMoney(q);

  /* The rows to open with: every line that has a figure on this quote —
     or, on a quote with none yet, the three lines almost every job
     starts with, empty and ready. An empty row saves as nothing. */
  let startRows = allCostLines()
    .filter(l => hasMoney((q.allowances || {})[l.key]))
    .map(l => ({ label: l.label, amount: q.allowances[l.key] }));
  if (!startRows.length)
    startRows = COST_LINES.slice(0, 3).map(l => ({ label: l.label, amount: null }));

  const rowHtml = (r) => `
    <div class="al-row">
      <input type="text" class="al-name" value="${esc(r.label || '')}" placeholder="Name the line">
      <span class="al-amt"><em>$</em>
        <input type="number" class="al-val" inputmode="decimal" step="any"
               value="${esc(hasMoney(r.amount) ? r.amount : '')}" placeholder="—"></span>
      <button class="xbtn" aria-label="Remove line"><svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg></button>
    </div>`;

  v.innerHTML = `
    <h1 class="large-title">Allowances</h1>
    <p class="page-sub">What the quoted price is allowed to cost us. Internal only —
      the client never sees these. An empty figure means <em>not worked out yet</em>, never zero.</p>

    <div class="card" id="alRows">${startRows.map(rowHtml).join('')}</div>
    <div class="chips" id="alChips"></div>

    <div class="form">
      <label class="field"><span>What it was priced on <span class="muted">— internal</span></span>
        <textarea id="basis" placeholder="The rates and assumptions behind the price: asphalt at $x/t from whoever quoted it, production assumed per shift, weather risk, what's excluded. Six months from now this is the note that answers &quot;why did we price it like that?&quot;">${esc(q.basis || '')}</textarea></label>
    </div>

    <div class="card pad" id="liveMargin"></div>
    <button class="btn primary" id="save">Save the allowances</button>`;

  const rowsWrap = $('#alRows', v);

  const readRows = () => $$('.al-row', v).map(r => ({
    label: $('.al-name', r).value.trim(),
    amount: readMoney($('.al-val', r).value)
  }));

  /* The chips are every known line not already a row, plus the way to a
     brand-new one. They redraw as names are typed, so adding "Cartage"
     by hand takes its chip away. */
  const refreshChips = () => {
    const taken = new Set(readRows().map(r => slug(r.label)).filter(s => s && s !== 'other'));
    $$('.al-row .al-name', v).forEach(i => { if (i.value.trim()) taken.add(slug(i.value)); });
    const waiting = allCostLines().filter(l => !taken.has(l.key) && !taken.has(slug(l.label)));
    $('#alChips', v).innerHTML =
      `<span class="chiplabel">Add:</span>` +
      waiting.map(l => `<button class="chip" data-label="${esc(l.label)}">${esc(l.label)}</button>`).join('') +
      `<button class="chip new" data-new>＋ New line…</button>`;
    $$('#alChips .chip', v).forEach(c => c.onclick = () => addRow(c.dataset.label || '', !c.dataset.label));
  };

  const refreshMargin = () => {
    let alw = null;
    readRows().forEach(r => { if (r.amount != null) alw = (alw || 0) + r.amount; });
    const margin = m.total != null && alw != null ? m.total - alw : null;
    const pct = margin != null && m.total ? margin / m.total * 100 : null;
    $('#liveMargin', v).innerHTML = `
      <div class="moneyrows" style="margin:-14px -16px">
        <div><div class="m-l">Quoted, excl GST</div><div class="m-v">${fmtMoney(m.total, true)}</div></div>
        <div><div class="m-l">Allowed cost</div><div class="m-v">${fmtMoney(alw, true)}</div></div>
        <div class="tot"><div class="m-l">Margin priced in</div>
          <div class="m-v ${toneOf(margin)}">${fmtSigned(margin, true)}${pct != null ? ` · ${fmtPct(pct)}` : ''}</div></div>
      </div>`;
  };

  const wireRow = (row) => {
    $('.al-val', row).oninput = refreshMargin;
    $('.al-name', row).onchange = refreshChips;
    $('.xbtn', row).onclick = () => {
      const named = $('.al-name', row).value.trim();
      const val = readMoney($('.al-val', row).value);
      if (val != null && !confirm(`Take ${named || 'this line'} off this quote?`)) return;
      row.remove();
      refreshChips(); refreshMargin();
    };
  };

  const addRow = (label, focusName) => {
    rowsWrap.insertAdjacentHTML('beforeend', rowHtml({ label, amount: null }));
    const row = rowsWrap.lastElementChild;
    wireRow(row);
    refreshChips();
    const target = focusName ? $('.al-name', row) : $('.al-val', row);
    target.focus();
    row.scrollIntoView({ block: 'center' });
  };

  $$('.al-row', v).forEach(wireRow);
  refreshChips();
  refreshMargin();

  $('#save', v).onclick = () => {
    /* Rows become the map: each name lands on its existing line in any
       spelling, or becomes a new line; two rows under one name add up;
       an empty or unpriced row simply doesn't save. */
    const map = {};
    readRows().forEach(r => {
      if (!r.label || r.amount == null) return;
      const key = resolveLineKey(r.label) || addCostLine(r.label);
      if (!key) return;
      map[key] = (map[key] || 0) + r.amount;
    });
    Store.patch('quotes', q.id, { allowances: map, basis: $('#basis', v).value.trim() });
    pruneCostLines();
    toast('Allowances saved');
    go('#/quote/' + q.id);
  };
}

/* ================================================================
   Screen — paste a quote in.

   The quotes are priced in a Claude chat that already knows the
   format; this is the door they come through. Paste what that chat
   produced and the app reads it into a draft — the client, the
   scope, the line items and the internal allowances — ready to be
   checked over rather than retyped.

   The reliable path is the import block: "Copy the ask" puts a
   prompt on the clipboard that tells the pricing chat exactly what
   to answer with. But a plain pasted quote is read too, line by
   line, best-effort.
   ================================================================ */
const IMPORT_PROMPT =
`Turn the quote above into an import block for my RCK Quotes app. Reply with ONLY a JSON code block in exactly this shape:

{"name":"what the job is","client":"","contact":"","site":"","work_type":"e.g. mill & pave","reference":"their RFQ/tender number","description":"scope of work in the client's language","valid_days":30,"start_date":"YYYY-MM-DD or null — when the work would likely start on site","client_note":"","items":[{"desc":"","qty":null,"unit":"m²","rate":null}],"allowances":{"labour":null,"plant":null,"materials":null,"subbies":null,"tm":null,"cartage":null,"other":null},"pricing_basis":"what it was priced on — the rates, quantities and assumptions behind the price, supplier quotes relied on, anything a variation claim would need (internal, never shown to the client)"}

Rules: every figure excludes GST. Use null for anything not known — never 0. A rate with qty null is a lump sum. unit is one of: lump sum, m², m, m³, t, hr, day, each. allowances are my INTERNAL cost allowances (labour, plant, materials, subcontractors, traffic management, cartage) — leave out any line the quote doesn't say; add extra lines by name if the quote has them.`;

/** The first thing in the text that parses as JSON: a fenced block,
    the outermost braces, or the text itself. */
function extractJson(text) {
  const candidates = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(text.slice(a, b + 1));
  candidates.push(text);
  for (const c of candidates) {
    try {
      const o = JSON.parse(c);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch (e) {}
  }
  return null;
}

/** The first of these keys the object answers to, so the pricing
    chat's wording doesn't have to be exact. */
function pickKey(obj, names) {
  const lower = {};
  Object.keys(obj || {}).forEach(k => { lower[k.toLowerCase().replace(/[^a-z0-9]+/g, '_')] = obj[k]; });
  for (const n of names) if (lower[n] != null && lower[n] !== '') return lower[n];
  return null;
}

function normUnit(raw) {
  const u = String(raw || '').toLowerCase().replace(/[.\s]/g, '');
  const map = {
    'm2': 'm²', 'sqm': 'm²', 'm^2': 'm²', 'm²': 'm²', 'sm': 'm²',
    'm3': 'm³', 'm^3': 'm³', 'm³': 'm³', 'cum': 'm³',
    'm': 'm', 'lm': 'm', 'linm': 'm', 'metre': 'm', 'metres': 'm',
    't': 't', 'tonne': 't', 'tonnes': 't', 'ton': 't', 'tons': 't',
    'hr': 'hr', 'hrs': 'hr', 'hour': 'hr', 'hours': 'hr',
    'day': 'day', 'days': 'day',
    'each': 'each', 'ea': 'each', 'no': 'each', 'item': 'each', 'unit': 'each',
    'lumpsum': 'lump sum', 'ls': 'lump sum', 'sum': 'lump sum', 'lump': 'lump sum', '': 'lump sum'
  };
  if (map[u]) return map[u];
  return String(raw).trim();
}

/** Read one imported item, whatever it calls its columns. An amount
    with no rate becomes the rate (over the qty when there is one). */
function readImportItem(row) {
  if (row == null) return null;
  if (typeof row === 'string') return readTextItem(row);
  const desc = String(pickKey(row, ['desc', 'description', 'item', 'name', 'line', 'title']) || '').trim();
  let qty = readNum(pickKey(row, ['qty', 'quantity']));
  let unit = normUnit(pickKey(row, ['unit', 'units', 'uom']));
  let rate = readMoney(pickKey(row, ['rate', 'unit_rate', 'price', 'unit_price']));
  const amount = readMoney(pickKey(row, ['amount', 'total', 'line_total', 'value']));
  if (rate == null && amount != null) {
    if (qty != null && qty !== 0) rate = amount / qty;
    else { rate = amount; qty = null; unit = 'lump sum'; }
  }
  if (qty == null && unit !== 'lump sum' && rate != null && !UNITS.includes(unit)) unit = 'lump sum';
  if (!desc && rate == null) return null;
  return { id: uid(), desc, qty, unit: unit || 'lump sum', rate };
}

/** Best-effort read of one plain text line: "desc — 2,400 m² @ $38.50",
    or "desc ... $12,600" as a lump sum. */
function readTextItem(line) {
  const t = String(line || '').trim().replace(/\s+/g, ' ');
  if (!t || /^(sub\s*total|total|gst|balance|quote|pricing|item\b)/i.test(t)) return null;
  let m = t.match(/^(.+?)[\s—–:|-]+([\d,]+(?:\.\d+)?)\s*(m²|m2|sq\s*m|m³|m3|m\b|t\b|tonnes?|hrs?\b|hours?\b|days?\b|each|ea\b)\s*[@x×]\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (m) return { id: uid(), desc: m[1].replace(/[\s—–:|-]+$/, '').trim(), qty: readNum(m[2]), unit: normUnit(m[3]), rate: readMoney(m[4]) };
  m = t.match(/^(.+?)[\s—–:|-]+\$\s*([\d,]+(?:\.\d+)?)\s*(?:\+\s*gst)?$/i);
  if (m) return { id: uid(), desc: m[1].replace(/[\s—–:|-]+$/, '').trim(), qty: null, unit: 'lump sum', rate: readMoney(m[2]) };
  return null;
}

/** The whole pasted text as a draft quote, or a thrown reason why not. */
function parseImport(text) {
  const obj = extractJson(text);
  const data = {
    status: 'draft', items: [], allowances: {}, created_by: whoami(),
    valid_days: DEFAULT_VALID_DAYS
  };
  const newLines = [];

  if (obj) {
    data.name = String(pickKey(obj, ['name', 'job', 'title', 'project', 'quote_name']) || '').trim();
    data.client = String(pickKey(obj, ['client', 'customer', 'company', 'to']) || '').trim();
    data.contact = String(pickKey(obj, ['contact', 'attention', 'attn']) || '').trim();
    data.site = String(pickKey(obj, ['site', 'location', 'address']) || '').trim();
    data.reference = String(pickKey(obj, ['reference', 'ref', 'rfq', 'their_reference', 'your_reference']) || '').trim();
    data.description = String(pickKey(obj, ['description', 'scope', 'scope_of_work']) || '').trim();
    data.client_note = String(pickKey(obj, ['client_note', 'note', 'notes']) || '').trim();
    data.basis = String(pickKey(obj, ['pricing_basis', 'basis', 'priced_on', 'assumptions', 'pricing_notes', 'internal_notes']) || '').trim();
    const wt = String(pickKey(obj, ['work_type', 'type', 'type_of_work', 'work']) || '').trim();
    if (wt) data.work_type = matchType(wt);
    const vd = readNum(pickKey(obj, ['valid_days', 'validity', 'valid_for']));
    if (vd != null && vd > 0) data.valid_days = Math.round(vd);
    const sd = String(pickKey(obj, ['start_date', 'likely_start', 'expected_start', 'starts', 'start']) || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) data.start_date = sd;

    const rows = pickKey(obj, ['items', 'lines', 'line_items', 'pricing', 'prices']);
    (Array.isArray(rows) ? rows : []).forEach(r => {
      const it = readImportItem(r);
      if (it) data.items.push(it);
    });

    const alw = pickKey(obj, ['allowances', 'costs', 'cost_allowances', 'internal_costs', 'expected_costs', 'allowance']);
    if (alw && typeof alw === 'object' && !Array.isArray(alw)) {
      Object.keys(alw).forEach(raw => {
        const val = readMoney(alw[raw]);
        if (val == null) return;
        /* Land on an existing line whether the chat said "tm", "Traffic
           management" or "subbies" — by key or by label — before a new
           line is invented for it. */
        const hit = resolveLineKey(raw);
        const key = hit || slug(raw);
        if (!hit) newLines.push(String(raw).trim());
        data.allowances[key] = val;
      });
    }
  } else {
    /* No JSON — read the quote as text, line by line. */
    let fields = 0;
    const lines = text.split(/\n+/);
    lines.forEach(line => {
      const t = line.trim();
      let m;
      if ((m = t.match(/^(?:client|customer|for)\s*[:—–-]\s*(.+)$/i))) { if (!data.client) { data.client = m[1].trim(); fields++; } return; }
      if ((m = t.match(/^(?:site|location|address)\s*[:—–-]\s*(.+)$/i))) { if (!data.site) { data.site = m[1].trim(); fields++; } return; }
      if ((m = t.match(/^(?:contact|attention|attn)\s*[:—–-]\s*(.+)$/i))) { if (!data.contact) { data.contact = m[1].trim(); fields++; } return; }
      if ((m = t.match(/^(?:reference|ref|rfq|your reference)\s*[:—–-]\s*(.+)$/i))) { if (!data.reference) { data.reference = m[1].trim(); fields++; } return; }
      if ((m = t.match(/^(?:job|project|quote(?: for)?)\s*[:—–-]\s*(.+)$/i))) { if (!data.name) { data.name = m[1].trim(); fields++; } return; }
      const it = readTextItem(t);
      if (it) data.items.push(it);
    });
    /* A paste that reads as neither prices nor labelled fields isn't a
       quote — say so, rather than filing a junk draft. */
    if (!data.items.length && !fields)
      throw new Error('Nothing readable found — no priced lines and no Client / Site / Job fields.');
    if (!data.name) {
      const first = lines.map(l => l.trim()).find(l => l && !/[:@$]/.test(l));
      if (first) data.name = first.slice(0, 90);
    }
  }

  if (!data.name && !data.items.length)
    throw new Error('Nothing readable found — no job name and no priced lines.');
  if (!data.name) data.name = 'Pasted quote';
  return { data, newLines };
}

function renderPaste(v) {
  setNav({ back: true, backLabel: 'Quotes', title: 'Paste a quote' });
  v.innerHTML = `
    <h1 class="large-title">Paste a quote</h1>
    <p class="page-sub">Price the job in your Claude pricing chat as usual, ask it for the
      import block, and paste the answer here. The client, scope, prices and internal
      allowances land in a draft for you to check — nothing retyped.</p>

    <div class="form">
      <label class="field"><span>The quote, as the chat gave it</span>
        <textarea id="pasteBox" style="min-height:180px" placeholder='Paste the JSON import block — or the whole quote as text, and the app will read what it can.'></textarea></label>
    </div>
    <button class="btn primary" id="readIt">${icon('doc')}Read it into a draft</button>

    <div class="card pad small muted">
      <b>First time?</b> Tap below, paste the copied ask at the end of your pricing chat,
      and it will answer with a block this screen reads perfectly. The ask travels with
      the quote you priced, so nothing needs re-explaining.
    </div>
    <button class="btn" id="copyAsk">${icon('copy')}Copy the ask for your pricing chat</button>`;

  $('#readIt', v).onclick = () => {
    const text = $('#pasteBox', v).value;
    if (!text.trim()) return toast('Paste the quote first');
    let parsed;
    try { parsed = parseImport(text); }
    catch (e) { return toast(e.message || 'That could not be read'); }
    parsed.newLines.forEach(addCostLine);
    const q = Store.insert('quotes', parsed.data);
    const m = quoteMoney(q);
    toast(`${plural((q.items || []).length, 'line')} read${m.total != null ? ' — ' + fmtMoney(m.total) : ''}. Check it over.`);
    go('#/quote/' + q.id);
  };

  $('#copyAsk', v).onclick = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      toast('Copied — paste it at the end of your pricing chat');
    } catch (e) {
      prompt('Copy this, and paste it at the end of your pricing chat:', IMPORT_PROMPT);
    }
  };
}

/* ================================================================
   Screens — the clients. Who the work comes from, what each one is
   worth, how often they say yes, the margin their work carries, and
   how long they take to answer. Every figure is worked out from the
   quotes; nothing here is entered.
   ================================================================ */
function clientStats() {
  const map = {};
  DB.quotes.forEach(q => {
    const name = (q.client || '').trim() || 'No client named';
    const k = name.toLowerCase();
    const c = map[k] || (map[k] = {
      name, n: 0, draft: 0,
      sent: 0, sentVal: 0,
      won: 0, wonVal: 0, wonMargin: 0, wonMarginBase: 0,
      lost: 0, lostVal: 0,
      answerDays: [], last: ''
    });
    const m = quoteMoney(q);
    c.n++;
    if (q.status === 'draft') c.draft++;
    if (q.status === 'sent') { c.sent++; if (m.total != null) c.sentVal += m.total; }
    if (q.status === 'accepted') {
      c.won++;
      if (m.total != null) c.wonVal += m.total;
      if (m.total != null && m.margin != null) { c.wonMargin += m.margin; c.wonMarginBase += m.total; }
    }
    if (q.status === 'declined') { c.lost++; if (m.total != null) c.lostVal += m.total; }
    if ((q.status === 'accepted' || q.status === 'declined') && q.sent_on && q.decided_on) {
      const d = daysBetween(q.sent_on, q.decided_on);
      if (d != null && d >= 0) c.answerDays.push(d);
    }
    const t = q.updated_at || q.created_at || '';
    if (t > c.last) c.last = t;
  });
  return Object.values(map).map(c => Object.assign(c, {
    winRate: (c.won + c.lost) ? c.won / (c.won + c.lost) * 100 : null,
    /* Margin weighted by value, not averaged by quote — one big thin job
       should read as what it is. Only quotes with allowances count. */
    marginPct: c.wonMarginBase ? c.wonMargin / c.wonMarginBase * 100 : null,
    answerAvg: c.answerDays.length
      ? Math.round(c.answerDays.reduce((a, b) => a + b, 0) / c.answerDays.length) : null
  })).sort((a, b) => (b.wonVal + b.sentVal + b.lostVal) - (a.wonVal + a.sentVal + a.lostVal));
}

function quotesForClient(name) {
  const want = String(name || '').trim().toLowerCase();
  return DB.quotes.filter(q =>
    ((q.client || '').trim() || 'No client named').toLowerCase() === want);
}

function renderClients(v) {
  setNav({ back: true, backLabel: 'Quotes', title: 'Clients' });
  const clients = clientStats();
  v.innerHTML = `
    <h1 class="large-title">Clients</h1>
    <p class="page-sub">Who the work comes from, and what it makes. Biggest book first.</p>
    ${clients.length ? `<div class="card">${clients.map(c => `
      <a class="row-item" href="#/client/${encodeURIComponent(c.name)}">
        <div class="r-main">
          <div class="r-title">${esc(c.name)}</div>
          <div class="r-sub">${plural(c.n, 'quote')}${c.won ? ` · won ${fmtCompact(c.wonVal)}` : ''}${c.sent ? ` · waiting ${fmtCompact(c.sentVal)}` : ''}</div>
          ${c.winRate != null || c.marginPct != null ? `
          <div class="r-flag ${c.marginPct != null ? (c.marginPct >= 0 ? 'green' : 'red') : 'blue'}">${[
            c.winRate != null ? `wins ${Math.round(c.winRate)}%` : null,
            c.marginPct != null ? `margin ${fmtPct(c.marginPct)}` : null,
            c.answerAvg != null ? `answers in ~${plural(c.answerAvg, 'day')}` : null
          ].filter(Boolean).join(' · ')}</div>` : ''}
        </div>
        ${CHEV}
      </a>`).join('')}</div>`
      : `<div class="card"><div class="empty"><b>No clients yet</b>Clients appear here as quotes name them.</div></div>`}`;
}

function renderClient(v, args) {
  const name = decodeURIComponent(args[0] || '');
  const list = quotesForClient(name);
  if (!list.length) return notFound(v, 'Client');
  const c = clientStats().find(x => x.name.toLowerCase() === name.trim().toLowerCase());

  setNav({ back: '#/clients', backLabel: 'Clients', title: c.name });

  const coming = list
    .filter(q => q.start_date && q.status !== 'declined' && q.start_date >= today())
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const rows = list.slice().sort((a, b) => statusRank(a) - statusRank(b) ||
    String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));

  v.innerHTML = `
    <h1 class="large-title">${esc(c.name)}</h1>
    <p class="page-sub">${plural(c.n, 'quote')} on the book${c.answerAvg != null ? ` · answers in about ${plural(c.answerAvg, 'day')}` : ''}</p>

    <div class="tiles">
      <div class="tile">
        <div class="t-label">Won</div>
        <div class="t-value ${c.won ? 'pos' : ''}">${c.won ? fmtCompact(c.wonVal) : '—'}</div>
        <div class="t-sub">${c.won ? plural(c.won, 'quote') : 'nothing yet'}</div>
      </div>
      <div class="tile">
        <div class="t-label">Waiting now</div>
        <div class="t-value">${c.sent ? fmtCompact(c.sentVal) : '—'}</div>
        <div class="t-sub">${c.sent ? plural(c.sent, 'quote') + ' unanswered' : 'nothing out'}</div>
      </div>
      <div class="tile">
        <div class="t-label">Win rate</div>
        <div class="t-value">${c.winRate == null ? '—' : Math.round(c.winRate) + '%'}</div>
        <div class="t-sub">${(c.won + c.lost) ? `${c.won} of ${plural(c.won + c.lost, 'decided quote')}` : 'nothing decided'}</div>
      </div>
      <div class="tile">
        <div class="t-label">Margin on won work</div>
        <div class="t-value ${c.marginPct == null ? '' : c.marginPct >= 0 ? 'pos' : 'neg'}">${c.marginPct == null ? '—' : fmtPct(c.marginPct)}</div>
        <div class="t-sub">${c.marginPct != null ? fmtCompact(c.wonMargin) + ' priced in'
          : c.won ? 'needs allowances entered' : 'no won work yet'}</div>
      </div>
    </div>

    ${c.lost ? `<p class="muted small" style="margin:2px 4px 14px">Lost ${plural(c.lost, 'quote')} worth ${fmtMoney(c.lostVal)} — the notes on each say why.</p>` : ''}

    ${coming.length ? `
    <h2 class="sect">Coming up</h2>
    <div class="card">${coming.map(q => `
      <a class="row-item" href="#/quote/${q.id}">
        <div class="r-main">
          <div class="r-title">${esc(q.name)}</div>
          <div class="r-flag ${q.status === 'accepted' ? 'green' : 'blue'}">Starts ${fmtShort(q.start_date)} · in ${plural(daysBetween(today(), q.start_date), 'day')}${q.status !== 'accepted' ? ' — if it lands' : ''}</div>
        </div>
        <div class="r-side"><span class="pill ${statusTone(q.status)}">${statusLabel(q.status)}</span></div>
        ${CHEV}
      </a>`).join('')}</div>` : ''}

    <h2 class="sect">Their quotes</h2>
    <div class="card">${rows.map(quoteRow).join('')}</div>`;
}

/* ================================================================
   Handing a won quote to RCK Costing.

   Both apps live on the same phone under the same address, so they
   share the same browser storage. A won quote becomes a Costing job
   directly: the quote total lands as the agreed price, the
   allowances land as the expected costs, line for line. Costing
   picks it up the next time it opens on this phone.
   ================================================================ */
const COSTING_KEY = 'rckc.data';

function readCostingDb() {
  try {
    const raw = JSON.parse(localStorage.getItem(COSTING_KEY) || 'null');
    if (raw && Array.isArray(raw.jobs)) return raw;
  } catch (e) {}
  return { jobs: [], variations: [], comments: [], lines: [], seq: 0 };
}
function costingHasJob(id) {
  return readCostingDb().jobs.some(j => j.id === id);
}

function sendToCosting(q) {
  const db = readCostingDb();
  if (q.costing_job_id && db.jobs.some(j => j.id === q.costing_job_id)) {
    toast('Already in Costing');
    return;
  }
  const m = quoteMoney(q);
  const highest = db.jobs.reduce((n, j) => Math.max(n, Number(j.number) || 0), 0);
  db.seq = Math.max(Number(db.seq) || 0, highest) + 1;

  const expected = {};
  Object.keys(q.allowances || {}).forEach(k => {
    if (hasMoney(q.allowances[k])) expected[k] = Number(q.allowances[k]);
  });

  /* Any cost line named here that Costing doesn't know yet goes with
     the job, so its figure has a label on the other side. */
  const builtin = new Set(COST_LINES.map(l => l.key));
  const theirs = new Set((db.lines || []).map(l => l && l.key).filter(Boolean));
  Object.keys(expected).forEach(k => {
    if (!builtin.has(k) && !theirs.has(k)) {
      db.lines = db.lines || [];
      db.lines.push({ key: k, label: costLineLabel(k) });
    }
  });

  const job = {
    id: uid(),
    number: db.seq,
    name: q.name,
    client: q.client || '',
    site: q.site || '',
    work_type: typeOf(q),
    reference: q.po_ref || q.reference || '',
    description: q.description || '',
    status: 'quoted',
    start_date: q.start_date || null,
    end_date: null,
    contract_value: m.total,
    expected_costs: expected,
    actual_costs: {},
    created_by: whoami(),
    created_at: new Date().toISOString()
  };
  db.jobs.push(job);
  /* What it was priced on travels with the job, as a Costing comment —
     so when the actuals land, the assumptions are right there beside them. */
  if (q.basis) {
    db.comments = db.comments || [];
    db.comments.push({
      id: uid(), job_id: job.id,
      body: 'Priced on (from ' + quoteNo(q) + '): ' + q.basis,
      author: whoami(), at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
  }
  try {
    localStorage.setItem(COSTING_KEY, JSON.stringify(db));
  } catch (e) {
    return toast('Could not write to Costing — the phone\'s storage may be full');
  }
  Store.patch('quotes', q.id, { costing_job_id: job.id });
  toast(`Job JC-${String(job.number).padStart(4, '0')} created in RCK Costing`);
  render();
}

/* ================================================================
   Screen — settings.
   ================================================================ */
function renderSettings(v) {
  setNav({ back: true, backLabel: 'Quotes', title: 'Settings' });
  const age = Backup.age();
  const kb = Math.round(storageUsed() / 1024);

  v.innerHTML = `
    <h1 class="large-title">Settings</h1>
    <p class="page-sub">&nbsp;</p>

    <div class="form">
      <label class="field"><span>Your name — it signs your notes and the printed quotes</span>
        <input type="text" id="uname" value="${esc(S.name || '')}"></label>
    </div>

    <h2 class="sect">Backup</h2>
    <div class="card">
      <div class="row-plain small muted">This phone holds the only copy of every quote.
        ${age == null ? '<b style="color:var(--neg)">No backup has ever been taken.</b>'
          : `The last backup was ${age === 0 ? 'today' : plural(age, 'day') + ' ago'}.`}
        Email one to yourself once a month and you can never lose more than a month.</div>
      <button class="row-item" id="bkShare"><div class="r-main" style="color:var(--accent)">Send a backup…</div></button>
      <button class="row-item" id="bkSave"><div class="r-main" style="color:var(--accent)">Save the file</div></button>
      <button class="row-item" id="bkRestore"><div class="r-main" style="color:var(--accent)">Restore from a backup…</div></button>
    </div>

    <h2 class="sect">For the spreadsheet</h2>
    <div class="card">
      <button class="row-item" id="csvQuotes"><div class="r-main" style="color:var(--accent)">CSV of every quote</div></button>
      <button class="row-item" id="csvItems"><div class="r-main" style="color:var(--accent)">CSV of every line item</div></button>
    </div>

    <h2 class="sect">About</h2>
    <div class="card pad small muted">
      Quotes live in this phone's browser storage (${kb ? kb + ' KB used' : 'empty'}) and are sent
      nowhere. The printed quote is the only thing that leaves.
      A quote accepted here can be handed to <b>RCK Costing</b> as a job — that works
      when both apps are on the same phone, because they share the phone's storage.
      ${updateReady ? '<br><br><b>A new version is ready.</b> Close the app fully and reopen it.' : ''}
    </div>
    <div class="aboutver">RCK Quotes ${VERSION}</div>`;

  $('#uname', v).onchange = () => {
    Settings.write({ name: $('#uname', v).value.trim() });
    toast('Saved');
  };
  $('#bkShare', v).onclick = async () => {
    try {
      if (!(await Backup.share())) Backup.download();
    } catch (e) { /* share sheet dismissed */ }
    render();
  };
  $('#bkSave', v).onclick = () => { Backup.download(); render(); };
  $('#bkRestore', v).onclick = () => $('#importFile').click();
  $('#csvQuotes', v).onclick = exportQuotesCsv;
  $('#csvItems', v).onclick = exportItemsCsv;
}

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (DB.quotes.length &&
      !confirm(`Restoring replaces the ${plural(DB.quotes.length, 'quote')} on this phone with the file's. Continue?`)) return;
  try {
    const n = Backup.restore(await file.text());
    toast(`Restored ${plural(n, 'quote')}`);
    render();
  } catch (err) {
    toast(err.message || 'That file could not be read');
  }
});

/* ---------------------------------------------------------------- CSV */
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv(filename, rows) {
  const text = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  saveAs(URL.createObjectURL(blob), filename);
}

function exportQuotesCsv() {
  if (!DB.quotes.length) return toast('No quotes yet');
  const rows = [['Number', 'Job', 'Client', 'Site', 'Type', 'Status', 'Sent on', 'Valid until',
                 'Decided on', 'Likely start', 'Total excl GST', 'Allowed cost', 'Margin', 'Margin %',
                 'Their ref', 'Client order', 'Priced on', 'Why lost']];
  DB.quotes.slice().sort((a, b) => (a.number || 0) - (b.number || 0)).forEach(q => {
    const m = quoteMoney(q);
    rows.push([quoteNo(q), q.name, q.client, q.site, typeLabel(typeOf(q)), statusLabel(q.status),
               q.sent_on || '', validUntil(q) || '', q.decided_on || '', q.start_date || '',
               m.total == null ? '' : m.total, m.allow == null ? '' : m.allow,
               m.margin == null ? '' : m.margin,
               m.marginPct == null ? '' : m.marginPct.toFixed(1),
               q.reference || '', q.po_ref || '', q.basis || '', q.outcome_note || '']);
  });
  downloadCsv(`rck-quotes-${today()}.csv`, rows);
}

function exportItemsCsv() {
  const rows = [['Quote', 'Job', 'Client', 'Status', 'Line', 'Qty', 'Unit', 'Rate', 'Amount excl GST']];
  DB.quotes.slice().sort((a, b) => (a.number || 0) - (b.number || 0)).forEach(q => {
    (q.items || []).forEach(it => {
      if (!(it.desc || '').trim() && itemAmount(it) == null) return;
      const a = itemAmount(it);
      rows.push([quoteNo(q), q.name, q.client, statusLabel(q.status), it.desc || '',
                 hasMoney(it.qty) ? it.qty : '', it.unit || '',
                 hasMoney(it.rate) ? it.rate : '', a == null ? '' : a]);
    });
  });
  if (rows.length === 1) return toast('No line items yet');
  downloadCsv(`rck-quote-items-${today()}.csv`, rows);
}

/* ================================================================
   The printed quote — the one thing that leaves the phone. RCK
   letterhead, the scope, the prices, GST said plainly, the terms,
   and a line for the client to sign it back. The allowances and the
   margin are internal and are nowhere on this page.
   ================================================================ */
const BRAND = Object.assign({
  name:  'RCK NZ',
  trade: 'Asphalt & Civil Contracting',
  email: 'office@rcknz.co.nz',
  phone: ''
}, SITE.brand || {});

const MARK = `
  <svg class="mark" viewBox="0 0 512 512" aria-hidden="true">
    <rect width="512" height="512" rx="112" fill="#1b1e22"/>
    <rect x="118" y="150" width="276" height="64" rx="26" fill="#4c525a"/>
    <rect x="118" y="254" width="200" height="64" rx="26" fill="#4c525a"/>
    <rect x="118" y="358" width="140" height="64" rx="26" fill="#c8971b"/>
  </svg>`;

function docHead(kind, title, subtitle, dateLine) {
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
          <div class="when">${dateLine}</div>
        </div>
      </div>
      <h1>${esc(title)}</h1>
      ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
      <div class="rule"></div>
    </div>`;
}

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

function factGrid(rows) {
  const live = rows.filter(Boolean);
  const out = [];
  for (let i = 0; i < live.length; i += 2) {
    const a = live[i], b = live[i + 1];
    out.push(`<tr><td>${esc(a[0])}</td><td>${a[1]}</td>` +
             (b ? `<td>${esc(b[0])}</td><td>${b[1]}</td>` : '<td></td><td></td>') + `</tr>`);
  }
  return `<table class="kv two">${out.join('')}</table>`;
}

function printQuote(q) {
  const m = quoteMoney(q);
  const sent = q.sent_on || today();
  const until = validUntil(q) ||
    addDays(sent, q.valid_days == null ? DEFAULT_VALID_DAYS : q.valid_days);
  const items = (q.items || []).filter(it => (it.desc || '').trim() || itemAmount(it) != null);
  const anyQty = items.some(it => hasMoney(it.qty) && it.unit !== 'lump sum');
  const terms = Array.isArray(SITE.terms) ? SITE.terms : [];

  const html = `
    ${docHead('Quotation', q.name,
      `${quoteNo(q)}${q.client ? ' · for ' + q.client : ''}`,
      `${fmtDate(sent)}<br>Prepared by ${esc(whoami())}`)}

    ${factGrid([
      ['Quote number', `<strong>${quoteNo(q)}</strong>`],
      ['Date', fmtDate(sent)],
      q.client ? ['Client', esc(q.client)] : null,
      q.contact ? ['Attention', esc(q.contact)] : null,
      q.site ? ['Site', esc(q.site)] : null,
      ['Type of work', esc(typeLabel(typeOf(q)))],
      q.reference ? ['Your reference', esc(q.reference)] : null,
      until ? ['Valid until', fmtDate(until)] : null
    ])}
    ${q.description ? `<h2>Scope of work</h2><p class="note">${esc(q.description)}</p>` : ''}

    <h2>Pricing</h2>
    <table>
      <thead><tr><th>Item</th>${anyQty ? '<th class="r">Qty</th><th>Unit</th><th class="r">Rate</th>' : ''}<th class="r">Amount</th></tr></thead>
      <tbody>
        ${items.map(it => {
          const a = itemAmount(it);
          const isQty = hasMoney(it.qty) && it.unit !== 'lump sum';
          return `<tr>
            <td>${esc(it.desc || '—')}</td>
            ${anyQty ? `<td class="r">${isQty ? fmtQty(it.qty) : ''}</td>
            <td>${isQty ? esc(it.unit || '') : 'Sum'}</td>
            <td class="r">${isQty ? fmtMoney(it.rate, true) : ''}</td>` : ''}
            <td class="r">${a == null ? '—' : fmtMoney(a, true)}</td>
          </tr>`;
        }).join('')}
        <tr class="tot"><td${anyQty ? ' colspan="4"' : ''}>Subtotal, excl GST</td>
          <td class="r">${fmtMoney(m.total, true)}</td></tr>
      </tbody>
    </table>

    <div class="band">
      <div><div class="l">Subtotal</div><div class="n">${fmtMoney(m.total, true)}</div></div>
      <div><div class="l">GST ${Math.round(GST * 100)}%</div><div class="n">${fmtMoney(m.gst, true)}</div></div>
      <div class="grand"><div class="l">Total incl GST</div><div class="n">${fmtMoney(m.incl, true)}</div></div>
    </div>

    ${q.client_note ? `<p class="note">${esc(q.client_note)}</p>` : ''}

    ${terms.length ? `<h2>Terms</h2><ul class="terms">${terms.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}

    <h2>Acceptance</h2>
    <p class="lede">To accept this quotation, sign below and return a copy, or reply with your order number.</p>
    <div class="accept">
      <div><div class="line"></div><div class="cap">Name</div></div>
      <div><div class="line"></div><div class="cap">Signature</div></div>
      <div><div class="line"></div><div class="cap">Date</div></div>
      <div><div class="line"></div><div class="cap">Order number</div></div>
    </div>`;

  printDoc(html, `${quoteNo(q)} · ${fmtDate(sent)}`);
}

/** The internal side of the same quote, on one page: the prices, the
    allowances against them, the margin, and what it was priced on.
    This is the sheet for the office and the director — it says INTERNAL
    on it because everything the client's copy hides is here. */
function printInternalSheet(q) {
  const m = quoteMoney(q);
  const items = (q.items || []).filter(it => (it.desc || '').trim() || itemAmount(it) != null);
  const allowLines = allCostLines().filter(l => hasMoney((q.allowances || {})[l.key]));
  const notes = commentsFor(q.id);
  const vu = validUntil(q);
  const tone = m.margin == null ? '' : m.margin >= 0 ? 'pos' : 'neg';

  const html = `
    ${docHead('Internal costing', q.name,
      `${quoteNo(q)}${q.client ? ' · ' + q.client : ''} · NOT FOR THE CLIENT`,
      `${fmtDate(new Date().toISOString())}<br>Prepared by ${esc(whoami())}`)}

    ${factGrid([
      ['Quote number', `<strong>${quoteNo(q)}</strong>`],
      ['Status', esc(statusLabel(q.status)) + (isExpired(q) ? ' — expired' : '')],
      q.client ? ['Client', esc(q.client)] : null,
      q.site ? ['Site', esc(q.site)] : null,
      ['Type of work', esc(typeLabel(typeOf(q)))],
      q.start_date ? ['Likely start', fmtDate(q.start_date)] : null,
      q.sent_on ? ['Sent', fmtDate(q.sent_on)] : null,
      vu ? ['Valid until', fmtDate(vu)] : null,
      q.decided_on ? [q.status === 'accepted' ? 'Accepted' : 'Declined', fmtDate(q.decided_on)] : null
    ])}

    <h2>The price to the client</h2>
    <table>
      <thead><tr><th>Item</th><th class="r">Amount</th></tr></thead>
      <tbody>
        ${items.map(it => {
          const a = itemAmount(it);
          return `<tr><td>${esc(it.desc || '—')}${hasMoney(it.qty) && it.unit !== 'lump sum'
            ? `<div class="sub">${fmtQty(it.qty)} ${esc(it.unit || '')} @ ${fmtMoney(it.rate, true)}</div>` : ''}</td>
            <td class="r">${a == null ? '—' : fmtMoney(a, true)}</td></tr>`;
        }).join('')}
        <tr class="tot"><td>Quoted, excl GST</td><td class="r">${fmtMoney(m.total, true)}</td></tr>
      </tbody>
    </table>

    <h2>Allowed inside it</h2>
    ${allowLines.length ? `
    <table>
      <thead><tr><th>Cost line</th><th class="r">Allowance</th></tr></thead>
      <tbody>
        ${allowLines.map(l => `<tr><td>${esc(l.label)}</td>
          <td class="r">${fmtMoney(q.allowances[l.key], true)}</td></tr>`).join('')}
        <tr class="tot"><td>Allowed cost</td><td class="r">${fmtMoney(m.allow, true)}</td></tr>
      </tbody>
    </table>` : '<p class="lede">No allowances have been entered for this quote.</p>'}

    <div class="band">
      <div><div class="l">Quoted</div><div class="n">${fmtMoney(m.total, true)}</div></div>
      <div><div class="l">Allowed cost</div><div class="n">${fmtMoney(m.allow, true)}</div></div>
      <div><div class="l">Margin</div><div class="n ${tone}">${fmtSigned(m.margin, true)}</div></div>
      <div><div class="l">Margin %</div><div class="n ${tone}">${fmtPct(m.marginPct)}</div></div>
    </div>

    ${q.basis ? `<h2>What it was priced on</h2><p class="note">${esc(q.basis)}</p>` : ''}

    ${notes.length ? `
    <h2>Notes</h2>
    ${notes.map(n => `<div class="entry"><div class="e-body">
      <div class="e-note">${esc(n.text)}</div>
      <div class="e-who">${esc(n.author || 'Unknown')} · ${fmtDate(n.created_at)}</div>
    </div></div>`).join('')}` : ''}

    <p class="lede">All figures exclude GST. Internal — the client's quote shows none of the
      allowances, the margin or the pricing basis on this sheet.</p>`;

  printDoc(html, `${quoteNo(q)} · Internal`);
}

/* ================================================================
   Start.
   ================================================================ */
S = Settings.read();
loadData();
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) updateReady = true;
      });
    });
  }).catch(() => {});
}
