/* =====================================================================
   RCK People — staff information and compliance.
   Plain JavaScript, no build step, no frameworks.

   The one rule that shapes this whole file: staff data is never written
   to the device. There is no offline cache. Everything lives in memory
   for as long as the screen is unlocked, and is thrown away on lock,
   sign-out or reload. Documents are fetched through short-lived signed
   links and shown from a blob that dies with the page.

   The shape of the app, in one line: a landing page of four options →
   the staff list as tiles → one person → one compliance tile open.
   ===================================================================== */
'use strict';

const VERSION = '1.0.0';
const SITE = window.RCKP_CONFIG || {};

/* =====================================================================
   Lists you may want to change

   These are the only things in this file worth editing by hand. Anything
   already recorded under an old value keeps working and stays selectable,
   so renaming one of these never silently reassigns anybody.
   ===================================================================== */

/* The three kinds of person the staff screen filters by. */
const WORKER_TYPES = [
  { key: 'rck',           label: 'RCK employee',  short: 'RCK',
    blurb: 'On RCK\'s own books.' },
  { key: 'labour_hire',   label: 'Labour hire',   short: 'Labour hire',
    blurb: 'Supplied by a labour hire firm.' },
  { key: 'subcontractor', label: 'Subcontractor', short: 'Subbie',
    blurb: 'A subcontractor — trucking company or other.' }
];
const isRck = p => (p.worker_type || 'rck') === 'rck';

/* The folders under "6. RCK STAFF" in SharePoint, in their own order. */
const CREWS = [
  { key: 'yellow',        label: 'Yellow Crew' },
  { key: 'green',         label: 'Green Crew' },
  { key: 'office',        label: 'Office' },
  { key: 'transport',     label: 'Transport' },
  { key: 'yard',          label: 'Yard / Workshop' },
  { key: 'stms',          label: 'STMS & Traffic Management' },
  { key: 'subcontractor', label: 'Sub Contractors' },
  { key: 'watercare',     label: 'Watercare & Civils' },
  { key: 'civil',         label: 'Civil' },
  { key: 'agency',        label: 'Recruitment Agencies' }
];

/* Which part of the business a contract sits in. */
const SECTORS = [
  { key: 'surfacing',  label: 'Asphalt & Surfacing' },
  { key: 'civil',      label: 'Civil' },
  { key: 'watercare',  label: 'Watercare' },
  { key: 'traffic',    label: 'Traffic Management' },
  { key: 'transport',  label: 'Transport' },
  { key: 'workshop',   label: 'Yard / Workshop' },
  { key: 'office',     label: 'Office & Administration' },
  { key: 'management', label: 'Management' }
];

const PAY_UNITS = [
  { key: 'hourly', label: 'Hourly' },
  { key: 'salary', label: 'Salary' },
  { key: 'daily',  label: 'Daily' }
];
const PAY_SUFFIX = { hourly: 'per hour', salary: 'per year', daily: 'per day' };

const PERSON_STATUS = [
  { key: 'active',   label: 'Active' },
  { key: 'on_leave', label: 'On leave' },
  { key: 'finished', label: 'Finished' }
];

/* Kinds of leave. Annual is the one this screen exists for; the rest are
   here so a week off doesn't have to be filed as annual leave when it
   wasn't. */
const LEAVE_KINDS = [
  { key: 'annual',      label: 'Annual leave' },
  { key: 'sick',        label: 'Sick leave' },
  { key: 'unpaid',      label: 'Unpaid leave' },
  { key: 'bereavement', label: 'Bereavement' },
  { key: 'parental',    label: 'Parental leave' },
  { key: 'other',       label: 'Other' }
];

const COMPANY_KINDS = [
  { key: 'labour_hire',   label: 'Labour hire firm' },
  { key: 'subcontractor', label: 'Subcontractor company' }
];

/* New Zealand licence classes and endorsements. */
const LICENCE_CLASSES = ['1', '2', '3', '4', '5', '6'];
const LICENCE_ENDORSEMENTS = [
  { key: 'W', label: 'W — Wheels' },
  { key: 'T', label: 'T — Tracks' },
  { key: 'R', label: 'R — Rollers' },
  { key: 'F', label: 'F — Forklift' },
  { key: 'D', label: 'D — Dangerous goods' },
  { key: 'P', label: 'P — Passenger' },
  { key: 'V', label: 'V — Vehicle recovery' },
  { key: 'O', label: 'O — Special type' },
  { key: 'I', label: 'I — Driving instructor' }
];
const LICENCE_TYPES = [
  { key: 'full',       label: 'Full' },
  { key: 'restricted', label: 'Restricted' },
  { key: 'learner',    label: 'Learner' }
];

/* Suggested machinery for the competency tile. Free text is allowed too —
   this list only fills the dropdown. */
const MACHINERY = [
  'Excavator', 'Bobcat / Skid steer', 'Roller / Compactor', 'Loader', 'Tractor',
  'Asphalt paver', 'Miller / Profiler', 'Transporter', 'Truck', 'Truck and trailer',
  'Concrete saw', 'Power tools', 'Hiab / Truck crane', 'Chipsealing unit', 'Sweeper'
];

const DRUG_TEST_KINDS = [
  { key: 'pre_employment', label: 'Pre-employment' },
  { key: 'random',         label: 'Random' },
  { key: 'post_incident',  label: 'Post-incident' },
  { key: 'reasonable',     label: 'Reasonable cause' }
];
const DRUG_TEST_RESULTS = [
  { key: 'negative',  label: 'Negative — passed' },
  { key: 'positive',  label: 'Positive — failed' },
  { key: 'pending',   label: 'Awaiting result' },
  { key: 'non_neg',   label: 'Non-negative — sent to lab' }
];

/* =====================================================================
   The compliance tiles

   This is the heart of the app. Every tile on a person's page, every
   field inside it, and everything the compliance percentage is worked
   out from, comes from this one list. Add a tile here and it appears on
   every person's page, in the reports, and in the percentage, with
   nothing else to change.

     key       what it is called in the database
     label     what it is called on screen
     labelFor  a different name for labour hire and subcontractors, where
               "RCK contract" would be the wrong words
     only      which worker types get this tile; null means everybody
     owner     'staff', or 'company' for the two tiles that belong to the
               firm rather than to each of its workers
     fields    the things typed in by hand
     files     the upload boxes
     rows      for tiles that hold a list — competencies, inductions
     expiries  which fields are expiry dates, and how early to warn

   A field or file marked `want: true` is what "filled in" means for that
   tile. Everything else is welcome but not counted.
   ===================================================================== */
const SECTIONS = [
  {
    key: 'contract',
    label: 'RCK contract',
    labelFor: { labour_hire: 'Engagement details', subcontractor: 'Engagement details' },
    icon: 'contract',
    blurb: 'The signed agreement, plus the terms written out so they can be read without opening it.',
    fields: [
      { name: 'start_date', label: 'Start date', type: 'date', want: true },
      { name: 'role', label: 'Role', type: 'text', want: true, placeholder: 'Paver operator' },
      { name: 'sector', label: 'Sector of the business', type: 'select', options: SECTORS, want: true },
      { name: 'pay_unit', label: 'Paid', type: 'select', options: PAY_UNITS, want: true },
      { name: 'pay_rate', label: 'Wage / salary', type: 'money', want: true, sensitive: true },
      { name: 'hours', label: 'Ordinary hours a week', type: 'text', placeholder: '40' },
      { name: 'signed_on', label: 'Signed on', type: 'date' }
    ],
    files: [{ slot: 'signed', label: 'Signed contract', want: true, accept: '.pdf,image/*' }]
  },

  {
    key: 'drug_test',
    label: 'Drug test result',
    icon: 'drug',
    blurb: 'The most recent test, and when the next one falls due.',
    fields: [
      { name: 'test_date', label: 'Date tested', type: 'date', want: true },
      { name: 'kind', label: 'Kind of test', type: 'select', options: DRUG_TEST_KINDS, want: true },
      { name: 'result', label: 'Result', type: 'select', options: DRUG_TEST_RESULTS, want: true },
      { name: 'provider', label: 'Tested by', type: 'text', placeholder: 'The Drug Detection Agency' },
      { name: 'next_due', label: 'Next test due', type: 'date' }
    ],
    files: [{ slot: 'result', label: 'Result certificate', want: true, accept: '.pdf,image/*' }],
    expiries: [{ field: 'next_due', label: 'Next test', warn: 30 }],
    /* A positive or pending result is not compliance, whatever is on file. */
    verdict(data) {
      if (data.result === 'positive') return { level: 'red', text: 'Positive result' };
      if (data.result === 'pending' || data.result === 'non_neg')
        return { level: 'orange', text: 'Awaiting the result' };
      return null;
    }
  },

  {
    key: 'licence',
    label: 'Driver licence',
    icon: 'licence',
    blurb: 'Front and back, and the classes and endorsements written out.',
    fields: [
      { name: 'number', label: 'Licence number', type: 'text', want: true, plain: true, placeholder: 'AB123456' },
      { name: 'kind', label: 'Type', type: 'select', options: LICENCE_TYPES, want: true },
      { name: 'classes', label: 'Classes held', type: 'picks', options: LICENCE_CLASSES.map(c => ({ key: c, label: 'Class ' + c })), want: true },
      { name: 'endorsements', label: 'Endorsements', type: 'picks', options: LICENCE_ENDORSEMENTS },
      { name: 'version', label: 'Card version', type: 'text', plain: true, placeholder: '3' },
      { name: 'issued_on', label: 'Issued', type: 'date' },
      { name: 'expires_on', label: 'Expires', type: 'date', want: true },
      { name: 'conditions', label: 'Conditions', type: 'text', placeholder: 'Must wear corrective lenses' }
    ],
    files: [
      { slot: 'front', label: 'Licence — front', want: true, accept: 'image/*,.pdf' },
      { slot: 'back',  label: 'Licence — back',  want: true, accept: 'image/*,.pdf' }
    ],
    expiries: [{ field: 'expires_on', label: 'Licence', warn: 60 }]
  },

  {
    key: 'photo',
    label: 'Head shot photo',
    icon: 'camera',
    blurb: 'Used on their tile and on printed site paperwork.',
    files: [{ slot: 'photo', label: 'Head shot', want: true, accept: 'image/*', image: true }]
  },

  {
    key: 'competencies',
    label: 'Machinery competencies',
    icon: 'gear',
    blurb: 'What they are signed off to operate, and on which machine.',
    rows: {
      one: 'competency', many: 'competencies', add: 'Add a competency',
      title: r => [r.competency, r.machinery].filter(Boolean).join(' — ') || 'Competency',
      fields: [
        { name: 'competency', label: 'Competency', type: 'text', want: true, placeholder: 'Operate to Level 3' },
        { name: 'machinery', label: 'Machinery it applies to', type: 'datalist', options: MACHINERY, want: true },
        { name: 'assessed_on', label: 'Assessed', type: 'date' },
        { name: 'expires_on', label: 'Expires', type: 'date' },
        { name: 'assessor', label: 'Assessed by', type: 'text' }
      ],
      file: { label: 'Certificate', accept: '.pdf,image/*' },
      expiry: 'expires_on', warn: 60
    }
  },

  {
    key: 'safety',
    label: 'Site Safe & first aid',
    icon: 'shield',
    blurb: 'Both cards, with the numbers and the dates they run out.',
    fields: [
      { name: 'sitesafe_number', label: 'Site Safe card number', type: 'text', want: true, plain: true },
      { name: 'sitesafe_expires', label: 'Site Safe expires', type: 'date', want: true },
      { name: 'firstaid_provider', label: 'First aid — provider', type: 'text', want: true, placeholder: 'St John' },
      { name: 'firstaid_expires', label: 'First aid expires', type: 'date', want: true }
    ],
    files: [
      { slot: 'sitesafe', label: 'Site Safe card', want: true, accept: 'image/*,.pdf' },
      { slot: 'firstaid', label: 'First aid certificate', want: true, accept: '.pdf,image/*' }
    ],
    expiries: [
      { field: 'sitesafe_expires', label: 'Site Safe', warn: 90 },
      { field: 'firstaid_expires', label: 'First aid', warn: 60 }
    ]
  },

  {
    key: 'golden_rules',
    label: '10 Golden Rules',
    icon: 'rules',
    blurb: 'Signed acceptance of the ten rules.',
    fields: [
      { name: 'accepted_on', label: 'Accepted on', type: 'date', want: true },
      { name: 'version', label: 'Version signed', type: 'text', placeholder: '2024' }
    ],
    files: [{ slot: 'signed', label: 'Signed acceptance', want: true, accept: '.pdf,image/*' }]
  },

  {
    key: 'vehicle',
    label: 'Vehicle agreement',
    icon: 'truck',
    blurb: 'The company vehicle policy, signed, and which vehicle it covers.',
    fields: [
      { name: 'signed_on', label: 'Signed on', type: 'date', want: true },
      { name: 'vehicle', label: 'Vehicle assigned', type: 'text', placeholder: 'Hilux — ABC123' },
      { name: 'rego', label: 'Registration', type: 'text', plain: true }
    ],
    files: [{ slot: 'signed', label: 'Signed agreement', want: true, accept: '.pdf,image/*' }]
  },

  {
    key: 'emergency',
    label: 'Emergency contact',
    icon: 'phone',
    blurb: 'Who to ring, and who to ring if they can\'t be reached.',
    fields: [
      { name: 'name', label: 'Contact name', type: 'text', want: true },
      { name: 'relationship', label: 'Relationship', type: 'text', want: true, placeholder: 'Wife' },
      { name: 'phone', label: 'Phone', type: 'tel', want: true },
      { name: 'address', label: 'Address', type: 'text' },
      { name: 'alt_name', label: 'Second contact', type: 'text' },
      { name: 'alt_phone', label: 'Second contact phone', type: 'tel' },
      { name: 'medical', label: 'Anything medical we should know', type: 'textarea' }
    ]
  },

  {
    key: 'inductions',
    label: 'Inductions',
    icon: 'badge',
    blurb: 'Site and client inductions, with the certificates.',
    rows: {
      one: 'induction', many: 'inductions', add: 'Add an induction',
      title: r => r.induction || 'Induction',
      fields: [
        { name: 'induction', label: 'Induction', type: 'text', want: true, placeholder: 'Fulton Hogan site induction' },
        { name: 'client', label: 'Client or site', type: 'text' },
        { name: 'completed_on', label: 'Completed', type: 'date', want: true },
        { name: 'expires_on', label: 'Expires', type: 'date' },
        { name: 'reference', label: 'Reference number', type: 'text', plain: true }
      ],
      file: { label: 'Certificate', accept: '.pdf,image/*' },
      expiry: 'expires_on', warn: 60
    }
  },

  /* ---- the two that belong to the firm, not to each of its workers ---- */
  {
    key: 'agreement',
    label: 'Subcontractor agreement',
    icon: 'handshake',
    only: ['labour_hire', 'subcontractor'],
    owner: 'company',
    blurb: 'The agreement RCK holds with the company, and their insurance.',
    fields: [
      { name: 'signed_on', label: 'Agreement signed', type: 'date', want: true },
      { name: 'expires_on', label: 'Agreement runs to', type: 'date' },
      { name: 'scope', label: 'What it covers', type: 'textarea', placeholder: 'Supply of traffic management crew' },
      { name: 'liability_expires', label: 'Public liability cover expires', type: 'date', want: true },
      { name: 'liability_amount', label: 'Public liability cover', type: 'money' },
      { name: 'h_and_s', label: 'Health & safety prequalification', type: 'text', placeholder: 'SiteWise Green' }
    ],
    files: [
      { slot: 'agreement', label: 'Signed agreement', want: true, accept: '.pdf,image/*' },
      { slot: 'insurance', label: 'Certificate of insurance', want: true, accept: '.pdf,image/*' }
    ],
    expiries: [
      { field: 'expires_on', label: 'Agreement', warn: 60 },
      { field: 'liability_expires', label: 'Liability cover', warn: 45 }
    ]
  },

  {
    key: 'account',
    label: 'Account information',
    icon: 'bank',
    only: ['labour_hire', 'subcontractor'],
    owner: 'company',
    blurb: 'Who to invoice, who to pay, and on what terms.',
    fields: [
      { name: 'trading_name', label: 'Trading name', type: 'text', want: true },
      { name: 'nzbn', label: 'NZBN', type: 'text', plain: true },
      { name: 'gst_number', label: 'GST number', type: 'text', want: true, plain: true },
      { name: 'contact_name', label: 'Account contact', type: 'text', want: true },
      { name: 'contact_phone', label: 'Phone', type: 'tel', want: true },
      { name: 'contact_email', label: 'Email', type: 'email', want: true, plain: true },
      { name: 'bank_account', label: 'Bank account', type: 'text', want: true, plain: true, sensitive: true, placeholder: '00-0000-0000000-00' },
      { name: 'terms', label: 'Payment terms', type: 'text', placeholder: '20th of the month following' },
      { name: 'charge_rates', label: 'Charge rates', type: 'textarea', sensitive: true },
      { name: 'address', label: 'Postal address', type: 'textarea' }
    ],
    files: [{ slot: 'gst', label: 'GST registration or supplier form', accept: '.pdf,image/*' }]
  }
];

const sectionByKey = key => SECTIONS.find(s => s.key === key);

/** The tiles that apply to one worker type, in order. */
function sectionsFor(workerType) {
  return SECTIONS.filter(s => !s.only || s.only.indexOf(workerType) >= 0);
}

/** What a tile is called for this person — "RCK contract" is wrong for a subbie. */
function sectionLabel(section, workerType) {
  return (section.labelFor && section.labelFor[workerType]) || section.label;
}

/* =====================================================================
   Small tools
   ===================================================================== */
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).length === 10 ? v + 'T00:00:00' : v);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  let h = d.getHours();
  const ap = h < 12 ? 'am' : 'pm';
  h = h % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${String(d.getMinutes()).padStart(2, '0')}${ap}`;
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
const PLURALS = { person: 'people' };

/**
 * "1 breach" / "2 breaches", and "1 company" / "2 companies".
 *
 * Naive +s gets both of those wrong, and wrong English on a staff record
 * reads as carelessness about the record itself.
 */
function plural(n, word) {
  if (n === 1) return `${n} ${word}`;
  if (PLURALS[word]) return `${n} ${PLURALS[word]}`;
  if (/(ch|sh|ss|s|x|z)$/.test(word)) return `${n} ${word}es`;
  if (/[^aeiou]y$/.test(word))        return `${n} ${word.slice(0, -1)}ies`;
  return `${n} ${word}s`;
}
function fmtSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return n + ' bytes';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
function fmtMoney(v, unit) {
  const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n) || !String(v || '').trim()) return '—';
  const s = '$' + n.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return unit ? `${s} ${PAY_SUFFIX[unit] || ''}`.trim() : s;
}

/** Years and months of service, e.g. "3 yrs 2 mths". */
function serviceText(startDate, endDate) {
  if (!startDate) return '—';
  const a = new Date(String(startDate).slice(0, 10) + 'T00:00:00');
  const b = endDate ? new Date(String(endDate).slice(0, 10) + 'T00:00:00') : new Date();
  if (isNaN(a) || isNaN(b) || b < a) return '—';
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12), m = months % 12;
  if (!y) return plural(m, 'mth');
  return m ? `${y} yr${y === 1 ? '' : 's'} ${m} mth${m === 1 ? '' : 's'}` : `${y} yr${y === 1 ? '' : 's'}`;
}

/** Age in whole years, or null where no birthdate is recorded. */
function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(String(dob).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return null;
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
  return y >= 0 && y < 120 ? y : null;
}

function fullName(p) {
  const n = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return n || p.preferred_name || 'Unnamed';
}
function initials(p) {
  const a = (p.first_name || '').trim()[0] || '';
  const b = (p.last_name || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}
const labelOf = (list, key) => (list.find(x => x.key === key) || {}).label || key || '—';

function crewLabel(key) {
  if (!key) return '';
  const c = CREWS.find(x => x.key === key);
  return c ? c.label : key;
}
/** The crew dropdown, keeping anything already on a record that isn't in CREWS. */
function crewOptions(current) {
  const opts = [{ key: '', label: '— none —' }].concat(CREWS);
  const known = new Set(opts.map(o => o.key));
  const extras = new Set(DB.staff.map(p => p.crew).concat([current]).filter(c => c && !known.has(c)));
  return opts.concat(Array.from(extras).sort().map(c => ({ key: c, label: c })));
}

/* Inline icons — no icon font, no network request. */
const ICONS = {
  people:    '<circle cx="9.5" cy="8" r="3.5"/><path d="M3.5 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 6"/><path d="M18 14.9c2 .7 3.4 2.4 3.4 4.6"/>',
  contract:  '<path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z"/><path d="M14 3.5V8h4"/><path d="M9 13h6M9 16.5h4"/>',
  drug:      '<rect x="3.6" y="9.4" width="16.8" height="5.2" rx="2.6" transform="rotate(-45 12 12)"/><path d="M9.5 8.2l6.3 6.3"/>',
  licence:   '<rect x="2.8" y="5.5" width="18.4" height="13" rx="2.4"/><circle cx="8.4" cy="11" r="2"/><path d="M5.4 16c0-1.7 1.3-2.8 3-2.8s3 1.1 3 2.8"/><path d="M14.5 10h4M14.5 13.4h4"/>',
  camera:    '<path d="M3.5 8.6h3.1l1.5-2.2h7.8l1.5 2.2h3.1a1.5 1.5 0 0 1 1.5 1.5v7.7a1.5 1.5 0 0 1-1.5 1.5H3.5A1.5 1.5 0 0 1 2 18.3v-7.7a1.5 1.5 0 0 1 1.5-1.5z"/><circle cx="12" cy="13.6" r="3.3"/>',
  gear:      '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2L5.4 5.4"/>',
  shield:    '<path d="M12 2.8l7.4 2.9v5.6c0 4.5-3.1 8.2-7.4 9.9-4.3-1.7-7.4-5.4-7.4-9.9V5.7z"/><path d="M8.9 12.1l2.1 2.1 4.1-4.4"/>',
  rules:     '<path d="M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M8.4 8h7.2M8.4 11.6h7.2M8.4 15.2h4.4"/>',
  truck:     '<path d="M2.6 6.6h10.2v9.8H2.6z"/><path d="M12.8 9.8h3.9l2.7 3v3.6h-6.6z"/><circle cx="7" cy="18" r="1.9"/><circle cx="17" cy="18" r="1.9"/>',
  phone:     '<path d="M7.4 3.5H5.2A2.2 2.2 0 0 0 3 5.9C3 13.7 10.3 21 18.1 21a2.2 2.2 0 0 0 2.4-2.2v-2.2l-4.2-1.6-2 2a13.7 13.7 0 0 1-5.3-5.3l2-2z"/>',
  badge:     '<circle cx="12" cy="9.4" r="4.6"/><path d="M8.4 13.4L7.2 21l4.8-2.6 4.8 2.6-1.2-7.6"/>',
  handshake: '<path d="M8.6 12.4l2.6-2.6a1.9 1.9 0 0 1 2.7 0l3.3 3.3"/><path d="M2.8 8.9l3.4-3.4 4 1.6 3.4-1.6 3.6 1.4 4 .6"/><path d="M2.8 8.9v5.2l4.5 4.5a1.7 1.7 0 0 0 2.4 0l.8-.8"/><path d="M10.5 17.8l1.6 1.6a1.7 1.7 0 0 0 2.4 0"/>',
  bank:      '<path d="M3.4 9.6L12 4.4l8.6 5.2"/><path d="M5.4 9.6v8M9.8 9.6v8M14.2 9.6v8M18.6 9.6v8"/><path d="M3 20.4h18"/>',
  building:  '<path d="M4.5 20.5V5.2A1.7 1.7 0 0 1 6.2 3.5h7.6a1.7 1.7 0 0 1 1.7 1.7v15.3"/><path d="M15.5 10.5h2.9a1.6 1.6 0 0 1 1.6 1.6v8.4"/><path d="M8 7.4h3.9M8 11h3.9M8 14.6h3.9"/><path d="M2.8 20.5h18.4"/>',
  flag:      '<path d="M5.5 21V4.2"/><path d="M5.5 4.6h11.9l-2.2 4 2.2 4H5.5"/>',
  calendar:  '<rect x="3.4" y="5.4" width="17.2" height="15.2" rx="2.4"/><path d="M3.4 10.2h17.2"/><path d="M8.2 3.4v4M15.8 3.4v4"/><path d="M7.6 14h3M13.4 14h3"/>',
  print:     '<path d="M7 9V3.5h10V9"/><path d="M4 9h16v7h-3"/><path d="M7 16v4.5h10V16"/>',
  plus:      '<path d="M12 5.5v13M5.5 12h13"/>',
  up:        '<path d="M12 19.5V6.5"/><path d="M7 11.5L12 6.5l5 5"/><path d="M5 20.5h14"/>',
  down:      '<path d="M12 4.5v13"/><path d="M7 12.5l5 5 5-5"/><path d="M5 20.5h14"/>',
  file:      '<path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z"/><path d="M14 3.5V8h4"/>',
  trash:     '<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="M6.5 6.5l.9 12.2a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.2"/>',
  lock:      '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
  check:     '<path d="M4.5 12.5l4.6 4.6L19.5 6.8"/>',
  chev:      '<path d="M9 5l7 7-7 7"/>',
  spin:      '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/>',
  eye:       '<path d="M2.5 12s3.6-6.2 9.5-6.2S21.5 12 21.5 12s-3.6 6.2-9.5 6.2S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.7"/>'
};
function icon(name, cls) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICONS[name] || ''}</svg>`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}

/* =====================================================================
   This device

   No accounts, no passwords, exactly like RCK Workshop and RCK Dispatch.
   Everything that makes this phone different from the next one lives
   here: who is using it, whether it is in director mode, and the two
   connection details.

   The key is the secret. config.js is left blank on purpose, because the
   published page is public — each phone is given the key once, by a setup
   link, and it is kept here and nowhere else.
   ===================================================================== */
const S = {
  name: '', role: 'supervisor', supabaseUrl: '', supabaseKey: '',

  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('rckp.settings') || '{}'); } catch (e) {}
    S.name = saved.name || '';
    S.role = saved.role === 'director' ? 'director' : 'supervisor';
    // config.js wins where it is filled in, so a site that does commit the
    // key doesn't have to be set up phone by phone.
    S.supabaseUrl = (SITE.supabaseUrl || saved.supabaseUrl || '').replace(/\/+$/, '');
    S.supabaseKey = SITE.supabaseKey || saved.supabaseKey || '';
  },

  save(next) {
    Object.assign(S, next || {});
    localStorage.setItem('rckp.settings', JSON.stringify({
      name: S.name, role: S.role,
      supabaseUrl: S.supabaseUrl, supabaseKey: S.supabaseKey
    }));
  },

  forget() {
    localStorage.removeItem('rckp.settings');
    S.load();
  }
};
S.load();

const configured = () => !!S.supabaseUrl && !!S.supabaseKey;

/**
 * Two modes a phone can be in.
 *
 *   supervisor  the default. Sees every person, every tile, every date —
 *               everything needed to know whether someone can go to a
 *               site — but no pay, and cannot change anything.
 *   director    the director and the HR manager. Everything, and edits.
 *
 * Be honest about what this is. It is the same kind of switch as the
 * office code in RCK Dispatch: it keeps the screen simple and stops a
 * site phone changing a record by accident. It is NOT secrecy. The code
 * that unlocks it sits in config.js, and anyone holding the key can read
 * the pay out of the database whatever this app shows them. The thing
 * actually keeping staff details in is the key, which is why it is never
 * published and only ever handed over in a setup link.
 */
const myRole    = () => S.role;
const isDirector = () => S.role === 'director';
const canEdit   = () => isDirector();
const canSeePay = () => isDirector();

/**
 * The one thing a supervisor can put into the app.
 *
 * Reporting a breach is the whole point of handing supervisors the app —
 * they are the ones on site who see it. They can raise one and attach
 * photos to it, and that is all: only the office adds comments to a
 * breach or closes it out.
 */
const canRaiseBreach = () => true;
const canWorkBreach  = () => isDirector();
const ROLE_LABEL = { director: 'Director', supervisor: 'Supervisor' };
const ROLES = [
  { key: 'supervisor', label: 'Supervisor', blurb: 'see everything except pay' },
  { key: 'director',   label: 'Director / HR', blurb: 'everything, and can edit' }
];

/**
 * Ask for the director code, where one is set. Returns true to go ahead.
 * A speed bump against accidents, and it is described as one on screen.
 */
function passesDirectorCheck(role) {
  if (role !== 'director' || isDirector()) return true;
  if (!SITE.directorPin) return true;
  const given = prompt('Director code:');
  if (given === null) return false;
  if (given !== String(SITE.directorPin)) { toast('Wrong code'); return false; }
  return true;
}

/** The link that sets up somebody else's phone, key and all. */
function setupLink() {
  return location.origin + location.pathname +
    '#/join?u=' + encodeURIComponent(S.supabaseUrl) +
    '&k=' + encodeURIComponent(S.supabaseKey);
}

/* =====================================================================
   Data, held in memory only
   ===================================================================== */
const DB = { staff: [], companies: [], sections: [], files: [],
             leave: [], breaches: [], audit: [] };
let loaded = false;
let locked = false;
let lastError = '';

/** Throw away every scrap of staff data held in memory. */
function forgetData() {
  DB.staff = []; DB.companies = []; DB.sections = [];
  DB.files = []; DB.leave = []; DB.breaches = []; DB.audit = [];
  Faces.forget();
  loaded = false;
}

async function rest(path, opts) {
  const o = opts || {};
  const headers = Object.assign(
    { apikey: S.supabaseKey, Authorization: 'Bearer ' + S.supabaseKey }, o.headers || {});
  const res = await fetch(`${S.supabaseUrl}/rest/v1/${path}`, Object.assign({}, o, { headers }));
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) {}
    throw new Error(`${res.status} ${detail || res.statusText}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const Store = {
  async pull() {
    const [staff, companies, sections, files, leave, breaches] = await Promise.all([
      rest('staff?select=*&order=last_name.asc,first_name.asc'),
      rest('companies?select=*&order=name.asc'),
      rest('profile_sections?select=*'),
      rest('profile_files?select=*&order=created_at.desc'),
      rest('staff_leave?select=*&order=starts_on.asc'),
      rest('staff_breaches?select=*&order=raised_at.desc')
    ]);
    DB.staff = staff || [];
    DB.companies = companies || [];
    DB.sections = sections || [];
    DB.files = files || [];
    DB.leave = leave || [];
    DB.breaches = breaches || [];
    loaded = true;
  },

  async pullAudit(staffId) {
    const q = staffId ? `&staff_id=eq.${encodeURIComponent(staffId)}` : '';
    DB.audit = await rest(`staff_audit?select=*&order=at.desc&limit=200${q}`) || [];
    return DB.audit;
  },

  async insert(table, row) {
    if (!row.id) row.id = uid();
    const out = await rest(table, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(row)
    });
    const saved = (Array.isArray(out) ? out[0] : out) || row;
    const list = DB[localName(table)];
    if (list) list.push(saved);
    return saved;
  },

  async patch(table, id, patch) {
    const out = await rest(`${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
    const saved = Array.isArray(out) ? out[0] : out;
    const list = DB[localName(table)];
    if (list && saved) {
      const i = list.findIndex(r => r.id === id);
      if (i >= 0) list[i] = saved;
    }
    return saved;
  },

  async remove(table, id) {
    await rest(`${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' }
    });
    const list = DB[localName(table)];
    if (list) {
      const i = list.findIndex(r => r.id === id);
      if (i >= 0) list.splice(i, 1);
    }
  },

  /**
   * Save one compliance tile. There is at most one row per owner per
   * tile, so this inserts the first time and patches after that.
   */
  async saveSection(owner, sectionKey, patch) {
    const existing = sectionRow(owner, sectionKey);
    const body = Object.assign({ updated_by: whoAmI() }, patch);
    if (existing) return Store.patch('profile_sections', existing.id, body);
    return Store.insert('profile_sections', Object.assign({
      staff_id:   owner.kind === 'staff' ? owner.id : null,
      company_id: owner.kind === 'company' ? owner.id : null,
      section_key: sectionKey,
      na: false, na_reason: '', data: {}
    }, body));
  },

  /* ---------------------------------------------------- documents --- */

  /**
   * Puts a file in the private bucket and returns its storage path.
   *
   * The tile goes in the path — `staff/<id>/contract/…` — because the
   * storage rules read the third folder to decide who may open it. The
   * pay is written inside a signed contract, so hiding the wage field
   * from a supervisor while leaving them the PDF would prove nothing.
   */
  async upload(owner, sectionKey, file) {
    const clean = (file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-90);
    const tile = String(sectionKey || 'other').replace(/[^\w\-]+/g, '');
    const path = `${owner.kind}/${owner.id}/${tile}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${clean}`;
    const res = await fetch(`${S.supabaseUrl}/storage/v1/object/staff-files/${encodePath(path)}`, {
      method: 'POST',
      headers: {
        apikey: S.supabaseKey,
        Authorization: 'Bearer ' + S.supabaseKey,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: file
    });
    if (!res.ok) throw new Error(await res.text() || 'Upload failed');
    return path;
  },

  /** A link that works for a few minutes and then stops working. */
  async signedUrl(storagePath, seconds) {
    const res = await fetch(`${S.supabaseUrl}/storage/v1/object/sign/staff-files/${encodePath(storagePath)}`, {
      method: 'POST',
      headers: { apikey: S.supabaseKey, Authorization: 'Bearer ' + S.supabaseKey,
                 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: seconds || 300 })
    });
    if (!res.ok) throw new Error('Could not open that document');
    const d = await res.json();
    return S.supabaseUrl + '/storage/v1' + d.signedURL;
  },

  /**
   * Fetches a document into memory and hands back a blob: URL, so it can
   * be shown inside the app instead of sending the user off to another
   * tab. The URL is local to this device and dies with the page.
   */
  async blobUrl(storagePath) {
    const signed = await Store.signedUrl(storagePath, 120);
    const res = await fetch(signed);
    if (!res.ok) throw new Error('Could not fetch that document');
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), type: blob.type, size: blob.size };
  },

  async removeFile(storagePath) {
    await fetch(`${S.supabaseUrl}/storage/v1/object/staff-files/${encodePath(storagePath)}`, {
      method: 'DELETE',
      headers: { apikey: S.supabaseKey, Authorization: 'Bearer ' + S.supabaseKey }
    });
  }
};

const encodePath = p => p.split('/').map(encodeURIComponent).join('/');

function localName(table) {
  return { profile_sections: 'sections', profile_files: 'files',
           staff_leave: 'leave', staff_breaches: 'breaches',
           staff_audit: 'audit' }[table] || table;
}
const whoAmI = () => S.name || ROLE_LABEL[S.role] || 'Someone';

/** Records who changed what. Never blocks the change itself. */
function note(owner, entity, action, summary) {
  rest('staff_audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: uid(),
      actor: whoAmI(),
      actor_email: '',
      staff_id:   owner && owner.kind === 'staff' ? owner.id : null,
      company_id: owner && owner.kind === 'company' ? owner.id : null,
      entity: entity || '', action: action || '', summary: summary || ''
    })
  }).catch(() => {});
}

/* =====================================================================
   Head shots

   Kept in memory for the session so the staff list doesn't re-download
   forty photos every time it is opened, and dropped the moment the
   screen locks. Nothing about them touches disk.
   ===================================================================== */
const Faces = {
  cache: new Map(),      // staff id -> blob URL, or null once known to be missing
  pending: new Set(),

  urlFor(staffId) {
    const hit = Faces.cache.get(staffId);
    return hit || null;
  },

  /** Fetch a head shot in the background and repaint the one tile. */
  load(staffId, onReady) {
    if (Faces.cache.has(staffId) || Faces.pending.has(staffId)) return;
    const file = filesFor({ kind: 'staff', id: staffId }, 'photo')[0];
    if (!file) { Faces.cache.set(staffId, null); return; }
    Faces.pending.add(staffId);
    Store.blobUrl(file.path)
      .then(b => { Faces.cache.set(staffId, b.url); if (onReady) onReady(b.url); })
      .catch(() => { Faces.cache.set(staffId, null); })
      .then(() => Faces.pending.delete(staffId));
  },

  forget() {
    Faces.cache.forEach(url => { if (url) URL.revokeObjectURL(url); });
    Faces.cache.clear();
    Faces.pending.clear();
  },
  drop(staffId) {
    const url = Faces.cache.get(staffId);
    if (url) URL.revokeObjectURL(url);
    Faces.cache.delete(staffId);
  }
};

/* =====================================================================
   The compliance engine

   Everything colour-coded in this app is worked out here, and nowhere
   else. Nothing is ever set green or red by hand.

   How a tile is judged:
     · marked "does not apply"  → it drops out entirely. Not counted for
       or against. This is the point of the switch.
     · something still to fill in → red
     · everything in, but a date has passed → red
     · everything in, but a date is close → amber
     · everything in and current → green

   How the percentage on someone's tile is worked out:
     the tiles that are green or amber, over the tiles that apply to them.
   A tile that is amber is still on file, so it counts as done — it is
   the colour that says it needs attention, not the number.
   ===================================================================== */
const staffById   = id => DB.staff.find(p => p.id === id);
const companyById = id => DB.companies.find(c => c.id === id);

const staffOwner   = id => ({ kind: 'staff', id });
const companyOwner = id => ({ kind: 'company', id });

/** The record a tile is stored against — usually the person, sometimes their firm. */
function ownerFor(person, section) {
  if (section.owner === 'company') {
    return person.company_id ? companyOwner(person.company_id) : null;
  }
  return staffOwner(person.id);
}

function sectionRow(owner, sectionKey) {
  if (!owner) return null;
  const col = owner.kind === 'staff' ? 'staff_id' : 'company_id';
  return DB.sections.find(r => r[col] === owner.id && r.section_key === sectionKey) || null;
}
function sectionData(owner, sectionKey) {
  const row = sectionRow(owner, sectionKey);
  return (row && row.data) || {};
}
/** Files for one owner. Narrows to a tile, then to one upload box, as given. */
function filesFor(owner, sectionKey, slot) {
  if (!owner) return [];
  const col = owner.kind === 'staff' ? 'staff_id' : 'company_id';
  return DB.files.filter(f =>
    f[col] === owner.id &&
    (sectionKey === undefined || f.section_key === sectionKey) &&
    (slot === undefined || (f.slot || '') === slot));
}

const hasValue = v => Array.isArray(v) ? v.length > 0 : String(v == null ? '' : v).trim() !== '';
const warnDaysOf = n => Number.isFinite(Number(n)) && Number(n) > 0
  ? Number(n) : (Number(SITE.defaultWarnDays) || 60);

const RANK = { red: 3, orange: 2, green: 1, grey: 0 };
const worse = (a, b) => (RANK[b.level] > RANK[a.level] ? b : a);

/** How one date reads: expired, close, or fine. Null where there is no date. */
function dateState(dateStr, label, warn) {
  if (!hasValue(dateStr)) return null;
  const days = daysFromToday(dateStr);
  if (days === null) return { level: 'orange', text: `${label} date can't be read` };
  if (days < 0)   return { level: 'red',    text: `${label} expired ${plural(-days, 'day')} ago` };
  if (days === 0) return { level: 'orange', text: `${label} expires today` };
  if (days <= warnDaysOf(warn)) {
    return { level: 'orange', text: days === 1 ? `${label} expires tomorrow` : `${label} expires in ${plural(days, 'day')}` };
  }
  return { level: 'green', text: `${label} good to ${fmtDate(dateStr)}` };
}

/**
 * How one tile stands for one person (or company).
 *
 * counts:false means it is out of the sum — either marked as not
 * applying, or belonging to a company for a person who has none.
 */
function sectionState(section, owner) {
  const row  = owner ? sectionRow(owner, section.key) : null;
  const data = (row && row.data) || {};

  if (row && row.na) {
    return { level: 'grey', counts: false, na: true, missing: [], filled: 0, total: 0,
             text: 'Does not apply', why: row.na_reason || '' };
  }
  /* A labour hire worker with no firm against their name is missing this
     tile altogether, so it counts against them. Showing them as fully
     compliant because we don't know whose agreement to check would be
     the wrong answer. */
  if (!owner) {
    return { level: 'red', counts: true, na: false, missing: ['A company'], filled: 0, total: 1,
             text: 'No company linked yet', noOwner: true };
  }

  /* What "filled in" means for this tile. */
  const missing = [];
  let total = 0, filled = 0;

  (section.fields || []).filter(f => f.want).forEach(f => {
    total++;
    if (hasValue(data[f.name])) filled++; else missing.push(f.label);
  });

  (section.files || []).filter(f => f.want).forEach(f => {
    total++;
    if (filesFor(owner, section.key, f.slot).length) filled++; else missing.push(f.label);
  });

  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (section.rows) {
    total++;
    if (!rows.length) {
      missing.push(`At least one ${section.rows.one}`);
    } else {
      const short = rows.filter(r =>
        section.rows.fields.filter(f => f.want).some(f => !hasValue(r[f.name])));
      if (short.length) missing.push(`${plural(short.length, section.rows.one)} part-filled`);
      else filled++;
    }
  }

  if (missing.length) {
    const nothingYet = filled === 0;
    return {
      level: 'red', counts: true, na: false, missing, filled, total,
      text: nothingYet ? 'Nothing on file yet'
          : missing.length === 1 ? `${missing[0]} still needed`
          : `${missing.length} still to add`
    };
  }

  /* Everything is in. Now: is any of it out of date? */
  let state = { level: 'green', counts: true, na: false, missing: [], filled, total, text: 'Complete' };

  (section.expiries || []).forEach(e => {
    const d = dateState(data[e.field], e.label, e.warn);
    if (d) state = worse(state, Object.assign({}, state, d));
  });

  if (section.rows) {
    rows.forEach(r => {
      const d = dateState(r[section.rows.expiry], section.rows.title(r), section.rows.warn);
      if (d) state = worse(state, Object.assign({}, state, d));
    });
  }

  if (section.verdict) {
    const v = section.verdict(data);
    if (v) state = worse(state, Object.assign({}, state, v));
  }

  return state;
}

/** Every tile for one person, with how each stands. */
function tilesFor(person) {
  return sectionsFor(person.worker_type || 'rck').map(section => ({
    section,
    owner: ownerFor(person, section),
    state: sectionState(section, ownerFor(person, section))
  }));
}

/**
 * One person's overall standing, and the percentage on their tile.
 */
function compliance(person) {
  if (person.status === 'finished') {
    return { pct: 0, level: 'grey', done: 0, total: 0, text: 'Finished', problems: [], skipped: 0 };
  }

  const tiles = tilesFor(person);
  const counted = tiles.filter(t => t.state.counts);
  const done = counted.filter(t => t.state.level === 'green' || t.state.level === 'orange').length;
  const bad  = counted.filter(t => t.state.level === 'red');
  const warn = counted.filter(t => t.state.level === 'orange');
  const pct  = counted.length ? Math.round(done / counted.length * 100) : 100;

  let level = 'green', text = 'Fully compliant';
  if (bad.length) {
    level = 'red';
    text = bad.length === 1
      ? sectionLabel(bad[0].section, person.worker_type) + ' — ' + bad[0].state.text.toLowerCase()
      : `${bad.length} tiles need attention`;
  } else if (warn.length) {
    level = 'orange';
    text = warn.length === 1 ? warn[0].state.text : `${warn.length} expiring soon`;
  } else if (!counted.length) {
    text = 'Nothing required';
  }

  return {
    pct, level, done, total: counted.length, text,
    skipped: tiles.length - counted.length,
    problems: bad.concat(warn)
  };
}

const onBooks = () => DB.staff.filter(p => p.status !== 'finished');

/** The three headline counts on the landing page. */
function tallies(list) {
  const t = { green: 0, orange: 0, red: 0 };
  (list || onBooks()).forEach(p => { t[compliance(p).level]++; });
  return t;
}

/** Everyone who works for one company. */
const staffOfCompany = id => DB.staff.filter(p => p.company_id === id);

/** How a company itself stands — its agreement and account tiles. */
function companyState(company) {
  const owner = companyOwner(company.id);
  const secs = SECTIONS.filter(s => s.owner === 'company');
  let state = { level: 'green', text: 'Agreement and account complete' };
  const problems = [];
  secs.forEach(s => {
    const st = sectionState(s, owner);
    if (!st.counts) return;
    if (st.level !== 'green') problems.push({ section: s, state: st });
    if (RANK[st.level] > RANK[state.level]) state = { level: st.level, text: `${s.label} — ${st.text.toLowerCase()}` };
  });
  return Object.assign(state, { problems });
}

/* =====================================================================
   Annual leave

   Everything here is already approved — this is the register of what is
   booked. Nothing has a status to set by hand: where a booking sits is
   worked out from its dates every time the screen is drawn, so it moves
   from "coming up" to "away now" to "taken" on its own as time passes.
   ===================================================================== */

/** Working days between two dates, counting Monday to Friday inclusive. */
function workingDays(from, to) {
  if (!from || !to) return 0;
  const a = new Date(String(from).slice(0, 10) + 'T00:00:00');
  const b = new Date(String(to).slice(0, 10) + 'T00:00:00');
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

/** Where one booking sits relative to today. */
function leaveState(row) {
  const from = daysFromToday(row.starts_on);
  const to   = daysFromToday(row.ends_on);
  if (from === null || to === null) return { when: 'upcoming', level: 'grey', text: 'Dates unreadable' };

  if (to < 0) {
    return { when: 'past', level: 'grey', text: 'Taken' };
  }
  if (from <= 0) {
    return { when: 'now', level: 'orange',
             text: to === 0 ? 'Back tomorrow' : `Away — back in ${plural(to + 1, 'day')}` };
  }
  return {
    when: 'upcoming',
    level: from <= 14 ? 'orange' : 'green',
    text: from === 1 ? 'Starts tomorrow' : `Starts in ${plural(from, 'day')}`
  };
}

const leaveFor = staffId => DB.leave
  .filter(l => l.staff_id === staffId)
  .sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on)));

/** Every booking, newest-first within its group, with its person attached. */
function leaveRows(filter) {
  const crew = (filter && filter.crew) || '';
  return DB.leave
    .map(l => ({ row: l, person: staffById(l.staff_id), state: leaveState(l) }))
    .filter(x => x.person)
    .filter(x => !crew || (x.person.crew || '') === crew)
    .sort((a, b) => String(a.row.starts_on).localeCompare(String(b.row.starts_on)));
}

/**
 * Anyone else off over the same dates. The point of the leave screen for
 * a crew is not "who booked what" but "can I let this one go too", so
 * this is what the add form warns on.
 */
function overlapping(startsOn, endsOn, ignoreId) {
  if (!startsOn || !endsOn) return [];
  return DB.leave
    .filter(l => l.id !== ignoreId)
    .filter(l => String(l.starts_on) <= String(endsOn) && String(l.ends_on) >= String(startsOn))
    .map(l => ({ row: l, person: staffById(l.staff_id) }))
    .filter(x => x.person && x.person.status !== 'finished');
}

/** The leave year, April to March, matching the financial year used elsewhere. */
function leaveYearOf(dateStr) {
  const d = new Date(String(dateStr || today()).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return null;
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}
const leaveYearLabel = y => `${y}/${String(y + 1).slice(2)}`;

/** Days booked by one person in a leave year — annual leave only. */
function daysTaken(staffId, year, kind) {
  return DB.leave
    .filter(l => l.staff_id === staffId)
    .filter(l => (kind ? l.kind === kind : true))
    .filter(l => leaveYearOf(l.starts_on) === year)
    .reduce((n, l) => n + (Number(l.days) || 0), 0);
}

/* =====================================================================
   Disciplinaries and breaches

   Anyone with the app can raise one — the supervisor on site is usually
   the one who saw it. From there it is the office's: they add comments,
   record what was done, and mark it complete.

   While a breach is OPEN it shades that person's tile. One is yellow,
   two orange, three or more red. Completing it takes the shading off and
   moves the record to the completed list; nothing is ever deleted,
   because these are employment records.
   ===================================================================== */

/** Newest first. */
const breachesFor = staffId => DB.breaches
  .filter(x => x.staff_id === staffId)
  .sort((a, b) => String(b.raised_at).localeCompare(String(a.raised_at)));

const isOpenBreach = x => (x.status || 'open') !== 'complete';
const openBreaches = () => DB.breaches.filter(isOpenBreach);
const openBreachesFor = staffId => breachesFor(staffId).filter(isOpenBreach);

/**
 * How a person's tile is shaded: nothing, then yellow, orange, red as
 * open breaches stack up. Deliberately separate from their compliance
 * colour — one says "paperwork missing", the other says "conduct", and
 * running them together would lose both.
 */
const BREACH_FLAGS = [
  null,
  { key: 'flag-1', tone: 'yellow', label: 'One open breach' },
  { key: 'flag-2', tone: 'orange', label: 'Two open breaches' },
  { key: 'flag-3', tone: 'red',    label: 'Three or more open breaches' }
];

function breachFlag(staffId) {
  const n = openBreachesFor(staffId).length;
  if (!n) return null;
  return Object.assign({ count: n }, BREACH_FLAGS[Math.min(n, 3)]);
}

/** Photos attached to one breach. */
const breachPhotos = breach =>
  filesFor(staffOwner(breach.staff_id), 'breach', breach.id);

/** Everyone carrying at least one open breach, worst first. */
function flaggedPeople() {
  const seen = new Map();
  openBreaches().forEach(x => {
    if (!seen.has(x.staff_id)) seen.set(x.staff_id, staffById(x.staff_id));
  });
  return Array.from(seen.values())
    .filter(Boolean)
    .map(p => ({ person: p, flag: breachFlag(p.id) }))
    .sort((a, b) => b.flag.count - a.flag.count ||
                    fullName(a.person).localeCompare(fullName(b.person)));
}

function breachWhen(x) {
  const d = daysFromToday(String(x.raised_at).slice(0, 10));
  if (d === null) return fmtDateTime(x.raised_at);
  if (d === 0) return 'Today, ' + fmtDateTime(x.raised_at).split(', ')[1];
  if (d === -1) return 'Yesterday';
  return fmtDate(x.raised_at);
}

/* =====================================================================
   Routing
   ===================================================================== */
function parseHash() {
  let raw = (location.hash || '#/').replace(/^#/, '');

  // A setup link carries its details as `#/join?u=…&k=…`. Cut the query off
  // before splitting, or the whole lot arrives as one path segment and the
  // route never matches. joinDetails() reads those values separately.
  const q = raw.indexOf('?');
  if (q >= 0) raw = raw.slice(0, q);

  const parts = raw.split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch (e) { return part; }
  });
  return { path: parts[0] || '', args: parts.slice(1) };
}
function go(hash) { location.hash = hash; }

const SCREENS = {
  '':          { title: 'RCK People',   render: renderHome },
  'staff':     { title: 'Staff information', render: renderStaff, back: '#/' },
  'person':    { title: 'Staff file',   render: renderPerson,  back: '#/staff' },
  'edit':      { title: 'Details',      render: renderPersonEdit, back: true },
  'tile':      { title: '',             render: renderStaffTile,  back: true },
  'leave':     { title: 'Annual leave', render: renderLeave, back: '#/' },
  'breaches':  { title: 'Disciplinaries & breaches', render: renderBreaches, back: '#/' },
  'breach':    { title: 'Breach', render: renderBreach, back: '#/breaches' },
  'companies': { title: 'Labour hire & subcontractors', render: renderCompanies, back: '#/' },
  'company':   { title: 'Company',      render: renderCompany, back: '#/companies' },
  'ctile':     { title: '',             render: renderCompanyTile, back: true },
  'settings':  { title: 'Settings',     render: renderSettings, back: '#/' }
};

const scrollMemory = {};
let currentPath = null;

function render() {
  const { path, args } = parseHash();
  const view = $('#view');

  if (currentPath !== null) scrollMemory[currentPath] = window.scrollY;

  // A setup link, which carries the connection details. Checked before
  // "am I connected", because this is how a phone gets connected.
  if (path === 'join') return renderJoin(view);

  if (!configured()) return renderNeedsConfig(view);
  if (locked)        return renderLocked(view);

  $('#topbar').hidden = false;

  const screen = SCREENS[path] || SCREENS[''];
  $('#title').textContent = screen.title || 'RCK People';

  const back = $('#backBtn');
  back.hidden = !screen.back;
  back.onclick = () => {
    if (screen.back === true) history.back();
    else go(screen.back);
  };

  view.className = '';
  void view.offsetWidth;
  view.classList.add('enter');

  if (!loaded) {
    view.innerHTML = `<div class="empty"><b>Loading</b>One moment.</div>`;
    boot();
    return;
  }

  screen.render(view, args);
  currentPath = path + '/' + args.join('/');
  const y = scrollMemory[currentPath];
  requestAnimationFrame(() => window.scrollTo(0, y || 0));
}

/* =====================================================================
   Before anyone is let in
   ===================================================================== */
function renderNeedsConfig(view) {
  $('#topbar').hidden = true;
  $('#menu').hidden = true;
  view.innerHTML = `
    <div class="gate"><div class="gate-card">
      <div class="gate-mark">${icon('lock')}</div>
      <h1>Not connected yet</h1>
      <p class="lede">The quickest way is to ask someone who already has RCK People for a
        <b>setup link</b> — one tap and this phone is done. Otherwise enter the details
        by hand.</p>

      <label class="field"><span>Project URL</span>
        <input type="text" id="cfgUrl" placeholder="https://abcdefgh.supabase.co" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>Anon public key</span>
        <input type="text" id="cfgKey" placeholder="eyJhbGciOi…" autocapitalize="off" spellcheck="false"></label>

      <label class="field"><span>Your name</span>
        <input type="text" id="cfgName" value="${esc(S.name)}" placeholder="e.g. Dave T"></label>
      <label class="field"><span>You are</span>
        <select id="cfgRole">
          ${ROLES.map(r => `<option value="${r.key}"${r.key === 'director' ? ' selected' : ''}>${
            esc(r.label)} — ${esc(r.blurb)}</option>`).join('')}
        </select></label>

      <button class="btn primary wide" id="cfgSave">Save and continue</button>
      <p class="foot">Use the <b>anon public</b> key from Supabase → Settings → API.
        Never the service_role key.</p>
    </div></div>`;

  /* Whoever is doing this has the Supabase details in front of them, so
     they are the one setting the app up — Director is the right default.
     Getting this wrong is what leaves somebody staring at a staff screen
     with no way to add anybody. */
  $('#cfgSave').onclick = () => {
    const url = $('#cfgUrl').value.trim(), key = $('#cfgKey').value.trim();
    const name = $('#cfgName').value.trim();
    const role = $('#cfgRole').value;
    if (!url || !key) return toast('Both the URL and the key are needed.');
    if (!name) return toast('Enter your name.');
    if (!passesDirectorCheck(role)) return;
    S.save({ supabaseUrl: url.replace(/\/+$/, ''), supabaseKey: key, name, role });
    loaded = false;
    render();
  };
}

/* =====================================================================
   Screen — one-tap setup from a link

   The connection details ride in the URL's hash, which browsers never
   send to the web server, so the key stays off the published site even
   while it is being passed around.
   ===================================================================== */
function joinDetails() {
  // The hash looks like  #/join?u=...&k=...
  const raw = (location.hash || '').replace(/^#/, '');
  const q = raw.indexOf('?');
  const out = {};
  if (q < 0) return out;
  raw.slice(q + 1).split('&').forEach(pair => {
    const i = pair.indexOf('=');
    if (i < 0) return;
    try { out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')); }
    catch (e) { /* a mangled link, handled below */ }
  });
  return out;
}

function renderJoin(view) {
  $('#topbar').hidden = true;
  $('#menu').hidden = true;

  const d = joinDetails();
  const url = (d.u || '').replace(/\/+$/, '');
  const key = d.k || '';

  if (!url || !key) {
    view.innerHTML = `
      <div class="gate"><div class="gate-card">
        <div class="gate-mark">${icon('lock')}</div>
        <h1>That link is incomplete</h1>
        <p class="lede">Ask whoever sent it to share it again from
          <b>Settings → Set up someone else's phone</b>, or enter the details by hand.</p>
        <button class="btn wide" id="byHand">Enter them by hand</button>
      </div></div>`;
    $('#byHand').onclick = () => { location.hash = '#/'; };
    return;
  }

  view.innerHTML = `
    <div class="gate"><div class="gate-card">
      <div class="gate-mark">${icon('people')}</div>
      <h1>Set up RCK People</h1>
      <p class="lede">This links your phone to the shared staff records. You only do it once.</p>

      <label class="field"><span>Your name</span>
        <input type="text" id="jName" value="${esc(S.name)}" placeholder="e.g. Dave T"></label>

      <label class="field"><span>You are</span>
        <select id="jRole">
          ${ROLES.map(r => `<option value="${r.key}">${esc(r.label)} — ${esc(r.blurb)}</option>`).join('')}
        </select></label>

      <button class="btn primary wide" id="jGo">Connect</button>
      <div id="jOut"></div>

      <p class="foot">Afterwards use <b>Add to Home Screen</b> in your browser's share menu,
        and it opens like a normal app.</p>
    </div></div>`;

  $('#jGo').onclick = async function () {
    const name = $('#jName').value.trim();
    const role = $('#jRole').value;
    if (!name) return toast('Enter your name');
    if (!passesDirectorCheck(role)) return;

    this.disabled = true;
    this.textContent = 'Connecting…';
    const out = $('#jOut');

    try {
      // Prove the details work before keeping them, so nobody is left with
      // a phone that looks set up and isn't.
      const res = await fetch(`${url}/rest/v1/staff?select=id&limit=1`, {
        headers: { apikey: key, Authorization: 'Bearer ' + key }
      });
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403
        ? 'Those details were not accepted. Ask for a fresh link.'
        : 'Could not reach the database (' + res.status + ').');

      S.save({ name, role, supabaseUrl: url, supabaseKey: key });
      loaded = false;
      locked = false;
      history.replaceState(null, '', location.pathname + location.search + '#/');
      render();
      toast('This phone is set up.');
    } catch (e) {
      this.disabled = false;
      this.textContent = 'Connect';
      out.innerHTML = `<div class="banner status-red" style="margin-top:12px">${
        esc(e.message || 'Could not connect. Check you have signal and try again.')}</div>`;
    }
  };
}

/* =====================================================================
   Idle lock — an open laptop should not leave staff files on screen
   ===================================================================== */
const Idle = {
  last: Date.now(),
  timer: null,
  touch() { Idle.last = Date.now(); },
  start() {
    clearInterval(Idle.timer);
    Idle.timer = setInterval(() => {
      const mins = Number(SITE.idleLockMinutes);
      if (!Number.isFinite(mins) || mins <= 0) return;
      if (!configured() || locked) return;
      if (Date.now() - Idle.last > mins * 60000) lock('Screen cleared after ' + plural(mins, 'minute') + ' idle.');
    }, 20000);
  }
};

/**
 * Clear the screen.
 *
 * There is nobody to sign out — this app has no logins. What this does is
 * take the staff details off the screen and out of memory, which is what
 * actually matters when a phone is left face-up on a seat. Carrying on is
 * one tap, and fetches everything fresh.
 */
function lock(why) {
  forgetData();
  locked = true;
  render();
  if (why) toast(why);
}

function unlock() {
  locked = false;
  Idle.touch();
  render();
}

function renderLocked(view) {
  $('#topbar').hidden = true;
  $('#menu').hidden = true;
  view.innerHTML = `
    <div class="gate"><div class="gate-card center">
      <div class="gate-mark" style="margin:0 auto 16px">${icon('lock')}</div>
      <h1>Screen cleared</h1>
      <p class="lede">Staff details are off the screen. Nothing was lost.</p>
      <button class="btn primary wide" id="unlockBtn">Carry on</button>
      <p class="foot">Clears itself again after a while with nothing happening.
        To hand this phone on for good, use Settings → Disconnect this phone.</p>
    </div></div>`;
  $('#unlockBtn').onclick = unlock;
}

/* =====================================================================
   Shared bits of interface
   ===================================================================== */
const statusClass = level => 'status-' + (level || 'grey');

/** The compliance ring. The number inside is the percentage. */
function ringHtml(pct, level, big) {
  return `<span class="ring ${big ? 'lg ' : ''}${statusClass(level)}" style="--p:${Math.max(0, Math.min(100, pct))}">
    <span class="ring-in">${pct}${big ? '<i>%</i>' : ''}</span></span>`;
}

/** A head shot if we have one, initials until then. */
function faceHtml(person, big) {
  const url = Faces.urlFor(person.id);
  return `<span class="face${big ? ' lg' : ''}" data-face="${esc(person.id)}">${
    url ? `<img src="${esc(url)}" alt="">` : esc(initials(person))}</span>`;
}

/**
 * Fetch the head shots for whatever is on screen, one at a time in the
 * background, and slot each into its own tile as it lands. Nothing waits
 * on them, and a failure just leaves the initials showing.
 */
function wireFaces(root) {
  $$('[data-face]', root).forEach(el => {
    const id = el.dataset.face;
    const url = Faces.urlFor(id);
    if (url) { el.innerHTML = `<img src="${esc(url)}" alt="">`; return; }
    Faces.load(id, ready => {
      if (el.isConnected) el.innerHTML = `<img src="${esc(ready)}" alt="">`;
    });
  });
}

/**
 * Take the controls away from a read-only account.
 *
 * The database refuses their writes either way — this is so they are not
 * offered a Save button that was only ever going to fail.
 */
function lockDown(root) {
  if (canEdit()) return;
  $$('input, select, textarea', root).forEach(el => { el.disabled = true; });
  $$('.savebar, [data-up], [data-rowup], [data-rowdel], [data-drop], #addRow', root)
    .forEach(el => { el.hidden = true; });
  root.insertAdjacentHTML('afterbegin',
    `<div class="banner info">Supervisors can see everything here but not change it.</div>`);
}

function sheet(html, onOpen) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.appendChild(bg);
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  function close() { bg.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  if (onOpen) onOpen($('.sheet', bg), close);
  return close;
}

function confirmSheet(title, body, confirmLabel, onYes) {
  sheet(`<h2>${esc(title)}</h2><p class="sub">${esc(body)}</p>
    <div class="btn-row"><button class="btn ghost" data-no>Cancel</button>
    <button class="btn danger" data-yes>${esc(confirmLabel)}</button></div>`, (el, close) => {
    $('[data-no]', el).onclick = close;
    $('[data-yes]', el).onclick = () => { close(); onYes(); };
  });
}

/* ------------------------------------------------------------ forms --
   One field definition renders one input, so the tiles at the top of
   this file are the only place a field is described.
   -------------------------------------------------------------------- */
function fieldHtml(f, value, opts) {
  const o = opts || {};
  const want = f.want && !o.noWant ? ' want' : '';
  const lab = `<span>${esc(f.label)}</span>`;

  /* A pay figure, on a phone that is not in director mode. Say it is on
     file rather than showing an empty box, which would read as "nobody
     filled it in" and would drag the tile red for no reason. */
  if (f.sensitive && !canSeePay()) {
    return `<label class="field">${lab}
      <span class="hidden-val">${icon('lock')} On file — director mode only</span></label>`;
  }
  const plain = f.plain ? ' autocapitalize="off" spellcheck="false"' : '';
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';

  if (f.type === 'select') {
    // `noBlank` is for the selects that must always hold a value — a person is
    // always of some worker type — so an empty choice can never be saved.
    const opts2 = f.noBlank ? (f.options || []) : [{ key: '', label: '— choose —' }].concat(f.options || []);
    return `<label class="field${want}">${lab}<select data-f="${f.name}">${
      opts2.map(x => `<option value="${esc(x.key)}"${x.key === (value || '') ? ' selected' : ''}>${esc(x.label)}</option>`).join('')
    }</select></label>`;
  }

  if (f.type === 'picks') {
    const held = Array.isArray(value) ? value : (value ? String(value).split(',').map(s => s.trim()) : []);
    return `<label class="field${want}">${lab}<span class="picks">${
      (f.options || []).map(x => `<label class="pick">
        <input type="checkbox" data-pick="${f.name}" value="${esc(x.key)}"${held.indexOf(x.key) >= 0 ? ' checked' : ''}>
        <span>${esc(x.label)}</span></label>`).join('')
    }</span></label>`;
  }

  if (f.type === 'textarea') {
    return `<label class="field${want}">${lab}<textarea data-f="${f.name}"${ph}>${esc(value || '')}</textarea></label>`;
  }

  if (f.type === 'datalist') {
    const listId = 'dl-' + f.name;
    return `<label class="field${want}">${lab}
      <input type="text" data-f="${f.name}" list="${listId}" value="${esc(value || '')}"${ph}${plain}>
      <datalist id="${listId}">${(f.options || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>`;
  }

  if (f.type === 'money') {
    return `<label class="field${want}">${lab}
      <input type="text" inputmode="decimal" data-f="${f.name}" value="${esc(value || '')}"
             placeholder="${esc(f.placeholder || '0.00')}" autocapitalize="off" spellcheck="false"></label>`;
  }

  const type = f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : 'text';
  return `<label class="field${want}">${lab}
    <input type="${type}" data-f="${f.name}" value="${esc(value == null ? '' : value)}"${ph}${plain}></label>`;
}

/**
 * Read a set of fields back out of the DOM, in the shape they are stored.
 *
 * A field with no control on screen — a wage this account may not see —
 * is left out of the result entirely rather than read as blank, so that
 * saving the tile cannot quietly wipe a value that was never shown.
 */
function readFields(root, fields) {
  const out = {};
  fields.forEach(f => {
    if (f.type === 'picks') {
      const boxes = $$(`input[data-pick="${f.name}"]`, root);
      if (boxes.length) out[f.name] = boxes.filter(el => el.checked).map(el => el.value);
      return;
    }
    const el = $(`[data-f="${f.name}"]`, root);
    if (el) out[f.name] = el.value.trim();
  });
  return out;
}

/** Read a value back for display, in whatever form it was stored. */
function showValue(f, value) {
  if (f.sensitive && !canSeePay()) return 'On file — director mode only';
  if (!hasValue(value)) return '—';
  if (f.type === 'picks') {
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map(k => {
      const o = (f.options || []).find(x => x.key === k);
      return o ? o.label : k;
    }).join(', ');
  }
  if (f.type === 'select') return labelOf(f.options || [], value);
  if (f.type === 'date') return fmtDate(value);
  if (f.type === 'money') return fmtMoney(value);
  return String(value);
}

/* =====================================================================
   Screen — the landing page

   Four options. The first is built; the other three are deliberately
   left as marked-out slots rather than invented, so what goes in them
   is still an open question rather than a wrong answer.
   ===================================================================== */
/** What the leave card says on the landing page. */
function leaveHeadline() {
  const rows = leaveRows();
  const away = rows.filter(x => x.state.when === 'now').length;
  const soon = rows.filter(x => x.state.when === 'upcoming').length;
  if (!rows.length) return 'Approved leave, booked ahead and already taken. Nothing booked yet.';
  const bits = [];
  if (away) bits.push(`${plural(away, 'person')} away now`);
  if (soon) bits.push(`${soon} booked ahead`);
  return bits.length ? bits.join(' · ') : 'All booked leave has been taken.';
}

/** What the breaches card says on the landing page. */
function breachHeadline() {
  const open = openBreaches().length;
  const flagged = flaggedPeople().length;
  if (!DB.breaches.length) return 'Anything a supervisor needs on record. Nothing raised yet.';
  if (!open) return 'All clear — everything raised has been closed out.';
  return `${plural(open, 'breach')} open across ${plural(flagged, 'person')}.`;
}

function renderHome(view) {
  const list = onBooks();
  const t = tallies(list);
  const firms = DB.companies.filter(c => c.active !== false).length;

  view.innerHTML = `
    <div class="hero">
      <h1>RCK People</h1>
      <p>${list.length ? `${plural(list.length, 'person')} on the books.` : 'Nobody on the books yet.'}</p>
    </div>

    ${list.length ? `<div class="tally">
      <button class="status-green"  data-level="green"><span class="n">${t.green}</span><span class="l">Compliant</span></button>
      <button class="status-orange" data-level="orange"><span class="n">${t.orange}</span><span class="l">Expiring soon</span></button>
      <button class="status-red"    data-level="red"><span class="n">${t.red}</span><span class="l">Action needed</span></button>
    </div>` : ''}

    <div class="options">
      <button class="option" data-go="#/staff">
        <span class="mark">${icon('people')}</span>
        <span class="grow">
          <span class="num">01</span>
          <b>Staff information</b>
          <span class="say">Everyone on the books, their compliance, and every document
            behind it. Filter by RCK, labour hire or subcontractor.</span>
        </span>
        <span class="chev">${icon('chev')}</span>
      </button>

      <button class="option" data-go="#/leave">
        <span class="mark">${icon('calendar')}</span>
        <span class="grow">
          <span class="num">02</span>
          <b>Annual leave</b>
          <span class="say">${leaveHeadline()}</span>
        </span>
        <span class="chev">${icon('chev')}</span>
      </button>

      <button class="option${openBreaches().length ? ' status-red' : ''}" data-go="#/breaches">
        <span class="mark"${openBreaches().length ? ' style="background:var(--s-bg);color:var(--s)"' : ''}>${icon('flag')}</span>
        <span class="grow">
          <span class="num">03</span>
          <b>Disciplinaries &amp; breaches</b>
          <span class="say">${breachHeadline()}</span>
        </span>
        <span class="chev">${icon('chev')}</span>
      </button>

      <button class="option empty-slot" data-slot="4">
        <span class="mark">${icon('plus')}</span>
        <span class="grow">
          <span class="num">04</span>
          <b>Slot four</b>
          <span class="say">Not built yet.</span>
        </span>
      </button>
    </div>

    <div class="sec-head"><h2>Also here</h2></div>
    <button class="option" data-go="#/companies">
      <span class="mark">${icon('building')}</span>
      <span class="grow">
        <b>Labour hire &amp; subcontractors</b>
        <span class="say">${firms ? plural(firms, 'company') : 'No companies yet'} — the agreement and
          account details each firm's people are checked against.</span>
      </span>
      <span class="chev">${icon('chev')}</span>
    </button>`;

  $$('[data-go]', view).forEach(b => { b.onclick = () => go(b.dataset.go); });
  $$('[data-level]', view).forEach(b => {
    b.onclick = () => { staffFilter.level = b.dataset.level; go('#/staff'); };
  });
  $$('[data-slot]', view).forEach(b => {
    b.onclick = () => sheet(`<h2>Nothing here yet</h2>
      <p class="sub">The last of the four options, left empty on purpose rather than filled with a
        guess. Say what belongs here and it gets built next.</p>
      <button class="btn wide" data-ok>Right you are</button>`, (el, close) => {
      $('[data-ok]', el).onclick = close;
    });
  });
}

/* =====================================================================
   Screen — staff information
   ===================================================================== */
const staffFilter = { type: 'all', crew: '', level: '', q: '', finished: false };

/** Everyone matching what is currently filtered, in name order. */
function filteredStaff() {
  const q = staffFilter.q.trim().toLowerCase();
  return DB.staff.filter(p => {
    if (!staffFilter.finished && p.status === 'finished') return false;
    if (staffFilter.type !== 'all' && (p.worker_type || 'rck') !== staffFilter.type) return false;
    if (staffFilter.crew && (p.crew || '') !== staffFilter.crew) return false;
    if (staffFilter.level && compliance(p).level !== staffFilter.level) return false;
    if (q) {
      const firm = p.company_id ? (companyById(p.company_id) || {}).name || '' : '';
      const hay = [fullName(p), p.preferred_name, p.role, crewLabel(p.crew), p.employee_no, firm]
        .filter(Boolean).join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}

function personTile(p) {
  const c = compliance(p);
  const type = WORKER_TYPES.find(w => w.key === (p.worker_type || 'rck')) || WORKER_TYPES[0];
  const firm = p.company_id ? (companyById(p.company_id) || {}).name : '';

  const pill = c.level === 'grey'  ? 'Finished'
             : c.level === 'green' ? 'Compliant'
             : c.level === 'orange' ? `${c.problems.length} expiring`
             : `${c.problems.filter(x => x.state.level === 'red').length} to do`;

  const flag = breachFlag(p.id);
  return `<button class="ptile ${statusClass(c.level)}${flag ? ' ' + flag.key : ''}" data-person="${esc(p.id)}">
    <span class="top">
      ${faceHtml(p)}
      ${ringHtml(c.pct, c.level)}
    </span>
    ${flag ? `<span class="flagline">${icon('flag')}${flag.count} open ${
      flag.count === 1 ? 'breach' : 'breaches'}</span>` : ''}
    <span>
      <span class="who ellip">${esc(fullName(p))}</span>
      <span class="meta ellip">${esc(p.role || '—')}</span>
      <span class="meta ellip">${esc(crewLabel(p.crew) || firm || type.label)}</span>
    </span>
    <span class="foot">
      <span class="tag">${esc(type.short)}</span>
      <span class="pill">${esc(pill)}</span>
    </span>
  </button>`;
}

function renderStaff(view) {
  const all = DB.staff.filter(p => staffFilter.finished || p.status !== 'finished');
  const countOf = key => all.filter(p => key === 'all' || (p.worker_type || 'rck') === key).length;

  const crewsUsed = (() => {
    const used = new Set(all.map(p => p.crew).filter(Boolean));
    const known = CREWS.filter(c => used.has(c.key));
    const extra = Array.from(used).filter(k => !CREWS.some(c => c.key === k)).sort();
    return known.concat(extra.map(k => ({ key: k, label: k })));
  })();

  const list = filteredStaff();
  const finishedCount = DB.staff.filter(p => p.status === 'finished').length;

  view.innerHTML = `
    <div class="toolbar">
      <input type="search" id="q" placeholder="Search name, role, crew…" value="${esc(staffFilter.q)}"
             autocapitalize="off" spellcheck="false">
      ${canEdit() ? `<button class="btn primary" id="addBtn" aria-label="Add someone">${icon('plus')}</button>` : ''}
    </div>

    <div class="chips">
      <button class="chip${staffFilter.type === 'all' ? ' on' : ''}" data-type="all">Everyone<span class="c">${countOf('all')}</span></button>
      ${WORKER_TYPES.map(w => `<button class="chip${staffFilter.type === w.key ? ' on' : ''}" data-type="${w.key}">${esc(w.label)}<span class="c">${countOf(w.key)}</span></button>`).join('')}
    </div>

    ${crewsUsed.length > 1 ? `<div class="chips">
      <button class="chip${!staffFilter.crew ? ' on' : ''}" data-crew="">All crews</button>
      ${crewsUsed.map(c => `<button class="chip${staffFilter.crew === c.key ? ' on' : ''}" data-crew="${esc(c.key)}">${esc(c.label)}</button>`).join('')}
    </div>` : ''}

    ${staffFilter.level ? `<div class="banner ${statusClass(staffFilter.level)}">
      Showing only <b>${staffFilter.level === 'red' ? 'action needed'
        : staffFilter.level === 'orange' ? 'expiring soon' : 'compliant'}</b>.
      <button class="linkbtn" id="clearLevel" style="color:inherit">Show everyone</button></div>` : ''}

    ${list.length ? `<div class="tiles">${list.map(personTile).join('')}</div>`
      : all.length ? `<div class="empty"><b>Nobody here</b>Nothing matches those filters.</div>`
      : canEdit() ? `<div class="empty"><b>Nobody on the books yet</b>
          Add the first person with the + button, top right.</div>`
      : `<div class="empty"><b>Nobody on the books yet</b>
          This phone is in supervisor mode, which can look but not add.</div>
         <button class="btn wide" id="toSettings">Switch this phone to Director / HR</button>`}

    ${finishedCount ? `<div class="center" style="margin-top:16px">
      <button class="linkbtn" id="finToggle">${staffFilter.finished
        ? 'Hide people who have finished' : `Also show ${plural(finishedCount, 'person')} who ${finishedCount === 1 ? 'has' : 'have'} finished`}</button>
    </div>` : ''}`;

  const add = $('#addBtn');
  if (add) add.onclick = () => go('#/edit/new');

  const q = $('#q');
  let typing;
  q.oninput = () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      staffFilter.q = q.value;
      const at = q.selectionStart;
      render();
      const again = $('#q');
      if (again) { again.focus(); again.setSelectionRange(at, at); }
    }, 180);
  };

  $$('[data-type]', view).forEach(b => { b.onclick = () => { staffFilter.type = b.dataset.type; render(); }; });
  $$('[data-crew]', view).forEach(b => { b.onclick = () => { staffFilter.crew = b.dataset.crew; render(); }; });
  $$('[data-person]', view).forEach(b => { b.onclick = () => go('#/person/' + b.dataset.person); });

  const cl = $('#clearLevel');
  if (cl) cl.onclick = () => { staffFilter.level = ''; render(); };
  const ft = $('#finToggle');
  if (ft) ft.onclick = () => { staffFilter.finished = !staffFilter.finished; render(); };

  const ts = $('#toSettings');
  if (ts) ts.onclick = () => go('#/settings');

  wireFaces(view);
}

/* =====================================================================
   Screen — one person
   ===================================================================== */
function renderPerson(view, args) {
  const p = staffById(args[0]);
  if (!p) return notFound(view, 'That person is no longer on file.');

  $('#title').textContent = fullName(p);

  const c = compliance(p);
  const tiles = tilesFor(p);
  const type = WORKER_TYPES.find(w => w.key === (p.worker_type || 'rck')) || WORKER_TYPES[0];
  const firm = p.company_id ? companyById(p.company_id) : null;
  const age = ageFrom(p.date_of_birth);

  view.innerHTML = `
    <div class="card">
      <div class="who-head">
        ${faceHtml(p, true)}
        <div class="grow">
          <h1>${esc(fullName(p))}</h1>
          <p class="sub">${esc(type.label)}${firm ? ' · ' + esc(firm.name) : ''}${
            p.status !== 'active' ? ' · ' + esc(labelOf(PERSON_STATUS, p.status)) : ''}</p>
        </div>
        ${ringHtml(c.pct, c.level, true)}
      </div>

      ${(() => { const f = breachFlag(p.id); return f ? `<div class="banner tone-${f.tone}"
        style="margin:14px 0 0"><b>${f.count} open ${f.count === 1 ? 'breach' : 'breaches'}</b>
        — on file until the office closes ${f.count === 1 ? 'it' : 'them'} out.</div>` : ''; })()}

      <div class="banner ${statusClass(c.level)}" style="margin:14px 0 15px">
        ${c.level === 'grey' ? 'No longer on the books.'
          : `${c.done} of ${c.total} complete${c.skipped ? ` · ${c.skipped} marked as not applying` : ''} — ${esc(c.text)}`}
      </div>

      <div class="kv">
        <div><div class="k">Born</div><div class="v small">${fmtDate(p.date_of_birth)}${age !== null ? ` · ${age}` : ''}</div></div>
        <div><div class="k">${isRck(p) ? 'Time at RCK' : 'Time with RCK'}</div>
             <div class="v small">${esc(serviceText(p.start_date, p.end_date))}</div></div>
        <div><div class="k">Role</div><div class="v small">${esc(p.role || '—')}</div></div>
        <div><div class="k">Crew</div><div class="v small">${esc(crewLabel(p.crew) || '—')}</div></div>
      </div>

      ${(p.phone || p.email) ? `<div class="kv" style="margin-top:12px">
        ${p.phone ? `<div><div class="k">Phone</div><div class="v small"><a href="tel:${esc(p.phone)}">${esc(p.phone)}</a></div></div>` : ''}
        ${p.email ? `<div><div class="k">Email</div><div class="v small ellip">${esc(p.email)}</div></div>` : ''}
      </div>` : ''}

      <div class="btn-row" style="margin-top:15px">
        ${canEdit() ? `<button class="btn sm ghost" id="editBtn">Edit details</button>` : ''}
        <button class="btn sm ghost" id="printBtn">${icon('print')} Print file</button>
      </div>
    </div>

    <div class="sec-head"><h2>Compliance</h2><span class="sub">${c.done} of ${c.total}</span></div>
    <div class="stiles">${tiles.map(t => stileHtml(t, p)).join('')}</div>

    <div class="sec-head"><h2>Disciplinaries &amp; breaches</h2>
      ${canRaiseBreach() ? `<button class="act" id="addBreachHere">Raise one</button>` : ''}</div>
    ${(() => {
      const mine = breachesFor(p.id);
      if (!mine.length) return `<div class="empty">Nothing on record.</div>`;
      const open = mine.filter(isOpenBreach), done = mine.filter(x => !isOpenBreach(x));
      return open.map(x => breachLine(x, { noFace: true, noName: true })).join('') +
        (done.length ? `<div class="empty">${plural(done.length, 'completed breach')} on file.</div>` : '');
    })()}

    <div class="sec-head"><h2>Annual leave</h2>
      ${canEdit() ? `<button class="act" id="addLeaveHere">Book leave</button>` : ''}</div>
    ${leavePersonCard(p)}

    ${firm ? `<div class="sec-head"><h2>Their company</h2></div>
      <button class="option" data-company="${esc(firm.id)}">
        <span class="mark">${icon('building')}</span>
        <span class="grow"><b>${esc(firm.name)}</b>
          <span class="say">${esc(companyState(firm).text)} · ${plural(staffOfCompany(firm.id).length, 'person')} on site</span></span>
        <span class="chev">${icon('chev')}</span>
      </button>` : ''}

    <div class="center" style="margin-top:20px">
      <button class="linkbtn" id="histBtn">Show the history of changes</button>
    </div>
    <div id="hist"></div>`;

  const ed = $('#editBtn');
  if (ed) ed.onclick = () => go('#/edit/' + p.id);
  $('#printBtn').onclick = () => printPersonFile(p);
  $$('[data-tile]', view).forEach(b => { b.onclick = () => go('#/tile/' + p.id + '/' + b.dataset.tile); });
  $$('[data-company]', view).forEach(b => { b.onclick = () => go('#/company/' + b.dataset.company); });
  $('#histBtn').onclick = () => showHistory(p.id);
  const al = $('#addLeaveHere');
  if (al) al.onclick = () => editLeave(null, p.id);
  const ab = $('#addBreachHere');
  if (ab) ab.onclick = () => raiseBreach(p.id);
  $$('[data-breach]', view).forEach(b => { b.onclick = () => go('#/breach/' + b.dataset.breach); });
  $$('[data-leave]', view).forEach(b => {
    b.onclick = () => {
      const row = DB.leave.find(l => l.id === b.dataset.leave);
      if (row) editLeave(row);
    };
  });
  wireFaces(view);
}

/**
 * One person's leave: what is booked ahead, and how much they have taken
 * this leave year. Deliberately not a balance — what they are entitled to
 * lives in payroll, and guessing at it here would be worse than useless.
 */
function leavePersonCard(person) {
  const mine = leaveFor(person.id).map(l => ({ row: l, person, state: leaveState(l) }));
  const ahead = mine.filter(x => x.state.when !== 'past')
    .sort((a, b) => String(a.row.starts_on).localeCompare(String(b.row.starts_on)));
  const year = leaveYearOf(today());
  const taken = daysTaken(person.id, year, 'annual');

  return `<div class="card">
    <div class="kv">
      <div><div class="k">Annual leave taken ${esc(leaveYearLabel(year))}</div>
           <div class="v">${taken ? `${taken} ${taken === 1 ? 'day' : 'days'}` : 'None'}</div></div>
      <div><div class="k">Booked ahead</div>
           <div class="v">${ahead.length ? plural(ahead.length, 'booking') : 'Nothing'}</div></div>
    </div>
    ${ahead.length ? `<div style="margin-top:12px">${ahead.map(x => `
      <button class="slot" data-leave="${esc(x.row.id)}">
        ${icon('calendar')}
        <span class="grow">
          <span>${fmtDate(x.row.starts_on)} → ${fmtDate(x.row.ends_on)}</span>
          <span class="sub">${esc(labelOf(LEAVE_KINDS, x.row.kind))}${
            x.row.days ? ` · ${x.row.days} working ${Number(x.row.days) === 1 ? 'day' : 'days'}` : ''} · ${esc(x.state.text)}</span>
        </span>
      </button>`).join('')}</div>` : ''}
  </div>`;
}

/** One compliance tile on a person's page. */
function stileHtml(t, person) {
  const s = t.state;
  return `<button class="stile ${statusClass(s.level)}" data-tile="${esc(t.section.key)}">
    ${s.level === 'green' ? `<span class="tick">${icon('check')}</span>` : ''}
    <span class="ico">${icon(t.section.icon)}</span>
    <b>${esc(sectionLabel(t.section, person.worker_type))}</b>
    <span class="st">${esc(s.text)}</span>
  </button>`;
}

function notFound(view, msg) {
  view.innerHTML = `<div class="empty"><b>Not found</b>${esc(msg)}</div>
    <button class="btn wide" onclick="location.hash='#/staff'">Back to the staff list</button>`;
}

async function showHistory(staffId) {
  const box = $('#hist');
  box.innerHTML = `<div class="empty">Loading the history…</div>`;
  try {
    const rows = await Store.pullAudit(staffId);
    box.innerHTML = rows.length
      ? `<div class="card">${rows.map(r => `<div class="row spread" style="padding:7px 0;border-bottom:1px solid var(--line)">
          <span class="grow"><b style="font-size:13.5px;font-weight:600">${esc(r.summary || r.action)}</b>
          <span class="sub" style="display:block">${esc(r.actor || 'Someone')} · ${fmtDateTime(r.at)}</span></span>
        </div>`).join('')}</div>`
      : `<div class="empty">Nothing recorded yet.</div>`;
  } catch (e) {
    box.innerHTML = `<div class="banner status-red">Could not load the history: ${esc(e.message)}</div>`;
  }
}

/* =====================================================================
   Screen — a person's own details
   ===================================================================== */
function renderPersonEdit(view, args) {
  const isNew = args[0] === 'new';
  const p = isNew ? { worker_type: 'rck', status: 'active' } : staffById(args[0]);
  if (!p) return notFound(view, 'That person is no longer on file.');
  if (!canEdit()) {
    view.innerHTML = `<div class="empty"><b>Supervisor mode</b>
      This phone can see staff records but not change them.</div>
      <div class="btn-row">
        <button class="btn ghost" onclick="history.back()">Back</button>
        <button class="btn primary" onclick="location.hash='#/settings'">Switch to Director / HR</button>
      </div>`;
    return;
  }

  $('#title').textContent = isNew ? 'Add someone' : 'Edit ' + fullName(p);

  const firmOptions = [{ key: '', label: '— none —' }]
    .concat(DB.companies.filter(c => c.active !== false).map(c => ({ key: c.id, label: c.name })));

  view.innerHTML = `
    <div class="card">
      <h2>Who they are</h2>
      <div class="fields2" style="margin-top:12px">
        ${fieldHtml({ name: 'first_name', label: 'First name', want: true }, p.first_name)}
        ${fieldHtml({ name: 'last_name', label: 'Last name', want: true }, p.last_name)}
        ${fieldHtml({ name: 'preferred_name', label: 'Known as' }, p.preferred_name)}
        ${fieldHtml({ name: 'employee_no', label: 'Employee number', plain: true }, p.employee_no)}
        ${fieldHtml({ name: 'date_of_birth', label: 'Date of birth', type: 'date' }, p.date_of_birth)}
      </div>
    </div>

    <div class="card">
      <h2>Where they sit</h2>
      <p class="sub">Whether they are on RCK's books or supplied by someone else decides
        which compliance tiles they get.</p>
      <div class="fields2" style="margin-top:12px">
        ${fieldHtml({ name: 'worker_type', label: 'Kind of worker', type: 'select', options: WORKER_TYPES, noBlank: true, want: true }, p.worker_type || 'rck')}
        ${fieldHtml({ name: 'company_id', label: 'Company they come from', type: 'select', options: firmOptions }, p.company_id || '')}
        ${fieldHtml({ name: 'role', label: 'Role', want: true, placeholder: 'Paver operator' }, p.role)}
        ${fieldHtml({ name: 'crew', label: 'Crew', type: 'select', options: crewOptions(p.crew) }, p.crew || '')}
        ${fieldHtml({ name: 'start_date', label: 'Start date', type: 'date' }, p.start_date)}
        ${fieldHtml({ name: 'status', label: 'Status', type: 'select', options: PERSON_STATUS, noBlank: true }, p.status || 'active')}
        ${(p.status === 'finished' || !isNew) ? fieldHtml({ name: 'end_date', label: 'Finished on', type: 'date' }, p.end_date) : ''}
      </div>
      <p class="sub" id="firmHint" hidden>Labour hire and subcontractors are checked against
        their company's agreement and account details, so pick the company here.</p>
    </div>

    <div class="card">
      <h2>How to reach them</h2>
      <div class="fields2" style="margin-top:12px">
        ${fieldHtml({ name: 'phone', label: 'Phone', type: 'tel' }, p.phone)}
        ${fieldHtml({ name: 'email', label: 'Email', type: 'email', plain: true }, p.email)}
      </div>
      ${fieldHtml({ name: 'address', label: 'Address', type: 'textarea' }, p.address)}
      ${fieldHtml({ name: 'notes', label: 'Notes', type: 'textarea' }, p.notes)}
    </div>

    ${isNew ? '' : `<div class="card">
      <h2>Remove</h2>
      <p class="sub">Someone who has left should be set to <b>Finished</b>, not deleted — they drop
        off the compliance counts but their record and documents stay. Deleting is permanent
        and takes every document with it.</p>
      <button class="btn danger sm" id="delBtn" style="margin-top:12px">${icon('trash')} Delete permanently</button>
    </div>`}

    <div class="savebar">
      <button class="btn ghost" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn">${isNew ? 'Add them' : 'Save'}</button>
    </div>`;

  const FIELDS = [
    { name: 'first_name' }, { name: 'last_name' }, { name: 'preferred_name' },
    { name: 'employee_no' }, { name: 'date_of_birth', type: 'date' },
    { name: 'worker_type' }, { name: 'company_id' }, { name: 'role' }, { name: 'crew' },
    { name: 'start_date', type: 'date' }, { name: 'status' }, { name: 'end_date', type: 'date' },
    { name: 'phone' }, { name: 'email' }, { name: 'address' }, { name: 'notes' }
  ];

  const typeSel = $('[data-f="worker_type"]', view);
  const hint = $('#firmHint');
  const syncHint = () => { hint.hidden = typeSel.value === 'rck'; };
  typeSel.onchange = syncHint;
  syncHint();

  $('#cancelBtn').onclick = () => history.back();

  $('#saveBtn').onclick = async () => {
    const btn = $('#saveBtn');
    const v = readFields(view, FIELDS);
    if (!v.first_name && !v.last_name) return toast('A first or last name is needed.');

    // Empty date and uuid columns must go to the database as null, not "".
    ['date_of_birth', 'start_date', 'end_date'].forEach(k => { if (!v[k]) v[k] = null; });
    v.company_id = v.company_id || null;

    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      if (isNew) {
        const saved = await Store.insert('staff', v);
        note(staffOwner(saved.id), 'staff', 'added', `Added ${fullName(saved)}`);
        toast('Added.');
        go('#/person/' + saved.id);
      } else {
        await Store.patch('staff', p.id, v);
        note(staffOwner(p.id), 'staff', 'edited', 'Details changed');
        toast('Saved.');
        history.back();
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = isNew ? 'Add them' : 'Save';
      toast('Could not save: ' + e.message);
    }
  };

  const del = $('#delBtn');
  if (del) del.onclick = () => confirmSheet(
    'Delete ' + fullName(p) + '?',
    'Their record, every compliance tile and every document uploaded against them go for good. This cannot be undone.',
    'Delete permanently',
    async () => {
      try {
        const paths = filesFor(staffOwner(p.id)).map(f => f.path);
        await Promise.all(paths.map(path => Store.removeFile(path).catch(() => {})));
        await Store.remove('staff', p.id);
        DB.sections = DB.sections.filter(r => r.staff_id !== p.id);
        DB.files = DB.files.filter(f => f.staff_id !== p.id);
        Faces.drop(p.id);
        toast('Deleted.');
        go('#/staff');
      } catch (e) { toast('Could not delete: ' + e.message); }
    });
}

/* =====================================================================
   Screen — one compliance tile, open

   The same screen serves every tile on every person and every company.
   What it shows comes entirely from the tile's definition at the top of
   this file, so a new tile needs no new screen.

   Two different rhythms on purpose:
     · Documents save the moment they finish uploading, because losing a
       40 MB upload to a mistyped date would be maddening.
     · Everything typed in saves when Save is pressed.
   Both are said on screen so neither is a surprise.
   ===================================================================== */
const MAX_UPLOAD = 40 * 1024 * 1024;

function renderStaffTile(view, args) {
  const p = staffById(args[0]);
  const section = sectionByKey(args[1]);
  if (!p || !section) return notFound(view, 'That tile no longer exists.');

  $('#title').textContent = sectionLabel(section, p.worker_type);

  const owner = ownerFor(p, section);
  if (!owner) {
    view.innerHTML = `
      <div class="card">
        <h2>${esc(section.label)}</h2>
        <p class="sub" style="margin-top:6px">This one belongs to the company ${esc(fullName(p))} comes
          from, not to them — so twelve people from the same firm share one agreement instead of it
          being typed in twelve times.</p>
        <p class="sub" style="margin-top:10px">They are not linked to a company yet.</p>
        <button class="btn primary wide" style="margin-top:14px" id="pick">Choose their company</button>
      </div>`;
    $('#pick').onclick = () => go('#/edit/' + p.id);
    return;
  }

  tileBody(view, {
    section, owner,
    subjectName: fullName(p),
    forWorkerType: p.worker_type,
    ownerNote: section.owner === 'company'
      ? `Held against ${esc((companyById(p.company_id) || {}).name || 'their company')}, and shared by everyone from that firm.`
      : '',
    onSaved: patch => afterTileSave(p, section, patch)
  });
}

function renderCompanyTile(view, args) {
  const co = companyById(args[0]);
  const section = sectionByKey(args[1]);
  if (!co || !section) return notFound(view, 'That tile no longer exists.');

  $('#title').textContent = section.label;
  tileBody(view, {
    section, owner: companyOwner(co.id),
    subjectName: co.name,
    forWorkerType: null,
    ownerNote: `Shared by everyone from ${esc(co.name)}.`
  });
}

/**
 * The contract tile is the one place a start date and a role are written
 * down properly, so saving it keeps the person's own record in step
 * rather than leaving two versions of the same fact.
 */
async function afterTileSave(person, section, patch) {
  if (section.key !== 'contract') return;
  const d = patch.data || {};
  const update = {};
  if (d.start_date && d.start_date !== person.start_date) update.start_date = d.start_date;
  if (d.role && d.role !== person.role) update.role = d.role;
  if (!Object.keys(update).length) return;
  try { await Store.patch('staff', person.id, update); } catch (e) { /* the tile itself saved */ }
}

function tileBody(view, o) {
  const { section, owner } = o;
  const row = sectionRow(owner, section.key);
  const data = (row && row.data) || {};
  const na = !!(row && row.na);
  const state = sectionState(section, owner);
  const label = sectionLabel(section, o.forWorkerType);

  /* Rows already saved can carry a certificate; a row just added on
     screen cannot, because there is nothing yet to attach it to. */
  const savedRowIds = new Set((Array.isArray(data.rows) ? data.rows : []).map(r => r.id));
  const rowsNow = Array.isArray(data.rows) ? data.rows.map(r => Object.assign({}, r)) : [];

  view.innerHTML = `
    <div class="card">
      <div class="row spread">
        <div class="grow">
          <h2>${esc(label)}</h2>
          <p class="sub" style="margin-top:3px">${esc(section.blurb || '')}</p>
        </div>
        <span class="pill ${statusClass(state.level)}">${esc(state.text)}</span>
      </div>
      ${o.ownerNote ? `<p class="sub" style="margin-top:10px">${o.ownerNote}</p>` : ''}
    </div>

    <div class="na-bar">
      <div class="grow">
        <b>Does not apply</b>
        <span>Leave this on and the tile drops out of ${esc(o.subjectName)}'s percentage
          entirely — neither for nor against.</span>
      </div>
      <label class="switch">
        <input type="checkbox" id="naSw"${na ? ' checked' : ''}>
        <span class="track"></span>
      </label>
    </div>

    <div id="naWhy"${na ? '' : ' hidden'}>
      ${fieldHtml({ name: 'na_reason', label: 'Why it does not apply', placeholder: 'Office based — never drives' }, (row && row.na_reason) || '')}
    </div>

    <div id="tileBody"${na ? ' hidden' : ''}>
      ${(section.fields || []).length ? `
        <div class="card">
          <h2>Details</h2>
          <div class="fields2" id="tileFields" style="margin-top:12px">
            ${section.fields.map(f => fieldHtml(f, data[f.name])).join('')}
          </div>
        </div>` : ''}

      ${section.rows ? `
        <div class="sec-head">
          <h2>${esc(section.rows.many)}</h2>
          <button class="act" id="addRow">${esc(section.rows.add)}</button>
        </div>
        <div id="rows">${rowsNow.map(r => rowHtml(section, r, owner, savedRowIds.has(r.id))).join('')}</div>
        ${rowsNow.length ? '' : `<div class="empty" id="rowsEmpty"><b>None yet</b>
          Add the first with the button above.</div>`}` : ''}

      ${(section.files || []).length ? `
        <div class="sec-head"><h2>Documents</h2>
          <span class="sub">Uploading saves the tile too</span></div>
        <div id="files">${section.files.map(f => fileSlotHtml(owner, section.key, f)).join('')}</div>` : ''}
    </div>

    <div class="savebar">
      <button class="btn ghost" id="backBtn2">Back</button>
      <button class="btn primary" id="saveTile">Save</button>
    </div>`;

  /* ------------------------------------------------------- the switch */
  const sw = $('#naSw');
  sw.onchange = () => {
    $('#naWhy').hidden = !sw.checked;
    $('#tileBody').hidden = sw.checked;
  };

  /* --------------------------------------------------------- saving --
     Everything on screen, in the shape the database holds it. Reading the
     details card by its own id rather than the whole body matters: a
     repeating row can carry a field of the same name (an expiry date, say)
     and would otherwise be read in its place. */
  function collect() {
    const patch = {
      na: sw.checked,
      na_reason: sw.checked ? (($('[data-f="na_reason"]', view) || {}).value || '').trim() : ''
    };
    if (sw.checked) {
      patch.data = data;                       // leave what was typed before untouched
      return patch;
    }
    const fieldsBox = $('#tileFields', view);
    const next = Object.assign({}, data,
      fieldsBox ? readFields(fieldsBox, section.fields || []) : {});
    if (section.rows) {
      next.rows = $$('#rows [data-row]', view).map(el =>
        Object.assign({ id: el.dataset.row }, readFields(el, section.rows.fields)));
    }
    patch.data = next;
    return patch;
  }

  /** Save what is on screen. Returns false if the database refused it. */
  async function save(patch) {
    await Store.saveSection(owner, section.key, patch);
    /* A row that has been taken off the screen leaves its certificate
       behind, so clear those out rather than letting them accumulate
       unreachable in the bucket. */
    if (section.rows && !patch.na) {
      const live = new Set((patch.data.rows || []).map(r => r.id));
      const orphans = filesFor(owner, section.key).filter(f => f.slot && !live.has(f.slot));
      await Promise.all(orphans.map(async f => {
        await Store.removeFile(f.path).catch(() => {});
        await Store.remove('profile_files', f.id).catch(() => {});
      }));
    }
    note(owner, 'section', 'saved', `${label} updated`);
    if (o.onSaved) await o.onSaved(patch);
  }

  /* --------------------------------------------------- repeating rows */
  if (section.rows) {
    const addRow = () => {
      const empty = $('#rowsEmpty');
      if (empty) empty.remove();
      const wrap = document.createElement('div');
      wrap.innerHTML = rowHtml(section, { id: uid() }, owner, false);
      const el = wrap.firstElementChild;
      $('#rows').appendChild(el);
      wireRow(el);
      const first = $('input, select', el);
      if (first) first.focus();
    };
    $('#addRow').onclick = addRow;
    $$('#rows [data-row]', view).forEach(wireRow);
  }

  function wireRow(el) {
    const del = $('[data-rowdel]', el);
    if (del) del.onclick = () => {
      el.remove();
      if (!$$('#rows [data-row]', view).length) {
        $('#rows', view).insertAdjacentHTML('afterend',
          `<div class="empty" id="rowsEmpty"><b>None yet</b>Add the first with the button above.</div>`);
      }
    };
    const up = $('[data-rowup]', el);
    if (up) up.onclick = () => startUpload(up.dataset.rowup, '.pdf,image/*');
    $$('[data-open]', el).forEach(b => { b.onclick = () => openFile(b.dataset.open); });
    $$('[data-drop]', el).forEach(b => { b.onclick = e => { e.stopPropagation(); removeFile(b.dataset.drop); }; });
  }

  /* -------------------------------------------------------- documents
     An upload redraws the screen, which would throw away anything typed
     but not yet saved. So the tile is saved on the way through — said on
     screen, above the upload boxes, so it isn't a surprise. */
  function startUpload(slot, accept) {
    pickAndUpload(owner, section.key, slot, accept, async () => {
      await save(collect());
    });
  }

  $$('[data-up]', view).forEach(b => {
    b.onclick = () => startUpload(b.dataset.up, b.dataset.accept || '');
  });
  $$('#files [data-open]', view).forEach(b => { b.onclick = () => openFile(b.dataset.open); });
  $$('#files [data-drop]', view).forEach(b => {
    b.onclick = e => { e.stopPropagation(); removeFile(b.dataset.drop); };
  });

  /* ------------------------------------------------------------- save */
  $('#backBtn2').onclick = () => history.back();

  $('#saveTile').onclick = async () => {
    const btn = $('#saveTile');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await save(collect());
      toast('Saved.');
      history.back();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Save';
      toast('Could not save: ' + e.message);
    }
  };

  lockDown(view);
}

/** One row of a repeating tile — a competency, an induction. */
function rowHtml(section, r, owner, saved) {
  const files = saved ? filesFor(owner, section.key, r.id) : [];
  return `<div class="subrow" data-row="${esc(r.id)}">
    <div class="row spread">
      <b class="grow ellip">${esc(section.rows.title(r))}</b>
      <button class="icon-btn" data-rowdel aria-label="Remove">${icon('trash')}</button>
    </div>
    <div class="fields2">
      ${section.rows.fields.map(f => fieldHtml(f, r[f.name])).join('')}
    </div>
    ${saved
      ? files.map(f => fileLineHtml(f)).join('') +
        `<button class="slot" data-rowup="${esc(r.id)}">${icon('up')}
           <span class="grow">${files.length ? 'Add another certificate' : esc(section.rows.file.label)}</span></button>`
      : `<p class="sub">Save first, then a certificate can be attached here.</p>`}
  </div>`;
}

/** One upload box on a tile, with whatever is already in it. */
function fileSlotHtml(owner, sectionKey, slot) {
  const files = filesFor(owner, sectionKey, slot.slot);
  const need = slot.want && !files.length;
  return `<div style="margin-bottom:14px">
    <div class="k" style="font-size:12.5px;font-weight:640;color:var(--ink-2);margin-bottom:6px">
      ${esc(slot.label)}${slot.want ? ' ·  required' : ''}</div>
    ${files.map(f => fileLineHtml(f, slot.image)).join('')}
    <button class="slot${need ? ' want' : ''}" data-up="${esc(slot.slot)}" data-accept="${esc(slot.accept || '')}">
      ${icon('up')}<span class="grow">${files.length ? 'Replace or add another' : 'Upload ' + esc(slot.label.toLowerCase())}</span>
    </button>
  </div>`;
}

/**
 * The two tiles whose documents have pay written inside them. The
 * database will not hand a supervisor these files at all, so the app
 * shows them as locked rather than offering a tap that fails.
 */
const PAY_TILES = ['contract', 'account'];
const canOpenFilesOf = sectionKey => canSeePay() || PAY_TILES.indexOf(sectionKey) < 0;

function fileLineHtml(f) {
  const size = fmtSize(f.file_size);
  const meta = [size, f.added_by, fmtDate(f.created_at)].filter(Boolean).join(' · ');

  if (!canOpenFilesOf(f.section_key)) {
    return `<span class="slot locked">
      ${icon('lock')}
      <span class="grow">
        <span class="ellip">On file</span>
        <span class="sub">Only a director can open this one</span>
      </span>
    </span>`;
  }

  return `<button class="slot" data-open="${esc(f.id)}">
    ${icon('file')}
    <span class="grow">
      <span class="ellip">${esc(f.file_name || 'Document')}</span>
      <span class="sub">${esc(meta)}</span>
    </span>
    <span class="icon-btn" data-drop="${esc(f.id)}" role="button" aria-label="Remove">${icon('trash')}</span>
  </button>`;
}

/* ------------------------------------------------------------ uploads */
/**
 * Pick a file and put it in the private bucket.
 *
 * The picker has to open inside the click itself — browsers refuse one
 * opened after an await — so `before` runs once a file has actually been
 * chosen, and is where the open tile saves what has been typed so far.
 */
let picker;
function pickAndUpload(owner, sectionKey, slot, accept, before) {
  if (picker) picker.remove();
  picker = document.createElement('input');
  picker.type = 'file';
  if (accept) picker.accept = accept;
  picker.style.display = 'none';
  document.body.appendChild(picker);
  picker.onchange = async () => {
    const file = picker.files && picker.files[0];
    picker.remove(); picker = null;
    if (!file) return;
    if (file.size > MAX_UPLOAD) {
      return toast('That file is over 40 MB. Shrink it, or keep it in SharePoint.');
    }
    toast('Uploading ' + file.name + '…');
    try {
      if (before) await before();
      const path = await Store.upload(owner, sectionKey, file);
      await Store.insert('profile_files', {
        staff_id:   owner.kind === 'staff' ? owner.id : null,
        company_id: owner.kind === 'company' ? owner.id : null,
        section_key: sectionKey,
        slot: slot || '',
        path,
        file_name: file.name,
        file_size: file.size,
        mime: file.type || '',
        added_by: whoAmI()
      });
      note(owner, 'file', 'uploaded', `${file.name} added to ${sectionKey}`);
      if (sectionKey === 'photo' && owner.kind === 'staff') Faces.drop(owner.id);
      toast('Uploaded.');
      render();
    } catch (e) {
      toast('Upload failed: ' + (e.message || 'unknown problem'));
    }
  };
  picker.click();
}

function removeFile(fileId) {
  const f = DB.files.find(x => x.id === fileId);
  if (!f) return;
  confirmSheet('Remove this document?', f.file_name || 'It will be deleted from the private store for good.',
    'Remove', async () => {
      try {
        await Store.removeFile(f.path);
        await Store.remove('profile_files', f.id);
        if (f.section_key === 'photo' && f.staff_id) Faces.drop(f.staff_id);
        toast('Removed.');
        render();
      } catch (e) { toast('Could not remove: ' + e.message); }
    });
}

/**
 * Show a document inside the app rather than sending anyone off to
 * another tab. It is fetched through a link that works for two minutes,
 * held as a blob for as long as the sheet is open, and thrown away when
 * it closes.
 */
function openFile(fileId) {
  const f = DB.files.find(x => x.id === fileId);
  if (!f) return;
  let blobUrl = null;
  let backdrop = null;

  const close = sheet(`
    <div class="row spread" style="margin-bottom:12px">
      <h2 class="grow ellip">${esc(f.file_name || 'Document')}</h2>
    </div>
    <div class="viewer" id="vwr">
      <div class="viewer-wait">${icon('spin', 'spin')}<span>Fetching it…</span></div>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn ghost" data-close>Close</button>
      <a class="btn" id="dl" download="${esc(f.file_name || 'document')}" hidden>${icon('down')} Download</a>
    </div>`, (el, closeFn) => {
    backdrop = el.parentElement;
    $('[data-close]', el).onclick = closeFn;

    Store.blobUrl(f.path).then(b => {
      blobUrl = b.url;
      const box = $('#vwr', el);
      const isImg = /^image\//.test(b.type || f.mime || '');
      box.innerHTML = isImg
        ? `<img src="${b.url}" alt="${esc(f.file_name || '')}">`
        : `<iframe src="${b.url}" title="${esc(f.file_name || 'Document')}"></iframe>`;
      const dl = $('#dl', el);
      dl.href = b.url;
      dl.hidden = false;
    }).catch(e => {
      $('#vwr', el).innerHTML = `<div class="viewer-wait">Could not open it.<br>${esc(e.message)}</div>`;
    });
  });

  // Give the memory back once this particular sheet has gone — whether it
  // was closed by the button, the backdrop or Escape.
  const watch = setInterval(() => {
    if (backdrop && !backdrop.isConnected) {
      clearInterval(watch);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  }, 500);
  return close;
}

/* =====================================================================
   Screen — annual leave
   ===================================================================== */
const leaveFilter = { crew: '', showPast: false };

function leaveLine(x, opts) {
  const o = opts || {};
  const st = x.state;
  const kind = labelOf(LEAVE_KINDS, x.row.kind);
  const days = Number(x.row.days) || 0;
  return `<button class="option ${statusClass(st.level)}" data-leave="${esc(x.row.id)}">
    ${o.noFace ? '' : faceHtml(x.person)}
    <span class="grow">
      <b>${esc(fullName(x.person))}</b>
      <span class="say">${fmtDate(x.row.starts_on)} → ${fmtDate(x.row.ends_on)}</span>
      <span class="say">${esc([
        kind,
        days ? `${days} working ${days === 1 ? 'day' : 'days'}` : '',
        crewLabel(x.person.crew)
      ].filter(Boolean).join(' · '))}</span>
    </span>
    <span class="pill">${esc(st.text)}</span>
  </button>`;
}

function renderLeave(view) {
  const rows = leaveRows(leaveFilter);
  const away = rows.filter(x => x.state.when === 'now');
  const soon = rows.filter(x => x.state.when === 'upcoming');
  const past = rows.filter(x => x.state.when === 'past').reverse();
  const year = leaveYearOf(today());

  const crewsUsed = (() => {
    const used = new Set(DB.leave.map(l => (staffById(l.staff_id) || {}).crew).filter(Boolean));
    const known = CREWS.filter(c => used.has(c.key));
    const extra = Array.from(used).filter(k => !CREWS.some(c => c.key === k)).sort();
    return known.concat(extra.map(k => ({ key: k, label: k })));
  })();

  view.innerHTML = `
    <div class="toolbar">
      <div class="grow"><p class="sub">Approved leave. It sorts itself by the dates, so what is
        coming up, who is away and what has been taken keep themselves right.</p></div>
      ${canEdit() ? `<button class="btn primary" id="addLeave" aria-label="Book leave">${icon('plus')}</button>` : ''}
    </div>

    <div class="tally">
      <button class="status-orange" data-jump="away"><span class="n">${away.length}</span><span class="l">Away now</span></button>
      <button class="status-green"  data-jump="soon"><span class="n">${soon.length}</span><span class="l">Booked ahead</span></button>
      <button class="status-grey"   data-jump="past"><span class="n">${past.length}</span><span class="l">Taken ${esc(leaveYearLabel(year))}</span></button>
    </div>

    ${crewsUsed.length > 1 ? `<div class="chips" style="margin-top:12px">
      <button class="chip${!leaveFilter.crew ? ' on' : ''}" data-lcrew="">All crews</button>
      ${crewsUsed.map(c => `<button class="chip${leaveFilter.crew === c.key ? ' on' : ''}" data-lcrew="${esc(c.key)}">${esc(c.label)}</button>`).join('')}
    </div>` : ''}

    <div class="sec-head" id="away"><h2>Away now</h2><span class="sub">${away.length}</span></div>
    ${away.length ? away.map(x => leaveLine(x)).join('')
      : `<div class="empty">Everyone is in.</div>`}

    <div class="sec-head" id="soon"><h2>Booked ahead</h2><span class="sub">${soon.length}</span></div>
    ${soon.length ? soon.map(x => leaveLine(x)).join('')
      : `<div class="empty">Nothing booked yet.${canEdit() ? ' Add the first with the + button, top right.' : ''}</div>`}

    <div class="sec-head" id="past"><h2>Already taken</h2>
      ${past.length ? `<button class="act" id="pastToggle">${leaveFilter.showPast ? 'Hide' : 'Show'}</button>` : ''}</div>
    ${!past.length ? `<div class="empty">Nothing yet.</div>`
      : leaveFilter.showPast ? past.map(x => leaveLine(x)).join('')
      : `<div class="empty">${plural(past.length, 'booking')} in the past.</div>`}`;

  const add = $('#addLeave');
  if (add) add.onclick = () => editLeave(null);

  $$('[data-lcrew]', view).forEach(b => {
    b.onclick = () => { leaveFilter.crew = b.dataset.lcrew; render(); };
  });
  $$('[data-leave]', view).forEach(b => {
    b.onclick = () => {
      const row = DB.leave.find(l => l.id === b.dataset.leave);
      if (row) editLeave(row);
    };
  });
  $$('[data-jump]', view).forEach(b => {
    b.onclick = () => {
      const el = $('#' + b.dataset.jump, view);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
  const pt = $('#pastToggle');
  if (pt) pt.onclick = () => { leaveFilter.showPast = !leaveFilter.showPast; render(); };

  wireFaces(view);
}

/**
 * Book leave, or change a booking.
 *
 * The working days fill themselves in from the dates but stay editable —
 * a half day or a public holiday is the office's call. The clash warning
 * is the part that earns its keep: on a crew, the question is never
 * "what did they book" but "can I let this one go as well".
 */
function editLeave(row, presetStaffId) {
  if (!canEdit()) return toast('Supervisor mode — leave is booked by the office.');

  const people = DB.staff.filter(p => p.status !== 'finished' || (row && row.staff_id === p.id));
  if (!people.length) return toast('Add somebody to the staff list first.');

  const r = row || {
    staff_id: presetStaffId || people[0].id,
    kind: 'annual', starts_on: '', ends_on: '', days: '',
    approved_by: whoAmI(), notes: ''
  };

  sheet(`
    <h2>${row ? 'Change this leave' : 'Book approved leave'}</h2>
    <p class="sub">Everything on this screen has already been approved.</p>

    ${fieldHtml({ name: 'lStaff', label: 'Who', type: 'select', noBlank: true,
                  options: people.map(p => ({ key: p.id,
                    label: fullName(p) + (p.crew ? ' — ' + crewLabel(p.crew) : '') })) }, r.staff_id)}
    ${fieldHtml({ name: 'lKind', label: 'Kind of leave', type: 'select', noBlank: true,
                  options: LEAVE_KINDS }, r.kind)}
    <div class="fields2">
      ${fieldHtml({ name: 'lFrom', label: 'First day off', type: 'date' }, r.starts_on)}
      ${fieldHtml({ name: 'lTo', label: 'Last day off', type: 'date' }, r.ends_on)}
    </div>
    ${fieldHtml({ name: 'lDays', label: 'Working days', placeholder: 'Counted for you' }, r.days)}
    ${fieldHtml({ name: 'lBy', label: 'Approved by' }, r.approved_by)}
    ${fieldHtml({ name: 'lNotes', label: 'Notes', type: 'textarea' }, r.notes)}

    <div id="lClash"></div>

    <div class="btn-row">
      ${row ? '<button class="btn danger" data-del>Remove</button>' : ''}
      <button class="btn ghost" data-no>Cancel</button>
      <button class="btn primary" data-yes>${row ? 'Save' : 'Book it'}</button>
    </div>`, (el, close) => {

    const from = $('[data-f="lFrom"]', el);
    const to   = $('[data-f="lTo"]', el);
    const days = $('[data-f="lDays"]', el);
    let daysTouched = !!(row && row.days);

    days.oninput = () => { daysTouched = true; };

    const recount = () => {
      if (!daysTouched && from.value && to.value) days.value = workingDays(from.value, to.value) || '';
      if (from.value && to.value && to.value < from.value) {
        $('#lClash', el).innerHTML =
          `<div class="banner status-red">The last day is before the first day.</div>`;
        return;
      }
      const others = overlapping(from.value, to.value, row && row.id)
        .filter(x => x.person.id !== $('[data-f="lStaff"]', el).value);
      const mine = staffById($('[data-f="lStaff"]', el).value) || {};
      const sameCrew = others.filter(x => (x.person.crew || '') === (mine.crew || '') && mine.crew);

      $('#lClash', el).innerHTML = !others.length ? '' : `
        <div class="banner ${sameCrew.length ? 'status-orange' : 'info'}">
          ${sameCrew.length
            ? `<b>${plural(sameCrew.length, 'other')} in ${esc(crewLabel(mine.crew))}</b> off over these dates: `
            : `Also off over these dates: `}
          ${others.map(x => esc(fullName(x.person))).join(', ')}.
        </div>`;
    };

    from.onchange = recount;
    to.onchange = recount;
    $('[data-f="lStaff"]', el).onchange = recount;
    recount();

    $('[data-no]', el).onclick = close;

    $('[data-yes]', el).onclick = async () => {
      const v = {
        staff_id: $('[data-f="lStaff"]', el).value,
        kind: $('[data-f="lKind"]', el).value,
        starts_on: from.value || null,
        ends_on: to.value || null,
        days: days.value === '' ? null : Number(days.value),
        approved_by: $('[data-f="lBy"]', el).value.trim(),
        notes: $('[data-f="lNotes"]', el).value.trim()
      };
      if (!v.starts_on || !v.ends_on) return toast('Both dates are needed.');
      if (v.ends_on < v.starts_on) return toast('The last day is before the first day.');
      if (v.days !== null && !Number.isFinite(v.days)) return toast('Working days must be a number.');

      try {
        const who = staffById(v.staff_id);
        if (row) {
          await Store.patch('staff_leave', row.id, v);
          note(staffOwner(v.staff_id), 'leave', 'changed',
               `Leave changed — ${fmtDate(v.starts_on)} to ${fmtDate(v.ends_on)}`);
        } else {
          const saved = await Store.insert('staff_leave', v);
          note(staffOwner(v.staff_id), 'leave', 'booked',
               `${labelOf(LEAVE_KINDS, saved.kind)} — ${fmtDate(v.starts_on)} to ${fmtDate(v.ends_on)}`);
        }
        close();
        render();
        toast(row ? 'Saved.' : `Booked for ${who ? fullName(who) : 'them'}.`);
      } catch (e) { toast('Could not save: ' + e.message); }
    };

    const del = $('[data-del]', el);
    if (del) del.onclick = () => {
      close();
      confirmSheet('Remove this leave?',
        'It comes off the register for good. Only do this if it was entered in error or cancelled.',
        'Remove', async () => {
          try {
            await Store.remove('staff_leave', row.id);
            note(staffOwner(row.staff_id), 'leave', 'removed',
                 `Leave removed — ${fmtDate(row.starts_on)} to ${fmtDate(row.ends_on)}`);
            render();
            toast('Removed.');
          } catch (e) { toast('Could not remove: ' + e.message); }
        });
    };
  });
}

/* =====================================================================
   Screens — disciplinaries and breaches
   ===================================================================== */
const breachFilter = { showDone: false };

function breachLine(x, opts) {
  const o = opts || {};
  const person = staffById(x.staff_id);
  if (!person) return '';
  const open = isOpenBreach(x);
  const photos = breachPhotos(x).length;
  return `<button class="option ${open ? 'status-red' : 'status-grey'}" data-breach="${esc(x.id)}">
    ${o.noFace ? '' : faceHtml(person)}
    <span class="grow">
      <b>${esc(x.title)}</b>
      <span class="say">${o.noName ? '' : esc(fullName(person)) + ' · '}${esc(breachWhen(x))}${
        x.raised_by ? ' · by ' + esc(x.raised_by) : ''}</span>
      ${photos ? `<span class="say dim">${plural(photos, 'photo')} attached</span>` : ''}
    </span>
    <span class="pill">${open ? 'Open' : 'Completed'}</span>
  </button>`;
}

function renderBreaches(view) {
  const open = openBreaches()
    .sort((a, b) => String(b.raised_at).localeCompare(String(a.raised_at)));
  const done = DB.breaches.filter(x => !isOpenBreach(x))
    .sort((a, b) => String(b.completed_at || b.raised_at).localeCompare(String(a.completed_at || a.raised_at)));
  const flagged = flaggedPeople();

  view.innerHTML = `
    <div class="toolbar">
      <div class="grow"><p class="sub">Anything a supervisor or the office needs on record. Raising
        one shades that person until the office has worked it and marked it complete.</p></div>
      ${canRaiseBreach() ? `<button class="btn primary" id="addBreach" aria-label="Raise a breach">${icon('plus')}</button>` : ''}
    </div>

    <div class="tally">
      <button class="status-red"    data-bjump="open"><span class="n">${open.length}</span><span class="l">Open</span></button>
      <button class="status-orange" data-bjump="flagged"><span class="n">${flagged.length}</span><span class="l">People flagged</span></button>
      <button class="status-grey"   data-bjump="done"><span class="n">${done.length}</span><span class="l">Completed</span></button>
    </div>

    <div class="sec-head" id="flagged"><h2>Flagged right now</h2></div>
    ${flagged.length ? `<div class="cards">${flagged.map(f => `
      <button class="pcard ${f.flag.key}" data-person="${esc(f.person.id)}">
        ${faceHtml(f.person, true)}
        <span class="who">${esc(fullName(f.person))}</span>
        <span class="job">${esc(f.person.role || '—')}</span>
        <span class="job"><b>${f.flag.count}</b> open</span>
      </button>`).join('')}</div>`
      : `<div class="empty">Nobody has an open breach.</div>`}

    <div class="sec-head" id="open"><h2>Open</h2><span class="sub">${open.length}</span></div>
    ${open.length ? open.map(x => breachLine(x)).join('')
      : `<div class="empty">Nothing open.${canRaiseBreach() ? ' Raise one with the + button, top right.' : ''}</div>`}

    <div class="sec-head" id="done"><h2>Completed</h2>
      ${done.length ? `<button class="act" id="doneToggle">${breachFilter.showDone ? 'Hide' : 'Show'}</button>` : ''}</div>
    ${!done.length ? `<div class="empty">Nothing completed yet.</div>`
      : breachFilter.showDone ? done.map(x => breachLine(x)).join('')
      : `<div class="empty">${plural(done.length, 'breach')} closed out.</div>`}`;

  const add = $('#addBreach');
  if (add) add.onclick = () => raiseBreach();

  $$('[data-breach]', view).forEach(b => { b.onclick = () => go('#/breach/' + b.dataset.breach); });
  $$('[data-person]', view).forEach(b => { b.onclick = () => go('#/person/' + b.dataset.person); });
  $$('[data-bjump]', view).forEach(b => {
    b.onclick = () => {
      const el = $('#' + b.dataset.bjump, view);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
  const dt = $('#doneToggle');
  if (dt) dt.onclick = () => { breachFilter.showDone = !breachFilter.showDone; render(); };

  wireFaces(view);
}

/**
 * Raising one. The date and time are stamped as the form is filled in
 * rather than chosen, so the register says when something was actually
 * reported and not when somebody got round to it.
 */
function raiseBreach(preselectId) {
  /* Everyone on the books, straight from Staff information — the list
     builds itself, so a new starter can be picked the moment they are
     added and there is no second list to keep in step. */
  const people = onBooks();
  if (!people.length) return toast('Add somebody under Staff information first.');

  const stamped = new Date();
  const chosen = people.some(p => p.id === preselectId) ? preselectId : people[0].id;

  sheet(`
    <h2>Breach or disciplinary</h2>

    ${fieldHtml({ name: 'bStaff', label: 'Who is this about', type: 'select',
                  noBlank: true, want: true,
                  options: people.map(p => ({
                    key: p.id,
                    label: fullName(p) + (p.role ? ' — ' + p.role : '') })) }, chosen)}

    <div class="na-bar" style="margin-top:12px">
      <div class="grow">
        <b>${esc(fmtDateTime(stamped.toISOString()))}</b>
        <span>Stamped now, and by ${esc(whoAmI() || 'you')}.</span>
      </div>
      ${icon('calendar')}
    </div>

    ${fieldHtml({ name: 'bTitle', label: 'What happened', want: true,
                  placeholder: 'Breach of the 10 Golden Rules — no hard hat' }, '')}
    ${fieldHtml({ name: 'bDesc', label: 'Describe it', type: 'textarea', want: true,
                  placeholder: 'Where, when, who was there, what was said and done.' }, '')}

    <div class="sec-head"><h2>Photos</h2><span class="sub">Optional, as many as you like</span></div>
    <div id="bShots"></div>
    <button class="slot" id="bAdd">${icon('camera')}<span class="grow">Add a photo</span></button>

    <div class="btn-row" style="margin-top:14px">
      <button class="btn ghost" data-no>Cancel</button>
      <button class="btn primary" data-yes>Submit</button>
    </div>`, (el, close) => {

    /* Photos are held here until Submit, then uploaded against the saved
       breach — there is nothing to attach them to before that. */
    const pending = [];
    const paintShots = () => {
      $('#bShots', el).innerHTML = pending.map((f, i) => `
        <div class="slot">
          ${icon('file')}
          <span class="grow"><span class="ellip">${esc(f.name)}</span>
            <span class="sub">${esc(fmtSize(f.size))}</span></span>
          <span class="icon-btn" data-drop="${i}" role="button" aria-label="Remove">${icon('trash')}</span>
        </div>`).join('');
      $$('[data-drop]', el).forEach(b => {
        b.onclick = () => { pending.splice(Number(b.dataset.drop), 1); paintShots(); };
      });
    };

    $('#bAdd', el).onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.multiple = true;
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.onchange = () => {
        Array.from(inp.files || []).forEach(f => {
          if (f.size > MAX_UPLOAD) return toast(f.name + ' is over 40 MB.');
          pending.push(f);
        });
        inp.remove();
        paintShots();
      };
      inp.click();
    };

    $('[data-no]', el).onclick = close;

    $('[data-yes]', el).onclick = async () => {
      const btn = $('[data-yes]', el);
      const staffId = $('[data-f="bStaff"]', el).value;
      const title = $('[data-f="bTitle"]', el).value.trim();
      const desc  = $('[data-f="bDesc"]', el).value.trim();
      if (!staffId) return toast('Pick who this is about.');
      if (!title) return toast('Say what happened.');
      if (!desc)  return toast('Describe it, so the office has something to work with.');

      btn.disabled = true;
      btn.textContent = 'Submitting…';
      try {
        const saved = await Store.insert('staff_breaches', {
          staff_id: staffId, title, description: desc,
          raised_by: whoAmI(), raised_at: stamped.toISOString(), status: 'open'
        });

        for (const f of pending) {
          const path = await Store.upload(staffOwner(staffId), 'breach', f);
          await Store.insert('profile_files', {
            staff_id: staffId, company_id: null, section_key: 'breach', slot: saved.id,
            path, file_name: f.name, file_size: f.size, mime: f.type || '', added_by: whoAmI()
          });
        }

        note(staffOwner(staffId), 'breach', 'raised', 'Breach raised — ' + title);
        close();
        go('#/breach/' + saved.id);
        toast('Submitted. The office will pick it up.');
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Submit';
        toast('Could not submit: ' + e.message);
      }
    };
  });
}

/** One breach, in full. Where the office does its part. */
function renderBreach(view, args) {
  const x = DB.breaches.find(b => b.id === args[0]);
  if (!x) return notFound(view, 'That breach is no longer on file.');
  const person = staffById(x.staff_id);
  if (!person) return notFound(view, 'That person is no longer on file.');

  $('#title').textContent = 'Breach';
  const open = isOpenBreach(x);
  const photos = breachPhotos(x);

  view.innerHTML = `
    <div class="card">
      <div class="row spread">
        <div class="grow">
          <h1 style="font-size:19px">${esc(x.title)}</h1>
          <p class="sub" style="margin-top:3px">${esc(fullName(person))}${
            person.role ? ' · ' + esc(person.role) : ''}${
            person.crew ? ' · ' + esc(crewLabel(person.crew)) : ''}</p>
        </div>
        <span class="pill ${open ? 'status-red' : 'status-grey'}">${open ? 'Open' : 'Completed'}</span>
      </div>
      <div class="kv" style="margin-top:14px">
        <div><div class="k">Raised</div><div class="v small">${esc(fmtDateTime(x.raised_at))}</div></div>
        <div><div class="k">By</div><div class="v small">${esc(x.raised_by || '—')}</div></div>
      </div>
      <button class="btn sm ghost" style="margin-top:14px" id="toPerson">Open their file</button>
    </div>

    <div class="card">
      <h2>What happened</h2>
      <p style="white-space:pre-wrap;margin-top:8px">${esc(x.description || '—')}</p>
    </div>

    ${photos.length ? `<div class="sec-head"><h2>Photos</h2><span class="sub">${photos.length}</span></div>
      <div class="card">${photos.map(f => fileLineHtml(f)).join('')}</div>` : ''}

    <div class="sec-head"><h2>The office</h2></div>
    <div class="card">
      ${canWorkBreach() && open ? `
        ${fieldHtml({ name: 'bComments', label: 'Comments', type: 'textarea',
                      placeholder: 'What was discussed, who with, and when.' }, x.hr_comments)}
        <button class="btn wide" id="saveComments">Save comments</button>
        <button class="btn primary wide" id="completeBtn" style="margin-top:10px">
          ${icon('check')} Complete this breach</button>
      ` : `
        <div class="kv">
          <div><div class="k">Comments</div>
               <div class="v small" style="white-space:pre-wrap">${esc(x.hr_comments || '—')}</div></div>
        </div>
        ${open ? `<p class="sub" style="margin-top:12px">Still open. The office adds their comments
          and closes it out.</p>` : `
        <div class="kv" style="margin-top:14px">
          <div><div class="k">What was done</div>
               <div class="v small" style="white-space:pre-wrap">${esc(x.outcome || '—')}</div></div>
          <div><div class="k">Completed</div>
               <div class="v small">${esc(fmtDateTime(x.completed_at))}${
                 x.completed_by ? ' · ' + esc(x.completed_by) : ''}</div></div>
        </div>`}
      `}
      ${!open && canWorkBreach() ? `<button class="btn sm ghost wide" id="reopenBtn"
        style="margin-top:14px">Reopen it</button>` : ''}
    </div>`;

  $('#toPerson').onclick = () => go('#/person/' + person.id);
  $$('[data-open]', view).forEach(b => { b.onclick = () => openFile(b.dataset.open); });
  $$('[data-drop]', view).forEach(b => {
    b.onclick = e => { e.stopPropagation(); if (canEdit()) removeFile(b.dataset.drop); };
  });

  const sc = $('#saveComments');
  if (sc) sc.onclick = async () => {
    sc.disabled = true;
    try {
      await Store.patch('staff_breaches', x.id,
        { hr_comments: $('[data-f="bComments"]').value.trim() });
      toast('Comments saved.');
      render();
    } catch (e) { sc.disabled = false; toast('Could not save: ' + e.message); }
  };

  const cb = $('#completeBtn');
  if (cb) cb.onclick = () => completeBreach(x, ($('[data-f="bComments"]') || {}).value || '');

  const rb = $('#reopenBtn');
  if (rb) rb.onclick = () => confirmSheet('Reopen this breach?',
    'It goes back on their file and shades their tile again.', 'Reopen', async () => {
      try {
        await Store.patch('staff_breaches', x.id,
          { status: 'open', completed_at: null, completed_by: '' });
        note(staffOwner(x.staff_id), 'breach', 'reopened', 'Breach reopened — ' + x.title);
        render();
        toast('Reopened.');
      } catch (e) { toast('Could not reopen: ' + e.message); }
    });
}

/** Closing one out: what was done, then it comes off their file. */
function completeBreach(x, comments) {
  const person = staffById(x.staff_id);
  sheet(`
    <h2>Complete this breach</h2>
    <p class="sub">It comes off ${esc(person ? fullName(person) : 'their')} file and the shading
      lifts. The record stays under Completed.</p>
    ${fieldHtml({ name: 'bOutcome', label: 'What was done', type: 'textarea', want: true,
                  placeholder: 'Verbal warning given and toolbox talk run with the crew.' }, x.outcome)}
    <div class="btn-row">
      <button class="btn ghost" data-no>Cancel</button>
      <button class="btn primary" data-yes>Complete it</button>
    </div>`, (el, close) => {
    $('[data-no]', el).onclick = close;
    $('[data-yes]', el).onclick = async () => {
      const outcome = $('[data-f="bOutcome"]', el).value.trim();
      if (!outcome) return toast('Say what was done, so the record stands on its own.');
      const btn = $('[data-yes]', el);
      btn.disabled = true;
      btn.textContent = 'Completing…';
      try {
        await Store.patch('staff_breaches', x.id, {
          status: 'complete',
          hr_comments: (comments || x.hr_comments || '').trim(),
          outcome,
          completed_by: whoAmI(),
          completed_at: new Date().toISOString()
        });
        note(staffOwner(x.staff_id), 'breach', 'completed', 'Breach completed — ' + x.title);
        close();
        render();
        toast('Completed.');
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Complete it';
        toast('Could not complete: ' + e.message);
      }
    };
  });
}

/* =====================================================================
   Screens — labour hire firms and subcontractor companies

   The agreement and the account details live here, once per firm, and
   every one of that firm's people is judged against them.
   ===================================================================== */
function renderCompanies(view) {
  const list = DB.companies.filter(c => c.active !== false);

  view.innerHTML = `
    <div class="toolbar">
      <div class="grow"><p class="sub">The firms RCK takes people from. Each holds one
        agreement and one set of account details, shared by everyone it supplies.</p></div>
      ${canEdit() ? `<button class="btn primary" id="addCo" aria-label="Add a company">${icon('plus')}</button>` : ''}
    </div>

    ${list.length ? list.map(c => {
      const st = companyState(c);
      const n = staffOfCompany(c.id).length;
      return `<button class="option ${statusClass(st.level)}" data-co="${esc(c.id)}">
        <span class="mark" style="background:var(--s-bg);color:var(--s)">${icon('building')}</span>
        <span class="grow">
          <b>${esc(c.name)}</b>
          <span class="say">${esc(labelOf(COMPANY_KINDS, c.kind))} · ${n ? plural(n, 'person') : 'nobody on site'}</span>
        </span>
        <span class="pill ${statusClass(st.level)}">${st.level === 'green' ? 'Complete'
          : st.level === 'orange' ? 'Expiring' : 'Action'}</span>
      </button>`;
    }).join('')
      : canEdit() ? `<div class="empty"><b>No companies yet</b>
          Add the first with the + button, then link people to it on their record.</div>`
      : `<div class="empty"><b>No companies yet</b>
          This phone is in supervisor mode, which can look but not add.</div>
         <button class="btn wide" id="toSettings2">Switch this phone to Director / HR</button>`}`;

  const addCo = $('#addCo');
  if (addCo) addCo.onclick = () => editCompany(null);
  const ts2 = $('#toSettings2');
  if (ts2) ts2.onclick = () => go('#/settings');
  $$('[data-co]', view).forEach(b => { b.onclick = () => go('#/company/' + b.dataset.co); });
}

function renderCompany(view, args) {
  const co = companyById(args[0]);
  if (!co) return notFound(view, 'That company is no longer on file.');

  $('#title').textContent = co.name;
  const owner = companyOwner(co.id);
  const st = companyState(co);
  const people = staffOfCompany(co.id);
  const secs = SECTIONS.filter(s => s.owner === 'company');

  view.innerHTML = `
    <div class="card">
      <div class="row spread">
        <div class="grow">
          <h1 style="font-size:20px">${esc(co.name)}</h1>
          <p class="sub" style="margin-top:3px">${esc(labelOf(COMPANY_KINDS, co.kind))}</p>
        </div>
      </div>
      <div class="banner ${statusClass(st.level)}" style="margin:13px 0 0">${esc(st.text)}</div>
      ${co.notes ? `<p class="sub" style="margin-top:12px;white-space:pre-wrap">${esc(co.notes)}</p>` : ''}
      ${canEdit() ? `<div class="btn-row" style="margin-top:14px">
        <button class="btn sm ghost" id="edCo">Edit company</button>
      </div>` : ''}
    </div>

    <div class="sec-head"><h2>Held against the company</h2></div>
    <div class="stiles">${secs.map(s => {
      const state = sectionState(s, owner);
      return `<button class="stile ${statusClass(state.level)}" data-ct="${esc(s.key)}">
        ${state.level === 'green' ? `<span class="tick">${icon('check')}</span>` : ''}
        <span class="ico">${icon(s.icon)}</span>
        <b>${esc(s.label)}</b>
        <span class="st">${esc(state.text)}</span>
      </button>`;
    }).join('')}</div>

    <div class="sec-head"><h2>Their people</h2><span class="sub">${people.length}</span></div>
    ${people.length ? `<div class="tiles">${people.map(personTile).join('')}</div>`
      : `<div class="empty">Nobody is linked to this company yet. Set it on a person's record
         under <b>Where they sit</b>.</div>`}`;

  const edCo = $('#edCo');
  if (edCo) edCo.onclick = () => editCompany(co);
  $$('[data-ct]', view).forEach(b => { b.onclick = () => go('#/ctile/' + co.id + '/' + b.dataset.ct); });
  $$('[data-person]', view).forEach(b => { b.onclick = () => go('#/person/' + b.dataset.person); });
  wireFaces(view);
}

function editCompany(co) {
  const isNew = !co;
  const c = co || { kind: 'labour_hire' };
  sheet(`
    <h2>${isNew ? 'Add a company' : 'Edit ' + esc(c.name)}</h2>
    <p class="sub">Labour hire firms and subcontractors. The agreement and account details
      are filled in on the company's own page.</p>
    ${fieldHtml({ name: 'name', label: 'Company name', want: true }, c.name)}
    ${fieldHtml({ name: 'kind', label: 'Kind', type: 'select', options: COMPANY_KINDS, noBlank: true }, c.kind)}
    ${fieldHtml({ name: 'notes', label: 'Notes', type: 'textarea' }, c.notes)}
    <div class="btn-row">
      ${isNew ? '' : '<button class="btn danger" data-del>Delete</button>'}
      <button class="btn ghost" data-no>Cancel</button>
      <button class="btn primary" data-yes>${isNew ? 'Add' : 'Save'}</button>
    </div>`, (el, close) => {
    $('[data-no]', el).onclick = close;

    $('[data-yes]', el).onclick = async () => {
      const v = readFields(el, [{ name: 'name' }, { name: 'kind' }, { name: 'notes' }]);
      if (!v.name) return toast('The company needs a name.');
      try {
        if (isNew) {
          const saved = await Store.insert('companies', v);
          close();
          go('#/company/' + saved.id);
        } else {
          await Store.patch('companies', c.id, v);
          close();
          render();
        }
        toast('Saved.');
      } catch (e) { toast('Could not save: ' + e.message); }
    };

    const del = $('[data-del]', el);
    if (del) del.onclick = () => {
      const n = staffOfCompany(c.id).length;
      if (n) { close(); return toast(`${plural(n, 'person')} still linked to ${c.name}. Move them first.`); }
      close();
      confirmSheet('Delete ' + c.name + '?',
        'Its agreement, account details and documents go for good.', 'Delete', async () => {
        try {
          await Promise.all(filesFor(companyOwner(c.id)).map(f => Store.removeFile(f.path).catch(() => {})));
          await Store.remove('companies', c.id);
          DB.sections = DB.sections.filter(r => r.company_id !== c.id);
          DB.files = DB.files.filter(f => f.company_id !== c.id);
          toast('Deleted.');
          go('#/companies');
        } catch (e) { toast('Could not delete: ' + e.message); }
      });
    };
  });
}

/* =====================================================================
   Screen — settings
   ===================================================================== */
function renderSettings(view) {
  const mins = Number(SITE.idleLockMinutes);

  view.innerHTML = `
    <div class="card">
      <h2>This phone</h2>
      <p class="sub" style="margin-top:4px">Your name goes against anything you change, so a
        record shows who did what.</p>
      <div style="margin-top:14px">
        ${fieldHtml({ name: 'sName', label: 'Your name' }, S.name)}
        ${fieldHtml({ name: 'sRole', label: 'You are', type: 'select', noBlank: true,
                      options: ROLES.map(r => ({ key: r.key, label: r.label + ' — ' + r.blurb })) }, S.role)}
      </div>
      <button class="btn primary wide" id="saveMe">Save</button>
      <p class="sub" style="margin-top:12px">${isDirector()
        ? 'Director mode: you see pay and can change records.'
        : 'Supervisor mode: you see everything except pay, and cannot change records.'}</p>
    </div>

    <div class="card">
      <h2>Set up someone else's phone</h2>
      <p class="sub" style="margin-top:4px">Send them this link. One tap connects their phone —
        there is nothing for them to type.</p>
      <label class="field" style="margin-top:12px"><span>Setup link</span>
        <textarea id="sLink" rows="3" readonly onclick="this.select()">${esc(setupLink())}</textarea></label>
      <div class="btn-row">
        <button class="btn primary" id="copyLink">Copy the link</button>
        <button class="btn ghost" id="shareLink">Share</button>
      </div>
      <div class="banner status-orange" style="margin-top:14px">This link carries the key to the
        staff records. Treat it like a key to the office — send it person to person, and only to
        RCK people. Anyone who has it is in.</div>
    </div>

    <div class="card">
      <h2>Staff details on this device</h2>
      <p class="sub" style="margin-top:4px">Nothing is written to this phone. Staff details are
        held only while the screen is awake and are gone the moment it locks or you reload.</p>
      <div class="kv" style="margin-top:12px">
        <div><div class="k">Clears the screen after</div><div class="v small">${
          Number.isFinite(mins) && mins > 0 ? plural(mins, 'minute') + ' idle' : 'never'}</div></div>
        <div><div class="k">Version</div><div class="v small">${esc(VERSION)}</div></div>
      </div>
      <button class="btn sm ghost wide" id="lockNow" style="margin-top:12px">${icon('lock')} Clear the screen now</button>
    </div>

    <div class="card">
      <h2>Connection</h2>
      <p class="sub" style="margin-top:4px">${esc(S.supabaseUrl || 'Not set')}</p>
      <p class="sub" style="margin-top:8px">${SITE.supabaseUrl
        ? 'Set in config.js, so every phone is connected automatically.'
        : 'Entered on this phone, and kept here only — it is never on the published page.'}</p>
      ${SITE.supabaseUrl ? '' : `<button class="btn sm ghost wide" id="forget" style="margin-top:12px">Disconnect this phone</button>`}
    </div>`;

  $('#saveMe').onclick = () => {
    const name = $('[data-f="sName"]').value.trim();
    const role = $('[data-f="sRole"]').value;
    if (!name) return toast('Enter your name');
    if (!passesDirectorCheck(role)) { $('[data-f="sRole"]').value = S.role; return; }
    S.save({ name, role });
    render();
    toast('Saved.');
  };

  $('#lockNow').onclick = () => lock('Screen cleared.');

  $('#copyLink').onclick = async () => {
    const box = $('#sLink');
    try { await navigator.clipboard.writeText(setupLink()); toast('Copied. Send it to them directly.'); }
    catch (e) { box.focus(); box.select(); toast('Press and hold to copy it.'); }
  };

  $('#shareLink').onclick = async () => {
    const link = setupLink();
    if (navigator.share) {
      try { await navigator.share({ title: 'RCK People setup', text: 'Tap this to set up RCK People on your phone', url: link }); }
      catch (e) { /* they backed out of the share sheet */ }
    } else {
      try { await navigator.clipboard.writeText(link); toast('Copied.'); }
      catch (e2) { toast('Copy it from the box above.'); }
    }
  };

  const forget = $('#forget');
  if (forget) forget.onclick = () => confirmSheet('Disconnect this phone?',
    'It will need a setup link again before it can show anything.', 'Disconnect', () => {
      S.forget();
      forgetData();
      render();
      toast('Disconnected.');
    });
}

/* =====================================================================
   Printing one person's file
   ===================================================================== */
function printPersonFile(person) {
  sheet(`<h2>Print ${esc(fullName(person))}'s file</h2>
    <p class="sub">Everything on their record, ready for the printer. Choose <b>Save as PDF</b>
      in the print dialog to email or file it.</p>
    ${canSeePay() ? `<label class="na-bar" style="cursor:pointer">
      <span class="grow"><b>Include pay</b><span>Left out by default, so it can be handed to a
        supervisor as it is.</span></span>
      <span class="switch"><input type="checkbox" id="incPay"><span class="track"></span></span>
    </label>` : `<p class="sub">Pay is left out — your account does not see it.</p>`}
    <div class="btn-row"><button class="btn ghost" data-no>Cancel</button>
    <button class="btn primary" data-yes>${icon('print')} Print</button></div>`, (el, close) => {
    $('[data-no]', el).onclick = close;
    $('[data-yes]', el).onclick = () => {
      const box = $('#incPay', el);
      const pay = !!(box && box.checked);
      close();
      buildPersonDoc(person, pay);
      setTimeout(() => window.print(), 60);
    };
  });
}

function buildPersonDoc(p, includePay) {
  const c = compliance(p);
  const tiles = tilesFor(p);
  const type = WORKER_TYPES.find(w => w.key === (p.worker_type || 'rck')) || WORKER_TYPES[0];
  const firm = p.company_id ? companyById(p.company_id) : null;

  const badge = lvl => lvl === 'green' ? '<span class="badge">OK</span>'
    : lvl === 'orange' ? '<span class="badge warn">DUE</span>'
    : lvl === 'grey' ? '<span class="badge">N/A</span>'
    : '<span class="badge bad">ACTION</span>';

  const tileBlock = t => {
    const s = t.section, st = t.state, data = t.owner ? sectionData(t.owner, s.key) : {};
    const fields = (s.fields || [])
      .filter(f => !(f.sensitive && !includePay))
      .filter(f => hasValue(data[f.name]))
      .map(f => `<tr><td>${esc(f.label)}</td><td>${esc(showValue(f, data[f.name]))}</td></tr>`).join('');

    const rows = s.rows && Array.isArray(data.rows) && data.rows.length
      ? `<table><thead><tr>${s.rows.fields.map(f => `<th>${esc(f.label)}</th>`).join('')}</tr></thead>
         <tbody>${data.rows.map(r => `<tr>${s.rows.fields.map(f =>
           `<td>${esc(showValue(f, r[f.name]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : '';

    const docs = t.owner ? filesFor(t.owner, s.key) : [];

    return `<div class="avoid-break" style="margin-bottom:4mm">
      <h2>${esc(sectionLabel(s, p.worker_type))} ${badge(st.level)}</h2>
      <p style="font-size:9.5pt;margin:0 0 1.5mm">${esc(st.text)}${
        st.na && st.why ? ' — ' + esc(st.why) : ''}</p>
      ${fields ? `<table class="kvp">${fields}</table>` : ''}
      ${rows}
      ${docs.length ? `<p style="font-size:9pt;color:#444;margin-top:1mm">On file: ${
        docs.map(d => esc(d.file_name || 'document')).join(', ')}</p>` : ''}
    </div>`;
  };

  $('#printArea').innerHTML = `<div class="doc">
    <div class="doc-head">
      <div class="org">RCK — staff file</div>
      <h1>${esc(fullName(p))}</h1>
      <div style="font-size:10pt">${esc(type.label)}${firm ? ' · ' + esc(firm.name) : ''} ·
        printed ${fmtDate(today())} by ${esc(whoAmI())}</div>
    </div>

    <table class="kvp">
      <tr><td>Employee number</td><td>${esc(p.employee_no || '—')}</td></tr>
      <tr><td>Date of birth</td><td>${fmtDate(p.date_of_birth)}</td></tr>
      <tr><td>Role</td><td>${esc(p.role || '—')}</td></tr>
      <tr><td>Crew</td><td>${esc(crewLabel(p.crew) || '—')}</td></tr>
      <tr><td>Started</td><td>${fmtDate(p.start_date)}</td></tr>
      <tr><td>Time with RCK</td><td>${esc(serviceText(p.start_date, p.end_date))}</td></tr>
      <tr><td>Status</td><td>${esc(labelOf(PERSON_STATUS, p.status))}</td></tr>
      <tr><td>Phone</td><td>${esc(p.phone || '—')}</td></tr>
      <tr><td>Email</td><td>${esc(p.email || '—')}</td></tr>
      <tr><td>Compliance</td><td><b>${c.pct}%</b> — ${c.done} of ${c.total} complete${
        c.skipped ? `, ${c.skipped} not applicable` : ''}</td></tr>
    </table>

    ${tiles.map(tileBlock).join('')}

    ${includePay ? '' : `<p class="foot">Pay figures are withheld from this copy.</p>`}
    <p class="foot">RCK People · ${fmtDateTime(new Date().toISOString())}</p>
  </div>`;
}

/* =====================================================================
   Connection light
   ===================================================================== */
function paintDot() {
  const d = $('#syncDot');
  if (!d) return;
  d.className = 'dot ' + (lastError ? 'bad' : loaded ? 'ok' : 'warn');
  d.title = lastError || (loaded ? 'Connected' : 'Loading');
}

/* =====================================================================
   Starting up
   ===================================================================== */
async function boot() {
  try {
    await Store.pull();
    lastError = '';
  } catch (e) {
    lastError = e.message || 'Connection problem';
    loaded = true;      // let the interface render so the error is visible
    toast('Could not load: ' + lastError);
  }
  paintDot();
  render();
}

function start() {
  // render() starts the first load itself once the phone is connected, so
  // there is deliberately no boot() call here — two would fetch twice.
  render();

  Idle.start();
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev =>
    window.addEventListener(ev, Idle.touch, { passive: true }));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') Idle.touch();
  });
}

/* ---------------------------------------------------------- chrome --- */
window.addEventListener('hashchange', render);

window.addEventListener('scroll', () => {
  const bar = $('#topbar');
  if (bar) bar.classList.toggle('lifted', window.scrollY > 4);
}, { passive: true });

document.addEventListener('DOMContentLoaded', () => {
  $('#menuBtn').onclick = e => {
    e.stopPropagation();
    const m = $('#menu');
    m.hidden = !m.hidden;
  };
  document.addEventListener('click', e => {
    const m = $('#menu');
    if (!m.hidden && !m.contains(e.target)) m.hidden = true;
  });
  $$('#menu [data-go]').forEach(b => {
    b.onclick = () => { $('#menu').hidden = true; go(b.dataset.go); };
  });
  $('#lockBtn').onclick = () => { $('#menu').hidden = true; lock('Screen cleared.'); };

  start();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

