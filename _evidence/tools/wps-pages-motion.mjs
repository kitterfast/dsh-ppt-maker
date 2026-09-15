/**
 * Per-page entrance evidence: does the entrance actually PLAY on every page?
 *
 * For each page's burst it reports the frame-to-frame change, so a page whose
 * entrance never ran shows a flat profile (no motion after the fade), while a
 * page whose entrance played shows a rise then a settle.
 *
 * Usage: node tools/wps-pages-motion.mjs <dirA> [dirB]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const dirs = process.argv.slice(2);
const pages = fs.readdirSync(dirs[0]).filter((d) => /^p\d+$/.test(d)).sort();

function profile(dir, p) {
  const pd = path.join(dir, p);
  const fs_ = fs.readdirSync(pd).filter((f) => f.endsWith('.png')).sort();
  const imgs = fs_.map((f) => PNG.sync.read(fs.readFileSync(path.join(pd, f))));
  const out = [];
  for (let i = 1; i < imgs.length; i++) {
    const A = imgs[i - 1], B = imgs[i];
    const N = A.width * A.height;
    let s = 0;
    for (let k = 0; k < N; k += 3) {           // stride 3: this is a shape signal
      const o = k * 4;
      s += Math.max(Math.abs(A.data[o] - B.data[o]), Math.abs(A.data[o + 1] - B.data[o + 1]), Math.abs(A.data[o + 2] - B.data[o + 2]));
    }
    out.push(s / (N / 3));
  }
  return out;
}

function settleIndex(prof, eps = 0.3) {
  for (let i = prof.length - 1; i >= 0; i--) if (prof[i] > eps) return i + 1;
  return -1;   // never moved
}

console.log('per-page frame-to-frame change (mean abs over RGB, stride 3)');
for (const dir of dirs) {
  console.log(`\n=== ${dir} ===`);
  console.log('  page   profile f01..f15'.padEnd(58) + ' peak  settleAt  verdict');
  for (const p of pages) {
    const prof = profile(dir, p);
    const peak = Math.max(...prof);
    const si = settleIndex(prof);
    const shown = prof.slice(0, 14).map((v) => v.toFixed(1).padStart(5)).join(' ');
    const verdict = peak < 0.5 ? 'NO MOTION' : (si >= 0 ? `plays, settles f${String(si + 1).padStart(2, '0')}` : 'never settles');
    console.log(`  ${p}  ${shown}   ${peak.toFixed(1).padStart(5)}  ${String(si).padStart(6)}    ${verdict}`);
  }
}
