// End-to-end check: rebuild each slide by alpha-compositing base + layers in the
// order the PPTX draws them, then compare the two decks slide by slide. This is
// what the player actually shows, so it catches content that is missing from a
// layer, duplicated, or covered.
// Usage: node tools/compose-slide.mjs <oracleDir> <oursDir> [outPrefix]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');
const [oracleDir, oursDir, outPrefix] = process.argv.slice(2);
const EMU = 9525; // per logical px
const SCALE = 2;

function slidePics(root, n) {
  const xml = fs.readFileSync(path.join(root, 'ppt', 'slides', `slide${n}.xml`), 'utf8');
  const rels = fs.readFileSync(path.join(root, 'ppt', 'slides', '_rels', `slide${n}.xml.rels`), 'utf8');
  const relMap = new Map();
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]*)"/g)) relMap.set(m[1], m[2].split('/').pop());
  const out = [];
  for (const m of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
    const b = m[1];
    const emb = /r:embed="([^"]+)"/.exec(b);
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(b);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(b);
    if (!emb || !off || !ext) continue;
    out.push({
      media: relMap.get(emb[1]),
      x: Math.round((+off[1] / EMU) * SCALE),
      y: Math.round((+off[2] / EMU) * SCALE),
      w: Math.round((+ext[1] / EMU) * SCALE),
      h: Math.round((+ext[2] / EMU) * SCALE),
    });
  }
  return out;
}

function compose(root, n) {
  const W = 2560, H = 1440;
  const canvas = new PNG({ width: W, height: H });
  canvas.data.fill(0);
  for (const p of slidePics(root, n)) {
    const f = path.join(root, 'ppt', 'media', p.media);
    if (!p.media || !fs.existsSync(f) || !p.media.endsWith('.png')) continue;
    const img = PNG.sync.read(fs.readFileSync(f));
    for (let y = 0; y < p.h; y++) {
      const cy = p.y + y;
      if (cy < 0 || cy >= H) continue;
      const sy = Math.min(img.height - 1, Math.floor((y * img.height) / p.h));
      for (let x = 0; x < p.w; x++) {
        const cx = p.x + x;
        if (cx < 0 || cx >= W) continue;
        const sx = Math.min(img.width - 1, Math.floor((x * img.width) / p.w));
        const s = (sy * img.width + sx) * 4, d = (cy * W + cx) * 4;
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

let gSum = 0, gBad = 0, gN = 0;
for (let n = 1; n <= 11; n++) {
  const a = compose(oracleDir, n);
  const b = compose(oursDir, n);
  let sum = 0, bad = 0;
  const N = a.width * a.height;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
    sum += d; if (d > 32) bad++;
  }
  gSum += sum; gBad += bad; gN += N;
  console.log(`slide ${String(n).padStart(2)}  mean=${(sum / N).toFixed(2).padStart(6)}  bad>32=${((bad / N) * 100).toFixed(2).padStart(5)}%`);
  if (outPrefix) fs.writeFileSync(`${outPrefix}-s${n}-oracle.png`, PNG.sync.write(a));
  if (outPrefix) fs.writeFileSync(`${outPrefix}-s${n}-ours.png`, PNG.sync.write(b));
}
console.log(`\nSLIDE COMPOSITE TOTAL: mean=${(gSum / gN).toFixed(2)}  bad>32=${((gBad / gN) * 100).toFixed(2)}%  over ${gN} px`);
