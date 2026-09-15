import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck.config.json";
const c = JSON.parse(readFileSync(f, "utf8"));
c.gif = Object.assign({ maxPeriodMs: 15000, intervalMs: 70, leadMs: 1500 }, c.gif || {});
writeFileSync(f, JSON.stringify(c, null, 2) + "\n", "utf8");
console.log("gif.maxPeriodMs = 15000 (dashflow cycle is 14 s, so the loop is now seamless)");
