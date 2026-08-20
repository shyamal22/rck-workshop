/* =====================================================================
   RCK Dispatch — jobs, site paperwork and the daily job diary
   Plain JavaScript, no build step, no frameworks.

   The office plans a job and hangs the paperwork on it. The supervisor
   opens it on site, reads the paperwork, and keeps the diary as the day
   happens. When the last day is done the supervisor closes the job and
   the whole thing prints as one report.
   ===================================================================== */
'use strict';

const VERSION = '1.0.0';

/* --------------------------------------------------------- job states */
/* Three, and only three. A job is either coming up, happening, or done. */
const JOB_STATUS = [
  { key: 'planned',   label: 'Planned',   short: 'Planned',   tone: 'planned',
    blurb: 'Booked in, not started' },
  { key: 'ongoing',   label: 'On site',   short: 'On site',   tone: 'ongoing',
    blurb: 'Crew is working it now' },
  { key: 'completed', label: 'Completed', short: 'Done',      tone: 'completed',
    blurb: 'Finished and signed off' }
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

/* ------------------------------------------------------------- roles */
/* Two things a device can do beyond reading a job and keeping its diary:
   plan jobs, and see the documents marked office-only. Both come together,
   so one flag covers them, and adding a role is one line here rather than
   a hunt through the screens. */
const ROLES = [
  { key: 'supervisor', label: 'Supervisor', blurb: 'On site, keeps the job diary',
    hint: 'Reads the paperwork, keeps the diary, closes the job when it is finished.',
    officeAccess: false },
  { key: 'office',     label: 'Office',     blurb: 'Plans jobs and loads the paperwork',
    hint: 'All of that, plus creating and editing jobs and the office-only documents.',
    officeAccess: true },
  { key: 'director',   label: 'Director',   blurb: 'Everything, plus the overview across all jobs',
    hint: 'The whole app, plus what no single job shows: value, cost and margin across a period, and the power to archive.',
    officeAccess: true, directorAccess: true }
];
function roleDef(key) { return ROLES.find(r => r.key === key) || ROLES[0]; }
function roleLabel(key) { return roleDef(key).label; }

/* ---------------------------------------------------------- documents */
const DOC_KINDS = [
  { key: 'pmp',      label: 'PMP' },
  { key: 'scope',    label: 'Scope' },
  { key: 'jobcard',  label: 'Job card' },
  { key: 'tmp',      label: 'Traffic management plan' },
  { key: 'swms',     label: 'SWMS / safety' },
  { key: 'drawing',  label: 'Drawing / plan' },
  { key: 'permit',   label: 'Permit / consent' },
  { key: 'schedule', label: 'Programme / schedule' },
  { key: 'quote',    label: 'Quote / pricing' },
  { key: 'photo',    label: 'Site photo' },
  { key: 'other',    label: 'Other' }
];

/* Who a document is put there for. Office sees everything it uploads;
   a site phone never lists the office-only ones. */
const AUDIENCES = [
  { key: 'all',        label: 'Everyone',   hint: 'Office and the crew on site' },
  { key: 'supervisor', label: 'Site crew',  hint: 'What the supervisor needs on the job' },
  { key: 'office',     label: 'Office only', hint: 'Never listed on a site phone' }
];

/* --------------------------------------------------------- job diary */
/* The things that happen on a day, in the order a supervisor would say
   them. `mark` gives the entry a coloured dot on the timeline, because it
   is a moment that matters rather than a passing note. */
const ENTRY_TYPES = [
  { key: 'onsite',        label: 'On site',            tone: 'green',  mark: true,  quick: true },
  { key: 'prestart',      label: 'Prestart',           tone: 'green',  mark: true,  quick: true },
  { key: 'tm_setup',      label: 'Traffic management set up', tone: 'blue' },
  { key: 'milling_start', label: 'Milling started',    tone: 'green',  mark: true,  quick: true },
  { key: 'milling_stop',  label: 'Milling stopped',    tone: 'blue',   mark: true },
  { key: 'paving_start',  label: 'Paving started',     tone: 'green',  mark: true,  quick: true },
  { key: 'paving_stop',   label: 'Paving stopped',     tone: 'blue',   mark: true },
  { key: 'delivery',      label: 'Delivery',           tone: 'blue' },
  { key: 'break',         label: 'Break',              tone: 'slate' },
  { key: 'issue',         label: 'Issue',              tone: 'red',    mark: true,  quick: true },
  { key: 'delay',         label: 'Delay',              tone: 'yellow', mark: true },
  { key: 'weather',       label: 'Weather',            tone: 'yellow' },
  { key: 'visitor',       label: 'Visitor',            tone: 'blue' },
  { key: 'tm_down',       label: 'Traffic management removed', tone: 'blue' },
  { key: 'note',          label: 'Note',               tone: 'slate' },
  { key: 'photos',        label: 'Photos',             tone: 'slate' },
  { key: 'offsite',       label: 'Off site',           tone: 'slate',  mark: true,  quick: true }
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
/** The other way round: "chip_seal" → "Chip seal". */
function humanise(key) {
  return String(key || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** A key from free text: "Chip seal" → "chip_seal". Used for added types. */
function slug(text) {
  return String(text || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'other';
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDayDate(v) {
  if (!v) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v);
  if (isNaN(d)) return '—';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return `${fmtDate(v)}, ${fmtTime(v)}`;
}
/** 24-hour, because that is how a site diary is written. */
function fmtTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** A local date + "HH:MM" back into a real instant, without UTC surprises. */
function stamp(dateStr, timeStr) {
  const [y, m, d] = (dateStr || today()).split('-').map(Number);
  const [hh, mm] = (timeStr || nowTime()).split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0).toISOString();
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
  const d1 = new Date(String(a).slice(0, 10) + 'T00:00:00');
  const d2 = new Date(String(b).slice(0, 10) + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
}
/** Human "when" text for a planned start date. */
function startText(dateStr) {
  const n = daysFromToday(dateStr);
  if (n == null) return { text: 'no date set', late: false };
  if (n === 0) return { text: 'today', late: false };
  if (n === 1) return { text: 'tomorrow', late: false };
  if (n > 1)   return { text: `in ${n} days`, late: false };
  if (n === -1) return { text: 'was due yesterday', late: true };
  return { text: `${-n} days overdue`, late: true };
}
/** Dollars, the way they read on a New Zealand invoice. Rounded to whole
    dollars on a board where the shape matters more than the cents. */
function fmtMoney(v, cents) {
  if (v == null || v === '' || !isFinite(Number(v))) return '—';
  const n = Number(v);
  const dp = cents ? 2 : 0;
  try {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency', currency: 'NZD',
      minimumFractionDigits: dp, maximumFractionDigits: dp
    }).format(n);
  } catch (e) {
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(dp).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}
function hasMoney(v) { return v != null && v !== '' && isFinite(Number(v)); }

/** What a job made, or null when we don't know both halves. Guessing a
    margin from half the numbers is worse than showing nothing. */
function jobMargin(p) {
  if (!hasMoney(p.contract_value) || !hasMoney(p.actual_cost)) return null;
  return Number(p.contract_value) - Number(p.actual_cost);
}
function marginPct(value, margin) {
  const v = Number(value);
  if (!isFinite(v) || v === 0 || margin == null) return null;
  return (margin / v) * 100;
}

function fileSizeText(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}
/** The short tag shown on a document's tile: PDF, XLSX, JPG … */
function fileTag(d) {
  const ext = (d.file_name || '').split('.').pop();
  if (ext && ext.length <= 4 && /^[a-z0-9]+$/i.test(ext)) return ext.toUpperCase();
  const t = d.file_type || '';
  if (/pdf/.test(t)) return 'PDF';
  if (/sheet|excel/.test(t)) return 'XLS';
  if (/word/.test(t)) return 'DOC';
  if (/^image\//.test(t)) return 'IMG';
  return 'FILE';
}
function isImageDoc(d) { return /^image\//.test(d.file_type || ''); }

function jobNo(p) { return 'JOB-' + String(p && p.number || 0).padStart(4, '0'); }

function statusDef(key) { return JOB_STATUS.find(s => s.key === key) || JOB_STATUS[0]; }
function statusLabel(key) { return statusDef(key).label; }
function statusTone(key) { return statusDef(key).tone; }

/* --------------------------------------------------- types of work */
function typeOf(p) { return ((p && p.work_type) || '').trim() || 'other'; }
function builtinType(key) { return BUILTIN_WORK_TYPES.find(t => t.key === key); }

/** Built-in types, then any type someone has added, then Other last. */
function allTypeKeys() {
  const seen = new Set(BUILTIN_WORK_TYPES.map(t => t.key));
  const extra = [];
  DB.projects.forEach(p => {
    const k = typeOf(p);
    if (!seen.has(k)) { seen.add(k); extra.push(k); }
  });
  extra.sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)));
  return BUILTIN_WORK_TYPES.filter(t => t.key !== 'other').map(t => t.key)
    .concat(extra, ['other']);
}
function typeLabel(key) {
  const b = builtinType(key);
  return b ? b.label : humanise(key);
}
/** Existing spelling of a type if one matches, so near-duplicates can't creep in. */
function matchType(name) {
  const want = slug(name);
  return allTypeKeys().find(k => k === want) || want;
}

/* ------------------------------------------------------ diary types */
function builtinEntry(key) { return ENTRY_TYPES.find(t => t.key === key); }

/** A diary entry's shown name — its own label wins, so types someone added
    keep reading correctly even on a phone that has never seen them. */
function entryLabel(e) {
  if (e && e.label) return e.label;
  const b = builtinEntry(e && e.kind);
  return b ? b.label : (e && e.kind ? humanise(e.kind) : 'Note');
}
function entryTone(e) {
  const b = builtinEntry(e && e.kind);
  return b ? b.tone : 'slate';
}
function entryMarked(e) {
  const b = builtinEntry(e && e.kind);
  return b ? !!b.mark : true;   // an added type is something worth marking
}
/** Built-in entry types plus every one anybody has added on this job list. */
function allEntryTypes() {
  const out = ENTRY_TYPES.slice();
  const seen = new Set(out.map(t => t.key));
  DB.diary_entries.forEach(e => {
    if (e.kind && !seen.has(e.kind)) {
      seen.add(e.kind);
      out.push({ key: e.kind, label: entryLabel(e), tone: 'slate', mark: true });
    }
  });
  return out;
}

/* Inline icons — no icon font, no network request, they inherit text colour. */
const ICONS = {
  pin:      '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/>',
  person:   '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
  clip:     '<path d="M17.5 8.5l-7.8 7.8a3 3 0 1 1-4.2-4.2l8.5-8.5a4.5 4.5 0 0 1 6.4 6.4l-8.5 8.5"/>',
  camera:   '<path d="M4 8h3l1.6-2.2h6.8L17 8h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8z"/><circle cx="12" cy="13.2" r="3.4"/>',
  printer:  '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  share:    '<path d="M12 15.5V4M12 4L8.2 7.8M12 4l3.8 3.8"/><path d="M5.5 13v6a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-6"/>',
  copy:     '<rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 5.5H6.8A2.3 2.3 0 0 0 4.5 7.8v8.7"/>',
  download: '<path d="M12 3.5v11M12 14.5L8 10.6M12 14.5l4-3.9"/><path d="M4.5 15.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5"/>',
  open:     '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5L11 13"/><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5h5"/>',
  trash:    '<path d="M4.5 6.5h15M9.5 6.5V4.2h5v2.3"/><path d="M6.5 6.5l.9 12.4a1.6 1.6 0 0 0 1.6 1.4h6a1.6 1.6 0 0 0 1.6-1.4l.9-12.4"/>',
  doc:      '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3.5V8.5h5"/>',
  book:     '<path d="M5 4.5h9a3 3 0 0 1 3 3v12a2.4 2.4 0 0 0-2.4-2.4H5z"/><path d="M5 4.5v12.6"/><path d="M8.5 9h6"/>',
  check:    '<path d="M5 12.5l4.2 4.2L19 7"/>',
  play:     '<path d="M8 5.5l10 6.5-10 6.5z"/>',
  plus:     '<path d="M12 5.5v13M5.5 12h13"/>',
  clock:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>'
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
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
const SITE = window.RCKD_CONFIG || {};

const Settings = {
  read() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('rckd.settings') || '{}'); } catch (e) {}
    return Object.assign({
      supabaseUrl: SITE.supabaseUrl || '',
      supabaseKey: SITE.supabaseKey || '',
      name: '',
      role: 'supervisor',
      localMode: false
    }, saved);
  },
  write(patch) {
    const next = Object.assign(Settings.read(), patch);
    localStorage.setItem('rckd.settings', JSON.stringify(next));
    S = next;
    return next;
  }
};
let S = Settings.read();

/** Can this device plan jobs and see the office-only documents? */
const isOffice   = () => roleDef(S.role).officeAccess;
/** ... and see the overview across every job, and archive them? */
const isDirector = () => !!roleDef(S.role).directorAccess;
const connected  = () => !S.localMode && !!S.supabaseUrl && !!S.supabaseKey;
function whoami() { return S.name || 'Unnamed user'; }

/* ================================================================
   Local cache — the app opens instantly and stays readable on site
   with no signal, which is most of the time
   ================================================================ */
const DB = { projects: [], project_docs: [], diary_entries: [], localSeq: 0 };

function cacheKey() { return 'rckd.cache.' + (S.localMode ? 'local' : 'remote'); }

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (raw) {
      DB.projects = raw.projects || [];
      DB.project_docs = raw.project_docs || [];
      DB.diary_entries = raw.diary_entries || [];
      DB.localSeq = raw.localSeq || 0;
    }
  } catch (e) {}
}
function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(DB));
  } catch (e) {
    // Storage full — most likely photos held on the phone waiting for signal.
    toast('Device storage is full. Get some signal so the photos can send.');
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
    const [projects, docs, entries] = await Promise.all([
      rest('projects?select=*&order=number.desc&limit=3000', { headers: restHeaders() }),
      rest('project_docs?select=*&order=uploaded_at.asc&limit=8000', { headers: restHeaders() }),
      rest('diary_entries?select=*&order=at.asc&limit=20000', { headers: restHeaders() })
    ]);
    DB.projects = projects || [];
    DB.project_docs = docs || [];
    DB.diary_entries = entries || [];
    saveCache();
  },

  async insert(table, row) {
    if (!row.id) row.id = uid();
    if (!connected()) {
      if (table === 'projects' && !row.number) row.number = ++DB.localSeq;
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
    drop(table, id);
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
    const meta = { name: file.name || 'file', type: file.type || '', size: file.size || 0 };
    if (!connected()) {
      return Object.assign(meta, { url: await fileToDataUrl(file), local: true });
    }
    try {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${(file.name || 'file').replace(/[^\w.\-]+/g, '_')}`;
      const base = S.supabaseUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/storage/v1/object/dispatch-files/${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }),
        body: file
      });
      if (!res.ok) throw new Error(await res.text());
      return Object.assign(meta, { url: `${base}/storage/v1/object/public/dispatch-files/${encodeURIComponent(path)}` });
    } catch (err) {
      // Keep the file rather than lose it; it rides along in the record.
      return Object.assign(meta, { url: await fileToDataUrl(file), local: true, pending: true });
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
    try { return JSON.parse(localStorage.getItem('rckd.outbox') || '[]'); } catch (e) { return []; }
  },
  save(list) { localStorage.setItem('rckd.outbox', JSON.stringify(list)); },
  add(op) {
    const list = Outbox.all();
    list.push(Object.assign({ opId: uid() }, op));
    Outbox.save(list);
    paintSync();
  },
  count() { return Outbox.all().length; },
  async flush() {
    if (!connected()) return;
    const list = Outbox.all();
    if (!list.length) return;
    const left = [];
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
      }
    }
    Outbox.save(left);
    paintSync();
  }
};

/* ================================================================
   Reading the data
   ================================================================ */
const jobById   = id => DB.projects.find(p => p.id === id);
const docById   = id => DB.project_docs.find(d => d.id === id);
const entryById = id => DB.diary_entries.find(e => e.id === id);

function activeJobs() { return DB.projects.filter(p => !p.archived); }

/** Documents this device is allowed to see, newest last. */
function docsFor(projectId) {
  return DB.project_docs
    .filter(d => d.project_id === projectId)
    .filter(d => isOffice() || (d.audience || 'all') !== 'office')
    .sort((a, b) => (a.uploaded_at || '').localeCompare(b.uploaded_at || ''));
}
/** Every document on a job, ignoring who is looking. For counts in reports. */
function allDocsFor(projectId) {
  return DB.project_docs.filter(d => d.project_id === projectId);
}

/* RCK works nights, so a "day" in the diary is a shift, not a calendar day:
   the crew comes on at 19:45 and goes off at 05:15, and both belong to the
   shift that started on the 20th. Sorting on the clock alone would put the
   05:15 first. So within one shift, anything logged in the small hours is
   ordered after the evening — but only when the shift really did start in
   the evening, which leaves an ordinary day shift completely untouched. */
const NIGHT_UNTIL  = 9 * 60;    // 09:00
const EVENING_FROM = 17 * 60;   // 17:00

function minutesOfDay(iso) {
  const d = new Date(iso);
  return isNaN(d) ? 0 : d.getHours() * 60 + d.getMinutes();
}
/** True when this shift's entries straddle midnight. */
function isNightShift(list) {
  const mins = list.map(e => minutesOfDay(e.at));
  return mins.some(m => m >= EVENING_FROM) && mins.some(m => m < NIGHT_UNTIL);
}
/** One shift's entries in the order they actually happened. */
function shiftOrder(list) {
  const night = isNightShift(list);
  const key = e => {
    const m = minutesOfDay(e.at);
    return night && m < NIGHT_UNTIL ? m + 1440 : m;
  };
  return list.slice().sort((a, b) =>
    key(a) - key(b) || (a.created_at || '').localeCompare(b.created_at || ''));
}
/** How long the crew was on site that shift, as "9h 30m". */
function shiftSpan(list) {
  if (list.length < 2) return '';
  const night = isNightShift(list);
  const key = e => {
    const m = minutesOfDay(e.at);
    return night && m < NIGHT_UNTIL ? m + 1440 : m;
  };
  const ks = list.map(key);
  const mins = Math.max.apply(null, ks) - Math.min.apply(null, ks);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h${m ? ' ' + m + 'm' : ''}` : `${m}m`;
}

/** Everything logged across every job on one shift date, latest first —
    "latest" meaning latest in the shift, so a night crew's 01:30 comes
    above the 19:45 that started the same shift. */
function shiftFeed(day, limit) {
  const byJob = {};
  DB.diary_entries.filter(e => (e.entry_date || '') === day)
    .forEach(e => { (byJob[e.project_id] = byJob[e.project_id] || []).push(e); });
  const out = [];
  Object.keys(byJob).forEach(id => {
    const list = byJob[id];
    const night = isNightShift(list);
    list.forEach(e => {
      const m = minutesOfDay(e.at);
      out.push({ e, k: night && m < NIGHT_UNTIL ? m + 1440 : m });
    });
  });
  return out.sort((a, b) => b.k - a.k).slice(0, limit).map(x => x.e);
}

/** The shift a new entry most likely belongs to. Logging at 01:30 on a job
    whose crew came on last evening means last night's shift, not today. */
function defaultShiftDate(projectId) {
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() >= NIGHT_UNTIL) return today();
  const y = new Date(now.getTime() - 86400000);
  const yStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  const last = entriesFor(projectId, yStr);
  return last.length && isNightShift(last.concat([{ at: now.toISOString() }])) ? yStr : today();
}

/** Diary entries for a job, in the order they happened. One shift when a
    date is given; otherwise every shift, oldest first. */
function entriesFor(projectId, dateStr) {
  const all = DB.diary_entries.filter(e => e.project_id === projectId);
  if (dateStr) return shiftOrder(all.filter(e => (e.entry_date || '') === dateStr));
  const byDay = {};
  all.forEach(e => { (byDay[e.entry_date || ''] = byDay[e.entry_date || ''] || []).push(e); });
  return Object.keys(byDay).sort()
    .reduce((out, day) => out.concat(shiftOrder(byDay[day])), []);
}
/** The dates a job has diary entries on, newest first. */
function diaryDays(projectId) {
  const seen = new Set();
  entriesFor(projectId).forEach(e => { if (e.entry_date) seen.add(e.entry_date); });
  return Array.from(seen).sort().reverse();
}
function lastEntry(projectId) {
  const list = entriesFor(projectId);
  return list.length ? list[list.length - 1] : null;
}

/** Days the crew has actually been on site, counted from the diary. */
function daysOnSite(p) {
  const n = diaryDays(p.id).length;
  if (n) return n;
  if (p.status === 'ongoing' && p.started_at) return (daysBetween(p.started_at, new Date().toISOString()) || 0) + 1;
  return 0;
}

/** Anything raised as an issue or a delay and still on the record. */
function issueCount(projectId) {
  return entriesFor(projectId).filter(e => e.kind === 'issue' || e.kind === 'delay').length;
}

/** Is this job one of today's? Ongoing counts, so does anything planned to
    start today or earlier that nobody has started yet. */
function isTodayJob(p) {
  if (p.archived) return false;
  if (p.status === 'ongoing') return true;
  if (p.status === 'planned') {
    const n = daysFromToday(p.start_date);
    return n != null && n <= 0;
  }
  if (p.status === 'completed') return (p.completed_at || '').slice(0, 10) === today();
  return false;
}

/* --------------------------------------------------------- periods */
/* A director thinks in months and financial years, not in dates typed
   twice. RCK's year runs 1 April to 31 March like everyone else's here. */
const PERIODS = [
  { key: 'month',   label: 'This month' },
  { key: 'last',    label: 'Last month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'fy',      label: 'Financial year' },
  { key: 'all',     label: 'All time' }
];

function periodRange(key) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (yy, mm, dd) => `${yy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const lastDay = (yy, mm) => new Date(yy, mm + 1, 0).getDate();
  if (key === 'month')   return [iso(y, m, 1), iso(y, m, lastDay(y, m))];
  if (key === 'last')    { const d = new Date(y, m - 1, 1), ly = d.getFullYear(), lm = d.getMonth();
                           return [iso(ly, lm, 1), iso(ly, lm, lastDay(ly, lm))]; }
  if (key === 'quarter') { const q = Math.floor(m / 3) * 3;
                           return [iso(y, q, 1), iso(y, q + 2, lastDay(y, q + 2))]; }
  if (key === 'fy')      { const fy = m >= 3 ? y : y - 1; return [iso(fy, 3, 1), iso(fy + 1, 2, 31)]; }
  return ['', ''];
}
function periodLabel(key, from, to) {
  const p = PERIODS.find(x => x.key === key);
  if (p && key !== 'all') return `${p.label} — ${fmtDate(from)} to ${fmtDate(to)}`;
  if (key === 'all') return 'All time';
  if (from || to) return `${from ? fmtDate(from) : 'the beginning'} to ${to ? fmtDate(to) : 'today'}`;
  return 'All time';
}

/** A job belongs to a period if it was actually on site in it, or was due
    to start in it, or finished in it — so a long job counts in every month
    the crew was out on it, not only the one it started in. */
function jobInPeriod(p, from, to) {
  if (!from && !to) return true;
  const within = d => !!d && (!from || d >= from) && (!to || d <= to);
  if (within(p.start_date)) return true;
  if (within((p.completed_at || '').slice(0, 10))) return true;
  return diaryDays(p.id).some(within);
}

/** The numbers a director asks for, added up honestly: value and cost are
    summed only over the jobs that carry them, and the count of those jobs
    comes back too, so a total can say what it is missing. */
function periodTotals(list) {
  const t = { jobs: list.length, days: 0, entries: 0, issues: 0,
              value: 0, valued: 0, cost: 0, costed: 0,
              ongoing: 0, planned: 0, completed: 0 };
  list.forEach(p => {
    t.days += diaryDays(p.id).length;
    t.entries += entriesFor(p.id).length;
    t.issues += issueCount(p.id);
    if (hasMoney(p.contract_value)) { t.value += Number(p.contract_value); t.valued++; }
    if (hasMoney(p.actual_cost))    { t.cost  += Number(p.actual_cost);    t.costed++; }
    t[p.status] = (t[p.status] || 0) + 1;
  });
  t.margin = (t.valued && t.costed) ? t.value - t.cost : null;
  t.marginPct = marginPct(t.value, t.margin);
  return t;
}

/** Board order: on site first, then what starts soonest, then finished. */
function boardOrder(list) {
  const rank = { ongoing: 0, planned: 1, completed: 2 };
  const rankOf = p => (rank[p.status] == null ? 3 : rank[p.status]);
  return list.slice().sort((a, b) => {
    const r = rankOf(a) - rankOf(b);
    if (r) return r;
    if (a.status === 'completed') return (b.completed_at || '').localeCompare(a.completed_at || '');
    const ad = a.start_date || '9999-12-31';
    const bd = b.start_date || '9999-12-31';
    if (ad !== bd) return ad.localeCompare(bd);
    return (b.number || 0) - (a.number || 0);
  });
}

/* ================================================================
   Writing the data
   ================================================================ */
async function createJob(data) {
  const row = Object.assign({
    id: uid(),
    status: 'planned',
    created_by: whoami(),
    created_at: new Date().toISOString()
  }, data);
  return Store.insert('projects', row);
}

/** Start a job: the moment the crew is on site it stops being a plan. */
async function startJob(p) {
  if (p.status !== 'planned') return p;
  await Store.patch('projects', p.id, {
    status: 'ongoing',
    started_at: new Date().toISOString(),
    started_by: whoami()
  });
  return jobById(p.id);
}

async function completeJob(p, notes) {
  await Store.patch('projects', p.id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    completed_by: whoami(),
    completion_notes: notes || ''
  });
  return jobById(p.id);
}

/** Add a diary entry, with its photos already uploaded. */
async function addEntry(projectId, data, files) {
  const uploads = [];
  for (const f of files || []) uploads.push(await Store.upload(f));
  const row = {
    id: uid(),
    project_id: projectId,
    entry_date: data.entry_date || today(),
    at: data.at || new Date().toISOString(),
    kind: data.kind || 'note',
    label: data.label || '',
    body: data.body || '',
    files: uploads,
    author: whoami(),
    role: S.role,
    created_at: new Date().toISOString()
  };
  const saved = await Store.insert('diary_entries', row);

  // The first entry on a planned job means the crew is on site.
  const p = jobById(projectId);
  if (p && p.status === 'planned') await startJob(p);
  return saved;
}

/** Attach a document to a job. */
async function addDoc(projectId, data, file) {
  const up = await Store.upload(file);
  const row = {
    id: uid(),
    project_id: projectId,
    kind: data.kind || 'other',
    title: data.title || up.name,
    audience: data.audience || 'all',
    file_name: up.name,
    file_url: up.url,
    file_type: up.type,
    file_size: up.size,
    notes: data.notes || '',
    uploaded_by: whoami(),
    uploaded_at: new Date().toISOString()
  };
  return Store.insert('project_docs', row);
}

/** Save a file to the phone rather than navigate the app away to it.
    A `download` attribute is ignored across origins, so the file is fetched
    and handed over as a blob; if that fails it opens in a new tab, which
    still lets the phone's share sheet save it. */
async function downloadFile(url, name) {
  if (!url) return toast('That file is not on this device yet');
  if (/^data:/.test(url)) return saveAs(url, name);
  try {
    toast('Downloading…');
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const href = URL.createObjectURL(await res.blob());
    saveAs(href, name);
    setTimeout(() => URL.revokeObjectURL(href), 20000);
  } catch (e) {
    window.open(url, '_blank', 'noopener');
  }
}
function saveAs(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
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
function jobIdFromPath() { return route.path.split('/')[2] || ''; }

const SCREENS = {
  '/':        { title: 'Jobs',          render: renderBoard },
  '/today':   { title: 'Today on site', render: renderToday },
  '/log':     { title: 'Log',           render: renderLogPicker, back: true },
  '/new':     { title: 'New job',       render: renderJobEdit, back: true },
  '/overview':{ title: 'Overview',      render: renderOverview, back: true },
  '/reports': { title: 'Reports',       render: renderReports, back: true },
  '/setup':   { title: 'Settings',      render: renderSetup,   back: true },
  '/join':    { title: 'Set up',        render: renderJoin },
  '/screen':  { title: 'Office screen', render: renderKiosk }
};

/* Coming back to a list should put you where you left it, not at the top. */
const scrollMemory = {};
let lastPath = null;

function restoreScroll(path) {
  const keepsPlace = path === '/' || path === '/today' || path.startsWith('/diary/');
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

  if (route.path.startsWith('/job/'))        { screen = { title: 'Job',       render: renderJob };      back = true; }
  else if (route.path.startsWith('/edit/'))  { screen = { title: 'Edit job',  render: renderJobEdit };  back = true; }
  else if (route.path.startsWith('/docs/'))  { screen = { title: 'Documents', render: renderDocs };     back = true; }
  else if (route.path.startsWith('/diary/')) { screen = { title: 'Job diary', render: renderDiary };    back = true; }
  else if (route.path.startsWith('/entry/')) { screen = { title: 'Diary entry', render: renderEntry };  back = true; }
  else if (route.path.startsWith('/upload/')){ screen = { title: 'Add document', render: renderUpload }; back = true; }

  if (!screen) { go('#/'); return; }

  $('#title').textContent = screen.title;
  $('#backBtn').hidden = !(back || screen.back);
  $('#menu').hidden = true;

  paintTabs();
  paintMenu();
  $$('#tabbar a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + route.path));

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

/** The big middle tab is whatever this device does most: the office plans
    jobs, the supervisor logs what is happening on the one they're running. */
/** Menu items marked for one role only appear for that role. */
function paintMenu() {
  $$('#menu [data-role]').forEach(el => {
    el.hidden = el.dataset.role === 'director' ? !isDirector() : !isOffice();
  });
}

function paintTabs() {
  const tab = $('#tabbar a.tab-primary');
  if (!tab) return;
  const office = isOffice();
  tab.setAttribute('href', office ? '#/new' : '#/log');
  tab.setAttribute('data-tab', office ? 'new' : 'log');
  $('span:last-child', tab).textContent = office ? 'New job' : 'Log';
}

/* ================================================================
   Screen — pick a job to log against
   The supervisor's way in: the jobs that are actually running, biggest
   tap targets first, theirs at the top.
   ================================================================ */
function renderLogPicker(view) {
  const mine = (S.name || '').trim().toLowerCase();
  const jobs = boardOrder(activeJobs().filter(p => p.status === 'ongoing' || isTodayJob(p)))
    .sort((a, b) => {
      const am = (a.supervisor || '').trim().toLowerCase() === mine ? 0 : 1;
      const bm = (b.supervisor || '').trim().toLowerCase() === mine ? 0 : 1;
      return am - bm;
    });

  if (!jobs.length) {
    view.innerHTML = `
      <div class="empty">
        <b>Nothing to log against</b>
        No job is running and nothing is booked to start today.
      </div>
      <a class="btn wide" href="#/">See all jobs</a>`;
    return;
  }

  view.innerHTML = `
    <p class="muted small mb">Pick the job you're on. ${esc(fmtDayDate(today()))}.</p>
    ${jobs.map((p, i) => {
      const n = entriesFor(p.id, today()).length;
      return `
        <button class="job-row status-${statusTone(p.status)}" data-id="${p.id}" style="--i:${i}">
          <div class="hdr"><span class="num">${jobNo(p)}</span>
            <span class="pill"><span class="swatch"></span>${statusLabel(p.status)}</span></div>
          <div class="ttl">${esc(p.name)}</div>
          <div class="sub">
            ${p.site ? `<span>${esc(p.site)}</span>` : ''}
            ${p.supervisor ? `<span>${esc(p.supervisor)}</span>` : ''}
            <span>${n ? n + ' logged today' : 'nothing logged today'}</span>
          </div>
        </button>`;
    }).join('')}`;

  $$('.job-row', view).forEach(b => b.onclick = () => go('#/diary/' + b.dataset.id));
}

/** Shared header shown on every screen that belongs to one job. */
function jobHeader(p, tab) {
  const docs = docsFor(p.id).length;
  const entries = entriesFor(p.id).length;
  return `
    <div class="card accent status-${statusTone(p.status)}">
      <div class="row spread" style="align-items:flex-start">
        <div class="grow">
          <div class="tiny" style="color:var(--ink-3);letter-spacing:.04em;font-weight:700">${jobNo(p)}</div>
          <h2 style="font-size:19px;margin:2px 0 3px">${esc(p.name)}</h2>
          <div class="small muted">${esc(p.client || 'No client named')} · ${esc(typeLabel(typeOf(p)))}</div>
        </div>
        <span class="pill"><span class="swatch"></span>${statusLabel(p.status)}</span>
      </div>
      ${p.site ? `<div class="small mt" style="display:flex;gap:6px;align-items:center">${icon('pin')}${esc(p.site)}</div>` : ''}
    </div>

    <div class="seg">
      <a href="#/job/${p.id}" class="${tab === 'job' ? 'on' : ''}">Overview</a>
      <a href="#/docs/${p.id}" class="${tab === 'docs' ? 'on' : ''}">Documents<span class="n">${docs}</span></a>
      <a href="#/diary/${p.id}" class="${tab === 'diary' ? 'on' : ''}">Diary<span class="n">${entries}</span></a>
    </div>`;
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
      <h2>Set up RCK Dispatch</h2>
      <p class="muted small">This links your phone to the shared job list. You only do this once.</p>
      <label class="field"><span>Your name</span>
        <input type="text" id="jName" value="${esc(S.name)}" placeholder="e.g. Dave T"></label>
      <label class="field"><span>You are</span>
        <select id="jRole">
          ${ROLES.map(r => `<option value="${r.key}">${esc(r.label)} — ${esc(r.blurb)}</option>`).join('')}
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
    if (roleDef(role).officeAccess && SITE.officePin) {
      const pin = prompt('Office code:');
      if (pin !== SITE.officePin) return toast('Wrong code');
    }

    this.disabled = true;
    this.textContent = 'Connecting…';
    const out = $('#jOut', view);
    let problem = 'Could not reach the database. Check you have signal and try again, or ask for a new link.';
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/projects?select=id&limit=1`, {
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
      <p class="muted small">Two things before you start: your name, so the diary records who
      wrote what, and the connection to the shared job list.</p>
      <a class="btn primary wide mt" href="#/setup">Open settings</a>
    </div>`;
}

/* ================================================================
   Screen — job board (home)
   ================================================================ */
const boardFilter = { type: 'all', status: 'all', q: '' };

function jobCard(p, i) {
  const days = daysOnSite(p);
  const issues = issueCount(p.id);
  const when = p.status === 'planned' ? startText(p.start_date)
    : p.status === 'completed' ? { text: 'finished ' + fmtShort(p.completed_at), late: false }
    : { text: days === 1 ? 'day 1 on site' : `day ${days} on site`, late: false };

  return `
    <button class="job-card status-${statusTone(p.status)}" data-id="${p.id}" style="--i:${i}">
      <div class="num">${jobNo(p)}</div>
      <div class="name">${esc(p.name)}</div>
      <div class="client">${esc(p.client || typeLabel(typeOf(p)))}</div>
      ${p.site ? `<div class="line">${icon('pin')}${esc(p.site)}</div>` : ''}
      <div class="line">${icon('calendar')}<span class="${when.late ? 'overdue' : ''}">${esc(when.text)}</span>${
        p.start_date ? ` · ${esc(fmtShort(p.start_date))}${p.end_date && p.end_date !== p.start_date ? '–' + esc(fmtShort(p.end_date)) : ''}` : ''}</div>
      ${p.supervisor ? `<div class="line">${icon('person')}${esc(p.supervisor)}</div>` : ''}
      <div class="foot">
        <span class="pill"><span class="swatch"></span>${statusLabel(p.status)}</span>
        <span class="pill plain">${esc(typeLabel(typeOf(p)))}</span>
        ${issues ? `<span class="pill plain">${issues} issue${issues > 1 ? 's' : ''}</span>` : ''}
      </div>
    </button>`;
}

function wireJobCards(root) {
  $$('.job-card', root).forEach(b => b.onclick = () => go('#/job/' + b.dataset.id));
}

function renderBoard(view) {
  const jobs = activeJobs();

  if (!jobs.length) {
    view.innerHTML = `
      <div class="empty">
        <b>No jobs yet</b>
        The office loads a job, hangs the paperwork on it, and the crew picks it up here.
      </div>
      ${isOffice()
        ? '<a class="btn primary wide" href="#/new">Create the first job</a>'
        : '<p class="muted small center">Nothing has been dispatched yet.</p>'}`;
    return;
  }

  const counts = { planned: 0, ongoing: 0, completed: 0 };
  jobs.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });

  const types = allTypeKeys().filter(k => jobs.some(p => typeOf(p) === k));

  view.innerHTML = `
    <div class="tally">
      ${JOB_STATUS.map(s => `
        <button class="status-${s.tone}" data-status="${s.key}" aria-pressed="${boardFilter.status === s.key}">
          <span class="n">${counts[s.key] || 0}</span>
          <span class="l">${s.label}</span>
        </button>`).join('')}
    </div>

    <div class="filters" id="typeChips">
      <button class="chip" data-type="all" aria-pressed="${boardFilter.type === 'all'}">All work</button>
      ${types.map(k => `<button class="chip" data-type="${esc(k)}" aria-pressed="${boardFilter.type === k}">${esc(typeLabel(k))}</button>`).join('')}
    </div>

    <label class="field"><input type="text" id="q" value="${esc(boardFilter.q)}"
      placeholder="Search job, client, site or supervisor" autocapitalize="off"></label>

    <div class="job-grid" id="grid"></div>`;

  const grid = $('#grid', view);

  function paint() {
    const q = boardFilter.q.toLowerCase();
    const list = boardOrder(jobs.filter(p => {
      if (boardFilter.status !== 'all' && p.status !== boardFilter.status) return false;
      if (boardFilter.type !== 'all' && typeOf(p) !== boardFilter.type) return false;
      if (!q) return true;
      return [p.name, p.client, p.site, p.supervisor, jobNo(p), typeLabel(typeOf(p))]
        .some(v => String(v || '').toLowerCase().includes(q));
    }));

    grid.innerHTML = list.length
      ? list.map(jobCard).join('')
      : `<div class="empty" style="grid-column:1/-1"><b>Nothing matches</b>Try clearing the filters.</div>`;
    wireJobCards(grid);
  }

  $$('.tally button', view).forEach(b => b.onclick = () => {
    boardFilter.status = boardFilter.status === b.dataset.status ? 'all' : b.dataset.status;
    $$('.tally button', view).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.status === boardFilter.status)));
    paint();
  });

  $$('#typeChips .chip', view).forEach(b => b.onclick = () => {
    boardFilter.type = b.dataset.type;
    $$('#typeChips .chip', view).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.type === boardFilter.type)));
    paint();
  });

  $('#q', view).oninput = e => { boardFilter.q = e.target.value; paint(); };

  paint();
}

/* ================================================================
   Screen — today on site
   The dispatch view: what is running right now, what the crews have
   logged so far today, and what is due to start.
   ================================================================ */
function renderToday(view) {
  const day = today();
  const jobs = boardOrder(activeJobs().filter(isTodayJob));
  const soon = boardOrder(activeJobs().filter(p =>
    p.status === 'planned' && !isTodayJob(p) && daysFromToday(p.start_date) != null && daysFromToday(p.start_date) <= 7));

  if (!jobs.length && !soon.length) {
    view.innerHTML = `
      <div class="empty">
        <b>Nothing on today</b>
        No job is running and nothing is booked to start in the next week.
      </div>
      ${isOffice() ? '<a class="btn primary wide" href="#/new">Plan a job</a>' : ''}`;
    return;
  }

  const rows = jobs.map((p, i) => {
    const eToday = entriesFor(p.id, day);
    const last = eToday.length ? eToday[eToday.length - 1] : null;
    return `
      <button class="job-row status-${statusTone(p.status)}" data-id="${p.id}" style="--i:${i}">
        <div class="hdr">
          <span class="num">${jobNo(p)}</span>
          <span class="pill"><span class="swatch"></span>${statusLabel(p.status)}</span>
        </div>
        <div class="ttl">${esc(p.name)}</div>
        <div class="sub">
          ${p.site ? `<span>${esc(p.site)}</span>` : ''}
          ${p.supervisor ? `<span>${esc(p.supervisor)}</span>` : ''}
          <span>${eToday.length ? eToday.length + ' entr' + (eToday.length > 1 ? 'ies' : 'y') + ' today' : 'nothing logged today'}</span>
        </div>
        ${last ? `<div class="sub"><strong>${fmtTime(last.at)}</strong> ${esc(entryLabel(last))}${last.body ? ' — ' + esc(last.body.slice(0, 70)) : ''}</div>` : ''}
      </button>`;
  }).join('');

  view.innerHTML = `
    <p class="muted small mb">${esc(fmtDayDate(day))}</p>
    ${jobs.length ? rows : '<div class="empty"><b>No job running today</b>Nothing has been started.</div>'}
    ${soon.length ? `
      <div class="section-title">Coming up</div>
      ${soon.map((p, i) => `
        <button class="job-row status-planned" data-id="${p.id}" style="--i:${i}">
          <div class="hdr"><span class="num">${jobNo(p)}</span>
            <span class="pill plain">${esc(startText(p.start_date).text)}</span></div>
          <div class="ttl">${esc(p.name)}</div>
          <div class="sub">${p.site ? `<span>${esc(p.site)}</span>` : ''}
            <span>${esc(typeLabel(typeOf(p)))}</span>
            ${p.supervisor ? `<span>${esc(p.supervisor)}</span>` : ''}</div>
        </button>`).join('')}` : ''}`;

  $$('.job-row', view).forEach(b => b.onclick = () => go('#/job/' + b.dataset.id));
}

/* ================================================================
   Screen — one job, overview
   ================================================================ */
function renderJob(view) {
  const p = jobById(jobIdFromPath());
  if (!p) { view.innerHTML = `<div class="empty"><b>Job not found</b></div>`; return; }

  $('#title').textContent = jobNo(p);

  const docs = docsFor(p.id);
  const entries = entriesFor(p.id);
  const days = diaryDays(p.id);
  const issues = issueCount(p.id);
  const last = lastEntry(p.id);

  view.innerHTML = `
    ${jobHeader(p, 'job')}

    ${p.description ? `<div class="card"><h2>Scope</h2>
      <p class="small" style="white-space:pre-wrap;margin:0">${esc(p.description)}</p></div>` : ''}

    <div class="card">
      <div class="stat">
        <div><span class="n">${days.length}</span><span class="l">Days on site</span></div>
        <div><span class="n">${entries.length}</span><span class="l">Diary entries</span></div>
        <div><span class="n">${docs.length}</span><span class="l">Documents</span></div>
        <div><span class="n" style="color:${issues ? 'var(--red)' : 'inherit'}">${issues}</span><span class="l">Issues</span></div>
      </div>
      ${last ? `<p class="small muted mt" style="margin-bottom:0">Last entry ${fmtDateTime(last.at)} —
        <strong>${esc(entryLabel(last))}</strong> by ${esc(last.author || 'someone')}</p>` : ''}
    </div>

    <div class="card">
      <table class="data">
        <tr><th>Status</th><td>${statusLabel(p.status)} <span class="muted">— ${esc(statusDef(p.status).blurb)}</span></td></tr>
        <tr><th>Type of work</th><td>${esc(typeLabel(typeOf(p)))}</td></tr>
        <tr><th>Client</th><td>${esc(p.client || '—')}</td></tr>
        <tr><th>Site</th><td>${esc(p.site || '—')}</td></tr>
        ${p.contact ? `<tr><th>Contact</th><td>${esc(p.contact)}</td></tr>` : ''}
        <tr><th>Supervisor</th><td>${p.supervisor ? esc(p.supervisor) : '<span class="muted">not assigned</span>'}</td></tr>
        <tr><th>Planned dates</th><td>${p.start_date
            ? fmtDate(p.start_date) + (p.end_date && p.end_date !== p.start_date ? ' to ' + fmtDate(p.end_date) : '')
            : '<span class="muted">not set</span>'}</td></tr>
        ${p.started_at ? `<tr><th>Started</th><td>${fmtDateTime(p.started_at)}${p.started_by ? ' · ' + esc(p.started_by) : ''}</td></tr>` : ''}
        ${p.completed_at ? `<tr><th>Completed</th><td>${fmtDateTime(p.completed_at)}${p.completed_by ? ' · ' + esc(p.completed_by) : ''}</td></tr>` : ''}
        ${p.completion_notes ? `<tr><th>Closing note</th><td style="white-space:pre-wrap">${esc(p.completion_notes)}</td></tr>` : ''}
        <tr><th>Created</th><td>${fmtDate(p.created_at)}${p.created_by ? ' · ' + esc(p.created_by) : ''}</td></tr>
      </table>
    </div>

    ${isOffice() && (hasMoney(p.contract_value) || hasMoney(p.actual_cost)) ? `
      <div class="card">
        <h2>Value and cost</h2>
        <table class="data">
          <tr><th>Contract value</th><td>${fmtMoney(p.contract_value, true)}</td></tr>
          <tr><th>Cost to RCK</th><td>${fmtMoney(p.actual_cost, true)}</td></tr>
          ${jobMargin(p) != null ? `<tr><th>Margin</th><td><strong style="color:${
            jobMargin(p) < 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(jobMargin(p), true)}${
            marginPct(p.contract_value, jobMargin(p)) != null
              ? ' · ' + marginPct(p.contract_value, jobMargin(p)).toFixed(1) + '%' : ''}</strong></td></tr>`
            : '<tr><th>Margin</th><td class="muted">needs both numbers</td></tr>'}
        </table>
        <p class="muted tiny" style="margin:8px 0 0">Not visible to supervisors.</p>
      </div>` : ''}

    ${p.status === 'planned' ? `
      <button class="btn primary wide" id="start">${icon('play')}Start job — crew is on site</button>
      <p class="muted small center mt">Adding the first diary entry does this for you.</p>` : ''}

    ${p.status === 'ongoing' ? `
      <div class="btn-row">
        <a class="btn primary" href="#/entry/${p.id}">${icon('plus')}Add diary entry</a>
        <button class="btn" id="finish">${icon('check')}Project completed</button>
      </div>` : ''}

    ${p.status === 'completed' ? `
      <div class="banner info">This job is finished. The diary and documents stay exactly as they are.
      ${isOffice() ? ' Reopen it below if it was closed by mistake.' : ''}</div>` : ''}

    <div class="section-title">Reports</div>
    <div class="card">
      <p class="muted small">The full job report is every day of the diary, every entry, the photos
      and the list of documents — one document, ready to save as a PDF or email on.</p>
      <div class="btn-row">
        <button class="btn" id="fullReport">${icon('printer')}Full job report</button>
        <button class="btn" id="dayReport">${icon('printer')}One day</button>
      </div>
    </div>

    ${isOffice() ? `
      <div class="section-title">Office</div>
      <div class="card">
        <div class="btn-row">
          <a class="btn sm" href="#/edit/${p.id}">Edit job details</a>
          ${p.status === 'completed' ? '<button class="btn sm" id="reopen">Reopen job</button>' : ''}
          ${isDirector() ? `<button class="btn sm" id="archive">${p.archived ? 'Restore' : 'Archive'}</button>` : ''}
        </div>
        <p class="muted tiny mt" style="margin-bottom:0">${isDirector()
          ? 'Archiving hides the job from the board and keeps every record. Nothing is ever deleted.'
          : 'Archiving a job is a director\'s call. Nothing here is ever deleted.'}</p>
      </div>` : ''}`;

  const startBtn = $('#start', view);
  if (startBtn) startBtn.onclick = async () => {
    await startJob(p);
    toast('Job started');
    render();
  };

  const finish = $('#finish', view);
  if (finish) finish.onclick = async () => {
    const open = entriesFor(p.id, today()).length;
    if (!confirm(`Mark ${jobNo(p)} as completed?\n\nThe diary closes and the job moves off the board.` +
      (open ? '' : '\n\nNothing has been logged today.'))) return;
    const notes = prompt('Anything to note about how the job finished? (optional)') || '';
    await completeJob(p, notes.trim());
    toast('Job completed');
    render();
  };

  $('#fullReport', view).onclick = () => printJobReport(p);
  $('#dayReport', view).onclick = () => {
    if (!days.length) return toast('No diary days yet');
    const pick = prompt('Which day? (YYYY-MM-DD)\n\nDays with entries:\n' + days.join('\n'), days[0]);
    if (!pick) return;
    if (!days.includes(pick.trim())) return toast('No diary entries on that day');
    printDayReport(p, pick.trim());
  };

  const reopen = $('#reopen', view);
  if (reopen) reopen.onclick = async () => {
    if (!confirm('Reopen this job? It goes back to On site.')) return;
    await Store.patch('projects', p.id, { status: 'ongoing', completed_at: null, completed_by: '' });
    toast('Job reopened');
    render();
  };

  const archive = $('#archive', view);
  if (archive) archive.onclick = async () => {
    await Store.patch('projects', p.id, { archived: !p.archived });
    toast(p.archived ? 'Restored' : 'Archived');
    render();
  };
}

/* ================================================================
   Screen — documents on a job
   The office hangs the paperwork here. On site it is a list to read,
   open and download; office-only files never appear on a site phone.
   ================================================================ */
function docKindLabel(key) {
  const k = DOC_KINDS.find(x => x.key === key);
  return k ? k.label : humanise(key || 'other');
}
function audienceLabel(key) {
  const a = AUDIENCES.find(x => x.key === key);
  return a ? a.label : 'Everyone';
}

function docRow(d, i, canRemove) {
  return `
    <div class="filerow" data-id="${d.id}" style="--i:${i}">
      <div class="fi">${isImageDoc(d) && d.file_url
        ? `<img src="${esc(d.file_url)}" alt="">`
        : esc(fileTag(d))}</div>
      <div class="fb">
        <div class="ft">${esc(d.title || d.file_name)}</div>
        <div class="fm">${esc(docKindLabel(d.kind))} · ${esc(fileSizeText(d.file_size))} ·
          ${esc(d.uploaded_by || 'someone')}, ${esc(fmtShort(d.uploaded_at))}${
          (d.audience || 'all') !== 'all' ? ' · ' + esc(audienceLabel(d.audience)) : ''}</div>
        ${d.notes ? `<div class="fn">${esc(d.notes)}</div>` : ''}
      </div>
      <div class="fa">
        <a href="${esc(d.file_url)}" target="_blank" rel="noopener" title="Open">${icon('open')}</a>
        <button data-dl="${d.id}" title="Download">${icon('download')}</button>
        ${canRemove ? `<button data-del="${d.id}" title="Remove">${icon('trash')}</button>` : ''}
      </div>
    </div>`;
}

function renderDocs(view) {
  const p = jobById(jobIdFromPath());
  if (!p) { view.innerHTML = `<div class="empty"><b>Job not found</b></div>`; return; }
  $('#title').textContent = 'Documents';

  const docs = docsFor(p.id);
  const groups = [];
  DOC_KINDS.forEach(k => {
    const list = docs.filter(d => (d.kind || 'other') === k.key);
    if (list.length) groups.push([k.label, list]);
  });
  const known = new Set(DOC_KINDS.map(k => k.key));
  const rest = docs.filter(d => !known.has(d.kind || 'other'));
  if (rest.length) groups.push(['Anything else', rest]);

  view.innerHTML = `
    ${jobHeader(p, 'docs')}

    <a class="btn primary wide" href="#/upload/${p.id}">${icon('clip')}Add a document</a>
    ${isOffice()
      ? '<p class="muted small center mt">PMP, scope, job cards, drawings, spreadsheets, photos — anything at all.</p>'
      : '<p class="muted small center mt">Site photos and paperwork you pick up on the job go here too.</p>'}

    ${docs.length ? groups.map(([label, list]) => `
      <div class="section-title">${esc(label)}</div>
      <div class="card">${list.map((d, i) => docRow(d, i, isOffice())).join('')}</div>`).join('')
      : `<div class="empty"><b>No documents yet</b>${isOffice()
          ? 'Load the PMP, the scope and the job cards so the crew has them on site.'
          : 'The office has not put anything on this job yet.'}</div>`}

    ${docs.length ? `<div class="card">
      <button class="btn wide sm" id="register">${icon('printer')}Print the document register</button>
    </div>` : ''}`;

  $$('[data-dl]', view).forEach(b => b.onclick = () => {
    const d = docById(b.dataset.dl);
    if (d) downloadFile(d.file_url, d.file_name || d.title);
  });

  $$('[data-del]', view).forEach(b => b.onclick = async () => {
    const d = docById(b.dataset.del);
    if (!d) return;
    if (!confirm(`Remove "${d.title || d.file_name}" from this job?`)) return;
    await Store.remove('project_docs', d.id);
    toast('Removed');
    render();
  });

  const reg = $('#register', view);
  if (reg) reg.onclick = () => printDocRegister(p);
}

/* ================================================================
   Screen — add a document
   ================================================================ */
function renderUpload(view) {
  const p = jobById(jobIdFromPath());
  if (!p) { view.innerHTML = `<div class="empty"><b>Job not found</b></div>`; return; }
  $('#title').textContent = 'Add document';

  const picked = [];

  view.innerHTML = `
    <div class="card">
      <div class="tiny muted">${jobNo(p)}</div>
      <h2 style="margin-top:2px">${esc(p.name)}</h2>
    </div>

    <div class="card">
      <input type="file" id="files" multiple hidden>
      <button class="btn wide" id="pick" type="button">${icon('clip')}Choose files</button>
      <p class="muted tiny center mt" style="margin-bottom:0">PDFs, Word, Excel, photos — anything.
      Several at once is fine.</p>
      <div id="picked" class="mt"></div>
    </div>

    <div class="card">
      <p class="muted tiny" id="applies" hidden></p>
      <label class="field"><span>What is it?</span>
        <select id="kind">
          ${DOC_KINDS.map(k => `<option value="${k.key}">${esc(k.label)}</option>`).join('')}
        </select></label>

      <label class="field"><span>Title <span class="muted">(optional — the file name is used otherwise)</span></span>
        <input type="text" id="title" placeholder="e.g. PMP Rev C"></label>

      <label class="field"><span>Who is it for?</span>
        <select id="audience">
          ${AUDIENCES.filter(a => isOffice() || a.key !== 'office')
            .map(a => `<option value="${a.key}">${esc(a.label)} — ${esc(a.hint)}</option>`).join('')}
        </select></label>

      <label class="field"><span>Note for whoever opens it</span>
        <textarea id="notes" placeholder="e.g. Revision C — supersedes the one issued Monday"></textarea></label>
    </div>

    <button class="btn primary wide" id="save">Add to job</button>
    <p class="muted small center mt">With no signal the file is held on this phone and sent
    the moment there is coverage.</p>`;

  const input = $('#files', view);
  $('#pick', view).onclick = () => input.click();
  input.onchange = async () => {
    for (const f of Array.from(input.files || [])) picked.push(await compressImage(f));
    input.value = '';
    paint();
  };
  function paint() {
    $('#picked', view).innerHTML = picked.length
      ? picked.map((f, i) => `
          <div class="filerow" style="--i:${i}">
            <div class="fi">${esc(fileTag({ file_name: f.name, file_type: f.type }))}</div>
            <div class="fb"><div class="ft">${esc(f.name)}</div>
              <div class="fm">${esc(fileSizeText(f.size))}</div></div>
            <div class="fa"><button data-rm="${i}" title="Remove">${icon('trash')}</button></div>
          </div>`).join('')
      : '';
    $$('[data-rm]', view).forEach(b => b.onclick = () => { picked.splice(Number(b.dataset.rm), 1); paint(); });
    const applies = $('#applies', view);
    applies.hidden = picked.length < 2;
    applies.textContent = `These details apply to all ${picked.length} files. Add them separately if they aren't the same sort of thing.`;
  }

  $('#save', view).onclick = async function () {
    if (!picked.length) return toast('Choose a file first');
    this.disabled = true;
    this.textContent = 'Adding…';
    const kind = $('#kind', view).value;
    const audience = $('#audience', view).value;
    const notes = $('#notes', view).value.trim();
    const title = $('#title', view).value.trim();
    try {
      for (let i = 0; i < picked.length; i++) {
        // One title only makes sense for one file; the rest keep their names.
        await addDoc(p.id, {
          kind, audience, notes,
          title: picked.length === 1 ? (title || picked[i].name) : picked[i].name
        }, picked[i]);
      }
      toast(connected() ? 'Added to the job' : 'Held on this phone until there is signal');
      go('#/docs/' + p.id);
    } catch (err) {
      this.disabled = false;
      this.textContent = 'Add to job';
      toast('Could not save: ' + err.message);
    }
  };
}

/* ================================================================
   Screen — the job diary
   Every day the crew is on site, in the order it happened.
   ================================================================ */
function diaryItem(e, i) {
  const files = Array.isArray(e.files) ? e.files : [];
  const photos = files.filter(f => /^image\//.test(f.type || ''));
  const others = files.filter(f => !/^image\//.test(f.type || ''));
  const pending = files.some(f => f.pending);
  return `
    <div class="d-item ${entryMarked(e) ? 'mark' : ''} status-${entryTone(e)}" data-id="${e.id}" style="--i:${i}">
      <div class="dt">${esc(fmtTime(e.at))}</div>
      <div class="db">
        <div class="dk">${esc(entryLabel(e))}</div>
        ${e.body ? `<div class="dn">${esc(e.body)}</div>` : ''}
        ${photos.length ? `<div class="thumbs">${photos.map(f =>
          `<a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt=""></a>`).join('')}</div>` : ''}
        ${others.map(f => `<a class="attach" href="${esc(f.url)}" target="_blank" rel="noopener">${icon('clip')}${esc(f.name || 'Attachment')}</a>`).join('')}
        <div class="dw">${esc(e.author || 'Unknown')}${e.role && e.role !== 'supervisor' ? ' · ' + esc(roleLabel(e.role)) : ''}${
          pending ? ' · photos waiting for signal' : ''}</div>
      </div>
    </div>`;
}

function renderDiary(view) {
  const p = jobById(jobIdFromPath());
  if (!p) { view.innerHTML = `<div class="empty"><b>Job not found</b></div>`; return; }
  $('#title').textContent = 'Job diary';

  const days = diaryDays(p.id);
  const closed = p.status === 'completed';
  const quick = ENTRY_TYPES.filter(t => t.quick);

  view.innerHTML = `
    ${jobHeader(p, 'diary')}

    ${closed ? '<div class="banner info">This job is completed — the diary is closed and kept as it is.</div>' : `
      <div class="card">
        <h2>Log something now</h2>
        <div class="quick">
          ${quick.map(t => `<button data-kind="${t.key}" class="status-${t.tone}">
            <span class="swatch"></span>${esc(t.label)}</button>`).join('')}
        </div>
        <a class="btn wide mt" href="#/entry/${p.id}">${icon('plus')}Something else…</a>
      </div>`}

    ${days.length ? days.map(day => {
      const list = entriesFor(p.id, day);
      const span = shiftSpan(list);
      return `
        <div class="dayhead">
          <h3>${esc(fmtDayDate(day))}</h3>
          <span class="sub">${list.length} entr${list.length > 1 ? 'ies' : 'y'}${span ? ' · ' + esc(span) + ' on site' : ''}</span>
        </div>
        <div class="card">
          <div class="diary">${list.map(diaryItem).join('')}</div>
          <div class="btn-row mt">
            <button class="btn sm" data-day="${day}">${icon('printer')}Print this day</button>
          </div>
        </div>`;
    }).join('') : `<div class="empty"><b>Nothing logged yet</b>The first entry starts the job.</div>`}`;

  $$('.quick button', view).forEach(b => b.onclick = () => go(`#/entry/${p.id}?kind=${encodeURIComponent(b.dataset.kind)}`));
  $$('[data-day]', view).forEach(b => b.onclick = () => printDayReport(p, b.dataset.day));
  $$('.d-item', view).forEach(el => el.onclick = ev => {
    if (ev.target.closest('a')) return;   // opening a photo isn't editing
    go(`#/entry/${p.id}?edit=${el.dataset.id}`);
  });
}

/* ================================================================
   Screen — add or edit one diary entry
   ================================================================ */
function renderEntry(view) {
  const p = jobById(jobIdFromPath());
  if (!p) { view.innerHTML = `<div class="empty"><b>Job not found</b></div>`; return; }

  const editing = route.query.edit ? entryById(route.query.edit) : null;
  $('#title').textContent = editing ? 'Edit entry' : 'Diary entry';

  if (p.status === 'completed' && !isOffice()) {
    view.innerHTML = `<div class="card"><h2>This job is completed</h2>
      <p class="muted small">The diary is closed. Ask the office if something needs adding.</p>
      <a class="btn wide mt" href="#/diary/${p.id}">Back to the diary</a></div>`;
    return;
  }

  const types = allEntryTypes();
  const wanted = editing ? editing.kind : (route.query.kind || 'note');
  const files = [];
  const defDate = editing ? editing.entry_date : defaultShiftDate(p.id);
  const nightRoll = !editing && defDate !== today();

  view.innerHTML = `
    <div class="card">
      <div class="tiny muted">${jobNo(p)} · ${esc(p.name)}</div>
      <label class="field mt"><span>What happened?</span>
        <select id="kind">
          ${types.map(t => `<option value="${esc(t.key)}" ${t.key === wanted ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          <option value="__new">+ Add a new type…</option>
        </select></label>

      <div class="row">
        <label class="field grow"><span>${nightRoll ? 'Shift that started' : 'Date'}</span>
          <input type="date" id="date" value="${esc(defDate)}"></label>
        <label class="field grow"><span>Time</span>
          <input type="text" id="time" value="${esc(editing ? fmtTime(editing.at) : nowTime())}"
            placeholder="07:15" inputmode="numeric" maxlength="5"></label>
      </div>

      ${nightRoll ? `<p class="muted tiny" style="margin-top:-6px">You're on last night's shift, so this
      goes under ${esc(fmtDayDate(defDate))}. Change the date if that's not right.</p>` : ''}

      <label class="field"><span>Comment</span>
        <textarea id="body" placeholder="What happened, what was decided, anything worth remembering.">${esc(editing ? editing.body : '')}</textarea></label>
    </div>

    <div class="card">
      <h2>Photos</h2>
      <input type="file" id="photos" accept="image/*" multiple hidden>
      <button class="btn wide" id="addPhoto" type="button">${icon('camera')}Add photos</button>
      <div class="thumbs" id="thumbs"></div>
      ${editing && (editing.files || []).length
        ? `<p class="muted tiny mt" style="margin-bottom:0">${(editing.files || []).length} photo(s) already on this entry.
           New ones are added alongside them.</p>` : ''}
    </div>

    <button class="btn primary wide" id="save">${editing ? 'Save changes' : 'Add to diary'}</button>
    ${editing ? `<button class="btn danger wide mt" id="del">Delete this entry</button>` : ''}
    <p class="muted small center mt">${p.status === 'planned'
      ? 'The first entry marks the job as started.'
      : 'Entries save on the phone straight away, with or without signal.'}</p>`;

  // "+ Add a new type…" becomes a real, immediately usable type.
  const kindSel = $('#kind', view);
  let customLabel = editing && !builtinEntry(editing.kind) ? editing.label : '';
  kindSel.onchange = () => {
    if (kindSel.value !== '__new') return;
    const name = (prompt('Name the new type of entry, e.g. "Emulsion spray started"') || '').trim();
    if (!name) { kindSel.value = wanted; return; }
    const key = slug(name);
    const existing = allEntryTypes().find(t => t.key === key);
    customLabel = existing ? existing.label : name;
    if (!existing) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = name;
      kindSel.insertBefore(opt, kindSel.lastElementChild);
    }
    kindSel.value = key;
  };

  const input = $('#photos', view);
  $('#addPhoto', view).onclick = () => input.click();
  input.onchange = async () => {
    for (const f of Array.from(input.files || [])) files.push(await compressImage(f));
    input.value = '';
    paintThumbs();
  };
  function paintThumbs() {
    const box = $('#thumbs', view);
    box.innerHTML = '';
    files.forEach((f, i) => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.title = 'Tap to remove';
      img.onclick = () => { files.splice(i, 1); paintThumbs(); };
      box.appendChild(img);
    });
  }

  $('#save', view).onclick = async function () {
    const kind = kindSel.value;
    if (kind === '__new') return toast('Pick what happened');
    const time = $('#time', view).value.trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) return toast('Time should look like 07:15');
    const date = $('#date', view).value || today();
    const body = $('#body', view).value.trim();
    const b = builtinEntry(kind);
    const label = b ? b.label : (customLabel || humanise(kind));

    this.disabled = true;
    this.textContent = 'Saving…';
    try {
      if (editing) {
        const uploads = (editing.files || []).slice();
        for (const f of files) uploads.push(await Store.upload(f));
        await Store.patch('diary_entries', editing.id, {
          kind, label, body, entry_date: date, at: stamp(date, time), files: uploads
        });
        toast('Entry updated');
      } else {
        await addEntry(p.id, { kind, label, body, entry_date: date, at: stamp(date, time) }, files);
        toast(connected() ? 'Added to the diary' : 'Saved on this phone');
      }
      go('#/diary/' + p.id);
    } catch (err) {
      this.disabled = false;
      this.textContent = editing ? 'Save changes' : 'Add to diary';
      toast('Could not save: ' + err.message);
    }
  };

  const del = $('#del', view);
  if (del) del.onclick = async () => {
    if (!confirm('Delete this diary entry? It is gone for everyone.')) return;
    await Store.remove('diary_entries', editing.id);
    toast('Deleted');
    go('#/diary/' + p.id);
  };
}

/* ================================================================
   Screen — create or edit a job (office)
   ================================================================ */
/** A money box left empty means "not known", which is a null, not a zero. */
function moneyField(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function renderJobEdit(view) {
  const editing = route.path.startsWith('/edit/') ? jobById(jobIdFromPath()) : null;
  if (route.path.startsWith('/edit/') && !editing) {
    view.innerHTML = `<div class="empty"><b>Job not found</b></div>`;
    return;
  }
  if (!isOffice()) {
    view.innerHTML = `
      <div class="card">
        <h2>Office only</h2>
        <p class="muted small">Jobs are planned and edited from an <strong>Office</strong> or
        <strong>Director</strong> device. This phone is set to <strong>Supervisor</strong> — you can
        run any job that is dispatched to you, keep its diary and read its paperwork.</p>
        <a class="btn wide mt" href="#/">Back to the jobs</a>
        <a class="btn wide mt" href="#/setup">Change this device's role</a>
      </div>`;
    return;
  }
  $('#title').textContent = editing ? 'Edit job' : 'New job';

  const p = editing || {};
  const keys = allTypeKeys();
  const cur = editing ? typeOf(editing) : 'milling';

  // Everyone who has been named as a supervisor before, so the office picks
  // rather than retypes — and can still type someone new.
  const names = Array.from(new Set(DB.projects.map(x => (x.supervisor || '').trim()).filter(Boolean))).sort();

  view.innerHTML = `
    <div class="card">
      <label class="field"><span>Job name</span>
        <input type="text" id="name" value="${esc(p.name || '')}" placeholder="e.g. Great South Rd resurfacing" maxlength="140"></label>

      <label class="field"><span>Client</span>
        <input type="text" id="client" value="${esc(p.client || '')}" placeholder="e.g. Auckland Transport"></label>

      <label class="field"><span>Site</span>
        <input type="text" id="site" value="${esc(p.site || '')}" placeholder="Address, or the stretch of road"></label>

      <label class="field"><span>Type of work</span>
        <select id="type">
          ${keys.map(k => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(typeLabel(k))}</option>`).join('')}
          <option value="__new">+ Add a new type…</option>
        </select></label>

      <label class="field"><span>Scope — what the crew is doing</span>
        <textarea id="desc" placeholder="A sentence or two. The full scope goes on as a document.">${esc(p.description || '')}</textarea></label>
    </div>

    <div class="card">
      <h2>When and who</h2>
      <div class="row">
        <label class="field grow"><span>First day on site</span>
          <input type="date" id="start" value="${esc(p.start_date || '')}"></label>
        <label class="field grow"><span>Last day (planned)</span>
          <input type="date" id="end" value="${esc(p.end_date || '')}"></label>
      </div>

      <label class="field"><span>Supervisor on site</span>
        <input type="text" id="super" value="${esc(p.supervisor || '')}" placeholder="Name" list="supers">
        <datalist id="supers">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></label>

      <label class="field"><span>Client contact <span class="muted">(optional)</span></span>
        <input type="text" id="contact" value="${esc(p.contact || '')}" placeholder="Name and phone"></label>
    </div>

    <div class="card">
      <h2>Value and cost</h2>
      <p class="muted small">Never shown on a site phone. Leave either blank until somebody
      knows the number — a margin is only worked out when both are filled in.</p>
      <div class="row">
        <label class="field grow"><span>Contract value (excl. GST)</span>
          <input type="number" id="value" inputmode="decimal" step="0.01" min="0"
            value="${esc(hasMoney(p.contract_value) ? p.contract_value : '')}" placeholder="e.g. 84000"></label>
        <label class="field grow"><span>Cost to RCK</span>
          <input type="number" id="cost" inputmode="decimal" step="0.01" min="0"
            value="${esc(hasMoney(p.actual_cost) ? p.actual_cost : '')}" placeholder="e.g. 61500"></label>
      </div>
    </div>

    ${editing ? `
    <div class="card">
      <label class="field"><span>Status</span>
        <select id="status">
          ${JOB_STATUS.map(s => `<option value="${s.key}" ${p.status === s.key ? 'selected' : ''}>${esc(s.label)} — ${esc(s.blurb)}</option>`).join('')}
        </select></label>
    </div>` : ''}

    <button class="btn primary wide" id="save">${editing ? 'Save job' : 'Create job'}</button>
    ${editing ? '' : '<p class="muted small center mt">It starts as <strong>Planned</strong>. Load the paperwork onto it next.</p>'}`;

  // "+ Add a new type…" turns into a real type the moment it is named.
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
      description: $('#desc', view).value.trim(),
      start_date: start,
      end_date: end,
      supervisor: $('#super', view).value.trim(),
      contact: $('#contact', view).value.trim(),
      contract_value: moneyField($('#value', view).value),
      actual_cost: moneyField($('#cost', view).value)
    };

    this.disabled = true;
    this.textContent = 'Saving…';
    try {
      if (editing) {
        const statusSel = $('#status', view);
        if (statusSel) {
          data.status = statusSel.value;
          if (data.status === 'ongoing' && !editing.started_at) {
            data.started_at = new Date().toISOString();
            data.started_by = whoami();
          }
          if (data.status === 'completed' && !editing.completed_at) {
            data.completed_at = new Date().toISOString();
            data.completed_by = whoami();
          }
        }
        await Store.patch('projects', editing.id, data);
        toast('Saved');
        go('#/job/' + editing.id);
      } else {
        const saved = await createJob(data);
        toast(connected() ? 'Job created' : 'Saved on this device');
        go('#/job/' + saved.id);
      }
    } catch (err) {
      this.disabled = false;
      this.textContent = editing ? 'Save job' : 'Create job';
      toast('Could not save: ' + err.message);
    }
  };
}

/* ================================================================
   Screen — the director's overview
   Every job at once over a period: what the crews did, what went wrong,
   and what it was worth. Everything on it is added up from what the
   supervisors and the office entered on the jobs themselves — nothing
   here is typed twice.
   ================================================================ */
const overview = { period: 'month', from: '', to: '', sort: 'value' };

function overviewRange() {
  if (overview.period === 'custom') return [overview.from, overview.to];
  return periodRange(overview.period);
}

function renderOverview(view) {
  if (!isDirector()) {
    view.innerHTML = `
      <div class="card">
        <h2>Director only</h2>
        <p class="muted small">The overview across every job — days on site, issues, value and
        margin over a period — is for devices set to <strong>Director</strong>. Everything it adds
        up is on the jobs themselves, which you can already see.</p>
        <a class="btn wide mt" href="#/reports">Open reports</a>
      </div>`;
    return;
  }

  const [from, to] = overviewRange();
  const list = DB.projects.filter(p => jobInPeriod(p, from, to));
  const t = periodTotals(list);

  const sorters = {
    value:  (a, b) => (Number(b.contract_value) || -1) - (Number(a.contract_value) || -1),
    margin: (a, b) => ((jobMargin(b) == null ? -Infinity : jobMargin(b)) - (jobMargin(a) == null ? -Infinity : jobMargin(a))),
    days:   (a, b) => diaryDays(b.id).length - diaryDays(a.id).length,
    issues: (a, b) => issueCount(b.id) - issueCount(a.id)
  };
  const sorted = list.slice().sort(sorters[overview.sort] || sorters.value);

  view.innerHTML = `
    <div class="filters" id="periodChips">
      ${PERIODS.map(x => `<button class="chip" data-period="${x.key}"
        aria-pressed="${overview.period === x.key}">${esc(x.label)}</button>`).join('')}
      <button class="chip" data-period="custom" aria-pressed="${overview.period === 'custom'}">Pick dates</button>
    </div>

    ${overview.period === 'custom' ? `
      <div class="card">
        <div class="row">
          <label class="field grow"><span>From</span><input type="date" id="from" value="${esc(overview.from)}"></label>
          <label class="field grow"><span>To</span><input type="date" id="to" value="${esc(overview.to)}"></label>
        </div>
      </div>` : ''}

    <p class="muted small mb">${esc(periodLabel(overview.period, from, to))}</p>

    <div class="card">
      <div class="stat">
        <div><span class="n">${t.jobs}</span><span class="l">Jobs</span></div>
        <div><span class="n">${t.days}</span><span class="l">Days on site</span></div>
        <div><span class="n">${t.entries}</span><span class="l">Diary entries</span></div>
        <div><span class="n" style="color:${t.issues ? 'var(--red)' : 'inherit'}">${t.issues}</span><span class="l">Issues</span></div>
      </div>
    </div>

    <div class="card">
      <h2>Value and margin</h2>
      <div class="stat">
        <div><span class="n" style="font-size:19px">${esc(fmtMoney(t.value))}</span><span class="l">Contract value</span></div>
        <div><span class="n" style="font-size:19px">${esc(fmtMoney(t.cost))}</span><span class="l">Cost</span></div>
        <div><span class="n" style="font-size:19px;color:${t.margin == null ? 'inherit' : t.margin < 0 ? 'var(--red)' : 'var(--green)'}">${
          t.margin == null ? '—' : esc(fmtMoney(t.margin))}</span><span class="l">Margin${
          t.marginPct != null ? ' · ' + t.marginPct.toFixed(1) + '%' : ''}</span></div>
      </div>
      ${t.valued < t.jobs || t.costed < t.jobs ? `<p class="muted tiny mt" style="margin-bottom:0">
        Value is filled in on ${t.valued} of ${t.jobs} job(s), cost on ${t.costed}. The totals only
        count the jobs that carry the number, so they are a floor, not the whole picture.</p>` : ''}
    </div>

    <div class="filters" id="sortChips">
      ${[['value','By value'],['margin','By margin'],['days','By days on site'],['issues','By issues']]
        .map(([k, l]) => `<button class="chip" data-sort="${k}" aria-pressed="${overview.sort === k}">${l}</button>`).join('')}
    </div>

    ${sorted.length ? sorted.map((p, i) => {
      const m = jobMargin(p), days = diaryDays(p.id).length, iss = issueCount(p.id);
      const pct = marginPct(p.contract_value, m);
      return `
        <button class="job-row status-${statusTone(p.status)}" data-id="${p.id}" style="--i:${i}">
          <div class="hdr">
            <span class="num">${jobNo(p)}</span>
            <span class="pill"><span class="swatch"></span>${statusLabel(p.status)}</span>
            ${p.archived ? '<span class="pill plain">Archived</span>' : ''}
          </div>
          <div class="ttl">${esc(p.name)}</div>
          <div class="sub">
            ${p.client ? `<span>${esc(p.client)}</span>` : ''}
            ${p.supervisor ? `<span>${esc(p.supervisor)}</span>` : ''}
            <span>${days} day${days === 1 ? '' : 's'} on site</span>
            ${iss ? `<span class="overdue">${iss} issue${iss > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="sub">
            <span><strong>${esc(fmtMoney(p.contract_value))}</strong> value</span>
            <span>${esc(fmtMoney(p.actual_cost))} cost</span>
            ${m != null ? `<span style="color:${m < 0 ? 'var(--red)' : 'var(--green)'};font-weight:640">${
              esc(fmtMoney(m))}${pct != null ? ' · ' + pct.toFixed(1) + '%' : ''}</span>` : ''}
          </div>
        </button>`;
    }).join('') : '<div class="empty"><b>No jobs in this period</b>Try a wider one.</div>'}

    <div class="card">
      <button class="btn wide" id="print">${icon('printer')}Print the director's report</button>
      <p class="muted tiny center mt" style="margin-bottom:0">Every job in the period, plus every issue
      and delay the supervisors logged.</p>
    </div>`;

  $$('#periodChips .chip', view).forEach(b => b.onclick = () => {
    overview.period = b.dataset.period;
    if (overview.period === 'custom' && !overview.from && !overview.to) {
      const [f, t2] = periodRange('month');
      overview.from = f; overview.to = t2;
    }
    render();
  });
  $$('#sortChips .chip', view).forEach(b => b.onclick = () => { overview.sort = b.dataset.sort; render(); });

  const f = $('#from', view), t2 = $('#to', view);
  if (f) f.onchange = () => { overview.from = f.value; render(); };
  if (t2) t2.onchange = () => { overview.to = t2.value; render(); };

  $$('.job-row', view).forEach(b => b.onclick = () => go('#/job/' + b.dataset.id));
  $('#print', view).onclick = () => printDirectorReport(from, to);
}

/* ================================================================
   Screen — reports
   ================================================================ */
function renderReports(view) {
  const jobs = boardOrder(DB.projects.slice());

  view.innerHTML = `
    <div class="card">
      <h2>One job, start to finish</h2>
      <p class="muted small">Everything on a job: the details, the documents on file, and every day of
      the diary with its photos. This is the record you send the client.</p>
      <label class="field"><span>Job</span>
        <select id="job">
          ${jobs.map(p => `<option value="${p.id}">${esc(jobNo(p))} — ${esc(p.name)}${p.archived ? ' (archived)' : ''}</option>`).join('')
            || '<option value="">No jobs yet</option>'}
        </select></label>
      <div class="btn-row">
        <button class="btn primary" id="full">${icon('printer')}Full job report</button>
        <button class="btn" id="reg">${icon('printer')}Documents only</button>
      </div>
    </div>

    <div class="card">
      <h2>Jobs over a period</h2>
      <p class="muted small">Every job that ran between two dates, with its days on site,
      issues raised and how it finished.</p>
      <div class="row">
        <label class="field grow"><span>From</span><input type="date" id="from"></label>
        <label class="field grow"><span>To</span><input type="date" id="to"></label>
      </div>
      <button class="btn wide" id="period">${icon('printer')}Print jobs summary</button>
    </div>

    ${isDirector() ? `
    <div class="card">
      <h2>Across every job</h2>
      <p class="muted small">The overview: days on site, issues, value and margin over a period,
      added up from what the crews and the office entered on the jobs themselves.</p>
      <a class="btn primary wide" href="#/overview">Open the director's overview</a>
    </div>` : ''}

    <div class="card">
      <h2>For Excel</h2>
      <p class="muted small">A spreadsheet of jobs, or of every diary entry ever written.</p>
      <div class="btn-row">
        <button class="btn sm" id="csvJobs">Jobs CSV</button>
        <button class="btn sm" id="csvDiary">Diary CSV</button>
      </div>
    </div>

    <p class="muted small center">Reports open your device's print dialog — choose
    <strong>Save as PDF</strong> to email or file it.</p>`;

  const pick = () => jobById($('#job', view).value);

  $('#full', view).onclick = () => { const p = pick(); p ? printJobReport(p) : toast('No job selected'); };
  $('#reg', view).onclick  = () => { const p = pick(); p ? printDocRegister(p) : toast('No job selected'); };
  $('#period', view).onclick = () => printJobsSummary($('#from', view).value, $('#to', view).value);
  $('#csvJobs', view).onclick = exportJobsCsv;
  $('#csvDiary', view).onclick = exportDiaryCsv;
}

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv(name, rows) {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Downloaded');
}

function exportJobsCsv() {
  const money = isOffice();     // a site phone exports a spreadsheet without the money in it
  const rows = [['Job', 'Name', 'Client', 'Site', 'Type of work', 'Status', 'First day',
    'Last day', 'Supervisor', 'Started', 'Completed', 'Days on site', 'Diary entries',
    'Issues', 'Documents', 'Closing note']
    .concat(money ? ['Contract value', 'Cost', 'Margin'] : [])];
  boardOrder(DB.projects.slice()).forEach(p => rows.push([
    jobNo(p), p.name, p.client, p.site, typeLabel(typeOf(p)), statusLabel(p.status),
    p.start_date || '', p.end_date || '', p.supervisor,
    p.started_at ? fmtDate(p.started_at) : '', p.completed_at ? fmtDate(p.completed_at) : '',
    diaryDays(p.id).length, entriesFor(p.id).length, issueCount(p.id), allDocsFor(p.id).length,
    p.completion_notes || ''
  ].concat(money ? [
    hasMoney(p.contract_value) ? Number(p.contract_value) : '',
    hasMoney(p.actual_cost) ? Number(p.actual_cost) : '',
    jobMargin(p) == null ? '' : jobMargin(p)
  ] : [])));
  downloadCsv('rck-jobs.csv', rows);
}

function exportDiaryCsv() {
  const rows = [['Job', 'Job name', 'Date', 'Time', 'Entry', 'Comment', 'Photos', 'By']];
  DB.diary_entries.slice()
    .sort((a, b) => (a.at || '').localeCompare(b.at || ''))
    .forEach(e => {
      const p = jobById(e.project_id) || {};
      rows.push([jobNo(p), p.name || '', e.entry_date || '', fmtTime(e.at),
        entryLabel(e), e.body || '', (e.files || []).length, e.author || '']);
    });
  downloadCsv('rck-job-diary.csv', rows);
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
      new Promise(res => setTimeout(res, 8000))
    ]);
  }
  setTimeout(() => window.print(), 80);
}

function jobFacts(p) {
  return `
    <table class="kv">
      <tr><td>Job number</td><td><strong>${jobNo(p)}</strong></td></tr>
      <tr><td>Client</td><td>${esc(p.client || '—')}</td></tr>
      <tr><td>Site</td><td>${esc(p.site || '—')}</td></tr>
      <tr><td>Type of work</td><td>${esc(typeLabel(typeOf(p)))}</td></tr>
      <tr><td>Status</td><td><span class="badge">${esc(statusLabel(p.status).toUpperCase())}</span></td></tr>
      <tr><td>Planned dates</td><td>${p.start_date ? fmtDate(p.start_date) : 'not set'}${
        p.end_date && p.end_date !== p.start_date ? ' to ' + fmtDate(p.end_date) : ''}</td></tr>
      <tr><td>Supervisor</td><td>${esc(p.supervisor || '—')}</td></tr>
      ${p.contact ? `<tr><td>Client contact</td><td>${esc(p.contact)}</td></tr>` : ''}
      ${p.started_at ? `<tr><td>Started on site</td><td>${fmtDateTime(p.started_at)}${p.started_by ? ' · ' + esc(p.started_by) : ''}</td></tr>` : ''}
      ${p.completed_at ? `<tr><td>Completed</td><td>${fmtDateTime(p.completed_at)}${p.completed_by ? ' · ' + esc(p.completed_by) : ''}</td></tr>` : ''}
      <tr><td>Days on site</td><td>${diaryDays(p.id).length}</td></tr>
    </table>
    ${p.description ? `<p class="note">${esc(p.description)}</p>` : ''}`;
}

/** One day of the diary, laid out as a table with the photos underneath. */
function daySection(p, day, withPhotos) {
  const list = entriesFor(p.id, day);
  if (!list.length) return '';
  const first = list[0], last = list[list.length - 1];
  const span = shiftSpan(list);
  const photos = [];
  list.forEach(e => (e.files || []).forEach(f => {
    if (/^image\//.test(f.type || '')) photos.push({ f, e });
  }));

  return `
    <h2>${esc(fmtDayDate(day))}${span ? ` <span style="font-weight:400;font-size:10pt">— ${esc(fmtTime(first.at))} to ${esc(fmtTime(last.at))}, ${esc(span)} on site</span>` : ''}</h2>
    <table>
      <tr><th style="width:18mm">Time</th><th style="width:42mm">Entry</th><th>Comment</th><th style="width:28mm">By</th></tr>
      ${list.map(e => `<tr class="avoid-break">
        <td>${esc(fmtTime(e.at))}</td>
        <td><strong>${esc(entryLabel(e))}</strong></td>
        <td class="note">${esc(e.body || '')}${(e.files || []).length
          ? `<br><em>${(e.files || []).length} photo(s) attached</em>` : ''}</td>
        <td>${esc(e.author || '')}</td>
      </tr>`).join('')}
    </table>
    ${withPhotos && photos.length ? `
      <div style="display:flex;flex-wrap:wrap;gap:4mm;margin-bottom:4mm">
        ${photos.map(({ f, e }) => `
          <div class="avoid-break" style="width:80mm">
            <img src="${esc(f.url)}" style="width:100%;border:.6pt solid #999">
            <div style="font-size:9pt;color:#444">${esc(fmtTime(e.at))} ${esc(entryLabel(e))}${
              e.body ? ' — ' + esc(e.body.slice(0, 90)) : ''}</div>
          </div>`).join('')}
      </div>` : ''}`;
}

function docsTable(p, all) {
  const list = (all ? allDocsFor(p.id) : docsFor(p.id))
    .slice().sort((a, b) => (a.uploaded_at || '').localeCompare(b.uploaded_at || ''));
  if (!list.length) return '<p>No documents on file.</p>';
  return `
    <table>
      <tr><th style="width:34mm">What</th><th>Title</th><th style="width:26mm">For</th><th style="width:34mm">Loaded by</th></tr>
      ${list.map(d => `<tr class="avoid-break">
        <td>${esc(docKindLabel(d.kind))}</td>
        <td>${esc(d.title || d.file_name)}${d.notes ? `<br><em>${esc(d.notes)}</em>` : ''}</td>
        <td>${esc(audienceLabel(d.audience))}</td>
        <td>${esc(d.uploaded_by || '')}<br>${esc(fmtDate(d.uploaded_at))}</td>
      </tr>`).join('')}
    </table>`;
}

function printJobReport(p) {
  const days = diaryDays(p.id).slice().sort();
  const entries = entriesFor(p.id);
  const issues = entries.filter(e => e.kind === 'issue' || e.kind === 'delay');

  printDoc(`
    ${docHead('Job report — ' + jobNo(p), p.name)}

    <h2>The job</h2>
    ${jobFacts(p)}

    <h2>Summary</h2>
    <table class="kv">
      <tr><td>Days on site</td><td>${days.length}</td></tr>
      <tr><td>Diary entries</td><td>${entries.length}</td></tr>
      <tr><td>Issues and delays</td><td>${issues.length}</td></tr>
      <tr><td>Documents on file</td><td>${(isOffice() ? allDocsFor(p.id) : docsFor(p.id)).length}</td></tr>
      ${p.started_at && p.completed_at
        ? `<tr><td>Elapsed</td><td>${(daysBetween(p.started_at, p.completed_at) || 0) + 1} day(s)</td></tr>` : ''}
    </table>
    ${p.completion_notes ? `<p class="note"><strong>On completion:</strong> ${esc(p.completion_notes)}</p>` : ''}

    ${issues.length ? `
      <h2>Issues and delays</h2>
      <table>
        <tr><th style="width:26mm">Date</th><th style="width:16mm">Time</th><th>What happened</th><th style="width:28mm">Raised by</th></tr>
        ${issues.map(e => `<tr class="avoid-break">
          <td>${esc(fmtShort(e.entry_date))}</td><td>${esc(fmtTime(e.at))}</td>
          <td class="note"><strong>${esc(entryLabel(e))}</strong>${e.body ? ' — ' + esc(e.body) : ''}</td>
          <td>${esc(e.author || '')}</td></tr>`).join('')}
      </table>` : ''}

    <h2>Documents on file</h2>
    ${docsTable(p, isOffice())}

    ${days.length
      ? days.map(d => daySection(p, d, true)).join('')
      : '<h2>Job diary</h2><p>No diary entries were recorded.</p>'}

    <div class="sig">
      <div>Supervisor &amp; date</div>
      <div>Office sign-off &amp; date</div>
    </div>`);
}

function printDayReport(p, day) {
  printDoc(`
    ${docHead('Daily job diary — ' + jobNo(p), `${p.name} · ${fmtDayDate(day)}`)}
    <h2>The job</h2>
    ${jobFacts(p)}
    ${daySection(p, day, true) || '<p>No entries on this day.</p>'}
    <div class="sig">
      <div>Supervisor &amp; date</div>
      <div>Office sign-off &amp; date</div>
    </div>`);
}

function printDocRegister(p) {
  printDoc(`
    ${docHead('Document register — ' + jobNo(p), p.name)}
    <h2>The job</h2>
    ${jobFacts(p)}
    <h2>Documents on file</h2>
    ${docsTable(p, isOffice())}`);
}

/** The director's report: the period's numbers, every job in it, and every
    issue and delay the crews logged — the supervisors' and the office's own
    entries added up, rather than a separate thing anyone has to write. */
function printDirectorReport(from, to) {
  const list = DB.projects.filter(p => jobInPeriod(p, from, to));
  const t = periodTotals(list);
  const sorted = list.slice().sort((a, b) => (Number(b.contract_value) || -1) - (Number(a.contract_value) || -1));

  const inRange = d => !!d && (!from || d >= from) && (!to || d <= to);
  const troubles = [];
  list.forEach(p => entriesFor(p.id).forEach(e => {
    if ((e.kind === 'issue' || e.kind === 'delay') && inRange(e.entry_date)) troubles.push({ p, e });
  }));
  troubles.sort((a, b) => (a.e.entry_date || '').localeCompare(b.e.entry_date || ''));

  printDoc(`
    ${docHead('Director\'s report', periodLabel(overview.period, from, to))}

    <h2>The period</h2>
    <table class="kv">
      <tr><td>Jobs</td><td><strong>${t.jobs}</strong> — ${t.ongoing || 0} on site,
        ${t.planned || 0} planned, ${t.completed || 0} completed</td></tr>
      <tr><td>Days on site</td><td>${t.days}</td></tr>
      <tr><td>Diary entries</td><td>${t.entries}</td></tr>
      <tr><td>Issues and delays</td><td>${t.issues}</td></tr>
      <tr><td>Contract value</td><td><strong>${esc(fmtMoney(t.value))}</strong>${
        t.valued < t.jobs ? ` <em>(on ${t.valued} of ${t.jobs} jobs)</em>` : ''}</td></tr>
      <tr><td>Cost</td><td>${esc(fmtMoney(t.cost))}${
        t.costed < t.jobs ? ` <em>(on ${t.costed} of ${t.jobs} jobs)</em>` : ''}</td></tr>
      <tr><td>Margin</td><td><strong>${t.margin == null ? '—' : esc(fmtMoney(t.margin))}</strong>${
        t.marginPct != null ? ` · ${t.marginPct.toFixed(1)}%` : ''}</td></tr>
    </table>
    ${t.valued < t.jobs || t.costed < t.jobs
      ? `<p style="font-size:10pt;color:#444">Totals count only the jobs carrying a figure, so they
         are a floor rather than the whole picture.</p>` : ''}

    <h2>Jobs</h2>
    <table>
      <tr><th style="width:20mm">Job</th><th>Name and client</th><th style="width:22mm">Status</th>
        <th style="width:13mm">Days</th><th style="width:13mm">Iss.</th>
        <th style="width:24mm">Value</th><th style="width:24mm">Cost</th><th style="width:26mm">Margin</th></tr>
      ${sorted.map(p => {
        const m = jobMargin(p), pct = marginPct(p.contract_value, m);
        return `<tr class="avoid-break">
          <td><strong>${jobNo(p)}</strong></td>
          <td>${esc(p.name)}${p.client ? `<br><em>${esc(p.client)}</em>` : ''}${
            p.supervisor ? `<br>${esc(p.supervisor)}` : ''}</td>
          <td>${esc(statusLabel(p.status))}${p.archived ? '<br><em>archived</em>' : ''}</td>
          <td>${diaryDays(p.id).length}</td>
          <td>${issueCount(p.id) || ''}</td>
          <td>${esc(fmtMoney(p.contract_value))}</td>
          <td>${esc(fmtMoney(p.actual_cost))}</td>
          <td>${m == null ? '—' : esc(fmtMoney(m)) + (pct != null ? `<br><em>${pct.toFixed(1)}%</em>` : '')}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8">No jobs in this period.</td></tr>'}
    </table>

    <h2>What went wrong on site</h2>
    ${troubles.length ? `
      <table>
        <tr><th style="width:24mm">Date</th><th style="width:22mm">Job</th>
          <th>What happened</th><th style="width:26mm">Logged by</th></tr>
        ${troubles.map(({ p, e }) => `<tr class="avoid-break">
          <td>${esc(fmtShort(e.entry_date))} ${esc(fmtTime(e.at))}</td>
          <td>${jobNo(p)}</td>
          <td class="note"><strong>${esc(entryLabel(e))}</strong>${e.body ? ' — ' + esc(e.body) : ''}</td>
          <td>${esc(e.author || '')}</td>
        </tr>`).join('')}
      </table>`
      : '<p>Nothing was logged as an issue or a delay in this period.</p>'}

    <div class="sig">
      <div>Director &amp; date</div>
      <div>Reviewed &amp; date</div>
    </div>`);
}

function printJobsSummary(from, to) {
  const inRange = p => {
    const d = (p.start_date || (p.created_at || '').slice(0, 10) || '');
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };
  const list = boardOrder(DB.projects.filter(inRange));
  const span = from || to
    ? `${from ? fmtDate(from) : 'the beginning'} to ${to ? fmtDate(to) : 'today'}`
    : 'all jobs';

  printDoc(`
    ${docHead('Jobs summary', span)}
    <table>
      <tr><th style="width:22mm">Job</th><th>Name and site</th><th style="width:28mm">Type</th>
        <th style="width:24mm">Dates</th><th style="width:24mm">Status</th>
        <th style="width:16mm">Days</th><th style="width:16mm">Issues</th></tr>
      ${list.map(p => `<tr class="avoid-break">
        <td><strong>${jobNo(p)}</strong></td>
        <td>${esc(p.name)}${p.site ? `<br><em>${esc(p.site)}</em>` : ''}${
          p.supervisor ? `<br>${esc(p.supervisor)}` : ''}</td>
        <td>${esc(typeLabel(typeOf(p)))}</td>
        <td>${esc(fmtShort(p.start_date))}${p.end_date && p.end_date !== p.start_date ? '–' + esc(fmtShort(p.end_date)) : ''}</td>
        <td>${esc(statusLabel(p.status))}</td>
        <td>${diaryDays(p.id).length}</td>
        <td>${issueCount(p.id)}</td>
      </tr>`).join('') || '<tr><td colspan="7">No jobs in this period.</td></tr>'}
    </table>
    <p style="font-size:10pt;color:#444">${list.length} job(s).
    ${list.filter(p => p.status === 'ongoing').length} on site,
    ${list.filter(p => p.status === 'planned').length} planned,
    ${list.filter(p => p.status === 'completed').length} completed.</p>`);
}

/* ================================================================
   Screen — the office wall screen
   A board for the office wall: what is on site today, what each crew
   has logged, and what is coming up. Refreshes itself.
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
  } catch (e) { /* not allowed — the screen may sleep, nothing else breaks */ }
}

function renderKiosk(view) {
  const day = today();
  const jobs = activeJobs();
  const onSite = boardOrder(jobs.filter(p => p.status === 'ongoing'));
  const planned = boardOrder(jobs.filter(p => p.status === 'planned'));
  const dueNow = planned.filter(p => { const n = daysFromToday(p.start_date); return n != null && n <= 0; });
  const doneToday = jobs.filter(p => p.status === 'completed' && (p.completed_at || '').slice(0, 10) === day);

  // The last thing logged on any job today, newest first.
  const feed = shiftFeed(day, 14);

  const clock = new Date();
  const time = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;

  view.innerHTML = `
    <div class="k">
      <div class="k-head">
        <h1>RCK — today on site</h1>
        <div class="grow muted">${esc(fmtDayDate(day))}</div>
        <div class="k-clock">${time}</div>
      </div>

      <div class="k-tally">
        <div class="status-ongoing"><span class="n">${onSite.length}</span><span class="l">On site now</span></div>
        <div class="status-planned"><span class="n">${planned.length}${dueNow.length
          ? `<em>${dueNow.length} due</em>` : ''}</span><span class="l">Planned</span></div>
        <div class="status-completed"><span class="n">${doneToday.length}</span><span class="l">Finished today</span></div>
      </div>

      <div class="k-body">
        <div class="k-col">
          <h2>On site</h2>
          <div class="k-scroll">
            ${onSite.length ? onSite.slice(0, 9).map((p, i) => {
              const e = entriesFor(p.id, day);
              const last = e.length ? e[e.length - 1] : null;
              return `
                <div class="k-job status-ongoing" style="--i:${i}">
                  <div>
                    <div class="kcode">${jobNo(p)}</div>
                    <div class="kno">${esc(typeLabel(typeOf(p)).toUpperCase())}</div>
                  </div>
                  <div>
                    <div class="kttl">${esc(p.name)}</div>
                    <div class="kmeta">${esc(p.site || '—')}${p.supervisor ? ' · ' + esc(p.supervisor) : ''}</div>
                  </div>
                  <div class="keta">
                    ${last ? `<b>${esc(fmtTime(last.at))}</b>${esc(entryLabel(last))}`
                           : '<span class="late">nothing logged</span>'}
                  </div>
                </div>`;
            }).join('') : `
              <div class="k-allclear status-completed">
                <div class="big">No crews out</div>
                Nothing is running right now.
              </div>`}
            ${dueNow.length ? dueNow.slice(0, 3).map((p, i) => `
              <div class="k-job status-planned" style="--i:${onSite.length + i}">
                <div><div class="kcode">${jobNo(p)}</div><div class="kno">DUE TO START</div></div>
                <div><div class="kttl">${esc(p.name)}</div>
                  <div class="kmeta">${esc(p.site || '—')}${p.supervisor ? ' · ' + esc(p.supervisor) : ''}</div></div>
                <div class="keta"><b>${esc(fmtShort(p.start_date))}</b>${esc(startText(p.start_date).text)}</div>
              </div>`).join('') : ''}
          </div>
        </div>

        <div class="k-col">
          <h2>Logged today</h2>
          <div class="k-scroll k-grid" style="grid-template-columns:1fr">
            ${feed.length ? feed.map((e, i) => {
              const p = jobById(e.project_id) || {};
              return `
                <div class="k-chip status-${entryTone(e)}" style="--i:${i}">
                  <div class="c">${esc(entryLabel(e))}<em>${esc(fmtTime(e.at))}</em></div>
                  <div class="s">${esc(jobNo(p))} ${esc(p.name || '')}${e.author ? ' · ' + esc(e.author) : ''}</div>
                </div>`;
            }).join('') : '<div class="k-chip status-completed"><div class="s">Nothing logged yet today.</div></div>'}
          </div>
        </div>
      </div>

      <div class="k-foot">
        <span>${DB.projects.length} job(s) on file · refreshes every 20 seconds${
          connected() ? '' : ' · NOT CONNECTED'}</span>
        <span>
          <button id="kFull">Full screen</button>
          <button id="kExit">Leave</button>
        </span>
      </div>
    </div>`;

  $('#kFull', view).onclick = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  };
  $('#kExit', view).onclick = () => go('#/');

  keepAwake();
  kioskTimer = setInterval(async () => {
    await refresh();
    if (route.path === '/screen') renderKiosk($('#view'));
  }, 20000);
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
      <label class="field"><span>This device is used by</span>
        <select id="sRole">
          ${ROLES.map(r => `<option value="${r.key}" ${S.role === r.key ? 'selected' : ''}>${esc(r.label)} — ${esc(r.blurb)}</option>`).join('')}
        </select></label>
      <div class="tiny muted">${ROLES.map(r =>
        `<p style="margin-bottom:6px"><strong>${esc(r.label)}</strong> — ${esc(r.hint)}</p>`).join('')}</div>
      <button class="btn primary wide" id="saveMe">Save</button>
    </div>

    <div class="card">
      <h2>Shared data</h2>
      <p class="muted small">These come from Supabase → Settings → API. Everyone who enters the same
      two values sees the same jobs and diaries.</p>
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
      <p class="muted small">Send this link to the supervisor. One tap connects their phone —
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
      Nobody else sees it and it never reaches the office screen.</p>
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
        <tr><th>This device</th><td>${esc(roleLabel(S.role))}${isOffice() ? '' : ' — office-only documents are hidden'}</td></tr>
        <tr><th>Connection</th><td>${S.localMode ? 'This device only' : connected() ? 'Shared database' : 'Not set up'}</td></tr>
        <tr><th>Jobs</th><td>${DB.projects.length}</td></tr>
        <tr><th>Documents</th><td>${DB.project_docs.length}</td></tr>
        <tr><th>Diary entries</th><td>${DB.diary_entries.length}</td></tr>
        <tr><th>Waiting to send</th><td>${Outbox.count()}</td></tr>
        <tr><th>Version</th><td>${VERSION}</td></tr>
      </table>
      <div class="btn-row mt">
        <button class="btn sm" id="refresh">Refresh now</button>
        <button class="btn sm" id="clear">Clear this device</button>
      </div>
    </div>`;

  $('#saveMe', view).onclick = () => {
    const role = $('#sRole', view).value;
    const name = $('#sName', view).value.trim();
    if (!name) return toast('Enter your name');
    if (roleDef(role).officeAccess && !isOffice() && SITE.officePin) {
      const pin = prompt('Office code:');
      if (pin !== SITE.officePin) return toast('Wrong code');
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
      const res = await fetch(`${url}/rest/v1/projects?select=id&limit=1`, {
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
          await navigator.share({ title: 'RCK Dispatch setup', text: 'Tap this to set up RCK Dispatch on your phone', url: link });
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
    if (Outbox.count() && !confirm(`${Outbox.count()} change(s) have not reached Supabase yet and will be lost. Clear anyway?`)) return;
    if (!confirm('Clear the copy held on this device? Shared data in Supabase is not touched.')) return;
    localStorage.removeItem(cacheKey());
    localStorage.removeItem('rckd.outbox');
    DB.projects = []; DB.project_docs = []; DB.diary_entries = [];
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
    : syncState === 'bad' ? 'No signal — showing the last copy'
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
    const before = JSON.stringify([DB.projects.length, DB.project_docs.length, DB.diary_entries.length]);
    await refresh();
    const after = JSON.stringify([DB.projects.length, DB.project_docs.length, DB.diary_entries.length]);
    if (before !== after && ['/', '/today'].includes(route.path)) render();
  }, 20000);
}

/* ================================================================
   Boot
   ================================================================ */
$('#menuBtn').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
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
