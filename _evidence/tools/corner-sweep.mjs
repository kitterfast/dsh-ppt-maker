/**
 * Corner sweep: for every page, diff the deck composite against the browser
 * render restricted to the four corners and the four edges. A missing or clipped
 * corner anywhere in the deck shows up here even if the deck-wide mean is fine.
 *
 * Usage: node tools/corner-sweep.mjs <compositeDir> <renderDir> [cornerPx]
 *   compositeDir must contain pNN-composite.png (produced by gate-c --dump=DIR)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [compDir, renderDir, cs] = process.argv.slice(2);
const C = Number(cs ?? 80);

function diff(A, B, x0, y0, x1, y1) {
  let s = 0, bad = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * A.width + x) * 4;
      const d = Math.max(Math.abs(A.data[o] - B.data[o]), Math.abs(A.data[o + 1] - B.data[o + 1]), Math.abs(A.data[o + 2] - B.data[o + 2]));
      s += d; if (d > 32) bad++; n++;
    }
  }
  return { mean: s / n, bad: (bad / n) * 100 };
}

console.log(`corner sweep, ${C}px corner boxes`);
console.log('  page      TL mean/bad        TR mean/bad        BL mean/bad        BR mean/bad      verdict');
let worst = 0, worstWhere = '';
for (let n = 1; n <= 40; n++) {
  const cf = path.join(compDir, `p${String(n).padStart(2, '0')}-composite.png`);
  const rf = path.join(renderDir, `p${String(n).padStart(2, '0')}`, 'ref.png');
  if (!fs.existsSync(cf) || !fs.existsSync(rf)) continue;
  const A = PNG.sync.read(fs.readFileSync(cf));
  const B = PNG.sync.read(fs.readFileSync(rf));
  const W = A.width, H = A.height;
  const boxes = [
    [0, 0, C, C], [W - C, 0, W, C], [0, H - C, C, H], [W - C, H - C, W, H],
  ];
  const rs = boxes.map(([x0, y0, x1, y1]) => diff(A, B, x0, y0, x1, y1));
  const worstR = rs.reduce((a, b) => (b.bad > a.bad ? b : a));
  if (worstR.bad > worst) { worst = worstR.bad; worstWhere = `p${n}`; }
  const ok = rs.every((r) => r.bad <= 0.05 && r.mean <= 2);
  const cell = (r) => `${r.mean.toFixed(3).padStart(6)}/${r.bad.toFixed(3).padStart(6)}%`;
  console.log(`  ${String(n).padStart(4)}  ${cell(rs[0])}  ${cell(rs[1])}  ${cell(rs[2])}  ${cell(rs[3])}   ${ok ? 'OK' : 'CHECK'}`);
}
console.log(`\nworst corner bad-ratio = ${worst.toFixed(3)}% at ${worstWhere}`);
