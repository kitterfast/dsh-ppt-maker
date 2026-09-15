import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let lines = readFileSync(f, "utf8").split("\n");
let n = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("no motion in") && lines[i].includes("g${k}")) {
    lines[i] = lines[i].replace("g${k}", "g${target.gk} bit${target.j}");
    n++;
  }
  if (/\bg\$\{k\}/.test(lines[i])) { lines[i] = lines[i].replace(/\bg\$\{k\}/g, "g${target.gk} bit${target.j}"); n++; }
}
writeFileSync(f, lines.join("\n"), "utf8");
console.log(`fixed ${n} leftover k reference(s)`);
