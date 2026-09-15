import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2];
{
  const f = `${dir}/lib/page-helpers.js`;
  let s = readFileSync(f, "utf8");
  s = s.replace("animatedBitsOf: animatedBitsOf,", "animatedBits: animatedBits, animatedBitsOf: animatedBitsOf,");
  writeFileSync(f, s, "utf8");
}
{
  const f = `${dir}/deck-render.mjs`;
  let s = readFileSync(f, "utf8");
  const reps = [
    ["for (const ti of dynIdx) {\n        const target = gifTargets[ti];",
     "for (const ti of dynIdx) {\n        const target = gifTargets[ti];\n        if (!target || !target.box) continue;"],
    ["window.__deckRender.isolate((() => { var g = window.__deckRender.groups(window.__deckRender.slides()[${n}])[window.__gifTarget.gk]; return window.__deckRender.animatedBitsOf(window.__deckRender.slides()[${n}]).filter(function(b){ return g.contains(b); })[window.__gifTarget.j]; })()); true`,",
     "window.__deckRender.isolate(window.__deckRender.animatedBits(window.__deckRender.groups(window.__deckRender.slides()[${n}])[${target.gk}])[${target.j}]); true`,"],
    ["const clip = clipFor(groups[k].box, pad, W, H);", "const clip = clipFor(target.box, pad, W, H);"],
    ["const file = rel(`g${k}.gif`);", "const file = rel(`bit-${target.gk}-${target.j}.gif`);"],
    ["groups[k].gif = file;\n        groups[k].gifFrames = count;\n        groups[k].gifMoves = true;",
     "const bg = groups[target.gk];\n        bg.bits[target.j] = Object.assign({}, bg.bits[target.j], { gif: file, gifFrames: count, gifMoves: true });"],
    ["groups[k].gifMoves = false;\n          console.log(`[render] p${n + 1} g${k}: no motion in ${gifFrames} frames — keeping the still layer`);",
     "console.log(`[render] p${n + 1} g${target.gk} bit${target.j}: no motion in ${gifFrames} frames — keeping the still layer`);"],
    ["console.log(`[render] p${n + 1} g${k}: ${count} frames @${avg}ms (period ${periodMs || \"n/a\"}ms) -> ${file}`);",
     "console.log(`[render] p${n + 1} g${target.gk} bit${target.j} (${target.tag}): ${count} frames @${avg}ms period=${periodMs || \"n/a\"}ms -> ${file}`);"],
  ];
  let n = 0;
  for (const [a, b] of reps) { if (s.includes(a)) { s = s.replace(a, b); n++; } else console.error("MISS: " + a.slice(0, 60)); }
  s = s.replace("groups.map((g, k) => ({\n        k,\n        file: layerPaths[k].file,", "groups.map((g, k) => ({\n        k,\n        bits: g.bits,\n        file: layerPaths[k].file,");
  writeFileSync(f, s, "utf8");
  console.log(`deck-render.mjs: ${n}/${reps.length} replacements applied`);
}
