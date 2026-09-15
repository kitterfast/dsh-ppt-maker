// Unpack a pptx into a directory so compare-decks.mjs can read its slide XML.
// Usage: node tools/unpack-pptx.mjs <deck.pptx> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const JSZip = req('jszip');

const [pptx, outDir] = process.argv.slice(2);
if (!pptx || !outDir) { console.error('usage: node tools/unpack-pptx.mjs <deck.pptx> <outDir>'); process.exit(2); }

const zip = await JSZip.loadAsync(fs.readFileSync(pptx));
fs.rmSync(outDir, { recursive: true, force: true });
let n = 0;
for (const [name, entry] of Object.entries(zip.files)) {
  if (entry.dir) continue;
  const dest = path.join(outDir, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, await entry.async('nodebuffer'));
  n++;
}
console.log(`unpacked ${n} files -> ${outDir}`);
