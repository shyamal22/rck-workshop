/* =====================================================================
   RCK Dispatch — jobs, site paperwork and the daily job diary
   Plain JavaScript, no build step, no frameworks.

   The office plans a job and hangs the paperwork on it. The supervisor
   opens it on site, reads the paperwork, and keeps the diary as the day
   happens. When the last day is done the supervisor closes the job and
   the whole thing prints as one report.
   ===================================================================== */
'use strict';

const VERSION = '2.0.0';

/* A newer version has downloaded but can't take over until every tab of the
   old one is gone. Rather than leave someone tapping a feature that isn't
   there yet, Settings says so. */
let updateReady = false;

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

/* ------------------------------------------------------------- crews */
/* Who is on the job. A short, fixed roster — this is the one thing the
   board is filtered by, so it stays small enough to read at a glance.
   Adding a fifth crew is one line here and nothing else. */
const CREWS = [
  { key: 'yellow', label: 'Yellow Crew', dot: '#d99b00' },
  { key: 'subbie', label: 'Subbie Crew', dot: '#7a6ad4' },
  { key: 'civil',  label: 'Civil Crew',  dot: '#2b76c9' },
  { key: 'green',  label: 'Green Crew',  dot: '#1c8a4f' }
];
const UNCREWED = { key: '', label: 'Unassigned', dot: '#9aa2ab' };

function crewOf(p) { return ((p && p.crew) || '').trim(); }
function crewDef(key) { return CREWS.find(c => c.key === key) || UNCREWED; }
function crewLabel(key) { return crewDef(key).label; }
/** The coloured dot that makes a crew readable without reading. */
function crewDot(key) {
  return `<span class="crew-dot" style="background:${crewDef(key).dot}"></span>`;
}
function crewPill(p) {
  const k = crewOf(p);
  return `<span class="pill plain">${crewDot(k)}${esc(crewLabel(k))}</span>`;
}

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

/* --------------------------------------------------------- job costing */
/* A finished job's costing is a list of things and what they came to. No
   quantities, no rates, no estimate to keep in step with — the job is done,
   so what is written here is what it cost.

   These are only suggestions for the description box; anything can be typed. */
const COST_SUGGESTIONS = [
  'Asphalt purchase', 'Emulsion purchase', 'Concrete purchase', 'Materials purchase',
  'Crew', 'Trucking', 'Plant and machinery', 'Transport', 'Subcontractors',
  'Traffic management', 'Disposal', 'Maintenance'
];

function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

/** What a line cost. Costings entered under the old quantity-times-rate
    form still read correctly, so nothing already typed in is lost. */
function lineAmount(l) {
  if (hasMoney(l.amount)) return Number(l.amount);
  const actual = num(l.actual_qty) * num(l.actual_rate);
  return actual || num(l.qty) * num(l.rate);
}
function lineLabel(l) {
  return (l.label || '').trim() || (l.kind ? humanise(l.kind) : 'Cost');
}

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
  { key: 'onsite',        label: 'On site',            tone: 'green',  mark: true },
  { key: 'prestart',      label: 'Prestart',           tone: 'green',  mark: true },
  { key: 'tm_setup',      label: 'Traffic management set up', tone: 'blue' },
  { key: 'milling_start', label: 'Milling started',    tone: 'green',  mark: true },
  { key: 'milling_stop',  label: 'Milling stopped',    tone: 'blue',   mark: true },
  { key: 'paving_start',  label: 'Paving started',     tone: 'green',  mark: true },
  { key: 'paving_stop',   label: 'Paving stopped',     tone: 'blue',   mark: true },
  { key: 'delivery',      label: 'Delivery',           tone: 'blue' },
  { key: 'break',         label: 'Break',              tone: 'slate' },
  { key: 'issue',         label: 'Issue',              tone: 'red',    mark: true },
  { key: 'delay',         label: 'Delay',              tone: 'yellow', mark: true },
  { key: 'weather',       label: 'Weather',            tone: 'yellow' },
  { key: 'visitor',       label: 'Visitor',            tone: 'blue' },
  { key: 'tm_down',       label: 'Traffic management removed', tone: 'blue' },
  { key: 'note',          label: 'Note',               tone: 'slate' },
  { key: 'photos',        label: 'Photos',             tone: 'slate' },
  { key: 'offsite',       label: 'Off site',           tone: 'slate',  mark: true }
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
const MONTHS_LONG = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
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

/** A margin as a percentage of what was billed, or null when either half
    is missing. Guessing from half the numbers is worse than showing nothing. */
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
  clock:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>',
  filter:   '<path d="M3.5 5.5h17L14 13v6l-4 2v-8z"/>',
  chart:    '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="12" width="3.4" height="5"/><rect x="13.6" y="7.5" width="3.4" height="9.5"/>',
  money:    '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 12h.01M17.5 12h.01"/>'
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
const DB = { projects: [], project_docs: [], diary_entries: [], job_costs: [], localSeq: 0 };

function cacheKey() { return 'rckd.cache.' + (S.localMode ? 'local' : 'remote'); }

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (raw) {
      DB.projects = raw.projects || [];
      DB.project_docs = raw.project_docs || [];
      DB.diary_entries = raw.diary_entries || [];
      DB.job_costs = raw.job_costs || [];
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
/* Work written on this device that the server has not taken yet — held in
   the outbox until it can be sent. A pull must fold these back in, or the
   server's answer silently deletes a job somebody is standing on site
   writing into: it vanishes off the screen and out of the cache while the
   only copy sits in a queue nobody was told about. */
function reconcile(table, fromServer) {
  const ops = Outbox.all().filter(op => op.table === table);
  if (!ops.length) return fromServer;

  const list = (fromServer || []).slice();
  const byId = new Map(list.map((r, i) => [r.id, i]));

  ops.forEach(op => {
    if (op.kind === 'insert') {
      // Not on the server yet — keep ours, and mark it so the app can say so.
      if (!byId.has(op.row.id)) {
        byId.set(op.row.id, list.length);
        list.push(Object.assign({}, op.row, { _unsent: true }));
      }
    } else if (op.kind === 'patch') {
      const i = byId.get(op.id);
      if (i != null) list[i] = Object.assign({}, list[i], op.patch, { _unsent: true });
    } else if (op.kind === 'delete') {
      const i = byId.get(op.id);
      if (i != null) { list.splice(i, 1); byId.clear(); list.forEach((r, j) => byId.set(r.id, j)); }
    }
  });
  return list;
}

const Store = {
  async pull() {
    if (!connected()) return;
    const [projects, docs, entries, costs] = await Promise.all([
      rest('projects?select=*&order=number.desc&limit=3000', { headers: restHeaders() }),
      rest('project_docs?select=*&order=uploaded_at.asc&limit=8000', { headers: restHeaders() }),
      rest('diary_entries?select=*&order=at.asc&limit=20000', { headers: restHeaders() }),
      rest('job_costs?select=*&order=sort.asc&limit=20000', { headers: restHeaders() })
    ]);
    DB.projects = reconcile('projects', projects || []);
    DB.project_docs = reconcile('project_docs', docs || []);
    DB.diary_entries = reconcile('diary_entries', entries || []);
    DB.job_costs = reconcile('job_costs', costs || []);
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

  /* Why the queue isn't draining. A dropped connection is normal on site and
     fixes itself; a refusal from the database never does, and has to be put
     in front of somebody. */
  problem() {
    try { return JSON.parse(localStorage.getItem('rckd.outbox.problem') || 'null'); } catch (e) { return null; }
  },
  setProblem(p) {
    if (p) localStorage.setItem('rckd.outbox.problem', JSON.stringify(p));
    else localStorage.removeItem('rckd.outbox.problem');
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

/* A day in the diary is the day on the calendar. An entry made at 01:30
   belongs to the date it is made on, not to the shift that started the
   evening before — a night job reads as two days, which is how a supervisor
   talks about it and how the printed report sets it out. The date is still
   editable on every entry for the rare case that is wrong. */

function minutesOfDay(iso) {
  const d = new Date(iso);
  return isNaN(d) ? 0 : d.getHours() * 60 + d.getMinutes();
}
/** One day's entries, earliest first. */
function dayOrder(list) {
  return list.slice().sort((a, b) =>
    (a.at || '').localeCompare(b.at || '') || (a.created_at || '').localeCompare(b.created_at || ''));
}
/** How long the crew was on site that day, as "9h 30m". */
function daySpan(list) {
  if (list.length < 2) return '';
  const mins = list.map(e => minutesOfDay(e.at));
  const span = Math.max.apply(null, mins) - Math.min.apply(null, mins);
  if (span <= 0) return '';
  const h = Math.floor(span / 60), m = span % 60;
  return h ? `${h}h${m ? ' ' + m + 'm' : ''}` : `${m}m`;
}

/** Everything logged across every job on one day, latest first. */
function dayFeed(day, limit) {
  return DB.diary_entries
    .filter(e => (e.entry_date || '') === day)
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    .slice(0, limit);
}

/** Diary entries for a job, in the order they happened. One shift when a
    date is given; otherwise every shift, oldest first. */
function entriesFor(projectId, dateStr) {
  const all = DB.diary_entries.filter(e => e.project_id === projectId);
  if (dateStr) return dayOrder(all.filter(e => (e.entry_date || '') === dateStr));
  const byDay = {};
  all.forEach(e => { (byDay[e.entry_date || ''] = byDay[e.entry_date || ''] || []).push(e); });
  return Object.keys(byDay).sort()
    .reduce((out, day) => out.concat(dayOrder(byDay[day])), []);
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
/* The only preset left, for the month's figure on the landing page. The
   P&L itself takes the dates the director picks. */
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

/* --------------------------------------------------- the money on a job */
const costLinesFor = id => DB.job_costs
  .filter(l => l.project_id === id)
  .sort((a, b) => (a.sort || 0) - (b.sort || 0) || (a.created_at || '').localeCompare(b.created_at || ''));

/** Everything the P&L needs about one job, worked out in one place so the
    screen and the printed report can never disagree.

    Revenue is the invoice plus whatever variations were claimed on top.
    Cost is the sum of the lines typed in after the job finished; a job
    costed before the lines existed still has its old single figure. */
function costing(p) {
  const lines = costLinesFor(p.id);
  const cost = lines.length
    ? lines.reduce((n, l) => n + lineAmount(l), 0)
    : (hasMoney(p.actual_cost) ? Number(p.actual_cost) : null);

  const invoice = hasMoney(p.actual_invoice) ? Number(p.actual_invoice) : null;
  const variations = hasMoney(p.variations) ? Number(p.variations) : null;
  const revenue = (invoice == null && variations == null) ? null : num(invoice) + num(variations);

  const pnl = (revenue == null || cost == null) ? null : revenue - cost;

  return {
    lines, cost, invoice, variations, revenue, pnl,
    pct: marginPct(revenue, pnl),
    priced: lines.length > 0 || cost != null,
    done: pnl != null
  };
}

/** The numbers a director asks for, added up honestly: value and cost are
    summed only over the jobs that carry them, and the count of those jobs
    comes back too, so a total can say what it is missing. */
function periodTotals(list) {
  const t = { jobs: list.length, days: 0, entries: 0, issues: 0,
              invoice: 0, variations: 0, revenue: 0, cost: 0, priced: 0, done: 0,
              ongoing: 0, planned: 0, completed: 0 };
  list.forEach(p => {
    t.days += diaryDays(p.id).length;
    t.entries += entriesFor(p.id).length;
    t.issues += issueCount(p.id);
    const c = costing(p);
    if (c.invoice != null) t.invoice += c.invoice;
    if (c.variations != null) t.variations += c.variations;
    if (c.revenue != null) t.revenue += c.revenue;
    if (c.cost != null) { t.cost += c.cost; t.priced++; }
    if (c.done) t.done++;
    t[p.status] = (t[p.status] || 0) + 1;
  });
  t.pnl = t.done ? t.revenue - t.cost : null;
  t.pct = marginPct(t.revenue, t.pnl);
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

/** Delete a job and everything hanging off it. The database cascades on
    its own; the copy on this device does not, and neither does the outbox —
    a queued insert left behind would rebuild the job the moment there was
    signal, which is the one way a delete could appear to fail. */
async function deleteJob(p) {
  const doomed = new Set([p.id]);
  DB.project_docs.forEach(d => { if (d.project_id === p.id) doomed.add(d.id); });
  DB.diary_entries.forEach(e => { if (e.project_id === p.id) doomed.add(e.id); });
  DB.job_costs.forEach(l => { if (l.project_id === p.id) doomed.add(l.id); });

  Outbox.save(Outbox.all().filter(op => !doomed.has(op.kind === 'insert' ? op.row.id : op.id)));

  DB.project_docs = DB.project_docs.filter(d => d.project_id !== p.id);
  DB.diary_entries = DB.diary_entries.filter(e => e.project_id !== p.id);
  DB.job_costs = DB.job_costs.filter(l => l.project_id !== p.id);

  await Store.remove('projects', p.id);   // saves the cache and tells the server
  paintSync();
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
  '/':        { title: 'RCK Dispatch',  render: renderHome },
  '/jobs':    { title: 'Jobs',          render: renderBoard },
  '/pnl':     { title: 'Profit & loss', render: renderPnl,    back: true },
  '/today':   { title: 'Today on site', render: renderToday },
  '/log':     { title: 'Log',           render: renderLogPicker, back: true },
  '/new':     { title: 'New job',       render: renderJobEdit, back: true },

  '/reports': { title: 'Reports',       render: renderReports, back: true },
  '/setup':   { title: 'Settings',      render: renderSetup,   back: true },
  '/join':    { title: 'Set up',        render: renderJoin },
  '/screen':  { title: 'Office screen', render: renderKiosk }
};

/* Coming back to a list should put you where you left it, not at the top. */
const scrollMemory = {};
let lastPath = null;

function restoreScroll(path) {
  const keepsPlace = path === '/jobs' || path === '/today' || path.startsWith('/diary/');
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
  else if (route.path.startsWith('/costs/')) { screen = { title: 'Profit & loss', render: renderCosts }; back = true; }
  else if (route.path === '/overview')       { go('#/pnl'); return; }   // the old name

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
  if (route.path !== '/screen') paintUnsent(view);
  restoreScroll(route.path);
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
       <a href="#/setup" style="display:inline-block;margin-top:8px;font-weight:640">What to do →</a>`
    : `<strong>${n} change${n > 1 ? 's are' : ' is'} waiting to send.</strong>
       They are safe on this phone and will go as soon as there is signal.`;
  view.insertBefore(box, view.firstChild);
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
            <span>${crewDot(crewOf(p))} ${esc(crewLabel(crewOf(p)))}</span>
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
          <div style="margin-top:7px">${crewPill(p)}</div>
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
   Screen — the landing page
   Two tools behind one door. Everyone gets the jobs; the money is
   behind the Director role and nothing hints at it otherwise.
   ================================================================ */
function renderHome(view) {
  const jobs = activeJobs();
  const onSite = jobs.filter(p => p.status === 'ongoing').length;
  const planned = jobs.filter(p => p.status === 'planned').length;

  let money = '';
  if (isDirector()) {
    const [from, to] = periodRange('month');
    const inMonth = DB.projects.filter(p => jobInPeriod(p, from, to));
    const t = inMonth.reduce((acc, p) => {
      const c = costing(p);
      if (c.revenue != null) { acc.inv += c.revenue; acc.priced++; }
      if (c.pnl != null) { acc.margin += c.pnl; acc.withMargin++; }
      return acc;
    }, { inv: 0, priced: 0, margin: 0, withMargin: 0 });
    money = t.priced
      ? `${esc(fmtMoney(t.inv))} billed this month${t.withMargin ? ' · ' + esc(fmtMoney(t.margin)) + ' P&L' : ''}`
      : 'Nothing costed this month yet';
  }

  view.innerHTML = `
    <div class="tiles">
      <a class="tile" href="#/jobs">
        <span class="ti">${icon('book')}</span>
        <b>Jobs</b>
        <span class="td">Site paperwork and the daily job diary</span>
        <span class="ts">${jobs.length} job${jobs.length === 1 ? '' : 's'} · ${onSite} on site · ${planned} planned</span>
      </a>

      ${isDirector() ? `
      <a class="tile money" href="#/pnl">
        <span class="ti">${icon('chart')}</span>
        <b>Profit &amp; loss</b>
        <span class="td">What each job was priced at, and what it did</span>
        <span class="ts">${money}</span>
      </a>` : ''}
    </div>

    ${isDirector() ? '<p class="muted tiny center mt">Profit &amp; loss is shown on Director devices only.</p>' : ''}`;
}

/* ================================================================
   Screen — job board
   ================================================================ */
const boardFilter = { crew: 'all', status: 'all', q: '' };

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
        ${crewPill(p)}
        ${p._unsent ? '<span class="pill plain">Not sent yet</span>' : ''}
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

  // The full roster always shows, in the same order, so a chip is where you
  // last saw it. Unassigned only appears when there is something in it.
  const crews = CREWS.concat(jobs.some(p => !crewOf(p)) ? [UNCREWED] : []);

  view.innerHTML = `
    <div class="tally">
      ${JOB_STATUS.map(s => `
        <button class="status-${s.tone}" data-status="${s.key}" aria-pressed="${boardFilter.status === s.key}">
          <span class="n">${counts[s.key] || 0}</span>
          <span class="l">${s.label}</span>
        </button>`).join('')}
    </div>

    <div class="filters" id="crewChips">
      <button class="chip" data-crew="all" aria-pressed="${boardFilter.crew === 'all'}">All crews</button>
      ${crews.map(c => `<button class="chip" data-crew="${esc(c.key || 'none')}"
        aria-pressed="${boardFilter.crew === (c.key || 'none')}">${crewDot(c.key)}${esc(c.label)}</button>`).join('')}
    </div>

    <label class="field"><input type="text" id="q" value="${esc(boardFilter.q)}"
      placeholder="Search job, client, site or supervisor" autocapitalize="off"></label>

    <div class="job-grid" id="grid"></div>`;

  const grid = $('#grid', view);

  function paint() {
    const q = boardFilter.q.toLowerCase();
    const list = boardOrder(jobs.filter(p => {
      if (boardFilter.status !== 'all' && p.status !== boardFilter.status) return false;
      if (boardFilter.crew !== 'all') {
        const want = boardFilter.crew === 'none' ? '' : boardFilter.crew;
        if (crewOf(p) !== want) return false;
      }
      if (!q) return true;
      return [p.name, p.client, p.site, p.supervisor, jobNo(p), crewLabel(crewOf(p)), typeLabel(typeOf(p))]
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

  $$('#crewChips .chip', view).forEach(b => b.onclick = () => {
    boardFilter.crew = b.dataset.crew;
    $$('#crewChips .chip', view).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.crew === boardFilter.crew)));
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
          <span>${crewDot(crewOf(p))} ${esc(crewLabel(crewOf(p)))}</span>
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
          <div class="sub"><span>${crewDot(crewOf(p))} ${esc(crewLabel(crewOf(p)))}</span>
            ${p.site ? `<span>${esc(p.site)}</span>` : ''}
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
        <tr><th>Crew</th><td>${crewDot(crewOf(p))} ${esc(crewLabel(crewOf(p)))}</td></tr>
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

    ${isDirector() ? `
      <a class="btn wide mb" href="#/costs/${p.id}">${icon('chart')}Profit &amp; loss${
        costing(p).pnl != null ? ` — ${esc(fmtMoney(costing(p).pnl))}`
        : costing(p).priced ? ' — part filled in' : ' — not filled in yet'}</a>` : ''}

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
        ${isDirector() ? `
          <p class="muted tiny mt">Archiving takes the job off the board and out of the profit and
          loss, and keeps every record of it. That is the one to use for a job that was cancelled.</p>
          <button class="btn sm danger wide" id="del">${icon('trash')}Delete this job for good</button>
          <p class="muted tiny mt" style="margin-bottom:0">Deleting destroys the diary, the documents
          and the costing with it, for everyone. There is no undo.</p>`
        : '<p class="muted tiny mt" style="margin-bottom:0">Archiving or deleting a job is a director\'s call.</p>'}
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
    toast(p.archived ? 'Restored' : 'Archived — off the board and out of the P&L');
    render();
  };

  const del = $('#del', view);
  if (del) del.onclick = async () => {
    const ents = entriesFor(p.id).length;
    const docs = allDocsFor(p.id).length;
    const lines = costLinesFor(p.id).length;
    const also = [
      ents && `${ents} diary entr${ents > 1 ? 'ies' : 'y'}`,
      docs && `${docs} document${docs > 1 ? 's' : ''}`,
      lines && `${lines} cost line${lines > 1 ? 's' : ''}`
    ].filter(Boolean);

    // Typing the number is the guard. A job with a diary on it is somebody's
    // week, and a mis-tap should not be able to take it.
    const typed = prompt(
      `Delete ${jobNo(p)} — ${p.name}?\n\n` +
      (also.length ? `This destroys ${also.join(', ')} along with it. ` : '') +
      `It goes for everyone and cannot be undone.\n\n` +
      `Type ${jobNo(p)} to confirm.`);
    if (typed == null) return;
    if (typed.trim().toUpperCase() !== jobNo(p)) return toast('Not deleted — that job number did not match');

    await deleteJob(p);
    toast(`${jobNo(p)} deleted`);
    go('#/jobs');
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
/** One entry on the timeline: the time in its own column, a dot on a rail
    coloured for what happened, and the note beside it. */
function diaryItem(e, i) {
  const files = Array.isArray(e.files) ? e.files : [];
  const photos = files.filter(f => /^image\//.test(f.type || ''));
  const others = files.filter(f => !/^image\//.test(f.type || ''));
  const pending = files.some(f => f.pending);
  const flag = e.kind === 'issue' || e.kind === 'delay';
  return `
    <div class="tl-e status-${entryTone(e)}${flag ? ' flag' : ''}${entryMarked(e) ? ' mark' : ''}"
         data-id="${e.id}" style="--i:${i}">
      <div class="tl-when">${esc(fmtTime(e.at))}</div>
      <div class="tl-rail"><i></i></div>
      <div class="tl-card">
        <div class="tl-kind">${esc(entryLabel(e))}</div>
        ${e.body ? `<div class="tl-note">${esc(e.body)}</div>` : ''}
        ${photos.length ? `<div class="thumbs">${photos.map(f =>
          `<a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt=""></a>`).join('')}</div>` : ''}
        ${others.map(f => `<a class="attach" href="${esc(f.url)}" target="_blank" rel="noopener">${icon('clip')}${esc(f.name || 'Attachment')}</a>`).join('')}
        <div class="tl-who">${esc(e.author || 'Unknown')}${e.role && e.role !== 'supervisor' ? ' · ' + esc(roleLabel(e.role)) : ''}${
          pending ? ' · photos waiting for signal' : ''}</div>
      </div>
    </div>`;
}

/** The quiet stretch between two entries. Seeing "3h 10m" on the rail is
    what turns a list of times into a shape you can read — where the day
    ran, and where it stopped. */
function diaryGap(a, b) {
  const mins = Math.round((new Date(b.at) - new Date(a.at)) / 60000);
  if (!isFinite(mins) || mins < 25) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  return `<div class="tl-gap"><span>${h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm'}</span></div>`;
}

/** The whole day on one line: where each entry falls between the first and
    the last, so the shape of the shift is visible before a word is read. */
function dayStrip(list) {
  if (list.length < 2) return '';
  const t0 = new Date(list[0].at).getTime();
  const t1 = new Date(list[list.length - 1].at).getTime();
  if (!(t1 > t0)) return '';
  return `
    <div class="tl-strip">
      <div class="bar">
        ${list.map(e => {
          const at = ((new Date(e.at).getTime() - t0) / (t1 - t0)) * 100;
          return `<i class="status-${entryTone(e)}" style="left:${at.toFixed(2)}%"
            title="${esc(fmtTime(e.at))} ${esc(entryLabel(e))}"></i>`;
        }).join('')}
      </div>
      <div class="ends"><span>${esc(fmtTime(list[0].at))}</span><span>${esc(fmtTime(list[list.length - 1].at))}</span></div>
    </div>`;
}

function renderDiary(view) {
  const p = jobById(jobIdFromPath());
  if (!p) { view.innerHTML = `<div class="empty"><b>Job not found</b></div>`; return; }
  $('#title').textContent = 'Job diary';

  const closed = p.status === 'completed';
  // The day turns over whether or not anybody has written in it yet. Showing
  // today's box empty is how a supervisor sees that it is a new day.
  const days = diaryDays(p.id);
  const showToday = !closed && !days.includes(today());
  const boxes = showToday ? [today()].concat(days) : days;

  view.innerHTML = `
    ${jobHeader(p, 'diary')}

    ${closed ? '<div class="banner info">This job is completed — the diary is closed and kept as it is.</div>' : `
      <a class="btn primary wide logbtn" href="#/entry/${p.id}">${icon('plus')}Log something</a>`}

    ${boxes.map(day => {
      const list = entriesFor(p.id, day);
      const span = daySpan(list);
      const isToday = day === today();
      return `
        <div class="dayhead${isToday ? ' today' : ''}">
          <h3>${esc(fmtDayDate(day))}${isToday ? '<em>Today</em>' : ''}</h3>
          <span class="sub">${list.length
            ? `${list.length} entr${list.length > 1 ? 'ies' : 'y'}${span ? ' · ' + esc(span) + ' on site' : ''}`
            : 'nothing yet'}</span>
        </div>
        <div class="card">
          ${list.length ? `
            ${dayStrip(list)}
            <div class="tl">${list.map((e, i) =>
              (i ? diaryGap(list[i - 1], e) : '') + diaryItem(e, i)).join('')}</div>
            <div class="btn-row mt">
              <button class="btn sm" data-day="${day}">${icon('printer')}Print this day</button>
            </div>`
          : `<p class="muted small" style="margin:0">Nothing logged for today yet.
             <a href="#/entry/${p.id}">Start the day →</a></p>`}
        </div>`;
    }).join('') || `<div class="empty"><b>Nothing logged yet</b>The first entry starts the job.</div>`}`;
  $$('[data-day]', view).forEach(b => b.onclick = () => printDayReport(p, b.dataset.day));
  $$('.tl-e', view).forEach(el => el.onclick = ev => {
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
  const defDate = editing ? editing.entry_date : today();

  view.innerHTML = `
    <div class="card">
      <div class="tiny muted">${jobNo(p)} · ${esc(p.name)}</div>
      <label class="field mt"><span>What happened?</span>
        <select id="kind">
          ${types.map(t => `<option value="${esc(t.key)}" ${t.key === wanted ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          <option value="__new">+ Add a new type…</option>
        </select></label>

      <div class="row">
        <label class="field grow"><span>Date</span>
          <input type="date" id="date" value="${esc(defDate)}"></label>
        <label class="field grow"><span>Time</span>
          <input type="text" id="time" value="${esc(editing ? fmtTime(editing.at) : nowTime())}"
            placeholder="07:15" inputmode="numeric" maxlength="5"></label>
      </div>

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

      <label class="field"><span>Crew</span>
        <select id="crew">
          <option value="" ${!crewOf(p) ? 'selected' : ''}>Not assigned yet</option>
          ${CREWS.map(c => `<option value="${c.key}" ${crewOf(p) === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select></label>

      <label class="field"><span>Supervisor on site</span>
        <input type="text" id="super" value="${esc(p.supervisor || '')}" placeholder="Name" list="supers">
        <datalist id="supers">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></label>

      <label class="field"><span>Client contact <span class="muted">(optional)</span></span>
        <input type="text" id="contact" value="${esc(p.contact || '')}" placeholder="Name and phone"></label>
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
      crew: $('#crew', view).value,
      supervisor: $('#super', view).value.trim(),
      contact: $('#contact', view).value.trim(),
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
   Screen — a job's profit and loss
   Filled in once the job is finished: what each thing cost, what was
   invoiced, and what is left. Director devices only.
   ================================================================ */
async function addCostLine(projectId) {
  const existing = costLinesFor(projectId);
  return Store.insert('job_costs', {
    id: uid(),
    project_id: projectId,
    kind: 'other',
    label: '',
    unit: '',
    amount: null,
    qty: null, rate: null, actual_qty: null, actual_rate: null,
    sort: existing.length ? Math.max.apply(null, existing.map(l => l.sort || 0)) + 1 : 0,
    created_at: new Date().toISOString(),
    created_by: whoami()
  });
}

function renderCosts(view) {
  const p = jobById(jobIdFromPath());
  if (!p) { view.innerHTML = `<div class="empty"><b>Job not found</b></div>`; return; }
  if (!isDirector()) {
    view.innerHTML = `
      <div class="card">
        <h2>Director only</h2>
        <p class="muted small">What a job made is kept between the directors. The job itself,
        its paperwork and its diary are all open to you.</p>
        <a class="btn wide mt" href="#/job/${p.id}">Back to the job</a>
      </div>`;
    return;
  }
  $('#title').textContent = 'Profit & loss';

  const c = costing(p);
  const money = v => v == null ? '—' : esc(fmtMoney(v, true));

  view.innerHTML = `
    <div class="card accent status-${statusTone(p.status)}">
      <div class="row spread" style="align-items:flex-start">
        <div class="grow">
          <div class="tiny" style="color:var(--ink-3);letter-spacing:.04em;font-weight:700">${jobNo(p)}</div>
          <h2 style="font-size:18px;margin:2px 0 3px">${esc(p.name)}</h2>
          <div class="small muted">${esc(p.client || 'No client named')}</div>
        </div>
        <span class="pill"><span class="swatch"></span>${statusLabel(p.status)}</span>
      </div>
      <div class="sub" style="margin-top:9px;display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12.5px">
        <span>${crewDot(crewOf(p))} ${esc(crewLabel(crewOf(p)))}</span>
        ${p.site ? `<span>${esc(p.site)}</span>` : ''}
        ${p.start_date ? `<span>${esc(fmtShort(p.start_date))}${
          p.end_date && p.end_date !== p.start_date ? '–' + esc(fmtShort(p.end_date)) : ''}</span>` : ''}
      </div>
    </div>

    <div class="btn-row mb">
      <a class="btn sm" href="#/diary/${p.id}">${icon('book')}Timeline${
        entriesFor(p.id).length ? ` (${entriesFor(p.id).length})` : ''}</a>
      <a class="btn sm" href="#/job/${p.id}">${icon('doc')}Full job</a>
    </div>

    ${p.status !== 'completed' ? `<div class="banner">This job is not finished yet. The costing is
      meant to be filled in once it is, from the real numbers.</div>` : ''}

    <div class="section-title">What it cost</div>
    <div class="card">
      ${c.lines.length ? `<div class="costlines">${c.lines.map((l, i) => `
        <div class="costline" data-id="${l.id}" style="--i:${i}">
          <input type="text" class="cdesc" data-f="label" value="${esc(lineLabel(l) === 'Cost' ? '' : lineLabel(l))}"
            placeholder="What was it?" list="costsug">
          <input type="number" class="camt" data-f="amount" inputmode="decimal" step="0.01"
            value="${esc(hasMoney(l.amount) ? l.amount : (lineAmount(l) || ''))}" placeholder="0.00">
          <button class="cdel" title="Remove">${icon('trash')}</button>
        </div>`).join('')}</div>`
      : '<p class="muted small" style="margin:0 0 12px">Nothing added yet.</p>'}
      <datalist id="costsug">${COST_SUGGESTIONS.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>
      <button class="btn wide" id="addLine">${icon('plus')}Add a cost</button>
    </div>

    <div class="section-title">The bottom line</div>
    <div class="card">
      <label class="field"><span>Invoice</span>
        <input type="number" id="inv" inputmode="decimal" step="0.01"
          value="${esc(c.invoice == null ? '' : c.invoice)}" placeholder="what was billed"></label>
      <label class="field"><span>Variations claimed</span>
        <input type="number" id="vars" inputmode="decimal" step="0.01"
          value="${esc(c.variations == null ? '' : c.variations)}" placeholder="extra claimed on top"></label>

      <table class="data money">
        <tr><th>Invoice</th><td>${money(c.invoice)}</td></tr>
        <tr><th>Variations</th><td>${money(c.variations)}</td></tr>
        <tr><th>Cost</th><td>${money(c.cost)}</td></tr>
        <tr class="tot"><th>Profit / loss</th>
          <td class="${c.pnl == null ? '' : c.pnl < 0 ? 'neg' : 'pos'}">${money(c.pnl)}${
            c.pct != null ? ` · ${c.pct.toFixed(1)}%` : ''}</td></tr>
      </table>
    </div>

    <div class="card">
      <label class="field"><span>How did it go?</span>
        <textarea id="pnl" placeholder="Why it landed where it did — the wet week, the extra establishment, the variation that never got signed.">${esc(p.pnl_notes || '')}</textarea>
      </label>
      <button class="btn wide" id="saveNotes">Save note</button>
    </div>

    <div class="card">
      <button class="btn primary wide" id="printPnl">${icon('printer')}Print the job P&amp;L</button>
      <p class="muted tiny center mt" style="margin-bottom:0">The money, your note, and every entry
      the supervisors wrote.</p>
    </div>`;

  wireCosts(view, p);
}

function wireCosts(view, p) {
  $$('.costline', view).forEach(row => {
    const id = row.dataset.id;
    $$('input', row).forEach(inp => {
      inp.onchange = async () => {
        const f = inp.dataset.f;
        const v = inp.type === 'number' ? moneyField(inp.value) : inp.value.trim();
        await Store.patch('job_costs', id, { [f]: v });
        render();
      };
    });
    $('.cdel', row).onclick = async () => {
      const l = DB.job_costs.find(x => x.id === id);
      if (!confirm(`Remove "${l ? lineLabel(l) : 'this line'}" from the costing?`)) return;
      await Store.remove('job_costs', id);
      render();
    };
  });

  $('#addLine', view).onclick = async () => { await addCostLine(p.id); render(); };

  const money = (id, field) => {
    const el = $('#' + id, view);
    if (el) el.onchange = async () => {
      await Store.patch('projects', p.id, { [field]: moneyField(el.value) });
      render();
    };
  };
  money('inv', 'actual_invoice');
  money('vars', 'variations');

  $('#saveNotes', view).onclick = async function () {
    this.disabled = true;
    await Store.patch('projects', p.id, { pnl_notes: $('#pnl', view).value.trim() });
    toast('Saved');
    render();
  };
  $('#printPnl', view).onclick = () => printJobPnl(p);
}

/* ================================================================
   Screen — the director's overview
   Every job at once over a period: what the crews did, what went wrong,
   and what it was worth. Everything on it is added up from what the
   supervisors and the office entered on the jobs themselves — nothing
   here is typed twice.
   ================================================================ */
/* The month you are in, every job in it. That is the question a director
   opens the app with, so it is answered before a single choice is made.
   Anything narrower sits behind one button. */
function monthRange() {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const iso = (yy, mm, dd) => `${yy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return [iso(y, m, 1), iso(y, m, new Date(y, m + 1, 0).getDate())];
}
/* Finished jobs, this month. A costing is filled in after a job is done, so
   those are the only ones with anything to show. */
const pnlFilter = (() => {
  const [from, to] = monthRange();
  return { status: 'completed', client: 'all', q: '', from, to, sort: 'pnl', open: false };
})();
function pnlIsDefault() {
  const [from, to] = monthRange();
  return pnlFilter.status === 'completed' && pnlFilter.client === 'all' && !pnlFilter.q
      && pnlFilter.from === from && pnlFilter.to === to;
}
function pnlReset() {
  const [from, to] = monthRange();
  Object.assign(pnlFilter, { status: 'completed', client: 'all', q: '', from, to });
}

const PNL_STATUS = [
  { key: 'completed', label: 'Completed' },
  { key: 'ongoing',   label: 'On site' },
  { key: 'planned',   label: 'Planned' },
  { key: 'all',       label: 'Every job' }
];

function pnlJobs() {
  const q = pnlFilter.q.trim().toLowerCase();
  return DB.projects.filter(p => {
    // An archived job is one that never really ran. It should not be sitting
    // in a month's figures any more than it should be on the board.
    if (p.archived) return false;
    if (pnlFilter.status !== 'all' && p.status !== pnlFilter.status) return false;
    if (pnlFilter.client !== 'all' && (p.client || '').trim() !== pnlFilter.client) return false;
    if (q && ![p.name, p.client, p.site, jobNo(p)].some(v => String(v || '').toLowerCase().includes(q))) return false;
    return jobInPeriod(p, pnlFilter.from, pnlFilter.to);
  });
}
/** What the figures on screen are of, in one line. */
function pnlLabel() {
  const [mf, mt] = monthRange();
  const n = new Date();
  const when = (pnlFilter.from === mf && pnlFilter.to === mt)
    ? `${MONTHS_LONG[n.getMonth()]} ${n.getFullYear()}`
    : (pnlFilter.from || pnlFilter.to)
      ? `${pnlFilter.from ? fmtDate(pnlFilter.from) : 'the beginning'} to ${pnlFilter.to ? fmtDate(pnlFilter.to) : 'today'}`
      : 'All time';
  const who = pnlFilter.client === 'all' ? '' : ` · ${pnlFilter.client}`;
  const what = pnlFilter.status === 'all' ? '' : ` · ${PNL_STATUS.find(x => x.key === pnlFilter.status).label.toLowerCase()}`;
  const named = pnlFilter.q ? ` · "${pnlFilter.q}"` : '';
  return when + who + what + named;
}

function renderPnl(view) {
  if (!isDirector()) {
    view.innerHTML = `
      <div class="card">
        <h2>Director only</h2>
        <p class="muted small">The profit and loss across every job is for devices set to
        <strong>Director</strong>. The jobs themselves, their paperwork and their diaries are
        all open to you.</p>
        <a class="btn wide mt" href="#/jobs">Open the jobs</a>
      </div>`;
    return;
  }

  const list = pnlJobs();
  const t = periodTotals(list);
  const clients = Array.from(new Set(DB.projects.map(p => (p.client || '').trim()).filter(Boolean))).sort();

  const val = p => { const c = costing(p); return c.revenue == null ? -Infinity : c.revenue; };
  const mg  = p => { const c = costing(p); return c.pnl == null ? -Infinity : c.pnl; };
  const sorters = {
    pnl:    (a, b) => mg(b) - mg(a),
    value:  (a, b) => val(b) - val(a),
    name:   (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
    date:   (a, b) => String(b.completed_at || b.start_date || '').localeCompare(String(a.completed_at || a.start_date || ''))
  };
  const sorted = list.slice().sort(sorters[pnlFilter.sort] || sorters.value);

  view.innerHTML = `
    <div class="ledger">
      <div class="lh">${esc(pnlLabel())}</div>
      <div class="lrow"><span>Invoice</span><b>${esc(fmtMoney(t.invoice))}</b></div>
      <div class="lrow"><span>Variations</span><b>${esc(fmtMoney(t.variations))}</b></div>
      <div class="lrow"><span>Cost</span><b>${esc(fmtMoney(t.cost))}</b></div>
      <div class="lrow tot"><span>Profit / loss</span><b class="${
        t.pnl == null ? '' : t.pnl < 0 ? 'neg' : 'pos'}">${
        t.pnl == null ? '—' : esc(fmtMoney(t.pnl))}${
        t.pct != null ? ` <em>${t.pct.toFixed(1)}%</em>` : ''}</b></div>
      <div class="lf">${list.length} job${list.length === 1 ? '' : 's'}${
        t.done < list.length ? ` · ${t.done} costed` : ''}</div>
    </div>

    <button class="btn wide filterbtn${pnlIsDefault() ? '' : ' on'}" id="filterBtn">
      ${icon('filter')}${pnlIsDefault() ? 'Filter' : 'Filtered · ' + esc(pnlLabel())}
    </button>

    ${pnlFilter.open ? `
    <div class="card filterpanel">
      <label class="field"><span>Show</span>
        <select id="fStatus">
          ${PNL_STATUS.map(x => `<option value="${x.key}" ${pnlFilter.status === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
        </select></label>
      <label class="field"><span>Search</span>
        <input type="text" id="fQ" value="${esc(pnlFilter.q)}"
          placeholder="Job name, number or site" autocapitalize="off"></label>
      <label class="field"><span>Client</span>
        <select id="fClient">
          <option value="all">Every client</option>
          ${clients.map(c => `<option value="${esc(c)}" ${pnlFilter.client === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select></label>
      <div class="row">
        <label class="field grow"><span>From</span><input type="date" id="fFrom" value="${esc(pnlFilter.from)}"></label>
        <label class="field grow"><span>To</span><input type="date" id="fTo" value="${esc(pnlFilter.to)}"></label>
      </div>
      <div class="btn-row">
        <button class="btn sm" id="fAll">All time</button>
        <button class="btn sm" id="fReset">This month</button>
        <button class="btn sm primary" id="fClose">Done</button>
      </div>
    </div>` : ''}

    <div class="filters" id="sortChips">
      ${[['pnl','By P&L'],['value','By invoice'],['date','By date'],['name','By name']]
        .map(([k, l]) => `<button class="chip" data-sort="${k}" aria-pressed="${pnlFilter.sort === k}">${l}</button>`).join('')}
    </div>

    ${sorted.length ? sorted.map((p, i) => {
      const c = costing(p);
      return `
        <button class="job-row status-${statusTone(p.status)}" data-id="${p.id}" style="--i:${i}">
          <div class="hdr">
            <span class="num">${jobNo(p)}</span>
            <span class="pill"><span class="swatch"></span>${statusLabel(p.status)}</span>
            ${c.done ? '' : '<span class="pill plain">No costing yet</span>'}
          </div>
          <div class="ttl">${esc(p.name)}</div>
          <div class="sub">
            ${p.client ? `<span>${esc(p.client)}</span>` : ''}
            <span>${crewDot(crewOf(p))} ${esc(crewLabel(crewOf(p)))}</span>
            <span>${esc(fmtShort(p.completed_at || p.start_date))}</span>
          </div>
          ${c.priced || c.revenue != null ? `
          <div class="sub">
            <span><strong>${esc(fmtMoney(c.revenue))}</strong> billed</span>
            <span>${esc(fmtMoney(c.cost))} cost</span>
            ${c.pnl != null ? `<span class="${c.pnl < 0 ? 'neg' : 'pos'}" style="font-weight:640">${
              esc(fmtMoney(c.pnl))}${c.pct != null ? ' · ' + c.pct.toFixed(1) + '%' : ''}</span>` : ''}
          </div>` : ''}
        </button>`;
    }).join('') : `<div class="empty"><b>No jobs here</b>Nothing finished this month matches.
      Open the filter for a wider period.</div>`}

    <div class="card">
      <div class="btn-row">
        <button class="btn" id="print">${icon('printer')}Print the report</button>
        <button class="btn" id="csv">${icon('download')}Export to Excel</button>
      </div>
      <p class="muted tiny center mt" style="margin-bottom:0">Both cover exactly what is filtered above.</p>
    </div>`;

  $('#filterBtn', view).onclick = () => { pnlFilter.open = !pnlFilter.open; render(); };
  const on = (id, fn) => { const el = $('#' + id, view); if (el) el.onchange = fn; };
  on('fStatus', e => { pnlFilter.status = e.target.value; render(); });
  const q = $('#fQ', view);
  if (q) q.oninput = e => { pnlFilter.q = e.target.value; clearTimeout(q._t);
    q._t = setTimeout(() => { const at = q.selectionStart; render();
      const again = $('#fQ'); if (again) { again.focus(); again.setSelectionRange(at, at); } }, 260); };
  on('fClient', e => { pnlFilter.client = e.target.value; render(); });
  on('fFrom',   e => { pnlFilter.from = e.target.value; render(); });
  on('fTo',     e => { pnlFilter.to = e.target.value; render(); });
  const click = (id, fn) => { const el = $('#' + id, view); if (el) el.onclick = fn; };
  click('fReset', () => { pnlReset(); render(); });
  click('fAll',   () => { pnlFilter.from = ''; pnlFilter.to = ''; render(); });
  click('fClose', () => { pnlFilter.open = false; render(); });

  $$('#sortChips .chip', view).forEach(b => b.onclick = () => { pnlFilter.sort = b.dataset.sort; render(); });
  $$('.job-row', view).forEach(b => b.onclick = () => go('#/costs/' + b.dataset.id));
  $('#print', view).onclick = () => printDirectorReport(sorted);
  $('#csv', view).onclick = () => exportPnlCsv(sorted);
}

/** The filtered list as a spreadsheet — a client's month handed straight to
    the accountant, with the same figures that are on the screen. */
function exportPnlCsv(list) {
  const r2 = v => v == null ? '' : Math.round(v * 100) / 100;
  const rows = [['Job', 'Name', 'Client', 'Site', 'Crew', 'Status', 'First day', 'Completed',
    'Supervisor', 'Days on site', 'Issues',
    'Invoice', 'Variations', 'Billed', 'Cost', 'Profit / loss', 'P&L %', 'Note']];
  list.forEach(p => {
    const c = costing(p);
    rows.push([
      jobNo(p), p.name, p.client, p.site, crewLabel(crewOf(p)), statusLabel(p.status),
      p.start_date || '', p.completed_at ? fmtDate(p.completed_at) : '', p.supervisor,
      diaryDays(p.id).length, issueCount(p.id),
      r2(c.invoice), r2(c.variations), r2(c.revenue), r2(c.cost), r2(c.pnl),
      c.pct == null ? '' : c.pct.toFixed(1), p.pnl_notes || ''
    ]);
  });
  const t = periodTotals(list);
  rows.push([]);
  rows.push(['TOTAL', pnlLabel(), '', '', '', '', '', '', '', t.days, t.issues,
    r2(t.invoice), r2(t.variations), r2(t.revenue), r2(t.cost), r2(t.pnl),
    t.pct == null ? '' : t.pct.toFixed(1), '']);
  const tag = (pnlFilter.client === 'all' ? 'all-clients' : pnlFilter.client)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  downloadCsv(`rck-pnl-${tag}-${pnlFilter.from || 'start'}-to-${pnlFilter.to || today()}.csv`, rows);
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
      <p class="muted small">Profit and loss over a period: what was invoiced, what it cost, and
      what is left — added up from the costings and the crews' own entries.</p>
      <a class="btn primary wide" href="#/pnl">Open profit &amp; loss</a>
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
  const money = isDirector();   // the P&L is a director's, so nobody else's spreadsheet carries it
  const rows = [['Job', 'Name', 'Client', 'Site', 'Crew', 'Type of work', 'Status', 'First day',
    'Last day', 'Supervisor', 'Started', 'Completed', 'Days on site', 'Diary entries',
    'Issues', 'Documents', 'Closing note']
    .concat(money ? ['Invoice', 'Variations', 'Cost', 'Profit / loss'] : [])];
  boardOrder(DB.projects.slice()).forEach(p => rows.push([
    jobNo(p), p.name, p.client, p.site, crewLabel(crewOf(p)), typeLabel(typeOf(p)), statusLabel(p.status),
    p.start_date || '', p.end_date || '', p.supervisor,
    p.started_at ? fmtDate(p.started_at) : '', p.completed_at ? fmtDate(p.completed_at) : '',
    diaryDays(p.id).length, entriesFor(p.id).length, issueCount(p.id), allDocsFor(p.id).length,
    p.completion_notes || ''
  ].concat(money ? (c => [
    c.invoice == null ? '' : c.invoice,
    c.variations == null ? '' : c.variations,
    c.cost == null ? '' : c.cost,
    c.pnl == null ? '' : c.pnl
  ])(costing(p)) : [])));
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
/* Who the document is from. Taken from the letterhead on an RCK quote, and
   kept here so it changes in one place when a number does. */
const BRAND = Object.assign({
  name:    'RCK NZ',
  trade:   'Asphalt & Civil Contracting',
  email:   'office@rcknz.co.nz',
  phone:   ''
}, SITE.brand || {});

/* The mark from the app icon, drawn inline so it needs no network and
   prints at any size: a lane between two edges. */
const MARK = `
  <svg class="mark" viewBox="0 0 512 512" aria-hidden="true">
    <rect width="512" height="512" rx="112" fill="#1b1e22"/>
    <path d="M182 96 L138 416" stroke="#4c525a" stroke-width="26" stroke-linecap="round" fill="none"/>
    <path d="M330 96 L374 416" stroke="#4c525a" stroke-width="26" stroke-linecap="round" fill="none"/>
    <path d="M256 108 L256 172" stroke="#c8971b" stroke-width="34" stroke-linecap="round" fill="none"/>
    <path d="M256 224 L256 288" stroke="#c8971b" stroke-width="34" stroke-linecap="round" fill="none"/>
    <path d="M256 340 L256 404" stroke="#c8971b" stroke-width="34" stroke-linecap="round" fill="none"/>
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
          <div class="when">${fmtDate(new Date().toISOString())}${S.name ? '<br>Prepared by ' + esc(S.name) : ''}</div>
        </div>
      </div>
      <h1>${esc(title)}</h1>
      ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
      <div class="rule"></div>
    </div>`;
}

/** Render, wait for any photos to load (so they aren't blank on the PDF), then print.
    The sheet is a table because a browser will repeat a thead on every printed
    page and will not repeat anything else — that is what puts the RCK line at
    the top of page four. */
async function printDoc(html, running) {
  const area = $('#printArea');
  area.innerHTML = `
    <div class="doc">
      <table class="sheet">
        <thead><tr><td>
          <div class="brandbar"><b>${esc(BRAND.name)}</b> ${esc(BRAND.trade)}
            <span class="right">${esc(running || '')}</span></div>
        </td></tr></thead>
        <tbody><tr><td>${html}</td></tr></tbody>
      </table>
    </div>`;
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

/** The job's facts, two to a line. A summary should sit across the page,
    not run down it — half the height, and no harder to read. */
function jobFacts(p) {
  const tone = p.status === 'ongoing' ? 'on' : p.status === 'completed' ? 'done' : '';
  const facts = [
    ['Job', `<strong>${jobNo(p)}</strong>`],
    ['Status', `<span class="badge ${tone}">${esc(statusLabel(p.status))}</span>`],
    ['Client', esc(p.client || '—')],
    ['Crew', esc(crewLabel(crewOf(p)))],
    ['Site', esc(p.site || '—')],
    ['Work', esc(typeLabel(typeOf(p)))],
    ['Supervisor', esc(p.supervisor || '—')],
    ['Dates', p.start_date ? fmtDate(p.start_date) + (p.end_date && p.end_date !== p.start_date
      ? ' – ' + fmtDate(p.end_date) : '') : 'not set'],
    ['Days on site', String(diaryDays(p.id).length)]
  ];
  if (p.contact) facts.push(['Client contact', esc(p.contact)]);
  if (p.started_at) facts.push(['Started', fmtDateTime(p.started_at)]);
  if (p.completed_at) facts.push(['Completed', fmtDateTime(p.completed_at)]);

  const rows = [];
  for (let i = 0; i < facts.length; i += 2) {
    const a = facts[i], b = facts[i + 1];
    rows.push(`<tr><td class="lbl">${esc(a[0])}</td><td class="val">${a[1]}</td>` +
      (b ? `<td class="lbl">${esc(b[0])}</td><td class="val">${b[1]}</td>` : '<td></td><td></td>') + '</tr>');
  }
  return `<table class="kv two">${rows.join('')}</table>` +
    (p.description ? `<p class="note">${esc(p.description)}</p>` : '');
}

/** One day, as a table. The heading lives in the thead, so a day that runs
    on to the next page takes its heading with it — which is what stops the
    orphaned headings and the half-empty pages that come of trying to keep a
    whole day together. */
function daySection(p, day, n, total) {
  const list = entriesFor(p.id, day);
  if (!list.length) return '';
  const first = list[0], last = list[list.length - 1];
  const span = daySpan(list);
  const shots = list.reduce((c, e) => c + (e.files || []).filter(f => /^image\//.test(f.type || '')).length, 0);

  return `
    <table class="dtable">
      <thead>
        <tr class="dayrow"><th colspan="4">
          ${n ? `<span class="dn">Day ${n}${total ? '/' + total : ''}</span>` : ''}${esc(fmtDayDate(day))}
          <span class="dmeta">${span ? `${esc(fmtTime(first.at))}–${esc(fmtTime(last.at))} · ${esc(span)} · ` : ''}${
            list.length} entr${list.length > 1 ? 'ies' : 'y'}${shots ? ` · ${shots} photo${shots > 1 ? 's' : ''}` : ''}</span>
        </th></tr>
        <tr class="cols"><th>Time</th><th>Entry</th><th>Notes</th><th>By</th></tr>
      </thead>
      <tbody>
        ${list.map(e => {
          const flag = e.kind === 'issue' || e.kind === 'delay';
          const n2 = (e.files || []).filter(f => /^image\//.test(f.type || '')).length;
          return `<tr${flag ? ' class="flag"' : ''}>
            <td class="dt">${esc(fmtTime(e.at))}</td>
            <td class="dk">${esc(entryLabel(e))}</td>
            <td class="dnote">${esc(e.body || '')}${n2 ? `<span class="ph"> · ${n2} photo${n2 > 1 ? 's' : ''}</span>` : ''}</td>
            <td class="dby">${esc(e.author || '')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

/** Cut a caption at a word, not mid-syllable. */
function clip(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '') + '…';
}

/** Every photograph, gathered at the back. Laid out as a table rather than
    a grid, because browsers fragment grids across pages badly — which is
    what put photographs half on one page and half on the next. Two across,
    three down: six to a page, every page the same. */
function photoAppendix(p, days) {
  const shots = [];
  days.forEach((day, i) => entriesFor(p.id, day).forEach(e => (e.files || []).forEach(f => {
    if (/^image\//.test(f.type || '')) shots.push({ f, e, day, n: i + 1 });
  })));
  if (!shots.length) return '';

  const cell = ({ f, e, day, n }) => `
    <td><figure class="photo">
      <img src="${esc(f.url)}" alt="">
      <div class="cap"><b>Day ${n} · ${esc(fmtShort(day))} · ${esc(fmtTime(e.at))}</b>
        ${esc(entryLabel(e))}${e.body ? ' — ' + esc(clip(e.body, 74)) : ''}</div>
    </figure></td>`;

  const rows = [];
  for (let i = 0; i < shots.length; i += 2) {
    rows.push(`<tr>${cell(shots[i])}${shots[i + 1] ? cell(shots[i + 1]) : '<td></td>'}</tr>`);
  }

  return `
    <div class="page-break"></div>
    <h2>Photographs — ${shots.length} over ${days.length} day${days.length > 1 ? 's' : ''}</h2>
    <table class="photos"><tbody>${rows.join('')}</tbody></table>`;
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
    ${docHead(p.status === 'completed' ? 'Job report' : 'Progress report', p.name, jobNo(p) + (p.client ? ' · ' + p.client : ''))}

    <div class="figures">
      <div><div class="n">${days.length}</div><div class="l">Days on site</div></div>
      <div><div class="n">${entries.length}</div><div class="l">Diary entries</div></div>
      <div><div class="n"${issues.length ? ' class="neg"' : ''}>${issues.length}</div><div class="l">Issues &amp; delays</div></div>
      <div><div class="n">${(isOffice() ? allDocsFor(p.id) : docsFor(p.id)).length}</div><div class="l">Documents</div></div>
    </div>

    <h2>The job</h2>
    ${jobFacts(p)}
    ${p.started_at && p.completed_at
      ? `<p class="lede">On site ${fmtDate(p.started_at)} to ${fmtDate(p.completed_at)} — ${
          (daysBetween(p.started_at, p.completed_at) || 0) + 1} day(s) elapsed.</p>` : ''}
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

    <h2>The job diary</h2>
    ${days.length
      ? days.map((d, i) => daySection(p, d, i + 1, days.length)).join('')
      : '<p>No diary entries were recorded.</p>'}

    ${photoAppendix(p, days)}

    <div class="sig">
      <div>Supervisor &amp; date</div>
      <div>Office sign-off &amp; date</div>
    </div>`, `${p.status === 'completed' ? 'Job report' : 'Progress report'} · ${jobNo(p)}`);
}

function printDayReport(p, day) {
  const list = entriesFor(p.id, day);
  const issues = list.filter(e => e.kind === 'issue' || e.kind === 'delay');
  const shots = list.reduce((n, e) => n + (e.files || []).filter(f => /^image\//.test(f.type || '')).length, 0);

  printDoc(`
    ${docHead('Daily job diary', p.name, `${jobNo(p)}${p.client ? ' · ' + p.client : ''} · ${fmtDayDate(day)}`)}

    <div class="figures">
      <div><div class="n">${esc(daySpan(list) || '—')}</div><div class="l">On site</div></div>
      <div><div class="n">${list.length}</div><div class="l">Entries</div></div>
      <div><div class="n"${issues.length ? ' class="neg"' : ''}>${issues.length}</div><div class="l">Issues &amp; delays</div></div>
      <div><div class="n">${shots}</div><div class="l">Photos</div></div>
    </div>

    <h2>The job</h2>
    ${jobFacts(p)}

    ${daySection(p, day) || '<p>No entries on this day.</p>'}

    ${photoAppendix(p, [day])}

    <div class="sig">
      <div>Supervisor &amp; date</div>
      <div>Office sign-off &amp; date</div>
    </div>`, `Daily job diary · ${jobNo(p)} · ${fmtShort(day)}`);
}

function printDocRegister(p) {
  printDoc(`
    ${docHead('Document register', p.name, jobNo(p) + (p.client ? ' · ' + p.client : ''))}
    <h2>The job</h2>
    ${jobFacts(p)}
    <h2>Documents on file</h2>
    ${docsTable(p, isOffice())}`, `Document register · ${jobNo(p)}`);
}

/** The director's report: the period's numbers, every job in it, and every
    issue and delay the crews logged — the supervisors' and the office's own
    entries added up, rather than a separate thing anyone has to write. */
/** The period, on paper. The numbers first, then how they split by client,
    then a job at a time, then everything the crews flagged — so it reads
    top-down from "how did we do" to "and why". */
function printDirectorReport(list) {
  const jobs = list || pnlJobs();
  const t = periodTotals(jobs);
  const money = (v, cents) => v == null ? '—' : esc(fmtMoney(v, cents));
  const cls = v => v == null ? '' : v < 0 ? ' class="neg"' : ' class="pos"';

  // How the period splits by client — the cut a director asks for next.
  const byClient = {};
  jobs.forEach(p => {
    const k = (p.client || '').trim() || 'No client named';
    const c = costing(p);
    const b = byClient[k] || (byClient[k] = { jobs: 0, inv: 0, cost: 0, priced: 0, days: 0, issues: 0 });
    b.jobs++;
    b.days += diaryDays(p.id).length;
    b.issues += issueCount(p.id);
    if (c.revenue != null) { b.inv += c.revenue; b.priced++; }
    if (c.cost != null)    { b.cost += c.cost; }
  });
  const clients = Object.keys(byClient).sort((a, b) => byClient[b].inv - byClient[a].inv);

  const troubles = [];
  jobs.forEach(p => entriesFor(p.id).forEach(e => {
    if ((e.kind === 'issue' || e.kind === 'delay') &&
        (!pnlFilter.from || (e.entry_date || '') >= pnlFilter.from) &&
        (!pnlFilter.to || (e.entry_date || '') <= pnlFilter.to)) troubles.push({ p, e });
  }));
  troubles.sort((a, b) => (a.e.entry_date || '').localeCompare(b.e.entry_date || ''));

  printDoc(`
    ${docHead('Profit & loss', pnlLabel(), `${jobs.length} job${jobs.length === 1 ? '' : 's'}`)}

    <div class="figures">
      <div><div class="n">${money(t.revenue)}</div><div class="l">Billed</div></div>
      <div><div class="n">${money(t.cost)}</div><div class="l">Cost</div></div>
      <div><div class="n"${cls(t.pnl)}>${money(t.pnl)}</div>
        <div class="l">Profit / loss${t.pct != null ? ' · ' + t.pct.toFixed(1) + '%' : ''}</div></div>
      <div><div class="n">${t.days}</div><div class="l">Days on site</div></div>
    </div>

    <h2>The period</h2>
    <table class="kv">
      <tr><td class="lbl">Jobs</td><td class="val" colspan="3"><strong>${t.jobs}</strong> — ${t.ongoing || 0} on site,
        ${t.planned || 0} planned, ${t.completed || 0} completed</td></tr>
      <tr><td class="lbl">Costed</td><td class="val" colspan="3">${t.done} of ${t.jobs}${
        t.done < t.jobs ? ' <em>— totals cover only the jobs with a costing on them</em>' : ''}</td></tr>
      <tr><td class="lbl">Invoice</td><td class="val" colspan="3"><strong>${money(t.invoice)}</strong>${
        t.variations ? ` plus <strong>${money(t.variations)}</strong> of variations` : ''}</td></tr>
      <tr><td class="lbl">Cost</td><td class="val" colspan="3">${money(t.cost)}</td></tr>
      <tr><td class="lbl">Diary entries</td><td class="val" colspan="3">${t.entries}</td></tr>
      <tr><td class="lbl">Issues and delays</td><td class="val" colspan="3">${t.issues}</td></tr>
    </table>

    ${clients.length > 1 ? `
    <h2>By client</h2>
    <table>
      <tr><th>Client</th><th style="width:14mm">Jobs</th><th style="width:14mm">Days</th>
        <th style="width:26mm">Invoice</th><th style="width:26mm">Cost</th><th style="width:28mm">Margin</th></tr>
      ${clients.map(k => {
        const b = byClient[k];
        const m = b.priced ? b.inv - b.cost : null;
        const pct = marginPct(b.inv, m);
        return `<tr class="avoid-break">
          <td><strong>${esc(k)}</strong>${b.issues ? `<br><em>${b.issues} issue${b.issues > 1 ? 's' : ''}</em>` : ''}</td>
          <td>${b.jobs}</td><td>${b.days}</td>
          <td>${esc(fmtMoney(b.inv))}</td><td>${esc(fmtMoney(b.cost))}</td>
          <td${cls(m)}>${m == null ? '—' : esc(fmtMoney(m))}${pct != null ? `<br><em>${pct.toFixed(1)}%</em>` : ''}</td>
        </tr>`;
      }).join('')}
    </table>` : ''}

    <h2>Job by job</h2>
    <table>
      <tr><th style="width:20mm">Job</th><th>Name and client</th><th style="width:22mm">Status</th>
        <th style="width:12mm">Days</th><th style="width:24mm">Billed</th>
        <th style="width:24mm">Cost</th><th style="width:26mm">P&amp;L</th></tr>
      ${jobs.map(p => {
        const c = costing(p);
        const m = c.pnl, pct = c.pct;
        const iss = issueCount(p.id);
        return `<tr class="avoid-break">
          <td><strong>${jobNo(p)}</strong>${c.done ? '' : '<br><em>no costing</em>'}</td>
          <td>${esc(p.name)}${p.client ? `<br><em>${esc(p.client)}</em>` : ''}${
            p.supervisor ? `<br>${esc(p.supervisor)} · ${esc(crewLabel(crewOf(p)))}` : ''}</td>
          <td>${esc(statusLabel(p.status))}</td>
          <td>${diaryDays(p.id).length}${iss ? `<br><em class="neg">${iss} iss.</em>` : ''}</td>
          <td>${money(c.revenue)}</td>
          <td>${money(c.cost)}</td>
          <td${cls(m)}>${m == null ? '—' : esc(fmtMoney(m))}${pct != null ? `<br><em>${pct.toFixed(1)}%</em>` : ''}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="7">No jobs in this period.</td></tr>'}
    </table>

    ${jobs.some(p => p.pnl_notes) ? `
    <h2>Where the money went</h2>
    ${jobs.filter(p => p.pnl_notes).map(p => `
      <p class="note avoid-break"><strong>${jobNo(p)} ${esc(p.name)}</strong> — ${esc(p.pnl_notes)}</p>`).join('')}` : ''}

    ${troubles.length ? `
    <h2>What the crews flagged</h2>
    <table>
      <tr><th style="width:26mm">Date</th><th style="width:22mm">Job</th>
        <th>What happened</th><th style="width:26mm">Logged by</th></tr>
      ${troubles.map(({ p, e }) => `<tr class="avoid-break">
        <td>${esc(fmtShort(e.entry_date))} ${esc(fmtTime(e.at))}</td>
        <td>${jobNo(p)}</td>
        <td class="note"><strong>${esc(entryLabel(e))}</strong>${e.body ? ' — ' + esc(e.body) : ''}</td>
        <td>${esc(e.author || '')}</td>
      </tr>`).join('')}
    </table>` : ''}

    <div class="sig">
      <div>Director &amp; date</div>
      <div>Reviewed &amp; date</div>
    </div>`, `Profit & loss · ${pnlLabel()}`);
}

/** The job in money: what it cost, what it billed, what is left — and
    every word the supervisors wrote, because the answer to "why did this
    one go the way it did" is nearly always in the diary. */
function printJobPnl(p) {
  const c = costing(p);
  const days = diaryDays(p.id).slice().sort();
  const money = (v, cents) => v == null ? '—' : esc(fmtMoney(v, cents));
  const cls = v => v == null ? '' : v < 0 ? ' class="neg"' : ' class="pos"';

  printDoc(`
    ${docHead('Job profit & loss', p.name, jobNo(p) + (p.client ? ' · ' + p.client : ''))}

    <div class="figures">
      <div><div class="n">${money(c.revenue)}</div><div class="l">Billed</div></div>
      <div><div class="n">${money(c.cost)}</div><div class="l">Cost</div></div>
      <div><div class="n"${cls(c.pnl)}>${money(c.pnl)}</div>
        <div class="l">Profit / loss${c.pct != null ? ' · ' + c.pct.toFixed(1) + '%' : ''}</div></div>
      <div><div class="n">${diaryDays(p.id).length}</div><div class="l">Days on site</div></div>
    </div>

    <h2>The job</h2>
    ${jobFacts(p)}

    <h2>What it cost</h2>
    <table>
      <tr><th>Description</th><th style="width:34mm">Amount</th></tr>
      ${c.lines.map(l => `<tr class="avoid-break">
        <td>${esc(lineLabel(l))}</td>
        <td>${esc(fmtMoney(lineAmount(l), true))}</td>
      </tr>`).join('') || '<tr><td colspan="2">No costs were recorded.</td></tr>'}
    </table>

    <table class="kv">
      <tr><td class="lbl">Invoice</td><td class="val" colspan="3">${money(c.invoice, true)}</td></tr>
      <tr><td class="lbl">Variations</td><td class="val" colspan="3">${money(c.variations, true)}</td></tr>
      <tr><td class="lbl">Cost</td><td class="val" colspan="3">${money(c.cost, true)}</td></tr>
      <tr><td class="lbl">Profit / loss</td><td class="val" colspan="3"><strong${cls(c.pnl)}>${
        money(c.pnl, true)}</strong>${c.pct != null ? ` · ${c.pct.toFixed(1)}%` : ''}</td></tr>
    </table>
    ${p.pnl_notes ? `<h2>How it went</h2><p class="note">${esc(p.pnl_notes)}</p>` : ''}

    <h2>What happened on site</h2>
    ${days.length
      ? days.map((d, i) => daySection(p, d, i + 1, days.length)).join('')
      : '<p>No diary entries were recorded.</p>'}

    <div class="sig">
      <div>Director &amp; date</div>
      <div>Reviewed &amp; date</div>
    </div>`, `Job P&L · ${jobNo(p)}`);
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
    ${docHead('Jobs summary', 'Every job in the period', span)}
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
    ${list.filter(p => p.status === 'completed').length} completed.</p>`, `Jobs summary · ${span}`);
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
  const feed = dayFeed(day, 14);

  const clock = new Date();
  const time = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;

  view.innerHTML = `
    <div class="kboard">
      <div class="kb-head">
        <h1>RCK — today on site</h1>
        <div class="grow muted">${esc(fmtDayDate(day))}</div>
        <div class="kb-clock">${time}</div>
      </div>

      <div class="kb-tally">
        <div class="status-ongoing"><span class="n">${onSite.length}</span><span class="l">On site now</span></div>
        <div class="status-planned"><span class="n">${planned.length}${dueNow.length
          ? `<em>${dueNow.length} due</em>` : ''}</span><span class="l">Planned</span></div>
        <div class="status-completed"><span class="n">${doneToday.length}</span><span class="l">Finished today</span></div>
      </div>

      <div class="kb-body">
        <div class="kb-col">
          <h2>On site</h2>
          <div class="kb-scroll">
            ${onSite.length ? onSite.slice(0, 9).map((p, i) => {
              const e = entriesFor(p.id, day);
              const last = e.length ? e[e.length - 1] : null;
              return `
                <div class="kb-job status-ongoing" style="--i:${i}">
                  <div>
                    <div class="kcode">${jobNo(p)}</div>
                    <div class="kno">${esc(crewLabel(crewOf(p)).toUpperCase())}</div>
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
              <div class="kb-allclear status-completed">
                <div class="big">No crews out</div>
                Nothing is running right now.
              </div>`}
            ${dueNow.length ? dueNow.slice(0, 3).map((p, i) => `
              <div class="kb-job status-planned" style="--i:${onSite.length + i}">
                <div><div class="kcode">${jobNo(p)}</div><div class="kno">DUE TO START</div></div>
                <div><div class="kttl">${esc(p.name)}</div>
                  <div class="kmeta">${esc(p.site || '—')}${p.supervisor ? ' · ' + esc(p.supervisor) : ''}</div></div>
                <div class="keta"><b>${esc(fmtShort(p.start_date))}</b>${esc(startText(p.start_date).text)}</div>
              </div>`).join('') : ''}
          </div>
        </div>

        <div class="kb-col">
          <h2>Logged today</h2>
          <div class="kb-scroll kb-grid" style="grid-template-columns:1fr">
            ${feed.length ? feed.map((e, i) => {
              const p = jobById(e.project_id) || {};
              return `
                <div class="kb-chip status-${entryTone(e)}" style="--i:${i}">
                  <div class="c">${esc(entryLabel(e))}<em>${esc(fmtTime(e.at))}</em></div>
                  <div class="s">${esc(jobNo(p))} ${esc(p.name || '')}${e.author ? ' · ' + esc(e.author) : ''}</div>
                </div>`;
            }).join('') : '<div class="kb-chip status-completed"><div class="s">Nothing logged yet today.</div></div>'}
          </div>
        </div>
      </div>

      <div class="kb-foot">
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
      ` : '<p class="muted small">They are safe on this phone and go as soon as there is signal.</p>'}
      <div class="btn-row">
        <button class="btn primary" id="retry">Try again now</button>
        <button class="btn" id="backup">${icon('download')}Download a backup</button>
      </div>
      <p class="muted tiny mt" style="margin-bottom:0">The backup is a file holding everything on this
      device, sent or not. Keep it before changing anything here.</p>
    </div>` : ''}

    <div class="card">
      <h2>Status</h2>
      <table class="data">
        <tr><th>This device</th><td>${esc(roleLabel(S.role))}${isOffice() ? '' : ' — office-only documents are hidden'}</td></tr>
        <tr><th>Connection</th><td>${S.localMode ? 'This device only' : connected() ? 'Shared database' : 'Not set up'}</td></tr>
        <tr><th>Jobs</th><td>${DB.projects.length}</td></tr>
        <tr><th>Documents</th><td>${DB.project_docs.length}</td></tr>
        <tr><th>Diary entries</th><td>${DB.diary_entries.length}</td></tr>
        <tr><th>Cost lines</th><td>${DB.job_costs.length}</td></tr>
        <tr><th>Waiting to send</th><td>${Outbox.count()}</td></tr>
        <tr><th>Version</th><td>${VERSION}${updateReady ? ' — <strong>an update is ready, close and reopen the app</strong>' : ''}</td></tr>
      </table>
      <div class="btn-row mt">
        <button class="btn sm" id="refresh">Refresh now</button>
        <button class="btn sm" id="backupAll">Download a backup</button>
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

  /* Everything this device holds, in one file. The last resort that means
     no amount of going wrong can put the work beyond reach. */
  function downloadBackup() {
    const dump = {
      app: 'RCK Dispatch', version: VERSION, taken: new Date().toISOString(),
      device: { name: S.name, role: S.role, localMode: S.localMode },
      waitingToSend: Outbox.all(),
      problem: Outbox.problem(),
      projects: DB.projects, project_docs: DB.project_docs,
      diary_entries: DB.diary_entries, job_costs: DB.job_costs
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    saveAs(href, `rck-dispatch-backup-${today()}.json`);
    setTimeout(() => URL.revokeObjectURL(href), 20000);
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
    } else if (!confirm('Clear the copy held on this device? Shared data in Supabase is not touched.')) {
      return;
    }
    localStorage.removeItem(cacheKey());
    localStorage.removeItem('rckd.outbox');
    localStorage.removeItem('rckd.outbox.problem');
    DB.projects = []; DB.project_docs = []; DB.diary_entries = []; DB.job_costs = [];
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
    const before = JSON.stringify([DB.projects.length, DB.project_docs.length, DB.diary_entries.length, DB.job_costs.length]);
    await refresh();
    const after = JSON.stringify([DB.projects.length, DB.project_docs.length, DB.diary_entries.length, DB.job_costs.length]);
    if (before !== after && ['/', '/jobs', '/today'].includes(route.path)) render();
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

function watchForUpdate(reg) {
  const seen = w => {
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) {
        updateReady = true;
        toast('Update ready — close and reopen the app');
        if (route.path === '/setup') render();
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
