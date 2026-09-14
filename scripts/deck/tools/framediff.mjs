import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
const require = createRequire("E:/deepseek/dsh-ppt-project/package.json");
const { PNG } = require("pngjs");
const dir = process.argv[2];
const files = readdirSync(dir).filter(f => f.endsWith(".png")).sort();
const imgs = files.map(f => ({ f, p: PNG.sync.read(readFileSync(join(dir, f))) }));
function diff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { mean: -1, bad: -1 };
  const n = a.width * a.height; let s = 0, bad = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(a.data[o]-b.data[o]), Math.abs(a.data[o+1]-b.data[o+1]), Math.abs(a.data[o+2]-b.data[o+2]));
    s += d; if (d > 24) bad++;
  }
  return { mean: +(s/n).toFixed(3), badPct: +(bad/n*100).toFixed(3) };
}
console.log(`files: ${files.length}  size ${imgs[0].p.width}x${imgs[0].p.height}`);
const base = imgs[0].p;
console.log("\nframe   vs f00            vs previous");
let prev = null;
for (const { f, p } of imgs) {
  const d0 = diff(p, base);
  const dp = prev ? diff(p, prev) : { mean: 0, badPct: 0 };
  console.log(`${f}  mean ${String(d0.mean).padStart(8)} bad ${String(d0.badPct).padStart(7)}%   mean ${String(dp.mean).padStart(8)} bad ${String(dp.badPct).padStart(7)}%`);
  prev = p;
}
