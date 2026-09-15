/**
 * G2 case C/F update — remove the retired "motion covers A_MEMBERS" exemption.
 *
 * Approved ruling ①. Two corrections to what was originally proposed:
 *
 *  1. The proposal claimed adding `nestedPages` would make C and F "distinguishable
 *     again". That was wrong: pre-browser there is no DOM, so a declaration can
 *     never resolve membership, and BOTH cases would return E_AMBIGUOUS_UNDECLARED
 *     — C would collapse into a duplicate of F and lose its purpose.
 *
 *  2. Case C's purpose (per its own header) is "the minimal real manifest for the
 *     reference deck", i.e. it must be ACCEPTED. Its nesting ambiguity existed only
 *     to exercise the motion exemption, which is now retired. So C runs without the
 *     ambiguity, and F becomes the A_MEMBERS coverage case.
 *
 * `nestedPages` is still supplied whenever a case's amb says A_MEMBERS: without it
 * the coverage check cannot run and refuses for the wrong reason (F4d).
 *
 * Usage: node tools/apply-g2.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const dry = process.argv.includes("--dry");
const G2 = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/tools/g2-test.mjs";
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const patches = [
  {
    name: "G2-1 header documents the retired exemption",
    old:
      " * G2 negative tests: a production manifest must FAIL before the browser starts.\n" +
      " * Case C is also the minimal real manifest for the reference deck and doubles as\n" +
      " * the A_MEMBERS coverage check (§7 step 5).",
    new:
      " * G2 negative tests: a production manifest must FAIL before the browser starts.\n" +
      " *\n" +
      " * Case C is the minimal LEGAL manifest for the reference deck and must be\n" +
      " * ACCEPTED, so it runs without a nesting ambiguity: declaring `motion` no longer\n" +
      " * covers A_MEMBERS — motion describes runtime animation, membership describes\n" +
      " * which elements form a layer. Case F is the A_MEMBERS coverage case now.\n" +
      " *\n" +
      " * A_MEMBERS coverage is decided from the resolved per-page plan, which needs a\n" +
      " * DOM. Pre-browser a declaration cannot resolve membership, so F asserts the\n" +
      " * REFUSAL. The positive path — a landing members declaration is accepted — is\n" +
      " * covered in-browser by U4-a.",
  },
  {
    name: "G2-2 case C drops the nesting ambiguity",
    old: '  ["C 最小合法声明 + motion",     { version: 1, capturePad: 10, motion: [{ slide: 7, owner: "#threeAI", kind: "canvas", loopMs: 6000 }] }, null, ambWithNesting, "(no error)"],',
    new: '  ["C 最小合法声明 + motion",     { version: 1, capturePad: 10, motion: [{ slide: 7, owner: "#threeAI", kind: "canvas", loopMs: 6000 }] }, null, amb, "(no error)"],',
  },
  {
    name: "G2-3 supply the ambiguous page list when amb says A_MEMBERS",
    old: "    const dom = { slides: [], motion: domMotion };",
    new:
      "    // The coverage check needs to know WHICH pages are ambiguous. Supplying it\n" +
      "    // only for the cases whose amb includes A_MEMBERS keeps every other case on\n" +
      "    // the unverifiable path it is actually testing.\n" +
      "    const nestedPages = ambMap.has(\"A_MEMBERS\") ? [7] : [];\n" +
      "    const dom = { slides: [], motion: domMotion, nestedPages };",
  },
];

const src = readFileSync(G2, "utf8");
let bad = 0;
console.log("===== G2 patch: anchor verification =====");
for (const p of patches) {
  const hits = src.split(p.old).length - 1;
  if (hits !== 1) bad++;
  console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${p.name.padEnd(52)} hits=${hits}`);
}
if (bad) {
  console.log(`\n${bad} anchor(s) did not resolve exactly once — nothing written.`);
  process.exit(1);
}
let out = src;
for (const p of patches) out = out.replace(p.old, p.new);
console.log("\n===== applying =====");
console.log(`  g2-test.mjs  ${sha(src)} -> ${sha(out)}  (${src.length} -> ${out.length} chars)`);
if (!dry) writeFileSync(G2, out, "utf8");

if (!dry) {
  try {
    execFileSync(process.execPath, ["--check", G2], { stdio: ["ignore", "pipe", "pipe"] });
    console.log("\n  [PASS] node --check g2-test.mjs");
  } catch (e) {
    console.log("\n  [FAIL] node --check g2-test.mjs\n" + String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n"));
    process.exit(1);
  }
}
console.log(dry ? "\n--dry: nothing written." : "\nG2 updated.");
