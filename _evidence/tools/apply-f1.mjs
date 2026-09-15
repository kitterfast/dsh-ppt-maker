/**
 * F1 patch — unify the declaration-side page/index semantics.
 *
 * Why a script: every edit to the pipeline needs its own sandbox escalation, so
 * the whole of F1 is expressed as literal anchor replacements that are ALL
 * verified before anything is written. If any anchor is missing or ambiguous the
 * script writes nothing and exits non-zero.
 *
 * F1 fixes the root cause of the silent-drop defect: a slide declaration is
 * addressed by a 1-BASED page, while the render manifest's own slides[].index is
 * 0-BASED. Reusing the manifest's number in a declaration targeted the wrong
 * page and produced no error at all.
 *
 * Usage: node tools/apply-f1.mjs [--dry]
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
    name: "E1 ERR.SLIDE_NOT_FOUND",
    old: '  MEMBERS_MISSING: "E_MEMBERS_NOT_IN_DOM",\n};',
    new: '  MEMBERS_MISSING: "E_MEMBERS_NOT_IN_DOM",\n  SLIDE_NOT_FOUND: "E_SLIDE_NOT_FOUND",\n};',
  },
  {
    file: MF,
    name: "E2 merge: claim page alongside index",
    old: '        if ("index" in s && claim(`slides[${i}].index`, from)) dest.index = s.index;',
    new:
      '        if ("index" in s && claim(`slides[${i}].index`, from)) dest.index = s.index;\n' +
      '        if ("page" in s && claim(`slides[${i}].page`, from)) dest.page = s.page;',
  },
  {
    file: MF,
    name: "E3 validate page shape + index/page conflict",
    old: '    if ("index" in s && (!Number.isInteger(s.index) || s.index < 1)) errors.push({ code: ERR.SHAPE, field: `slides[${i}].index`, detail: "must be an integer >= 1" });',
    new:
      '    // The declaration side is 1-BASED everywhere. `page` is the canonical\n' +
      '    // field; `index` is kept as a 1-based alias for schema v1. This is NOT the\n' +
      '    // same thing as the render manifest\'s slides[].index, which is 0-based —\n' +
      '    // reusing that number here silently targeted the wrong page.\n' +
      '    if ("index" in s && (!Number.isInteger(s.index) || s.index < 1)) errors.push({ code: ERR.SHAPE, field: `slides[${i}].index`, detail: "must be an integer >= 1 (1-based page)" });\n' +
      '    if ("page" in s && (!Number.isInteger(s.page) || s.page < 1)) errors.push({ code: ERR.SHAPE, field: `slides[${i}].page`, detail: "must be an integer >= 1" });\n' +
      '    if (Number.isInteger(s.index) && Number.isInteger(s.page) && s.index !== s.page) {\n' +
      '      errors.push({ code: ERR.CONFLICT, field: `slides[${i}]`, detail: `index ${s.index} and page ${s.page} disagree (both are 1-based page numbers)` });\n' +
      '    }',
  },
  {
    file: MF,
    name: "E4 add declaredPage() helper",
    old: "/* ───────────────── patch merge (§7) — the whole point ───────────────────── */",
    new:
      "/**\n" +
      " * Resolve a declared slide's target page. The declaration side is 1-BASED:\n" +
      " * `page` is canonical, `index` survives as a 1-based alias from schema v1.\n" +
      " * This must never be confused with the render manifest's slides[].index,\n" +
      " * which is 0-BASED — that confusion is what silently dropped declarations.\n" +
      " * Returns { page, via }; page is null when undeclared or self-contradictory.\n" +
      " */\n" +
      "export function declaredPage(s) {\n" +
      "  const hasPage = Number.isInteger(s?.page);\n" +
      "  const hasIndex = Number.isInteger(s?.index);\n" +
      "  if (hasPage && hasIndex && s.page !== s.index) return { page: null, via: \"conflict\" };\n" +
      "  if (hasPage) return { page: s.page, via: \"page\" };\n" +
      "  if (hasIndex) return { page: s.index, via: \"index\" };\n" +
      "  return { page: null, via: null };\n" +
      "}\n" +
      "\n" +
      "/* ───────────────── patch merge (§7) — the whole point ───────────────────── */",
  },
  {
    file: MF,
    name: "E5 bySlide: 1-based page, never positional-silent, range-checked, no dupes",
    old:
      "  // 2./5. declared DOM-mapping fields must equal the DOM fact\n" +
      "  const bySlide = new Map((merged?.slides ?? []).map((s, i) => [s.index ?? i + 1, s]));",
    new:
      "  // 2./5. declared DOM-mapping fields must equal the DOM fact.\n" +
      "  // A slide declaration is addressed by its 1-BASED page. It is never mapped by\n" +
      "  // array position in silence, and a page the deck does not have is an error\n" +
      "  // rather than a declaration that quietly applies to nothing.\n" +
      "  const bySlide = new Map();\n" +
      "  (merged?.slides ?? []).forEach((s, i) => {\n" +
      "    if (!s || typeof s !== \"object\") return;\n" +
      "    const r = declaredPage(s);\n" +
      "    if (r.via === \"conflict\") return; // already reported by validateDeclaration\n" +
      "    if (r.page === null) {\n" +
      "      if (!(s.layers ?? []).length) return;\n" +
      "      bySlide.set(i + 1, s);\n" +
      "      notes.push(`slides[${i}] declares no page/index: read as page ${i + 1} by array position`);\n" +
      "      return;\n" +
      "    }\n" +
      "    if (dom.total && (r.page < 1 || r.page > dom.total)) {\n" +
      "      errors.push({ code: ERR.SLIDE_NOT_FOUND, field: `slides[${i}].${r.via}`, detail: `declared page ${r.page}, but the deck has ${dom.total} page(s)` });\n" +
      "      return;\n" +
      "    }\n" +
      "    if (bySlide.has(r.page)) {\n" +
      "      errors.push({ code: ERR.CONFLICT, field: `slides[${i}].${r.via}`, detail: `page ${r.page} is declared by more than one slide entry` });\n" +
      "      return;\n" +
      "    }\n" +
      "    bySlide.set(r.page, s);\n" +
      "  });",
  },
  {
    file: DR,
    name: "E6 pass the deck's page count into patchMerge",
    old: "    const res = patchMerge({ merged: mf.merged, amb, dom: { slides: domSlides, motion: domMotion } });",
    new: "    const res = patchMerge({ merged: mf.merged, amb, dom: { slides: domSlides, motion: domMotion, total } });",
  },
];

// --- verify every anchor first; write nothing unless all of them resolve -----
const files = new Map();
const report = [];
let bad = 0;
for (const p of patches) {
  if (!files.has(p.file)) files.set(p.file, readFileSync(p.file, "utf8"));
  const src = files.get(p.file);
  const hits = src.split(p.old).length - 1;
  const ok = hits === 1;
  if (!ok) bad++;
  report.push(`  [${ok ? "OK  " : "FAIL"}] ${p.name.padEnd(58)} hits=${hits}`);
}
console.log("===== F1 patch: anchor verification =====");
for (const l of report) console.log(l);
if (bad) {
  console.log(`\n${bad} anchor(s) did not resolve exactly once — nothing written.`);
  process.exit(1);
}

// --- apply ------------------------------------------------------------------
console.log("\n===== applying =====");
for (const p of patches) {
  const src = files.get(p.file);
  files.set(p.file, src.replace(p.old, p.new));
}
for (const [f, out] of files) {
  const before = readFileSync(f, "utf8");
  console.log(`  ${f.split("/").pop().padEnd(18)} ${sha(before)} -> ${sha(out)}  (${before.length} -> ${out.length} chars)`);
  if (!dry) writeFileSync(f, out, "utf8");
}
console.log(dry ? "\n--dry: nothing written." : "\nF1 applied.");
