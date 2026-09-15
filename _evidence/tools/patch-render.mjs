/**
 * One-shot patch for deck-render.mjs: switch from per-ELEMENT layers to
 * per-CLASS layers, pad every layer box by 10px, and ship true-alpha PNGs.
 * Every replacement asserts its match count, so a silent miss is impossible.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/deck-render.mjs';
let src = readFileSync(FILE, 'utf8');
const before = src;
const applied = [];

function sub(name, oldText, newText, expect = 1) {
  const parts = src.split(oldText);
  const found = parts.length - 1;
  if (found !== expect) {
    console.error(`FAIL [${name}]: expected ${expect} match(es), found ${found}`);
    process.exitCode = 1;
    return false;
  }
  src = parts.join(newText);
  applied.push(name);
  return true;
}

// 1 ── cache version (invalidates every stale slide)
sub('renderer-version', 'const RENDERER_VERSION = "25";', 'const RENDERER_VERSION = "27";');

// 2 ── permanent-motion probe over CLASS groups
sub('permanent-flags',
`           var gs = window.__deckRender.groups(s);
           s.classList.add('anim');
           var out = gs.map(function(g){
             var an = (g.getAnimations ? g.getAnimations({ subtree: true }) : []);
             return {
               permanent: an.some(function(a){ var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; return t.iterations === Infinity; }),
               canvas: window.__deckRender.hasCanvas(g)
             };
           });`,
`           var gs = window.__deckRender.deckGroups(s);
           s.classList.add('anim');
           var out = gs.map(function(g){
             var els = window.__deckRender.elsOf(g);
             var permanent = els.some(function(el){
               var an = (el.getAnimations ? el.getAnimations({ subtree: true }) : []);
               return an.some(function(a){ var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; return t.iterations === Infinity; });
             });
             return { permanent: permanent, canvas: window.__deckRender.groupHasCanvas(g) };
           });`);

// 3 ── group shape: union rect, not per-element ink box
sub('group-shape',
`         var gs = window.__deckRender.groups(s);
         return JSON.stringify(gs.map(function(g){ var d = window.__deckRender.describe(g); var b = window.__deckRender.inkBox(g);
           return { box: b, text: d.text, cls: d.cls }; }));`,
`         var gs = window.__deckRender.deckGroups(s);
         return JSON.stringify(gs.map(function(g){ var d = window.__deckRender.groupDescribe(g); var b = window.__deckRender.unionRect(g);
           return { box: b, text: d.text, cls: d.cls }; }));`);

// 4 ── animated bits per class group; a canvas GIF covers its OWNING .aN layer
sub('group-bits',
`           var gs = window.__deckRender.groups(s);
           // The loop animations only exist while .anim is applied (the same
           // trap as the permanent-motion probe): without it every getAnimations()
           // call returns nothing and no animated sub-element is ever found.
           // Per-group scan, NOT the merged slide scan: a canvas inside NESTED
           // .aN groups (like .a4 wrapping #threeAI.a4) landed in every ancestor
           // group's list before, producing duplicate "phantom" bits per group.
           s.classList.add('anim');
           var res = JSON.stringify(gs.map(function(g){
             return window.__deckRender.animatedBits(g)
               .map(function(b){ var d = window.__deckRender.describe(b); var x = window.__deckRender.inkBox(b);
                 return { box: x, text: d.text, tag: d.cls }; }); }));`,
`           var gs = window.__deckRender.deckGroups(s);
           s.classList.add('anim');
           var res = JSON.stringify(gs.map(function(g){
             return window.__deckRender.groupAnimatedBits(g)
               .map(function(b){
                 var d = window.__deckRender.describe(b);
                 var isCanvas = b.tagName === 'CANVAS';
                 // A canvas is drawn by its own GIF, and the proven deck's GIF
                 // covers the whole .aN layer that OWNS the canvas (screen chrome
                 // included) at that layer's UNPADDED rect.
                 var target = isCanvas ? window.__deckRender.canvasOwner(b) : b;
                 var x = isCanvas ? window.__deckRender.rectOf(target) : window.__deckRender.inkBox(b);
                 return { box: x, text: d.text, tag: isCanvas ? 'canvas' : d.cls, owner: target.id || '' }; }); }));`);

// 5 ── pad every group box by capturePad (the proven deck's constant 10px)
sub('pad-group-box',
`    const groups = JSON.parse(shape);`,
`    const groups = JSON.parse(shape);
    // The proven deck pads EVERY layer box by a constant 10px per side; this is
    // measured, not guessed. Page 3 .a1 ships at 86,66,1108x46 while its layout
    // rect is 96,76,1088x26 -- and the same +10 holds on every page, including
    // the tilted card rows where the rotated-vs-layout box differed.
    for (const g of groups) {
      if (!g.box) continue;
      g.box = { x: g.box.x - pad, y: g.box.y - pad, w: g.box.w + pad * 2, h: g.box.h + pad * 2 };
    }`);

// 6 ── isolate the whole CLASS group; hide only this group's canvas bits
sub('isolate-group',
`           var g = window.__deckRender.groups(s)[\${k}];
           window.__restore = window.__deckRender.isolate(g);
           // When the slide has a nested canvas owner (e.g. #threeAI.a4 inside
           // .a4), an ancestor group's own capture must not keep the ink of its
           // descendant groups -- the GIF and the child layers carry it, and a
           // copy here would double both the pixels and the entrance timing.
           var owners = window.__deckRender.nestedOwners(s);
           if (owners.length) {
             var gs = window.__deckRender.groups(s), extra = [];
             for (var i = 0; i < gs.length; i++) {
               if (gs[i] !== g && g.contains(gs[i])) extra.push(gs[i]);
             }
             window.__restoreExtra = extra.length ? window.__deckRender.hideAll(extra) : null;
           } else window.__restoreExtra = null;`,
`           var g = window.__deckRender.deckGroups(s)[\${k}];
           window.__restore = window.__deckRender.isolateMany(g);
           // Whatever this group bakes into a GIF must not also sit in the PNG.
           // Page 7 shows why this is per-group and not slide-wide: the .a4 group
           // captures fully transparent once its canvas layer is hidden, so it is
           // dropped and the GIF carries that entrance slot alone.
           var hb = window.__deckRender.groupHiddenBits(g);
           window.__restoreExtra = hb.length ? window.__deckRender.hideAll(hb) : null;`);

// 7 ── group box is already padded; do not pad again at capture time
sub('clip-no-double-pad',
`      const clip = clipFor(groups[k].box, pad, W, H);`,
`      const clip = clipFor(groups[k].box, 0, W, H);`);

// 8 ── TRUE ALPHA: drop the "composite every layer over the base" step
sub('true-alpha',
`      {
        const layer = PNG2.sync.read(png);
        const rw = layer.width, rh = layer.height;
        const rx = Math.round(clip.x * sc), ry = Math.round(clip.y * sc);
        const out2 = new PNG2({ width: rw, height: rh });
        for (let y = 0; y < rh; y++) {
          const sy = ry + y;
          if (sy < 0 || sy >= stack.height) continue;
          for (let x = 0; x < rw; x++) {
            const sx = rx + x;
            if (sx < 0 || sx >= stack.width) continue;
            const o = (y * rw + x) * 4, p = (sy * stack.width + sx) * 4;
            const al = layer.data[o + 3] / 255;
            out2.data[o] = Math.round(layer.data[o] * al + stack.data[p] * (1 - al));
            out2.data[o + 1] = Math.round(layer.data[o + 1] * al + stack.data[p + 1] * (1 - al));
            out2.data[o + 2] = Math.round(layer.data[o + 2] * al + stack.data[p + 2] * (1 - al));
            out2.data[o + 3] = 255;
            stack.data[p] = out2.data[o];
            stack.data[p + 1] = out2.data[o + 1];
            stack.data[p + 2] = out2.data[o + 2];
            stack.data[p + 3] = 255;
          }
        }
        writeFileSync(join(outDir, file), PNG2.sync.write(out2));
      }`,
`      // Layers ship with TRUE ALPHA, exactly like the proven deck (its layer
      // PNGs are RGBA with 70-99% fully transparent pixels; measured). The old
      // "composite each layer over the base" step baked the paper background
      // into every layer: the files were far heavier, and the entrance's 20px
      // rise dragged an opaque rectangle of background across the slide.`);

// 9 ── remember the padded placement box alongside the pixel clip
sub('layer-path-box',
`      layerPaths[k] = { k, file, clip, bytes: png.length };`,
`      layerPaths[k] = { k, file, clip, box: groups[k].box, bytes: png.length };`);

// 10 ── place at the padded (fractional) box, not the integer clip
sub('manifest-box',
`          x: lp ? lp.clip.x : Math.round(g.box.x),
          y: lp ? lp.clip.y : Math.round(g.box.y),
          w: lp ? lp.clip.width : Math.round(g.box.w),
          h: lp ? lp.clip.height : Math.round(g.box.h),`,
`          x: lp ? lp.box.x : g.box.x,
          y: lp ? lp.box.y : g.box.y,
          w: lp ? lp.box.w : g.box.w,
          h: lp ? lp.box.h : g.box.h,`);

// 11 ── GIF: same class group, and always its canvas-owning layer
sub('gif-bits-call',
`window.__deckRender.animatedBits(window.__deckRender.groups(window.__deckRender.slides()[\${n}])[\${target.gk}])`,
`window.__deckRender.groupAnimatedBits(window.__deckRender.deckGroups(window.__deckRender.slides()[\${n}])[\${target.gk}])`);

sub('gif-owner-always',
`if (el.tagName === 'CANVAS' && window.__deckRender.nestedCanvas(el)) return window.__deckRender.canvasOwner(el); return el;`,
`if (el.tagName === 'CANVAS') return window.__deckRender.canvasOwner(el); return el;`);

sub('gif-group-lookup',
`var g = window.__deckRender.groups(window.__deckRender.slides()[\${n}])[\${target.gk}];`,
`var g = window.__deckRender.deckGroups(window.__deckRender.slides()[\${n}])[\${target.gk}];`);

// 12 ── loop-period scan over class groups
sub('gif-period-scan',
`               window.__deckRender.groups(s).forEach(function(g){
                 (g.getAnimations ? g.getAnimations({subtree:true}) : []).forEach(function(a){
                   var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
                   if (t.iterations === Infinity && t.duration > best) best = t.duration; }); });`,
`               window.__deckRender.deckGroups(s).forEach(function(g){
                 window.__deckRender.elsOf(g).forEach(function(el){
                   (el.getAnimations ? el.getAnimations({subtree:true}) : []).forEach(function(a){
                     var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
                     if (t.iterations === Infinity && t.duration > best) best = t.duration; }); }); });`);

// 13 ── GIF clip: a canvas GIF is the owning layer's rect, unpadded
sub('gif-clip',
`        const clip = clipFor(
          /canvas/i.test(target.tag || "") ? { x: target.box.x, y: target.box.y, w: target.box.w, h: target.box.h } : target.box,
          6,
          W,
          H,
        );`,
`        // A canvas GIF sits EXACTLY on its owning layer's rect with no padding:
        // the proven deck's page-7 GIF is 731.4,194.2,452.6x252 (the #threeAI
        // rect) and its page-10 GIF is 96,421.9,1088x96 (the .a6 rect).
        const clip = clipFor(target.box, /canvas/i.test(target.tag || "") ? 0 : 6, W, H);`);

if (process.exitCode) {
  console.error('\nNo changes written (some replacements did not match).');
} else {
  writeFileSync(FILE, src, 'utf8');
  console.log(`patched ${FILE}`);
  console.log(`applied ${applied.length} edits: ${applied.join(', ')}`);
  console.log(`size ${before.length} -> ${src.length}`);
}
