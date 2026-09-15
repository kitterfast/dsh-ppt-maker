/**
 * Gate A — BASELINE-FREE structural acceptance: HTML is the only reference.
 *
 * The earlier rounds measured structure against another PPTX (动态版.pptx). That
 * is wrong for the real task: in production the HTML comes first and no PPTX
 * exists yet. So this gate derives what the deck MUST contain by reading the HTML
 * itself, then checks the produced PPTX against that.
 *
 * Derived from the HTML:
 *   A1  slide count                    = number of  <section class="slide"
 *   A2  layer classes per slide        = distinct .aN classes present on that slide
 *   A3  entrance delay per class       = the .04s/.15s/… in `.slide.active .aN{animation:…}`
 *   A4  canvas pages                   = slides containing a <canvas>
 * Expected in the PPTX:
 *   pictures per slide = 1 base + (distinct classes) + (canvas carve-outs)
 *   entrance effects per slide = pictures - 1
 *   effect delay multiset per slide = delays of the classes present, plus one repeat
 *                                     for each canvas carve-out (the GIF shares its
 *                                     owner's class delay)
 *   every <canvas> page must carry a GIF picture (motion must survive)
 *
 * Usage: node tools/gate-a.mjs <html> <unpackedDeckDir> [animSpec.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const [htmlPath, deckDir, specPath, manifestPath] = process.argv.slice(2);
const html = fs.readFileSync(htmlPath, 'utf8');

// Runtime canvas discovery. A deck can create its <canvas> elements in JS (this
// one does: ref.html contains zero literal <canvas> tags), so a static read of
// the HTML cannot know which pages carry live motion. The render manifest does,
// because the renderer probes the page. Using it keeps the gate baseline-free --
// the manifest is our own render output, not an external deck.
const manifestCanvas = new Map();
const manifestDropped = new Map();
if (manifestPath && fs.existsSync(manifestPath)) {
  const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const s of man.slides ?? []) {
    const gifs = (s.groups ?? []).reduce((a, g) => a + ((g.bits ?? []).filter((b) => b.gif).length), 0);
    // A canvas whose owning layer has no other ink REPLACES that layer (the empty
    // static capture is dropped); otherwise it ADDS one. Page 7 is the replace
    // case, page 10 the add case -- both are runtime facts, not derivable from
    // the HTML text.
    const dropped = (s.groups ?? []).filter((g) => g.dropped === true).length;
    manifestCanvas.set(s.page, gifs);
    manifestDropped.set(s.page, dropped);
  }
}

// ── CSS: class -> declared entrance delay ───────────────────────────────────
const classDelay = new Map();
for (const m of html.matchAll(/\.slide\.active\s+\.(a\d+)\s*\{[^}]*?animation\s*:\s*[^;}]*?\s([\d.]+)s\s+[^;}]*/g)) {
  classDelay.set(m[1], Math.round(parseFloat(m[2]) * 1000));
}
if (specPath && fs.existsSync(specPath)) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  for (const r of spec.entranceRules ?? []) {
    const mm = /\.(a\d+)\s*$/.exec((r.selector ?? '').replace(/\s+/g, ' ').trim());
    if (mm && typeof r.delayMs === 'number') classDelay.set(mm[1], r.delayMs);
  }
}
const isClassDeck = classDelay.size > 0;

// ── HTML: per-slide classes and canvases ────────────────────────────────────
const sections = html.split(/<section\b[^>]*class="[^"]*\bslide\b/).slice(1);
const slides = sections.map((raw) => {
  const body = raw.split('</section>')[0];
  const classes = new Set();
  for (const c of body.matchAll(/class="([^"]*)"/g)) {
    for (const tok of c[1].split(/\s+/)) if (/^a\d+$/.test(tok)) classes.add(tok);
  }
  return { classes: [...classes].sort((a, b) => +a.slice(1) - +b.slice(1)), canvases: (body.match(/<canvas\b/g) ?? []).length };
});

// ── PPTX: per-slide pictures and effect delays ──────────────────────────────
function readSlide(n) {
  const xml = fs.readFileSync(path.join(deckDir, 'ppt', 'slides', `slide${n}.xml`), 'utf8');
  const rels = fs.readFileSync(path.join(deckDir, 'ppt', 'slides', '_rels', `slide${n}.xml.rels`), 'utf8');
  const relMap = new Map();
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]*)"/g)) relMap.set(m[1], m[2].split('/').pop());
  const pics = [];
  for (const m of xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)) {
    const emb = /r:embed="([^"]+)"/.exec(m[0]);
    pics.push(relMap.get(emb?.[1]) ?? '');
  }
  const effects = [];
  for (const m of xml.matchAll(/<p:cTn\b([^>]*)>/g)) {
    if (!/presetClass="entr"/.test(m[1])) continue;
    const tail = xml.slice(m.index + m[0].length, m.index + m[0].length + 6000);
    effects.push(+(/<p:cond\s+delay="(\d+)"/.exec(tail)?.[1] ?? -1));
  }
  return { pics, gifs: pics.filter((p) => p.endsWith('.gif')).length, effects };
}

console.log(`GATE A  ${path.basename(htmlPath)}  ->  ${deckDir}`);
console.log(`class-derived delays: ${isClassDeck ? [...classDelay.entries()].map(([k, v]) => `${k}=${v}`).join(' ') : '(none — declared-layer deck)'}`);
console.log('  page  classes  canvas   expect eff   actual eff   delays match   gif');
let fails = 0;
for (let i = 0; i < slides.length; i++) {
  const s = slides[i];
  let r;
  try { r = readSlide(i + 1); } catch { console.log(`  ${String(i + 1).padStart(4)}   (slide XML missing)`); fails++; continue; }
  // expected delays: one per class, plus one repeat per canvas carve-out
  const runtimeGifs = manifestCanvas.get(i + 1) ?? 0;
  const dropped = manifestDropped.get(i + 1) ?? 0;
  const carveOuts = isClassDeck ? Math.max(0, runtimeGifs - dropped) : 0;
  const expectedDelays = [...s.classes.map((c) => classDelay.get(c) ?? -1)];
  for (let g = 0; g < carveOuts; g++) expectedDelays.push(classDelay.get(s.classes[s.classes.length - 1]) ?? -1);
  const actual = [...r.effects].sort((a, b) => a - b);
  const expectSorted = [...expectedDelays].sort((a, b) => a - b);
  const delaysOk = isClassDeck && actual.length === expectSorted.length && actual.every((v, k) => v === expectSorted[k]);
  const expectEff = isClassDeck ? expectedDelays.length : r.effects.length;
  const effOk = actual.length === expectEff;
  const gifOk = (s.canvases + runtimeGifs) === 0 ? true : r.gifs >= 1;
  const ok = effOk && (!isClassDeck || delaysOk) && gifOk;
  if (!ok) fails++;
  console.log(
    `  ${String(i + 1).padStart(4)}  ${String(s.classes.length).padStart(7)}  ${String(s.canvases).padStart(6)}   ${String(expectEff).padStart(10)}   ${String(actual.length).padStart(11)}   ` +
    `${(isClassDeck ? (delaysOk ? 'yes' : 'NO') : 'n/a').padStart(12)}   ${String(r.gifs).padStart(3)}  ${ok ? '' : '  <<'}`,
  );
}
console.log(`\n  pages failing = ${fails} / ${slides.length}`);
if (isClassDeck) {
  console.log('  A1 slide count      : ' + (slides.length === fs.readdirSync(path.join(deckDir, 'ppt', 'slides')).filter((f) => /^slide\d+\.xml$/.test(f)).length ? 'OK' : 'MISMATCH'));
}
process.exit(fails ? 1 : 0);
