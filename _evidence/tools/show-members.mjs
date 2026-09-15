// Print per-member geometry for given slides/classes from reports/geometry.json
// Usage: node tools/show-members.mjs [slideNumber ...]
import fs from 'node:fs';

const geo = JSON.parse(fs.readFileSync('reports/geometry.json', 'utf8'));
const want = process.argv.slice(2).map(Number);
const slides = want.length ? want.map((n) => n - 1) : Object.keys(geo).map(Number);
const f = (n) => n.toFixed(1).padStart(7);

for (const i of slides) {
  const s = geo[i];
  if (!s) continue;
  console.log(`\n========== slide ${i + 1} ==========`);
  for (const c of Object.keys(s)) {
    const e = s[c];
    console.log(`  class ${c}  n=${e.n}   layoutUnion ${[e.layout.x, e.layout.y, e.layout.w, e.layout.h].map(f).join(' ')}`);
    if (!e.members) { console.log('    (no member detail — re-run probe)'); continue; }
    for (const m of e.members) {
      console.log(`    ${m.tag.padEnd(6)} cv=${m.canvases}  rect ${[m.rect.x, m.rect.y, m.rect.w, m.rect.h].map(f).join(' ')}   ink ${[m.ink.x, m.ink.y, m.ink.w, m.ink.h].map(f).join(' ')}  [${m.cls}] ${JSON.stringify(m.txt)}`);
    }
  }
}
