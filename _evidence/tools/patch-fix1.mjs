// Fix: the ECharts-replay probe still called the element-level animatedBits()
// with a class-GROUP object ({cls, els}), which has no querySelectorAll.
import { readFileSync, writeFileSync } from 'node:fs';
const FILE = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/deck-render.mjs';
let src = readFileSync(FILE, 'utf8');
const oldText = `               var bits = g ? window.__deckRender.animatedBits(g) : [];`;
const newText = `               var bits = g ? window.__deckRender.groupAnimatedBits(g) : [];`;
const parts = src.split(oldText);
if (parts.length - 1 !== 1) {
  console.error(`FAIL: expected 1 match, found ${parts.length - 1}`);
  process.exit(1);
}
writeFileSync(FILE, parts.join(newText), 'utf8');
console.log('ok: replayCharts probe now uses groupAnimatedBits');
