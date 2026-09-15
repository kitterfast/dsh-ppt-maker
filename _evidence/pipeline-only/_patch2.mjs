import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2];
const f = `${dir}/deck-to-pptx.mjs`;
let s = readFileSync(f, "utf8");
if (!s.includes("animRot")) { console.log("already clean"); process.exit(0); }
const i = s.indexOf("const rot =");
const j = s.indexOf("</p:animRot>`;");
if (i < 0 || j < 0) { console.error("markers not found", i, j); process.exit(1); }
const end = s.indexOf("\n", j) + 1;
s = s.slice(0, i) + "\n" + s.slice(end);
s = s.replace("${setVis}${fade}${move}${rot}", "${setVis}${fade}${move}");
s = s.replace(/[ \t]*const rotId = nextId\(\);\n/, "");
s = s.replace(/\/\*\*[\s\S]*?\*\/\nfunction effectPar/, "function effectPar");
if (s.includes("animRot") || s.includes("rotId")) { console.error("cleanup incomplete"); process.exit(1); }
writeFileSync(f, s, "utf8");
console.log("animRot removed");
