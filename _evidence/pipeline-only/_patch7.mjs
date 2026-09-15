import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2];

// ---------- 1. page-helpers: find the animated sub-elements ----------
{
  const f = `${dir}/lib/page-helpers.js`;
  let s = readFileSync(f, "utf8");
  if (!s.includes("animatedBits")) {
    const fn = `
  /* Innermost elements that keep moving: infinite CSS animation on the element
     itself, or a <canvas> (script-driven). These get baked on their own so the
     text around them can stay a lossless PNG. */
  function animatedBits(el) {
    var all = el.querySelectorAll('*');
    var picked = [];
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (n.tagName === 'CANVAS') { picked.push(n); continue; }
      var an = n.getAnimations ? n.getAnimations({ subtree: false }) : [];
      for (var a = 0; a < an.length; a++) {
        var t = an[a].effect && an[a].effect.getTiming ? an[a].effect.getTiming() : {};
        if (t.iterations === Infinity) { picked.push(n); break; }
      }
    }
    return picked.filter(function (n) {
      return !picked.some(function (m) { return m !== n && m.contains(n); });
    });
  }

  function animatedBitsOf(slideEl) {
    var out = [], gs = groups(slideEl);
    for (var i = 0; i < gs.length; i++) {
      var b = animatedBits(gs[i]);
      for (var j = 0; j < b.length; j++) out.push(b[j]);
    }
    return out;
  }
`;
    s = s.replace("  function hideEls(list) {", fn + "\n  function hideEls(list) {");
    s = s.replace("box: box, inkBox: inkBox, describe: describe,",
                  "box: box, inkBox: inkBox, describe: describe, animatedBitsOf: animatedBitsOf,");
    if (!s.includes("animatedBitsOf: animatedBitsOf")) { console.error("page-helpers export failed"); process.exit(1); }
    writeFileSync(f, s, "utf8");
    console.log("page-helpers.js: animatedBitsOf added");
  } else console.log("page-helpers.js: already patched");
}

// ---------- 2. deck-render: hide bits in the PNG layers, bake bits as GIFs ----------
{
  const f = `${dir}/deck-render.mjs`;
  let s = readFileSync(f, "utf8");

  // 2a. collect bit descriptors right after the group config loop
  const anchorA = "    const hash = createHash(\"sha256\")";
  if (!s.includes(anchorA)) { console.error("anchor A missing"); process.exit(1); }
  if (!s.includes("g.bits =")) {
    s = s.replace(anchorA, `    // Describe the animated sub-elements of every group, so the crisp PNG layer
    // can be captured WITHOUT them and each one can be baked as its own GIF.
    const bitsPerGroup = JSON.parse(
      await evaluate(
        client,
        \`(function(){ var s = window.__deckRender.slides()[\${n}];
           var gs = window.__deckRender.groups(s);
           return JSON.stringify(gs.map(function(g){
             return window.__deckRender.animatedBitsOf(s).filter(function(b){ return g.contains(b); })
               .map(function(b){ var d = window.__deckRender.describe(b); var x = window.__deckRender.inkBox(b);
                 return { box: x, text: d.text, tag: d.cls }; }); })); })()\`,
      ),
    );
    groups.forEach((g, k) => { g.bits = bitsPerGroup[k] || []; });

${anchorA}`);
  }

  // 2b. hide the bits while capturing the PNG layers
  if (!s.includes("__hideBits")) {
    s = s.replace(
      "    // --- one true-alpha PNG per animation group",
      `    // The animated sub-elements must NOT be baked into the PNG layer: they are
    // drawn by their own GIF on top, and a static copy underneath would ghost.
    await evaluate(
      client,
      \`window.__hideBits = window.__deckRender.hideAll(window.__deckRender.animatedBitsOf(window.__deckRender.slides()[\${n}])); true\`,
    );

    // --- one true-alpha PNG per animation group`,
    );
    s = s.replace(
      "    // --- permanent motion -> a looping GIF layer",
      `    await evaluate(client, \`window.__hideBits(); true\`);

    // --- permanent motion -> a looping GIF layer`,
    );
  }

  // 2c. bake the BITS instead of whole groups
  const oldDyn = s.slice(s.indexOf("    // Bake ONLY layers with no text."), s.indexOf("    if (dynIdx.length && config.gif !== false) {"));
  if (oldDyn && oldDyn.length > 0) {
    s = s.replace(oldDyn, `    // Bake the animated sub-elements (dashed flow, waveform) as their own small
    // looping GIFs. Text never enters a GIF, so type stays crisp while the
    // motion survives -- crisp AND animated, which is the whole point.
    const gifTargets = [];
    groups.forEach((g, k) => (g.bits || []).forEach((b, j) => gifTargets.push({ gk: k, j, box: b.box, text: b.text, tag: b.tag })));
    const dynIdx = gifTargets.map((_, i) => i);
`);
  }
  s = s.replace("for (const k of dynIdx) {", "for (const ti of dynIdx) {\n        const target = gifTargets[ti];");
  s = s.replace("window.__deckRender.groups(window.__deckRender.slides()[${n}])[${k}]); true`,",
                "(() => { var g = window.__deckRender.groups(window.__deckRender.slides()[${n}])[window.__gifTarget.gk]; return window.__deckRender.animatedBitsOf(window.__deckRender.slides()[${n}]).filter(function(b){ return g.contains(b); })[window.__gifTarget.j]; })()); true`,");
  s = s.replace('const RENDERER_VERSION = "12"', 'const RENDERER_VERSION = "13"');
  writeFileSync(f, s, "utf8");
  console.log("deck-render.mjs: bit-scoped baking wired");
}
