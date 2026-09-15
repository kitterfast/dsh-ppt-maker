import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let s = readFileSync(f, "utf8");
const bad = "const file = rel(`g${target.gk} bit${target.j}.png`);";
const good = "const file = rel(`g${k}.png`);";
if (!s.includes(bad)) { console.log("nothing to revert"); } else { s = s.replace(bad, good); writeFileSync(f, s, "utf8"); console.log("PNG layer filename restored"); }
