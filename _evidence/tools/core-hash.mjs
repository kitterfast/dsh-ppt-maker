/**
 * Render-core fingerprint — the G5 evidence tool.
 *
 * 2.5.0 may only touch the INPUT layer. This extracts the six render-core regions
 * by literal anchor and hashes them, so "render core unchanged" is a hash
 * comparison rather than a promise. Run once before the change and once after;
 * the two outputs must be identical.
 *
 * Usage: node tools/core-hash.mjs <renderDir> [label]
 *   renderDir = a scripts/deck directory (or the pipeline directory)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const dir = process.argv[2];
const label = process.argv[3] ?? dir;
const rd = path.join(dir, 'deck-render.mjs');
const ph = path.join(dir, 'lib', 'page-helpers.js');
const tp = path.join(dir, 'deck-to-pptx.mjs');
const src = fs.readFileSync(rd, 'utf8');

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function between(name, startAnchor, endAnchor) {
  const i = src.indexOf(startAnchor);
  if (i < 0) return { name, hash: 'ANCHOR-MISSING', len: 0 };
  const j = src.indexOf(endAnchor, i);
  if (j < 0) return { name, hash: 'END-MISSING', len: 0 };
  const body = src.slice(i, j + endAnchor.length);
  return { name, hash: sha(body), len: body.length };
}

function func(name, fnName) {
  const re = new RegExp(`(?:async\\s+)?function ${fnName}\\s*\\([\\s\\S]*?\\n\\}`, 'm');
  const m = re.exec(src);
  return m ? { name, hash: sha(m[0]), len: m[0].length } : { name, hash: 'NOT-FOUND', len: 0 };
}

const regions = [
  func('1 canvas recording / encodeGif', 'encodeGif'),
  func('2 gif encode helper', 'clipFor'),
  func('3 clock: waitStable', 'waitStable'),
  func('4 pixel capture: clipOf', 'clipOf'),
  between('5 gif frame capture loop',
    'const bufs = [];',
    'await client.call("Emulation.setDefaultBackgroundColorOverride", {});'),
  between('6 layer capture block',
    'await client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });\n      const clip',
    'writeFileSync(join(outDir, file), png);'),
];

console.log(`RENDER-CORE FINGERPRINT  ${label}`);
for (const r of regions) console.log(`  ${r.name.padEnd(36)} ${r.hash}  len=${r.len}`);
console.log(`  ${'7 layout: lib/page-helpers.js (whole)'.padEnd(36)} ${sha(fs.readFileSync(ph, 'utf8'))}  len=${fs.statSync(ph).size}`);
console.log(`  ${'8 playback: deck-to-pptx.mjs (whole)'.padEnd(36)} ${sha(fs.readFileSync(tp, 'utf8'))}  len=${fs.statSync(tp).size}`);
console.log(`  ${'deck-render.mjs (whole, informational)'.padEnd(36)} ${sha(src)}  len=${src.length}`);
