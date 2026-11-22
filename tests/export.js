/* "Everything" export: one JSON file, every table, explained at the top. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('no'); }
  r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const errors = []; const fail = m => { errors.push(m); console.log('  ✗ ' + m); };
const ok = m => console.log('  ✓ ' + m);
const B = 'http://localhost:8073';
(async () => {
  await new Promise(r => server.listen(8073, r));
  const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  const page = await (await browser.newContext({ viewport: { width: 414, height: 896 } })).newPage();
  page.on('pageerror', e => fail('pageerror: ' + e.message));
  await page.goto(B + '/');
  await page.evaluate(() => localStorage.setItem('rckw.settings', JSON.stringify({ supabaseUrl:'', supabaseKey:'', name:'Shyamal', role:'workshop', localMode:true })));
  await page.reload(); await page.waitForTimeout(400);
  await page.goto(B + '/#/gearadmin'); await page.waitForTimeout(300); await page.click('#seed'); await page.waitForTimeout(1500);
  await page.goto(B + '/#/report'); await page.waitForTimeout(300);
  await page.selectOption('#gearSel', await page.evaluate(() => DB.gear.find(g => g.code === 'MIL-02').id));
  await page.fill('#woTitle', 'Belt torn'); await page.click('[data-sev="red"]'); await page.click('#submit'); await page.waitForTimeout(700);
  await page.goto(B + '/#/reports'); await page.waitForTimeout(400);
  const text = await page.evaluate(async () => new Promise(res => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = b => { const u = orig.call(URL, b); b.text().then(res); return u; };
    document.getElementById('dump').click();
  }));
  let d; try { d = JSON.parse(text); ok(`the file is valid JSON (${text.length} bytes)`); } catch (e) { fail('not JSON'); }
  if (d) {
    d._about && /complete data export/.test(d._about.what) && d._about.tables.work_orders.includes('severity')
      ? ok('it explains itself at the top: what each table and field means') : fail('no _about block');
    d.gear.length === 33 && d.work_orders.length === 1 && d.wo_updates.length >= 1 && Array.isArray(d.manuals)
      ? ok(`every table is there: ${d.gear.length} gear, ${d.work_orders.length} work orders, ${d.wo_updates.length} updates, ${d.manuals.length} manuals`)
      : fail('tables: ' + JSON.stringify(d._about && d._about.counts));
    d.work_orders[0].gear_id === d.gear.find(g => g.code === 'MIL-02').id ? ok('ids link up across tables') : fail('ids do not link');
    d.work_orders[0].severity === 'red' && d.wo_updates[0].kind === 'created' ? ok('the rows are the real stored rows, untouched') : fail('rows altered');
  }
  await browser.close(); server.close();
  console.log('\n' + (errors.length ? `FAILED — ${errors.length} problem(s)` : 'ALL EXPORT CHECKS PASSED'));
  process.exit(errors.length ? 1 : 0);
})();
