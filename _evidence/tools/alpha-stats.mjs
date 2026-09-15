// Report the alpha distribution of layer PNGs (are they true-alpha or opaque?).
// Usage: node tools/alpha-stats.mjs <mediaDir> [nameFilter]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const dir = process.argv[2];
const filter = process.argv[3] ?? '';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && f.includes(filter)).sort();

console.log('file                  size(px)        transparent  partial  opaque   meanA');
for (const f of files.slice(0, 16)) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
  let zero = 0, part = 0, opaque = 0, sum = 0;
  const n = png.width * png.height;
  for (let i = 0; i < n; i++) {
    const a = png.data[i * 4 + 3];
    sum += a;
    if (a === 0) zero++; else if (a === 255) opaque++; else part++;
  }
  const pc = (v) => ((v / n) * 100).toFixed(1).padStart(6) + '%';
  console.log(`${f.padEnd(22)} ${String(png.width).padStart(5)}x${String(png.height).padStart(5)} ${pc(zero)} ${pc(part)} ${pc(opaque)}  ${(sum / n).toFixed(1)}`);
}
