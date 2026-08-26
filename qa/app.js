/* =====================================================================
   RCK QA — asphalt quality assurance, captured on site

   Plain JavaScript, no build step, no frameworks.

   A QA loads the job before leaving the yard — site, client, date, what
   kind of work it is. On site they set the weather, then work the job
   patch by patch: milling, the depth check, spraying, chip seal, paving.
   Each step takes as many photos as it takes. The depths get punched in
   as they are written on the ground, and the app says on the spot whether
   they are inside the design depth.

   It replaces the workbook, the string sheet and the loose site photos.
   It does not draw the as-built — that is still a separate job.
   ===================================================================== */
'use strict';

const VERSION = '1.0.0';

/* A newer version has downloaded but can't take over until every tab of the
   old one is gone. Rather than leave someone tapping a feature that isn't
   there yet, Settings says so. */
let updateReady = false;

/* --------------------------------------------------------- job states */
/* Three, and only three. The QA record is either waiting to be worked,
   being worked, or finished with. */
const JOB_STATUS = [
  { key: 'planned',  label: 'Loaded',   short: 'Loaded',   tone: 'planned',
    blurb: 'Set up, not on site yet' },
  { key: 'onsite',   label: 'On site',  short: 'On site',  tone: 'ongoing',
    blurb: 'Being captured now' },
  { key: 'complete', label: 'Complete', short: 'Done',     tone: 'completed',
    blurb: 'Captured and signed off' }
];

/* ------------------------------------------------------- types of work */
/* The four things RCK does in asphalt. A job carries any combination of
   them — milling and paving is the common one, and a car park can be all
   four. What a job is ticked for decides which steps a new patch starts
   with, and nothing else: a patch can always be given more. */
const WORK_TYPES = [
  { key: 'milling',  label: 'Milling',      steps: ['milling', 'depth'] },
  { key: 'paving',   label: 'Paving',       steps: ['prelevel', 'temp', 'paving'] },
  { key: 'spraying', label: 'Spraying',     steps: ['spray'] },
  { key: 'chipseal', label: 'Chip sealing', steps: ['chip'] }
];

/* -------------------------------------------------------- patch steps */
/* What happens to a patch, in the order it happens on the ground. A patch
   is milled, the depth is strung and read, emulsion goes down, chip goes
   over it, and it is paved — with the mat temperature taken as it lays.
   Before and after bracket the lot.

   `reading` marks the two steps that carry numbers as well as photos.
   Anyone can add a step of their own on the patch itself; a step exists
   from the moment a patch is given one, so there is no list to keep tidy. */
const STEPS = [
  { key: 'before',   label: 'Before',             hint: 'The patch as you found it' },
  { key: 'milling',  label: 'Milling',            hint: 'The miller working the patch' },
  { key: 'depth',    label: 'Depth check',        hint: 'String line across, depths written on the ground',
    reading: 'depth' },
  { key: 'spray',    label: 'Spraying',           hint: 'Emulsion down' },
  { key: 'chip',     label: 'Chip seal',          hint: 'Chip over the emulsion' },
  { key: 'prelevel', label: 'Pre-levelling',      hint: 'The levelling course before the surface' },
  { key: 'temp',     label: 'Paving temperature', hint: 'The mat as it goes down',
    reading: 'temp' },
  { key: 'paving',   label: 'Paving',             hint: 'The paver working the patch' },
  { key: 'after',    label: 'After',              hint: 'The finished patch' }
];

/* Photos that belong to the whole site rather than to one patch. */
const SITE_STEPS = [
  { key: 'site_before', label: 'Site before', hint: 'The whole site before anything starts' },
  { key: 'setup',       label: 'Set up & traffic management', hint: 'Cones, signs, the closure' },
  { key: 'materials',   label: 'Materials & dockets', hint: 'Mix dockets, emulsion, chip' },
  { key: 'site_after',  label: 'Site after',  hint: 'The whole site finished' },
  { key: 'general',     label: 'General',     hint: 'Anything else worth a photo' }
];

/* ---------------------------------------------------------- readings */
/* Two kinds of number get taken on a patch, and they are judged in two
   different ways. A depth has to land inside a band either side of what
   the patch was designed at. A mat temperature only has a floor — too hot
   is somebody else's problem, too cold is a failed patch. */
const READINGS = {
  depth: {
    kind: 'depth', label: 'Depth', plural: 'Depths', unit: 'mm', step: 'depth',
    band: true,
    specField: 'design_depth', specLabel: 'Design depth',
    tolField:  'depth_tol',    tolLabel:  'Tolerance ±',
    placeholder: '45',
    hint: 'The numbers as you write them on the ground, one after another.',
    where: 'Where (optional)', wherePlaceholder: 'e.g. Ch 12 LHS'
  },
  temp: {
    kind: 'temp', label: 'Temperature', plural: 'Temperatures', unit: '°C', step: 'temp',
    band: false,
    specField: 'min_temp', specLabel: 'Minimum temperature',
    placeholder: '148',
    hint: 'The mat as it goes down. Anything under the minimum is called out.',
    where: 'Where (optional)', wherePlaceholder: 'e.g. first load'
  }
};

/* ----------------------------------------------------------- weather */
/* Written down because it is the first thing asked when a seal fails, and
   because nobody remembers in March what the sky was doing in November. */
const WEATHER = [
  { key: 'fine',     label: 'Fine' },
  { key: 'overcast', label: 'Overcast' },
  { key: 'showers',  label: 'Showers' },
  { key: 'rain',     label: 'Raining' },
  { key: 'windy',    label: 'Windy' },
  { key: 'cold',     label: 'Cold / frost' }
];
const GROUND = [
  { key: 'dry',  label: 'Dry' },
  { key: 'damp', label: 'Damp' },
  { key: 'wet',  label: 'Wet' }
];

/* ------------------------------------------------------------- roles */
/* Everybody captures. The only thing a manager has that a QA doesn't is
   the power to change or remove somebody else's record, which is exactly
   the thing you don't want a gloved thumb doing on a tailgate. */
const ROLES = [
  { key: 'qa',      label: 'QA',      blurb: 'Captures the QA on site',
    hint: 'Creates jobs, adds patches, takes the photos, punches in the depths, prints the reports.' },
  { key: 'manager', label: 'Manager', blurb: 'All of that, plus tidying up',
    hint: 'All of that, plus editing and archiving a job somebody else captured.',
    manage: true }
];
function roleDef(key) { return ROLES.find(r => r.key === key) || ROLES[0]; }
function roleLabel(key) { return roleDef(key).label; }

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
/** A key from free text: "Tack coat" → "tack_coat". Used for added steps. */
function slug(text) {
  return String(text || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'step';
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
/** 24-hour, because that is how a site record is written. */
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
function daysFromToday(dateStr) {
  if (!dateStr) return null;
  const a = new Date(today() + 'T00:00:00');
  const b = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}
/** Human "when" text for the date a job is booked for. */
function whenText(dateStr) {
  const n = daysFromToday(dateStr);
  if (n == null) return { text: 'no date set', late: false };
  if (n === 0) return { text: 'today', late: false };
  if (n === 1) return { text: 'tomorrow', late: false };
  if (n > 1)   return { text: `in ${n} days`, late: false };
  if (n === -1) return { text: 'yesterday', late: false };
  return { text: `${-n} days ago`, late: false };
}

/** A number the way a QA sheet writes it: no trailing zeros for show. */
function num(v, dp) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  const s = n.toFixed(dp == null ? 1 : dp);
  return s.replace(/\.0+$/, '');
}
function isNum(v) { return v != null && v !== '' && isFinite(Number(v)); }

function jobNo(j) { return 'QA-' + String(j && j.number || 0).padStart(4, '0'); }

function statusDef(key) { return JOB_STATUS.find(s => s.key === key) || JOB_STATUS[0]; }
function statusLabel(key) { return statusDef(key).label; }
function statusTone(key) { return statusDef(key).tone; }

/* --------------------------------------------------- types and steps */
function workTypeLabel(key) {
  const t = WORK_TYPES.find(w => w.key === key);
  return t ? t.label : humanise(key);
}
/** The types ticked on a job, as an array of keys. */
function typesOf(j) {
  const raw = (j && j.work_types) || [];
  return Array.isArray(raw) ? raw : [];
}
function typesText(j) {
  const list = typesOf(j).map(workTypeLabel);
  return list.length ? list.join(' · ') : 'No work type set';
}

function builtinStep(key) { return STEPS.find(s => s.key === key); }
/** The steps on this patch, as [{key, label}] in the order they happen.
    A patch stores its own list — including any step somebody added — so a
    printed report reads the same next year as it did on the day. */
function stepsOf(patch) {
  const raw = (patch && patch.steps) || [];
  const list = (Array.isArray(raw) ? raw : [])
    .map(s => (typeof s === 'string' ? { key: s, label: '' } : s))
    .filter(s => s && s.key);
  return list.map(s => ({ key: s.key, label: s.label || (builtinStep(s.key) || {}).label || humanise(s.key) }));
}
function stepLabel(patch, key) {
  const found = stepsOf(patch).find(s => s.key === key);
  if (found) return found.label;
  const b = builtinStep(key) || SITE_STEPS.find(s => s.key === key);
  return b ? b.label : humanise(key);
}
function stepHint(key) {
  const b = builtinStep(key) || SITE_STEPS.find(s => s.key === key);
  return b ? b.hint : '';
}
/** Which reading, if any, a step carries: 'depth', 'temp' or nothing. */
function stepReading(key) { return (builtinStep(key) || {}).reading || ''; }

/** The steps a new patch starts with, from what the job is ticked for.
    Before and after are always there — every patch is worth a photo of
    how it started and how it ended. */
function defaultSteps(job) {
  const wanted = new Set(['before', 'after']);
  typesOf(job).forEach(k => {
    const t = WORK_TYPES.find(w => w.key === k);
    if (t) t.steps.forEach(s => wanted.add(s));
  });
  const list = STEPS.filter(s => wanted.has(s.key)).map(s => ({ key: s.key, label: s.label }));
  // Nothing ticked yet: give them the full asphalt run rather than an
  // empty patch, since a step nobody uses costs a glance and no more.
  return list.length > 2 ? list : STEPS.map(s => ({ key: s.key, label: s.label }));
}

/* ------------------------------------------------------------- icons */
const ICONS = {
  pin:     '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>',
  camera:  '<path d="M4 8.5h3.1l1.5-2.2h6.8l1.5 2.2H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18v-8A1.5 1.5 0 0 1 4 8.5z"/><circle cx="12" cy="13.6" r="3.4"/>',
  image:   '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="8.8" cy="9.6" r="1.6"/><path d="M4 17l4.8-4.6 3.4 3.2 3-2.6L20 17"/>',
  check:   '<path d="M4.5 12.5l5 5 10-11"/>',
  plus:    '<path d="M12 5.5v13M5.5 12h13"/>',
  x:       '<path d="M6 6l12 12M18 6L6 18"/>',
  chev:    '<path d="M9 5l7 7-7 7"/>',
  ruler:   '<rect x="2.6" y="8.4" width="18.8" height="7.2" rx="1.6"/><path d="M6.4 8.4v3M10.2 8.4v4.4M14 8.4v3M17.8 8.4v4.4"/>',
  temp:    '<path d="M14 14.8V5.5a2 2 0 1 0-4 0v9.3a4 4 0 1 0 4 0z"/><circle cx="12" cy="17.6" r="1.6" fill="currentColor" stroke="none"/>',
  sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6"/>',
  print:   '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="2"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
  trash:   '<path d="M4.5 6.5h15M9.5 6.5V4.4h5v2.1M6.5 6.5l.9 13a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13"/>',
  share:   '<path d="M12 15.5V4M8.4 7.2L12 3.6l3.6 3.6"/><path d="M5.5 12.6V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-6.4"/>',
  copy:    '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  download:'<path d="M12 3.8v11M8.4 11.2L12 14.8l3.6-3.6"/><path d="M5 15.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-3.5"/>',
  edit:    '<path d="M4.5 19.5h3.2L18.4 8.8a2.2 2.2 0 0 0-3.2-3.2L4.5 16.3z"/>',
  patch:   '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M3.5 10.5h17M9 5.5v13"/>',
  clock:   '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>',
  flag:    '<path d="M6 21V4.5M6 5.2h11l-2.2 3.4L17 12H6"/>'
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
const SITE = window.RCKQ_CONFIG || {};
const DEFAULTS = Object.assign({
  designDepth: 40, depthTolerance: 5, minTemperature: 130
}, SITE.defaults || {});

const Settings = {
  read() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('rckq.settings') || '{}'); } catch (e) {}
    return Object.assign({
      supabaseUrl: SITE.supabaseUrl || '',
      supabaseKey: SITE.supabaseKey || '',
      name: '',
      role: 'qa',
      geo: true,          // stamp photos with where they were taken
      localMode: false
    }, saved);
  },
  write(patch) {
    const next = Object.assign(Settings.read(), patch);
    localStorage.setItem('rckq.settings', JSON.stringify(next));
    S = next;
    return next;
  }
};
let S = Settings.read();

/** Can this device change or remove somebody else's record? */
const isManager = () => !!roleDef(S.role).manage;
const connected = () => !S.localMode && !!S.supabaseUrl && !!S.supabaseKey;
function whoami() { return S.name || 'Unnamed QA'; }

/* ================================================================
   Local cache — the app opens instantly and keeps working in a cutting
   with no signal, which is most of a day
   ================================================================ */
const DB = { qa_jobs: [], qa_patches: [], qa_photos: [], qa_readings: [], localSeq: 0 };
const TABLES = ['qa_jobs', 'qa_patches', 'qa_photos', 'qa_readings'];

function cacheKey() { return 'rckq.cache.' + (S.localMode ? 'local' : 'remote'); }

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (raw) {
      TABLES.forEach(t => { DB[t] = raw[t] || []; });
      DB.localSeq = raw.localSeq || 0;
    }
  } catch (e) {}
}
function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(DB));
  } catch (e) {
    // Storage full — almost always photos held on the phone waiting for
    // signal. Nothing is lost yet, but it will be if they keep shooting.
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
   server's answer silently deletes the twelve depths somebody is standing
   on a closed lane typing: they vanish off the screen and out of the cache
   while the only copy sits in a queue nobody was told about. */
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
    const [jobs, patches, photos, readings] = await Promise.all([
      rest('qa_jobs?select=*&order=number.desc&limit=3000',        { headers: restHeaders() }),
      rest('qa_patches?select=*&order=number.asc&limit=20000',     { headers: restHeaders() }),
      rest('qa_photos?select=*&order=taken_at.asc&limit=40000',    { headers: restHeaders() }),
      rest('qa_readings?select=*&order=seq.asc&limit=60000',       { headers: restHeaders() })
    ]);
    DB.qa_jobs     = reconcile('qa_jobs', jobs || []);
    DB.qa_patches  = reconcile('qa_patches', patches || []);
    DB.qa_photos   = reconcile('qa_photos', photos || []);
    DB.qa_readings = reconcile('qa_readings', readings || []);
    saveCache();
  },

  async insert(table, row) {
    if (!row.id) row.id = uid();
    if (!connected()) {
      if (table === 'qa_jobs' && !row.number) row.number = ++DB.localSeq;
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
    const meta = { name: file.name || 'photo.jpg', type: file.type || '', size: file.size || 0 };
    if (!connected()) {
      return Object.assign(meta, { url: await fileToDataUrl(file), local: true });
    }
    try {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${(file.name || 'photo.jpg').replace(/[^\w.\-]+/g, '_')}`;
      const base = S.supabaseUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/storage/v1/object/qa-files/${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: restHeaders({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }),
        body: file
      });
      if (!res.ok) throw new Error(await res.text());
      return Object.assign(meta, { url: `${base}/storage/v1/object/public/qa-files/${encodeURIComponent(path)}` });
    } catch (err) {
      // Keep the photo rather than lose it; it rides along in the record
      // as data and goes up whole when the queue drains.
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
    try { return JSON.parse(localStorage.getItem('rckq.outbox') || '[]'); } catch (e) { return []; }
  },
  save(list) { localStorage.setItem('rckq.outbox', JSON.stringify(list)); },
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
    try { return JSON.parse(localStorage.getItem('rckq.outbox.problem') || 'null'); } catch (e) { return null; }
  },
  setProblem(p) {
    if (p) localStorage.setItem('rckq.outbox.problem', JSON.stringify(p));
    else localStorage.removeItem('rckq.outbox.problem');
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
          const row = await sendable(op.row);
          await rest(op.table, {
            method: 'POST',
            headers: restHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify(row)
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

/* A photo taken with no signal is queued with the picture itself inside the
   row as a data URL, because that was the only place to keep it. Sending it
   that way would put a megabyte of base64 in a text column and leave the
   storage bucket empty, so the file goes up properly first and the row
   carries the real URL. If the upload still won't go, the row waits. */
async function sendable(row) {
  if (!row || !row.file_url || !/^data:/.test(row.file_url)) return row;
  const blob = await (await fetch(row.file_url)).blob();
  const file = new File([blob], row.file_name || 'photo.jpg', { type: blob.type || 'image/jpeg' });
  const up = await Store.upload(file);
  if (up.local) throw new Error('photo upload not available yet');
  const fixed = Object.assign({}, row, { file_url: up.url, file_size: up.size || row.file_size });
  upsert('qa_photos', { id: row.id, file_url: up.url });
  saveCache();
  return fixed;
}

/* ================================================================
   Reading the data
   ================================================================ */
const jobById     = id => DB.qa_jobs.find(j => j.id === id);
const patchById   = id => DB.qa_patches.find(p => p.id === id);
const photoById   = id => DB.qa_photos.find(p => p.id === id);

function activeJobs() { return DB.qa_jobs.filter(j => !j.archived); }

/** The patches on a job, in the order they were added. */
function patchesFor(jobId) {
  return DB.qa_patches.filter(p => p.job_id === jobId)
    .slice().sort((a, b) => (a.number || 0) - (b.number || 0));
}

const byTaken = (a, b) => String(a.taken_at || '').localeCompare(String(b.taken_at || ''));

/** Every photo on a job, patches and site together. */
function jobPhotos(jobId) { return DB.qa_photos.filter(p => p.job_id === jobId).slice().sort(byTaken); }
function patchPhotos(patchId) { return DB.qa_photos.filter(p => p.patch_id === patchId).slice().sort(byTaken); }
/** One step of one patch. */
function stepPhotos(patchId, step) {
  return DB.qa_photos.filter(p => p.patch_id === patchId && p.step === step).slice().sort(byTaken);
}
/** Photos filed against the whole site rather than a patch. */
function sitePhotos(jobId, step) {
  return DB.qa_photos
    .filter(p => p.job_id === jobId && !p.patch_id && (step === undefined || p.step === step))
    .slice().sort(byTaken);
}

/** The readings of one kind on one patch, in the order they were taken. */
function readingsFor(patchId, kind) {
  return DB.qa_readings.filter(r => r.patch_id === patchId && r.kind === kind)
    .slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
}
function jobReadings(jobId, kind) {
  return DB.qa_readings.filter(r => r.job_id === jobId && (kind === undefined || r.kind === kind));
}

/** What the patch was supposed to measure, and how far out it may be. */
function spec(patch, kind) {
  const cfg = READINGS[kind];
  if (!cfg || !patch) return { target: null, tol: null };
  const target = isNum(patch[cfg.specField]) ? Number(patch[cfg.specField]) : null;
  const tol = cfg.band ? (isNum(patch[cfg.tolField]) ? Number(patch[cfg.tolField]) : DEFAULTS.depthTolerance) : null;
  return { target, tol };
}

/** 'ok' · 'low' · 'high' · 'none' when nothing was specified to judge it by.
    A depth has a band either side of the design depth. A mat temperature
    has a floor and no ceiling. */
function verdict(patch, kind, value) {
  const v = Number(value);
  const { target, tol } = spec(patch, kind);
  if (!isFinite(v) || target == null) return 'none';
  if (READINGS[kind] && READINGS[kind].band) {
    if (v < target - tol) return 'low';
    if (v > target + tol) return 'high';
    return 'ok';
  }
  return v < target ? 'low' : 'ok';
}
const isOut = v => v === 'low' || v === 'high';

/** Count, spread and average — the four numbers a string sheet ends with. */
function readingStats(patch, kind) {
  const list = readingsFor(patch.id, kind);
  const vals = list.map(r => Number(r.value)).filter(v => isFinite(v));
  const out = list.filter(r => isOut(verdict(patch, kind, r.value))).length;
  if (!vals.length) return { n: 0, out: 0, min: null, max: null, avg: null, list };
  const sum = vals.reduce((a, b) => a + b, 0);
  return {
    n: vals.length, out,
    min: Math.min.apply(null, vals),
    max: Math.max.apply(null, vals),
    avg: sum / vals.length,
    list
  };
}

/** Readings anywhere on this patch that fall outside what was asked for. */
function patchOutOfSpec(patch) {
  return Object.keys(READINGS)
    .reduce((n, kind) => n + readingStats(patch, kind).out, 0);
}
function jobOutOfSpec(job) {
  return patchesFor(job.id).reduce((n, p) => n + patchOutOfSpec(p), 0);
}

/** How much of a patch has been photographed: a step counts as done once
    there is a photo against it, and a step that carries readings needs a
    number as well as a picture. */
function stepDone(patch, key) {
  const hasPhoto = stepPhotos(patch.id, key).length > 0;
  const kind = stepReading(key);
  if (!kind) return hasPhoto;
  return hasPhoto || readingsFor(patch.id, kind).length > 0;
}
function patchProgress(patch) {
  const steps = stepsOf(patch);
  const done = steps.filter(s => stepDone(patch, s.key)).length;
  return { done, total: steps.length, pct: steps.length ? Math.round(done / steps.length * 100) : 0 };
}
function jobProgress(job) {
  const list = patchesFor(job.id);
  const totals = list.reduce((acc, p) => {
    const pr = patchProgress(p);
    acc.done += pr.done; acc.total += pr.total;
    return acc;
  }, { done: 0, total: 0 });
  return Object.assign(totals, {
    pct: totals.total ? Math.round(totals.done / totals.total * 100) : 0,
    patches: list.length
  });
}

/** Everything still owed on a job, said in the QA's own words. Used on the
    job screen and again before signing off, because a QA record that is
    missing the after photos is worth less than no record at all. */
function whatsMissing(job) {
  const gaps = [];
  patchesFor(job.id).forEach(p => {
    const short = stepsOf(p).filter(s => !stepDone(p, s.key)).map(s => s.label);
    if (short.length) gaps.push({ patch: p, steps: short });
  });
  return gaps;
}

/* Weather that argues with the work. Emulsion onto standing water and chip
   into the rain are the two that come back as a claim, so the app says it
   once, on the job screen, and then gets out of the way. */
function weatherWarning(job) {
  const wet = job.weather === 'rain' || job.weather === 'showers' || job.ground === 'wet';
  if (!wet) return '';
  const risky = typesOf(job).filter(t => t === 'spraying' || t === 'chipseal').map(workTypeLabel);
  if (!risky.length) return '';
  return `${risky.join(' and ')} recorded in ${job.weather === 'rain' ? 'rain' :
    job.ground === 'wet' ? 'wet conditions' : 'showers'}. Worth a note on the job about why it went ahead.`;
}

function weatherText(job) {
  const bits = [];
  const w = WEATHER.find(x => x.key === job.weather);
  if (w) bits.push(w.label);
  if (isNum(job.air_temp)) bits.push(num(job.air_temp, 0) + '°C');
  const g = GROUND.find(x => x.key === job.ground);
  if (g) bits.push(g.label + ' surface');
  if (job.wind) bits.push(job.wind);
  return bits.join(' · ');
}

/** Jobs booked for today, or already being worked. */
function isTodayJob(j) {
  return j.status === 'onsite' || (j.qa_date || '').slice(0, 10) === today();
}
function boardOrder(list) {
  const rank = { onsite: 0, planned: 1, complete: 2 };
  return list.slice().sort((a, b) => {
    const r = (rank[a.status] || 9) - (rank[b.status] || 9);
    if (r) return r;
    const d = String(b.qa_date || '').localeCompare(String(a.qa_date || ''));
    if (d) return d;
    return (b.number || 0) - (a.number || 0);
  });
}

/* ================================================================
   Changing the data
   ================================================================ */
async function createJob(data) {
  const row = Object.assign({
    id: uid(),
    status: 'planned',
    qa_date: today(),
    work_types: [],
    created_by: whoami(),
    created_at: new Date().toISOString()
  }, data);
  return Store.insert('qa_jobs', row);
}

async function setJobStatus(job, status) {
  const patch = { status };
  if (status === 'onsite' && !job.started_at) {
    patch.started_at = new Date().toISOString();
    patch.started_by = whoami();
  }
  if (status === 'complete') {
    patch.completed_at = new Date().toISOString();
    patch.completed_by = whoami();
  }
  if (status !== 'complete' && job.completed_at) {
    patch.completed_at = null; patch.completed_by = '';
  }
  await Store.patch('qa_jobs', job.id, patch);
}

async function addPatch(job, data) {
  const existing = patchesFor(job.id);
  const n = existing.reduce((m, p) => Math.max(m, p.number || 0), 0) + 1;
  const row = Object.assign({
    id: uid(),
    job_id: job.id,
    number: n,
    name: 'Patch ' + n,
    location: '',
    steps: defaultSteps(job),
    design_depth: DEFAULTS.designDepth,
    depth_tol: DEFAULTS.depthTolerance,
    min_temp: DEFAULTS.minTemperature,
    notes: '',
    created_by: whoami(),
    created_at: new Date().toISOString()
  }, data);
  return Store.insert('qa_patches', row);
}

/** Add a step to a patch that wasn't in its list — the pre-level nobody
    expected, a second coat, a tack. Keeps the canonical order for the
    built-in steps and puts anything typed at the end, where it happened. */
async function addStep(patch, name) {
  const label = String(name || '').trim();
  if (!label) return;
  const key = slug(label);
  const have = stepsOf(patch);
  if (have.some(s => s.key === key)) { toast(label + ' is already on this patch.'); return; }
  const builtin = builtinStep(key);
  let next;
  if (builtin) {
    const order = STEPS.map(s => s.key);
    next = have.concat([{ key, label: builtin.label }])
      .sort((a, b) => {
        const ai = order.indexOf(a.key), bi = order.indexOf(b.key);
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      });
  } else {
    next = have.concat([{ key, label }]);
  }
  await Store.patch('qa_patches', patch.id, { steps: next });
}

/** One photo row per file. Files are shrunk first, then uploaded, then the
    row is written — so a row never points at a picture that isn't there. */
async function addPhotos(job, patchId, step, label, files, caption) {
  const fix = S.geo ? await getFix() : null;
  const rows = [];
  for (const raw of files) {
    const file = await compressImage(raw);
    const up = await Store.upload(file);
    const row = await Store.insert('qa_photos', {
      id: uid(),
      job_id: job.id,
      patch_id: patchId || null,
      step, step_label: label || stepLabel(patchById(patchId), step),
      file_name: up.name, file_url: up.url, file_type: up.type, file_size: up.size,
      caption: caption || '',
      lat: fix ? fix.lat : null,
      lng: fix ? fix.lng : null,
      taken_at: new Date().toISOString(),
      author: whoami()
    });
    rows.push(row);
  }
  return rows;
}

async function addReading(job, patch, kind, value, where) {
  const seq = readingsFor(patch.id, kind).reduce((m, r) => Math.max(m, r.seq || 0), 0) + 1;
  return Store.insert('qa_readings', {
    id: uid(),
    job_id: job.id,
    patch_id: patch.id,
    kind, seq,
    value: Number(value),
    unit: READINGS[kind].unit,
    position: String(where || '').trim(),
    author: whoami(),
    taken_at: new Date().toISOString()
  });
}

/** Removing a patch takes its photos and readings with it. The database
    cascades on its own; this keeps the phone's copy honest in the meantime,
    and is the whole story in practice mode. */
async function removePatch(patch) {
  DB.qa_photos.filter(p => p.patch_id === patch.id).forEach(p => drop('qa_photos', p.id));
  DB.qa_readings.filter(r => r.patch_id === patch.id).forEach(r => drop('qa_readings', r.id));
  await Store.remove('qa_patches', patch.id);
}

async function removeJob(job) {
  patchesFor(job.id).forEach(p => {
    DB.qa_photos.filter(x => x.patch_id === p.id).forEach(x => drop('qa_photos', x.id));
    DB.qa_readings.filter(x => x.patch_id === p.id).forEach(x => drop('qa_readings', x.id));
    drop('qa_patches', p.id);
  });
  sitePhotos(job.id).forEach(x => drop('qa_photos', x.id));
  await Store.remove('qa_jobs', job.id);
}

/* ================================================================
   The camera
   ================================================================ */
/* Shrunk on the phone so a patch's worth of photos uploads over one bar of
   signal. 1600px on the long edge still shows a joint, a chip and the
   number chalked on the ground. */
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
    const max = 1600;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 700000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.78));
    if (!blob) return file;
    return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    return file;
  }
}

/* Where the photo was taken. Best effort and never in the way: if the fix
   takes more than six seconds the photo goes without one, because a QA
   standing in a live lane is not waiting on a satellite. A fix is good for
   a couple of minutes — nobody walks far between two photos of a patch. */
let lastFix = null;
async function getFix() {
  if (!navigator.geolocation) return null;
  if (lastFix && Date.now() - lastFix.at < 120000) return lastFix;
  try {
    const pos = await new Promise((res, rej) => {
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true, timeout: 6000, maximumAge: 60000
      });
    });
    lastFix = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6), at: Date.now() };
    return lastFix;
  } catch (e) {
    return null;
  }
}
function mapLink(p) {
  return p && p.lat != null && p.lng != null
    ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : '';
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
function seg(n) { return route.path.split('/')[n] || ''; }

const SCREENS = {
  '/':        { title: 'QA jobs',      render: renderBoard },
  '/today':   { title: 'Today',        render: renderToday },
  '/new':     { title: 'New QA job',   render: renderJobEdit, back: true },
  '/reports': { title: 'Reports',      render: renderReports, back: true },
  '/archived':{ title: 'Archived',     render: renderArchived, back: true },
  '/setup':   { title: 'Settings',     render: renderSetup,   back: true },
  '/join':    { title: 'Set up',       render: renderJoin }
};

/* Coming back to a list should put you where you left it, not at the top —
   which matters most on a patch with forty photos on it. */
const scrollMemory = {};
let lastPath = null;

function restoreScroll(path) {
  const keepsPlace = path === '/' || path === '/today' ||
    path.startsWith('/patch/') || path.startsWith('/step/') || path.startsWith('/patches/');
  const y = keepsPlace ? (scrollMemory[path] || 0) : 0;
  requestAnimationFrame(() => window.scrollTo(0, y));
}

function render() {
  if (lastPath !== null) scrollMemory[lastPath] = window.scrollY;
  route = parseHash();
  lastPath = route.path;
  closePhoto();

  let screen = SCREENS[route.path];
  let back = false;

  if (route.path.startsWith('/job/'))           { screen = { title: 'QA job',   render: renderJob };       back = true; }
  else if (route.path.startsWith('/patches/'))  { screen = { title: 'Patches',  render: renderPatches };   back = true; }
  else if (route.path.startsWith('/site/'))     { screen = { title: 'Site photos', render: renderSite };   back = true; }
  else if (route.path.startsWith('/edit/'))     { screen = { title: 'Edit job', render: renderJobEdit };   back = true; }
  else if (route.path.startsWith('/patch/'))    { screen = { title: 'Patch',    render: renderPatch };     back = true; }
  else if (route.path.startsWith('/patchnew/')) { screen = { title: 'New patch',  render: renderPatchEdit }; back = true; }
  else if (route.path.startsWith('/patchedit/')){ screen = { title: 'Edit patch', render: renderPatchEdit }; back = true; }
  else if (route.path.startsWith('/step/'))     { screen = { title: 'Capture',  render: renderStep };      back = true; }
  else if (route.path.startsWith('/sitestep/')) { screen = { title: 'Capture',  render: renderStep };      back = true; }
  else if (route.path.startsWith('/signoff/'))  { screen = { title: 'Sign off', render: renderSignoff };   back = true; }

  if (!screen) { go('#/'); return; }

  $('#title').textContent = screen.title;
  $('#backBtn').hidden = !(back || screen.back);
  $('#menu').hidden = true;

  $$('#tabbar a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + route.path));

  const view = $('#view');
  view.innerHTML = '';
  // Restart the entrance animation on every navigation.
  view.classList.remove('enter');
  void view.offsetWidth;
  view.classList.add('enter');

  if (needsSetup() && route.path !== '/setup' && route.path !== '/join') { renderWelcome(view); return; }
  screen.render(view);
  paintUnsent(view);
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
       They are safe on this phone — photos and all — and will go as soon as there is signal.`;
  view.insertBefore(box, view.firstChild);
}

function needsSetup() {
  return !S.name || (!connected() && !S.localMode);
}

/* -------------------------------------------------------- lightbox */
/* A photo big enough to argue about, and one tap to get out of it. */
function openPhoto(id) {
  const p = photoById(id);
  if (!p) return;
  const box = $('#lightbox');
  const patch = p.patch_id ? patchById(p.patch_id) : null;
  const where = [patch ? patch.name : 'Site', p.step_label || stepLabel(patch, p.step)].filter(Boolean).join(' · ');
  box.innerHTML = `
    <img src="${esc(p.file_url)}" alt="">
    <div class="cap"><b>${esc(where)}</b> — ${esc(fmtDateTime(p.taken_at))}${
      p.author ? ' · ' + esc(p.author) : ''}${p.caption ? '<br>' + esc(p.caption) : ''}${
      mapLink(p) ? `<br><a href="${esc(mapLink(p))}" target="_blank" rel="noopener"
        style="color:#8ab4f8">Where this was taken</a>` : ''}</div>`;
  box.hidden = false;
}
function closePhoto() { const b = $('#lightbox'); if (b) { b.hidden = true; b.innerHTML = ''; } }

/* Every screen that shows photos wires them the same way. */
function wirePhotos(root) {
  $$('[data-photo]', root).forEach(el => { el.onclick = () => openPhoto(el.dataset.photo); });
}

/* ================================================================
   Screen — first run
   ================================================================ */
function renderWelcome(view) {
  view.innerHTML = `
    <div class="card">
      <h2>RCK QA</h2>
      <p class="muted small">Asphalt QA on the phone: the site details, the photos for every
      step of every patch, and the string depths — one record, one report at the end.</p>
      <p class="muted small">Put your name in and connect this phone to the shared data to start.</p>
      <a class="btn primary wide" href="#/setup">Set this phone up</a>
    </div>`;
}

/* ================================================================
   Screen — the board
   ================================================================ */
function jobCard(j, i) {
  const pr = jobProgress(j);
  const out = jobOutOfSpec(j);
  const when = whenText(j.qa_date);
  const shots = jobPhotos(j.id).length;
  return `
    <button class="job-card status-${statusTone(j.status)}" data-id="${j.id}" style="--i:${i}">
      <div class="num">${jobNo(j)}</div>
      <div class="name">${esc(j.name || 'Unnamed site')}</div>
      <div class="client">${esc(j.client || 'No client named')}</div>
      <div class="line">${icon('clock')}${esc(fmtShort(j.qa_date))} — ${esc(when.text)}</div>
      ${j.site ? `<div class="line">${icon('pin')}${esc(j.site)}</div>` : ''}
      <div class="line">${icon('patch')}${esc(typesText(j))}</div>
      <div class="bar ${pr.pct >= 100 ? '' : pr.pct > 0 ? 'part' : 'none'}"><i style="width:${Math.max(pr.pct, 2)}%"></i></div>
      <div class="foot">
        <span class="pill"><span class="swatch"></span>${statusLabel(j.status)}</span>
        <span class="pill plain">${pr.patches} patch${pr.patches === 1 ? '' : 'es'}</span>
        <span class="pill plain">${shots} photo${shots === 1 ? '' : 's'}</span>
        ${out ? `<span class="pill status-red"><span class="swatch"></span>${out} out of spec</span>` : ''}
      </div>
    </button>`;
}

function wireJobCards(root) {
  $$('.job-card', root).forEach(b => b.onclick = () => go('#/job/' + b.dataset.id));
}

function renderBoard(view) {
  const jobs = activeJobs();
  const filter = route.query.s || '';
  const counts = JOB_STATUS.map(s => ({ s, n: jobs.filter(j => j.status === s.key).length }));
  const shown = boardOrder(filter ? jobs.filter(j => j.status === filter) : jobs);

  view.innerHTML = `
    <div class="tally">
      ${counts.map(({ s, n }) => `
        <button class="status-${s.tone}" data-s="${s.key}" aria-pressed="${filter === s.key}">
          <span class="n">${n}</span>
          <span class="l">${esc(s.label)}</span>
        </button>`).join('')}
    </div>

    ${shown.length ? `<div class="job-grid">${shown.map(jobCard).join('')}</div>` : `
      <div class="empty">
        <b>${filter ? 'Nothing ' + esc(statusLabel(filter).toLowerCase()) : 'No QA jobs yet'}</b>
        ${filter ? 'Try another filter.' : 'Load the job before you leave the yard and the site details are done before you get there.'}
      </div>
      ${filter ? '' : '<a class="btn primary wide" href="#/new">New QA job</a>'}`}

    ${DB.qa_jobs.length - jobs.length ? `
      <p class="tiny muted center mt"><a href="#/archived">${
        DB.qa_jobs.length - jobs.length} archived job${DB.qa_jobs.length - jobs.length === 1 ? '' : 's'}</a></p>` : ''}`;

  $$('.tally button', view).forEach(b => b.onclick = () => {
    go(filter === b.dataset.s ? '#/' : '#/?s=' + b.dataset.s);
  });
  wireJobCards(view);
}

/* ================================================================
   Screen — the archive
   Where an archived job goes, and the way back out of it. A board that
   can hide something without being able to show it again is a trap.
   ================================================================ */
function renderArchived(view) {
  const list = boardOrder(DB.qa_jobs.filter(j => j.archived));
  if (!list.length) {
    view.innerHTML = `<div class="empty"><b>Nothing archived</b>
      Archiving takes a job off the board and keeps everything on it.</div>
      <a class="btn wide" href="#/">Back to the board</a>`;
    return;
  }
  view.innerHTML = `
    <p class="muted small mb">These are off the board. Everything on them — patches,
    photos, depths — is kept, and they still print.</p>
    ${list.map((j, i) => `
      <div class="job-row status-completed" style="--i:${i}">
        <div class="hdr"><span class="num">${jobNo(j)}</span></div>
        <div class="ttl">${esc(j.name || 'Unnamed site')}</div>
        <div class="sub">
          ${j.client ? `<span>${esc(j.client)}</span>` : ''}
          <span>${esc(fmtShort(j.qa_date))}</span>
          <span>${patchesFor(j.id).length} patch${patchesFor(j.id).length === 1 ? '' : 'es'}</span>
        </div>
        <div class="btn-row mt">
          <a class="btn sm" href="#/job/${j.id}">Open</a>
          ${isManager() ? `<button class="btn sm" data-restore="${j.id}">Put it back</button>` : ''}
        </div>
      </div>`).join('')}`;

  $$('[data-restore]', view).forEach(b => b.onclick = async () => {
    await Store.patch('qa_jobs', b.dataset.restore, { archived: false });
    toast('Back on the board');
    render();
  });
}

/* ================================================================
   Screen — today
   The way in on a work day: the job in front of you, and one tap to the
   patch you were on when you last put the phone in your pocket.
   ================================================================ */
function renderToday(view) {
  const jobs = boardOrder(activeJobs().filter(isTodayJob));

  if (!jobs.length) {
    view.innerHTML = `
      <div class="empty">
        <b>Nothing on today</b>
        No QA job is booked for ${esc(fmtDayDate(today()))} and none is open.
      </div>
      <div class="btn-row">
        <a class="btn primary" href="#/new">New QA job</a>
        <a class="btn" href="#/">See all jobs</a>
      </div>`;
    return;
  }

  view.innerHTML = `
    <p class="muted small mb">${esc(fmtDayDate(today()))}</p>
    ${jobs.map((j, i) => {
      const pr = jobProgress(j);
      const out = jobOutOfSpec(j);
      return `
        <button class="job-row status-${statusTone(j.status)}" data-id="${j.id}" style="--i:${i}">
          <div class="hdr">
            <span class="num">${jobNo(j)}</span>
            <span class="pill"><span class="swatch"></span>${statusLabel(j.status)}</span>
          </div>
          <div class="ttl">${esc(j.name || 'Unnamed site')}</div>
          <div class="sub">
            ${j.client ? `<span>${esc(j.client)}</span>` : ''}
            <span>${pr.patches} patch${pr.patches === 1 ? '' : 'es'}</span>
            <span>${pr.total ? pr.pct + '% captured' : 'nothing captured yet'}</span>
            ${out ? `<span class="overdue">${out} out of spec</span>` : ''}
          </div>
        </button>`;
    }).join('')}`;

  $$('.job-row', view).forEach(b => b.onclick = () => go('#/job/' + b.dataset.id));
}

/* ================================================================
   One job — the shared header
   ================================================================ */
function jobHeader(j, tab) {
  const patches = patchesFor(j.id).length;
  const shots = sitePhotos(j.id).length;
  return `
    <div class="card accent status-${statusTone(j.status)}">
      <div class="row spread" style="align-items:flex-start">
        <div class="grow">
          <div class="tiny" style="color:var(--ink-3);letter-spacing:.04em;font-weight:700">${jobNo(j)}</div>
          <h2 style="font-size:19px;margin:2px 0 3px">${esc(j.name || 'Unnamed site')}</h2>
          <div class="small muted">${esc(j.client || 'No client named')} · ${esc(fmtDayDate(j.qa_date))}</div>
        </div>
        <span class="pill"><span class="swatch"></span>${statusLabel(j.status)}</span>
      </div>
      ${j.site ? `<div class="small mt" style="display:flex;gap:6px;align-items:center">${icon('pin')}${esc(j.site)}</div>` : ''}
      <div class="small mt" style="display:flex;gap:6px;align-items:center">${icon('patch')}${esc(typesText(j))}</div>
    </div>

    <div class="seg">
      <a href="#/job/${j.id}" class="${tab === 'job' ? 'on' : ''}">Job</a>
      <a href="#/patches/${j.id}" class="${tab === 'patches' ? 'on' : ''}">Patches<span class="n">${patches}</span></a>
      <a href="#/site/${j.id}" class="${tab === 'site' ? 'on' : ''}">Site<span class="n">${shots}</span></a>
    </div>`;
}

/* ================================================================
   Screen — the job
   ================================================================ */
function renderJob(view) {
  const j = jobById(seg(2));
  if (!j) { go('#/'); return; }

  const pr = jobProgress(j);
  const out = jobOutOfSpec(j);
  const shots = jobPhotos(j.id).length;
  const depths = jobReadings(j.id, 'depth').length;
  const missing = whatsMissing(j);
  const warn = weatherWarning(j);

  view.innerHTML = `
    ${jobHeader(j, 'job')}

    ${warn ? `<div class="banner">${esc(warn)}</div>` : ''}

    <div class="card">
      <h2>Weather on site</h2>
      <p class="muted small">Set it when you arrive. It is the first thing asked if a seal
      ever fails, and nobody remembers in March what November was doing.</p>
      <div class="rd-spec">
        <label class="field"><span>Conditions</span>
          <select id="wWeather">
            <option value="">Not set</option>
            ${WEATHER.map(w => `<option value="${w.key}" ${j.weather === w.key ? 'selected' : ''}>${esc(w.label)}</option>`).join('')}
          </select></label>
        <label class="field"><span>Air temperature (°C)</span>
          <input type="number" id="wTemp" inputmode="decimal" step="0.5" value="${j.air_temp == null ? '' : esc(j.air_temp)}" placeholder="—"></label>
      </div>
      <div class="rd-spec">
        <label class="field"><span>Surface</span>
          <select id="wGround">
            <option value="">Not set</option>
            ${GROUND.map(g => `<option value="${g.key}" ${j.ground === g.key ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}
          </select></label>
        <label class="field"><span>Wind (optional)</span>
          <input type="text" id="wWind" value="${esc(j.wind || '')}" placeholder="e.g. light southerly"></label>
      </div>
      <label class="field" style="margin-bottom:0"><span>Anything worth saying about the day</span>
        <textarea id="wNotes" placeholder="Held off spraying until the surface dried…" style="min-height:72px">${esc(j.weather_notes || '')}</textarea></label>
      <button class="btn wide mt" id="saveWeather">Save the weather</button>
    </div>

    <div class="card">
      <h2>Where it is up to</h2>
      <div class="stat">
        <div><span class="n">${pr.patches}</span><span class="l">Patches</span></div>
        <div><span class="n">${shots}</span><span class="l">Photos</span></div>
        <div><span class="n">${depths}</span><span class="l">Depths</span></div>
        <div><span class="n" style="${out ? 'color:var(--red)' : ''}">${out}</span><span class="l">Out of spec</span></div>
      </div>
      <div class="bar ${pr.pct >= 100 ? '' : pr.pct > 0 ? 'part' : 'none'}" style="margin-top:14px"><i style="width:${Math.max(pr.pct, 2)}%"></i></div>
      <p class="tiny muted" style="margin:7px 0 0">${pr.total
        ? `${pr.done} of ${pr.total} steps captured across ${pr.patches} patch${pr.patches === 1 ? '' : 'es'}.`
        : 'No patches yet. Add the first one and the steps come with it.'}</p>
      ${missing.length ? `
        <div class="banner mt" style="margin-bottom:0">
          <strong>Still owed</strong>
          <em>${missing.slice(0, 4).map(g =>
            `${esc(g.patch.name)}: ${esc(g.steps.join(', '))}`).join('<br>')}${
            missing.length > 4 ? `<br>…and ${missing.length - 4} more patch${missing.length - 4 === 1 ? '' : 'es'}` : ''}</em>
        </div>` : pr.total ? `<div class="banner info mt" style="margin-bottom:0">Every step on every patch has something against it.</div>` : ''}
    </div>

    <div class="card">
      <h2>Carry on</h2>
      <div class="btn-row">
        <a class="btn primary" href="#/patches/${j.id}">${icon('patch')}Patches</a>
        <a class="btn" href="#/site/${j.id}">${icon('camera')}Site photos</a>
      </div>
      <div class="btn-row mt">
        ${j.status === 'planned' ? `<button class="btn primary" id="start">Start on site</button>` : ''}
        ${j.status === 'onsite' ? `<a class="btn primary" href="#/signoff/${j.id}">${icon('check')}Sign off</a>` : ''}
        ${j.status === 'complete' ? `<button class="btn" id="reopen">Reopen</button>` : ''}
      </div>
    </div>

    <div class="card">
      <h2>The paperwork</h2>
      <p class="muted small">These are what the workbook and the string sheet used to be.
      Each one opens the phone's print dialog — choose <em>Save as PDF</em> to email or file it.</p>
      <div class="btn-row">
        <button class="btn primary" id="pReport">${icon('print')}QA report</button>
        <button class="btn" id="pDepths">${icon('ruler')}Depth sheet</button>
      </div>
      <div class="btn-row mt">
        <button class="btn" id="pPhotos">${icon('image')}Photo sheet</button>
        <button class="btn" id="pCsv">${icon('download')}Depths CSV</button>
      </div>
    </div>

    <div class="card">
      <h2>The record</h2>
      <table class="data">
        <tr><th>Client job number</th><td>${esc(j.job_ref || '—')}</td></tr>
        <tr><th>Supervisor</th><td>${esc(j.supervisor || '—')}</td></tr>
        <tr><th>QA</th><td>${esc(j.qa_name || j.created_by || '—')}</td></tr>
        <tr><th>Set up</th><td>${esc(fmtDateTime(j.created_at))}${j.created_by ? ' · ' + esc(j.created_by) : ''}</td></tr>
        ${j.started_at ? `<tr><th>Started on site</th><td>${esc(fmtDateTime(j.started_at))}${j.started_by ? ' · ' + esc(j.started_by) : ''}</td></tr>` : ''}
        ${j.completed_at ? `<tr><th>Signed off</th><td>${esc(fmtDateTime(j.completed_at))}${j.completed_by ? ' · ' + esc(j.completed_by) : ''}</td></tr>` : ''}
      </table>
      ${j.description ? `<p class="small mt" style="white-space:pre-wrap">${esc(j.description)}</p>` : ''}
      ${j.signoff_notes ? `<p class="small mt" style="white-space:pre-wrap"><strong>At sign off:</strong> ${esc(j.signoff_notes)}</p>` : ''}
      <div class="btn-row mt">
        <a class="btn sm" href="#/edit/${j.id}">${icon('edit')}Edit the job</a>
        ${isManager() ? `<button class="btn sm" id="archive">Archive</button>` : ''}
      </div>
    </div>`;

  const saveWeather = () => Store.patch('qa_jobs', j.id, {
    weather: $('#wWeather', view).value,
    air_temp: $('#wTemp', view).value === '' ? null : Number($('#wTemp', view).value),
    ground: $('#wGround', view).value,
    wind: $('#wWind', view).value.trim(),
    weather_notes: $('#wNotes', view).value.trim()
  });
  $('#saveWeather', view).onclick = async () => {
    await saveWeather();
    toast('Weather saved');
    render();
  };

  const startBtn = $('#start', view);
  if (startBtn) startBtn.onclick = async () => { await setJobStatus(j, 'onsite'); toast('On site'); render(); };
  const reopenBtn = $('#reopen', view);
  if (reopenBtn) reopenBtn.onclick = async () => { await setJobStatus(j, 'onsite'); toast('Reopened'); render(); };

  $('#pReport', view).onclick = () => printQaReport(j);
  $('#pDepths', view).onclick = () => printDepthSheet(j);
  $('#pPhotos', view).onclick = () => printPhotoSheet(j);
  $('#pCsv', view).onclick   = () => exportReadingsCsv(j);

  const arch = $('#archive', view);
  if (arch) arch.onclick = async () => {
    if (!confirm(`Archive ${jobNo(j)}? It disappears from the board. The photos and depths are kept.`)) return;
    await Store.patch('qa_jobs', j.id, { archived: true });
    toast('Archived');
    go('#/');
  };
}

/* ================================================================
   Screen — the patches on a job
   ================================================================ */
function renderPatches(view) {
  const j = jobById(seg(2));
  if (!j) { go('#/'); return; }
  const list = patchesFor(j.id);

  view.innerHTML = `
    ${jobHeader(j, 'patches')}

    ${list.length ? list.map((p, i) => {
      const pr = patchProgress(p);
      const out = patchOutOfSpec(p);
      const d = readingStats(p, 'depth');
      return `
        <button class="patch-row" data-id="${p.id}" style="--i:${i}">
          <div class="hdr">
            <span class="num">PATCH ${p.number}</span>
            ${out ? `<span class="pill status-red"><span class="swatch"></span>${out} out of spec</span>` : ''}
          </div>
          <div class="ttl">${esc(p.name || 'Patch ' + p.number)}</div>
          <div class="sub">
            ${p.location ? `<span>${esc(p.location)}</span>` : ''}
            <span>${pr.done}/${pr.total} steps</span>
            <span>${patchPhotos(p.id).length} photo${patchPhotos(p.id).length === 1 ? '' : 's'}</span>
            ${d.n ? `<span>${d.n} depth${d.n === 1 ? '' : 's'}, avg ${num(d.avg)}mm</span>` : ''}
          </div>
          <div class="bar ${pr.pct >= 100 ? '' : pr.pct > 0 ? 'part' : 'none'}"><i style="width:${Math.max(pr.pct, 2)}%"></i></div>
        </button>`;
    }).join('') : `
      <div class="empty">
        <b>No patches yet</b>
        A patch is one area of work — milled, checked, sprayed, sealed, paved.
        A whole car park can be one patch with twenty depth readings in it.
      </div>`}

    <button class="addrow" id="addPatch">${icon('plus')}Add a patch</button>`;

  $$('.patch-row', view).forEach(b => b.onclick = () => go('#/patch/' + b.dataset.id));
  $('#addPatch', view).onclick = () => go('#/patchnew/' + j.id);
}

/* ================================================================
   Screen — photos of the whole site
   The ones that belong to the job rather than to any one patch: how it
   looked before anybody touched it, the closure, the dockets, the end.
   ================================================================ */
function renderSite(view) {
  const j = jobById(seg(2));
  if (!j) { go('#/'); return; }

  view.innerHTML = `
    ${jobHeader(j, 'site')}
    <div class="card">
      <h2>Site photos</h2>
      <p class="muted small">Everything here belongs to the job as a whole. Patch photos live
      on the patch.</p>
      <div class="steps">
        ${SITE_STEPS.map((s, i) => {
          const n = sitePhotos(j.id, s.key).length;
          return `
            <button class="step ${n ? 'done' : ''}" data-step="${s.key}" style="--i:${i}">
              <span class="tick">${n ? icon('check') : icon('camera')}</span>
              <span class="sb">
                <span class="sn">${esc(s.label)}</span>
                <span class="sh">${esc(s.hint)}</span>
              </span>
              <span class="sc"><b>${n}</b>photo${n === 1 ? '' : 's'}</span>
              <span class="chev">${icon('chev')}</span>
            </button>`;
        }).join('')}
      </div>
    </div>`;

  $$('.step', view).forEach(b => b.onclick = () => go(`#/sitestep/${j.id}/${b.dataset.step}`));
}

/* ================================================================
   Screen — one patch
   The steps of the patch in the order they happen on the ground, each
   with what has been captured against it. This is the screen a QA has
   open for most of a day.
   ================================================================ */
function renderPatch(view) {
  const p = patchById(seg(2));
  if (!p) { go('#/'); return; }
  const j = jobById(p.job_id);
  if (!j) { go('#/'); return; }

  const steps = stepsOf(p);
  const pr = patchProgress(p);
  const d = readingStats(p, 'depth');
  const t = readingStats(p, 'temp');

  view.innerHTML = `
    <div class="card accent status-${pr.pct >= 100 ? 'ongoing' : 'planned'}">
      <div class="row spread" style="align-items:flex-start">
        <div class="grow">
          <div class="tiny" style="color:var(--ink-3);letter-spacing:.04em;font-weight:700">PATCH ${p.number} · ${jobNo(j)}</div>
          <h2 style="font-size:19px;margin:2px 0 3px">${esc(p.name || 'Patch ' + p.number)}</h2>
          <div class="small muted">${esc(j.name || 'Unnamed site')}</div>
        </div>
        <span class="pill"><span class="swatch"></span>${pr.done}/${pr.total}</span>
      </div>
      ${p.location ? `<div class="small mt" style="display:flex;gap:6px;align-items:center">${icon('pin')}${esc(p.location)}</div>` : ''}
      <div class="kv-inline mt">
        ${isNum(p.design_depth) ? `<span>Design depth <b>${num(p.design_depth)}mm</b> ± ${num(p.depth_tol)}mm</span>` : '<span>No design depth set</span>'}
        ${isNum(p.min_temp) ? `<span>Min mat <b>${num(p.min_temp, 0)}°C</b></span>` : ''}
        ${isNum(p.length_m) && isNum(p.width_m) ? `<span>Area <b>${num(Number(p.length_m) * Number(p.width_m))} m²</b></span>` : ''}
      </div>
      <div class="bar ${pr.pct >= 100 ? '' : pr.pct > 0 ? 'part' : 'none'}"><i style="width:${Math.max(pr.pct, 2)}%"></i></div>
    </div>

    ${d.n || t.n ? `
    <div class="card">
      <h2>The numbers</h2>
      <div class="stat">
        ${d.n ? `
          <div><span class="n">${d.n}</span><span class="l">Depths</span></div>
          <div><span class="n">${num(d.avg)}<span style="font-size:12px">mm</span></span><span class="l">Average</span></div>
          <div><span class="n">${num(d.min)}–${num(d.max)}</span><span class="l">Range</span></div>` : ''}
        ${t.n ? `<div><span class="n">${num(t.min, 0)}<span style="font-size:12px">°C</span></span><span class="l">Coldest mat</span></div>` : ''}
        <div><span class="n" style="${d.out + t.out ? 'color:var(--red)' : 'color:var(--green)'}">${d.out + t.out}</span><span class="l">Out of spec</span></div>
      </div>
    </div>` : ''}

    <div class="section-title">Steps</div>
    <div class="steps">
      ${steps.map((s, i) => {
        const shots = stepPhotos(p.id, s.key).length;
        const kind = stepReading(s.key);
        const st = kind ? readingStats(p, kind) : null;
        const done = stepDone(p, s.key);
        const flag = st && st.out > 0;
        const counts = [];
        if (shots) counts.push(shots + ' photo' + (shots === 1 ? '' : 's'));
        if (st && st.n) counts.push(st.n + ' ' + (kind === 'depth' ? 'depth' : 'temp') + (st.n === 1 ? '' : 's'));
        return `
          <button class="step ${flag ? 'flag' : done ? 'done' : ''}" data-step="${esc(s.key)}" style="--i:${i}">
            <span class="tick">${flag ? '!' : done ? icon('check') : (kind === 'depth' ? icon('ruler') : kind === 'temp' ? icon('temp') : icon('camera'))}</span>
            <span class="sb">
              <span class="sn">${esc(s.label)}</span>
              <span class="sh">${counts.length ? esc(counts.join(' · ')) + (flag ? ' · ' + st.out + ' out of spec' : '') : esc(stepHint(s.key) || 'Nothing yet')}</span>
            </span>
            <span class="chev">${icon('chev')}</span>
          </button>`;
      }).join('')}
    </div>

    <button class="addrow mt" id="addStep">${icon('plus')}Add a step to this patch</button>

    <div class="card mt">
      <h2>This patch</h2>
      ${p.mix ? `<p class="small muted" style="margin-bottom:6px">Mix: ${esc(p.mix)}</p>` : ''}
      ${p.notes ? `<p class="small" style="white-space:pre-wrap">${esc(p.notes)}</p>` : ''}
      <div class="btn-row">
        <a class="btn sm" href="#/patchedit/${p.id}">${icon('edit')}Edit the patch</a>
        <a class="btn sm" href="#/patches/${j.id}">All patches</a>
        <button class="btn sm" id="delPatch">${icon('trash')}Delete</button>
      </div>
    </div>`;

  $$('.step', view).forEach(b => b.onclick = () => go(`#/step/${p.id}/${b.dataset.step}`));

  $('#addStep', view).onclick = async () => {
    const name = prompt('What is the step called?\n\nType a name — "Pre-levelling", "Tack coat", "Second coat" — and it is added to this patch.');
    if (name == null) return;
    await addStep(p, name);
    render();
  };

  $('#delPatch', view).onclick = async () => {
    const shots = patchPhotos(p.id).length;
    const nums = DB.qa_readings.filter(r => r.patch_id === p.id).length;
    if (!confirm(`Delete ${p.name}?\n\n${shots} photo${shots === 1 ? '' : 's'} and ${nums} reading${nums === 1 ? '' : 's'} go with it. This cannot be undone.`)) return;
    await removePatch(p);
    toast('Patch deleted');
    go('#/patches/' + j.id);
  };
}

/* ================================================================
   Screen — capturing one step
   Photos, and for the depth check and the paving temperature, the numbers
   as well. Both live on one screen because on site they happen together:
   the string goes across, the number gets written on the seal, the photo
   is taken of the number.
   ================================================================ */
function renderStep(view) {
  const onSite = route.path.startsWith('/sitestep/');
  const p = onSite ? null : patchById(seg(2));
  const j = onSite ? jobById(seg(2)) : (p && jobById(p.job_id));
  const key = seg(3);
  if (!j || (!onSite && !p)) { go('#/'); return; }

  const label = onSite
    ? ((SITE_STEPS.find(s => s.key === key) || {}).label || humanise(key))
    : stepLabel(p, key);
  const kind = onSite ? '' : stepReading(key);
  const shots = onSite ? sitePhotos(j.id, key) : stepPhotos(p.id, key);
  const stepIsOnPatch = onSite || stepsOf(p).some(s => s.key === key);

  view.innerHTML = `
    <div class="card accent status-${shots.length ? 'ongoing' : 'planned'}">
      <div class="tiny" style="color:var(--ink-3);letter-spacing:.04em;font-weight:700">
        ${esc(onSite ? 'WHOLE SITE' : 'PATCH ' + p.number)} · ${jobNo(j)}</div>
      <h2 style="font-size:19px;margin:2px 0 3px">${esc(label)}</h2>
      <div class="small muted">${esc(onSite ? j.name || 'Unnamed site' : p.name || 'Patch ' + p.number)}${
        stepHint(key) ? ' — ' + esc(stepHint(key)) : ''}</div>
    </div>

    ${kind ? readingsCard(p, kind) : ''}

    <div class="card">
      <h2>Photos</h2>
      <label class="field"><span>What these show (optional)</span>
        <input type="text" id="cap" placeholder="${esc(kind === 'depth' ? 'e.g. string line 3, chainage 20–35' : 'e.g. north end, second pass')}"></label>
      <button class="shoot" id="shoot">
        ${icon('camera')}Take photos
        <span>The camera opens. Take as many as it takes.</span>
      </button>
      <button class="btn wide mt" id="pick">${icon('image')}Choose from the gallery</button>
      <input type="file" id="fCam" accept="image/*" capture="environment" multiple hidden>
      <input type="file" id="fLib" accept="image/*" multiple hidden>
      <p class="tiny muted mt" style="margin-bottom:0">${S.geo
        ? 'Each photo is stamped with the time and, where the phone can get a fix, the spot it was taken.'
        : 'Each photo is stamped with the time. Location stamping is off in Settings.'}</p>
    </div>

    ${shots.length ? `
      <div class="section-title">${shots.length} photo${shots.length === 1 ? '' : 's'}</div>
      <div class="shots">
        ${shots.map((s, i) => `
          <div class="shot ${!S.localMode && /^data:/.test(s.file_url || '') ? 'waiting' : ''}" style="--i:${i}">
            <img src="${esc(s.file_url)}" alt="" data-photo="${s.id}" loading="lazy">
            <button class="x" data-del="${s.id}" aria-label="Remove photo">${icon('x')}</button>
            <div class="cap"><b>${esc(fmtTime(s.taken_at))}</b>${s.caption ? ' ' + esc(s.caption) : ''}</div>
          </div>`).join('')}
      </div>` : `
      <div class="empty"><b>No photos on this step yet</b>Tap the button above and shoot away.</div>`}

    ${!stepIsOnPatch && !onSite ? `
      <div class="banner mt">This step is not on the patch's list, so it will not be counted
      as owed. Add it on the patch if it should be.</div>` : ''}

    <div class="btn-row mt">
      <a class="btn" href="${onSite ? '#/site/' + j.id : '#/patch/' + p.id}">Back to ${onSite ? 'site photos' : 'the patch'}</a>
    </div>`;

  if (kind) wireReadings(view, j, p, kind);
  wirePhotos(view);

  const cam = $('#fCam', view), lib = $('#fLib', view), shoot = $('#shoot', view);
  $('#pick', view).onclick = () => lib.click();
  shoot.onclick = () => cam.click();

  const take = async (input) => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    shoot.disabled = true;
    toast(files.length === 1 ? 'Saving the photo…' : `Saving ${files.length} photos…`);
    try {
      await addPhotos(j, onSite ? null : p.id, key, label, files, $('#cap', view).value.trim());
      toast(files.length === 1 ? 'Photo saved' : `${files.length} photos saved`);
    } catch (e) {
      toast('That photo would not save. Try again.');
    }
    shoot.disabled = false;
    render();
  };
  cam.onchange = () => take(cam);
  lib.onchange = () => take(lib);

  $$('[data-del]', view).forEach(b => b.onclick = async () => {
    if (!confirm('Remove this photo from the QA record?')) return;
    await Store.remove('qa_photos', b.dataset.del);
    render();
  });
}

/* ---------------------------------------------------------- readings */
/* The string sheet, on a phone. What the patch is meant to be goes in at
   the top; then the numbers, one after another, without the keyboard ever
   closing. Every one is judged as it lands, because the only useful moment
   to find out a patch is 12mm shallow is while the crew are still on it. */
function readingsCard(patch, kind) {
  const cfg = READINGS[kind];
  const { target, tol } = spec(patch, kind);
  return `
    <div class="card">
      <h2>${esc(cfg.plural)}</h2>
      <p class="muted small">${esc(cfg.hint)}</p>

      <div class="rd-spec">
        <label class="field"><span>${esc(cfg.specLabel)} (${esc(cfg.unit)})</span>
          <input type="number" id="specV" inputmode="decimal" step="0.5"
                 value="${target == null ? '' : esc(target)}" placeholder="not set"></label>
        ${cfg.band ? `
        <label class="field"><span>${esc(cfg.tolLabel)} (${esc(cfg.unit)})</span>
          <input type="number" id="specT" inputmode="decimal" step="0.5"
                 value="${tol == null ? '' : esc(tol)}"></label>` : ''}
      </div>

      <div class="rd-add">
        <input type="number" id="rdV" class="big" inputmode="decimal" step="0.5"
               placeholder="${esc(cfg.placeholder)}" aria-label="${esc(cfg.label)} in ${esc(cfg.unit)}">
        <button class="btn primary" id="rdAdd">${icon('plus')}Add</button>
      </div>
      <label class="field mt" style="margin-bottom:0"><span>${esc(cfg.where)}</span>
        <input type="text" id="rdW" placeholder="${esc(cfg.wherePlaceholder)}"></label>
      <p class="tiny muted" style="margin:7px 0 0">Stays put between readings, so a whole string
      line goes in without retyping it.</p>

      <div class="rd-list" id="rdList"></div>
      <div class="rd-stats" id="rdStats"></div>
    </div>`;
}

/** The chips and the four numbers underneath, redrawn on their own so the
    keyboard never closes and the caret never moves. */
function paintReadings(root, patch, kind) {
  const cfg = READINGS[kind];
  const st = readingStats(patch, kind);
  const list = $('#rdList', root);
  const stats = $('#rdStats', root);

  list.innerHTML = st.list.length ? st.list.map((r, i) => {
    const v = verdict(patch, kind, r.value);
    return `
      <button class="rd ${isOut(v) ? 'out' : v === 'ok' ? 'in' : ''}" data-rd="${r.id}"
              data-no="${i + 1}" title="Tap to remove">
        <span class="i">#${i + 1}${isOut(v) ? (v === 'low' ? ' LOW' : ' HIGH') : ''}</span>
        <span class="v">${num(r.value)}<em>${esc(cfg.unit)}</em></span>
        ${r.position ? `<span class="w">${esc(r.position)}</span>` : ''}
      </button>`;
  }).join('') : `<p class="muted small" style="grid-column:1/-1;margin:2px 0 0">
      Nothing taken yet. Type the first ${esc(cfg.label.toLowerCase())} above and tap Add.</p>`;

  const u = `<em style="font-style:normal;font-size:11px;font-weight:600;color:var(--ink-2)">${esc(cfg.unit)}</em>`;
  stats.innerHTML = st.n ? `
    <div><span class="n">${st.n}</span><span class="l">Taken</span></div>
    <div><span class="n">${num(st.avg)}${u}</span><span class="l">Average</span></div>
    <div><span class="n">${num(st.min)}${u}</span><span class="l">Lowest</span></div>
    <div><span class="n">${num(st.max)}${u}</span><span class="l">Highest</span></div>
    <div class="${st.out ? 'bad' : 'good'}"><span class="n">${st.out}</span><span class="l">Out of spec</span></div>` : '';

  $$('[data-rd]', list).forEach(b => b.onclick = async () => {
    const r = DB.qa_readings.find(x => x.id === b.dataset.rd);
    if (!r) return;
    if (!confirm(`Remove reading #${b.dataset.no} — ${num(r.value)}${cfg.unit}?`)) return;
    await Store.remove('qa_readings', r.id);
    paintReadings(root, patch, kind);
  });
}

function wireReadings(root, job, patch, kind) {
  const cfg = READINGS[kind];
  const val = $('#rdV', root);
  const where = $('#rdW', root);

  paintReadings(root, patch, kind);

  // Changing the design depth re-judges every reading already taken, so the
  // chips are repainted rather than left showing yesterday's verdict.
  const specV = $('#specV', root);
  const specT = $('#specT', root);
  const saveSpec = async () => {
    const p = {};
    p[cfg.specField] = specV.value === '' ? null : Number(specV.value);
    if (cfg.band && specT) p[cfg.tolField] = specT.value === '' ? DEFAULTS.depthTolerance : Number(specT.value);
    await Store.patch('qa_patches', patch.id, p);
    Object.assign(patch, p);
    paintReadings(root, patch, kind);
  };
  specV.onchange = saveSpec;
  if (specT) specT.onchange = saveSpec;

  const add = async () => {
    const raw = val.value.trim();
    if (raw === '' || !isFinite(Number(raw))) { val.focus(); return; }
    await addReading(job, patch, kind, Number(raw), where.value);
    val.value = '';
    paintReadings(root, patch, kind);
    // Straight back to the number field: the next reading is already being
    // read off the ground.
    val.focus();
    const v = verdict(patch, kind, raw);
    if (isOut(v)) toast(`${num(raw)}${cfg.unit} is ${v === 'low' ? 'under' : 'over'} — worth a look now.`);
  };

  $('#rdAdd', root).onclick = add;
  val.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
}

/* ================================================================
   Screen — new job / edit job
   Filled in on the couch the night before or in the ute at the gate.
   Nothing here needs signal.
   ================================================================ */
function renderJobEdit(view) {
  const editing = route.path.startsWith('/edit/');
  const j = editing ? jobById(seg(2)) : null;
  if (editing && !j) { go('#/'); return; }
  let types = j ? typesOf(j).slice() : [];

  view.innerHTML = `
    <div class="card">
      <h2>${editing ? 'The job' : 'What and where'}</h2>
      <label class="field"><span>Site name</span>
        <input type="text" id="fName" value="${esc(j ? j.name : '')}" placeholder="e.g. Countdown Papanui car park"></label>
      <label class="field"><span>Client</span>
        <input type="text" id="fClient" value="${esc(j ? j.client : '')}" placeholder="e.g. Fulton Hogan"></label>
      <label class="field"><span>Address or where on the road</span>
        <input type="text" id="fSite" value="${esc(j ? j.site : '')}" placeholder="e.g. 120 Main North Rd, northbound lane"></label>
      <div class="rd-spec">
        <label class="field"><span>Date on site</span>
          <input type="date" id="fDate" value="${esc((j && j.qa_date) || today())}"></label>
        <label class="field"><span>Client job number</span>
          <input type="text" id="fRef" value="${esc(j ? j.job_ref : '')}" placeholder="optional"></label>
      </div>
    </div>

    <div class="card">
      <h2>Type of work</h2>
      <p class="muted small">Tick everything this job carries. It decides the steps a new patch
      starts with — a patch can always be given more.</p>
      <div class="toggles" id="fTypes">
        ${WORK_TYPES.map(w => `
          <button type="button" data-t="${w.key}" aria-pressed="${types.includes(w.key)}">
            <span class="box">${icon('check')}</span>${esc(w.label)}
          </button>`).join('')}
      </div>
    </div>

    <div class="card">
      <h2>Who</h2>
      <div class="rd-spec">
        <label class="field"><span>QA</span>
          <input type="text" id="fQa" value="${esc(j ? (j.qa_name || '') : whoami())}"></label>
        <label class="field"><span>Site supervisor</span>
          <input type="text" id="fSup" value="${esc(j ? j.supervisor : '')}" placeholder="optional"></label>
      </div>
      <label class="field" style="margin-bottom:0"><span>The job in a sentence or two</span>
        <textarea id="fDesc" placeholder="Mill and pave 14 patches, chip seal the two by the loading dock…">${esc(j ? j.description : '')}</textarea></label>
    </div>

    <button class="btn primary wide" id="save">${editing ? 'Save the job' : 'Create the QA job'}</button>
    ${editing && isManager() ? `<button class="btn wide mt" id="del">${icon('trash')}Delete this job and everything on it</button>` : ''}`;

  $$('#fTypes button', view).forEach(b => b.onclick = () => {
    const k = b.dataset.t;
    const on = types.includes(k);
    types = on ? types.filter(x => x !== k) : types.concat([k]);
    b.setAttribute('aria-pressed', String(!on));
  });

  $('#save', view).onclick = async () => {
    const name = $('#fName', view).value.trim();
    if (!name) { toast('The site needs a name.'); $('#fName', view).focus(); return; }
    const data = {
      name,
      client: $('#fClient', view).value.trim(),
      site: $('#fSite', view).value.trim(),
      qa_date: $('#fDate', view).value || today(),
      job_ref: $('#fRef', view).value.trim(),
      work_types: types,
      qa_name: $('#fQa', view).value.trim(),
      supervisor: $('#fSup', view).value.trim(),
      description: $('#fDesc', view).value.trim()
    };
    if (editing) {
      await Store.patch('qa_jobs', j.id, data);
      toast('Saved');
      go('#/job/' + j.id);
    } else {
      const made = await createJob(data);
      toast(jobNo(made) + ' created');
      go('#/job/' + made.id);
    }
  };

  const del = $('#del', view);
  if (del) del.onclick = async () => {
    const shots = jobPhotos(j.id).length;
    if (!confirm(`Delete ${jobNo(j)} — ${j.name}?\n\n${patchesFor(j.id).length} patch(es) and ${shots} photo(s) go with it. This cannot be undone. If you only want it off the board, archive it instead.`)) return;
    await removeJob(j);
    toast('Deleted');
    go('#/');
  };
}

/* ================================================================
   Screen — new patch / edit patch
   ================================================================ */
function renderPatchEdit(view) {
  const making = route.path.startsWith('/patchnew/');
  const p = making ? null : patchById(seg(2));
  const j = making ? jobById(seg(2)) : (p && jobById(p.job_id));
  if (!j || (!making && !p)) { go('#/'); return; }

  const nextNo = patchesFor(j.id).reduce((m, x) => Math.max(m, x.number || 0), 0) + 1;
  let steps = making ? defaultSteps(j) : stepsOf(p);
  // Anything on this patch that isn't one of the built-in steps — a tack
  // coat somebody added at 7am — is offered here as its own toggle so it
  // can be taken off again without hunting for it.
  const extras = steps.filter(s => !builtinStep(s.key));

  view.innerHTML = `
    <div class="card">
      <h2>${making ? 'The patch' : 'Patch ' + p.number}</h2>
      <label class="field"><span>Name it</span>
        <input type="text" id="pName" value="${esc(p ? p.name : 'Patch ' + nextNo)}"></label>
      <label class="field" style="margin-bottom:0"><span>Where it is</span>
        <input type="text" id="pLoc" value="${esc(p ? p.location : '')}" placeholder="e.g. by the loading dock, chainage 20–48"></label>
    </div>

    <div class="card">
      <h2>What it is meant to be</h2>
      <p class="muted small">The app judges every depth and every mat temperature against these,
      on the spot. Leave one blank and it records the numbers without calling them.</p>
      <div class="rd-spec">
        <label class="field"><span>Design depth (mm)</span>
          <input type="number" id="pDepth" inputmode="decimal" step="0.5"
                 value="${p ? (p.design_depth == null ? '' : esc(p.design_depth)) : DEFAULTS.designDepth}"></label>
        <label class="field"><span>Tolerance ± (mm)</span>
          <input type="number" id="pTol" inputmode="decimal" step="0.5"
                 value="${p ? (p.depth_tol == null ? '' : esc(p.depth_tol)) : DEFAULTS.depthTolerance}"></label>
      </div>
      <div class="rd-spec">
        <label class="field"><span>Minimum mat temperature (°C)</span>
          <input type="number" id="pTemp" inputmode="decimal" step="1"
                 value="${p ? (p.min_temp == null ? '' : esc(p.min_temp)) : DEFAULTS.minTemperature}"></label>
        <label class="field"><span>Mix</span>
          <input type="text" id="pMix" value="${esc(p ? p.mix : '')}" placeholder="e.g. AC10"></label>
      </div>
      <div class="rd-spec" style="margin-bottom:0">
        <label class="field" style="margin-bottom:0"><span>Length (m)</span>
          <input type="number" id="pLen" inputmode="decimal" step="0.1"
                 value="${p && p.length_m != null ? esc(p.length_m) : ''}" placeholder="optional"></label>
        <label class="field" style="margin-bottom:0"><span>Width (m)</span>
          <input type="number" id="pWid" inputmode="decimal" step="0.1"
                 value="${p && p.width_m != null ? esc(p.width_m) : ''}" placeholder="optional"></label>
      </div>
    </div>

    <div class="card">
      <h2>Steps on this patch</h2>
      <p class="muted small">Untick what this patch doesn't get. A step with photos already
      against it keeps them either way — it just stops being counted as owed.</p>
      <div class="toggles" id="pSteps">
        ${STEPS.map(s => `
          <button type="button" data-s="${s.key}" aria-pressed="${steps.some(x => x.key === s.key)}">
            <span class="box">${icon('check')}</span>${esc(s.label)}
          </button>`).join('')}
        ${extras.map(s => `
          <button type="button" data-s="${esc(s.key)}" data-label="${esc(s.label)}" aria-pressed="true">
            <span class="box">${icon('check')}</span>${esc(s.label)}
          </button>`).join('')}
      </div>
    </div>

    <button class="btn primary wide" id="save">${making ? 'Add the patch' : 'Save the patch'}</button>
    ${making ? '' : `
    <div class="card mt">
      <h2>Notes</h2>
      <label class="field" style="margin-bottom:0"><span>Anything worth knowing about this patch</span>
        <textarea id="pNotes" placeholder="Soft spot in the north-west corner, dug out an extra 40mm…">${esc(p.notes || '')}</textarea></label>
    </div>`}`;

  const order = STEPS.map(s => s.key);
  $$('#pSteps button', view).forEach(b => b.onclick = () => {
    const key = b.dataset.s;
    const on = steps.some(s => s.key === key);
    if (on) {
      steps = steps.filter(s => s.key !== key);
    } else {
      const label = b.dataset.label || (builtinStep(key) || {}).label || humanise(key);
      steps = steps.concat([{ key, label }]).sort((a, c) => {
        const ai = order.indexOf(a.key), ci = order.indexOf(c.key);
        return (ai < 0 ? 999 : ai) - (ci < 0 ? 999 : ci);
      });
    }
    b.setAttribute('aria-pressed', String(!on));
  });

  const numOrNull = id => {
    const v = $(id, view).value;
    return v === '' ? null : Number(v);
  };

  $('#save', view).onclick = async () => {
    const data = {
      name: $('#pName', view).value.trim() || ('Patch ' + (p ? p.number : nextNo)),
      location: $('#pLoc', view).value.trim(),
      design_depth: numOrNull('#pDepth'),
      depth_tol: numOrNull('#pTol'),
      min_temp: numOrNull('#pTemp'),
      mix: $('#pMix', view).value.trim(),
      length_m: numOrNull('#pLen'),
      width_m: numOrNull('#pWid'),
      steps
    };
    if (making) {
      const made = await addPatch(j, data);
      toast(data.name + ' added');
      go('#/patch/' + made.id);
    } else {
      data.notes = $('#pNotes', view).value.trim();
      await Store.patch('qa_patches', p.id, data);
      toast('Saved');
      go('#/patch/' + p.id);
    }
  };
}

/* ================================================================
   Screen — signing off
   The last chance to notice that four patches have no after photo, said
   plainly, and then out of the way. A QA who means to sign off anyway is
   allowed to; the report says what is missing either way.
   ================================================================ */
function renderSignoff(view) {
  const j = jobById(seg(2));
  if (!j) { go('#/'); return; }
  const missing = whatsMissing(j);
  const out = jobOutOfSpec(j);
  const pr = jobProgress(j);

  view.innerHTML = `
    <div class="card accent status-${statusTone(j.status)}">
      <div class="tiny" style="color:var(--ink-3);letter-spacing:.04em;font-weight:700">${jobNo(j)}</div>
      <h2 style="font-size:19px;margin:2px 0 3px">${esc(j.name || 'Unnamed site')}</h2>
      <div class="small muted">${esc(fmtDayDate(j.qa_date))} · ${esc(typesText(j))}</div>
    </div>

    <div class="card">
      <h2>What is on the record</h2>
      <div class="stat">
        <div><span class="n">${pr.patches}</span><span class="l">Patches</span></div>
        <div><span class="n">${jobPhotos(j.id).length}</span><span class="l">Photos</span></div>
        <div><span class="n">${jobReadings(j.id, 'depth').length}</span><span class="l">Depths</span></div>
        <div><span class="n" style="${out ? 'color:var(--red)' : 'color:var(--green)'}">${out}</span><span class="l">Out of spec</span></div>
      </div>
    </div>

    ${missing.length ? `
      <div class="banner">
        <strong>${missing.length} patch${missing.length === 1 ? ' is' : 'es are'} short of something.</strong>
        <em>${missing.map(g => `${esc(g.patch.name)}: ${esc(g.steps.join(', '))}`).join('<br>')}</em>
      </div>` : `
      <div class="banner info">Every step on every patch has something against it.</div>`}

    ${out ? `
      <div class="banner bad">
        <strong>${out} reading${out === 1 ? ' is' : 's are'} outside what the patch was asked for.</strong>
        <em>They stay on the record and are called out in red on the depth sheet. Say below why,
        if there is a reason.</em>
      </div>` : ''}

    <div class="card">
      <h2>Anything to add</h2>
      <label class="field" style="margin-bottom:0"><span>Notes at sign off</span>
        <textarea id="sNotes" placeholder="Patch 7 came up 12mm shallow over the manhole — agreed with the supervisor to leave it…">${esc(j.signoff_notes || '')}</textarea></label>
    </div>

    <button class="btn primary wide" id="signoff">${icon('check')}Sign off ${jobNo(j)}</button>
    <p class="tiny muted center mt">Signing off marks the QA complete and stamps it with your name.
    It can be reopened from the job if something turns up.</p>`;

  $('#signoff', view).onclick = async () => {
    if (missing.length && !confirm(`${missing.length} patch${missing.length === 1 ? '' : 'es'} still short of something. Sign off anyway?`)) return;
    await Store.patch('qa_jobs', j.id, { signoff_notes: $('#sNotes', view).value.trim() });
    await setJobStatus(j, 'complete');
    toast(jobNo(j) + ' signed off');
    go('#/job/' + j.id);
  };
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
   prints at any size: checked, and measured. */
const MARK = `
  <svg class="mark" viewBox="0 0 512 512" aria-hidden="true">
    <rect width="512" height="512" rx="112" fill="#1b1e22"/>
    <path d="M150 268 L222 340 L362 180" stroke="#c8971b" stroke-width="40"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M128 396 L384 396" stroke="#5b626b" stroke-width="18" stroke-linecap="round" fill="none"/>
    <path d="M160 396 L160 368M224 396 L224 358M288 396 L288 368M352 396 L352 358"
          stroke="#5b626b" stroke-width="18" stroke-linecap="round" fill="none"/>
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

/** Render, wait for the photos to load (so they aren't blank on the PDF),
    then print. The sheet is a table because a browser will repeat a thead on
    every printed page and will not repeat anything else — that is what puts
    the RCK line at the top of page four. */
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
    toast('Preparing the document…');
    await Promise.race([
      Promise.all(imgs.map(img => img.complete ? Promise.resolve()
        : new Promise(res => { img.onload = img.onerror = res; }))),
      // A QA record can carry two hundred photos over a thin connection.
      // Past this the document goes to the printer with what it has rather
      // than leaving somebody looking at a spinner in a ute.
      new Promise(res => setTimeout(res, 20000))
    ]);
  }
  setTimeout(() => window.print(), 80);
}

/* ------------------------------------------------------- the pieces */
function jobFacts(j) {
  const tone = j.status === 'onsite' ? 'on' : j.status === 'complete' ? 'done' : '';
  return `
    <table class="kv">
      <tr><td>QA number</td><td><strong>${jobNo(j)}</strong></td></tr>
      <tr><td>Site</td><td>${esc(j.name || '—')}</td></tr>
      <tr><td>Client</td><td>${esc(j.client || '—')}</td></tr>
      ${j.site ? `<tr><td>Where</td><td>${esc(j.site)}</td></tr>` : ''}
      ${j.job_ref ? `<tr><td>Client job number</td><td>${esc(j.job_ref)}</td></tr>` : ''}
      <tr><td>Date on site</td><td>${fmtDayDate(j.qa_date)}</td></tr>
      <tr><td>Type of work</td><td>${esc(typesText(j))}</td></tr>
      <tr><td>QA</td><td>${esc(j.qa_name || j.created_by || '—')}</td></tr>
      ${j.supervisor ? `<tr><td>Site supervisor</td><td>${esc(j.supervisor)}</td></tr>` : ''}
      <tr><td>Status</td><td><span class="badge ${tone}">${esc(statusLabel(j.status))}</span></td></tr>
      ${j.started_at ? `<tr><td>Started on site</td><td>${fmtDateTime(j.started_at)}${j.started_by ? ' · ' + esc(j.started_by) : ''}</td></tr>` : ''}
      ${j.completed_at ? `<tr><td>Signed off</td><td>${fmtDateTime(j.completed_at)}${j.completed_by ? ' · ' + esc(j.completed_by) : ''}</td></tr>` : ''}
    </table>
    ${j.description ? `<p class="note">${esc(j.description)}</p>` : ''}`;
}

function weatherFacts(j) {
  if (!j.weather && !isNum(j.air_temp) && !j.ground && !j.wind && !j.weather_notes) {
    return '<p>No weather recorded.</p>';
  }
  return `
    <table class="kv">
      <tr><td>Conditions</td><td>${esc((WEATHER.find(w => w.key === j.weather) || {}).label || '—')}</td></tr>
      <tr><td>Air temperature</td><td>${isNum(j.air_temp) ? num(j.air_temp, 0) + ' °C' : '—'}</td></tr>
      <tr><td>Surface</td><td>${esc((GROUND.find(g => g.key === j.ground) || {}).label || '—')}</td></tr>
      ${j.wind ? `<tr><td>Wind</td><td>${esc(j.wind)}</td></tr>` : ''}
    </table>
    ${j.weather_notes ? `<p class="note">${esc(j.weather_notes)}</p>` : ''}`;
}

/** What a patch was asked for and what it came out at, as one strip. */
function specStrip(patch, kind) {
  const cfg = READINGS[kind];
  const st = readingStats(patch, kind);
  const { target, tol } = spec(patch, kind);
  if (!st.n && target == null) return '';
  return `
    <div class="spec">
      <div><div class="l">${esc(cfg.specLabel)}</div>
        <div class="n">${target == null ? '—' : num(target) + cfg.unit}${
          cfg.band && target != null ? ` <span style="font-size:8pt">± ${num(tol)}</span>` : ''}</div></div>
      <div><div class="l">Taken</div><div class="n">${st.n}</div></div>
      <div><div class="l">Average</div><div class="n">${st.n ? num(st.avg) + cfg.unit : '—'}</div></div>
      <div><div class="l">Lowest</div><div class="n">${st.n ? num(st.min) + cfg.unit : '—'}</div></div>
      <div><div class="l">Highest</div><div class="n">${st.n ? num(st.max) + cfg.unit : '—'}</div></div>
      <div><div class="l">Out of spec</div>
        <div class="n ${st.out ? 'bad' : 'good'}">${st.out}</div></div>
    </div>`;
}

/** The readings themselves. Twenty of them as twenty table rows wastes a
    page, so when there is nothing to say about each but its number they go
    four across. The moment somebody has written down where a reading was
    taken, that is worth more than the paper, and it becomes a real table. */
function readingBlock(patch, kind) {
  const cfg = READINGS[kind];
  const list = readingsFor(patch.id, kind);
  if (!list.length) return '';
  const named = list.some(r => r.position);

  if (named) {
    return `
      <table>
        <thead><tr><th style="width:12mm">No</th><th>Where</th>
          <th style="width:26mm">${esc(cfg.label)}</th><th style="width:26mm">Result</th></tr></thead>
        <tbody>
          ${list.map((r, i) => {
            const v = verdict(patch, kind, r.value);
            return `<tr class="avoid-break">
              <td>${i + 1}</td>
              <td>${esc(r.position || '—')}</td>
              <td class="${isOut(v) ? 'neg' : ''}">${num(r.value)} ${esc(cfg.unit)}</td>
              <td class="${isOut(v) ? 'neg' : v === 'ok' ? 'pos' : ''}">${
                v === 'ok' ? 'Within spec' : v === 'low' ? 'Under' : v === 'high' ? 'Over' : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  return `
    <div class="grid4">
      ${list.map((r, i) => {
        const v = verdict(patch, kind, r.value);
        return `<div class="rdc ${isOut(v) ? 'out' : ''}">
          <span class="i">${i + 1}</span>
          <span class="v">${num(r.value)}</span><span class="u">${esc(cfg.unit)}</span>
        </div>`;
      }).join('')}
    </div>`;
}

/** Which steps were captured on a patch, and which were not. */
function stepsLine(patch) {
  const steps = stepsOf(patch);
  if (!steps.length) return '';
  const done = steps.filter(s => stepDone(patch, s.key)).map(s => s.label);
  const short = steps.filter(s => !stepDone(patch, s.key)).map(s => s.label);
  return `
    <div class="steps-line">
      <b>Captured:</b> ${done.length ? esc(done.join(', ')) : 'nothing'}${
      short.length ? ` &nbsp;·&nbsp; <span class="miss">Not captured: ${esc(short.join(', '))}</span>` : ''}
    </div>`;
}

function patchHead(patch) {
  const out = patchOutOfSpec(patch);
  return `
    <div class="patch-head">
      <h3>${esc(patch.name || 'Patch ' + patch.number)}</h3>
      ${patch.location ? `<span class="where">${esc(patch.location)}</span>` : ''}
      <span class="verdict ${out ? 'bad' : 'ok'}">${out ? out + ' out of spec' : 'Within spec'}</span>
    </div>`;
}

/** Photos, captioned with where and when they were taken. */
function photoGrid(list, dense) {
  if (!list.length) return '';
  return `
    <div class="photos${dense ? ' dense' : ''}">
      ${list.map(s => {
        const patch = s.patch_id ? patchById(s.patch_id) : null;
        const where = s.step_label || stepLabel(patch, s.step);
        return `
          <div class="photo">
            <img src="${esc(s.file_url)}" alt="">
            <div class="cap"><b>${esc(where)}</b> — ${esc(fmtTime(s.taken_at))}${
              patch ? ', ' + esc(patch.name) : ''}${s.caption ? '<br>' + esc(s.caption) : ''}</div>
          </div>`;
      }).join('')}
    </div>`;
}

/** A patch's photos in the order its steps happen, not the order the phone
    happened to upload them. */
function patchPhotosInOrder(patch) {
  const order = stepsOf(patch).map(s => s.key);
  return patchPhotos(patch.id).slice().sort((a, b) => {
    const ai = order.indexOf(a.step), bi = order.indexOf(b.step);
    const r = (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    return r || byTaken(a, b);
  });
}

/* ---------------------------------------------------- the documents */
/* The whole record: what the job was, what the weather was doing, every
   patch with its numbers, and every photo. This is the workbook. */
function printQaReport(j) {
  const patches = patchesFor(j.id);
  const out = jobOutOfSpec(j);
  const shots = jobPhotos(j.id);
  const site = sitePhotos(j.id);
  const missing = whatsMissing(j);

  printDoc(`
    ${docHead('QA record', j.name || 'Unnamed site', jobNo(j) + (j.client ? ' · ' + j.client : ''))}

    <div class="figures">
      <div><div class="n">${patches.length}</div><div class="l">Patches</div></div>
      <div><div class="n">${shots.length}</div><div class="l">Photos</div></div>
      <div><div class="n">${jobReadings(j.id, 'depth').length}</div><div class="l">Depths</div></div>
      <div><div class="n ${out ? 'neg' : 'pos'}">${out}</div><div class="l">Out of spec</div></div>
    </div>

    <h2>The job</h2>
    ${jobFacts(j)}

    <h2>Weather on site</h2>
    ${weatherFacts(j)}

    ${patches.length ? `
    <h2>Patches at a glance</h2>
    <table>
      <thead><tr>
        <th>Patch</th><th>Where</th>
        <th style="width:20mm">Design</th><th style="width:16mm">Depths</th>
        <th style="width:18mm">Average</th><th style="width:22mm">Range</th>
        <th style="width:18mm">Out</th><th style="width:18mm">Steps</th>
      </tr></thead>
      <tbody>
        ${patches.map(p => {
          const d = readingStats(p, 'depth');
          const pr = patchProgress(p);
          const o = patchOutOfSpec(p);
          return `<tr class="avoid-break">
            <td><strong>${esc(p.name || 'Patch ' + p.number)}</strong></td>
            <td>${esc(p.location || '—')}</td>
            <td>${isNum(p.design_depth) ? num(p.design_depth) + 'mm' : '—'}</td>
            <td>${d.n || '—'}</td>
            <td>${d.n ? num(d.avg) + 'mm' : '—'}</td>
            <td>${d.n ? num(d.min) + '–' + num(d.max) + 'mm' : '—'}</td>
            <td class="${o ? 'neg' : ''}">${o || '—'}</td>
            <td>${pr.done}/${pr.total}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '<h2>Patches</h2><p>No patches were recorded on this job.</p>'}

    ${missing.length ? `
      <h2>Not captured</h2>
      <table>
        <thead><tr><th style="width:46mm">Patch</th><th>Steps with nothing against them</th></tr></thead>
        <tbody>${missing.map(g => `<tr class="avoid-break">
          <td>${esc(g.patch.name)}</td><td class="miss">${esc(g.steps.join(', '))}</td></tr>`).join('')}</tbody>
      </table>` : ''}

    ${j.signoff_notes ? `<h2>Notes at sign off</h2><p class="note">${esc(j.signoff_notes)}</p>` : ''}

    ${site.length ? `<h2>The site</h2>${photoGrid(site, site.length > 4)}` : ''}

    ${patches.map(p => `
      ${patchHead(p)}
      ${p.mix || isNum(p.length_m) || p.notes ? `
        <table class="kv">
          ${p.mix ? `<tr><td>Mix</td><td>${esc(p.mix)}</td></tr>` : ''}
          ${isNum(p.length_m) && isNum(p.width_m) ? `<tr><td>Size</td><td>${
            num(p.length_m)} × ${num(p.width_m)} m — ${num(Number(p.length_m) * Number(p.width_m))} m²</td></tr>` : ''}
          ${p.notes ? `<tr><td>Notes</td><td>${esc(p.notes)}</td></tr>` : ''}
        </table>` : ''}
      ${stepsLine(p)}
      ${readingsFor(p.id, 'depth').length || isNum(p.design_depth) ? `
        ${specStrip(p, 'depth')}${readingBlock(p, 'depth')}` : ''}
      ${readingsFor(p.id, 'temp').length ? `
        ${specStrip(p, 'temp')}${readingBlock(p, 'temp')}` : ''}
      ${photoGrid(patchPhotosInOrder(p), patchPhotos(p.id).length > 4)}
    `).join('')}

    <div class="sig">
      <div>QA — ${esc(j.qa_name || j.created_by || '')}</div>
      <div>Site supervisor — ${esc(j.supervisor || '')}</div>
      <div>Date</div>
    </div>`,
    jobNo(j) + ' · ' + (j.name || ''));
}

/* Just the numbers. This is the string sheet, and it is the page that gets
   asked for two years later when a joint opens up. */
function printDepthSheet(j) {
  const patches = patchesFor(j.id).filter(p =>
    readingsFor(p.id, 'depth').length || readingsFor(p.id, 'temp').length || isNum(p.design_depth));
  const all = jobReadings(j.id, 'depth').map(r => Number(r.value)).filter(v => isFinite(v));
  const out = patchesFor(j.id).reduce((n, p) => n + readingStats(p, 'depth').out, 0);
  const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;

  printDoc(`
    ${docHead('Depth sheet', j.name || 'Unnamed site', jobNo(j) + (j.client ? ' · ' + j.client : ''))}

    <div class="figures">
      <div><div class="n">${patches.length}</div><div class="l">Patches</div></div>
      <div><div class="n">${all.length}</div><div class="l">Depths taken</div></div>
      <div><div class="n">${avg == null ? '—' : num(avg) + 'mm'}</div><div class="l">Average across the job</div></div>
      <div><div class="n ${out ? 'neg' : 'pos'}">${out}</div><div class="l">Out of spec</div></div>
    </div>

    <table class="kv">
      <tr><td>Site</td><td><strong>${esc(j.name || '—')}</strong>${j.site ? ' — ' + esc(j.site) : ''}</td></tr>
      <tr><td>Client</td><td>${esc(j.client || '—')}${j.job_ref ? ' · job ' + esc(j.job_ref) : ''}</td></tr>
      <tr><td>Date on site</td><td>${fmtDayDate(j.qa_date)}</td></tr>
      <tr><td>Weather</td><td>${esc(weatherText(j) || '—')}</td></tr>
      <tr><td>QA</td><td>${esc(j.qa_name || j.created_by || '—')}</td></tr>
    </table>

    ${patches.length ? patches.map(p => `
      ${patchHead(p)}
      ${specStrip(p, 'depth')}
      ${readingBlock(p, 'depth') || '<p>No depths taken on this patch.</p>'}
      ${readingsFor(p.id, 'temp').length ? `
        <div class="steps-line"><b>Paving temperature</b></div>
        ${specStrip(p, 'temp')}${readingBlock(p, 'temp')}` : ''}
    `).join('') : '<p>No depths were recorded on this job.</p>'}

    ${j.signoff_notes ? `<h2>Notes</h2><p class="note">${esc(j.signoff_notes)}</p>` : ''}

    <div class="sig">
      <div>Measured by — ${esc(j.qa_name || j.created_by || '')}</div>
      <div>Checked by</div>
      <div>Date</div>
    </div>`,
    jobNo(j) + ' · depth sheet');
}

/* Every photo, in the order the work happened. */
function printPhotoSheet(j) {
  const patches = patchesFor(j.id);
  const site = sitePhotos(j.id);
  const total = jobPhotos(j.id).length;

  printDoc(`
    ${docHead('Photo record', j.name || 'Unnamed site', jobNo(j) + (j.client ? ' · ' + j.client : ''))}

    <table class="kv">
      <tr><td>Site</td><td><strong>${esc(j.name || '—')}</strong>${j.site ? ' — ' + esc(j.site) : ''}</td></tr>
      <tr><td>Client</td><td>${esc(j.client || '—')}</td></tr>
      <tr><td>Date on site</td><td>${fmtDayDate(j.qa_date)}</td></tr>
      <tr><td>Weather</td><td>${esc(weatherText(j) || '—')}</td></tr>
      <tr><td>Photos</td><td>${total}</td></tr>
    </table>

    ${site.length ? `<h2>The site</h2>${photoGrid(site, true)}` : ''}

    ${patches.map(p => {
      const list = patchPhotosInOrder(p);
      if (!list.length) return '';
      return `${patchHead(p)}${stepsLine(p)}${photoGrid(list, true)}`;
    }).join('')}

    ${total ? '' : '<p>No photos were taken on this job.</p>'}`,
    jobNo(j) + ' · photos');
}

/* ------------------------------------------------------------- CSV */
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv(name, rows) {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function readingRows(jobs) {
  const rows = [[
    'QA number', 'Site', 'Client', 'Date', 'Patch', 'Where', 'Reading', 'No',
    'Value', 'Unit', 'Position', 'Design', 'Tolerance', 'Result', 'Taken at', 'By'
  ]];
  jobs.forEach(j => patchesFor(j.id).forEach(p => {
    Object.keys(READINGS).forEach(kind => {
      const cfg = READINGS[kind];
      const { target, tol } = spec(p, kind);
      readingsFor(p.id, kind).forEach((r, i) => {
        const v = verdict(p, kind, r.value);
        rows.push([
          jobNo(j), j.name, j.client, j.qa_date, p.name, p.location,
          cfg.label, i + 1, r.value, cfg.unit, r.position,
          target == null ? '' : target, cfg.band && tol != null ? tol : '',
          v === 'ok' ? 'Within spec' : v === 'low' ? 'Under' : v === 'high' ? 'Over' : 'Not judged',
          r.taken_at, r.author
        ]);
      });
    });
  }));
  return rows;
}

function exportReadingsCsv(j) {
  const rows = readingRows([j]);
  if (rows.length < 2) { toast('No readings on this job yet.'); return; }
  downloadCsv(jobNo(j) + '-readings.csv', rows);
  toast('Downloaded');
}

/* ================================================================
   Screen — reports
   ================================================================ */
function renderReports(view) {
  const jobs = boardOrder(activeJobs());
  const chosen = route.query.j || (jobs[0] && jobs[0].id) || '';
  const j = jobById(chosen);
  const from = route.query.from || '';
  const to = route.query.to || '';

  const inRange = DB.qa_jobs.filter(x => {
    const d = (x.qa_date || '').slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
  const rangeDepths = inRange.reduce((n, x) => n + jobReadings(x.id, 'depth').length, 0);
  const rangeOut = inRange.reduce((n, x) => n + jobOutOfSpec(x), 0);

  view.innerHTML = `
    <div class="card">
      <h2>One job</h2>
      ${jobs.length ? `
        <label class="field"><span>Which job</span>
          <select id="pick">
            ${jobs.map(x => `<option value="${x.id}" ${x.id === chosen ? 'selected' : ''}>${
              esc(jobNo(x))} — ${esc(x.name || 'Unnamed site')} · ${esc(fmtShort(x.qa_date))}</option>`).join('')}
          </select></label>
        <div class="btn-row">
          <button class="btn primary" id="pReport">${icon('print')}QA record</button>
          <button class="btn" id="pDepths">${icon('ruler')}Depth sheet</button>
        </div>
        <div class="btn-row mt">
          <button class="btn" id="pPhotos">${icon('image')}Photo record</button>
          <button class="btn" id="pCsv">${icon('download')}Readings CSV</button>
        </div>
        <p class="tiny muted mt" style="margin-bottom:0">The <strong>QA record</strong> is the
        whole thing — job, weather, every patch, every number, every photo. The other three are
        the pieces, for when only one is wanted.</p>
      ` : '<p class="muted small">No jobs yet.</p>'}
    </div>

    <div class="card">
      <h2>Across jobs</h2>
      <p class="muted small">Every reading taken in a stretch of time, as a spreadsheet.</p>
      <div class="rd-spec">
        <label class="field"><span>From</span><input type="date" id="rFrom" value="${esc(from)}"></label>
        <label class="field"><span>To</span><input type="date" id="rTo" value="${esc(to)}"></label>
      </div>
      <div class="stat mb">
        <div><span class="n">${inRange.length}</span><span class="l">Jobs</span></div>
        <div><span class="n">${inRange.reduce((n, x) => n + patchesFor(x.id).length, 0)}</span><span class="l">Patches</span></div>
        <div><span class="n">${rangeDepths}</span><span class="l">Depths</span></div>
        <div><span class="n" style="${rangeOut ? 'color:var(--red)' : ''}">${rangeOut}</span><span class="l">Out of spec</span></div>
      </div>
      <div class="btn-row">
        <button class="btn primary" id="rGo">Apply the dates</button>
        <button class="btn" id="rCsv">${icon('download')}All readings as CSV</button>
      </div>
    </div>

    ${rangeOut ? `
    <div class="card">
      <h2>Out of spec in this stretch</h2>
      <table class="data">
        ${inRange.filter(x => jobOutOfSpec(x)).map(x => `
          <tr><th>${esc(jobNo(x))}</th>
            <td>${esc(x.name || 'Unnamed site')}<br>
              <span class="tiny muted">${esc(fmtShort(x.qa_date))} — </span>
              <span class="tiny overdue">${jobOutOfSpec(x)} out of spec</span></td></tr>`).join('')}
      </table>
    </div>` : ''}`;

  const picker = $('#pick', view);
  if (picker) {
    picker.onchange = () => go('#/reports?j=' + picker.value + (from ? '&from=' + from : '') + (to ? '&to=' + to : ''));
    $('#pReport', view).onclick = () => j && printQaReport(j);
    $('#pDepths', view).onclick = () => j && printDepthSheet(j);
    $('#pPhotos', view).onclick = () => j && printPhotoSheet(j);
    $('#pCsv', view).onclick    = () => j && exportReadingsCsv(j);
  }

  $('#rGo', view).onclick = () => {
    const f = $('#rFrom', view).value, t = $('#rTo', view).value;
    go('#/reports?j=' + chosen + (f ? '&from=' + f : '') + (t ? '&to=' + t : ''));
  };
  $('#rCsv', view).onclick = () => {
    const rows = readingRows(inRange);
    if (rows.length < 2) { toast('No readings in that stretch.'); return; }
    downloadCsv(`rck-qa-readings${from ? '-' + from : ''}${to ? '-to-' + to : ''}.csv`, rows);
    toast('Downloaded');
  };
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
        <strong>Settings → Set up someone else's phone</strong>, or enter the details by hand.</p>
        <a class="btn wide mt" href="#/setup">Enter them by hand</a>
      </div>`;
    return;
  }

  view.innerHTML = `
    <div class="card">
      <h2>Set up RCK QA</h2>
      <p class="muted small">This links your phone to the shared QA records. You only do this once.</p>
      <label class="field"><span>Your name</span>
        <input type="text" id="jName" value="${esc(S.name)}" placeholder="e.g. Dave T"></label>
      <label class="field"><span>This device is used by</span>
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
    if (roleDef(role).manage && SITE.managerPin) {
      const pin = prompt('Manager code:');
      if (pin !== SITE.managerPin) return toast('Wrong code');
    }

    this.disabled = true;
    this.textContent = 'Connecting…';
    const out = $('#jOut', view);
    let problem = 'Could not reach the database. Check you have signal and try again, or ask for a new link.';
    try {
      const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/qa_jobs?select=id&limit=1`, {
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
   Screen — settings
   ================================================================ */
function saveAs(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderSetup(view) {
  const waiting = Outbox.count();
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
      <h2>Photos</h2>
      <p class="muted small">Every photo is stamped with the time it was taken and who took it.
      It can also carry the spot on the ground, which is what settles an argument about which
      patch a photo belongs to.</p>
      <label class="field" style="margin-bottom:0"><span>Location stamp</span>
        <select id="sGeo">
          <option value="1" ${S.geo ? 'selected' : ''}>On — stamp photos with where they were taken</option>
          <option value="0" ${!S.geo ? 'selected' : ''}>Off</option>
        </select></label>
      <p class="tiny muted mt">The phone asks your permission the first time. If it can't get a fix
      within six seconds the photo goes without one — nobody waits on a satellite in a live lane.</p>
      <button class="btn wide" id="saveGeo">Save</button>
    </div>

    <div class="card">
      <h2>Shared data</h2>
      <p class="muted small">These come from Supabase → Settings → API. Everyone who enters the same
      two values sees the same QA records.</p>
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
      <p class="muted small">Send this link to the other QAs. One tap connects their phone —
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
      Nobody else sees it. The place to learn the app is a practice job, not a live one.</p>
      <label class="field"><span>Mode</span>
        <select id="sLocal">
          <option value="0" ${!S.localMode ? 'selected' : ''}>Shared (Supabase)</option>
          <option value="1" ${S.localMode ? 'selected' : ''}>This device only (practice)</option>
        </select></label>
      <button class="btn wide" id="saveMode">Switch mode</button>
    </div>

    ${waiting ? `
    <div class="card">
      <h2>${waiting} change${waiting > 1 ? 's' : ''} waiting to send</h2>
      ${Outbox.problem() ? `
        <div class="banner bad">The database refused them, so they will not go on their own.
          <em>${esc(Outbox.problem().message)}</em></div>
        ${/column|schema cache|PGRST204/i.test(Outbox.problem().message) ? `
          <p class="muted small"><strong>This one has a known cause.</strong> The database was set up
          from an older copy of <code>supabase-schema.sql</code> and is missing a column the app now
          sends. Open Supabase → SQL Editor, paste the current <code>supabase-schema.sql</code> and
          press Run — it is safe over a live database and adds what is missing. Then come back here
          and press <strong>Try again</strong>. Nothing is lost in the meantime.</p>` : ''}
      ` : '<p class="muted small">They are safe on this phone — photos and all — and go as soon as there is signal.</p>'}
      <div class="btn-row">
        <button class="btn primary" id="retry">Try again now</button>
        <button class="btn" id="backup">${icon('download')}Download a backup</button>
      </div>
      <p class="muted tiny mt" style="margin-bottom:0">The backup is a file holding everything on this
      device, sent or not, photos included. Keep it before changing anything here.</p>
    </div>` : ''}

    <div class="card">
      <h2>Status</h2>
      <table class="data">
        <tr><th>This device</th><td>${esc(roleLabel(S.role))}</td></tr>
        <tr><th>Connection</th><td>${S.localMode ? 'This device only' : connected() ? 'Shared database' : 'Not set up'}</td></tr>
        <tr><th>QA jobs</th><td>${DB.qa_jobs.length}</td></tr>
        <tr><th>Patches</th><td>${DB.qa_patches.length}</td></tr>
        <tr><th>Photos</th><td>${DB.qa_photos.length}</td></tr>
        <tr><th>Readings</th><td>${DB.qa_readings.length}</td></tr>
        <tr><th>Waiting to send</th><td>${waiting}</td></tr>
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
    if (roleDef(role).manage && !isManager() && SITE.managerPin) {
      const pin = prompt('Manager code:');
      if (pin !== SITE.managerPin) return toast('Wrong code');
    }
    Settings.write({ name, role });
    toast('Saved');
    render();
  };

  $('#saveGeo', view).onclick = () => {
    Settings.write({ geo: $('#sGeo', view).value === '1' });
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
      const res = await fetch(`${url}/rest/v1/qa_jobs?select=id&limit=1`, {
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
          await navigator.share({ title: 'RCK QA setup', text: 'Tap this to set up RCK QA on your phone', url: link });
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
     no amount of going wrong can put a day's photos beyond reach. */
  function downloadBackup() {
    const dump = {
      app: 'RCK QA', version: VERSION, taken: new Date().toISOString(),
      device: { name: S.name, role: S.role, localMode: S.localMode },
      waitingToSend: Outbox.all(),
      problem: Outbox.problem(),
      qa_jobs: DB.qa_jobs, qa_patches: DB.qa_patches,
      qa_photos: DB.qa_photos, qa_readings: DB.qa_readings
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    saveAs(href, `rck-qa-backup-${today()}.json`);
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
    const left = Outbox.count();
    if (left) {
      // This is the one button that can destroy work. Make it take a backup first.
      if (!confirm(`${left} change(s) have not reached the database yet.\n\n` +
                   'Clearing now would destroy them for good. A backup file will be saved first.')) return;
      downloadBackup();
      if (!confirm('Backup saved. Clear this device now?')) return;
    } else if (!confirm('Clear the copy held on this device? Shared data in Supabase is not touched.')) {
      return;
    }
    localStorage.removeItem(cacheKey());
    localStorage.removeItem('rckq.outbox');
    localStorage.removeItem('rckq.outbox.problem');
    TABLES.forEach(t => { DB[t] = []; });
    refresh().then(render);
  };
}

/* ================================================================
   Sync loop
   ================================================================ */
let syncState = 'idle';

function paintSync() {
  const dot = $('#syncDot');
  if (!dot) return;
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
    if (document.hidden) return;
    // Never redraw a screen somebody is typing a depth into, or the number
    // half-entered goes with it.
    const typing = document.activeElement &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    const before = JSON.stringify(TABLES.map(t => DB[t].length));
    await refresh();
    const after = JSON.stringify(TABLES.map(t => DB[t].length));
    if (before !== after && !typing && ['/', '/today'].includes(route.path)) render();
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
$('#lightbox').onclick = closePhoto;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePhoto(); });

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
