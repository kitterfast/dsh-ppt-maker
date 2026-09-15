// Stack a region of two PNGs (baseline on top, ours below) at 1x, full detail.
// Usage: node tools/crop-pair.mjs <oraclePng> <oursPng> <out.png> <x> <y> <w> <h> [dx] [dy]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [fa, fb, out, X, Y, W, H, DX, DY] = process.argv.slice(2);
const dx = Number(DX ?? 0), dy = Number(DY ?? 0);
const x = Number(X), y = Number(Y), w = Number(W), h = Number(H);
const a = PNG.sync.read(fs.readFileSync(fa));
const b = PNG.sync.read(fs.readFileSync(fb));

const outPng = new PNG({ width: w, height: h * 2 + 6 });
outPng.data.fill(255);
function blit(src, ox, oy, dstY) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const sx = ox + xx, sy = oy + yy;
    if (sx < 0 || sx >= src.width || sy < 0 || sy >= src.height) continue;
    const o = (sy * src.width + sx) * 4;
    const al = src.data[o + 3] / 255;
    const t = ((dstY + yy) * w + xx) * 4;
    outPng.data[t] = Math.round(src.data[o] * al + 255 * (1 - al));
    outPng.data[t + 1] = Math.round(src.data[o + 1] * al + 255 * (1 - al));
    outPng.data[t + 2] = Math.round(src.data[o + 2] * al + 255 * (1 - al));
    outPng.data[t + 3] = 255;
  }
}
blit(a, x, y, 0);
blit(b, x + dx, y + dy, h + 6);
fs.writeFileSync(out, PNG.sync.write(outPng));
console.log(`wrote ${out}  region ${x},${y} ${w}x${h} (top=baseline, bottom=ours offset ${dx},${dy})`);
