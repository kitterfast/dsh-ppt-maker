// Visualise the PowerPoint-export vs browser-reference difference.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("E:/deepseek/dsh-ppt-project/package.json");
const { PNG } = require("pngjs");

const [, , shotPath, refPath, outPrefix] = process.argv;
const a = PNG.sync.read(readFileSync(shotPath));
const b = PNG.sync.read(readFileSync(refPath));
const W = a.width, H = a.height;
console.log(`shot ${W}x${H}  ref ${b.width}x${b.height}`);

// 1. Is it a pure offset? Search shifts.
function meanAt(dx, dy) {
  let sum = 0, n = 0;
  for (let y = 0; y < H; y += 3) {
    const sy = y + dy;
    if (sy < 0 || sy >= H) continue;
    for (let x = 0; x < W; x += 3) {
      const sx = x + dx;
      if (sx < 0 || sx >= W) continue;
      const o = (y * W + x) * 4, p = (sy * W + sx) * 4;
      sum += Math.abs(a.data[o] - b.data[p]) + Math.abs(a.data[o + 1] - b.data[p + 1]) + Math.abs(a.data[o + 2] - b.data[p + 2]);
      n += 3;
    }
  }
  return sum / n;
}
let best = { dx: 0, dy: 0, m: Infinity };
for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
  const m = meanAt(dx, dy);
  if (m < best.m) best = { dx, dy, m };
}
console.log(`best alignment: dx=${best.dx} dy=${best.dy} mean=${best.m.toFixed(2)}  (dx=0,dy=0 -> ${meanAt(0, 0).toFixed(2)})`);

// 2. Amplified diff map + column/row profiles so we can see WHERE it differs.
const out = new PNG({ width: W, height: H });
const colSum = new Array(W).fill(0), rowSum = new Array(H).fill(0);
let bad = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const o = (y * W + x) * 4;
  const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
  if (d > 32) { bad++; colSum[x]++; rowSum[y]++; }
  const v = Math.min(255, d * 6);
  out.data[o] = v; out.data[o + 1] = d > 32 ? 0 : 0; out.data[o + 2] = d > 32 ? 0 : 60; out.data[o + 3] = 255;
}
writeFileSync(`${outPrefix}-diff.png`, PNG.sync.write(out));
console.log(`bad pixels: ${bad} (${(bad / (W * H) * 100).toFixed(2)}%)`);

const topCols = colSum.map((v, i) => [i, v]).sort((p, q) => q[1] - p[1]).slice(0, 12);
const topRows = rowSum.map((v, i) => [i, v]).sort((p, q) => q[1] - p[1]).slice(0, 12);
console.log("worst columns (x,count):", topCols.map(([i, v]) => `${i}:${v}`).join(" "));
console.log("worst rows    (y,count):", topRows.map(([i, v]) => `${i}:${v}`).join(" "));

// 3. Side-by-side crop of the busiest row band, 3x zoom.
const band = Math.max(0, topRows[0][0] - 40);
const cropH = Math.min(120, H - band);
const side = new PNG({ width: W * 2 + 8, height: cropH });
for (let y = 0; y < cropH; y++) for (let x = 0; x < W; x++) {
  const src = ((band + y) * W + x) * 4;
  let d = (y * side.width + x) * 4;
  side.data[d] = a.data[src]; side.data[d + 1] = a.data[src + 1]; side.data[d + 2] = a.data[src + 2]; side.data[d + 3] = 255;
  d = (y * side.width + W + 8 + x) * 4;
  side.data[d] = b.data[src]; side.data[d + 1] = b.data[src + 1]; side.data[d + 2] = b.data[src + 2]; side.data[d + 3] = 255;
}
writeFileSync(`${outPrefix}-side.png`, PNG.sync.write(side));
console.log(`wrote ${outPrefix}-diff.png and ${outPrefix}-side.png (band y=${band})`);
