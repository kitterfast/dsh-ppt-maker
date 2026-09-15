/**
 * Characterise a pixel difference: is it scattered sub-pixel noise, or solid
 * blocks of missing/extra content? A mean alone cannot tell those apart.
 *
 * Reports the magnitude histogram and the connected components of the "bad"
 * mask, so "1% of pixels differ" can be answered with "…and the largest solid
 * region is N px across" instead of a guess.
 *
 * Usage: node tools/diff-shape.mjs <A.png> <B.png> [badThreshold] [minComponentPx]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [fa, fb, bt, mc] = process.argv.slice(2);
const BAD = Number(bt ?? 24);
const MINC = Number(mc ?? 100);

const A = PNG.sync.read(fs.readFileSync(fa));
const B = PNG.sync.read(fs.readFileSync(fb));
if (A.width !== B.width || A.height !== B.height) { console.log('SIZE MISMATCH'); process.exit(2); }
const W = A.width, H = A.height, N = W * H;

const d = new Uint8Array(N);
const hist = { '0': 0, '1-7': 0, '8-15': 0, '16-23': 0, '24-47': 0, '48-95': 0, '96-191': 0, '192-255': 0 };
let sum = 0;
for (let i = 0; i < N; i++) {
  const o = i * 4;
  const v = Math.max(
    Math.abs(A.data[o] - B.data[o]),
    Math.abs(A.data[o + 1] - B.data[o + 1]),
    Math.abs(A.data[o + 2] - B.data[o + 2]),
  );
  d[i] = v; sum += v;
  if (v === 0) hist['0']++;
  else if (v < 8) hist['1-7']++;
  else if (v < 16) hist['8-15']++;
  else if (v < 24) hist['16-23']++;
  else if (v < 48) hist['24-47']++;
  else if (v < 96) hist['48-95']++;
  else if (v < 192) hist['96-191']++;
  else hist['192-255']++;
}
console.log(`A = ${fa}`);
console.log(`B = ${fb}`);
console.log(`size ${W}x${H}   mean=${(sum / N).toFixed(2)}/255   bad threshold=${BAD}\n`);
console.log('  magnitude histogram (max channel delta)');
for (const k of Object.keys(hist)) console.log(`    ${k.padStart(8)}  ${String(hist[k]).padStart(9)}  ${((hist[k] / N) * 100).toFixed(3).padStart(7)}%`);

// connected components of the bad mask (4-neighbour), iterative BFS
const seen = new Uint8Array(N);
const comps = [];
const stack = new Int32Array(N);
for (let s = 0; s < N; s++) {
  if (seen[s] || d[s] <= BAD) continue;
  let sp = 0; stack[sp++] = s; seen[s] = 1;
  let size = 0, x0 = W, y0 = H, x1 = -1, y1 = -1, peak = 0;
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % W, y = (p - x) / W;
    size++;
    if (d[p] > peak) peak = d[p];
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    if (x > 0 && !seen[p - 1] && d[p - 1] > BAD) { seen[p - 1] = 1; stack[sp++] = p - 1; }
    if (x < W - 1 && !seen[p + 1] && d[p + 1] > BAD) { seen[p + 1] = 1; stack[sp++] = p + 1; }
    if (y > 0 && !seen[p - W] && d[p - W] > BAD) { seen[p - W] = 1; stack[sp++] = p - W; }
    if (y < H - 1 && !seen[p + W] && d[p + W] > BAD) { seen[p + W] = 1; stack[sp++] = p + W; }
  }
  comps.push({ size, x0, y0, x1, y1, peak });
}
comps.sort((a, b) => b.size - a.size);
const totalBad = comps.reduce((a, c) => a + c.size, 0);
const big = comps.filter((c) => c.size >= MINC);
const bigPx = big.reduce((a, c) => a + c.size, 0);
console.log(`\n  bad pixels            : ${totalBad}  (${((totalBad / N) * 100).toFixed(3)}%)`);
console.log(`  connected components  : ${comps.length}`);
console.log(`  components >= ${MINC}px   : ${big.length}   holding ${bigPx} px = ${totalBad ? ((bigPx / totalBad) * 100).toFixed(1) : '0'}% of all bad pixels`);
console.log('\n  largest components:');
for (const c of comps.slice(0, 8)) {
  console.log(`    ${String(c.size).padStart(7)} px   bbox ${c.x0},${c.y0} - ${c.x1},${c.y1}  (${c.x1 - c.x0 + 1}x${c.y1 - c.y0 + 1})   peak delta ${c.peak}`);
}
const med = comps.length ? comps[Math.floor(comps.length / 2)].size : 0;
console.log(`\n  median component size : ${med} px`);
