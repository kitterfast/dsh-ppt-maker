/**
 * F4b patch — restore the closing brace that F4's M3 replacement swallowed.
 *
 * The M3 anchor ended with the `}` that closed `for (const d of dom.slides) {`,
 * and the replacement did not put it back. Everything after that point was
 * therefore parsed inside the loop, so the later `export function loadAndPlan`
 * raised `SyntaxError: Unexpected token 'export'` and the whole pipeline was
 * dead — every declared run failed before it could validate anything.
 *
 * This is exactly the class of mistake a patch script must catch itself, so this
 * script also runs a real syntax check on every touched file and refuses to
 * report success if the file does not parse.
 *
 * Usage: node tools/apply-f4b.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const dry = process.argv.includes("--dry");
const MF = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/lib/manifest.mjs";
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const oldBlock =
  "          // D7: ONLY pages that actually carry a located declared layer enter\n" +
  "          // the plan. Routing an undeclared page into the declared branch gave\n" +
  "          // every one of its layers an empty member list, hence a null box,\n" +
  "          // hence a crash at capture time.\n" +
  "          plan.slides.set(d.page, locate);\n" +
  "        }\n" +
  "      }";
const newBlock = oldBlock + "\n  }";

const src = readFileSync(MF, "utf8");
const hits = src.split(oldBlock).length - 1;
console.log("===== F4b patch: anchor verification =====");
console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${"restore for-loop closing brace".padEnd(40)} hits=${hits}`);
if (hits !== 1) {
  console.log("\nanchor did not resolve exactly once — nothing written.");
  process.exit(1);
}
const out = src.replace(oldBlock, newBlock);
console.log("\n===== applying =====");
console.log(`  manifest.mjs  ${sha(src)} -> ${sha(out)}  (${src.length} -> ${out.length} chars)`);
if (!dry) writeFileSync(MF, out, "utf8");

console.log("\n===== syntax check =====");
let bad = 0;
for (const f of [MF, "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/deck-render.mjs"]) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "pipe", "pipe"] });
    console.log(`  [PASS] node --check ${f.split("/").pop()}`);
  } catch (e) {
    bad++;
    console.log(`  [FAIL] node --check ${f.split("/").pop()}`);
    console.log(String(e.stderr ?? e.message).split("\n").slice(0, 8).map((l) => "         " + l).join("\n"));
  }
}
console.log(bad ? "\nSYNTAX CHECK FAILED — the pipeline is not runnable." : "\nF4b applied and both files parse.");
process.exit(bad ? 1 : 0);
