import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let s = readFileSync(f, "utf8");
// the PNG layer loop (index k) must use groups[k].box; the GIF loop (target) must use target.box
const pngLoop = s.indexOf("for (let k = 0; k < groups.length; k++) {");
const gifLoop = s.indexOf("for (const ti of dynIdx) {");
if (pngLoop < 0 || gifLoop < 0) { console.error("loops not found"); process.exit(1); }
const head = s.slice(0, gifLoop), tail = s.slice(gifLoop);
const headFixed = head.replace("const clip = clipFor(target.box, pad, W, H);", "const clip = clipFor(groups[k].box, pad, W, H);");
const tailFixed = tail.replace("const clip = clipFor(groups[k].box, pad, W, H);", "const clip = clipFor(target.box, pad, W, H);");
s = headFixed + tailFixed;
// the "no motion" branch must not touch groups[k]
s = s.replace("          groups[k].gifMoves = false;\n", "");
writeFileSync(f, s, "utf8");
console.log("clip ownership fixed");
