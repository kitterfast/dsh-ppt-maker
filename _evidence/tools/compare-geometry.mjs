// Pair each measured per-class union box with the baseline deck's layer box.
// Usage: node tools/compare-geometry.mjs <oracleDir> [geometryJson]
import fs from 'node:fs';
import path from 'node:path';

const oracleRoot = process.argv[2];
const geoFile = process.argv[3] ?? 'reports/geometry.json';
const geo = JSON.parse(fs.readFileSync(geoFile, 'utf8'));

function pics(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /<p:pic>([\s\S]*?)<\/p:pic>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const nv = /<p:cNvPr id="(\d+)" name="([^"]*)"/.exec(b);
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(b);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(b);
    out.push({
      id: nv ? +nv[1] : null,
      x: off ? +off[1] / 9525 : null, y: off ? +off[2] / 9525 : null,
      w: ext ? +ext[1] / 9525 : null, h: ext ? +ext[2] / 9525 : null,
    });
  }
  return out;
}

const CLS_ORDER = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
const f = (n) => (n === null || n === undefined ? '  -  ' : n.toFixed(1).padStart(6));

for (const slideKey of Object.keys(geo)) {
  const n = Number(slideKey) + 1;
  const file = path.join(oracleRoot, 'ppt', 'slides', `slide${n}.xml`);
  if (!fs.existsSync(file)) continue;
  const layers = pics(file).slice(1); // [0] is the base
  const classes = CLS_ORDER.filter((c) => geo[slideKey][c]);
  console.log(`\n=== slide ${n}   oracle layers=${layers.length}  classes=${classes.length} ===`);
  console.log('  cls        oracle (x,y,w,h)          ink union (x,y,w,h)        pad@ink        layout union (x,y,w,h)     pad@layout');
  for (let i = 0; i < Math.max(layers.length, classes.length); i++) {
    const L = layers[i];
    const c = classes[i];
    const g = c ? geo[slideKey][c] : null;
    if (!L) { console.log(`  ${(c || '?').padEnd(4)} (no oracle layer)  ink ${g ? [g.ink.x, g.ink.y, g.ink.w, g.ink.h].map(f).join(' ') : ''}`); continue; }
    if (!g) { console.log(`  ${'?'.padEnd(4)} oracle ${[L.x, L.y, L.w, L.h].map(f).join(' ')}   (no measured class)`); continue; }
    const padInk = `x${f(L.x - g.ink.x)} y${f(L.y - g.ink.y)} w${f((L.w - g.ink.w) / 2)} h${f((L.h - g.ink.h) / 2)}`;
    const padLay = `x${f(L.x - g.layout.x)} y${f(L.y - g.layout.y)} w${f((L.w - g.layout.w) / 2)} h${f((L.h - g.layout.h) / 2)}`;
    console.log(
      `  ${c.padEnd(4)} n=${g.n}  ${[L.x, L.y, L.w, L.h].map(f).join(' ')}   ${[g.ink.x, g.ink.y, g.ink.w, g.ink.h].map(f).join(' ')}   ${padInk}   ${[g.layout.x, g.layout.y, g.layout.w, g.layout.h].map(f).join(' ')}   ${padLay}`,
    );
  }
}
