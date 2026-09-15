import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let s = readFileSync(f, "utf8");

const head = "    const bitsPerGroup = JSON.parse(\n      await evaluate(\n        client,\n";
const hi = s.indexOf(head);
if (hi < 0) { console.error("head anchor missing"); process.exit(1); }

const tail = "return res; })()`,\n      ),\n    );";
const ti = s.indexOf(tail, hi);
if (ti < 0) { console.error("tail anchor missing"); process.exit(1); }

const queryStart = hi + head.length;
const query = s.slice(queryStart, ti);           // the template literal only
const after = ti + tail.length;

const replacement =
  "    const __rawBits = await evaluate(\n        client,\n" +
  query +
  "return res; })()`,\n      );\n" +
  "    let bitsPerGroup = [];\n" +
  "    try { bitsPerGroup = JSON.parse(__rawBits); }\n" +
  "    catch (e) { console.log('[diag] bits parse failed: ' + e.message + ' raw=' + String(__rawBits).slice(0, 200)); }\n" +
  "    console.log('[diag] p' + (n + 1) + ' bitsPerGroup=' + JSON.stringify(bitsPerGroup.map(function (x) { return x.length; })));\n";

s = s.slice(0, hi) + replacement + s.slice(after);
writeFileSync(f, s, "utf8");
console.log("diagnostic wired into the renderer");
