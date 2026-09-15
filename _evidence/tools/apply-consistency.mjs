/**
 * Checker/renderer consistency — the real fix, closing the divergence at its root.
 *
 * Root cause: `loadAndPlan` emitted no E_AMBIGUOUS_UNDECLARED at all, so the
 * checker printed "a manifest for this deck would need only version + capturePad"
 * for a deck whose page 7 genuinely nests its members, and the renderer then
 * refused the very manifest the checker had blessed.
 *
 * Fix: extract the coverage table out of patchMerge into `coversStatic`, so BOTH
 * loadAndPlan and patchMerge reach their verdict through the same function. Add
 * `runtimeUnresolved` for the dimension no paper analysis can settle (A_MEMBERS),
 * with a deliberately conservative pre-browser test: only "every layer of every
 * slide names its members" counts as covered — anything weaker is what let the
 * checker pass a manifest the renderer refused.
 *
 * A_INDEX is NOT in the runtime list: it is decided statically (a missing slide
 * selector) and covered by declaring index/page, so it flows through coversStatic.
 * (Measured: deck-render's runtime detector hardcodes slideIndexOrderUnique:true,
 * so A_INDEX never arises from the DOM pass either.)
 *
 * The render path in deck-render.mjs is NOT touched.
 *
 * Usage: node tools/apply-consistency.mjs [--dry]
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
  // ── manifest.mjs ───────────────────────────────────────────────────────────
  {
    file: MF,
    name: "C1 export coversStatic + runtimeUnresolved",
    old: "/* ───────────────── patch merge (§7) — the whole point ───────────────────── */",
    new:
      "/**\n" +
      " * Coverage of the ambiguity dimensions that are decidable BEFORE a browser runs.\n" +
      " *\n" +
      " * Extracted from patchMerge so that loadAndPlan reaches the SAME verdict: a\n" +
      " * checker that calls a manifest legal while the renderer refuses it is exactly\n" +
      " * the divergence this contract exists to prevent. A_MEMBERS is deliberately\n" +
      " * absent here — it needs the DOM; see runtimeUnresolved.\n" +
      " */\n" +
      "export function coversStatic(merged, amb) {\n" +
      "  const allSlidesFully = (key) =>\n" +
      "    (merged?.slides ?? []).length > 0 &&\n" +
      "    merged.slides.every((s) => (s.layers ?? []).length > 0 && s.layers.every((L) => key(L)));\n" +
      "  // `page` is accepted alongside `index`: both are 1-based page numbers.\n" +
      "  const table = {\n" +
      '    [AMB.STAGE]: () => !!(merged?.stage && "width" in merged.stage && "height" in merged.stage),\n' +
      '    [AMB.INDEX]: () => (merged?.slides ?? []).length > 0 && merged.slides.every((s) => "index" in s || "page" in s),\n' +
      '    [AMB.CLS]: () => allSlidesFully((L) => "cls" in L),\n' +
      '    [AMB.DELAY]: () => allSlidesFully((L) => "delayMs" in L),\n' +
      "  };\n" +
      "  const resolved = [], unresolved = [];\n" +
      "  for (const [code, detail] of amb) {\n" +
      "    if (code === AMB.MEMBERS) continue;\n" +
      "    if (table[code]?.()) resolved.push(code);\n" +
      "    else unresolved.push({ code, detail });\n" +
      "  }\n" +
      "  return { resolved, unresolved };\n" +
      "}\n" +
      "\n" +
      "/**\n" +
      " * Runtime dimensions a DOM pass must decide.\n" +
      " *\n" +
      " * A_MEMBERS is the only one that cannot be settled on paper: whether members\n" +
      " * nest is a property of the rendered DOM. The test below is deliberately\n" +
      " * CONSERVATIVE — it reports covered only when every layer of every slide names\n" +
      " * its members, which is sufficient but not necessary. Anything weaker is what\n" +
      " * let a manifest pass here and be refused by the renderer.\n" +
      " */\n" +
      "export function runtimeUnresolved(merged) {\n" +
      "  const fullyDeclared =\n" +
      "    (merged?.slides ?? []).length > 0 &&\n" +
      "    merged.slides.every((s) => (s.layers ?? []).length > 0 && s.layers.every((L) => Array.isArray(L.members) && L.members.length));\n" +
      "  return fullyDeclared\n" +
      "    ? []\n" +
      "    : [{ code: AMB.MEMBERS, detail: \"nested layer membership is only decidable once the DOM is available; declare members for every layer of every slide to cover it on paper, or let the renderer decide\" }];\n" +
      "}\n" +
      "\n" +
      "/* ───────────────── patch merge (§7) — the whole point ───────────────────── */",
  },
  {
    file: MF,
    name: "C2 patchMerge decides through coversStatic",
    old:
      "  const covers = {\n" +
      '    [AMB.STAGE]: () => !!(merged?.stage && "width" in merged.stage && "height" in merged.stage),\n' +
      "    // `page` is accepted alongside `index`: both are 1-based page numbers.\n" +
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
    new:
      "  // The same function loadAndPlan uses, so the checker and the renderer cannot\n" +
      "  // reach different verdicts on one manifest. A_MEMBERS is still not decided\n" +
      "  // here: it depends on a declaration landing on the ambiguous page, which is\n" +
      "  // only known once the per-page plan below exists.\n" +
      "  const { resolved: staticOk, unresolved: staticBad } = coversStatic(merged, amb);\n" +
      "  for (const code of staticOk) notes.push(`${code} resolved by declaration`);\n" +
      "  for (const u of staticBad) errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: u.code, detail: u.detail });",
  },
  {
    file: MF,
    name: "C3 loadAndPlan emits the static verdict",
    old: "  const amb = staticAmbiguity(facts);\n  return {",
    new:
      "  const amb = staticAmbiguity(facts);\n" +
      "  // The static verdict comes from the SAME function patchMerge uses. loadAndPlan\n" +
      "  // previously emitted no E_AMBIGUOUS_UNDECLARED at all, so this checker could\n" +
      '  // print "needs only version + capturePad" for a deck whose page 7 genuinely\n' +
      "  // nests its members — and the renderer then refused that manifest.\n" +
      "  for (const u of coversStatic(m.merged, amb).unresolved) {\n" +
      "    errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: u.code, detail: u.detail });\n" +
      "  }\n" +
      "  return {",
  },
  // ── validate-manifest.mjs ─────────────────────────────────────────────────
  {
    file: VM,
    name: "C4 import runtimeUnresolved",
    old: "import {\n  loadAndPlan, staticAmbiguity, AMB, ERR, SCHEMA_VERSION, EMBED_ID, SIDECAR_NAME,\n} from \"../lib/manifest.mjs\";",
    new: "import {\n  loadAndPlan, staticAmbiguity, runtimeUnresolved, AMB, ERR, SCHEMA_VERSION, EMBED_ID, SIDECAR_NAME,\n} from \"../lib/manifest.mjs\";",
  },
  {
    file: VM,
    name: "C5 report runtime dimensions and fail conservatively in default mode",
    old:
      "// DEFAULT: E_AMBIGUOUS_UNDECLARED is fatal, exactly as it is in the pipeline.\n" +
      "// --report: advisory only, excluded from the exit code.\n" +
      "const fatal = report\n" +
      "  ? res.errors.filter((e) => e.code !== ERR.AMBIGUOUS_UNDECLARED)\n" +
      "  : res.errors;\n" +
      "process.exit(res.present && fatal.length ? 1 : 0);",
    new:
      "/* ── 3. runtime dimensions: undecidable on paper ─────────────────────────── */\n" +
      "\n" +
      "const runtimeUnres = res.present ? runtimeUnresolved(res.merged) : [];\n" +
      "if (runtimeUnres.length) {\n" +
      "  console.log(`\\n  RUNTIME UNRESOLVED (no DOM here): ${runtimeUnres.length}`);\n" +
      "  for (const u of runtimeUnres) console.log(`    ${u.code}  ${u.detail}`);\n" +
      '  console.log("    this checker alone cannot certify the manifest while these remain; the renderer is authoritative");\n' +
      "}\n" +
      "\n" +
      "// DEFAULT: every declaration error is fatal, E_AMBIGUOUS_UNDECLARED included,\n" +
      "// and a runtime dimension that cannot be settled on paper fails conservatively.\n" +
      "// Exiting 0 here must never imply \"the renderer will accept it\".\n" +
      "// --report: advisory only, nothing counts towards the exit code.\n" +
      "const fatal = report\n" +
      "  ? res.errors.filter((e) => e.code !== ERR.AMBIGUOUS_UNDECLARED)\n" +
      "  : res.errors;\n" +
      "const runtimeFatal = report ? [] : runtimeUnres;\n" +
      "process.exit(res.present && (fatal.length || runtimeFatal.length) ? 1 : 0);",
  },
  // ── g2-test.mjs: case G ───────────────────────────────────────────────────
  {
    file: G2,
    name: "C6 add case G (checker and renderer must agree)",
    old:
      "  console.log(`  ${ok ? \"PASS\" : \"FAIL\"}  ${name.padEnd(26)} expect=${expect.padEnd(28)} got=[${[...all].join(\",\") || \"none\"}]`);\n" +
      "}\n" +
      "console.log(`\\n  ${pass}/${cases.length} cases behaved as specified`);\n" +
      "process.exit(pass === cases.length ? 0 : 1);",
    new:
      "  console.log(`  ${ok ? \"PASS\" : \"FAIL\"}  ${name.padEnd(26)} expect=${expect.padEnd(28)} got=[${[...all].join(\",\") || \"none\"}]`);\n" +
      "}\n" +
      "\n" +
      "// ── case G: the checker and the renderer must reach the SAME verdict ───────\n" +
      "// A_MEMBERS is ambiguous and the declaration does not cover it. The checker,\n" +
      "// having no DOM, must refuse to certify the manifest; the renderer, at its DOM\n" +
      "// pass, must refuse it too. AGREEMENT is the assertion: a checker that reports\n" +
      "// \"legal\" while the renderer refuses is the divergence this fixes.\n" +
      "{\n" +
      '  const { runtimeUnresolved } = await import("../lib/manifest.mjs");\n' +
      '  const htmlPath = mk("G", { version: 1, capturePad: 10 }, null);\n' +
      '  const html = readFileSync(htmlPath, "utf8");\n' +
      "  const r = loadAndPlan({ htmlPath, htmlText: html, config, facts: { ...facts }, g6Attested: false });\n" +
      "  const checkerRefuses = runtimeUnresolved(r.merged).length > 0;\n" +
      "  const gCodes = patchMerge({ merged: r.merged, amb: ambWithNesting, dom: { slides: [], motion: [], nestedPages: [7] } })\n" +
      '    .errors.map((e) => e.code);\n' +
      '  const rendererRefuses = gCodes.includes("E_AMBIGUOUS_UNDECLARED");\n' +
      "  const ok = checkerRefuses && rendererRefuses;\n" +
      "  if (ok) pass++;\n" +
      '  console.log(`  ${ok ? "PASS" : "FAIL"}  ${"G checker vs renderer agree".padEnd(26)} checkerRefuses=${checkerRefuses} rendererRefuses=${rendererRefuses}`);\n' +
      "}\n" +
      "\n" +
      "console.log(`\\n  ${pass}/${cases.length + 1} cases behaved as specified`);\n" +
      "process.exit(pass === cases.length + 1 ? 0 : 1);",
  },
];

const files = new Map();
let bad = 0;
console.log("===== consistency fix: anchor verification =====");
for (const p of patches) {
  if (!files.has(p.file)) files.set(p.file, readFileSync(p.file, "utf8"));
  const hits = files.get(p.file).split(p.old).length - 1;
  if (hits !== 1) bad++;
  console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${p.name.padEnd(56)} hits=${hits}`);
}
if (bad) {
  console.log(`\n${bad} anchor(s) did not resolve exactly once — nothing written.`);
  process.exit(1);
}
for (const p of patches) files.set(p.file, files.get(p.file).replace(p.old, p.new));
console.log("\n===== applying =====");
for (const [f, out] of files) {
  const before = readFileSync(f, "utf8");
  console.log(`  ${f.split("/").pop().padEnd(24)} ${sha(before)} -> ${sha(out)}  (${before.length} -> ${out.length} chars)`);
  if (!dry) writeFileSync(f, out, "utf8");
}
if (!dry) {
  console.log("\n===== syntax check =====");
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
console.log(dry ? "\n--dry: nothing written." : "\nConsistency fix applied.");
