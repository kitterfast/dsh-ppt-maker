import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-to-pptx.mjs";
let s = readFileSync(f, "utf8");
const i = s.indexOf("const rot =");
const j = s.indexOf("</p:animRot>`;");
if (i < 0 || j < 0) { console.error("markers not found"); process.exit(1); }
const end = s.indexOf("\n", j) + 1;
s = s.slice(0, i) + s.slice(end);
s = s.replace("${setVis}${fade}${move}${rot}", "${setVis}${fade}${move}");
s = s.replace("  const rotId = nextId();\n", "");
// only rewrite the doc-comment LINE that documents animRot; touch nothing else
s = s.replace(/^ \* {3}<p:animRot[\s\S]*?the subtle settle\n/m, "");
if (/<p:animRot/.test(s) || /rotId/.test(s)) { console.error("still present"); process.exit(1); }
writeFileSync(f, s, "utf8");
console.log("animRot fully removed (code + doc line)");
