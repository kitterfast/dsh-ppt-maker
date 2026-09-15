/**
 * F4c patch — close the remaining brace, verified by a real syntax check.
 *
 * F4's M3 replacement was itself balanced, but its anchor supplied TWO unmatched
 * closing braces (one for the enclosing `if (dec?.layers?.length) {`, one for the
 * enclosing `for (const d of dom.slides) {`). The replacement supplied one; F4b
 * added a second; one is still missing.
 *
 * Rather than count braces by eye again — which is what got this wrong twice —
 * this script appends one closing brace at a time and re-runs `node --check`
 * after each, stopping as soon as the file parses. It reports exactly how many
 * were needed, so the diagnosis remains falsifiable: more than one would mean the
 * imbalance is not where this claims it is.
 *
 * Usage: node tools/apply-f4c.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const dry = process.argv.includes("--dry");
const MF = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/lib/manifest.mjs";
const DR = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/deck-render.mjs";
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const parses = (f) => {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true };
  } catch (e) {
    const msg = String(e.stderr ?? e.message);
    const line = (msg.match(/:(\d+)\n/) ?? [])[1] ?? "?";
    return { ok: false, line };
  }
};

const anchor =
  "          plan.slides.set(d.page, locate);\n" +
  "        }\n" +
  "      }\n" +
  "  }";

let src = readFileSync(MF, "utf8");
console.log("===== F4c patch =====");
console.log(`  before: manifest.mjs ${sha(src)}  ${src.length} chars`);
const before = parses(MF);
console.log(`  node --check: ${before.ok ? "PASS" : `FAIL at line ${before.line}`}`);
if (before.ok) {
  console.log("  already parses — nothing to do.");
  process.exit(0);
}
const hits = src.split(anchor).length - 1;
console.log(`  anchor hits=${hits}  (expected 1)`);
if (hits !== 1) {
  console.log("  anchor did not resolve exactly once — nothing written.");
  process.exit(1);
}

let added = 0;
let current = src.replace(anchor, anchor.slice(0, -3) + "    }\n  }");
for (let i = 1; i <= 3; i++) {
  if (dry) { added = i; break; }
  writeFileSync(MF, current, "utf8");
  const r = parses(MF);
  added = i;
  console.log(`  after adding ${i} closing brace(s): ${r.ok ? "PASS" : `FAIL at line ${r.line}`}`);
  if (r.ok) break;
  current = current + "\n  }";
}

if (dry) {
  console.log("\n--dry: nothing written.");
  process.exit(0);
}
const rFinal = parses(MF);
console.log(`\n  closing braces added: ${added}`);
console.log(`  manifest.mjs ${sha(src)} -> ${sha(readFileSync(MF, "utf8"))}`);
console.log(`  deck-render.mjs ${sha(readFileSync(DR, "utf8"))}  node --check: ${parses(DR).ok ? "PASS" : "FAIL"}`);
console.log(rFinal.ok ? "\nSYNTAX OK — pipeline runnable." : "\nSTILL BROKEN — report, do not proceed.");
process.exit(rFinal.ok ? 0 : 1);
