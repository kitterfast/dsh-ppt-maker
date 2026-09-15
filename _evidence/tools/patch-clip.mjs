/**
 * Capture-rect convention: the proven deck ROUNDS a layer's origin and FLOORS
 * its size. That is checkable against its own PNG dimensions:
 *   slide 8 a5  box 828.7,193.2 365.3x221.8 -> PNG 730x442 = round(828.7)=829,
 *               round(193.2)=193, floor(365.3)=365, floor(221.8)=221
 *   slide 1 a2  box 494.3,204.5 291.4x44.0  -> PNG 582x88  (same rule)
 *   slide 4 a4  box 458.7,191.2 362.7x284.1 -> PNG 724x568 (same rule)
 * Flooring the origin instead -- what this pipeline did -- put the layer's
 * content 1-2px off inside its own picture, which the slide composite showed as
 * ghosting along every high-contrast edge.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/deck-render.mjs';
let src = readFileSync(FILE, 'utf8');
let ok = true;

function sub(name, oldText, newText) {
  const parts = src.split(oldText);
  if (parts.length - 1 !== 1) { console.error(`FAIL [${name}]: found ${parts.length - 1}`); ok = false; return; }
  src = parts.join(newText);
  console.log(`  ok ${name}`);
}

sub('version', 'const RENDERER_VERSION = "27";', 'const RENDERER_VERSION = "28";');

sub('add-clipOf',
`/** Clip rect clamped into the viewport, padded so box-shadows survive. */
function clipFor(box, pad, W, H) {`,
`/**
 * Capture rect for a layer: ROUND the origin, FLOOR the size. Verified against
 * the proven deck's own PNG dimensions -- see the note in deck-render's history.
 * clipFor() below stays for the legacy one-element path and the padded GIF clip.
 */
function clipOf(box, W, H) {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.max(1, Math.floor(box.w));
  const h = Math.max(1, Math.floor(box.h));
  return { x, y, width: Math.min(w, W - x), height: Math.min(h, H - y) };
}

/** Clip rect clamped into the viewport, padded so box-shadows survive. */
function clipFor(box, pad, W, H) {`);

sub('layer-clip',
`      const clip = clipFor(groups[k].box, 0, W, H);`,
`      const clip = clipOf(groups[k].box, W, H);`);

sub('gif-clip',
`        const clip = clipFor(target.box, /canvas/i.test(target.tag || "") ? 0 : 6, W, H);`,
`        const clip = /canvas/i.test(target.tag || "")
          ? clipOf(target.box, W, H)
          : clipFor(target.box, 6, W, H);`);

if (ok) { writeFileSync(FILE, src, 'utf8'); console.log('deck-render.mjs patched (clip convention)'); }
else { console.error('Aborted.'); process.exit(1); }
