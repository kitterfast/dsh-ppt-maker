/**
 * G3 full-deck diff — tolerance criterion (ruled 2026-09-15).
 *
 * WHY THIS IS NOT A BYTE COMPARISON
 * "完全一致" is a VISUAL requirement, not a byte requirement. Byte/pixel equality
 * was the wrong proxy for it. Rendering is inherently non-deterministic
 * (antialiasing, font hinting, sub-pixel rounding), and that was MEASURED here:
 * with identical code, two runs differ — baseline 6 files, current 4 files,
 * including non-canvas pages, maxDelta 4-10. No renderer is byte-reproducible.
 *
 * The criterion therefore uses the tolerances the project already defines for
 * exactly this purpose and applies them the same way deck-verify.mjs does:
 *     per pixel: d = max(|dR|, |dG|, |dB|)      (alpha ignored)
 *     meanDiff  = sum(d) / pixelCount
 *     badPixel% = pixels with d > 32, over pixelCount
 *     FAIL when meanDiff > maxMeanDiff(6) or badPixel% > maxBadPixelRatio(2%)
 *
 * Still compared exactly:
 *   - every per-page manifest field (geometry, delays, dropped, canvas, gif
 *     bindings, bit boxes) except the cache key and timestamps
 *   - GIF frame count and pixel size and position — GIF bytes stay exempt (the
 *     encoder is not byte-reproducible; registered F)
 *
 * Usage: node tools/g3-diff.mjs <baselineDir> <currentDir> [deck.config.json]
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/");
const { PNG } = require("pngjs");

const [A, B, cfgPath] = process.argv.slice(2);
if (!A || !B) {
  console.error("Usage: node tools/g3-diff.mjs <baselineDir> <currentDir> [deck.config.json]");
  process.exit(2);
}
let tol = 6, badTol = 0.02, cfgUsed = "(defaults 6 / 0.02)";
if (cfgPath && existsSync(cfgPath)) {
  const c = JSON.parse(readFileSync(cfgPath, "utf8"));
  tol = c.verify?.maxMeanDiff ?? tol;
  badTol = c.verify?.maxBadPixelRatio ?? badTol;
  cfgUsed = `${cfgPath}  maxMeanDiff=${tol} maxBadPixelRatio=${badTol}`;
}

const MA = JSON.parse(readFileSync(join(A, "manifest.json"), "utf8"));
const MB = JSON.parse(readFileSync(join(B, "manifest.json"), "utf8"));

console.log("===== G3 全稿比对（容差判据） =====");
console.log(`baseline: ${A}`);
console.log(`current : ${B}`);
console.log(`容差来源: ${cfgUsed}`);
console.log(`判据: d=max(|dR|,|dG|,|dB|)  meanDiff<=${tol}  且  badPixel%(d>32)<=${(badTol * 100).toFixed(2)}%`);
console.log("理由: 渲染像素级非确定性，集成前既存。已由两边同码双跑实测：");
console.log("      baseline 6 文件、current 4 文件像素不同，maxDelta 4-10，非 canvas 页亦有抖动。");
console.log("      本判据使用项目既有容差 verify.maxMeanDiff / maxBadPixelRatio（同 deck-verify.mjs 算法）。");
console.log("");

const IGNORE = new Set(["hash"]);
const canon = (v) => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const walk = (a, b, path, out) => {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") { out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); return; }
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) walk(a[k], b[k], `${path}.${k}`, out);
};
const gifSize = (p) => { const b = readFileSync(p); return `${b.readUInt16LE(6)}x${b.readUInt16LE(8)}`; };

let fails = 0;
const rows = [];
for (const sa of MA.slides) {
  const sb = MB.slides.find((s) => s.page === sa.page);
  const page = sa.page, dir = `p${String(page).padStart(2, "0")}`;
  const problems = [];

  const a = { ...sa }, b = { ...sb };
  for (const k of IGNORE) { delete a[k]; delete b[k]; }
  const fd = [];
  walk(canon(a), canon(b), `p${page}`, fd);
  problems.push(...fd);

  let worstMean = 0, worstBad = 0, worstFile = "";
  for (const f of readdirSync(join(A, dir)).sort()) {
    const pa = join(A, dir, f), pb = join(B, dir, f);
    if (!existsSync(pb)) { problems.push(`${dir}/${f}: missing in current`); continue; }
    if (f.endsWith(".gif")) {
      const sa2 = gifSize(pa), sb2 = gifSize(pb);
      const ga = (sa.groups ?? []).find((g) => g.gif && g.gif.endsWith(f));
      const gb = (sb.groups ?? []).find((g) => g.gif && g.gif.endsWith(f));
      if (sa2 !== sb2) problems.push(`${dir}/${f}: GIF size ${sa2} != ${sb2}`);
      if (ga && gb) {
        if (ga.gifFrames !== gb.gifFrames) problems.push(`${dir}/${f}: frames ${ga.gifFrames} != ${gb.gifFrames}`);
        for (const c of ["x", "y", "w", "h"]) if (ga[c] !== gb[c]) problems.push(`${dir}/${f}: pos ${c} ${ga[c]} != ${gb[c]}`);
      }
      continue;
    }
    const ia = PNG.sync.read(readFileSync(pa)), ib = PNG.sync.read(readFileSync(pb));
    if (ia.width !== ib.width || ia.height !== ib.height) {
      problems.push(`${dir}/${f}: size ${ia.width}x${ia.height} != ${ib.width}x${ib.height}`);
      continue;
    }
    let sum = 0, bad = 0;
    const n = ia.width * ia.height;
    for (let p = 0; p < n; p++) {
      const o = p * 4;
      const d = Math.max(Math.abs(ia.data[o] - ib.data[o]), Math.abs(ia.data[o + 1] - ib.data[o + 1]), Math.abs(ia.data[o + 2] - ib.data[o + 2]));
      sum += d;
      if (d > 32) bad++;
    }
    const mean = sum / n, ratio = bad / n;
    if (mean > worstMean) { worstMean = mean; worstFile = f; }
    if (ratio > worstBad) worstBad = ratio;
    if (mean > tol) problems.push(`${dir}/${f}: meanDiff ${mean.toFixed(2)} > ${tol}`);
    if (ratio > badTol) problems.push(`${dir}/${f}: badPixel ${(ratio * 100).toFixed(2)}% > ${(badTol * 100).toFixed(2)}%`);
  }

  if (problems.length) fails++;
  rows.push({ page, mean: worstMean, bad: worstBad, file: worstFile });
  console.log(`  [${problems.length ? "不一致" : "一致"}] p${page}  groups=${(sa.groups ?? []).length}  worstMean=${worstMean.toFixed(3)} (${worstFile})  badPixel%=${(worstBad * 100).toFixed(3)}`);
  for (const l of problems.slice(0, 10)) console.log(`        ${l}`);
}

console.log("");
console.log("  page  meanDiff  badPixel%");
for (const r of rows) console.log(`  ${String(r.page).padStart(4)}  ${r.mean.toFixed(3).padStart(8)}  ${(r.bad * 100).toFixed(3).padStart(8)}`);
const worst = rows.slice().sort((x, y) => y.mean - x.mean)[0];
if (worst) console.log(`  worst: p${worst.page} mean ${worst.mean.toFixed(3)} (${worst.file})`);
console.log("");
const ok = fails === 0;
console.log(ok
  ? `G3 全稿判定: 通过（${rows.length} 页全部在容差内：meanDiff<=${tol}，badPixel%<=${(badTol * 100).toFixed(2)}）`
  : `G3 全稿判定: 未通过（${fails} 页超出容差）`);
process.exit(ok ? 0 : 1);
