// Layer-box deltas between the baseline deck and a rebuilt deck.
// Usage: node tools/box-delta.mjs <oracleDir> <oursDir>
import fs from 'node:fs';
import path from 'node:path';

const [oracleRoot, oursRoot] = process.argv.slice(2);

function pics(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /<p:pic>([\s\S]*?)<\/p:pic>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(b);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(b);
    out.push({
      x: +off[1] / 9525, y: +off[2] / 9525, w: +ext[1] / 9525, h: +ext[2] / 9525,
    });
  }
  return out;
}

let worst = { d: 0 };
let n = 0;
let sum = 0;
const f = (v) => (v >= 0 ? '+' : '') + v.toFixed(1);
for (let i = 1; i <= 11; i++) {
  const o = pics(path.join(oracleRoot, 'ppt', 'slides', `slide${i}.xml`));
  const u = pics(path.join(oursRoot, 'ppt', 'slides', `slide${i}.xml`));
  console.log(`\n-- slide ${i} --  oracle ${o.length} pics / ours ${u.length}`);
  for (let k = 0; k < Math.max(o.length, u.length); k++) {
    if (!o[k] || !u[k]) { console.log(`  ${String(k).padStart(2)}  MISSING ${o[k] ? 'ours' : 'oracle'}`); continue; }
    const d = [u[k].x - o[k].x, u[k].y - o[k].y, u[k].w - o[k].w, u[k].h - o[k].h];
    const mag = Math.max(...d.map(Math.abs));
    n += 4; sum += d.reduce((a, b) => a + Math.abs(b), 0);
    if (mag > worst.d) worst = { d: mag, slide: i, k, d4: d };
    const flag = mag <= 1.05 ? '  ' : '<<';
    console.log(`  ${String(k).padStart(2)}${flag} dx=${f(d[0]).padStart(6)} dy=${f(d[1]).padStart(6)} dw=${f(d[2]).padStart(6)} dh=${f(d[3]).padStart(6)}   ours ${u[k].x.toFixed(1)},${u[k].y.toFixed(1)} ${u[k].w.toFixed(1)}x${u[k].h.toFixed(1)}`);
  }
}
console.log(`\nmean |delta| = ${(sum / n).toFixed(3)} px over ${n} values; worst = ${worst.d.toFixed(1)} px (slide ${worst.slide} pic ${worst.k})`);
