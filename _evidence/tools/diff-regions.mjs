// Locate the pixels that differ between two layer PNGs and write side-by-side
// crops of the worst region, so a difference can be SEEN rather than inferred.
// Usage: node tools/diff-regions.mjs <oraclePng> <oursPng> <outPrefix>
import fs from 'node:fs';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [fa, fb, outPrefix] = process.argv.slice(2);
const a = PNG.sync.read(fs.readFileSync(fa));
const b = PNG.sync.read(fs.readFileSync(fb));
const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);

// best coarse alignment
let best = null;
for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
  let sum = 0, n = 0;
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
    const ax = x, ay = y, bx = x + dx, by = y + dy;
    if (bx < 0 || bx >= b.width || by < 0 || by >= b.height) continue;
    const o = (ay * a.width + ax) * 4, q = (by * b.width + bx) * 4;
    sum += Math.max(Math.abs(a.data[o] - b.data[q]), Math.abs(a.data[o + 1] - b.data[q + 1]), Math.abs(a.data[o + 2] - b.data[q + 2]), Math.abs(a.data[o + 3] - b.data[q + 3]));
    n++;
  }
  const mean = n ? sum / n : 1e9;
  if (!best || mean < best.mean) best = { mean, dx, dy };
}
console.log(`size ${a.width}x${a.height} vs ${b.width}x${b.height}; best offset (${best.dx},${best.dy}) mean=${best.mean.toFixed(2)}`);

// bbox of differing pixels at that offset, plus a coarse 40x40 block histogram
let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, bad = 0, n = 0;
const blocks = new Map();
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const bx = x + best.dx, by = y + best.dy;
  if (bx < 0 || bx >= b.width || by < 0 || by >= b.height) continue;
  const o = (y * a.width + x) * 4, q = (by * b.width + bx) * 4;
  const d = Math.max(Math.abs(a.data[o] - b.data[q]), Math.abs(a.data[o + 1] - b.data[q + 1]), Math.abs(a.data[o + 2] - b.data[q + 2]), Math.abs(a.data[o + 3] - b.data[q + 3]));
  n++;
  if (d > 32) {
    bad++;
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
    const k = `${Math.floor(x / 60)},${Math.floor(y / 60)}`;
    blocks.set(k, (blocks.get(k) || 0) + 1);
  }
}
console.log(`differing >32: ${bad} px (${((bad / n) * 100).toFixed(2)}%)`);
if (x1 < 0) { console.log('no differing pixels'); process.exit(0); }
console.log(`bbox x ${x0}..${x1}  y ${y0}..${y1}`);
const top = [...blocks.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8);
console.log('worst 60x60 blocks (col,row => count):', top.map(([k, v]) => `${k}=>${v}`).join('  '));

// crop a 60px-block region and write oracle|ours stacked, 3x scaled
const [ck, cv] = top[0];
const [cc, cr] = ck.split(',').map(Number);
const pad = 40;
const cx = Math.max(0, cc * 60 - pad), cy = Math.max(0, cr * 60 - pad);
const cw = Math.min(220, w - cx), ch = Math.min(120, h - cy);
const outW = cw * 3, outH = ch * 6 + 12;
const out = new PNG({ width: outW, height: outH });
out.data.fill(255);
function blit(src, ox, oy, dx, dy) {
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const sx = ox + x, sy = oy + y;
    if (sx < 0 || sx >= src.width || sy < 0 || sy >= src.height) continue;
    const o = (sy * src.width + sx) * 4;
    const al = src.data[o + 3] / 255;
    const r = Math.round(src.data[o] * al + 255 * (1 - al));
    const g = Math.round(src.data[o + 1] * al + 255 * (1 - al));
    const bl = Math.round(src.data[o + 2] * al + 255 * (1 - al));
    for (let sy2 = 0; sy2 < 3; sy2++) for (let sx2 = 0; sx2 < 3; sx2++) {
      const px = (dx + x * 3 + sx2), py = (dy + y * 3 + sy2);
      if (px < 0 || px >= outW || py < 0 || py >= outH) continue;
      const t = (py * outW + px) * 4;
      out.data[t] = r; out.data[t + 1] = g; out.data[t + 2] = bl; out.data[t + 3] = 255;
    }
  }
}
blit(a, cx, cy, 0, 0);
blit(b, cx + best.dx, cy + best.dy, 0, ch * 3 + 12);
fs.writeFileSync(`${outPrefix}.png`, PNG.sync.write(out));
console.log(`wrote ${outPrefix}.png  (top = baseline, bottom = ours; region ${cx},${cy} ${cw}x${ch} at 3x)`);
