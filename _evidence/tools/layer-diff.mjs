// Per-layer pixel diff WITH alignment search. The rebuilt clip can start one
// pixel earlier than the baseline's, which shifts every glyph edge and shows up
// as a large "difference" that is really just a crop-origin offset. Search a
// small window, then report the residual at the best alignment.
// Usage: node tools/layer-diff.mjs <oracleMedia> <oursMedia> [maxOffset]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [oracleDir, oursDir] = process.argv.slice(2);
const R = Number(process.argv[4] ?? 3);

function load(dir, name) {
  // pngjs cannot decode GIF; the animated layers are compared separately.
  if (!name.endsWith('.png')) return null;
  const f = path.join(dir, name);
  return fs.existsSync(f) ? PNG.sync.read(fs.readFileSync(f)) : null;
}

function diffAt(a, b, dx, dy, step, w, h) {
  let sum = 0, bad = 0, n = 0;
  for (let y = 0; y < h; y += step) {
    const ay = y, by = y + dy;
    if (ay < 0 || ay >= a.height || by < 0 || by >= b.height) continue;
    for (let x = 0; x < w; x += step) {
      const ax = x, bx = x + dx;
      if (ax < 0 || ax >= a.width || bx < 0 || bx >= b.width) continue;
      const o = (ay * a.width + ax) * 4, q = (by * b.width + bx) * 4;
      const d = Math.max(
        Math.abs(a.data[o] - b.data[q]),
        Math.abs(a.data[o + 1] - b.data[q + 1]),
        Math.abs(a.data[o + 2] - b.data[q + 2]),
        Math.abs(a.data[o + 3] - b.data[q + 3]),
      );
      sum += d; if (d > 32) bad++; n++;
    }
  }
  return n ? { mean: sum / n, badPc: (bad / n) * 100, n } : { mean: 1e9, badPc: 100, n: 0 };
}

let gSum = 0, gN = 0, gBad = 0, shifted = 0, unmatched = 0;
for (let s = 1; s <= 11; s++) {
  const rows = [];
  for (let k = 1; k <= 14; k++) {
    for (const ext of ['png', 'gif']) {
      const name = `image-${s}-${k}.${ext}`;
      if (!fs.existsSync(path.join(oracleDir, name))) continue;
      const a = load(oracleDir, name), b = load(oursDir, name);
      if (!a || !b) { rows.push(`${name.padEnd(18)} MISSING in ${a ? 'ours' : 'oracle'}`); unmatched++; continue; }
      const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
      let best = null;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const r = diffAt(a, b, dx, dy, 3, w, h);
        if (!best || r.mean < best.mean) best = { ...r, dx, dy };
      }
      const exact = diffAt(a, b, best.dx, best.dy, 1, w, h);
      gSum += exact.mean * exact.n; gN += exact.n; gBad += (exact.badPc / 100) * exact.n;
      const off = best.dx || best.dy;
      if (off) shifted++;
      const flag = exact.mean <= 3 && exact.badPc <= 1 ? '  ' : '<<';
      rows.push(
        `${name.padEnd(18)} ${String(a.width).padStart(5)}x${String(a.height).padStart(5)}  ` +
        `mean=${exact.mean.toFixed(2).padStart(7)}  bad>32=${exact.badPc.toFixed(2).padStart(5)}%${flag}` +
        (off ? `  offset(${best.dx},${best.dy})` : ''),
      );
    }
  }
  const bad = rows.filter((r) => r.includes('<<')).length;
  console.log(`\n-- slide ${s} --${bad ? `  ${bad} layer(s) still differ` : '  all layers match'}`);
  for (const r of rows) console.log('   ' + r);
}
console.log(`\nDECK TOTAL at best alignment: mean=${(gSum / gN).toFixed(2)}  bad>32=${((gBad / gN) * 100).toFixed(2)}%  over ${gN} px`);
console.log(`${shifted} layer(s) needed a crop-origin offset, ${unmatched} missing`);
