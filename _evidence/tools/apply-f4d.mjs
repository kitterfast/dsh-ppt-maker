/**
 * F4d patch — refuse to accept A_MEMBERS coverage that cannot be verified.
 *
 * Caught by the frozen G2 suite, case F:
 *   "有歧义但未声明 members"  expected E_AMBIGUOUS_UNDECLARED, got [none]
 *
 * F2 made A_MEMBERS coverage depend on `dom.nestedPages` — which pages the
 * runtime detector flagged as ambiguous. A caller that does not supply that list
 * (the G2 harness calls patchMerge directly) got `pages = []`, hence
 * `unresolved = []`, hence NO error. That is silent acceptance: the ambiguity is
 * known to exist, yet coverage is waved through because the page list is missing.
 *
 * The caliber forbids exactly this. When the ambiguous page list is absent the
 * only honest answer is to refuse and say why.
 *
 * Usage: node tools/apply-f4d.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const dry = process.argv.includes("--dry");
const MF = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/lib/manifest.mjs";
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const oldBlock =
  "  if (amb.has(AMB.MEMBERS)) {\n" +
  "    const pages = dom.nestedPages ?? [];\n" +
  "    const unresolved = pages.filter((p) => !membersResolvedPages.has(p));\n" +
  "    if (unresolved.length) {\n" +
  "      errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: AMB.MEMBERS, detail: `${amb.get(AMB.MEMBERS)}; no landing members declaration for page(s) ${unresolved.join(\",\")}` });\n" +
  "    } else {\n" +
  "      notes.push(`${AMB.MEMBERS} resolved by declaration on page(s) ${pages.join(\",\")}`);\n" +
  "    }\n" +
  "  }";

const newBlock =
  "  if (amb.has(AMB.MEMBERS)) {\n" +
  "    // Coverage is verified against the pages the runtime detector flagged. If the\n" +
  "    // caller did not supply that list, coverage CANNOT be verified — refuse and\n" +
  "    // say so. Treating a missing list as \"nothing unresolved\" is silent\n" +
  "    // acceptance of a known ambiguity, which the caliber forbids.\n" +
  "    if (!Array.isArray(dom.nestedPages)) {\n" +
  "      errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: AMB.MEMBERS, detail: `${amb.get(AMB.MEMBERS)}; the caller supplied no ambiguous page list, so membership coverage cannot be verified` });\n" +
  "    } else {\n" +
  "      const pages = dom.nestedPages;\n" +
  "      const unresolved = pages.filter((p) => !membersResolvedPages.has(p));\n" +
  "      if (unresolved.length) {\n" +
  "        errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: AMB.MEMBERS, detail: `${amb.get(AMB.MEMBERS)}; no landing members declaration for page(s) ${unresolved.join(\",\")}` });\n" +
  "      } else {\n" +
  "        notes.push(`${AMB.MEMBERS} resolved by declaration on page(s) ${pages.join(\",\")}`);\n" +
  "      }\n" +
  "    }\n" +
  "  }";

const src = readFileSync(MF, "utf8");
const hits = src.split(oldBlock).length - 1;
console.log("===== F4d patch: anchor verification =====");
console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${"refuse unverifiable A_MEMBERS coverage".padEnd(44)} hits=${hits}`);
if (hits !== 1) {
  console.log("\nanchor did not resolve exactly once — nothing written.");
  process.exit(1);
}
const out = src.replace(oldBlock, newBlock);
console.log("\n===== applying =====");
console.log(`  manifest.mjs  ${sha(src)} -> ${sha(out)}  (${src.length} -> ${out.length} chars)`);
if (!dry) writeFileSync(MF, out, "utf8");

try {
  execFileSync(process.execPath, ["--check", MF], { stdio: ["ignore", "pipe", "pipe"] });
  console.log("\n  [PASS] node --check manifest.mjs");
} catch (e) {
  console.log("\n  [FAIL] node --check manifest.mjs\n" + String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n"));
  process.exit(1);
}
console.log(dry ? "\n--dry: nothing written." : "\nF4d applied.");
