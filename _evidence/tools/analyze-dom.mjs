/**
 * Read a DOM-pass dump and report the real member distribution.
 *
 * Purpose: author the U4 expected values from MEASURED, hand-checkable facts —
 * and find out whether F4 rule 5 ("an element set contained in two or more
 * layers -> E_AMBIGUOUS_UNDECLARED") is reachable on this deck at all. If no
 * signature is shared between layers, the branch cannot be exercised and saying
 * otherwise would be fabrication.
 *
 * Usage: node tools/analyze-dom.mjs <dump.json>
 */
import { readFileSync } from "node:fs";

const [dumpPath] = process.argv.slice(2);
if (!dumpPath) {
  console.error("Usage: node tools/analyze-dom.mjs <dump.json>");
  process.exit(2);
}
const dump = JSON.parse(readFileSync(dumpPath, "utf8"));
console.log(`total=${dump.total}  pages=${(dump.pages ?? []).join(",")}  nestedPages=${(dump.nestedPages ?? []).join(",")}`);

const sharedAcrossLayers = [];
for (const s of dump.slides) {
  console.log(`\np${s.page}: ${s.layers.length} layer(s)`);
  const owner = new Map();
  s.layers.forEach((L, k) => {
    console.log(`  k=${k} cls="${L.cls}" n=${L.memberCount} box=${L.box ? "ok" : "NULL"}  ${(L.memberSigs ?? []).join(" + ")}`);
    for (const sig of L.memberSigs ?? []) {
      if (!owner.has(sig)) owner.set(sig, []);
      owner.get(sig).push(k);
    }
  });
  for (const [sig, ks] of owner) {
    if (ks.length > 1) {
      sharedAcrossLayers.push({ page: s.page, sig, layers: ks });
      console.log(`  ** SHARED: ${sig} appears in layers ${ks.join(",")}`);
    }
  }
  for (const L of s.layers) if (!L.box) console.log(`  ** NULL BOX on layer k (check F5 relevance)`);
}

console.log("\n===== summary =====");
if (sharedAcrossLayers.length === 0) {
  console.log("no signature is shared between two layers on any page");
  console.log("=> F4 rule 5 (>=2 layers contain S) is NOT reachable from disjoint layering");
} else {
  for (const r of sharedAcrossLayers) console.log(`p${r.page}  ${r.sig}  in layers ${r.layers.join(",")}`);
}
