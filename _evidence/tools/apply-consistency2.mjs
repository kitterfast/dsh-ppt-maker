/**
 * Consistency fix, round 2 — two defects the first run exposed.
 *
 * D-a  `runtimeUnresolved(merged)` called `slides.every(...)` on a one-element
 *      array, which is trivially true. A manifest declaring page 7 of an 11-page
 *      deck was therefore read as "fully declared" and certified by the checker,
 *      exiting 0 — the very divergence being fixed. It now takes the deck's page
 *      count and requires the declaration to ADDRESS EVERY PAGE.
 *
 * D-b  g2 case G referenced `patchMerge`, which the suite imports INSIDE the case
 *      loop, so it is block-scoped there and undefined in the new block
 *      (ReferenceError). It now imports it explicitly.
 *
 * Usage: node tools/apply-consistency2.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const dry = process.argv.includes("--dry");
const P = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const MF = `${P}/lib/manifest.mjs`;
const VM = `${P}/tools/validate-manifest.mjs`;
const G2 = `${P}/tools/g2-test.mjs`;
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const patches = [
  {
    file: MF,
    name: "D-a runtimeUnresolved requires every page to be addressed",
    old:
      "export function runtimeUnresolved(merged) {\n" +
      "  const fullyDeclared =\n" +
      "    (merged?.slides ?? []).length > 0 &&\n" +
      "    merged.slides.every((s) => (s.layers ?? []).length > 0 && s.layers.every((L) => Array.isArray(L.members) && L.members.length));\n" +
      "  return fullyDeclared\n" +
      "    ? []\n" +
      '    : [{ code: AMB.MEMBERS, detail: "nested layer membership is only decidable once the DOM is available; declare members for every layer of every slide to cover it on paper, or let the renderer decide" }];\n' +
      "}",
    new:
      "export function runtimeUnresolved(merged, pageCount) {\n" +
      "  const slides = merged?.slides ?? [];\n" +
      "  // Conservatively sufficient AND checkable on paper: the declaration must\n" +
      "  // address EVERY page of the deck, and every layer entry it carries must name\n" +
      "  // members. A single slide entry out of eleven must not read as \"fully\n" +
      "  // declared\" — with a one-element every() it did, and the checker then\n" +
      "  // certified a manifest that leaves ten pages uncovered.\n" +
      "  const targets = new Set();\n" +
      "  slides.forEach((s, i) => { const r = declaredPage(s); targets.add(r.page ?? i + 1); });\n" +
      "  const allPagesDeclared = Number.isInteger(pageCount) && pageCount > 0\n" +
      "    ? targets.size >= pageCount\n" +
      "    : slides.length > 0;\n" +
      "  const everyLayerNamesMembers =\n" +
      "    slides.length > 0 &&\n" +
      "    slides.every((s) => (s.layers ?? []).length > 0 && s.layers.every((L) => Array.isArray(L.members) && L.members.length));\n" +
      "  return allPagesDeclared && everyLayerNamesMembers\n" +
      "    ? []\n" +
      "    : [{ code: AMB.MEMBERS, detail: `nested layer membership is only decidable once the DOM is available; cover it on paper by addressing all ${Number.isInteger(pageCount) ? pageCount : \"?\"} page(s) with members entries on every declared layer, or let the renderer decide` }];\n" +
      "}",
  },
  {
    file: VM,
    name: "D-a2 validator passes the deck's page count",
    old: "const runtimeUnres = res.present ? runtimeUnresolved(res.merged) : [];",
    new: "const runtimeUnres = res.present ? runtimeUnresolved(res.merged, sections.length) : [];",
  },
  {
    file: G2,
    name: "D-b case G imports patchMerge and passes the page count",
    old: '  const { runtimeUnresolved } = await import("../lib/manifest.mjs");',
    new: '  const { runtimeUnresolved, patchMerge } = await import("../lib/manifest.mjs");',
  },
  {
    file: G2,
    name: "D-b2 case G page count",
    old: "  const checkerRefuses = runtimeUnresolved(r.merged).length > 0;",
    new: "  const checkerRefuses = runtimeUnresolved(r.merged, facts.classesOnPages.length).length > 0;",
  },
];

const files = new Map();
let bad = 0;
console.log("===== consistency round 2: anchor verification =====");
for (const p of patches) {
  if (!files.has(p.file)) files.set(p.file, readFileSync(p.file, "utf8"));
  const hits = files.get(p.file).split(p.old).length - 1;
  if (hits !== 1) bad++;
  console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${p.name.padEnd(56)} hits=${hits}`);
}
if (bad) { console.log(`\n${bad} anchor(s) unresolved — nothing written.`); process.exit(1); }
for (const p of patches) files.set(p.file, files.get(p.file).replace(p.old, p.new));
console.log("\n===== applying =====");
for (const [f, out] of files) {
  const before = readFileSync(f, "utf8");
  console.log(`  ${f.split("/").pop().padEnd(24)} ${sha(before)} -> ${sha(out)}`);
  if (!dry) writeFileSync(f, out, "utf8");
}
if (!dry) {
  for (const f of [MF, VM, G2]) {
    try {
      execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "pipe", "pipe"] });
      console.log(`  [PASS] node --check ${f.split("/").pop()}`);
    } catch (e) {
      console.log(`  [FAIL] node --check ${f.split("/").pop()}\n` + String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n"));
      process.exit(1);
    }
  }
}
console.log(dry ? "\n--dry: nothing written." : "\nRound 2 applied.");
