/* Every class the app writes must have a rule in the stylesheet.
 *
 * This exists because a careless block edit to app.css once deleted the
 * landing page, the costing screen and the P&L ledger's styling in one go,
 * and it shipped: the app still worked, so nothing failed — it just came
 * out as bare underlined text on somebody's phone.
 *
 *     node dispatch/check.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'app.css'), 'utf8');
const js = readFileSync(join(here, 'app.js'), 'utf8');
const html = readFileSync(join(here, 'index.html'), 'utf8');

// Classes written as literals. Interpolated ones (status-${...}) are skipped,
// since only the halves either side of the hole can be checked usefully.
const written = new Set();
for (const src of [js, html]) {
  for (const m of src.matchAll(/class="([^"]*)"/g)) {
    if (m[1].includes('${')) continue;
    m[1].split(/\s+/).filter(Boolean).forEach(c => written.add(c));
  }
}

const missing = [...written].filter(c => !new RegExp(`\\.${c.replace(/[^\w-]/g, '')}[\\s,{:.\\[]`).test(css));

if (missing.length) {
  console.error('Classes used with no rule in app.css:\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log(`app.css covers all ${written.size} classes the app writes.`);
