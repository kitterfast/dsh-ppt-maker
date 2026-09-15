/**
 * F3b patch — fix the signature function, which the F3 dump proved was corrupt.
 *
 * Measured corruption (u4 evidence, _seal-2.6.0/dom-pass-p7.json):
 *   "div#threeAI.ai-.creen a4"   instead of  "div#threeAI.ai-screen.a4"
 *   "div. a3 paper-line. pc.tep" instead of  "div.a3.paper-lines.pc.steps"
 *
 * Cause: the in-page source is carried inside a TEMPLATE LITERAL in
 * deck-render.mjs, and a template literal consumes backslash escapes. `\s` is
 * not a recognised escape, so it collapses to a bare `s` — the page was running
 * `.split(/s+/)`, splitting class names on the letter "s".
 *   "ai-screen a4".split(/s+/) === ["ai-", "creen a4"]  ->  "ai-.creen a4"  (exact match)
 *
 * Corrupt signatures are not cosmetic: they collide across distinct elements, so
 * an identity comparison built on them would pass when it must fail.
 *
 * Fix: use no backslash escapes at all. HTML class attributes are
 * space-separated, and filter(Boolean) absorbs runs of spaces.
 *
 * Usage: node tools/apply-f3b.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dry = process.argv.includes("--dry");
const DR = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/deck-render.mjs";
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const patches = [
  {
    file: DR,
    name: "F3b escape-free class split in sig()",
    // the FILE contains the two-character sequence \s; escape it here so the
    // patch script does not eat it first
    old: "          var cl = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).sort();",
    new: "          // no backslash escapes here: this source lives inside a template\n" +
      "          // literal, which would turn \\s into a bare s and split on the letter s\n" +
      "          var cl = (el.getAttribute('class') || '').split(' ').filter(Boolean).sort();",
  },
];

const files = new Map();
let bad = 0;
console.log("===== F3b patch: anchor verification =====");
for (const p of patches) {
  if (!files.has(p.file)) files.set(p.file, readFileSync(p.file, "utf8"));
  const hits = files.get(p.file).split(p.old).length - 1;
  if (hits !== 1) bad++;
  console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${p.name.padEnd(46)} hits=${hits}`);
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
console.log(dry ? "\n--dry: nothing written." : "\nF3b applied.");
