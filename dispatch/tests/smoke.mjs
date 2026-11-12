// RCK Dispatch — a smoke run through the app in headless Chromium.
//
//   node dispatch/tests/smoke.mjs
//
// Serves the repo on a local port, stands in for Supabase with a small mock,
// and walks the screens the way a phone would: the landing page, the board,
// a job, the diary picker, forward works (calendar, sheet, scoped switch,
// a line made into a job) and a printout. Prints what it saw; ends with
// ERRORS: none when nothing threw in the page. Needs Playwright with
// Chromium on the machine (PLAYWRIGHT_PATH points at its index.mjs if it
// is not the default below).
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const PW = process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- a static server for the app -------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const site = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, u.endsWith('/') ? u + 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => site.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${site.address().port}/dispatch/`;

// ---- a stand-in for Supabase -------------------------------------------------
const db = { projects: [], project_docs: [], diary_entries: [], job_costs: [], crew_people: [], forward_works: [] };
const log = [];
const api = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
  const send = (code, body, extra) => { res.writeHead(code, Object.assign({ 'content-type': 'application/json' }, cors, extra || {})); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', () => {
    if (url.pathname.startsWith('/storage/v1/object/dispatch-files/')) { log.push('STORE'); return send(200, { Key: 'x' }); }
    const table = url.pathname.replace('/rest/v1/', '');
    if (!db[table]) return send(404, { message: 'no table' });
    const payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};
    if (req.method === 'GET') { const off = +(url.searchParams.get('offset') || 0); const rows = db[table].slice(off); return send(200, rows, { 'content-range': `${off}-${off + rows.length - 1}/${db[table].length}` }); }
    if (req.method === 'POST') { if (table === 'projects') payload.number = db.projects.length + 1; db[table].push(payload); log.push(`POST ${table}`); return send(201, [payload]); }
    if (req.method === 'PATCH') { const id = url.searchParams.get('id').replace(/^eq\./, ''); const r = db[table].find(x => x.id === id); if (r) Object.assign(r, payload); log.push(`PATCH ${table}`); return send(204); }
    if (req.method === 'DELETE') { const id = url.searchParams.get('id').replace(/^eq\./, ''); db[table] = db[table].filter(x => x.id !== id); log.push(`DELETE ${table}`); return send(204); }
    send(405, {});
  });
});
await new Promise(r => api.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${api.address().port}`;

// ---- the walk ----------------------------------------------------------------
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 414, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Emulsion spray started' : undefined));
const t = s => p.waitForTimeout(s);
const text = sel => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const has = sel => p.evaluate(s => !!document.querySelector(s), sel);
const setRole = async role => { await p.evaluate(([r, api]) => { localStorage.setItem('rckd.settings', JSON.stringify({ supabaseUrl: api, supabaseKey: 'anon-test', name: 'Sam Shah', role: r, localMode: false })); }, [role, API]); await p.reload(); await t(1200); };
const now = new Date(); const M = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const D = n => `${M}-${String(n).padStart(2, '0')}`;
const tmp = path.join(ROOT, 'dispatch', 'tests', '.scope.pdf'); fs.writeFileSync(tmp, '%PDF-1.4 fake scope');
const check = (label, ok, extra) => { console.log(`  ${ok ? 'ok ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`); if (!ok) errs.push('CHECK: ' + label); };

await p.goto(BASE); await t(300); await p.evaluate(() => localStorage.clear());

console.log('=== landing page and bar ===');
await setRole('supervisor'); await p.goto(BASE + '#/'); await t(500);
check('supervisor bar is Jobs, Crew, Log', (await p.evaluate(() => Array.from(document.querySelectorAll('#tabbar a')).filter(a => !a.hidden).map(a => a.textContent.trim()))).join(',') === 'Jobs,Crew,Log');
await setRole('office'); await p.goto(BASE + '#/'); await t(500);
check('office bar adds Forward works', (await p.evaluate(() => Array.from(document.querySelectorAll('#tabbar a')).filter(a => !a.hidden).map(a => a.textContent.trim()))).join(',') === 'Jobs,Crew,Forward works,New job');
check('logo and name up top', await has('.home-brand img.logo') && (await text('.home-brand .who b')) === 'Sam');
check('four figures', (await p.evaluate(() => document.querySelectorAll('.stat.home > a').length)) === 4);
check('go-to list has three ways in', (await p.evaluate(() => document.querySelectorAll('.navlist a').length)) === 3);

console.log('=== the board and a job ===');
const ids = await p.evaluate(async () => {
  const out = [];
  for (const [name, status, s, e] of [['Great South Rd', 'ongoing', '2026-01-01', '2026-12-31'], ['Te Irirangi Dr', 'planned', null, null], ['Old job', 'completed', '2026-01-01', '2026-01-02']]) {
    const r = await createJob({ name, client: 'AT', crew: 'green', work_type: 'milling', start_date: s, end_date: e, supervisor: 'Noel' });
    if (status !== 'planned') await Store.patch('projects', r.id, { status, started_at: new Date().toISOString(), completed_at: status === 'completed' ? new Date().toISOString() : null });
    out.push(r.id);
  }
  await addEntry(out[0], { kind: 'prestart', label: 'Prestart', body: 'old kind' }, []);
  return out;
});
await p.goto(BASE + '#/jobs'); await t(300); await p.goto(BASE + '#/'); await t(600);
check('landing page lists the job on site', (await p.evaluate(() => Array.from(document.querySelectorAll('.job-row.compact .ttl')).map(e => e.textContent))).includes('Great South Rd'));
await p.goto(BASE + '#/jobs'); await t(600);
const cards = () => p.evaluate(() => Array.from(document.querySelectorAll('.job-card .name')).map(e => e.textContent.trim()));
check('board rests on planned + on site', (await cards()).join(',') === 'Great South Rd,Te Irirangi Dr', (await cards()).join(','));
check('date line drawn with a dot', await has('.job-card .dline .now'));
await p.click('.tally button[data-status="completed"]'); await t(300);
check('Completed pill shows the completed job', (await cards()).join(',') === 'Old job');
await p.click('.tally button[data-status="completed"]'); await t(300);
check('pressed again goes back', (await cards()).length === 2);
await p.goto(BASE + '#/job/' + ids[0]); await t(600);
const jtxt = await p.evaluate(() => document.querySelector('#view').textContent.replace(/\s+/g, ' '));
check('job page without the old blurbs', !['Last entry', 'Profit', 'full job report', 'Archiving takes', 'destroys'].some(x => jtxt.includes(x)));

console.log('=== what happened? ===');
await p.goto(BASE + '#/entry/' + ids[0]); await t(600);
const opts = await p.evaluate(() => Array.from(document.querySelectorAll('#kind option')).map(o => o.textContent));
check('nine types, a placeholder and add-new', opts.length === 11 && opts[1] === 'Milling started' && opts[9] === 'Job complete', opts.join('|'));
await p.fill('#body', 'x'); await p.click('#save'); await t(300);
check('save without a pick refused', (await text('.toast, #toast')) === 'Pick what happened');
await p.selectOption('#kind', '__new'); await t(300); await p.fill('#time', '07:15'); await p.click('#save'); await t(700);
const last = db.diary_entries[db.diary_entries.length - 1];
check('added type saved on the entry only', last && last.label === 'Emulsion spray started');
await p.goto(BASE + '#/entry/' + ids[0]); await t(500);
check('next picker does not list it', !(await p.evaluate(() => Array.from(document.querySelectorAll('#kind option')).some(o => o.textContent === 'Emulsion spray started'))));

console.log('=== forward works ===');
await p.goto(BASE + '#/forward'); await t(600);
check('month tiles present', await has('.fwstats .big'));
const add = async (client, site, crew, shift, value, day, ndays, how) => {
  await p.click('#fwAdd'); await t(300);
  await p.fill('#fwClient', client); await p.fill('#fwSite', site); await p.fill('#fwDate', day);
  if (ndays) await p.fill('#fwNDays', String(ndays));
  await p.selectOption('#fwCrew', crew); await p.selectOption('#fwShift', shift); await p.fill('#fwValue', String(value));
  if (how === 'switch') { await p.click('.switch'); await t(200); }
  else if (how === 'file') { const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('#fwScopeBtn')]); await ch.setFiles(tmp); await t(600); }
  await p.click('#fwSave'); await t(700);
};
await add('Downer', 'Te Irirangi Dr', 'green', 'day', 125000, D(3), 1, 'file');
await add('Auckland Transport', 'Great South Rd', 'milling', 'night', 48000, D(3), 2);
await add('Fulton Hogan', 'SH16 Kumeu', 'milling', 'night', 36500, D(10));
await add('Auckland Council', 'Pakuranga carpark', 'chipseal', 'day', 18200, D(3), 1, 'switch');
check('four lines, two scoped (one by file, one by switch)', db.forward_works.length === 4 && db.forward_works.filter(r => r.scoped).length === 2 && db.forward_works.filter(r => r.scope_url).length === 1);
await p.evaluate(() => { document.querySelectorAll('.fw-wh[data-week]').forEach(b => { if (b.getAttribute('aria-expanded') === 'false') b.click(); }); }); await t(400);
check('night lines red, unscoped pink', (await p.evaluate(() => document.querySelectorAll('.fw-ent.night').length)) === 3 && (await p.evaluate(() => document.querySelectorAll('.fw-ent.unscoped').length)) === 3);
check('two-day spell continues onto the next day', (await p.evaluate(d => document.querySelectorAll(`#day-${d} .fw-ent.cont`).length, D(4))) === 1);
await p.click(`.fw-cal .d[data-day="${D(10)}"]`); await t(400);
check('a day on its own', (await p.evaluate(() => document.querySelectorAll('.fw-week').length)) === 1 && await has('#fwAllWeeks'));
await p.click('#fwAllWeeks'); await t(300);
await p.evaluate(() => { document.querySelectorAll('.fw-wh[data-week]').forEach(b => { if (b.getAttribute('aria-expanded') === 'false') b.click(); }); }); await t(300);
await p.evaluate(() => document.querySelector('.fw-ent.unscoped').scrollIntoView({ block: 'center' })); await t(200);
const y = await p.evaluate(() => window.scrollY);
await p.evaluate(() => document.querySelector('.fw-ent.unscoped').click()); await t(500);
check('a line opens in the sheet and the page stays put', await has('.bsheet .sh-facts') && Math.abs((await p.evaluate(() => window.scrollY)) - y) < 60);
await p.click('.sh-switch .switch'); await t(600);
check('quick switch saves scoped', db.forward_works.filter(r => r.scoped).length === 3 && log.includes('PATCH forward_works'));
await p.click('#shScrim'); await t(300);
await p.evaluate(() => { document.querySelectorAll('.fw-wh[data-week]').forEach(b => { if (b.getAttribute('aria-expanded') === 'false') b.click(); }); }); await t(300);
await p.click('.fw-ent'); await t(300); await p.click('#shMakeJob'); await t(600);
check('make a job opens the form prefilled', (await p.evaluate(() => location.hash)) === '#/new' && (await p.evaluate(() => document.querySelector('#client').value)) === 'Downer');
await p.click('#save'); await t(1000);
check('job made, line linked, scope document on the job', db.projects.length === 4 && !!db.forward_works[0].project_id && db.project_docs.some(d => d.kind === 'scope'));
await p.goto(BASE + '#/forward'); await t(500);
await p.evaluate(() => printForwardMonth(fwMonth())); await t(1200);
check('the month prints week by week', (await p.evaluate(() => document.querySelectorAll('#printArea table.fwp').length)) >= 2);
await p.evaluate(() => document.querySelector('#printArea').innerHTML = '');

console.log('\nERRORS:', errs.length ? errs.join('\n') : 'none');
fs.unlinkSync(tmp);
await b.close(); site.close(); api.close();
process.exit(errs.length ? 1 : 0);
