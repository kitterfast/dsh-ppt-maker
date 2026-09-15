// Dump a render manifest's per-slide group structure.
// Usage: node tools/show-manifest.mjs <manifest.json> [slideNumber ...]
import fs from 'node:fs';

const file = process.argv[2];
const want = process.argv.slice(3).map(Number);
const m = JSON.parse(fs.readFileSync(file, 'utf8'));
const slides = want.length ? m.slides.filter((s) => want.includes(s.page)) : m.slides;

console.log(`manifest ${file}`);
console.log(`slides=${m.slides.length}  captureScale=${m.settings?.captureScale}`);
for (const s of slides) {
  console.log(`\n-- p${s.page}  groups=${s.groups.length} --`);
  for (const g of s.groups) {
    const bits = (g.bits || []).map((b) => `${b.tag}${b.gif ? `->${b.gif}(${b.gifFrames}f)` : ''}`).join(' ') || '-';
    console.log(
      `  k=${g.k} cls=${String(g.cls).padEnd(22)} delay=${String(g.delayMs).padStart(4)} ` +
      `box=${[g.x, g.y, g.w, g.h].map((v) => (typeof v === 'number' ? v.toFixed(1) : v)).join(',')} ` +
      `file=${g.file ?? '-'}${g.dropped ? ' DROPPED' : ''} bits=[${bits}]`,
    );
  }
}
