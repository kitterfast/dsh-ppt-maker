/**
 * Validate a WPS frame capture: is it the pure slide, and does it match the deck?
 *
 * The capture is full screen, so a correct frame must show ONLY the slide -- no
 * WPS title bar, no taskbar, no popup, no occluding window. Two checks:
 *
 *  1. PURITY  - compare the settled frame against the deck's own rendered page 1
 *               (render/p01/ref.png, 2560x1440) resized to the frame size. Then
 *               repeat for the OUTER BANDS (top/bottom/left/right). A title bar or
 *               taskbar lands in a band and shows up as a large band diff even if
 *               the overall mean looks acceptable.
 *  2. CONTENT - compare the frame against ALL 11 rendered pages: page 1 must be
 *               the best match by a clear margin, otherwise the capture is not
 *               page 1 at all.
 *
 * Threshold comes from the deck's own verify settings (maxMeanDiff 6,
 * maxBadPixelRatio 0.02) -- not chosen to make this pass.
 *
 * Usage: node tools/wps-purity.mjs <frameDir> <renderDir> [frameName]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [frameDir, renderDir, frameName] = process.argv.slice(2);
const MAX_MEAN = 6;      // deck.config.json verify.maxMeanDiff
const MAX_BAD = 0.02;    // deck.config.json verify.maxBadPixelRatio
const BAD_PX = 32;

function load(p) { return PNG.sync.read(fs.readFileSync(p)); }

// bilinear resize to (W,H)
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
        const p00 = src.data[(y0 * src.width + x0) * 4 + c];
        const p01 = src.data[(y0 * src.width + x1) * 4 + c];
        const p10 = src.data[(y1 * src.width + x0) * 4 + c];
        const p11 = src.data[(y1 * src.width + x1) * 4 + c];
        const top = p00 + (p01 - p00) * wx;
        const bot = p10 + (p11 - p10) * wx;
        out.data[o + c] = Math.round(top + (bot - top) * wy);
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

function diff(A, B, region) {
  const x0 = region?.x0 ?? 0, y0 = region?.y0 ?? 0;
  const x1 = region?.x1 ?? A.width, y1 = region?.y1 ?? A.height;
  let s = 0, bad = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * A.width + x) * 4;
      const d = Math.max(Math.abs(A.data[o] - B.data[o]), Math.abs(A.data[o + 1] - B.data[o + 1]), Math.abs(A.data[o + 2] - B.data[o + 2]));
      s += d; if (d > BAD_PX) bad++; n++;
    }
  }
  return { mean: s / n, bad: bad / n, n };
}

const frames = fs.readdirSync(frameDir).filter((f) => f.endsWith('.png')).sort();
const target = frameName ?? frames[Math.min(20, frames.length - 1)];
const F = load(path.join(frameDir, target));
console.log(`frame      : ${target}  ${F.width}x${F.height}`);
console.log(`thresholds : mean<=${MAX_MEAN}  bad<=${(MAX_BAD * 100).toFixed(1)}%   (deck.config.json verify)`);

const refs = [];
for (let i = 1; i <= 11; i++) {
  const p = path.join(renderDir, `p${String(i).padStart(2, '0')}`, 'ref.png');
  if (fs.existsSync(p)) refs.push({ page: i, img: resize(load(p), F.width, F.height) });
}
if (!refs.length) { console.error(`no ref.png under ${renderDir}`); process.exit(2); }

console.log('\n-- 2. CONTENT: match against every rendered page (page 1 must win by a margin) --');
const scored = refs.map((r) => ({ page: r.page, ...diff(F, r.img) }));
scored.sort((a, b) => a.mean - b.mean);
for (const s of scored.slice(0, 4)) console.log(`   p${String(s.page).padStart(2)}  mean=${s.mean.toFixed(2).padStart(7)}  bad=${(s.bad * 100).toFixed(2)}%`);
const best = scored[0], second = scored[1];
console.log(`   best = p${best.page}  runner-up = p${second.page} (margin x${(second.mean / best.mean).toFixed(2)})`);

const ref1 = refs.find((r) => r.page === 1).img;
console.log('\n-- 1. PURITY: settled frame vs rendered page 1 --');
const whole = diff(F, ref1);
console.log(`   whole frame   mean=${whole.mean.toFixed(2)}  bad=${(whole.bad * 100).toFixed(2)}%`);

const bands = [
  ['top    40px', { x0: 0, y0: 0, x1: F.width, y1: 40 }],
  ['bottom 40px', { x0: 0, y0: F.height - 40, x1: F.width, y1: F.height }],
  ['left   40px', { x0: 0, y0: 0, x1: 40, y1: F.height }],
  ['right  40px', { x0: F.width - 40, y0: 0, x1: F.width, y1: F.height }],
];
let worstBand = { mean: -1 };
for (const [name, r] of bands) {
  const d = diff(F, ref1, r);
  if (d.mean > worstBand.mean) worstBand = { name, ...d };
  console.log(`   ${name}  mean=${d.mean.toFixed(2).padStart(7)}  bad=${(d.bad * 100).toFixed(2)}%`);
}

const contentOk = best.page === 1 && second.mean > best.mean * 1.5;
const purityOk = whole.mean <= MAX_MEAN && whole.bad <= MAX_BAD;
const bandOk = worstBand.mean <= MAX_MEAN * 1.5;
console.log('\nVERDICT:');
console.log(`   content_is_page1 = ${contentOk}`);
console.log(`   whole_frame_ok   = ${purityOk}   (mean ${whole.mean.toFixed(2)} vs <=${MAX_MEAN}, bad ${(whole.bad * 100).toFixed(2)}% vs <=${(MAX_BAD * 100).toFixed(1)}%)`);
console.log(`   no_chrome_band   = ${bandOk}   (worst band ${worstBand.name} mean ${worstBand.mean.toFixed(2)})`);
console.log(`   CAPTURE_QUALIFIED = ${contentOk && purityOk && bandOk}`);
process.exit(contentOk && purityOk && bandOk ? 0 : 1);
