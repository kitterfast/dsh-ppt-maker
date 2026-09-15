/**
 * Region diff: whole image plus the four corners and four edge midpoints.
 * Used to answer "is a corner missing / clipped / different?" directly, instead
 * of inferring it from a deck-wide mean.
 *
 * Usage: node tools/region-diff.mjs <A.png> <B.png> [cornerSize]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [fa, fb, cs] = process.argv.slice(2);
const C = Number(cs ?? 80);
const A = PNG.sync.read(fs.readFileSync(fa));
const B = PNG.sync.read(fs.readFileSync(fb));
if (A.width !== B.width || A.height !== B.height) {
  console.log(`SIZE MISMATCH ${A.width}x${A.height} vs ${B.width}x${B.height}`);
  process.exit(2);
}
const W = A.width, H = A.height;

function diff(r) {
  let s = 0, bad = 0, n = 0;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const o = (y * W + x) * 4;
      const d = Math.max(Math.abs(A.data[o] - B.data[o]), Math.abs(A.data[o + 1] - B.data[o + 1]), Math.abs(A.data[o + 2] - B.data[o + 2]));
      s += d; if (d > 32) bad++; n++;
    }
  }
  return { mean: s / n, bad: (bad / n) * 100, n };
}

const regions = [
  ['whole', { x0: 0, y0: 0, x1: W, y1: H }],
  [`corner TL ${C}px`, { x0: 0, y0: 0, x1: C, y1: C }],
  [`corner TR ${C}px`, { x0: W - C, y0: 0, x1: W, y1: C }],
  [`corner BL ${C}px`, { x0: 0, y0: H - C, x1: C, y1: H }],
  [`corner BR ${C}px`, { x0: W - C, y0: H - C, x1: W, y1: H }],
  [`edge  top   ${C}px`, { x0: 0, y0: 0, x1: W, y1: C }],
  [`edge  bottom ${C}px`, { x0: 0, y0: H - C, x1: W, y1: H }],
  [`edge  left  ${C}px`, { x0: 0, y0: 0, x1: C, y1: H }],
  [`edge  right ${C}px`, { x0: W - C, y0: 0, x1: W, y1: H }],
];
console.log(`A = ${fa}`);
console.log(`B = ${fb}`);
console.log(`size ${W}x${H}\n`);
for (const [name, r] of regions) {
  const d = diff(r);
  console.log(`  ${name.padEnd(20)} mean=${d.mean.toFixed(3).padStart(8)}  bad>32=${d.bad.toFixed(3).padStart(7)}%  (${d.n} px)`);
}
