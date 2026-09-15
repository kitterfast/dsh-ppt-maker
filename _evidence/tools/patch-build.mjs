/**
 * Patch 2:
 *  (a) deck-render.mjs  — wait for the entrance animation to FINISH before
 *      measuring group boxes (waitStable alone is fooled by the fill-mode hold
 *      during the 0-480ms delay window).
 *  (b) deck-to-pptx.mjs — write ABSOLUTE class delays instead of increments, and
 *      place a group's canvas GIF UNDER its static layer, like the proven deck.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RENDER = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/deck-render.mjs';
const BUILD = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/deck-to-pptx.mjs';

let failed = false;
function patch(file, edits) {
  let src = readFileSync(file, 'utf8');
  let ok = true;
  for (const [name, oldText, newText, expect = 1] of edits) {
    const parts = src.split(oldText);
    if (parts.length - 1 !== expect) {
      console.error(`FAIL [${name}] in ${file}: expected ${expect}, found ${parts.length - 1}`);
      ok = false;
      failed = true;
      continue;
    }
    src = parts.join(newText);
    console.log(`  ok ${name}`);
  }
  if (ok) writeFileSync(file, src, 'utf8');
}

console.log('deck-render.mjs');
patch(RENDER, [
  ['settle-entrances',
`    await evaluate(client, \`window.__deckRender.goto(\${n}); true\`);
    await evaluate(client, \`window.__deckRender.ready()\`);
    await new Promise((r) => setTimeout(r, settleMs));`,
`    await evaluate(client, \`window.__deckRender.goto(\${n}); true\`);
    await evaluate(client, \`window.__deckRender.ready()\`);
    // waitStable() alone is NOT enough, and this cost a whole measurement round:
    // during the entrance DELAY (up to 480ms) animation-fill-mode:both holds the
    // element at its \`from\` state, so two consecutive captures are identical
    // while nothing has played yet. waitStable() then reports "stable" and the
    // group boxes are measured 20px low, at opacity 0. Wait for the animations
    // themselves to drain first.
    await evaluate(
      client,
      \`(async function(){ var t0 = Date.now();
         while (Date.now() - t0 < 6000) {
           var an = document.getAnimations ? document.getAnimations() : [];
           var busy = an.filter(function(a){ return a.playState === 'running' || a.playState === 'pending'; });
           if (!busy.length) break;
           await new Promise(function(r){ setTimeout(r, 80); });
         }
         await new Promise(function(r){ setTimeout(r, 120); });
         return true; })()\`,
    );
    await new Promise((r) => setTimeout(r, settleMs));`],
]);

console.log('deck-to-pptx.mjs');
patch(BUILD, [
  ['absolute-delays-doc',
` * Delay of the first effect is measured from the slide; a \`withEffect\` delay is
 * measured from the PREVIOUS effect's start, so absolute HTML delays are
 * converted to increments here.
 */`,
` * Every effect carries its class's ABSOLUTE delay, which is what the proven deck
 * does: its own XML reads 40,150,260,370,480 on one page and 40,260,370,480 on
 * the page whose HTML has no .a2 element at all. Converting those to increments
 * (the earlier behaviour) wrote a constant 110 into every effect after the first,
 * so nothing on any page played in sequence.
 */`],

  ['absolute-delays',
`  let prevDelay = 0;
  const pars = effects
    .map((e, i) => {
      const nodeType = i === 0 ? "afterEffect" : "withEffect";
      const delay = i === 0 ? e.delayMs : Math.max(0, e.delayMs - prevDelay);
      prevDelay = e.delayMs;
      return effectPar({ ...e, delayMs: delay, nodeType });
    })
    .join("");`,
`  const pars = effects
    .map((e, i) => {
      const nodeType = i === 0 ? "afterEffect" : "withEffect";
      return effectPar({ ...e, delayMs: e.delayMs, nodeType });
    })
    .join("");`],

  ['gif-under-static-layer',
`    const useGif = g.gif && existsSync(join(outDir, g.gif));
    if (!g.dropped) {
      const file = join(outDir, useGif ? g.gif : g.file);
      if (!file || !existsSync(file)) throw new Error(\`missing layer \${file}\`);
      s.addImage({
        path: file,
        x: inch(g.x),
        y: inch(g.y),
        w: inch(g.w),
        h: inch(g.h),
        objectName: \`g\${g.k}\`,
        altText: g.text || \`slide \${slide.page} layer \${g.k}\`,
      });
    }
    // Animated sub-elements (dashed flow, waveform) ride on top of their parent
    // layer as their own looping GIF, so the surrounding text stays lossless.
    (g.bits || []).forEach((b, j) => {
      if (!b.gif || !existsSync(join(outDir, b.gif))) return;
      s.addImage({
        path: join(outDir, b.gif),
        x: inch(b.box.x),
        y: inch(b.box.y),
        w: inch(b.box.w),
        h: inch(b.box.h),
        objectName: \`g\${g.k}b\${j}\`,
        altText: b.text || \`slide \${slide.page} bit \${g.k}.\${j}\`,
      });
    });`,
`    const useGif = g.gif && existsSync(join(outDir, g.gif));
    // A group's canvas GIF is placed BEFORE its static layer, matching the proven
    // deck's own document order (page 10: the .a6 GIF is picture 7 and the static
    // .a6 layer picture 8). Both animation effects still share the class delay.
    (g.bits || []).forEach((b, j) => {
      if (!b.gif || !existsSync(join(outDir, b.gif))) return;
      s.addImage({
        path: join(outDir, b.gif),
        x: inch(b.box.x),
        y: inch(b.box.y),
        w: inch(b.box.w),
        h: inch(b.box.h),
        objectName: \`g\${g.k}b\${j}\`,
        altText: b.text || \`slide \${slide.page} bit \${g.k}.\${j}\`,
      });
    });
    // A dropped group's chrome moved into its canvas GIF (proven-deck structure):
    // no PNG picture, but its GIF above still ships.
    if (!g.dropped) {
      const file = join(outDir, useGif ? g.gif : g.file);
      if (!file || !existsSync(file)) throw new Error(\`missing layer \${file}\`);
      s.addImage({
        path: file,
        x: inch(g.x),
        y: inch(g.y),
        w: inch(g.w),
        h: inch(g.h),
        objectName: \`g\${g.k}\`,
        altText: g.text || \`slide \${slide.page} layer \${g.k}\`,
      });
    }`],
]);

if (failed) { console.error('\nAborted: some replacements did not match.'); process.exit(1); }
console.log('\nboth files patched');
