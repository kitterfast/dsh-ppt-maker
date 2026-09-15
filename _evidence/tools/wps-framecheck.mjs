/**
 * Prove a WPS frame capture is actually the slide show and not the desktop.
 *
 * The capture script grabs the whole virtual screen, so "24 PNG files exist"
 * proves nothing on its own. This reports, per frame:
 *   paper%  - share of pixels matching the deck's paper colour #f1e8d2 (the deck
 *             fills the screen during a show; a desktop would not)
 *   mean    - mean abs diff vs the previous frame (motion)
 * and the centre pixel, so a desktop capture is obvious.
 *
 * Usage: node tools/wps-framecheck.mjs <frameDir> [label]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const dir = process.argv[2];
const label = process.argv[3] ?? path.basename(dir);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
if (!files.length) { console.log(`${label}: no PNG frames`); process.exit(2); }

const PAPER = [241, 232, 210];
const TOL = 12;

let prev = null;
console.log(`${label}: ${files.length} frames in ${dir}`);
console.log('frame   paper%   white%   centre RGB      mean-vs-prev  bad%>24');
for (const f of files) {
  const p = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
  const n = p.width * p.height;
  let paper = 0, white = 0, sum = 0, bad = 0;
  const cIdx = ((p.height >> 1) * p.width + (p.width >> 1)) * 4;
  for (let i = 0; i < n; i++) {
    const o = i * 4, r = p.data[o], g = p.data[o + 1], b = p.data[o + 2];
    if (Math.abs(r - PAPER[0]) <= TOL && Math.abs(g - PAPER[1]) <= TOL && Math.abs(b - PAPER[2]) <= TOL) paper++;
    if (r > 245 && g > 245 && b > 245) white++;
    if (prev) {
      const d = Math.max(Math.abs(r - prev[o]), Math.abs(g - prev[o + 1]), Math.abs(b - prev[o + 2]));
      sum += d; if (d > 24) bad++;
    }
  }
  prev = p.data;
  const pf = ((paper / n) * 100).toFixed(1).padStart(5);
  const wf = ((white / n) * 100).toFixed(1).padStart(5);
  const centre = `${String(p.data[cIdx]).padStart(3)},${String(p.data[cIdx + 1]).padStart(3)},${String(p.data[cIdx + 2]).padStart(3)}`;
  const mean = files.indexOf(f) === 0 ? '     -' : (sum / n).toFixed(3).padStart(9);
  const badp = files.indexOf(f) === 0 ? '     -' : ((bad / n) * 100).toFixed(3).padStart(7);
  console.log(`${f}  ${pf}%  ${wf}%   ${centre}   ${mean}   ${badp}`);
}
