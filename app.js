/* =====================================================================
   RCK Workshop — gear status, damage reports, work orders, repair history
   Plain JavaScript, no build step, no frameworks.
   ===================================================================== */
'use strict';

const VERSION = '2.10.0';

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
  book:    '<path d="M4 5.2A1.7 1.7 0 0 1 5.7 3.5H19v14H5.7A1.7 1.7 0 0 0 4 19.2z"/><path d="M4 19.2a1.7 1.7 0 0 0 1.7 1.7H19v-3.4"/><path d="M8 7.5h7"/>',
  broom:   '<path d="M13.5 4.5l6 6"/><path d="M11 12.5l-4.6 4.6a4 4 0 0 0-1.1 2.1L5 21l1.8-.3a4 4 0 0 0 2.1-1.1l4.6-4.6"/><path d="M9.4 10.9l3.7 3.7 4.2-4.2a2.6 2.6 0 0 0-3.7-3.7z"/>',
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
let manualsTableMissing = false;

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

/* A comment on its own never said whether someone was fixing the job or just
   talking about it, so a board full of notes told you nothing. Posting one now
   means saying which it is — and that answer becomes the job's live line,
   readable from the card without opening anything.

   Tone borrows the status vocabulary rather than inventing colours: red is bad
   news, yellow is held up, dark is happening now, grey is only words. */
const NOTE_KINDS = [
  { key: 'working', label: 'Working on it', diary: 'Working on a job',
    tone: 'live',  hint: 'Spanners on it now' },
  { key: 'waiting', label: 'Waiting on',    diary: 'Waiting on something',
    tone: 'hold',  hint: 'Parts, a quote, the repairer' },
  { key: 'problem', label: 'Hit a problem', diary: 'Problem on a job',
    tone: 'stop',  hint: 'Needs a decision' },
  { key: 'looked',  label: 'Had a look',    diary: 'Looked at a job',
    tone: 'plain', hint: 'Checked it over, nothing done yet' },
  { key: 'info',    label: 'Just info',     diary: 'Note added to a job',
    tone: 'plain', hint: 'Nothing for anyone to do' }
];
const noteKind = k => NOTE_KINDS.find(n => n.key === k) || null;
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
                    tone: n.tone, at: u.created_at, who: personOf(u.author) };
    if (u.kind === 'complete' || u.kind === 'reopen') break;
  }
  if (o.repairer === 'external') {
    return { label: 'With ' + (o.external_company || 'an external repairer'),
             tone: 'plain', at: o.updated_at, who: assignedTo(o) };
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
  writtenEntries().forEach(e => {
    if (e.kind && !seen.has(e.kind)) { seen.add(e.kind); out.push({ key: e.kind, label: logLabel(e) }); }
  });
  return out;
}

/** A diary day is the day on the calendar, so a late entry stays on its day. */
const logDay = e => (e.entry_date || (e.at || '').slice(0, 10) || '');

function logFor(name, date) {
  const n = personOf(name).toLowerCase();
  return allEntries()
    .filter(e => entryPerson(e).toLowerCase() === n && (!date || logDay(e) === date))
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}

const logOnDay = date => allEntries()
  .filter(e => logDay(e) === date)
  .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));

/** The days one person has written anything on, newest first. */
function logDays(name) {
  const seen = new Set();
  logFor(name).forEach(e => { const d = logDay(e); if (d) seen.add(d); });
  return Array.from(seen).sort().reverse();
}

/** Everyone who has done anything, so nobody's day is missing from the board. */
function everyoneWithActivity() {
  const seen = new Set();
  const out = [];
  allEntries().forEach(e => {
    const n = entryPerson(e);
    if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
  });
  return out;
}

/** Every raw device name seen anywhere, for the screen that links them up. */
function allDeviceNames() {
  const seen = new Map();
  const add = n => {
    const k = String(n || '').trim();
    if (k && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k);
  };
  DB.crew.forEach(c => { add(c.name); (c.aliases || []).forEach(add); });
  CREW_SEED.forEach(add);
  DB.work_orders.forEach(o => add(o.assigned_to));
  DB.wo_updates.forEach(u => add(u.author));
  DB.crew_log.forEach(e => add(e.crew_name));
  return Array.from(seen.values());
}

const logById = id => DB.crew_log.find(e => e.id === id);

/* ------------------------------------------------------------------------
   The captured half of the diary is not a second copy of the work — it is
   the work, read back. Every action on a job is already stored with who did
   it and when, and that record syncs to every phone. Deriving from it means
   the diary shows everyone, reaches back to before the diary existed, and
   can never drift out of step with the jobs it describes.
   ------------------------------------------------------------------------ */
const DERIVED_TONES = {
  created: 'stop', complete: 'done', reopen: 'stop', external: 'plain', status: 'plain'
};

const DERIVED_LABELS = {
  created:  'Damage reported',
  comment:  'Note added to a job',
  status:   'Job updated',
  external: 'Repairer arranged',
  complete: 'Job completed',
  reopen:   'Job reopened'
};

let derivedCache = null;
let derivedKey = '';

function derivedEntries() {
  const last = DB.wo_updates[DB.wo_updates.length - 1];
  const key = DB.wo_updates.length + ':' + (last ? last.id : '');
  if (derivedCache && derivedKey === key) return derivedCache;

  const rows = DB.wo_updates.slice()
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

  // Files arrive one row per file. Group the ones uploaded together — same
  // job, same person, seconds apart — so three photos read as one line. Time
  // buckets were wrong here: paperwork added later in the same ten minutes
  // was being swallowed into the report it followed.
  // Files group while they are consecutive on that job: anything else
  // happening on the job — a comment, a status change — ends the batch. Time
  // alone was the wrong signal, since a whole day's work can land in minutes.
  const GAP = 2 * 60 * 1000;
  const batches = [];
  const openFor = new Map();

  rows.forEach(u => {
    if (!u.author || !u.created_at) return;
    const key = `${u.work_order_id}|${String(u.author).toLowerCase()}`;

    if (u.kind !== 'file') {
      // something else happened on this job — whatever was being uploaded is done
      openFor.forEach((b, k) => { if (k.split('|')[0] === u.work_order_id) openFor.delete(k); });
      return;
    }

    const cur = openFor.get(key);
    const t = new Date(u.created_at).getTime();
    if (cur && t - cur.lastT <= GAP) {
      if (u.meta && u.meta.url) cur.files.push(u.meta);
      cur.lastT = t;
      if (!cur.body && u.body) cur.body = u.body;
      return;
    }
    const b = { at: u.created_at, lastT: t, author: u.author, wo: u.work_order_id,
                files: u.meta && u.meta.url ? [u.meta] : [], body: u.body || '', used: false };
    batches.push(b);
    openFor.set(key, b);
  });

  const out = [];

  rows.forEach(u => {
    if (u.kind === 'file') return;
    const n = noteOf(u);
    const label = n ? n.diary : DERIVED_LABELS[u.kind];
    const author = String(u.author || '').trim();
    if (!label || !author || !u.created_at) return;

    // photos taken with a damage report belong on that one line
    let files = [];
    if (u.kind === 'created') {
      const t = new Date(u.created_at).getTime();
      const b = batches.find(x => !x.used && x.wo === u.work_order_id
        && String(x.author).toLowerCase() === author.toLowerCase()
        && new Date(x.at).getTime() >= t
        && new Date(x.at).getTime() - t <= GAP);
      if (b) { files = b.files; b.used = true; }
    }

    out.push({
      id: 'wo:' + u.id,
      crew_name: personOf(author),
      entry_date: u.created_at.slice(0, 10),
      at: u.created_at,
      kind: 'auto_' + u.kind,
      label,
      tone: n ? n.tone : DERIVED_TONES[u.kind] || 'plain',
      body: u.body || '',
      work_order_id: u.work_order_id,
      amount: null,
      files,
      auto: true,
      author,
      role: u.role || ''
    });
  });

  batches.forEach((b, i) => {
    if (b.used || !b.files.length) return;
    const pics = b.files.filter(f => /^image\//.test(f.type || '')).length;
    out.push({
      id: 'wof:' + b.wo + ':' + i,
      crew_name: personOf(b.author),
      entry_date: b.at.slice(0, 10),
      at: b.at,
      kind: 'auto_file',
      tone: 'plain',
      label: pics === b.files.length ? `Photo${b.files.length === 1 ? '' : 's'} added`
           : pics ? 'Photos and paperwork added' : 'Paperwork added',
      body: b.body || '',
      work_order_id: b.wo,
      amount: null,
      files: b.files,
      auto: true,
      author: b.author,
      role: ''
    });
  });

  out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  derivedKey = key;
  derivedCache = out;
  return out;
}

/** Hand-written entries only — the captured ones are derived, so any older
    captured copies still sitting in the table are ignored rather than doubled. */
const writtenEntries = () => DB.crew_log.filter(e => !e.auto);

const allEntries = () => derivedEntries().concat(writtenEntries());

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
  DB.work_orders.forEach(o => add(assignedTo(o)));
  return out;
}

/** The crew, plus anyone else whose day has something in it. Nobody who has
    done work is left off the board just because they aren't on the list. */
function crewAndActive() {
  const out = crewNames().slice();
  const seen = new Set(out.map(n => n.toLowerCase()));
  everyoneWithActivity().forEach(n => {
    if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
  });
  return out;
}

/* ------------------------------------------------------------------------
   A clean slate.

   Names pile up — the six the app shipped with, every device anyone has
   ever used, everyone who has ever touched a job — until the board is a
   list of history rather than a list of people. Hiding a name takes it off
   the board until that person does something new, so the board empties and
   then refills with whoever is actually working. Nothing is deleted: the
   diary, the jobs and the history are exactly as they were, and a hidden
   name can still be given a job.
   ------------------------------------------------------------------------ */
/** Whether the database has the column this needs. Rows come back from
    PostgREST with every column on them, so one row carrying the key is
    proof; none carrying it, on a real database, means the SQL hasn't run. */
function canRestNames() {
  if (!connected() || !DB.crew.length) return true;
  return DB.crew.some(c => Object.prototype.hasOwnProperty.call(c, 'hidden_at'));
}

function hiddenSince(name) {
  const c = DB.crew.find(x => String(x.name || '').toLowerCase() === String(name || '').toLowerCase());
  return c && c.hidden_at ? c.hidden_at : null;
}

/** The moment the whole board was last cleared, if it was. */
function freshStartAt() {
  const stamps = DB.crew.map(c => c.hidden_at).filter(Boolean).sort();
  return stamps.length ? stamps[stamps.length - 1] : null;
}

/** Has this person done anything since they were hidden? */
function activeSince(name, iso) {
  const n = personOf(name).toLowerCase();
  return allEntries().some(e => entryPerson(e).toLowerCase() === n && String(e.at || '') >= iso);
}

/** Who belongs on the crew board: everyone not hidden, everyone who has
    worked since they were hidden, and — always — anyone holding an open
    job, so hiding a name can never lose the work it is carrying. */
function boardNames() {
  const holding = new Set(activeOrders().map(o => assignedTo(o).toLowerCase()).filter(Boolean));
  return crewAndActive().filter(n => {
    const since = hiddenSince(n);
    return !since || holding.has(n.toLowerCase()) || activeSince(n, since);
  });
}

/** Names kept off the board, for the pickers that still need to reach them. */
function restingNames() {
  const on = new Set(boardNames().map(n => n.toLowerCase()));
  return crewAndActive().filter(n => !on.has(n.toLowerCase()));
}

/** Clear the board from a given moment. Every name known today is put to
    rest; whoever works after that comes back by working. */
async function startFresh(fromISO) {
  const now = new Date().toISOString();
  for (const name of crewAndActive()) {
    const row = DB.crew.find(c => String(c.name || '').toLowerCase() === name.toLowerCase());
    if (row) await Store.patch('crew', row.id, { hidden_at: fromISO });
    else await Store.insert('crew', { id: uid(), name, active: true, aliases: [],
                                      hidden_at: fromISO, created_at: now });
  }
}

/** Put every name back, exactly as it was. */
async function undoFresh() {
  for (const row of DB.crew.filter(c => c.hidden_at)) {
    await Store.patch('crew', row.id, { hidden_at: null });
  }
}

/* ------------------------------------------------------------------------
   One person, several devices. Each crew row can carry alias names — the
   phone, the laptop, the workshop machine — and everything that groups by a
   name resolves through here first, so a person's jobs and their diary stay
   in one place instead of being split across whatever their device is called.
   ------------------------------------------------------------------------ */
let aliasCache = null;
let aliasKey = '';

function aliasMap() {
  const key = JSON.stringify(DB.crew.map(c => [c.name, c.aliases, c.active]));
  if (aliasCache && aliasKey === key) return aliasCache;
  const m = new Map();
  DB.crew.forEach(c => {
    if (c.active === false) return;
    const canon = String(c.name || '').trim();
    if (!canon) return;
    m.set(canon.toLowerCase(), canon);
    (Array.isArray(c.aliases) ? c.aliases : []).forEach(a => {
      const k = String(a || '').trim().toLowerCase();
      if (k && k !== canon.toLowerCase()) m.set(k, canon);
    });
  });
  aliasKey = key; aliasCache = m;
  return m;
}

/** The person behind a device name. Unknown names are left as they are. */
function personOf(raw) {
  const n = String(raw || '').trim();
  return n ? (aliasMap().get(n.toLowerCase()) || n) : '';
}

/** The other names this person's work arrives under. */
function aliasesOf(name) {
  const c = DB.crew.find(x => String(x.name || '').toLowerCase() === String(name || '').toLowerCase());
  return c && Array.isArray(c.aliases) ? c.aliases.filter(Boolean) : [];
}

const entryPerson = e => personOf(e && e.crew_name);

const matchCrew = name => {
  const n = String(name || '').trim().toLowerCase();
  return aliasMap().get(n) || crewNames().find(x => x.toLowerCase() === n) || null;
};

const assignedTo = o => personOf(o.assigned_to);

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
const DB = { gear: [], work_orders: [], wo_updates: [], costs: [], crew: [], crew_log: [], manuals: [], localSeq: 0 };

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
      DB.manuals = raw.manuals || [];
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
    const [gear, orders, updates, costs, crew, log, manuals] = await Promise.all([
      rest('gear?select=*&order=code.asc', { headers: restHeaders() }),
      rest('work_orders?select=*&order=number.desc&limit=3000', { headers: restHeaders() }),
      rest('wo_updates?select=*&order=created_at.desc&limit=6000', { headers: restHeaders() }),
      // The cost table may not exist yet on an older database; the rest of
      // the app must keep working if it doesn't.
      rest('costs?select=*&order=created_at.desc&limit=6000', { headers: restHeaders() }).catch(() => null),
      rest('crew?select=*&order=created_at.asc', { headers: restHeaders() }).catch(() => null),
      rest('crew_log?select=*&order=at.desc&limit=8000', { headers: restHeaders() }).catch(() => null),
      rest('manuals?select=*&order=title.asc&limit=2000', { headers: restHeaders() }).catch(() => null)
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
    if (manuals) { DB.manuals = manuals; manualsTableMissing = false; }
    else manualsTableMissing = true;
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

/** Kept only so older call sites stay harmless — the diary is derived from
    the work orders now, so nothing needs to be written a second time. */
async function autoDiary() { /* intentionally does nothing */ }

async function autoDiaryRetired(workOrderId, kind, body, opts) {
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
  if (path.startsWith('/manuals')) return 'manuals';
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
  '/crew-merge':      { title: 'Same person?',     render: renderCrewMerge,  back: true },
  '/crew-fresh':      { title: 'Start fresh',      render: renderCrewFresh,  back: true },
  '/crew-log':        { title: 'Diary entry',      render: renderCrewLogForm, back: true },
  '/manuals':        { title: 'Manuals',      render: renderManuals },
  '/manuals/new':    { title: 'Add a manual', render: renderManualForm, back: true },
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
  $('#homeBtn').hidden = !['costs', 'maintenance', 'crew', 'manuals'].includes(section) || (back || screen.back);

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
  // the card already names whoever is managing the job; saying it twice is
  // noise, so the speaker is named only when it is somebody else
  const who = p.who && p.who !== assignedTo(o) ? p.who : '';
  const meta = [who, when].filter(Boolean).join(' \u00b7 ');
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
      ${pulseLine(o, 'big')}
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

      <label class="field"><span>Managed by</span>
        <select id="wAssign">
          <option value="">Nobody yet</option>
          ${(() => {
            const pick = n => `<option value="${esc(n)}" ${
              assignedTo(o).toLowerCase() === n.toLowerCase() ? 'selected' : ''}>${esc(n)}</option>`;
            const on = boardNames();
            const off = restingNames();
            // a cleared name is still reachable — it just isn't in the way
            return on.map(pick).join('')
              + (off.length ? `<optgroup label="Not on the board">${off.map(pick).join('')}</optgroup>` : '');
          })()}
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
        <div class="lab">Managed by</div>
        <div class="big">${esc(assignedTo(o) || 'Unassigned')}</div>
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
        <td>${n ? `<strong>${esc(n.label)}</strong>` : esc(DERIVED_LABELS[u.kind] || 'Note')}</td>
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
                        assignedTo(o) ? ' · ' + esc(assignedTo(o)) : ''}${o.repairer === 'external'
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
      <a class="hub-card" href="#/manuals">
        <span class="hub-icon">${icon('book')}</span>
        <b>Manuals</b>
        <span class="hub-sub">Operator and workshop books, on every phone</span>
        <span class="hub-stat">${DB.manuals.length
          ? `${DB.manuals.length} manual${DB.manuals.length === 1 ? '' : 's'} on file`
          : 'Nothing uploaded yet'}</span>
      </a>
    </div>

    <p class="muted small center mt">Costs are still in the ⋮ menu.</p>`;
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

/* ================================================================
   Screen — linking a person's devices together
   ================================================================ */

/** Device words, so "Clint Laptop" and "Clint - phone" compare as "clint". */
const DEVICE_WORDS = /\b(mobile|phone|cell|laptop|ipad|tablet|tab|pc|desktop|computer|workshop|office|device|app|work)\b/gi;

function nameStem(n) {
  const cleaned = String(n || '').toLowerCase()
    .replace(DEVICE_WORDS, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .trim();
  return (cleaned.split(/\s+/)[0] || '');
}

/** Two names look like the same person if one stem starts the other. */
function looksSame(a, b) {
  const x = nameStem(a), y = nameStem(b);
  if (x.length < 3 || y.length < 3) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/** Groups of names that are probably one person and aren't linked yet.
    Grouped transitively: "Milian" and "Mill Road" never match each other,
    but both match "Mil", so all three belong to the same person. */
function suggestedGroups() {
  // a name that has been put to rest is not worth nagging about
  const resting = new Set(restingNames().map(n => n.toLowerCase()));
  const names = allDeviceNames().filter(n =>
    personOf(n).toLowerCase() === n.toLowerCase() && !resting.has(n.toLowerCase()));
  const parent = new Map(names.map(n => [n, n]));
  const find = a => { while (parent.get(a) !== a) a = parent.get(a); return a; };

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (!looksSame(names[i], names[j])) continue;
      const ra = find(names[i]), rb = find(names[j]);
      if (ra !== rb) parent.set(ra, rb);
    }
  }

  const buckets = new Map();
  names.forEach(n => {
    const r = find(n);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(n);
  });
  return Array.from(buckets.values()).filter(g => g.length > 1);
}

/** Which of a group reads like the person rather than the machine. */
const DEVICE_TEST = new RegExp(DEVICE_WORDS.source, 'i');
function bestKeeper(group) {
  const score = n => (DEVICE_TEST.test(n) ? 0 : 1000)
    + String(n).trim().split(/\s+/).length * 20 + String(n).length;
  return group.slice().sort((a, b) => score(b) - score(a))[0];
}

/** Fold a list of names into one person. The keeper holds everything. */
async function linkNames(keeper, others) {
  const keep = String(keeper).trim();
  const extras = others.map(n => String(n).trim()).filter(n => n && n.toLowerCase() !== keep.toLowerCase());
  if (!extras.length) return;

  // whatever the folded-in names were carrying comes with them
  const carried = [];
  extras.forEach(n => {
    carried.push(n);
    aliasesOf(n).forEach(a => carried.push(a));
  });

  let row = DB.crew.find(c => String(c.name || '').toLowerCase() === keep.toLowerCase());
  if (!row) {
    row = { id: uid(), name: keep, active: true, aliases: [], created_at: new Date().toISOString() };
    await Store.insert('crew', row);
  }

  const merged = [];
  const seen = new Set([keep.toLowerCase()]);
  (row.aliases || []).concat(carried).forEach(a => {
    const k = String(a || '').trim();
    if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); merged.push(k); }
  });
  await Store.patch('crew', row.id, { aliases: merged });

  // the folded-in crew rows step aside so they stop showing as people
  for (const n of extras) {
    const dupe = DB.crew.find(c => String(c.name || '').toLowerCase() === n.toLowerCase());
    if (dupe && dupe.id !== row.id) await Store.patch('crew', dupe.id, { active: false, aliases: [] });
  }

  // jobs move with the person so nothing is left behind on an old name
  for (const o of DB.work_orders) {
    const a = String(o.assigned_to || '').trim();
    if (a && extras.some(n => n.toLowerCase() === a.toLowerCase())) {
      await Store.patch('work_orders', o.id, { assigned_to: keep });
    }
  }
}

function renderCrewFresh(view) {
  const started = freshStartAt();
  const resting = restingNames();
  const back = boardNames();
  const holding = activeOrders().filter(o => assignedTo(o)).length;

  // default to the start of tomorrow, so today finishes as it is
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

  $('#title').textContent = 'Start fresh';

  const ready = canRestNames();

  view.innerHTML = `
    ${crewBanner()}
    ${ready ? '' : `<div class="banner">This needs one line added to the database first.
      Run <code>supabase-schema.sql</code> in Supabase again — it is safe to re-run —
      then reopen the app. Everything else keeps working meanwhile.</div>`}
    ${started ? `
      <div class="card accent status-green">
        <h2 style="font-size:17px">The board was cleared</h2>
        <p class="small mt" style="margin-bottom:0">Counting from <strong>${esc(fmtDate(started))}</strong>.
          ${resting.length} name${resting.length === 1 ? '' : 's'} put to rest,
          ${back.length} back on the board.</p>
      </div>` : ''}

    <div class="card">
      <h2>${started ? 'Clear it again' : 'Clear the crew board'}</h2>
      <p class="small mt">Names pile up — the six the app came with, every phone and
        laptop anyone has signed in on, everyone who has ever touched a job. This
        takes them all off the board. From the date you pick, a name comes back the
        moment that person does something: raises a job, updates one, adds a photo,
        signs one off.</p>

      <div class="banner info" style="margin-top:12px">
        <strong>Nothing is deleted.</strong> Every work order, every photo and the
        whole diary stay exactly as they are — step the diary back to any past day
        and it reads the same as it does now. A cleared name can still be given a
        job, under <em>Not on the board</em> in the picker.
      </div>

      ${holding ? `<p class="small mt">${holding} open job${holding === 1 ? ' has' : 's have'}
        somebody on ${holding === 1 ? 'it' : 'them'} — ${holding === 1 ? 'that person stays' : 'those people stay'}
        on the board either way, so no live work goes quiet.</p>` : ''}

      <label class="field mt"><span>Start counting from</span>
        <input type="date" id="fDate" value="${esc(tomorrow)}">
      </label>
      <button class="btn primary wide" id="fGo" ${ready ? '' : 'disabled'}>Clear the board</button>
    </div>

    ${resting.length ? `
      <div class="section-title">Resting (${resting.length})</div>
      <p class="muted small" style="margin:-4px 4px 9px">Off the board until they work again.</p>
      <div class="card">
        <div class="merge-names">${resting.map(n => `<span class="tagname">${esc(n)}</span>`).join('')}</div>
      </div>
      <button class="btn wide mt" id="fUndo">Put them all back</button>` : ''}`;

  $('#fGo', view).onclick = async function () {
    const d = $('#fDate', view).value;
    if (!d) return toast('Pick a date first');
    const iso = new Date(d + 'T00:00:00').toISOString();
    const n = crewAndActive().length;
    if (!confirm(`Take all ${n} names off the crew board and count again from ${fmtDate(d)}?\n\n`
      + 'Nothing is deleted — people come back as they work.')) return;
    this.disabled = true;
    this.textContent = 'Clearing…';
    await startFresh(iso);
    toast('Board cleared — it fills up as people work');
    go('#/crew');
  };

  const undo = $('#fUndo', view);
  if (undo) undo.onclick = async function () {
    this.disabled = true;
    await undoFresh();
    toast('Everyone is back');
    render();
  };
}

function renderCrewMerge(view) {
  const groups = suggestedGroups();
  const people = crewNames();
  const loose = allDeviceNames()
    .filter(n => personOf(n).toLowerCase() === n.toLowerCase())
    .filter(n => !people.some(p => p.toLowerCase() === n.toLowerCase()) || aliasesOf(n).length === 0);

  $('#title').textContent = 'Same person?';

  view.innerHTML = `
    ${crewBanner()}
    <div class="card">
      <h2>One person, several devices</h2>
      <p class="muted small" style="margin:0">People log in from a phone, a laptop and the workshop
      machine, and each carries its own name. Link them and their jobs and diary come together
      under one person.</p>
    </div>

    ${groups.length ? `
      <div class="section-title">Looks like the same person</div>
      ${groups.map((g, i) => `
        <div class="card">
          <div class="merge-names">${g.map(n => `<span class="tagname">${esc(n)}</span>`).join('')}</div>
          <label class="field mt"><span>Keep them all under</span>
            <select id="keep${i}">
              ${(() => { const best = bestKeeper(g);
                 return [best].concat(g.filter(n => n !== best))
                   .map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join(''); })()}
            </select></label>
          <button class="btn primary wide" data-join="${i}">Combine these ${g.length}</button>
        </div>`).join('')}` : ''}

    <div class="section-title">Everyone the app has seen</div>
    ${allDeviceNames().map(n => {
      const person = personOf(n);
      const isAlias = person.toLowerCase() !== n.toLowerCase();
      const mine = aliasesOf(n);
      return `
        <div class="card row spread" style="padding:12px 13px;gap:10px">
          <div class="grow" style="min-width:0">
            <strong>${esc(n)}</strong>
            ${isAlias ? `<div class="tiny muted">counted as ${esc(person)}</div>` : ''}
            ${mine.length ? `<div class="tiny muted">also: ${mine.map(esc).join(', ')}</div>` : ''}
          </div>
          ${isAlias
            ? `<button class="btn sm" data-split="${esc(n)}">Separate</button>`
            : `<button class="btn sm" data-into="${esc(n)}">Link…</button>`}
        </div>`;
    }).join('')}`;

  $$('[data-join]', view).forEach(b => b.onclick = async function () {
    const g = groups[+b.dataset.join];
    const keep = $('#keep' + b.dataset.join, view).value;
    this.disabled = true;
    this.textContent = 'Combining…';
    await linkNames(keep, g);
    toast(`Combined under ${keep}`);
    render();
  });

  $$('[data-into]', view).forEach(b => b.onclick = async () => {
    const from = b.dataset.into;
    const targets = crewAndActive().filter(n => n.toLowerCase() !== from.toLowerCase());
    if (!targets.length) return toast('Nobody else to link to yet');
    const pick = prompt(
      `"${from}" is the same person as which of these?\n\n` +
      targets.map((n, i) => `${i + 1}. ${n}`).join('\n') +
      `\n\nType the number, or a name:`);
    if (!pick) return;
    const byNum = targets[Number(pick.trim()) - 1];
    const keeper = byNum || targets.find(n => n.toLowerCase() === pick.trim().toLowerCase());
    if (!keeper) return toast('Did not recognise that');
    await linkNames(keeper, [from]);
    toast(`${from} now counts as ${keeper}`);
    render();
  });

  $$('[data-split]', view).forEach(b => b.onclick = async () => {
    const alias = b.dataset.split;
    const person = personOf(alias);
    const row = DB.crew.find(c => String(c.name || '').toLowerCase() === person.toLowerCase());
    if (!row) return;
    await Store.patch('crew', row.id, {
      aliases: (row.aliases || []).filter(a => String(a).toLowerCase() !== alias.toLowerCase())
    });
    toast(`${alias} separated out again`);
    render();
  });
}

/** Everyone worth a row, with the numbers each row needs, ordered so the
    people who need attention are the ones you read first. */
function crewRows(date) {
  const onCrew = new Set(crewNames().map(n => n.toLowerCase()));
  const order = boardNames();
  return order.map(name => {
    const st = crewStats(name);
    const t = dayTally(name, date);
    return { name, st, t, guest: !onCrew.has(name.toLowerCase()) };
  }).sort((a, b) =>
       (b.st.overdue - a.st.overdue)
    || (b.st.open - a.st.open)
    || (b.t.entries - a.t.entries)
    // nothing to separate them: leave the list in the order it was set up,
    // so a quiet morning shows the crew the way they are used to reading it
    || (order.indexOf(a.name) - order.indexOf(b.name)));
}

/** A whole day for the whole workshop, counted the same way one person is. */
function dayTotals(date) {
  const t = { entries: 0, reported: 0, updates: 0, photos: 0, docs: 0, closed: 0, notes: 0, people: 0 };
  const seen = new Set();
  logOnDay(date).forEach(e => {
    t.entries++;
    const who = entryPerson(e); if (who) seen.add(who.toLowerCase());
    (Array.isArray(e.files) ? e.files : []).forEach(f => {
      if (/^image\//.test(f.type || '')) t.photos++; else t.docs++;
    });
    if (!e.auto) { t.notes++; return; }
    const k = String(e.kind || '').replace(/^auto_/, '');
    if (k === 'complete') t.closed++;
    else if (k === 'created') t.reported++;
    else if (k !== 'file') t.updates++;
  });
  t.people = seen.size;
  return t;
}

/** The day at a glance — four numbers instead of a paragraph to scroll. */
function glance(t) {
  const cells = [
    [t.reported, 'reported'],
    [t.updates,  'updates'],
    [t.photos + t.docs, 'files'],
    [t.closed,   'closed']
  ];
  return `<div class="glance">${cells.map(([n, l]) =>
    `<div class="${n ? '' : 'zero'}"><span class="n">${n}</span><span class="l">${l}</span></div>`).join('')}</div>`;
}

/** The little counted strip on a person's row. */
function miniTally(t) {
  if (!t.entries) return '<span class="mt-quiet">nothing yet today</span>';
  const bits = [];
  const add = (n, l) => { if (n) bits.push(`<b>${n}</b> ${l}`); };
  add(t.reported, 'raised');
  add(t.updates, 'updates');
  add(t.photos + t.docs, 'files');
  add(t.closed, 'closed');
  add(t.notes, 'notes');
  return bits.slice(0, 3).join('<i>\u00b7</i>');
}

function renderCrewBoard(view) {
  const rows = crewRows(today());
  const loose = unassignedOrders();
  const tot = dayTotals(today());
  const busy = rows.filter(r => r.t.entries).slice(0, 8);

  view.innerHTML = `
    ${crewBanner()}

    <a class="card today-card" href="#/crew-today">
      <div class="tc-head">
        <span>Today</span>
        <span class="tc-date">${esc(fmtDate(today()))}</span>
      </div>
      ${glance(tot)}
      ${busy.length ? `<div class="facepile">${busy.map(r =>
          `<span class="avatar sm" title="${esc(r.name)}">${esc(initials(r.name))}</span>`).join('')}
        <span class="fp-note">${tot.people} ${tot.people === 1 ? 'person' : 'people'} on the tools</span></div>`
        : '<div class="fp-note only">Nothing logged yet today</div>'}
      <span class="tc-go">Open the diary \u2192</span>
    </a>

    ${loose.length ? `
      <button class="wo status-red unassigned-tile" id="looseTile">
        <div class="ttl">${loose.length} job${loose.length === 1 ? '' : 's'} with nobody on ${loose.length === 1 ? 'it' : 'them'}</div>
        <div class="sub"><span>Tap to assign</span></div>
      </button>` : ''}

    <div class="section-title">Crew</div>
    <div class="crew-list">
      ${rows.map((r, i) => {
        const tone = r.st.overdue ? 'status-red' : r.st.open ? 'status-orange' : 'status-green';
        return `
          <button class="crew-row ${tone}" data-name="${esc(r.name)}" style="--i:${Math.min(i, 14)}">
            <span class="avatar">${esc(initials(r.name))}</span>
            <span class="cr-mid">
              <span class="who">${esc(r.name)}</span>${
                r.guest ? '<span class="guest">not on the crew list</span>' : ''}
              <span class="cr-load">
                <span class="load">${r.st.open
                  ? `${r.st.open} open job${r.st.open === 1 ? '' : 's'}` : 'No open jobs'}</span>
                ${r.st.overdue ? `<span class="flag">${r.st.overdue} overdue</span>`
                  : r.st.red ? `<span class="flag amber">${r.st.red} out of action</span>` : ''}
              </span>
              <span class="mini">${miniTally(r.t)}</span>
            </span>
            <span class="cr-num${r.t.entries ? '' : ' zero'}">${r.t.entries}<i>today</i></span>
          </button>`;
      }).join('') || '<div class="card muted small">Nobody on the crew yet.</div>'}
    </div>

    <div class="btn-row mt">
      <button class="btn" id="addCrew">${icon('plus')}Add someone</button>
      <a class="btn ${suggestedGroups().length ? 'primary' : ''}" href="#/crew-merge">${icon('people')}Link devices${
        suggestedGroups().length ? ` (${suggestedGroups().length})` : ''}</a>
      <a class="btn" href="#/crew-fresh">${icon('broom')}Start fresh</a>
    </div>`;

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
  const also = aliasesOf(name);
  const todayRows = logFor(name, today());
  const earlier = days.filter(d => d !== today()).slice(0, 4);

  $('#title').textContent = name;

  view.innerHTML = `
    <div class="card crew-head">
      <span class="avatar big">${esc(initials(name))}</span>
      <div class="grow">
        <h2 style="font-size:20px">${esc(name)}</h2>
        <div class="muted small">${st.open ? `Managing ${st.open} open job${st.open === 1 ? '' : 's'}` : 'No open jobs'}</div>
        ${also.length ? `<div class="tiny" style="color:var(--ink-3);margin-top:3px">also ${esc(also.join(', '))}</div>` : ''}
      </div>
    </div>

    <div class="section-title">Today</div>
    ${glance(dayTally(name, today()))}
    ${todayRows.length
      ? `<div class="card log-card stream">${todayRows.slice().reverse().map(e => logRow(e)).join('')}</div>`
      : `<div class="card muted small">Nothing logged today.</div>`}
    <a class="btn wide mt" href="#/crew-log?who=${encodeURIComponent(name)}">${icon('plus')}Log something by hand</a>

    <div class="tally mt">
      <button class="status-orange" disabled><span class="n">${st.open}</span><span class="l">Open</span></button>
      <button class="status-red" disabled><span class="n">${st.overdue}</span><span class="l">Overdue</span></button>
      <button class="status-green" disabled><span class="n">${st.done}</span><span class="l">Fixed</span></button>
    </div>

    ${st.noDate ? `<div class="banner">${st.noDate} of these ${st.noDate === 1 ? 'has' : 'have'} no
      back-in-service date set, so nobody can tell if ${st.noDate === 1 ? 'it is' : 'they are'} slipping.</div>` : ''}

    <div class="section-title">Open jobs (${open.length})</div>
    ${open.length ? open.map(woCard).join('')
      : `<div class="card muted small">Nothing outstanding.</div>`}

    ${earlier.length ? `<div class="section-title">Earlier days</div>
      ${earlier.map(d => `
        <div class="log-day">
          <div class="log-date">${fmtDate(d)} <span class="tally-inline">${esc(tallyLine(dayTally(name, d)) || '')}</span></div>
          <div class="card log-card">${logFor(name, d).slice().reverse().map(e => logRow(e)).join('')}</div>
        </div>`).join('')}
      ${days.length > 5 ? `<p class="muted small center">Showing the last few days.
        <a href="#/crew-today">Open the daily diary</a> for any other day.</p>` : ''}` : ''}

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
    ? `<div class="banner">Work on jobs is showing here as normal. Your own
       written notes can't be saved yet though — run the <strong>Crew diary</strong>
       section at the end of <code>supabase-schema.sql</code> in Supabase to turn
       those on.</div>`
    : '';
}

/** One line of the diary. */
function logRow(e, opts) {
  const o = opts || {};
  const wo = e.work_order_id ? orderById(e.work_order_id) : null;
  const g = wo ? gearById(wo.gear_id) : null;
  const files = Array.isArray(e.files) ? e.files : [];
  const tone = e.tone || (e.auto ? 'plain' : 'written');
  return `
    <div class="log-item tone-${tone}${e.auto ? ' to-job' : ''}"
         ${e.auto && e.work_order_id ? `data-wo="${e.work_order_id}"` : `data-log="${e.id}"`}>
      <div class="log-time">${fmtTime(e.at)}<span class="log-dot"></span></div>
      <div class="log-body">
        <div class="log-head">
          ${o.showWho && entryPerson(e)
            ? `<span class="log-who"><span class="avatar sm">${esc(initials(entryPerson(e)))}</span>${
                esc(entryPerson(e))}</span>` : ''}
          <span class="log-kind">${esc(logLabel(e))}</span>
          ${!e.auto ? '<span class="log-hand">written by hand</span>' : ''}
          ${e.amount != null && e.amount !== '' ? `<span class="log-amt">${money(e.amount)}</span>` : ''}
        </div>
        ${wo ? `<div class="log-job">${esc(g ? g.code : '')} · ${woNo(wo)} — ${esc(wo.title)}</div>` : ''}
        ${(() => { const t = trimNote(e, wo);
          return t ? `<div class="log-note">${esc(t)}</div>` : ''; })()}
        ${files.length ? `<div class="thumbs">${files.map(f => /^image\//.test(f.type || '')
          ? `<a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt=""></a>`
          : `<a class="attach" href="${esc(f.url)}" target="_blank" rel="noopener">${icon('file')}${esc(f.name || 'file')}</a>`
        ).join('')}</div>` : ''}
        ${e.author && e.author !== entryPerson(e)
          ? `<div class="log-by">from ${esc(e.author)}</div>` : ''}
      </div>
    </div>`;
}

/** The line above already names the job, so a note that only repeats its
    title is noise. Keep whatever the note adds and drop the echo. */
function trimNote(e, wo) {
  let t = String(e.body || '').trim();
  if (!t || !wo) return t;
  const title = String(wo.title || '').trim();
  if (title) {
    const i = t.toLowerCase().indexOf(title.toLowerCase());
    if (i >= 0) t = (t.slice(0, i) + t.slice(i + title.length)).trim();
  }
  t = t.replace(/^damage reported:?\s*/i, '').replace(/^[\u2014\-:,\s]+/, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/* ------------------------------------------- the whole day, everyone */
const diaryState = { date: '', who: '', oldest: false };

/** Captured lines open the job they came from; hand-written ones open to edit. */
function wireLogRows(root) {
  $$('[data-log]', root).forEach(b => b.onclick = () => go('#/crew-log/edit/' + b.dataset.log));
  $$('.log-item[data-wo]', root).forEach(b => b.onclick = () => go('#/wo/' + b.dataset.wo));
}

function renderCrewDiary(view) {
  if (!diaryState.date) diaryState.date = today();
  const day = diaryState.date;
  const all = logOnDay(day);

  // group by person, keeping the order the crew board uses
  const order = crewAndActive();
  const groups = {};
  all.forEach(e => {
    const who = entryPerson(e) || 'Unattributed';
    (groups[who] = groups[who] || []).push(e);
  });
  const people = Object.keys(groups).sort((a, b) => {
    const ia = order.findIndex(n => n.toLowerCase() === a.toLowerCase());
    const ib = order.findIndex(n => n.toLowerCase() === b.toLowerCase());
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });

  // the filter only narrows what is shown; the day's totals stay the day's
  if (diaryState.who && !people.some(n => n === diaryState.who)) diaryState.who = '';
  const shown = diaryState.who ? groups[diaryState.who] : all;
  const tot = dayTotals(day);

  $('#title').textContent = 'Daily diary';

  view.innerHTML = `
    ${logBanner()}
    <div class="daynav">
      <button class="icon-btn" id="dPrev" aria-label="Previous day">
        <svg viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg></button>
      <label class="dn-date">
        <b>${esc(fmtDate(day))}</b>
        <span>${day === today() ? 'today' : `${tot.entries} entr${tot.entries === 1 ? 'y' : 'ies'}`}</span>
        <input type="date" id="dDate" value="${esc(day)}">
      </label>
      <button class="icon-btn" id="dNext" aria-label="Next day" ${day >= today() ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
    </div>

    ${glance(tot)}

    ${people.length ? `
      <div class="who-strip">
        <button class="who-chip all ${diaryState.who ? '' : 'on'}" data-who="">Everyone
          <i>${tot.entries}</i></button>
        ${people.map(n => `
          <button class="who-chip ${diaryState.who === n ? 'on' : ''}" data-who="${esc(n)}">
            <span class="avatar sm">${esc(initials(n))}</span>${esc(shortName(n))}
            <i>${groups[n].length}</i></button>`).join('')}
      </div>` : ''}

    ${shown.length ? `
      <div class="stream-head">
        <span>${diaryState.who ? esc(diaryState.who) : 'Everyone'} \u00b7 ${shown.length}
          entr${shown.length === 1 ? 'y' : 'ies'}</span>
        <button class="linky" id="dFlip">${diaryState.oldest ? 'Oldest first' : 'Latest first'}</button>
      </div>
      <div class="card log-card stream">
        ${(diaryState.oldest ? shown : shown.slice().reverse())
          .map(e => logRow(e, { showWho: !diaryState.who, face: true })).join('')}
      </div>`
      : `<div class="empty"><b>Nothing logged</b>${day === today()
          ? 'Nothing has happened on a job yet today.'
          : 'No one worked on a job this day.'}</div>`}

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
  const flip = $('#dFlip', view);
  if (flip) flip.onclick = () => { diaryState.oldest = !diaryState.oldest; renderCrewDiary(view); };
  $$('[data-who]', view).forEach(b => b.onclick = () => {
    diaryState.who = b.dataset.who; renderCrewDiary(view);
  });
  $('#dPrint', view).onclick = () => printDiaryDay(day, people, groups);
  wireLogRows(view);
}

/** "Clint Cunningham" \u2192 "Clint" — chips have no room for a surname. */
function shortName(n) {
  return String(n || '').trim().split(/\s+/)[0] || n;
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
      </table>`).join('') : '<p class="quiet">Nothing logged for this day.</p>'}
    <div class="sig"><div>Workshop manager &amp; date</div></div>
    ${docFoot('Workshop diary · ' + fmtDate(day))}`);
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
      }).join('') || '<tr><td colspan="6" class="quiet">Nothing in this period.</td></tr>'}
    </table>
    ${docFoot('Cost report')}`);
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
