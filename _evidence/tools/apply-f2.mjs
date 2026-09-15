/**
 * F2 patch — A_MEMBERS coverage is decided from what actually resolved.
 *
 * Before: covers[A_MEMBERS] was a predicate over the DECLARATION TEXT
 *   (allSlidesFully(L => Array.isArray(L.members)) || Array.isArray(merged.motion))
 * which had three faults:
 *   1. it never asked whether the declaration LANDED on the ambiguous page,
 *   2. `|| Array.isArray(merged.motion)` let a motion entry suppress a membership
 *      ambiguity — different dimensions, so the ambiguity stayed unresolved,
 *   3. an empty members array counted as coverage.
 *
 * After: A_MEMBERS is decided after the per-page plan is built, from the set of
 * pages an actual landing declaration resolved. `motion` no longer covers it.
 * (F4 later upgrades "resolved" from "the entry mentions members" to "the
 * selectors located exactly one layer", and F3 upgrades the comparison from
 * member count to member identity.)
 *
 * Usage: node tools/apply-f2.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dry = process.argv.includes("--dry");
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const MF = `${PIPE}/lib/manifest.mjs`;
const DR = `${PIPE}/deck-render.mjs`;

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const patches = [
  {
    file: MF,
    name: "P1 covers: drop the motion loophole, accept page, defer A_MEMBERS",
    old:
      "  const covers = {\n" +
      '    [AMB.STAGE]: () => !!(merged?.stage && "width" in merged.stage && "height" in merged.stage),\n' +
      '    [AMB.INDEX]: () => (merged?.slides ?? []).length > 0 && merged.slides.every((s) => "index" in s),\n' +
      '    [AMB.CLS]: () => allSlidesFully((L) => "cls" in L),\n' +
      '    [AMB.DELAY]: () => allSlidesFully((L) => "delayMs" in L),\n' +
      '    [AMB.MEMBERS]: () => allSlidesFully((L) => Array.isArray(L.members)) || Array.isArray(merged?.motion),\n' +
      "  };\n" +
      "  for (const [code, detail] of amb) {\n" +
      "    if (!covers[code]?.()) errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: code, detail });\n" +
      "    else notes.push(`${code} resolved by declaration`);\n" +
      "  }",
    new:
      "  const covers = {\n" +
      '    [AMB.STAGE]: () => !!(merged?.stage && "width" in merged.stage && "height" in merged.stage),\n' +
      '    // `page` is accepted alongside `index`: both are 1-based page numbers.\n' +
      '    [AMB.INDEX]: () => (merged?.slides ?? []).length > 0 && merged.slides.every((s) => "index" in s || "page" in s),\n' +
      '    [AMB.CLS]: () => allSlidesFully((L) => "cls" in L),\n' +
      '    [AMB.DELAY]: () => allSlidesFully((L) => "delayMs" in L),\n' +
      "  };\n" +
      "  for (const [code, detail] of amb) {\n" +
      "    // A_MEMBERS is deliberately NOT decided here. Whether membership is covered\n" +
      "    // depends on a declaration actually landing on the ambiguous page, which is\n" +
      "    // only known once the per-page plan below has been built. Deciding it from\n" +
      "    // the declaration text is what let a motion entry stand in for a membership\n" +
      "    // declaration and leave the ambiguity silently unresolved.\n" +
      "    if (code === AMB.MEMBERS) continue;\n" +
      "    if (!covers[code]?.()) errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: code, detail });\n" +
      "    else notes.push(`${code} resolved by declaration`);\n" +
      "  }",
  },
  {
    file: MF,
    name: "P2 track which pages a landing declaration actually resolved",
    old:
      "  const plan = { slides: new Map(), motion: new Map(), capturePad: merged?.capturePad, stage: merged?.stage ?? null };\n" +
      "  for (const d of dom.slides) {\n" +
      "    const dec = bySlide.get(d.page);\n" +
      "    const layers = [];\n" +
      "    if (dec?.layers?.length) {",
    new:
      "  const plan = { slides: new Map(), motion: new Map(), capturePad: merged?.capturePad, stage: merged?.stage ?? null };\n" +
      "  // Pages where a declaration actually LANDED and carried a members entry.\n" +
      "  // Coverage is read from this set, never from the declaration text at large.\n" +
      "  const membersResolvedPages = new Set();\n" +
      "  for (const d of dom.slides) {\n" +
      "    const dec = bySlide.get(d.page);\n" +
      "    const layers = [];\n" +
      "    if (dec?.layers?.length) {\n" +
      "      if (dec.layers.some((L) => Array.isArray(L.members) && L.members.length)) membersResolvedPages.add(d.page);",
  },
  {
    file: MF,
    name: "P3 decide A_MEMBERS per page from the resolved set",
    old: "  // 3. stated motion must match the runtime fact",
    new:
      "  // A_MEMBERS: every page the runtime detector called ambiguous must have been\n" +
      "  // resolved by a declaration that landed on THAT page. `motion` does not cover\n" +
      "  // it — motion describes runtime animation, membership describes which\n" +
      "  // elements form a layer, and conflating them left the ambiguity unresolved.\n" +
      "  if (amb.has(AMB.MEMBERS)) {\n" +
      "    const pages = dom.nestedPages ?? [];\n" +
      "    const unresolved = pages.filter((p) => !membersResolvedPages.has(p));\n" +
      "    if (unresolved.length) {\n" +
      "      errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: AMB.MEMBERS, detail: `${amb.get(AMB.MEMBERS)}; no landing members declaration for page(s) ${unresolved.join(\",\")}` });\n" +
      "    } else {\n" +
      "      notes.push(`${AMB.MEMBERS} resolved by declaration on page(s) ${pages.join(\",\")}`);\n" +
      "    }\n" +
      "  }\n" +
      "\n" +
      "  // 3. stated motion must match the runtime fact",
  },
  {
    file: DR,
    name: "P4 pass the ambiguous page list into patchMerge",
    old: "    const res = patchMerge({ merged: mf.merged, amb, dom: { slides: domSlides, motion: domMotion, total } });",
    new: "    const res = patchMerge({ merged: mf.merged, amb, dom: { slides: domSlides, motion: domMotion, total, nestedPages } });",
  },
];

const files = new Map();
let bad = 0;
console.log("===== F2 patch: anchor verification =====");
for (const p of patches) {
  if (!files.has(p.file)) files.set(p.file, readFileSync(p.file, "utf8"));
  const hits = files.get(p.file).split(p.old).length - 1;
  if (hits !== 1) bad++;
  console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${p.name.padEnd(58)} hits=${hits}`);
}
if (bad) {
  console.log(`\n${bad} anchor(s) did not resolve exactly once — nothing written.`);
  process.exit(1);
}

console.log("\n===== applying =====");
for (const p of patches) files.set(p.file, files.get(p.file).replace(p.old, p.new));
for (const [f, out] of files) {
  const before = readFileSync(f, "utf8");
  console.log(`  ${f.split("/").pop().padEnd(18)} ${sha(before)} -> ${sha(out)}  (${before.length} -> ${out.length} chars)`);
  if (!dry) writeFileSync(f, out, "utf8");
}
console.log(dry ? "\n--dry: nothing written." : "\nF2 applied.");
