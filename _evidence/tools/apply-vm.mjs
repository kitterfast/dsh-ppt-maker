/**
 * Rule ① — validate-manifest.mjs: E_AMBIGUOUS_UNDECLARED participates in the exit
 * code by default; --report keeps the advisory behaviour.
 *
 * HONEST SCOPE NOTE, measured before writing this patch:
 *   `loadAndPlan` never emits E_AMBIGUOUS_UNDECLARED. It returns parse errors,
 *   merge errors and validateDeclaration errors only — the static-ambiguity
 *   COVERAGE decision lives in patchMerge, which needs a DOM. So the filter this
 *   patch removes was dead code, and removing it does NOT by itself close the
 *   "validator says 0, renderer refuses" gap. That gap needs static coverage to be
 *   decided in loadAndPlan as well. This patch implements the ruling exactly and
 *   documents the limitation; it does not claim to fix the gap.
 *
 * Usage: node tools/apply-vm.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const dry = process.argv.includes("--dry");
const VM = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/tools/validate-manifest.mjs";
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const patches = [
  {
    name: "VM-1 document the two modes",
    old: " * Usage:\n *   node tools/validate-manifest.mjs <deck.config.json> [--report]\n */",
    new:
      " * Usage:\n" +
      " *   node tools/validate-manifest.mjs <deck.config.json>            DEFAULT: validation gate\n" +
      " *   node tools/validate-manifest.mjs <deck.config.json> --report   advisory report\n" +
      " *\n" +
      " * DEFAULT mode mirrors what the renderer does: every declaration error counts\n" +
      " * towards the exit code, E_AMBIGUOUS_UNDECLARED included. A checker that exits 0\n" +
      " * while the pipeline refuses the same manifest is a contradiction the quality\n" +
      " * constraint does not allow.\n" +
      " *\n" +
      " * --report keeps the advisory behaviour — it answers \"which fields would a\n" +
      " * manifest for this deck have to declare?\" — so an unresolved ambiguity is\n" +
      " * information there rather than a verdict, and is excluded from the exit code.\n" +
      " *\n" +
      " * NOT decidable here: A_MEMBERS is a RUNTIME ambiguity, so it takes a DOM to see\n" +
      " * whether members nest. Even in default mode a 0 means \"legally well-formed\",\n" +
      " * not \"the renderer will accept it\". The renderer stays authoritative for\n" +
      " * runtime coverage; U4 covers that path.\n" +
      " */",
  },
  {
    name: "VM-2 default mode shows every error; report mode separates ambiguity",
    old:
      "  const hard = res.errors.filter((e) => e.code !== ERR.AMBIGUOUS_UNDECLARED);\n" +
      "  if (hard.length) {\n" +
      "    console.log(`  DECLARATION ERRORS (${hard.length}):`);\n" +
      "    for (const e of hard) console.log(`    ${e.code}  ${e.field}  ${e.detail}`);\n" +
      "  } else {\n" +
      '    console.log("  declaration     : legal (version/capturePad present, no conflicts, entries well-formed)");\n' +
      "  }",
    new:
      "  // Default mode lists every error, because every error is fatal to the run.\n" +
      "  // --report lists ambiguity separately: advice there, not a verdict.\n" +
      "  const shown = report ? res.errors.filter((e) => e.code !== ERR.AMBIGUOUS_UNDECLARED) : res.errors;\n" +
      "  const ambErrs = report ? res.errors.filter((e) => e.code === ERR.AMBIGUOUS_UNDECLARED) : [];\n" +
      "  if (shown.length) {\n" +
      "    console.log(`  DECLARATION ERRORS (${shown.length}):`);\n" +
      "    for (const e of shown) console.log(`    ${e.code}  ${e.field}  ${e.detail}`);\n" +
      "  } else {\n" +
      '    console.log("  declaration     : legal (version/capturePad present, no conflicts, entries well-formed)");\n' +
      "  }\n" +
      "  if (ambErrs.length) {\n" +
      "    console.log(`  ADVISORY (--report only, not counted in the exit code): ${ambErrs.length}`);\n" +
      "    for (const e of ambErrs) console.log(`    ${e.code}  ${e.field}  ${e.detail}`);\n" +
      "  }",
  },
  {
    name: "VM-3 exit code: ambiguity is fatal by default",
    old: "process.exit(res.present && res.errors.some((e) => e.code !== ERR.AMBIGUOUS_UNDECLARED) ? 1 : 0);",
    new:
      "// DEFAULT: E_AMBIGUOUS_UNDECLARED is fatal, exactly as it is in the pipeline.\n" +
      "// --report: advisory only, excluded from the exit code.\n" +
      "const fatal = report\n" +
      "  ? res.errors.filter((e) => e.code !== ERR.AMBIGUOUS_UNDECLARED)\n" +
      "  : res.errors;\n" +
      "process.exit(res.present && fatal.length ? 1 : 0);",
  },
];

const src = readFileSync(VM, "utf8");
let bad = 0;
console.log("===== rule ① patch: anchor verification =====");
for (const p of patches) {
  const hits = src.split(p.old).length - 1;
  if (hits !== 1) bad++;
  console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${p.name.padEnd(56)} hits=${hits}`);
}
if (bad) {
  console.log(`\n${bad} anchor(s) did not resolve exactly once — nothing written.`);
  process.exit(1);
}
let out = src;
for (const p of patches) out = out.replace(p.old, p.new);
console.log("\n===== applying =====");
console.log(`  validate-manifest.mjs  ${sha(src)} -> ${sha(out)}  (${src.length} -> ${out.length} chars)`);
if (!dry) writeFileSync(VM, out, "utf8");

if (!dry) {
  try {
    execFileSync(process.execPath, ["--check", VM], { stdio: ["ignore", "pipe", "pipe"] });
    console.log("\n  [PASS] node --check validate-manifest.mjs");
  } catch (e) {
    console.log("\n  [FAIL] node --check\n" + String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n"));
    process.exit(1);
  }
}
console.log(dry ? "\n--dry: nothing written." : "\nRule ① applied.");
