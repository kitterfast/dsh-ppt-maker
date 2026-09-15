/**
 * Do the differing PNGs differ in PIXELS, or only in their encoding?
 *
 * This is the question that decides whether "完全一致" holds. A 3-byte file-size
 * delta is consistent with zlib emitting a different-but-equivalent stream — same
 * image, different container bytes — but it is equally consistent with a real
 * pixel change. Byte hashing cannot tell the two apart; decoding can.
 *
 * Compares every PNG across three pairs and reports, per file:
 *   identical pixels | differing pixel count | max per-channel delta
 *
 * Usage: node tools/pixel-diff.mjs <dirA> <dirB> [<dirC> <dirD>]
 *   pair 1: A vs B      pair 2: C vs D      pair 3: A vs C
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire("C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/");
const { PNG } = require("pngjs");

const [A, B, C, D] = process.argv.slice(2);
if (!A || !B || !C || !D) {
  console.error("Usage: node tools/pixel-diff.mjs <baselineA> <baselineB> <currentA> <currentB>");
  process.exit(2);
}
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);

const decode = (p) => PNG.sync.read(readFileSync(p));
const pairs = [
  ["baseline-a vs baseline-b", A, B],
  ["current-a  vs current-b ", C, D],
  ["baseline-a vs current-a  ", A, C],
];

let anyPixelDiff = 0;
for (const [label, X, Y] of pairs) {
  console.log(`\n===== ${label} =====`);
  const pages = readdirSync(X).filter((d) => /^p\d+$/.test(d)).sort();
  for (const page of pages) {
    const files = readdirSync(join(X, page)).filter((f) => f.endsWith(".png")).sort();
    for (const f of files) {
      const px = join(X, page, f), py = join(Y, page, f);
      if (!existsSync(py)) { console.log(`  ${page}/${f}: MISSING in second dir`); continue; }
      const bx = sha(px), by = sha(py);
      if (bx === by) continue; // byte-identical: nothing to decode
      const ix = decode(px), iy = decode(py);
      if (ix.width !== iy.width || ix.height !== iy.height) {
        console.log(`  ${page}/${f}: SIZE ${ix.width}x${ix.height} vs ${iy.width}x${iy.height}`);
        anyPixelDiff++;
        continue;
      }
      let diff = 0, maxDelta = 0;
      for (let i = 0; i < ix.data.length; i++) {
        const d = Math.abs(ix.data[i] - iy.data[i]);
        if (d) { diff++; if (d > maxDelta) maxDelta = d; }
      }
      const total = ix.data.length;
      if (diff === 0) {
        console.log(`  ${page}/${f}: bytes differ (${bx} vs ${by}) but PIXELS IDENTICAL  ${ix.width}x${ix.height}`);
      } else {
        anyPixelDiff++;
        console.log(`  ${page}/${f}: PIXELS DIFFER  ${diff}/${total} channel bytes (${((diff / total) * 100).toFixed(4)}%)  maxDelta=${maxDelta}`);
      }
    }
  }
}
console.log("");
console.log(anyPixelDiff === 0
  ? "判定: 所有字节差异都是编码差异 —— 像素完全一致"
  : `判定: 存在真实像素差异（${anyPixelDiff} 个文件）`);
process.exit(anyPixelDiff === 0 ? 0 : 1);
