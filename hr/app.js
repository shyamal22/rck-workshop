/* =====================================================================
   RCK HR — staff records, licences, compliance.
   Plain JavaScript, no build step, no frameworks.

   The one rule that shapes this whole file: HR data is never written to
   the device. There is no offline cache. Everything lives in memory for
   as long as the screen is unlocked, and is thrown away on lock, sign-out
   or reload. Documents are fetched through short-lived signed links.
   ===================================================================== */
'use strict';

const VERSION = '1.0.0';
const SITE = window.RCKHR_CONFIG || {};

/* ------------------------------------------------------------- lists */
const JOB_TYPES = [
  { key: 'driver',     label: 'Driver' },
  { key: 'operator',   label: 'Operator' },
  { key: 'crew',       label: 'Crew' },
  { key: 'office',     label: 'Office' },
  { key: 'management', label: 'Management' }
];
const EMPLOYMENT_TYPES = [
  { key: 'permanent',  label: 'Permanent' },
  { key: 'fixed_term', label: 'Fixed term' },
  { key: 'casual',     label: 'Casual' },
  { key: 'contractor', label: 'Contractor' }
];
const PERSON_STATUS = [
  { key: 'active',   label: 'Active' },
  { key: 'on_leave', label: 'On leave' },
  { key: 'finished', label: 'Finished' }
];
const DOC_KINDS = [
  { key: 'contract', label: 'Employment agreement' },
  { key: 'addendum', label: 'Addendum / variation' },
  { key: 'pay',      label: 'Pay letter' },
  { key: 'licence',  label: 'Licence / certificate' },
  { key: 'medical',  label: 'Medical' },
  { key: 'id',       label: 'ID / right to work' },
  { key: 'policy',   label: 'Signed policy' },
  { key: 'other',    label: 'Other' }
];
const CRED_CATEGORIES = [
  { key: 'licence',     label: 'Licence' },
  { key: 'endorsement', label: 'Endorsement' },
  { key: 'ticket',      label: 'Ticket / certificate' },
  { key: 'medical',     label: 'Medical' },
  { key: 'employment',  label: 'Employment' },
  { key: 'other',       label: 'Other' }
];

const labelOf = (list, key) => (list.find(x => x.key === key) || {}).label || key || '—';

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
function plural(n, word) {
  return n === 1 ? `${n} ${word}` : `${n} ${PLURALS[word] || word + 's'}`;
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

function fullName(p) {
  const n = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return n || p.preferred_name || 'Unnamed';
}
function initials(p) {
  const a = (p.first_name || '').trim()[0] || '';
  const b = (p.last_name || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

/* Inline icons — no icon font, no network request. */
const ICONS = {
  print:  '<path d="M7 9V3.5h10V9"/><path d="M4 9h16v7h-3"/><path d="M7 16v4.5h10V16"/>',
  file:   '<path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5z"/><path d="M14 3.5V8h4"/>',
  link:   '<path d="M10.5 13.5a3.6 3.6 0 0 0 5.1 0l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.3"/><path d="M13.5 10.5a3.6 3.6 0 0 0-5.1 0l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.3-1.3"/>',
  plus:   '<path d="M12 5.5v13M5.5 12h13"/>',
  up:     '<path d="M12 19.5V6.5"/><path d="M7 11.5L12 6.5l5 5"/><path d="M5 20.5h14"/>',
  lock:   '<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
  people: '<circle cx="9.5" cy="8" r="3.5"/><path d="M3.5 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 6"/><path d="M18 14.9c2 .7 3.4 2.4 3.4 4.6"/>',
  eye:    '<path d="M2.5 12s3.6-6.2 9.5-6.2S21.5 12 21.5 12s-3.6 6.2-9.5 6.2S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.7"/>',
  trash:  '<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="M6.5 6.5l.9 12.2a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.2"/>',
  down:   '<path d="M12 4.5v13"/><path d="M7 12.5l5 5 5-5"/><path d="M5 20.5h14"/>',
  spin:   '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/>'
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
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ================================================================
   Connection details
   ================================================================ */
const Conn = {
  read() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('rckhr.conn') || '{}'); } catch (e) {}
    return {
      url: (SITE.supabaseUrl || saved.url || '').replace(/\/+$/, ''),
      key: SITE.supabaseKey || saved.key || ''
    };
  },
  write(url, key) {
    localStorage.setItem('rckhr.conn', JSON.stringify({ url: (url || '').replace(/\/+$/, ''), key: key || '' }));
    C = Conn.read();
  }
};
let C = Conn.read();
const configured = () => !!C.url && !!C.key;

/* ================================================================
   Sign-in

   Tokens are the only thing kept between visits. No staff data is ever
   written to the device.
   ================================================================ */
const Auth = {
  session: null,          // { access_token, refresh_token, expires_at, email }
  me: null,               // the row from hr_users

  load() {
    try { Auth.session = JSON.parse(localStorage.getItem('rckhr.session') || 'null'); }
    catch (e) { Auth.session = null; }
  },
  save() {
    if (Auth.session) localStorage.setItem('rckhr.session', JSON.stringify(Auth.session));
    else localStorage.removeItem('rckhr.session');
  },
  lastEmail() { return localStorage.getItem('rckhr.lastEmail') || ''; },

  async call(path, body, useToken) {
    const headers = { apikey: C.key, 'Content-Type': 'application/json' };
    if (useToken && Auth.session) headers.Authorization = 'Bearer ' + Auth.session.access_token;
    const res = await fetch(`${C.url}/auth/v1/${path}`, {
      method: 'POST', headers, body: JSON.stringify(body || {})
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok) {
      const msg = (data && (data.error_description || data.msg || data.message || data.error)) || res.statusText;
      throw new Error(msg);
    }
    return data;
  },

  async signIn(email, password) {
    const d = await Auth.call('token?grant_type=password', { email: email.trim(), password });
    Auth.session = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Date.now() + (d.expires_in || 3600) * 1000,
      email: (d.user && d.user.email) || email.trim(),
      user_id: d.user && d.user.id
    };
    Auth.save();
    localStorage.setItem('rckhr.lastEmail', Auth.session.email);
  },

  async refresh() {
    if (!Auth.session || !Auth.session.refresh_token) throw new Error('No session');
    const d = await Auth.call('token?grant_type=refresh_token', { refresh_token: Auth.session.refresh_token });
    Auth.session = Object.assign({}, Auth.session, {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Date.now() + (d.expires_in || 3600) * 1000
    });
    Auth.save();
  },

  /** Valid token, refreshed if it is close to running out. */
  async token() {
    if (!Auth.session) throw new Error('Not signed in');
    if (Date.now() > Auth.session.expires_at - 60000) await Auth.refresh();
    return Auth.session.access_token;
  },

  /** Confirms this account is on the hr_users guest list. */
  async loadMe() {
    const id = Auth.session && Auth.session.user_id;
    if (!id) throw new Error('No session');
    const rows = await rest(`hr_users?select=*&id=eq.${encodeURIComponent(id)}`);
    if (!rows || !rows.length) {
      const e = new Error('not-a-member');
      e.notMember = true;
      throw e;
    }
    Auth.me = rows[0];
    return Auth.me;
  },

  async resetPassword(email) {
    await Auth.call('recover', { email: email.trim() });
  },

  async changePassword(password) {
    const t = await Auth.token();
    const res = await fetch(`${C.url}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: C.key, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      let m = res.statusText;
      try { m = (await res.json()).msg || m; } catch (e) {}
      throw new Error(m);
    }
  },

  /** Clear everything held in memory and on the device. */
  wipe() {
    Auth.session = null;
    Auth.me = null;
    Auth.save();
    DB.people = []; DB.credential_types = []; DB.credentials = [];
    DB.documents = []; DB.audit = [];
  },

  async signOut() {
    try {
      const t = Auth.session && Auth.session.access_token;
      if (t) await fetch(`${C.url}/auth/v1/logout`, {
        method: 'POST', headers: { apikey: C.key, Authorization: 'Bearer ' + t }
      });
    } catch (e) { /* signing out locally matters more than telling the server */ }
    Auth.wipe();
  }
};

const signedIn = () => !!(Auth.session && Auth.me);

/* ================================================================
   Data, held in memory only
   ================================================================ */
const DB = { people: [], credential_types: [], credentials: [], documents: [], audit: [] };
let loaded = false;
let lastError = '';

async function rest(path, opts) {
  const o = opts || {};
  const t = await Auth.token();
  const headers = Object.assign({
    apikey: C.key,
    Authorization: 'Bearer ' + t
  }, o.headers || {});
  const res = await fetch(`${C.url}/rest/v1/${path}`, Object.assign({}, o, { headers }));
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
    const [people, types, creds, docs] = await Promise.all([
      rest('people?select=*&order=last_name.asc,first_name.asc'),
      rest('credential_types?select=*&order=sort.asc'),
      rest('credentials?select=*'),
      rest('documents?select=*&order=created_at.desc')
    ]);
    DB.people = people || [];
    DB.credential_types = types || [];
    DB.credentials = creds || [];
    DB.documents = docs || [];
    loaded = true;
  },

  async pullAudit(personId) {
    const q = personId ? `&person_id=eq.${encodeURIComponent(personId)}` : '';
    DB.audit = await rest(`hr_audit?select=*&order=at.desc&limit=200${q}`) || [];
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

  /* ---------------------------------------------------- documents --- */

  /** Puts a file in the private bucket and returns its storage path. */
  async upload(personId, file) {
    const t = await Auth.token();
    const clean = (file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-90);
    const path = `people/${personId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${clean}`;
    const res = await fetch(`${C.url}/storage/v1/object/hr-files/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: {
        apikey: C.key,
        Authorization: 'Bearer ' + t,
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
    const t = await Auth.token();
    const res = await fetch(
      `${C.url}/storage/v1/object/sign/hr-files/${storagePath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { apikey: C.key, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: seconds || 300 })
    });
    if (!res.ok) throw new Error('Could not open that document');
    const d = await res.json();
    return C.url + '/storage/v1' + d.signedURL;
  },

  async removeFile(storagePath) {
    const t = await Auth.token();
    await fetch(`${C.url}/storage/v1/object/hr-files/${storagePath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'DELETE', headers: { apikey: C.key, Authorization: 'Bearer ' + t }
    });
  }
};

function localName(table) {
  return table === 'hr_audit' ? 'audit' : table;
}

/** Records who changed what. Never blocks the change itself. */
function note(entity, entityId, action, summary, personId, meta) {
  const row = {
    id: uid(),
    actor: (Auth.me && Auth.me.name) || '',
    actor_email: (Auth.session && Auth.session.email) || '',
    person_id: personId || null,
    entity, entity_id: entityId || null,
    action, summary: summary || '',
    meta: meta || {}
  };
  rest('hr_audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  }).catch(() => {});
}

/* ================================================================
   The compliance engine — everything colour-coded flows from here
   ================================================================ */
const typeById   = id => DB.credential_types.find(t => t.id === id);
const personById = id => DB.people.find(p => p.id === id);
const activeTypes = () => DB.credential_types.filter(t => t.active !== false)
  .sort((a, b) => (a.sort || 0) - (b.sort || 0));
const credsFor = pid => DB.credentials.filter(c => c.person_id === pid);
const docsFor  = pid => DB.documents.filter(d => d.person_id === pid);

function warnDaysOf(type) {
  const n = Number(type.warn_days);
  return Number.isFinite(n) && n > 0 ? n : (Number(SITE.defaultWarnDays) || 60);
}
function isRequired(type, person) {
  const list = type.required_for || [];
  return Array.isArray(list) && list.indexOf(person.job_type) >= 0;
}

/**
 * How one requirement stands for one person.
 * Returns { level, text, short, days, cred, required }
 * level: green | orange | red | grey
 */
function checkOne(person, type) {
  const cred = credsFor(person.id).find(c => c.type_id === type.id);
  const required = isRequired(type, person);

  if (!cred) {
    return required
      ? { level: 'red', text: 'Missing', short: '—', days: null, cred: null, required }
      : { level: 'grey', text: 'Not held', short: '', days: null, cred: null, required };
  }
  if (!type.expires) {
    return { level: 'green', text: 'On file', short: 'OK', days: null, cred, required };
  }
  if (!cred.expires_on) {
    return { level: 'orange', text: 'No expiry recorded', short: '?', days: null, cred, required };
  }

  const days = daysFromToday(cred.expires_on);
  if (days === null) return { level: 'orange', text: 'Expiry unreadable', short: '?', days: null, cred, required };
  if (days < 0)  return { level: 'red',    text: `Expired ${plural(-days, 'day')} ago`, short: 'EXP', days, cred, required };
  if (days === 0) return { level: 'orange', text: 'Expires today',  short: '0d', days, cred, required };

  const warn = warnDaysOf(type);
  if (days <= warn) {
    return { level: 'orange', text: days === 1 ? 'Expires tomorrow' : `Expires in ${plural(days, 'day')}`,
             short: days + 'd', days, cred, required };
  }
  return { level: 'green', text: `Valid to ${fmtDate(cred.expires_on)}`, short: 'OK', days, cred, required };
}

/** Every requirement row for a person: the ones required of them, plus anything they hold. */
function checksFor(person) {
  const held = new Set(credsFor(person.id).map(c => c.type_id));
  return activeTypes()
    .filter(t => isRequired(t, person) || held.has(t.id))
    .map(t => Object.assign({ type: t }, checkOne(person, t)));
}

const RANK = { red: 3, orange: 2, green: 1, grey: 0 };

/** Overall standing of one person. */
function standing(person) {
  if (person.status === 'finished') {
    return { level: 'grey', text: 'Finished', reasons: [] };
  }
  const rows = checksFor(person);
  const bad  = rows.filter(r => r.level === 'red');
  const warn = rows.filter(r => r.level === 'orange');

  if (bad.length) {
    return {
      level: 'red',
      text: bad.length === 1 ? bad[0].type.name : `${bad.length} problems`,
      reasons: bad.map(r => `${r.type.name} — ${r.text}`)
    };
  }
  if (warn.length) {
    const soonest = warn.slice().sort((a, b) =>
      (a.days === null ? 9999 : a.days) - (b.days === null ? 9999 : b.days))[0];
    return {
      level: 'orange',
      text: warn.length === 1 ? `${soonest.type.name} — ${soonest.text.toLowerCase()}`
                              : `${warn.length} expiring soon`,
      reasons: warn.map(r => `${r.type.name} — ${r.text}`)
    };
  }
  return { level: 'green', text: 'All current', reasons: [] };
}

const onBooks = () => DB.people.filter(p => p.status !== 'finished');

/** Flat list of every requirement row that needs attention, worst first. */
function attention() {
  const out = [];
  onBooks().forEach(p => {
    checksFor(p).forEach(r => {
      if (r.level === 'red' || r.level === 'orange') out.push(Object.assign({ person: p }, r));
    });
  });
  return out.sort((a, b) => {
    const d = RANK[b.level] - RANK[a.level];
    if (d) return d;
    const ad = a.days === null ? 99999 : a.days;
    const bd = b.days === null ? 99999 : b.days;
    return ad - bd;
  });
}

function tallies() {
  const t = { green: 0, orange: 0, red: 0 };
  onBooks().forEach(p => { t[standing(p).level]++; });
  return t;
}

/* ================================================================
   Routing
   ================================================================ */
function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean);
  return { path: parts[0] || '', arg: parts[1] ? decodeURIComponent(parts[1]) : '' };
}
function go(hash) { location.hash = hash; }

const SCREENS = {
  '':             { title: 'Compliance',  render: renderDash,     tab: 'dash' },
  'people':       { title: 'Staff',       render: renderPeople,   tab: 'people' },
  'person':       { title: 'Staff file',  render: renderPerson,   back: '#/people' },
  'edit':         { title: 'Details',     render: renderPersonEdit, back: true },
  'expiring':     { title: 'Expiring',    render: renderExpiring, back: '#/' },
  'matrix':       { title: 'Licence matrix', render: renderMatrix, back: '#/' },
  'reports':      { title: 'Reports',     render: renderReports,  back: '#/' },
  'requirements': { title: 'Requirements', render: renderRequirements, back: '#/' },
  'import':       { title: 'Import',      render: renderImport,   back: '#/' },
  'settings':     { title: 'Settings',    render: renderSettings, back: '#/' }
};

const scrollMemory = {};
let currentPath = null;

function render() {
  const { path, arg } = parseHash();
  const view = $('#view');

  if (currentPath !== null) scrollMemory[currentPath] = window.scrollY;

  // Not ready to show anything private yet.
  if (!configured())  return renderNeedsConfig(view);
  if (!signedIn())    return renderGate(view);

  $('#topbar').hidden = false;
  $('#tabbar').hidden = false;
  document.body.classList.remove('no-tabs');

  const screen = SCREENS[path] || SCREENS[''];
  $('#title').textContent = screen.title;

  const back = $('#backBtn');
  back.hidden = !screen.back;
  back.onclick = () => {
    if (screen.back === true) history.back();
    else go(screen.back);
  };

  $$('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === screen.tab));

  view.className = '';
  void view.offsetWidth;
  view.classList.add('enter');

  if (!loaded) {
    view.innerHTML = `<div class="empty"><b>Loading</b>One moment.</div>`;
    boot();
    return;
  }

  screen.render(view, arg);
  currentPath = path + '/' + arg;
  const y = scrollMemory[currentPath];
  requestAnimationFrame(() => window.scrollTo(0, y || 0));
}

/* ================================================================
   Sign-in screen
   ================================================================ */
function renderNeedsConfig(view) {
  $('#topbar').hidden = true;
  $('#tabbar').hidden = true;
  document.body.classList.add('no-tabs');
  view.innerHTML = `
    <div class="gate"><div class="gate-card">
      <div class="gate-mark">${icon('lock')}</div>
      <h1>Not connected yet</h1>
      <p class="lede">This app needs the Supabase project details before anyone can sign in.
        Put them in <b>config.js</b>, or enter them here for this device.</p>
      <label class="field"><span>Project URL</span>
        <input type="text" id="cfgUrl" placeholder="https://abcdefgh.supabase.co" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>Anon public key</span>
        <input type="text" id="cfgKey" placeholder="eyJhbGciOi…" autocapitalize="off" spellcheck="false"></label>
      <button class="btn primary wide" id="cfgSave">Save and continue</button>
      <p class="foot">Use the <b>anon public</b> key from Supabase → Settings → API.
        Never the service_role key.</p>
    </div></div>`;

  $('#cfgSave').onclick = () => {
    const url = $('#cfgUrl').value.trim(), key = $('#cfgKey').value.trim();
    if (!url || !key) return toast('Both the URL and the key are needed.');
    Conn.write(url, key);
    render();
  };
}

let gateMode = 'signin';   // signin | reset

function renderGate(view) {
  $('#topbar').hidden = true;
  $('#tabbar').hidden = true;
  $('#menu').hidden = true;
  document.body.classList.add('no-tabs');

  const email = Auth.lastEmail();
  const reset = gateMode === 'reset';

  view.innerHTML = `
    <div class="gate"><div class="gate-card">
      <div class="gate-mark">${icon('people')}</div>
      <h1>RCK HR</h1>
      <p class="lede">${reset
        ? 'Enter your email and we will send you a link to set a new password.'
        : 'Staff records, licences and compliance. Sign in with your RCK HR account.'}</p>

      <label class="field"><span>Email</span>
        <input type="email" id="gEmail" value="${esc(email)}" autocomplete="username"
               autocapitalize="off" spellcheck="false" placeholder="you@rcknz.co.nz"></label>

      ${reset ? '' : `
      <label class="field"><span>Password</span>
        <input type="password" id="gPass" autocomplete="current-password" placeholder="••••••••"></label>`}

      <button class="btn primary wide" id="gGo">${reset ? 'Send reset link' : 'Sign in'}</button>
      <div id="gErr"></div>

      <div class="center" style="margin-top:14px">
        <button class="linkbtn" id="gSwap">${reset ? 'Back to sign in' : 'Forgotten your password?'}</button>
      </div>

      <p class="foot">Accounts are created by whoever administers the Supabase project.
        Only accounts on the HR list can open any staff data.</p>
    </div></div>`;

  const err = m => { $('#gErr').innerHTML = `<div class="banner status-red" style="margin-top:12px">${esc(m)}</div>`; };

  $('#gSwap').onclick = () => { gateMode = reset ? 'signin' : 'reset'; render(); };

  const submit = async () => {
    const btn = $('#gGo');
    const emailV = $('#gEmail').value.trim();
    if (!emailV) return err('Enter your email address.');

    btn.disabled = true;
    btn.textContent = reset ? 'Sending…' : 'Signing in…';
    try {
      if (reset) {
        await Auth.resetPassword(emailV);
        $('#gErr').innerHTML = `<div class="banner status-green" style="margin-top:12px">
          If that address has an account, a reset link is on its way.</div>`;
        btn.textContent = 'Send reset link';
        btn.disabled = false;
        return;
      }
      const pass = $('#gPass').value;
      if (!pass) { btn.disabled = false; btn.textContent = 'Sign in'; return err('Enter your password.'); }

      await Auth.signIn(emailV, pass);
      await Auth.loadMe();
      Idle.touch();
      loaded = false;
      go('#/');
      render();
    } catch (e) {
      Auth.wipe();
      btn.disabled = false;
      btn.textContent = reset ? 'Send reset link' : 'Sign in';
      if (e.notMember) {
        err('That account exists but is not on the HR list. Ask whoever set this up to add you.');
      } else if (/invalid login/i.test(e.message)) {
        err('Wrong email or password.');
      } else if (/email not confirmed/i.test(e.message)) {
        err('That account has not been confirmed yet. Check your email for the invitation.');
      } else {
        err(e.message || 'Could not sign in.');
      }
    }
  };

  $('#gGo').onclick = submit;
  view.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  setTimeout(() => { const f = email ? $('#gPass') : $('#gEmail'); if (f) f.focus(); }, 60);
}

/* ================================================================
   Idle lock — an open laptop should not leave staff files on screen
   ================================================================ */
const Idle = {
  last: Date.now(),
  timer: null,
  touch() { Idle.last = Date.now(); },
  start() {
    clearInterval(Idle.timer);
    Idle.timer = setInterval(() => {
      const mins = Number(SITE.idleLockMinutes);
      if (!Number.isFinite(mins) || mins <= 0) return;
      if (!signedIn()) return;
      if (Date.now() - Idle.last > mins * 60000) lock('Locked after ' + plural(mins, 'minute') + ' idle.');
    }, 20000);
  }
};

function lock(why) {
  Auth.wipe();
  loaded = false;
  gateMode = 'signin';
  render();
  if (why) toast(why);
}

/* ================================================================
   Shared bits of interface
   ================================================================ */
function statusClass(level) { return 'status-' + (level === 'grey' ? 'grey' : level); }

function personRow(p) {
  const st = standing(p);
  const bits = [labelOf(JOB_TYPES, p.job_type)];
  if (p.crew) bits.push(p.crew);
  if (p.status === 'on_leave') bits.push('On leave');
  if (p.status === 'finished') bits.push('Finished');
  return `<button class="person ${statusClass(st.level)}" data-person="${esc(p.id)}">
    <span class="avatar">${esc(initials(p))}</span>
    <span class="grow">
      <span class="who">${esc(fullName(p))}</span>
      <span class="meta ellip">${esc(bits.join(' · '))}${p.position ? ' · ' + esc(p.position) : ''}</span>
      ${st.level !== 'green' && st.level !== 'grey' ? `<span class="why ellip">${esc(st.text)}</span>` : ''}
    </span>
    <span class="pill">${st.level === 'green' ? 'Current' : st.level === 'grey' ? 'Finished'
      : st.level === 'orange' ? 'Due soon' : 'Action'}</span>
  </button>`;
}

function wirePeople(root) {
  $$('[data-person]', root).forEach(el => {
    el.onclick = () => go('#/person/' + el.dataset.person);
  });
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

function field(label, name, value, type, opts) {
  const o = opts || {};
  if (type === 'select') {
    return `<label class="field"><span>${esc(label)}</span><select name="${name}">
      ${o.options.map(x => `<option value="${esc(x.key)}"${x.key === value ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}
    </select></label>`;
  }
  if (type === 'textarea') {
    return `<label class="field"><span>${esc(label)}</span><textarea name="${name}" placeholder="${esc(o.placeholder || '')}"
      ${o.rows ? `rows="${o.rows}"` : ''}>${esc(value || '')}</textarea></label>`;
  }
  return `<label class="field"><span>${esc(label)}</span>
    <input type="${type || 'text'}" name="${name}" value="${esc(value == null ? '' : value)}"
      placeholder="${esc(o.placeholder || '')}"${o.step ? ` step="${o.step}"` : ''}
      ${o.plain ? 'autocapitalize="off" spellcheck="false"' : ''}></label>`;
}

function readForm(root) {
  const out = {};
  $$('input[name], select[name], textarea[name]', root).forEach(el => {
    out[el.name] = el.value.trim();
  });
  return out;
}

/* ================================================================
   Screen — compliance dashboard
   ================================================================ */
function renderDash(view) {
  const t = tallies();
  const rows = attention();
  const expired = rows.filter(r => r.level === 'red');
  const soon    = rows.filter(r => r.level === 'orange');
  const total   = onBooks().length;

  if (!DB.people.length) {
    view.innerHTML = `
      <div class="empty">
        <b>No staff on file yet</b>
        Add your first person, or bring the whole list in from a spreadsheet.
      </div>
      <div class="btn-row">
        <button class="btn primary" data-go="#/person/new">${icon('plus')} Add someone</button>
        <button class="btn" data-go="#/import">${icon('up')} Import a spreadsheet</button>
      </div>`;
    wireGo(view);
    return;
  }

  view.innerHTML = `
    <div class="tally">
      <button class="status-green"  data-filter="green"><span class="n">${t.green}</span><span class="l">All current</span></button>
      <button class="status-orange" data-filter="orange"><span class="n">${t.orange}</span><span class="l">Due soon</span></button>
      <button class="status-red"    data-filter="red"><span class="n">${t.red}</span><span class="l">Action needed</span></button>
    </div>

    <p class="small muted mb">${plural(total, 'person')} on the books${
      DB.people.length - total ? ` · ${DB.people.length - total} finished` : ''}.</p>

    ${expired.length ? `
      <div class="section-title">Expired or missing — ${expired.length}</div>
      ${expired.slice(0, 14).map(attentionRow).join('')}
      ${expired.length > 14 ? `<button class="btn wide sm" data-go="#/expiring">See all ${expired.length}</button>` : ''}
    ` : `<div class="banner status-green">Nothing expired and nothing missing.</div>`}

    ${soon.length ? `
      <div class="section-title">Expiring soon — ${soon.length}</div>
      ${soon.slice(0, 10).map(attentionRow).join('')}
      ${soon.length > 10 ? `<button class="btn wide sm" data-go="#/expiring">See all ${soon.length}</button>` : ''}
    ` : ''}

    <div class="section-title">Quick moves</div>
    <div class="btn-row">
      <button class="btn" data-go="#/expiring">${icon('file')} Expiring</button>
      <button class="btn" data-go="#/matrix">${icon('people')} Licence matrix</button>
      <button class="btn" data-go="#/reports">${icon('print')} Reports</button>
    </div>`;

  $$('[data-filter]', view).forEach(b => {
    b.onclick = () => { peopleFilter.level = b.dataset.filter; go('#/people'); };
  });
  wireGo(view);
  wireAttention(view);
}

function attentionRow(r) {
  return `<button class="cred ${statusClass(r.level)}" data-person="${esc(r.person.id)}">
    <span class="grow">
      <span class="nm ellip">${esc(fullName(r.person))}</span>
      <span class="dt ellip">${esc(r.type.name)}${r.cred && r.cred.detail ? ' · ' + esc(r.cred.detail) : ''}</span>
    </span>
    <span class="st">${esc(r.text)}${r.cred && r.cred.expires_on
      ? `<br><span class="muted" style="font-weight:500">${esc(fmtDate(r.cred.expires_on))}</span>` : ''}</span>
  </button>`;
}
function wireAttention(root) { wirePeople(root); }

function wireGo(root) {
  $$('[data-go]', root).forEach(b => { b.onclick = () => go(b.dataset.go); });
}

/* ================================================================
   Screen — staff list
   ================================================================ */
const peopleFilter = { level: 'all', job: 'all', q: '', showFinished: false };

function renderPeople(view) {
  const f = peopleFilter;

  let list = DB.people.filter(p => f.showFinished ? true : p.status !== 'finished');
  if (f.job !== 'all') list = list.filter(p => p.job_type === f.job);
  if (f.level !== 'all') list = list.filter(p => standing(p).level === f.level);
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(p => (
      fullName(p) + ' ' + p.employee_no + ' ' + p.position + ' ' + p.crew + ' ' + p.email
    ).toLowerCase().includes(q));
  }

  const chip = (val, key, label) =>
    `<button class="chip" data-set="${key}" data-val="${esc(val)}" aria-pressed="${f[key] === val}">${esc(label)}</button>`;

  view.innerHTML = `
    <label class="field"><input type="search" id="pq" value="${esc(f.q)}"
      placeholder="Search name, employee number, crew…"></label>

    <div class="filters">
      ${chip('all', 'level', 'Everyone')}
      ${chip('red', 'level', 'Action needed')}
      ${chip('orange', 'level', 'Due soon')}
      ${chip('green', 'level', 'All current')}
    </div>
    <div class="filters">
      ${chip('all', 'job', 'All roles')}
      ${JOB_TYPES.map(j => chip(j.key, 'job', j.label)).join('')}
    </div>

    <p class="small muted mb">${plural(list.length, 'person')}</p>
    ${list.length ? list.map(personRow).join('')
      : `<div class="empty"><b>Nobody matches</b>Try clearing the filters.</div>`}

    <div class="btn-row mt">
      <button class="btn primary" data-go="#/person/new">${icon('plus')} Add someone</button>
      <button class="btn ghost" id="togFin">${f.showFinished ? 'Hide' : 'Show'} finished staff</button>
    </div>`;

  $$('[data-set]', view).forEach(b => {
    b.onclick = () => { f[b.dataset.set] = b.dataset.val; render(); };
  });
  $('#togFin').onclick = () => { f.showFinished = !f.showFinished; render(); };

  const q = $('#pq');
  q.oninput = () => {
    f.q = q.value;
    const pos = q.selectionStart;
    render();
    const nq = $('#pq');
    if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
  };

  wirePeople(view);
  wireGo(view);
}

/* ================================================================
   Screen — one person's file
   ================================================================ */
let payShown = false;

function renderPerson(view, id) {
  if (id === 'new') return renderPersonEdit(view, 'new');
  const p = personById(id);
  if (!p) {
    view.innerHTML = `<div class="empty"><b>Not found</b>That person is no longer on file.</div>`;
    return;
  }

  const st = standing(p);
  const rows = checksFor(p);
  const docs = docsFor(p.id);

  view.innerHTML = `
    <div class="card accent ${statusClass(st.level)}">
      <div class="row spread">
        <div class="grow">
          <h2 style="font-size:19px">${esc(fullName(p))}</h2>
          <div class="small muted">${esc([labelOf(JOB_TYPES, p.job_type), p.position, p.crew]
            .filter(Boolean).join(' · '))}</div>
        </div>
        <span class="pill">${st.level === 'green' ? 'All current' : st.level === 'grey' ? 'Finished'
          : st.level === 'orange' ? 'Due soon' : 'Action needed'}</span>
      </div>
      ${st.level === 'orange' || st.level === 'red' ? `<div class="small" style="color:var(--s);
        font-weight:600;margin-top:9px">${esc(st.text)}</div>` : ''}
      <div class="row wrap small muted" style="margin-top:11px; gap:14px">
        ${p.employee_no ? `<span>No. ${esc(p.employee_no)}</span>` : ''}
        <span>${esc(labelOf(EMPLOYMENT_TYPES, p.employment_type))}</span>
        ${p.start_date ? `<span>Started ${esc(fmtDate(p.start_date))} · ${esc(serviceText(p.start_date, p.end_date))}</span>` : ''}
        ${p.status !== 'active' ? `<span>${esc(labelOf(PERSON_STATUS, p.status))}</span>` : ''}
      </div>
    </div>

    <div class="btn-row mb">
      ${p.sharepoint_url ? `<a class="btn" href="${esc(p.sharepoint_url)}" target="_blank" rel="noopener">${icon('link')} SharePoint folder</a>` : ''}
      <button class="btn" id="printFile">${icon('print')} Print file</button>
      <button class="btn ghost" data-go="#/edit/${esc(p.id)}">Edit details</button>
    </div>

    <div class="section-title">Compliance</div>
    ${rows.length ? rows.map(r => `
      <button class="cred ${statusClass(r.level)}${r.cred ? '' : ' missing'}" data-cred="${esc(r.type.id)}">
        <span class="grow">
          <span class="nm">${esc(r.type.name)}${r.required ? '' : ' <span class="muted tiny">(extra)</span>'}</span>
          <span class="dt">${r.cred
            ? esc([r.cred.detail, r.cred.reference ? 'No. ' + r.cred.reference : '',
                   // green already reads "Valid to <date>" on the right, so don't repeat it
                   r.cred.expires_on && r.level !== 'green' ? 'Expires ' + fmtDate(r.cred.expires_on) : ''
                  ].filter(Boolean).join(' · ')) || 'On file'
            : 'Required for ' + esc(labelOf(JOB_TYPES, p.job_type).toLowerCase()) + 's — not recorded'}</span>
        </span>
        <span class="st">${esc(r.text)}</span>
      </button>`).join('')
      : `<div class="banner info">No requirements apply to this role yet. Set them under ⋮ → Requirements.</div>`}

    <button class="btn ghost wide sm mb" id="addCred">${icon('plus')} Record a licence or ticket</button>

    <div class="section-title">Documents — ${docs.length}</div>
    ${docs.length ? docs.map(d => `
      <button class="attach" data-doc="${esc(d.id)}">
        ${icon(d.source === 'sharepoint' ? 'link' : 'file')}
        <span class="grow">
          <span class="ellip">${esc(d.title || d.file_name || 'Document')}</span>
          <span class="sub ellip">${esc([labelOf(DOC_KINDS, d.kind),
            d.doc_date ? fmtDate(d.doc_date) : '',
            d.source === 'sharepoint' ? 'In SharePoint' : 'Uploaded'].filter(Boolean).join(' · '))}</span>
        </span>
      </button>`).join('')
      : `<p class="small muted">Nothing on file yet.</p>`}

    <div class="btn-row mt mb">
      <button class="btn ghost sm" id="addUpload">${icon('up')} Upload a document</button>
      <button class="btn ghost sm" id="addLink">${icon('link')} Link one in SharePoint</button>
    </div>

    <div class="section-title">Details</div>
    <div class="card">
      ${kv('Phone', p.phone)}
      ${kv('Email', p.email)}
      ${kv('Address', p.address)}
      ${kv('Date of birth', p.date_of_birth ? fmtDate(p.date_of_birth) : '')}
      ${kv('Emergency contact', [p.emergency_name, p.emergency_relationship, p.emergency_phone].filter(Boolean).join(' · '))}
      ${p.end_date ? kv('Finished', fmtDate(p.end_date)) : ''}
      ${p.notes ? `<div style="margin-top:10px" class="small"><b>Notes</b><div class="muted" style="white-space:pre-wrap">${esc(p.notes)}</div></div>` : ''}
    </div>

    <div class="section-title">Pay</div>
    <div class="card">
      ${payShown ? `
        ${kv('Rate', p.pay_rate ? `$${Number(p.pay_rate).toFixed(2)} ${p.pay_type === 'salary' ? 'per year' : 'per hour'}` : '')}
        ${kv('Last reviewed', p.pay_reviewed_on ? fmtDate(p.pay_reviewed_on) : '')}
        ${p.pay_notes ? `<div class="small muted" style="white-space:pre-wrap;margin-top:8px">${esc(p.pay_notes)}</div>` : ''}
        <button class="btn ghost sm mt" id="hidePay">Hide</button>`
      : `<p class="small muted" style="margin:0 0 10px">Hidden so it isn't on screen by accident.</p>
         <button class="btn ghost sm" id="showPay">${icon('eye')} Show pay</button>`}
    </div>

    <div class="section-title">History</div>
    <div id="auditBox"><p class="small muted">Loading…</p></div>`;

  $('#printFile').onclick = () => printStaffFile(p);
  $('#addCred').onclick = () => credSheet(p, null);
  $('#addUpload').onclick = () => uploadSheet(p);
  $('#addLink').onclick = () => linkSheet(p);
  const sp = $('#showPay'); if (sp) sp.onclick = () => { payShown = true; render(); };
  const hp = $('#hidePay'); if (hp) hp.onclick = () => { payShown = false; render(); };

  $$('[data-cred]', view).forEach(b => {
    b.onclick = () => credSheet(p, typeById(b.dataset.cred));
  });
  $$('[data-doc]', view).forEach(b => {
    b.onclick = () => docSheet(DB.documents.find(d => d.id === b.dataset.doc), p);
  });
  wireGo(view);

  Store.pullAudit(p.id).then(rowsA => {
    const box = $('#auditBox');
    if (!box) return;
    box.innerHTML = rowsA.length
      ? rowsA.slice(0, 25).map(a => `<div class="small" style="padding:7px 0;border-bottom:1px solid var(--line)">
          <div>${esc(a.summary)}</div>
          <div class="tiny muted">${esc(a.actor || a.actor_email)} · ${esc(fmtDateTime(a.at))}</div>
        </div>`).join('')
      : `<p class="small muted">Nothing recorded yet.</p>`;
  }).catch(() => {
    const box = $('#auditBox');
    if (box) box.innerHTML = `<p class="small muted">History unavailable.</p>`;
  });
}

function kv(label, value) {
  if (!value) return '';
  return `<div class="row spread small" style="padding:5px 0">
    <span class="muted">${esc(label)}</span><span style="text-align:right">${esc(value)}</span></div>`;
}

/* -------------------------------------------------- add / edit person */
function renderPersonEdit(view, id) {
  const isNew = id === 'new' || !id;
  const p = isNew ? {
    job_type: 'crew', employment_type: 'permanent', status: 'active', pay_type: 'hourly'
  } : personById(id);

  if (!p) { view.innerHTML = `<div class="empty"><b>Not found</b></div>`; return; }
  $('#title').textContent = isNew ? 'Add someone' : 'Edit details';

  view.innerHTML = `
    <form id="pf">
      <div class="section-title">Who they are</div>
      <div class="card">
        <div class="fields2">
          ${field('First name', 'first_name', p.first_name)}
          ${field('Last name', 'last_name', p.last_name)}
          ${field('Employee number', 'employee_no', p.employee_no)}
          ${field('Date of birth', 'date_of_birth', p.date_of_birth, 'date')}
        </div>
      </div>

      <div class="section-title">The job</div>
      <div class="card">
        <div class="fields2">
          ${field('Role type', 'job_type', p.job_type, 'select', { options: JOB_TYPES })}
          ${field('Job title', 'position', p.position, 'text', { placeholder: 'Paver operator' })}
          ${field('Crew / depot', 'crew', p.crew)}
          ${field('Employment type', 'employment_type', p.employment_type, 'select', { options: EMPLOYMENT_TYPES })}
          ${field('Started', 'start_date', p.start_date, 'date')}
          ${field('Status', 'status', p.status, 'select', { options: PERSON_STATUS })}
          ${field('Finished on', 'end_date', p.end_date, 'date')}
        </div>
        <p class="tiny muted">Role type decides which licences and tickets are required of this person.</p>
      </div>

      <div class="section-title">Contact</div>
      <div class="card">
        <div class="fields2">
          ${field('Phone', 'phone', p.phone, 'tel')}
          ${field('Email', 'email', p.email, 'email', { plain: true })}
        </div>
        ${field('Address', 'address', p.address)}
        <div class="fields2">
          ${field('Emergency contact', 'emergency_name', p.emergency_name)}
          ${field('Relationship', 'emergency_relationship', p.emergency_relationship)}
          ${field('Emergency phone', 'emergency_phone', p.emergency_phone, 'tel')}
        </div>
      </div>

      <div class="section-title">Pay</div>
      <div class="card">
        <div class="fields2">
          ${field('Paid', 'pay_type', p.pay_type, 'select', {
            options: [{ key: 'hourly', label: 'Hourly' }, { key: 'salary', label: 'Salary' }] })}
          ${field('Rate (NZD)', 'pay_rate', p.pay_rate, 'number', { step: '0.01' })}
          ${field('Last reviewed', 'pay_reviewed_on', p.pay_reviewed_on, 'date')}
        </div>
        ${field('Pay notes', 'pay_notes', p.pay_notes, 'textarea', { rows: 2 })}
        <p class="tiny muted">Bank accounts and IRD numbers are deliberately not stored here — leave those in payroll.</p>
      </div>

      <div class="section-title">Their file</div>
      <div class="card">
        ${field('SharePoint folder link', 'sharepoint_url', p.sharepoint_url, 'text',
          { placeholder: 'https://rcknz.sharepoint.com/…', plain: true })}
        <p class="tiny muted" style="margin-top:-8px">Paste the link to this person's folder and it becomes a
          one-tap button on their file.</p>
        ${field('Notes', 'notes', p.notes, 'textarea')}
      </div>

      <div class="btn-row">
        <button type="button" class="btn ghost" id="cancel">Cancel</button>
        <button type="submit" class="btn primary" id="save">${isNew ? 'Add to staff' : 'Save changes'}</button>
      </div>
      ${isNew ? '' : `<button type="button" class="btn danger wide mt" id="del">${icon('trash')} Remove from staff</button>`}
    </form>`;

  $('#cancel').onclick = () => history.back();

  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#save');
    const data = readForm(view);

    if (!data.first_name && !data.last_name) return toast('A name is needed.');

    // Empty date and number fields must go to the database as null, not "".
    ['date_of_birth', 'start_date', 'end_date', 'pay_reviewed_on'].forEach(k => { if (!data[k]) data[k] = null; });
    data.pay_rate = data.pay_rate === '' ? null : Number(data.pay_rate);

    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      if (isNew) {
        const saved = await Store.insert('people', data);
        note('person', saved.id, 'added', `Added ${fullName(saved)} to staff`, saved.id);
        toast('Added.');
        go('#/person/' + saved.id);
      } else {
        await Store.patch('people', p.id, data);
        note('person', p.id, 'changed', `Updated details for ${fullName(data)}`, p.id);
        toast('Saved.');
        history.back();
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = isNew ? 'Add to staff' : 'Save changes';
      toast('Could not save: ' + err.message);
    }
  };

  const del = $('#del');
  if (del) del.onclick = () => confirmSheet(
    'Remove ' + fullName(p) + '?',
    'Their licences and documents go too, and it cannot be undone. If they have simply left, set their status to Finished instead — that keeps the record.',
    'Remove permanently',
    async () => {
      try {
        for (const d of docsFor(p.id)) if (d.storage_path) await Store.removeFile(d.storage_path);
        note('person', p.id, 'removed', `Removed ${fullName(p)} from staff`, null);
        await Store.remove('people', p.id);
        toast('Removed.');
        go('#/people');
      } catch (err) { toast('Could not remove: ' + err.message); }
    });
}

/* ================================================================
   Recording a licence, ticket or certificate
   ================================================================ */
function credSheet(person, type) {
  const types = activeTypes();
  const existing = type ? credsFor(person.id).find(c => c.type_id === type.id) : null;
  const startType = type || types[0];
  if (!startType) return toast('Set up some requirements first.');

  sheet(`
    <h2>${esc(existing ? startType.name : 'Record a licence or ticket')}</h2>
    <p class="sub">${esc(fullName(person))}</p>
    <form id="cf">
      ${existing || type ? `<input type="hidden" name="type_id" value="${esc(startType.id)}">`
        : `<label class="field"><span>What is it</span><select name="type_id">
            ${types.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
          </select></label>`}
      <div class="fields2">
        ${field(startType.detail_label || 'Detail', 'detail', existing && existing.detail, 'text',
          { placeholder: startType.detail_label ? 'e.g. 2, 4, 5' : 'optional' })}
        ${field('Number', 'reference', existing && existing.reference, 'text', { plain: true })}
        ${field('Issued', 'issued_on', existing && existing.issued_on, 'date')}
        ${startType.expires ? field('Expires', 'expires_on', existing && existing.expires_on, 'date') : ''}
      </div>
      ${field('Notes', 'notes', existing && existing.notes, 'textarea', { rows: 2 })}
      <div class="btn-row">
        <button type="button" class="btn ghost" data-no>Cancel</button>
        <button type="submit" class="btn primary">${existing ? 'Save' : 'Record it'}</button>
      </div>
      ${existing ? `<button type="button" class="btn danger wide mt sm" data-del>Remove this record</button>` : ''}
    </form>`, (el, close) => {

    $('[data-no]', el).onclick = close;

    $('#cf', el).onsubmit = async e => {
      e.preventDefault();
      const data = readForm(el);
      data.person_id = person.id;
      data.type_id = data.type_id || startType.id;
      if (!data.issued_on) data.issued_on = null;
      if (!data.expires_on) data.expires_on = null;

      const t = typeById(data.type_id) || startType;
      try {
        if (existing) {
          await Store.patch('credentials', existing.id, data);
          note('credential', existing.id, 'changed',
            `${t.name} updated for ${fullName(person)}${data.expires_on ? ' — expires ' + fmtDate(data.expires_on) : ''}`,
            person.id);
        } else {
          const saved = await Store.insert('credentials', data);
          note('credential', saved.id, 'added',
            `${t.name} recorded for ${fullName(person)}${data.expires_on ? ' — expires ' + fmtDate(data.expires_on) : ''}`,
            person.id);
        }
        close();
        toast('Saved.');
        render();
      } catch (err) { toast('Could not save: ' + err.message); }
    };

    const d = $('[data-del]', el);
    if (d) d.onclick = () => {
      close();
      confirmSheet('Remove this record?', `${startType.name} for ${fullName(person)}.`, 'Remove', async () => {
        try {
          await Store.remove('credentials', existing.id);
          note('credential', existing.id, 'removed', `${startType.name} removed for ${fullName(person)}`, person.id);
          toast('Removed.');
          render();
        } catch (err) { toast('Could not remove: ' + err.message); }
      });
    };
  });
}

/* ================================================================
   Documents
   ================================================================ */
function uploadSheet(person) {
  sheet(`
    <h2>Upload a document</h2>
    <p class="sub">${esc(fullName(person))} · stored privately, not in SharePoint</p>
    <form id="uf">
      ${field('What it is', 'kind', 'contract', 'select', { options: DOC_KINDS })}
      ${field('Title', 'title', '', 'text', { placeholder: 'Employment agreement 2026' })}
      ${field('Date on the document', 'doc_date', '', 'date')}
      <label class="field"><span>File</span>
        <input type="file" name="file" id="uFile" style="padding:11px"></label>
      <div class="btn-row">
        <button type="button" class="btn ghost" data-no>Cancel</button>
        <button type="submit" class="btn primary" id="uGo">Upload</button>
      </div>
    </form>`, (el, close) => {

    $('[data-no]', el).onclick = close;

    $('#uf', el).onsubmit = async e => {
      e.preventDefault();
      const file = $('#uFile', el).files[0];
      if (!file) return toast('Choose a file first.');
      if (file.size > 40 * 1024 * 1024) return toast('That file is over 40 MB. Link it in SharePoint instead.');

      const data = readForm(el);
      const btn = $('#uGo', el);
      btn.disabled = true;
      btn.textContent = 'Uploading…';
      try {
        const path = await Store.upload(person.id, file);
        const saved = await Store.insert('documents', {
          person_id: person.id,
          kind: data.kind,
          title: data.title || file.name,
          doc_date: data.doc_date || null,
          source: 'upload',
          storage_path: path,
          file_name: file.name,
          file_type: file.type || '',
          file_size: file.size,
          added_by: (Auth.me && Auth.me.name) || (Auth.session && Auth.session.email) || ''
        });
        note('document', saved.id, 'added',
          `${labelOf(DOC_KINDS, saved.kind)} uploaded for ${fullName(person)}: ${saved.title}`, person.id);
        close();
        toast('Uploaded.');
        render();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Upload';
        toast('Upload failed: ' + err.message);
      }
    };
  });
}

function linkSheet(person) {
  sheet(`
    <h2>Link a SharePoint document</h2>
    <p class="sub">${esc(fullName(person))} · the file stays where it is</p>
    <form id="lf">
      ${field('What it is', 'kind', 'contract', 'select', { options: DOC_KINDS })}
      ${field('Title', 'title', '', 'text', { placeholder: 'Employment agreement 2026' })}
      ${field('Date on the document', 'doc_date', '', 'date')}
      ${field('Link', 'url', '', 'text', { placeholder: 'https://rcknz.sharepoint.com/…', plain: true })}
      <div class="btn-row">
        <button type="button" class="btn ghost" data-no>Cancel</button>
        <button type="submit" class="btn primary">Add link</button>
      </div>
    </form>`, (el, close) => {

    $('[data-no]', el).onclick = close;

    $('#lf', el).onsubmit = async e => {
      e.preventDefault();
      const data = readForm(el);
      if (!data.url) return toast('Paste the link first.');
      try {
        const saved = await Store.insert('documents', {
          person_id: person.id,
          kind: data.kind,
          title: data.title || 'SharePoint document',
          doc_date: data.doc_date || null,
          source: 'sharepoint',
          url: data.url,
          added_by: (Auth.me && Auth.me.name) || (Auth.session && Auth.session.email) || ''
        });
        note('document', saved.id, 'added',
          `${labelOf(DOC_KINDS, saved.kind)} linked for ${fullName(person)}: ${saved.title}`, person.id);
        close();
        toast('Linked.');
        render();
      } catch (err) { toast('Could not save: ' + err.message); }
    };
  });
}

function docSheet(doc, person) {
  if (!doc) return;
  sheet(`
    <h2>${esc(doc.title || doc.file_name || 'Document')}</h2>
    <p class="sub">${esc([labelOf(DOC_KINDS, doc.kind), doc.doc_date ? fmtDate(doc.doc_date) : '',
      doc.source === 'sharepoint' ? 'In SharePoint' : 'Uploaded ' + fmtDate(doc.created_at)]
      .filter(Boolean).join(' · '))}</p>
    ${doc.added_by ? `<p class="small muted">Added by ${esc(doc.added_by)}</p>` : ''}
    <div class="btn-row">
      <button class="btn primary" data-open>${icon(doc.source === 'sharepoint' ? 'link' : 'eye')} Open</button>
      <button class="btn ghost" data-no>Close</button>
    </div>
    <button class="btn danger wide mt sm" data-del>${icon('trash')} Remove this document</button>
    ${doc.source === 'upload'
      ? `<p class="tiny muted mt">Opens through a private link that stops working after five minutes.</p>` : ''}`,
    (el, close) => {

    $('[data-no]', el).onclick = close;

    $('[data-open]', el).onclick = async () => {
      const btn = $('[data-open]', el);
      if (doc.source === 'sharepoint') { window.open(doc.url, '_blank', 'noopener'); return; }
      btn.disabled = true;
      btn.textContent = 'Opening…';
      try {
        const url = await Store.signedUrl(doc.storage_path, 300);
        window.open(url, '_blank', 'noopener');
        btn.disabled = false;
        btn.innerHTML = icon('eye') + ' Open';
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = icon('eye') + ' Open';
        toast(err.message);
      }
    };

    $('[data-del]', el).onclick = () => {
      close();
      confirmSheet('Remove this document?', doc.title || doc.file_name || '', 'Remove', async () => {
        try {
          if (doc.storage_path) await Store.removeFile(doc.storage_path);
          await Store.remove('documents', doc.id);
          note('document', doc.id, 'removed',
            `Document removed for ${fullName(person)}: ${doc.title || doc.file_name}`, person.id);
          toast('Removed.');
          render();
        } catch (err) { toast('Could not remove: ' + err.message); }
      });
    };
  });
}

/* ================================================================
   Screen — expiring and expired
   ================================================================ */
const expiringWindow = { days: 60 };

function renderExpiring(view) {
  const all = attention();
  const win = expiringWindow.days;
  const rows = all.filter(r => r.level === 'red' || r.days === null || r.days <= win);

  const expired = rows.filter(r => r.level === 'red');
  const soon    = rows.filter(r => r.level === 'orange');

  const chip = n => `<button class="chip" data-days="${n}" aria-pressed="${win === n}">Next ${n} days</button>`;

  view.innerHTML = `
    <div class="filters">${chip(30)}${chip(60)}${chip(90)}${chip(180)}</div>

    <div class="section-title">Expired or missing — ${expired.length}</div>
    ${expired.length ? expired.map(attentionRow).join('')
      : `<div class="banner status-green">Nothing expired and nothing missing.</div>`}

    <div class="section-title">Expiring within ${win} days — ${soon.length}</div>
    ${soon.length ? soon.map(attentionRow).join('')
      : `<p class="small muted">Nothing due in that window.</p>`}

    <div class="btn-row mt">
      <button class="btn" id="printExp">${icon('print')} Print this list</button>
      <button class="btn ghost" id="csvExp">${icon('down')} Export CSV</button>
    </div>`;

  $$('[data-days]', view).forEach(b => {
    b.onclick = () => { expiringWindow.days = Number(b.dataset.days); render(); };
  });
  $('#printExp').onclick = () => printExpiring(win);
  $('#csvExp').onclick = () => csvExpiring(win);
  wireAttention(view);
}

/* ================================================================
   Screen — licence matrix
   ================================================================ */
function renderMatrix(view) {
  const people = onBooks();
  const types = activeTypes();

  if (!people.length || !types.length) {
    view.innerHTML = `<div class="empty"><b>Nothing to show yet</b>Add staff and requirements first.</div>`;
    return;
  }

  view.innerHTML = `
    <p class="small muted mb">Everyone on the books against every requirement.
      Scroll sideways for the rest of the columns.</p>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tblwrap" style="margin:0;padding:0;max-height:70vh;overflow:auto">
        <table class="grid">
          <thead><tr>
            <th class="stick">Name</th>
            ${types.map(t => `<th>${esc(t.name)}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${people.map(p => `<tr data-person="${esc(p.id)}" style="cursor:pointer">
              <td class="stick">${esc(fullName(p))}<div class="tiny muted">${esc(labelOf(JOB_TYPES, p.job_type))}</div></td>
              ${types.map(t => {
                const r = checkOne(p, t);
                if (r.level === 'grey') return `<td class="matrix-cell muted">·</td>`;
                const lbl = r.cred && r.cred.expires_on ? fmtDate(r.cred.expires_on).replace(/ (\d{4})$/, ' $1')
                          : r.level === 'red' ? 'Missing' : 'On file';
                return `<td class="matrix-cell ${statusClass(r.level)}"><span class="box">${esc(lbl)}</span></td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="btn-row mt">
      <button class="btn" id="printMx">${icon('print')} Print the matrix</button>
      <button class="btn ghost" id="csvMx">${icon('down')} Export CSV</button>
    </div>`;

  $$('tr[data-person]', view).forEach(tr => {
    tr.onclick = () => go('#/person/' + tr.dataset.person);
  });
  $('#printMx').onclick = printMatrix;
  $('#csvMx').onclick = csvMatrix;
}

/* ================================================================
   Screen — reports
   ================================================================ */
function renderReports(view) {
  view.innerHTML = `
    <p class="small muted mb">Each one opens the print dialog. Choose <b>Save as PDF</b> to email or file it.</p>

    <div class="card">
      <h2>Compliance register</h2>
      <p class="small muted">Everyone on the books, every requirement, every expiry date, with the
        problems marked. The one to take to an audit.</p>
      <button class="btn wide sm" id="r1">${icon('print')} Print the register</button>
    </div>

    <div class="card">
      <h2>Expiring and expired</h2>
      <p class="small muted">What has run out and what runs out soon, soonest first.</p>
      <div class="row" style="gap:8px">
        <select id="r2days" style="max-width:150px">
          <option value="30">Next 30 days</option>
          <option value="60" selected>Next 60 days</option>
          <option value="90">Next 90 days</option>
          <option value="180">Next 6 months</option>
        </select>
        <button class="btn sm grow" id="r2">${icon('print')} Print</button>
      </div>
    </div>

    <div class="card">
      <h2>Licence and ticket matrix</h2>
      <p class="small muted">One grid, everyone against everything. Good for the wall.</p>
      <button class="btn wide sm" id="r3">${icon('print')} Print the matrix</button>
    </div>

    <div class="card">
      <h2>One person's file</h2>
      <p class="small muted">Their details, every licence and ticket, and what documents are held.</p>
      <div class="row" style="gap:8px">
        <select id="r4who" class="grow">
          ${DB.people.map(p => `<option value="${esc(p.id)}">${esc(fullName(p))}</option>`).join('')}
        </select>
        <button class="btn sm" id="r4">${icon('print')} Print</button>
      </div>
      <label class="row small muted" style="margin-top:10px;gap:8px">
        <input type="checkbox" id="r4pay" style="width:auto;min-height:0"> Include pay
      </label>
    </div>

    <div class="card">
      <h2>Spreadsheet exports</h2>
      <p class="small muted">Comma-separated files that open straight in Excel.</p>
      <div class="btn-row">
        <button class="btn sm ghost" id="c1">${icon('down')} Staff list</button>
        <button class="btn sm ghost" id="c2">${icon('down')} All licences</button>
        <button class="btn sm ghost" id="c3">${icon('down')} Documents held</button>
      </div>
    </div>`;

  $('#r1').onclick = printRegister;
  $('#r2').onclick = () => printExpiring(Number($('#r2days').value));
  $('#r3').onclick = printMatrix;
  $('#r4').onclick = () => {
    const p = personById($('#r4who').value);
    if (p) printStaffFile(p, $('#r4pay').checked);
  };
  $('#c1').onclick = csvStaff;
  $('#c2').onclick = csvCredentials;
  $('#c3').onclick = csvDocuments;
}

/* ================================================================
   Screen — requirements (the credential types)
   ================================================================ */
function renderRequirements(view) {
  const types = DB.credential_types.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));

  view.innerHTML = `
    <p class="small muted mb">What the company requires, and who of. Anything ticked for a role
      shows as <b>Missing</b> on that person's file until it is recorded.</p>

    ${types.map(t => {
      const req = (t.required_for || []).map(k => labelOf(JOB_TYPES, k)).join(', ');
      return `<button class="cred ${t.active === false ? 'status-grey' : 'status-green'}" data-type="${esc(t.id)}">
        <span class="grow">
          <span class="nm">${esc(t.name)}${t.active === false ? ' <span class="muted tiny">(off)</span>' : ''}</span>
          <span class="dt">${esc(labelOf(CRED_CATEGORIES, t.category))} · ${t.expires
            ? 'expires, warn ' + t.warn_days + ' days out' : 'no expiry'}${req ? ' · required of ' + esc(req) : ''}</span>
        </span>
        <span class="st">${DB.credentials.filter(c => c.type_id === t.id).length}</span>
      </button>`;
    }).join('')}

    <button class="btn primary wide mt" id="addType">${icon('plus')} Add a requirement</button>`;

  $$('[data-type]', view).forEach(b => b.onclick = () => typeSheet(typeById(b.dataset.type)));
  $('#addType').onclick = () => typeSheet(null);
}

function typeSheet(t) {
  const isNew = !t;
  const cur = t || { category: 'ticket', expires: true, warn_days: 60, required_for: [], sort: 500, active: true };
  const inUse = t ? DB.credentials.filter(c => c.type_id === t.id).length : 0;

  sheet(`
    <h2>${isNew ? 'Add a requirement' : esc(cur.name)}</h2>
    <p class="sub">${isNew ? 'Something the company requires people to hold.'
      : inUse ? `Recorded against ${plural(inUse, 'person')}.` : 'Not recorded against anyone yet.'}</p>
    <form id="tf">
      ${field('Name', 'name', cur.name, 'text', { placeholder: 'Confined Space' })}
      <div class="fields2">
        ${field('Kind', 'category', cur.category, 'select', { options: CRED_CATEGORIES })}
        ${field('Order in lists', 'sort', cur.sort, 'number')}
      </div>
      ${field('Detail box label', 'detail_label', cur.detail_label, 'text',
        { placeholder: 'e.g. "Classes held" — leave blank if not needed' })}

      <label class="field"><span>Expiry</span>
        <select name="expires">
          <option value="yes"${cur.expires ? ' selected' : ''}>It expires</option>
          <option value="no"${cur.expires ? '' : ' selected'}>It never expires</option>
        </select></label>
      ${field('Warn this many days before expiry', 'warn_days', cur.warn_days, 'number')}

      <label class="field"><span>Required of</span></label>
      <div class="row wrap" style="gap:8px;margin:-8px 0 14px">
        ${JOB_TYPES.map(j => `<label class="chip" style="cursor:pointer">
          <input type="checkbox" data-role="${j.key}" style="width:auto;min-height:0;margin-right:6px"
            ${(cur.required_for || []).indexOf(j.key) >= 0 ? 'checked' : ''}>${esc(j.label)}</label>`).join('')}
      </div>

      <label class="field"><span>In use</span>
        <select name="active">
          <option value="yes"${cur.active !== false ? ' selected' : ''}>Yes — show it</option>
          <option value="no"${cur.active === false ? ' selected' : ''}>No — hide it</option>
        </select></label>

      <div class="btn-row">
        <button type="button" class="btn ghost" data-no>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
      ${isNew || inUse ? '' : `<button type="button" class="btn danger wide mt sm" data-del>Delete this requirement</button>`}
      ${inUse ? `<p class="tiny muted mt">It cannot be deleted while people hold it. Set it to
        <b>hide</b> instead — that keeps the history.</p>` : ''}
    </form>`, (el, close) => {

    $('[data-no]', el).onclick = close;

    $('#tf', el).onsubmit = async e => {
      e.preventDefault();
      const d = readForm(el);
      if (!d.name) return toast('Give it a name.');

      const row = {
        name: d.name,
        category: d.category,
        detail_label: d.detail_label || '',
        expires: d.expires === 'yes',
        warn_days: Number(d.warn_days) || 60,
        sort: Number(d.sort) || 500,
        active: d.active === 'yes',
        required_for: $$('[data-role]', el).filter(c => c.checked).map(c => c.dataset.role)
      };

      try {
        if (isNew) {
          row.key = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || uid().slice(0, 8);
          const saved = await Store.insert('credential_types', row);
          note('type', saved.id, 'added', `Requirement added: ${saved.name}`, null);
        } else {
          await Store.patch('credential_types', cur.id, row);
          note('type', cur.id, 'changed', `Requirement changed: ${row.name}`, null);
        }
        close();
        toast('Saved.');
        render();
      } catch (err) { toast('Could not save: ' + err.message); }
    };

    const del = $('[data-del]', el);
    if (del) del.onclick = () => {
      close();
      confirmSheet('Delete ' + cur.name + '?', 'Nobody holds it, so nothing is lost.', 'Delete', async () => {
        try {
          await Store.remove('credential_types', cur.id);
          note('type', cur.id, 'removed', `Requirement deleted: ${cur.name}`, null);
          toast('Deleted.');
          render();
        } catch (err) { toast('Could not delete: ' + err.message); }
      });
    };
  });
}

/* ================================================================
   Screen — import from a spreadsheet
   ================================================================ */
function renderImport(view) {
  view.innerHTML = `
    <p class="small muted mb">Getting started with a lot of people at once. Export from Excel as
      <b>CSV</b>, open it in Notepad, and paste the whole thing below — or choose the file.</p>

    <div class="card">
      <h2>1. What are you importing</h2>
      <div class="filters" style="padding-bottom:0">
        <button class="chip" data-mode="people" aria-pressed="true">Staff</button>
        <button class="chip" data-mode="creds" aria-pressed="false">Licences &amp; tickets</button>
      </div>
      <div id="cols" class="small muted mt"></div>
    </div>

    <div class="card">
      <h2>2. Paste it in</h2>
      <label class="field"><input type="file" id="impFile" accept=".csv,text/csv" style="padding:11px"></label>
      <textarea id="impText" rows="8" placeholder="first_name,last_name,job_type,crew&#10;Hemi,Walker,driver,North"></textarea>
    </div>

    <button class="btn primary wide" id="impGo">Check it</button>
    <div id="impOut" class="mt"></div>`;

  let mode = 'people';

  const COLS = {
    people: {
      need: ['first_name', 'last_name'],
      all: ['employee_no', 'first_name', 'last_name', 'job_type', 'position', 'crew',
            'employment_type', 'start_date', 'status', 'phone', 'email', 'sharepoint_url'],
      hint: `<b>Columns:</b> employee_no, first_name, last_name, job_type
        (driver / operator / crew / office / management), position, crew, employment_type,
        start_date (YYYY-MM-DD), status, phone, email, sharepoint_url.
        Only first_name and last_name are required.`
    },
    creds: {
      need: ['employee_no', 'type'],
      all: ['employee_no', 'name', 'type', 'detail', 'reference', 'issued_on', 'expires_on'],
      hint: `<b>Columns:</b> employee_no <i>or</i> name (must match someone already on file),
        type (the requirement's exact name, e.g. "Driver Licence"), detail, reference,
        issued_on, expires_on (YYYY-MM-DD).`
    }
  };

  const paintCols = () => { $('#cols').innerHTML = COLS[mode].hint; };
  paintCols();

  $$('[data-mode]', view).forEach(b => b.onclick = () => {
    mode = b.dataset.mode;
    $$('[data-mode]', view).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === mode)));
    paintCols();
    $('#impOut').innerHTML = '';
  });

  $('#impFile').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { $('#impText').value = r.result; };
    r.readAsText(f);
  };

  $('#impGo').onclick = () => {
    const rows = parseCsv($('#impText').value);
    if (rows.length < 2) return toast('Nothing to read — paste the CSV including its header row.');

    const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const body = rows.slice(1).filter(r => r.some(c => c.trim()));
    const missing = COLS[mode].need.filter(n => head.indexOf(n) < 0);

    if (missing.length && !(mode === 'creds' && head.indexOf('name') >= 0 && head.indexOf('type') >= 0)) {
      $('#impOut').innerHTML = `<div class="banner status-red">Missing column${missing.length > 1 ? 's' : ''}:
        <b>${esc(missing.join(', '))}</b>. The first row must be the column names.</div>`;
      return;
    }

    const items = body.map(r => {
      const o = {};
      head.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });

    const problems = [];
    if (mode === 'creds') {
      items.forEach((o, i) => {
        const p = findPerson(o);
        const t = DB.credential_types.find(x => x.name.toLowerCase() === (o.type || '').toLowerCase());
        if (!p) problems.push(`Row ${i + 2}: no staff member matches "${o.employee_no || o.name}"`);
        else if (!t) problems.push(`Row ${i + 2}: no requirement called "${o.type}"`);
      });
    }

    $('#impOut').innerHTML = `
      ${problems.length ? `<div class="banner status-red">${problems.length} row${problems.length > 1 ? 's' : ''}
        cannot be matched and will be skipped:<br>${problems.slice(0, 8).map(esc).join('<br>')}
        ${problems.length > 8 ? '<br>…' : ''}</div>` : ''}
      <div class="banner status-green">Ready to bring in
        <b>${items.length - problems.length}</b> row${items.length - problems.length === 1 ? '' : 's'}.</div>
      <button class="btn primary wide" id="impDo">Import them</button>`;

    $('#impDo').onclick = async () => {
      const btn = $('#impDo');
      btn.disabled = true;
      let ok = 0, fail = 0;

      for (const o of items) {
        try {
          if (mode === 'people') {
            const row = {};
            COLS.people.all.forEach(k => { if (o[k]) row[k] = o[k]; });
            if (!row.first_name && !row.last_name) { fail++; continue; }
            if (row.job_type && !JOB_TYPES.some(j => j.key === row.job_type)) row.job_type = 'crew';
            if (row.status && !PERSON_STATUS.some(s => s.key === row.status)) row.status = 'active';
            if (row.employment_type && !EMPLOYMENT_TYPES.some(t => t.key === row.employment_type)) row.employment_type = 'permanent';
            await Store.insert('people', row);
          } else {
            const p = findPerson(o);
            const t = DB.credential_types.find(x => x.name.toLowerCase() === (o.type || '').toLowerCase());
            if (!p || !t) { fail++; continue; }
            await Store.insert('credentials', {
              person_id: p.id, type_id: t.id,
              detail: o.detail || '', reference: o.reference || '',
              issued_on: o.issued_on || null, expires_on: o.expires_on || null
            });
          }
          ok++;
          btn.textContent = `Importing… ${ok}`;
        } catch (e) { fail++; }
      }

      note('person', null, 'added',
        `Imported ${ok} ${mode === 'people' ? 'staff' : 'licence'} row${ok === 1 ? '' : 's'} from a spreadsheet`, null);
      $('#impOut').innerHTML = `<div class="banner status-green">Brought in ${ok} row${ok === 1 ? '' : 's'}${
        fail ? `, skipped ${fail}` : ''}.</div>
        <button class="btn wide" onclick="location.hash='#/people'">See the staff list</button>`;
    };
  };
}

function findPerson(o) {
  if (o.employee_no) {
    const m = DB.people.find(p => p.employee_no && p.employee_no.toLowerCase() === o.employee_no.toLowerCase());
    if (m) return m;
  }
  if (o.name) {
    const n = o.name.trim().toLowerCase();
    return DB.people.find(p => fullName(p).toLowerCase() === n);
  }
  return null;
}

/** CSV reader that copes with quoted fields, commas and newlines inside them. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  const s = String(text || '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ================================================================
   Screen — settings
   ================================================================ */
function renderSettings(view) {
  const me = Auth.me || {};
  view.innerHTML = `
    <div class="card">
      <h2>Signed in</h2>
      ${kv('Name', me.name)}
      ${kv('Email', (Auth.session && Auth.session.email) || '')}
      ${kv('Access', me.role === 'director' ? 'Director' : 'HR')}
      <div class="btn-row mt">
        <button class="btn ghost sm" id="chpw">Change password</button>
        <button class="btn ghost sm" id="lockNow">${icon('lock')} Lock now</button>
      </div>
      <button class="btn danger wide sm mt" id="out">Sign out</button>
    </div>

    <div class="card">
      <h2>How this is kept private</h2>
      <ul class="small muted" style="padding-left:18px;margin:0;line-height:1.65">
        <li>Nothing opens without a sign-in, and the account must be on the HR list.</li>
        <li>Staff data is never written to this device — it is held in memory and thrown
            away when you lock, sign out or reload.</li>
        <li>Uploaded documents sit in a private store. Links to them last five minutes.</li>
        <li>The screen locks itself after ${SITE.idleLockMinutes || 20} minutes with nothing happening.</li>
        <li>Every change is recorded against the person, with who made it.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Everything on file</h2>
      ${kv('Staff', String(DB.people.length))}
      ${kv('On the books', String(onBooks().length))}
      ${kv('Requirements', String(DB.credential_types.length))}
      ${kv('Licences and tickets recorded', String(DB.credentials.length))}
      ${kv('Documents', String(DB.documents.length))}
      <button class="btn ghost wide sm mt" id="reload">Refresh from the database</button>
    </div>

    <p class="tiny muted center">RCK HR ${VERSION}</p>`;

  $('#lockNow').onclick = () => lock('Locked.');
  $('#out').onclick = () => confirmSheet('Sign out?', 'You will need your password to get back in.',
    'Sign out', async () => { await Auth.signOut(); loaded = false; render(); });

  $('#reload').onclick = async () => {
    try { await Store.pull(); toast('Up to date.'); render(); }
    catch (e) { toast('Could not refresh: ' + e.message); }
  };

  $('#chpw').onclick = () => sheet(`
    <h2>Change your password</h2>
    <p class="sub">At least 8 characters.</p>
    <label class="field"><span>New password</span><input type="password" id="np1" autocomplete="new-password"></label>
    <label class="field"><span>Type it again</span><input type="password" id="np2" autocomplete="new-password"></label>
    <div class="btn-row">
      <button class="btn ghost" data-no>Cancel</button>
      <button class="btn primary" data-yes>Change it</button>
    </div>`, (el, close) => {
    $('[data-no]', el).onclick = close;
    $('[data-yes]', el).onclick = async () => {
      const a = $('#np1', el).value, b = $('#np2', el).value;
      if (a.length < 8) return toast('At least 8 characters, please.');
      if (a !== b) return toast('Those two do not match.');
      try { await Auth.changePassword(a); close(); toast('Password changed.'); }
      catch (e) { toast('Could not change it: ' + e.message); }
    };
  });
}

/* ================================================================
   Printed documents
   ================================================================ */
function docHead(title, subtitle) {
  return `<div class="doc-head">
    <div class="org">RCK — Human Resources</div>
    <h1>${esc(title)}</h1>
    <div>${esc(subtitle || '')}</div>
  </div>`;
}
function docFoot() {
  return `<div class="foot">Printed ${esc(fmtDateTime(new Date().toISOString()))} by
    ${esc((Auth.me && Auth.me.name) || (Auth.session && Auth.session.email) || '')}.
    Confidential — RCK staff records.</div>`;
}
function printDoc(html) {
  $('#printArea').innerHTML = `<div class="doc">${html}${docFoot()}</div>`;
  setTimeout(() => {
    window.print();
    setTimeout(() => { $('#printArea').innerHTML = ''; }, 800);
  }, 60);
}
function badgeFor(level, text) {
  const cls = level === 'red' ? ' bad' : level === 'orange' ? ' warn' : '';
  return `<span class="badge${cls}">${esc(text)}</span>`;
}

function printRegister() {
  const people = onBooks();
  const types = activeTypes();

  const body = people.map(p => {
    const rows = checksFor(p);
    const st = standing(p);
    return `<div class="avoid-break" style="margin-bottom:5mm">
      <h2>${esc(fullName(p))} — ${esc(labelOf(JOB_TYPES, p.job_type))}${p.crew ? ' · ' + esc(p.crew) : ''}
        ${badgeFor(st.level, st.level === 'green' ? 'CURRENT' : st.level === 'orange' ? 'DUE SOON' : 'ACTION')}</h2>
      <table><thead><tr><th>Requirement</th><th>Detail</th><th>Number</th><th>Expires</th><th>Standing</th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr>
        <td>${esc(r.type.name)}</td>
        <td>${esc((r.cred && r.cred.detail) || '')}</td>
        <td>${esc((r.cred && r.cred.reference) || '')}</td>
        <td>${r.cred && r.cred.expires_on ? esc(fmtDate(r.cred.expires_on)) : (r.type.expires ? '—' : 'n/a')}</td>
        <td>${badgeFor(r.level, r.text)}</td></tr>`).join('')
        : `<tr><td colspan="5">No requirements set for this role.</td></tr>`}</tbody></table>
    </div>`;
  }).join('');

  const t = tallies();
  printDoc(docHead('Compliance register', `${plural(people.length, 'person')} on the books · ${fmtDate(today())}`) + `
    <table class="kv">
      <tr><td>All current</td><td>${t.green}</td></tr>
      <tr><td>Expiring soon</td><td>${t.orange}</td></tr>
      <tr><td>Action needed</td><td>${t.red}</td></tr>
      <tr><td>Requirements tracked</td><td>${types.length}</td></tr>
    </table>` + body);
}

function printExpiring(win) {
  const all = attention();
  const expired = all.filter(r => r.level === 'red');
  const soon = all.filter(r => r.level === 'orange' && (r.days === null || r.days <= win));

  const table = rows => rows.length ? `<table>
    <thead><tr><th>Name</th><th>Role</th><th>Requirement</th><th>Detail</th><th>Expires</th><th>Standing</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${esc(fullName(r.person))}</td>
      <td>${esc(labelOf(JOB_TYPES, r.person.job_type))}${r.person.crew ? ' · ' + esc(r.person.crew) : ''}</td>
      <td>${esc(r.type.name)}</td>
      <td>${esc((r.cred && r.cred.detail) || '')}</td>
      <td>${r.cred && r.cred.expires_on ? esc(fmtDate(r.cred.expires_on)) : '—'}</td>
      <td>${badgeFor(r.level, r.text)}</td></tr>`).join('')}</tbody></table>`
    : `<p>Nothing.</p>`;

  printDoc(docHead('Expiring and expired', `Looking ${win} days ahead · ${fmtDate(today())}`) +
    `<h2>Expired or missing — ${expired.length}</h2>${table(expired)}
     <h2>Expiring within ${win} days — ${soon.length}</h2>${table(soon)}`);
}

function printMatrix() {
  const people = onBooks();
  const types = activeTypes();
  printDoc(docHead('Licence and ticket matrix', `${plural(people.length, 'person')} · ${fmtDate(today())}`) + `
    <table style="font-size:7.5pt">
      <thead><tr><th>Name</th>${types.map(t => `<th>${esc(t.name)}</th>`).join('')}</tr></thead>
      <tbody>${people.map(p => `<tr>
        <td><b>${esc(fullName(p))}</b><br>${esc(labelOf(JOB_TYPES, p.job_type))}</td>
        ${types.map(t => {
          const r = checkOne(p, t);
          if (r.level === 'grey') return '<td></td>';
          const txt = r.cred && r.cred.expires_on ? fmtDate(r.cred.expires_on)
                    : r.level === 'red' ? 'MISSING' : 'held';
          return `<td>${badgeFor(r.level, txt)}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
    </table>
    <p style="font-size:8.5pt;margin-top:3mm">Plain box = current. Grey box = expiring soon.
      Black box = expired or missing. Blank = not required and not held.</p>`);
}

function printStaffFile(p, withPay) {
  const rows = checksFor(p);
  const docs = docsFor(p.id);
  const st = standing(p);

  printDoc(docHead(fullName(p), `Staff file · ${fmtDate(today())}`) + `
    <table class="kv">
      <tr><td>Employee number</td><td>${esc(p.employee_no || '—')}</td></tr>
      <tr><td>Role</td><td>${esc(labelOf(JOB_TYPES, p.job_type))}${p.position ? ' — ' + esc(p.position) : ''}</td></tr>
      <tr><td>Crew / depot</td><td>${esc(p.crew || '—')}</td></tr>
      <tr><td>Employment</td><td>${esc(labelOf(EMPLOYMENT_TYPES, p.employment_type))}</td></tr>
      <tr><td>Started</td><td>${esc(fmtDate(p.start_date))} ${p.start_date ? '(' + esc(serviceText(p.start_date, p.end_date)) + ')' : ''}</td></tr>
      ${p.end_date ? `<tr><td>Finished</td><td>${esc(fmtDate(p.end_date))}</td></tr>` : ''}
      <tr><td>Status</td><td>${esc(labelOf(PERSON_STATUS, p.status))}</td></tr>
      <tr><td>Phone</td><td>${esc(p.phone || '—')}</td></tr>
      <tr><td>Email</td><td>${esc(p.email || '—')}</td></tr>
      <tr><td>Address</td><td>${esc(p.address || '—')}</td></tr>
      <tr><td>Emergency contact</td><td>${esc([p.emergency_name, p.emergency_relationship, p.emergency_phone].filter(Boolean).join(' · ') || '—')}</td></tr>
      <tr><td>Standing</td><td>${badgeFor(st.level, st.level === 'green' ? 'ALL CURRENT'
        : st.level === 'orange' ? 'DUE SOON' : st.level === 'grey' ? 'FINISHED' : 'ACTION NEEDED')}</td></tr>
    </table>

    ${withPay ? `<h2>Pay</h2><table class="kv">
      <tr><td>Rate</td><td>${p.pay_rate ? '$' + Number(p.pay_rate).toFixed(2) + (p.pay_type === 'salary' ? ' per year' : ' per hour') : '—'}</td></tr>
      <tr><td>Last reviewed</td><td>${esc(p.pay_reviewed_on ? fmtDate(p.pay_reviewed_on) : '—')}</td></tr>
      ${p.pay_notes ? `<tr><td>Notes</td><td class="note">${esc(p.pay_notes)}</td></tr>` : ''}
    </table>` : ''}

    <h2>Licences, tickets and certificates</h2>
    ${rows.length ? `<table>
      <thead><tr><th>Requirement</th><th>Detail</th><th>Number</th><th>Issued</th><th>Expires</th><th>Standing</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${esc(r.type.name)}</td>
        <td>${esc((r.cred && r.cred.detail) || '')}</td>
        <td>${esc((r.cred && r.cred.reference) || '')}</td>
        <td>${r.cred && r.cred.issued_on ? esc(fmtDate(r.cred.issued_on)) : '—'}</td>
        <td>${r.cred && r.cred.expires_on ? esc(fmtDate(r.cred.expires_on)) : (r.type.expires ? '—' : 'n/a')}</td>
        <td>${badgeFor(r.level, r.text)}</td></tr>`).join('')}</tbody></table>`
      : '<p>None recorded.</p>'}

    <h2>Documents held — ${docs.length}</h2>
    ${docs.length ? `<table>
      <thead><tr><th>What</th><th>Title</th><th>Dated</th><th>Where</th></tr></thead>
      <tbody>${docs.map(d => `<tr>
        <td>${esc(labelOf(DOC_KINDS, d.kind))}</td>
        <td>${esc(d.title || d.file_name || '')}</td>
        <td>${d.doc_date ? esc(fmtDate(d.doc_date)) : '—'}</td>
        <td>${d.source === 'sharepoint' ? 'SharePoint' : 'Held in RCK HR'}</td></tr>`).join('')}</tbody></table>`
      : '<p>None on file.</p>'}

    ${p.notes ? `<h2>Notes</h2><p class="note">${esc(p.notes)}</p>` : ''}`);
}

/* ------------------------------------------------------------- CSV out */
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function download(name, rows) {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Downloaded.');
}

function csvStaff() {
  const rows = [['Employee no', 'First name', 'Last name', 'Role type', 'Job title', 'Crew',
    'Employment', 'Started', 'Service', 'Status', 'Phone', 'Email', 'Standing']];
  DB.people.forEach(p => {
    const st = standing(p);
    rows.push([p.employee_no, p.first_name, p.last_name, labelOf(JOB_TYPES, p.job_type), p.position,
      p.crew, labelOf(EMPLOYMENT_TYPES, p.employment_type), p.start_date || '',
      serviceText(p.start_date, p.end_date), labelOf(PERSON_STATUS, p.status),
      p.phone, p.email, st.text]);
  });
  download('rck-staff.csv', rows);
}

function csvCredentials() {
  const rows = [['Employee no', 'Name', 'Role type', 'Requirement', 'Detail', 'Number',
    'Issued', 'Expires', 'Days left', 'Standing']];
  onBooks().forEach(p => {
    checksFor(p).forEach(r => {
      rows.push([p.employee_no, fullName(p), labelOf(JOB_TYPES, p.job_type), r.type.name,
        (r.cred && r.cred.detail) || '', (r.cred && r.cred.reference) || '',
        (r.cred && r.cred.issued_on) || '', (r.cred && r.cred.expires_on) || '',
        r.days === null ? '' : r.days, r.text]);
    });
  });
  download('rck-licences.csv', rows);
}

function csvExpiring(win) {
  const rows = [['Name', 'Role type', 'Crew', 'Requirement', 'Expires', 'Days left', 'Standing']];
  attention().filter(r => r.level === 'red' || r.days === null || r.days <= win).forEach(r => {
    rows.push([fullName(r.person), labelOf(JOB_TYPES, r.person.job_type), r.person.crew,
      r.type.name, (r.cred && r.cred.expires_on) || '', r.days === null ? '' : r.days, r.text]);
  });
  download(`rck-expiring-${win}days.csv`, rows);
}

function csvMatrix() {
  const types = activeTypes();
  const rows = [['Name', 'Role type', 'Crew'].concat(types.map(t => t.name))];
  onBooks().forEach(p => {
    rows.push([fullName(p), labelOf(JOB_TYPES, p.job_type), p.crew].concat(types.map(t => {
      const r = checkOne(p, t);
      if (r.level === 'grey') return '';
      return r.cred && r.cred.expires_on ? r.cred.expires_on : r.text;
    })));
  });
  download('rck-licence-matrix.csv', rows);
}

function csvDocuments() {
  const rows = [['Name', 'Employee no', 'What', 'Title', 'Dated', 'Where', 'Added by', 'Added']];
  DB.documents.forEach(d => {
    const p = personById(d.person_id);
    rows.push([p ? fullName(p) : '', p ? p.employee_no : '', labelOf(DOC_KINDS, d.kind),
      d.title || d.file_name || '', d.doc_date || '',
      d.source === 'sharepoint' ? 'SharePoint' : 'RCK HR', d.added_by, d.created_at || '']);
  });
  download('rck-documents.csv', rows);
}

/* ================================================================
   Connection light
   ================================================================ */
function paintDot() {
  const d = $('#syncDot');
  if (!d) return;
  d.className = 'dot ' + (lastError ? 'bad' : loaded ? 'ok' : 'warn');
  d.title = lastError || (loaded ? 'Connected' : 'Loading');
}

/* ================================================================
   Starting up
   ================================================================ */
async function boot() {
  try {
    await Store.pull();
    lastError = '';
  } catch (e) {
    lastError = e.message || 'Connection problem';
    loaded = true;   // let the interface render so the error is visible
    toast('Could not load: ' + lastError);
  }
  paintDot();
  render();
}

async function start() {
  Auth.load();

  if (configured() && Auth.session) {
    try {
      await Auth.token();     // refreshes if it has gone stale
      await Auth.loadMe();
    } catch (e) {
      Auth.wipe();            // expired, revoked, or taken off the list
    }
  }

  render();
  if (signedIn() && !loaded) boot();

  Idle.start();
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev =>
    window.addEventListener(ev, Idle.touch, { passive: true }));

  // Re-check the session when the tab comes back after being away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && signedIn()) {
      Idle.touch();
      Auth.token().catch(() => lock('Session expired. Please sign in again.'));
    }
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
  $('#lockBtn').onclick = () => { $('#menu').hidden = true; lock('Locked.'); };

  start();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
