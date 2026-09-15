import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let s = readFileSync(f, "utf8");
// the bits must take part in the cache key, otherwise discovering them does not
// invalidate a slide that was rendered before they were considered
const old = "      .update(JSON.stringify({ n, groups: groups.map((g) => [g.box, g.delayMs, g.text]) }))";
if (!s.includes(old)) { console.error("hash anchor missing"); process.exit(1); }
s = s.replace(old, "      .update(JSON.stringify({ n, groups: groups.map((g) => [g.box, g.delayMs, g.text]), bits: groups.map((g) => (g.bits || []).map((b) => b.box)) }))");
s = s.replace('const RENDERER_VERSION = "14"', 'const RENDERER_VERSION = "15"');
// drop the temporary diagnostic
s = s.split("\n").filter((l) => !l.includes("[diag]")).join("\n");
s = s.replace("    let bitsPerGroup = [];\n    try { bitsPerGroup = JSON.parse(__rawBits); }\n    catch (e) {  }\n", "    const bitsPerGroup = JSON.parse(__rawBits);\n");
writeFileSync(f, s, "utf8");
console.log("cache key now includes bits; renderer v15");
