import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let lines = readFileSync(f, "utf8").split("\n");
const out = [];
for (const l of lines) {
  if (l.trim().startsWith("try { bitsPerGroup = JSON.parse")) { out.push("    const bitsPerGroup = JSON.parse(__rawBits);"); continue; }
  if (l.trim().startsWith("let bitsPerGroup = [];")) continue;
  if (/^\s*catch \(e\)/.test(l)) continue;
  out.push(l);
}
writeFileSync(f, out.join("\n"), "utf8");
console.log("dangling try removed");
