/**
 * Render-tree diff for T2 — declared path vs reverse path.
 *
 * Compares two render manifests page by page, ignoring exactly the fields that
 * are EXPECTED to differ and nothing else:
 *
 *   deckHash / slides[].hash  - the cache key. The integration deliberately
 *                               folds declMode ("declared" vs "reverse") and the
 *                               declaration fingerprint into it, so it differs by
 *                               construction and is not render output.
 *   generatedAt               - a timestamp.
 *   settings                  - records config chrome/groups/goto, not derived facts.
 *
 * Everything else must match field for field: layer geometry, delays, motion,
 * dropped flags, canvas/gif bindings and every bit box. Any difference is
 * printed as a path so it can be judged, never summarised away.
 *
 * Usage: node tools/tree-diff.mjs <a.json> <b.json> [pages]
 */

import { readFileSync } from "node:fs";

const [aPath, bPath, pagesArg] = process.argv.slice(2);
if (!aPath || !bPath) {
  console.error("Usage: node tools/tree-diff.mjs <a.json> <b.json> [pages]");
  process.exit(2);
}
const pages = (pagesArg ?? "").split(",").filter(Boolean).map(Number);

const A = JSON.parse(readFileSync(aPath, "utf8"));
const B = JSON.parse(readFileSync(bPath, "utf8"));

const IGNORED_TOP = new Set(["deckHash", "generatedAt", "settings", "html"]);
const IGNORED_SLIDE = new Set(["hash"]);

const canon = (v) => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  return v;
};

function diff(a, b, path, out) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const bothObj = a && b && typeof a === "object" && typeof b === "object";
  if (!bothObj) {
    out.push(`${path}: ${JSON.stringify(a)}  !=  ${JSON.stringify(b)}`);
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) diff(a[k], b[k], `${path}.${k}`, out);
}

const pick = (m) =>
  m.slides
    .filter((s) => pages.length === 0 || pages.includes(s.page))
    .map((s) => {
      const slide = {};
      for (const k of Object.keys(s).sort()) if (!IGNORED_SLIDE.has(k)) slide[k] = s[k];
      return canon(slide);
    });

const sa = pick(A);
const sb = pick(B);

console.log(`A: ${aPath}  deckHash=${A.deckHash}  slides=${A.slides.length}`);
console.log(`B: ${bPath}  deckHash=${B.deckHash}  slides=${B.slides.length}`);
console.log(`比较页: ${pages.length ? pages.join(", ") : "(全部)"}`);
console.log(`忽略字段: 顶层 ${[...IGNORED_TOP].join(", ")} / 每页 ${[...IGNORED_SLIDE].join(", ")}`);
console.log("");

let bad = 0;
if (sa.length !== sb.length) {
  console.log(`FAIL 页数不同: ${sa.length} vs ${sb.length}`);
  bad++;
}
for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
  const out = [];
  diff(sa[i], sb[i], `p${sa[i].page}`, out);
  if (out.length === 0) {
    console.log(`  [一致] p${sa[i].page}  groups=${(sa[i].groups || []).length}`);
  } else {
    bad++;
    console.log(`  [不一致] p${sa[i].page} —— ${out.length} 处:`);
    for (const l of out.slice(0, 40)) console.log(`      ${l}`);
    if (out.length > 40) console.log(`      ...(另有 ${out.length - 40} 处)`);
  }
}
console.log("");
console.log(bad === 0 ? "T2 渲染树判定: 一致（仅忽略缓存键与时间戳）" : `T2 渲染树判定: 不一致（${bad} 页/项）`);
process.exit(bad === 0 ? 0 : 1);
