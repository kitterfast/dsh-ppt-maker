import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-verify.mjs";
let s = readFileSync(f, "utf8");
const a = "const wantTotal = manifest.slides.reduce((a, s) => a + s.groups.length, 0);";
if (!s.includes(a)) { console.error("total anchor missing"); process.exit(1); }
s = s.replace(a, "const wantTotal = manifest.slides.reduce(\n          (a, s) => a + s.groups.length + s.groups.reduce((n, g) => n + (g.bits || []).filter((b) => b.gif).length, 0),\n          0,\n        );");
writeFileSync(f, s, "utf8");
console.log("total-effect expectation updated");
