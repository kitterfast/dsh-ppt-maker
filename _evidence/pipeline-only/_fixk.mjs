import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
const lines = readFileSync(f, "utf8").split("\n");
let n = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("循环周期") && lines[i].includes("g${k}")) {
    lines[i] = lines[i].replace("g${k}", "g${target.gk} bit${target.j}");
    n++;
  }
}
writeFileSync(f, lines.join("\n"), "utf8");
console.log(`fixed ${n} line(s)`);
