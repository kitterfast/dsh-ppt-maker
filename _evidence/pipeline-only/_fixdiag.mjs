import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let lines = readFileSync(f, "utf8").split("\n");
const before = lines.length;
lines = lines.filter((l) => !l.includes("[diag] p"));
writeFileSync(f, lines.join("\n"), "utf8");
console.log(`removed ${before - lines.length} broken diag line(s)`);
