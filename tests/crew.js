/* Crew: people are whoever has done something; a day is what they posted —
   and a note on your own day can carry photos.

   Run:  node tests/crew.js   (needs playwright and the chromium it expects) */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const T = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('no'); }
  r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
const errors = []; const fail = m => { errors.push(m); console.log('  ✗ ' + m); };
const ok = m => console.log('  ✓ ' + m);
const B = 'http://localhost:8074';
const tidy = s => String(s || '').replace(/\s+/g, ' ').trim();
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const png = name => ({ name, mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });

(async () => {
  await new Promise(r => server.listen(8074, r));
  const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => fail('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fail('console: ' + m.text()); });

  const as = async (n, role) => {
    await page.evaluate(([name, r]) => { const s = JSON.parse(localStorage.getItem('rckw.settings'));
      s.name = name; if (r) s.role = r; localStorage.setItem('rckw.settings', JSON.stringify(s)); }, [n, role]);
    await page.reload(); await page.waitForTimeout(400);
  };
  const raise = async (code, sev, title, photos) => {
    await page.goto(B + '/#/report'); await page.waitForTimeout(350);
    const id = await page.evaluate(c => DB.gear.find(g => g.code === c).id, code);
    await page.selectOption('#gearSel', id);
    await page.fill('#woTitle', title);
    await page.click(`[data-sev="${sev}"]`);
    if (photos) await page.setInputFiles('#photos', Array.from({ length: photos }, (_, i) => png(`p${i}.png`)));
    await page.waitForTimeout(300);
    await page.click('#submit'); await page.waitForTimeout(900);
    return page.evaluate(() => DB.work_orders[DB.work_orders.length - 1].id);
  };
  const comment = async (wo, text) => {
    await page.goto(B + '/#/wo/' + wo); await page.waitForTimeout(400);
    await page.fill('#cmt', text);
    await page.click('#postCmt'); await page.waitForTimeout(600);
  };

  await page.goto(B + '/');
  await page.evaluate(() => localStorage.setItem('rckw.settings', JSON.stringify({
    supabaseUrl:'', supabaseKey:'', name:'Shyamal', role:'workshop', localMode:true })));
  await page.reload(); await page.waitForTimeout(500);
  await page.goto(B + '/#/gearadmin'); await page.waitForTimeout(300);
  await page.click('#seed'); await page.waitForTimeout(1600);

  // --- the door ---------------------------------------------------------------
  await page.goto(B + '/#/'); await page.waitForTimeout(500);
  const hub = await page.locator('.hub-card b').allTextContents();
  JSON.stringify(hub) === '["Maintenance","Crew","Manuals"]' ? ok('landing page: ' + hub.join(' / ')) : fail('hub: ' + hub.join(', '));
  await page.click('.hub-card[href="#/crew"]'); await page.waitForTimeout(500);
  const first = await page.locator('.person .pv-name').allTextContents();
  first.length === 1 && /Shyamal/.test(first[0]) && /you/.test(first[0])
    ? ok('only you are listed until someone does something — and you are marked as you') : fail('people: ' + JSON.stringify(first));

  // --- people come from use ---------------------------------------------------
  const a = await raise('MIL-02', 'red', 'Belt torn', 2);
  await as('Mil');
  await comment(a, 'Belt off, ordering a new one from Beltline.');
  await raise('ROL-03', 'orange', 'Spray blocked');
  await as('Clint');
  await as('Barry');
  await raise('TRK-05', 'red', 'Air leak');
  await page.goto(B + '/#/crew'); await page.waitForTimeout(600);
  const names = await page.locator('.person .pv-name').allTextContents();
  ['Barry', 'Mil', 'Shyamal'].every(n => names.some(t => t.startsWith(n)))
    ? ok('everyone who has done something is listed: ' + names.map(tidy).join(', ')) : fail('people: ' + JSON.stringify(names));
  names[0].startsWith('Barry') ? ok('most recently active first') : fail('order: ' + names.join(', '));

  // --- assigning ------------------------------------------------------------------
  await as('Shyamal', 'workshop');
  await page.goto(B + '/#/wo/' + a); await page.waitForTimeout(400);
  const options = await page.locator('#wAssign option').allTextContents();
  ['Mil', 'Barry'].every(n => options.includes(n)) && options.includes('Someone else…')
    ? ok('the assign picker offers the people using the app') : fail('options: ' + JSON.stringify(options));
  await page.selectOption('#wAssign', 'Mil'); await page.click('#wSave'); await page.waitForTimeout(700);
  /Assigned to\s*Mil/.test(tidy(await page.locator('table.data').textContent())) ? ok('assignment shown on the job') : fail('assigned-to row missing');

  // --- a person's day ---------------------------------------------------------
  await page.goto(B + '/#/crew/Mil'); await page.waitForTimeout(600);
  const kinds = await page.locator('.log-kind').allTextContents();
  JSON.stringify(kinds) === '["Comment","Damage reported"]' ? ok("Mil's day, in order: " + kinds.join(' → ')) : fail('day: ' + JSON.stringify(kinds));
  (await page.locator('#pNote').count()) === 0 ? ok("you can't add notes to someone else's day") : fail('note box on another person');
  await page.goto(B + '/#/crew/Shyamal'); await page.waitForTimeout(600);
  (await page.locator('.log-kind').allTextContents()).includes('2 photos') ? ok('two photos uploaded together on a job read as one line') : fail('job photos not folded');

  // --- your own day: notes, and notes with photos -----------------------------
  await as('Mil');
  await page.goto(B + '/#/crew/Mil'); await page.waitForTimeout(600);
  (await page.locator('#pNote').count()) === 1 ? ok('on your own page there is a note box') : fail('no note box');
  (await page.locator('#pPick').count()) === 1 ? ok('with an Add photos button beside it') : fail('no photo button');
  await page.fill('#pNote', 'Drove to Ngaruawahia to look at the paver.');
  await page.click('#pPost'); await page.waitForTimeout(700);
  let lines = await page.locator('.log-kind').allTextContents();
  lines.length === 3 && lines[2] === 'Note' ? ok('a plain note sits in the day') : fail('after note: ' + JSON.stringify(lines));

  await page.setInputFiles('#pPhotos', [png('a.png'), png('b.png')]); await page.waitForTimeout(200);
  tidy(await page.locator('#pPicked').textContent()) === '2 photos chosen' ? ok('the box says how many photos are chosen') : fail('picked text wrong');
  await page.fill('#pNote', 'Worn edge on the paver screed, for the record.');
  await page.click('#pPost'); await page.waitForTimeout(1200);
  lines = await page.locator('.log-kind').allTextContents();
  lines.length === 4 && lines[3] === 'Note' ? ok('a note with two photos is one line in the day, not three') : fail('lines: ' + JSON.stringify(lines));
  (await page.locator('.log-item').last().locator('img').count()) === 2 ? ok('and both photos sit on the note') : fail('photos not on the note');
  const rowsNow = await page.evaluate(() => DB.wo_updates.filter(u => !u.work_order_id).map(u => u.kind));
  JSON.stringify(rowsNow) === '["note","note","file","file"]' ? ok('stored as a note row plus one file row per photo, no job on any of them') : fail('rows: ' + JSON.stringify(rowsNow));
  const leaked = await page.evaluate(id => updatesFor(id).length, a);
  leaked === 5 ? ok("and none of it leaks into any job's history") : fail('job history now has ' + leaked);

  await page.setInputFiles('#pPhotos', [png('c.png')]);
  await page.click('#pPost'); await page.waitForTimeout(1000);
  (await page.locator('.log-kind').allTextContents()).length === 5 ? ok('photos alone, with no words, are allowed too') : fail('photo-only note refused');

  await page.click('#pPrev'); await page.waitForTimeout(500);
  (await page.locator('.log-item').count()) === 0 ? ok('yesterday is empty') : fail('yesterday not empty');
  await page.click('#pNext'); await page.waitForTimeout(500);
  (await page.locator('.log-item').count()) === 5 ? ok('back to today') : fail('today lost');

  // --- the printed day ----------------------------------------------------------
  const printed = await page.evaluate(() => {
    const real = window.print; window.print = () => {};
    try { printDay('Mil', today(), dayFor('Mil', today())); } catch (e) { window.print = real; return 'ERROR ' + e.message; }
    const h = document.getElementById('printArea').innerHTML; window.print = real; return h;
  });
  if (printed.startsWith('ERROR')) fail(printed);
  /daily report/i.test(printed) && /<h2>The day<\/h2>/.test(printed) && /<h2>Asset by asset<\/h2>/.test(printed)
    ? ok('the daily report prints as a timeline, then asset by asset') : fail('print sections missing');
  /for the record\. · 2 photos/.test(printed) ? ok('and says the note carried 2 photos') : fail('print lacks the photo count');
  (printed.match(/class="asset avoid-break"/g) || []).length === 3
    ? ok('one block per asset touched, plus the notes not on a job') : fail('asset blocks: ' + (printed.match(/class="asset avoid-break"/g) || []).length);

  await browser.close(); server.close();
  console.log('\n' + (errors.length ? `FAILED — ${errors.length} problem(s)` : 'ALL CREW CHECKS PASSED'));
  process.exit(errors.length ? 1 : 0);
})();
