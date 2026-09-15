/**
 * Gate C: does the built PPTX reproduce the browser's own render of the deck?
 *
 * This is the check the earlier rounds never got to run. It composites each
 * slide exactly as the player draws it (base picture, then every layer picture in
 * document order, alpha over) and compares the result against that page's
 * render/pNN/ref.png -- the headless browser's full-page capture of the same
 * page. Both are 1280x720 at captureScale 2, so this is a direct 1:1 comparison
 * with no resampling.
 *
 * It also reports the bounding box of the differing pixels, so a localised defect
 * (a clipped corner, a missing element) identifies itself instead of hiding in a
 * deck-wide mean.
 *
 * Usage: node tools/gate-c.mjs <unpackedDeckDir> <renderDir> [label]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [deckDir, renderDir, label] = process.argv.slice(2);
const dumpArg = process.argv.find((a) => a.startsWith('--dump='));
const dumpDir = dumpArg ? dumpArg.slice(7) : null;
if (dumpDir) fs.mkdirSync(dumpDir, { recursive: true });
const EMU = 9525, SCALE = 2;
const BAD = 32;

function slidePics(n) {
  const xml = fs.readFileSync(path.join(deckDir, 'ppt', 'slides', `slide${n}.xml`), 'utf8');
  const rels = fs.readFileSync(path.join(deckDir, 'ppt', 'slides', '_rels', `slide${n}.xml.rels`), 'utf8');
  const relMap = new Map();
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]*)"/g)) relMap.set(m[1], m[2].split('/').pop());
  const out = [];
  for (const m of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
    const b = m[1];
    const emb = /r:embed="([^"]+)"/.exec(b);
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(b);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(b);
    if (!emb || !off || !ext) continue;
    // Logical (fractional) placement, as PowerPoint sees it.
    const xLog = +off[1] / EMU, yLog = +off[2] / EMU;
    out.push({
      media: relMap.get(emb[1]),
      xLog, yLog,
      wLog: +ext[1] / EMU, hLog: +ext[2] / EMU,
      // Where the PNG's pixel (0,0) actually sits, in device px. Layer captures
      // used clip = {x: round(box.x), w: floor(box.w)} at captureScale, so the
      // image is placed 1:1 at 2*round(x) -- NOT resampled into the picture box.
      // Resampling here shifted every glyph edge by up to 1px and inflated the
      // gate on its own; the instrument must not manufacture the difference.
      px: Math.round(xLog) * SCALE, py: Math.round(yLog) * SCALE, 
    });
  }
  return out;
}

function composite(n) {
  const W = 2560, H = 1440;
  const canvas = new PNG({ width: W, height: H });
  canvas.data.fill(0);
  for (const p of slidePics(n)) {
    if (!p.media || !p.media.endsWith('.png')) continue;   // GIFs checked separately
    const f = path.join(deckDir, 'ppt', 'media', p.media);
    if (!fs.existsSync(f)) continue;
    const img = PNG.sync.read(fs.readFileSync(f));
    // 1:1 blit at the capture origin -- no resampling.
    for (let y = 0; y < img.height; y++) {
      const cy = p.py + y; if (cy < 0 || cy >= H) continue;
      for (let x = 0; x < img.width; x++) {
        const cx = p.px + x; if (cx < 0 || cx >= W) continue;
        const s = (y * img.width + x) * 4, d = (cy * W + cx) * 4;
        const a = img.data[s + 3] / 255;
        canvas.data[d] = Math.round(img.data[s] * a + canvas.data[d] * (1 - a));
        canvas.data[d + 1] = Math.round(img.data[s + 1] * a + canvas.data[d + 1] * (1 - a));
        canvas.data[d + 2] = Math.round(img.data[s + 2] * a + canvas.data[d + 2] * (1 - a));
        canvas.data[d + 3] = 255;
      }
    }
  }
  return canvas;
}

const total = fs.readdirSync(path.join(deckDir, 'ppt', 'slides')).filter((f) => /^slide\d+\.xml$/.test(f)).length;
console.log(`GATE C  ${label ?? deckDir}`);
console.log(`  deck=${deckDir}`);
console.log(`  render=${renderDir}`);
console.log('  page   pics   mean    bad%>32   worst-region (x0,y0 - x1,y1)');

let gs = 0, gb = 0, gn = 0, worst = { mean: -1 };
for (let n = 1; n <= total; n++) {
  const refFile = path.join(renderDir, `p${String(n).padStart(2, '0')}`, 'ref.png');
  if (!fs.existsSync(refFile)) { console.log(`  ${String(n).padStart(4)}   (no ref.png, skipped)`); continue; }
  const A = composite(n);
  if (dumpDir) fs.writeFileSync(path.join(dumpDir, `p${String(n).padStart(2, '0')}-composite.png`), PNG.sync.write(A));
  const R = PNG.sync.read(fs.readFileSync(refFile));
  if (A.width !== R.width || A.height !== R.height) { console.log(`  ${String(n).padStart(4)}   SIZE MISMATCH ${A.width}x${A.height} vs ${R.width}x${R.height}`); continue; }
  let s = 0, bad = 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const N = A.width * A.height;
  for (let y = 0; y < A.height; y++) {
    for (let x = 0; x < A.width; x++) {
      const o = (y * A.width + x) * 4;
      const d = Math.max(Math.abs(A.data[o] - R.data[o]), Math.abs(A.data[o + 1] - R.data[o + 1]), Math.abs(A.data[o + 2] - R.data[o + 2]));
      s += d;
      if (d > BAD) { bad++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    }
  }
  const mean = s / N, badPct = (bad / N) * 100;
  gs += s; gb += bad; gn += N;
  if (mean > worst.mean) worst = { mean, badPct, page: n, x0, y0, x1, y1 };
  const region = x1 < 0 ? '-' : `${x0},${y0} - ${x1},${y1}`;
  console.log(`  ${String(n).padStart(4)}   ${String(slidePics(n).length).padStart(4)}  ${mean.toFixed(2).padStart(6)}  ${badPct.toFixed(3).padStart(8)}%   ${region}`);
}
console.log(`\n  DECK: mean=${(gs / gn).toFixed(2)}/255  bad>32=${((gb / gn) * 100).toFixed(2)}%  over ${gn} px`);
console.log(`  worst page: p${worst.page}  mean=${worst.mean.toFixed(2)}  bad=${worst.badPct.toFixed(2)}%  region ${worst.x0},${worst.y0} - ${worst.x1},${worst.y1}`);
