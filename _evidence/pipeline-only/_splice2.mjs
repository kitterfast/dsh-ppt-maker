import { readFileSync, writeFileSync } from "node:fs";
const f = "deck-render.mjs";
let s = readFileSync(f, "utf8");
const start = s.indexOf("/** Runs in the page.");
const endMarker = "\ntrue;`;\n";
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) { console.error("markers not found", start, end); process.exit(1); }
const replacement = "/** Injected into the page; shared verbatim with the fidelity probe so the probe\n *  measures the real capture path. */\nconst PAGE_HELPERS = readFileSync(new URL(\"./lib/page-helpers.js\", import.meta.url), \"utf8\");\n";
s = s.slice(0, start) + replacement + s.slice(end + endMarker.length);
writeFileSync(f, s, "utf8");
console.log("spliced; PAGE_HELPERS now loaded from lib/page-helpers.js");
