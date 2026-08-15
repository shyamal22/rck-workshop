/* =====================================================================
   RCK Workshop — gear status, damage reports, work orders, repair history
   Plain JavaScript, no build step, no frameworks.
   ===================================================================== */
'use strict';

const VERSION = '1.0.0';

/* ------------------------------------------------------------ fleet */
const CATEGORIES = [
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
function catLabel(key) {
  const c = CATEGORIES.find(x => x.key === key);
  return c ? c.one : 'Other';
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
const DB = { gear: [], work_orders: [], wo_updates: [], localSeq: 0 };

function cacheKey() { return 'rckw.cache.' + (S.localMode ? 'local' : 'remote'); }

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (raw) {
      DB.gear = raw.gear || [];
      DB.work_orders = raw.work_orders || [];
      DB.wo_updates = raw.wo_updates || [];
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
    const [gear, orders, updates] = await Promise.all([
      rest('gear?select=*&order=code.asc', { headers: restHeaders() }),
      rest('work_orders?select=*&order=number.desc&limit=3000', { headers: restHeaders() }),
      rest('wo_updates?select=*&order=created_at.desc&limit=6000', { headers: restHeaders() })
    ]);
    DB.gear = gear || [];
    DB.work_orders = orders || [];
    DB.wo_updates = (updates || []).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
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
        if (op.kind === 'insert') {
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
  const order = CATEGORIES.map(c => c.key);
  return list.slice().sort((a, b) => {
    const d = order.indexOf(a.category) - order.indexOf(b.category);
    return d !== 0 ? d : String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
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
  return Store.insert('wo_updates', {
    id: uid(),
    work_order_id: workOrderId,
    created_at: new Date().toISOString(),
    author: whoami(),
    role: S.role,
    kind,
    body: body || '',
    meta: meta || {}
  });
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

  for (const f of files || []) {
    const up = await Store.upload(f);
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

const SCREENS = {
  '/':          { title: 'Gear',          render: renderBoard },
  '/orders':    { title: 'Work orders',   render: renderOrders },
  '/report':    { title: 'Report damage', render: renderReport,   back: true },
  '/reports':   { title: 'Reports',       render: renderReports,  back: true },
  '/gearadmin': { title: 'Manage gear',   render: renderGearAdmin, back: true },
  '/setup':     { title: 'Settings',      render: renderSetup,    back: true },
  '/screen':    { title: 'Workshop screen', render: renderKiosk }
};

function render() {
  route = parseHash();
  stopKiosk();
  document.body.classList.toggle('kiosk', route.path === '/screen');

  let screen = SCREENS[route.path];
  let back = false;

  if (route.path.startsWith('/gear/')) { screen = { title: 'Gear', render: renderGearDetail }; back = true; }
  else if (route.path.startsWith('/wo/')) { screen = { title: 'Work order', render: renderWorkOrder }; back = true; }

  if (!screen) { go('#/'); return; }

  $('#title').textContent = screen.title;
  $('#backBtn').hidden = !(back || screen.back);
  $('#menu').hidden = true;

  $$('#tabbar a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + route.path));

  const view = $('#view');
  view.innerHTML = '';
  if (needsSetup() && route.path !== '/setup') { renderWelcome(view); return; }
  screen.render(view);
  window.scrollTo(0, 0);
}

function needsSetup() {
  return !S.name || (!connected() && !S.localMode);
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

  const cats = CATEGORIES.filter(c => gear.some(g => g.category === c.key));

  view.innerHTML = `
    <div class="tally">
      ${['green', 'orange', 'red'].map(k => `
        <button class="status-${k}" data-status="${k}" aria-pressed="${boardFilter.status === k}">
          <span class="n">${counts[k]}</span>
          <span class="l">${k === 'green' ? 'Working' : k === 'orange' ? 'Usable' : 'Out of action'}</span>
        </button>`).join('')}
    </div>

    <div class="filters">
      <button class="chip" data-cat="all" aria-pressed="${boardFilter.cat === 'all'}">All gear</button>
      ${cats.map(c => `<button class="chip" data-cat="${c.key}" aria-pressed="${boardFilter.cat === c.key}">${c.label}</button>`).join('')}
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
      if (boardFilter.cat !== 'all' && g.category !== boardFilter.cat) return false;
      if (boardFilter.status !== 'all' && gearStatus(g) !== boardFilter.status) return false;
      if (needle && !`${g.code} ${g.name} ${g.location} ${g.make_model}`.toLowerCase().includes(needle)) return false;
      return true;
    });

    const grid = $('#grid', view);
    if (!list.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Nothing matches</b>Try another filter.</div>`;
      return;
    }
    grid.innerHTML = list.map(g => {
      const st = gearStatus(g);
      const eta = gearEta(g);
      const open = openOrdersFor(g.id).length;
      const due = eta ? dueText(eta) : null;
      return `
        <button class="gear-card status-${st}" data-id="${g.id}">
          <div class="code">${esc(g.code)}</div>
          <div class="name">${esc(g.name || catLabel(g.category))}</div>
          <div class="meta"><span class="swatch"></span><b>${STATUS_TEXT[st]}</b></div>
          ${open ? `<div class="loc">${open} open job${open === 1 ? '' : 's'}${due ? ` · <span class="${due.late ? 'overdue' : ''}">${due.none ? 'no date' : due.text}</span>` : ''}</div>` : ''}
          <div class="loc">${g.location ? '📍 ' + esc(g.location) : '<span class="muted">Location not set</span>'}</div>
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
    <div class="card status-${st}" style="border-left:5px solid var(--s)">
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
      <button class="btn" id="hist">History report</button>
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

function woCard(o) {
  const g = gearById(o.gear_id) || {};
  const due = dueText(o.target_date);
  const closed = !isOpen(o);
  return `
    <button class="wo status-${closed ? 'green' : o.severity}" data-wo="${o.id}">
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
          ${CATEGORIES.filter(c => gear.some(g => g.category === c.key)).map(c => `
            <optgroup label="${c.label}">
              ${gear.filter(g => g.category === c.key).map(g =>
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
      <button class="btn wide" id="addPhoto" type="button">Add photos</button>
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
    <div class="card status-${closed ? 'green' : o.severity}" style="border-left:5px solid var(--s)">
      <div class="row spread">
        <div class="grow">
          <div class="tiny muted">${woNo(o)}</div>
          <h2 style="font-size:18px">${esc(o.title)}</h2>
          <a class="small" href="#/gear/${o.gear_id}">${esc(g.code || '')}${g.name ? ' — ' + esc(g.name) : ''}</a>
        </div>
        <span class="pill"><span class="swatch"></span>${closed ? 'Fixed' : STATUS_TEXT[o.severity]}</span>
      </div>
      ${o.description ? `<p class="small mt" style="white-space:pre-wrap">${esc(o.description)}</p>` : ''}
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
        <button class="btn sm" id="printWo">Print work order</button>
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
          ? `<a class="attach" href="${esc(m.url)}" target="_blank" rel="noopener">📎 ${esc(m.name || 'Attachment')}</a>`
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
            <option value="orange" ${o.severity === 'orange' ? 'selected' : ''}>Usable (orange)</option>
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
      await logUpdate(o.id, patch.repairer !== o.repairer ? 'external' : 'status', notes.join('\n'), {
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
      let n = 0;
      for (const raw of files) {
        const f = await compressImage(raw);
        const up = await Store.upload(f);
        await logUpdate(o.id, 'file', note || (o.repairer === 'external' ? 'Paperwork from external repairer' : 'Attachment'), up);
        n++;
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
function renderGearAdmin(view) {
  const gear = sortedGear(DB.gear);

  view.innerHTML = `
    <div class="card">
      <h2>Add gear</h2>
      <div class="row" style="gap:10px">
        <label class="field grow"><span>Code</span><input type="text" id="nCode" placeholder="TRK-07"></label>
        <label class="field grow"><span>Type</span>
          <select id="nCat">${CATEGORIES.map(c => `<option value="${c.key}">${c.one}</option>`).join('')}</select>
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
          <div class="tiny muted">${catLabel(g.category)}${g.make_model ? ' · ' + esc(g.make_model) : ''}${g.retired ? ' · RETIRED' : ''}</div>
        </div>
        <button class="btn sm" data-edit="${g.id}">Edit</button>
        <button class="btn sm" data-retire="${g.id}">${g.retired ? 'Restore' : 'Retire'}</button>
      </div>`).join('') || '<div class="card muted small">No gear yet.</div>'}`;

  $('#addGear', view).onclick = async function () {
    const code = $('#nCode', view).value.trim().toUpperCase();
    if (!code) return toast('Give it a code');
    if (DB.gear.some(g => (g.code || '').toUpperCase() === code)) return toast('That code is already used');
    this.disabled = true;
    await Store.insert('gear', {
      id: uid(),
      code,
      name: $('#nName', view).value.trim(),
      category: $('#nCat', view).value,
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
      const c = CATEGORIES.find(x => x.key === cat);
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

  $$('[data-edit]', view).forEach(b => b.onclick = async () => {
    const g = gearById(b.dataset.edit);
    const code = prompt('Code', g.code); if (code === null) return;
    const name = prompt('Name', g.name || ''); if (name === null) return;
    const model = prompt('Make / model', g.make_model || ''); if (model === null) return;
    await Store.patch('gear', g.id, { code: code.trim().toUpperCase(), name: name.trim(), make_model: model.trim() });
    toast('Saved');
    render();
  });

  $$('[data-retire]', view).forEach(b => b.onclick = async () => {
    const g = gearById(b.dataset.retire);
    await Store.patch('gear', g.id, { retired: !g.retired });
    render();
  });
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
    'Reported by', 'Reported', 'Location', 'Expected back', 'Repairer', 'Company', 'Their ref',
    'Cost', 'Completed', 'Completed by', 'Work done', 'Days down'];
  const rows = DB.work_orders
    .slice().sort((a, b) => (a.number || 0) - (b.number || 0))
    .map(o => {
      const g = gearById(o.gear_id) || {};
      return [woNo(o), g.code || '', g.name || '', catLabel(g.category), o.title, o.description,
        o.severity === 'red' ? 'No — out of operation' : 'Yes — usable', statusLabel(o.status),
        o.reported_by, fmtDateTime(o.reported_at), o.location_at_report, o.target_date ? fmtDate(o.target_date) : '',
        o.repairer || '', o.external_company || '', o.external_ref || '', o.cost != null ? o.cost : '',
        o.completed_at ? fmtDateTime(o.completed_at) : '', o.completed_by || '', o.work_done || '',
        daysBetween(o.reported_at, o.completed_at) ?? ''];
    });
  const csv = [head, ...rows]
    .map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rck-work-orders-${today()}.csv`;
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
  return `<span class="badge">${closed ? 'FIXED — GREEN' : sev === 'red' ? 'OUT OF OPERATION — RED' : 'USABLE — ORANGE'}</span>`;
}

function printWorkOrder(o) {
  const g = gearById(o.gear_id) || {};
  const closed = !isOpen(o);
  const ups = updatesFor(o.id);

  printDoc(`
    ${docHead('Work order ' + woNo(o), `${g.code || ''} — ${g.name || catLabel(g.category)}`)}
    <p>${badge(o.severity, closed)}</p>

    <h2>Gear</h2>
    <table class="kv">
      <tr><td>Code</td><td><strong>${esc(g.code || '')}</strong></td></tr>
      <tr><td>Name</td><td>${esc(g.name || '')}</td></tr>
      <tr><td>Type</td><td>${catLabel(g.category)}</td></tr>
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
    ${docHead('Repair history', g ? `${g.code} — ${g.name || catLabel(g.category)} · ${range}` : `Whole fleet · ${range}`)}

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
    ${CATEGORIES.filter(c => gear.some(g => g.category === c.key)).map(c => `
      <h2>${c.label}</h2>
      <table>
        <tr><th style="width:24mm">Code</th><th>Name</th><th style="width:34mm">Status</th>
            <th>Location</th><th style="width:28mm">Back in service</th></tr>
        ${gear.filter(g => g.category === c.key).map(g => {
          const st = gearStatus(g);
          const eta = gearEta(g);
          return `<tr>
            <td><strong>${esc(g.code)}</strong></td>
            <td>${esc(g.name || '')}</td>
            <td>${st === 'green' ? 'GREEN — working' : st === 'orange' ? 'ORANGE — usable' : 'RED — out of operation'}</td>
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
    const orders = activeOrders();
    const now = new Date();
    const clock = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() < 12 ? 'am' : 'pm'}`;

    const attention = gear.filter(g => gearStatus(g) !== 'green');

    view.innerHTML = `
      <div class="k">
        <div class="k-head">
          <h1>RCK Workshop</h1>
          <div class="grow muted">${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}</div>
          <div class="k-clock">${clock}</div>
        </div>

        <div class="k-tally">
          <div class="status-green"><div class="n">${counts.green}</div><div class="l">Working</div></div>
          <div class="status-orange"><div class="n">${counts.orange}</div><div class="l">Damaged — usable</div></div>
          <div class="status-red"><div class="n">${counts.red}</div><div class="l">Out of operation</div></div>
        </div>

        <div class="k-body">
          <div class="k-col">
            <h2>Active work orders (${orders.length})</h2>
            <div class="k-scroll">
              ${orders.slice(0, 9).map(o => {
                const g = gearById(o.gear_id) || {};
                const due = dueText(o.target_date);
                return `
                  <div class="k-wo status-${o.severity}">
                    <div>
                      <div class="kcode">${esc(g.code || '')}</div>
                      <div class="kno">${woNo(o)}</div>
                    </div>
                    <div style="min-width:0">
                      <div class="kttl">${esc(o.title)}</div>
                      <div class="kmeta">${statusLabel(o.status)}${o.repairer === 'external'
                        ? ' · ' + esc(o.external_company || 'external') : o.repairer === 'internal' ? ' · in-house' : ''}</div>
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
              ${attention.map(g => {
                const st = gearStatus(g);
                const eta = gearEta(g);
                return `<div class="k-chip status-${st}">
                  <div class="c">${esc(g.code)}</div>
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
$$('#menu [data-go]').forEach(b => b.onclick = () => { $('#menu').hidden = true; go(b.dataset.go); });
document.addEventListener('click', e => {
  if (!$('#menu').hidden && !e.target.closest('#menu') && !e.target.closest('#menuBtn')) $('#menu').hidden = true;
});

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
