import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-verify.mjs";
let s = readFileSync(f, "utf8");

const a = "  const groupCount = slide.groups.length;";
if (!s.includes(a)) { console.error("count anchor missing"); process.exit(1); }
s = s.replace(a, "  const groupCount =\n    slide.groups.length + slide.groups.reduce((n, g) => n + (g.bits || []).filter((b) => b.gif).length, 0);");

const b = "  const animatedNames = slide.groups.map((g) => byName(pics, g.k)).filter(Boolean);";
if (!s.includes(b)) { console.error("names anchor missing"); process.exit(1); }
s = s.replace(b, `  const animatedNames = [];
  for (const g of slide.groups) {
    const main = byName(pics, g.k);
    if (main) animatedNames.push(main);
    (g.bits || []).forEach((bit, j) => {
      if (!bit.gif) return;
      for (const [id, nm] of pics) if (nm === \`g\${g.k}b\${j}\`) animatedNames.push({ id, name: nm });
    });
  }`);
writeFileSync(f, s, "utf8");
console.log("verifier now expects the baked sub-element shapes too");
