/**
 * Page-by-page WPS comparison.
 *
 * For every page it reports three things:
 *   1. A/B   - baseline settled frame vs ours (the direct "same as the proven deck" test)
 *   2. ours  - our settled frame vs the browser's own render of that page
 *   3. base  - baseline settled frame vs the same browser render
 * (2) and (3) matter because a deck can match the other deck while both drift from
 * the source; comparing both against the render says which one the source agrees with.
 *
 * Usage: node tools/wps-pages-diff.mjs <oracleDir> <oursDir> <renderDir> [settledIndex]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [oDir, uDir, renderDir] = process.argv.slice(2);
const settledIdx = Number(process.argv[5] ?? 15);

function resize(src, W, H) {
  const out = new PNG({ width: W, height: H });
  const sx = src.width / W, sy = src.height / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(src.height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(src.height - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(src.width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(src.width - 1, x0 + 1), wx = fx - x0;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p00 = src.data[(y0 * src.width + x0) * 4 + c], p01 = src.data[(y0 * src.width + x1) * 4 + c];
        const p10 = src.data[(y1 * src.width + x0) * 4 + c], p11 = src.data[(y1 * src.width + x1) * 4 + c];
        const top = p00 + (p01 - p00) * wx, bot = p10 + (p11 - p10) * wx;
        out.data[o + c] = Math.round(top + (bot - top) * wy);
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

function diff(A, B) {
  if (A.width !== B.width || A.height !== B.height) return { mean: NaN, bad: NaN };
  const N = A.width * A.height;
  let s = 0, bad = 0;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(A.data[o] - B.data[o]), Math.abs(A.data[o + 1] - B.data[o + 1]), Math.abs(A.data[o + 2] - B.data[o + 2]));
    s += d; if (d > 24) bad++;
  }
  return { mean: s / N, bad: (bad / N) * 100 };
}

const pages = fs.readdirSync(oDir).filter((d) => /^p\d+$/.test(d)).sort();
console.log(`settled frame compared = f${String(settledIdx).padStart(2, '0')} of each page's burst`);
console.log('  page   A/B mean/bad          ours vs HTML           baseline vs HTML');
let as = 0, ab = 0, an = 0, os = 0, ob = 0, bs = 0, bb = 0;
for (const p of pages) {
  const fo = path.join(oDir, p, `f${String(settledIdx).padStart(2, '0')}.png`);
  const fu = path.join(uDir, p, `f${String(settledIdx).padStart(2, '0')}.png`);
  if (!fs.existsSync(fo) || !fs.existsSync(fu)) { console.log(`  ${p}   MISSING frame`); continue; }
  const A = PNG.sync.read(fs.readFileSync(fo));
  const B = PNG.sync.read(fs.readFileSync(fu));
  const abr = diff(A, B);

  // our frame's exact size is fixed per capture; the render is resized to match
  const refPath = path.join(renderDir, p, 'ref.png');
  let our = { mean: NaN, bad: NaN }, bas = { mean: NaN, bad: NaN };
  if (fs.existsSync(refPath)) {
    const R = resize(PNG.sync.read(fs.readFileSync(refPath)), A.width, A.height);
    our = diff(B, R);
    bas = diff(A, R);
  }
  const n = A.width * A.height;
  as += abr.mean * n; ab += (abr.bad / 100) * n; an += n;
  os += our.mean * n; ob += (our.bad / 100) * n;
  bs += bas.mean * n; bb += (bas.bad / 100) * n;
  const cell = (r) => `${r.mean.toFixed(2).padStart(6)}/${r.bad.toFixed(3).padStart(6)}%`;
  console.log(`  ${p}   ${cell(abr)}          ${cell(our)}          ${cell(bas)}`);
}
const nPages = an / (1920 * 1080);
console.log(`\n  A/B           : mean=${(as / an).toFixed(2)}  bad>24=${((ab / an) * 100).toFixed(3)}%   over ${nPages} pages`);
console.log(`  ours vs HTML  : mean=${(os / an).toFixed(2)}  bad>24=${((ob / an) * 100).toFixed(3)}%`);
console.log(`  base vs HTML  : mean=${(bs / an).toFixed(2)}  bad>24=${((bb / an) * 100).toFixed(3)}%`);
