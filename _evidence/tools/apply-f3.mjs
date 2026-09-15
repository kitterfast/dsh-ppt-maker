/**
 * F3 patch — the DOM pass reports member IDENTITY, not just a count.
 *
 * patchMerge currently compares `fact.memberCount !== L.members.length`, so a
 * selector that resolves to nothing passes whenever the count happens to line up
 * (measured: members ["#definitely-not-in-dom"] was accepted against a 1-member
 * layer). Identity is what has to be compared.
 *
 * NAMING, deliberately: the identity list is reported as `memberSigs`, NOT
 * `members`. The render loop reads `L.members` off the plan as a list of
 * SELECTORS and feeds them to querySelectorAll (deck-render.mjs:436). Reusing
 * that name for signatures would hand signatures to a selector engine and throw.
 *
 * Also reports each layer's element box (null only when a layer has no elements
 * at all) so F5 can fail loudly instead of letting a null box reach clipOf.
 *
 * Usage: node tools/apply-f3.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dry = process.argv.includes("--dry");
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const DR = `${PIPE}/deck-render.mjs`;
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const patches = [
  {
    file: DR,
    name: "F3-P1 import declaredPage",
    old: 'import { loadAndPlan, patchMerge, runtimeAmbiguity, ERR } from "./lib/manifest.mjs";',
    new: 'import { loadAndPlan, patchMerge, runtimeAmbiguity, declaredPage, ERR } from "./lib/manifest.mjs";',
  },
  {
    file: DR,
    name: "F3-P2 DOM pass reports memberSigs + box + resolved selectors",
    old:
      "    const domSlides = [], domMotion = [], nestedPages = [], indexOk = [];\n" +
      "    for (const p of pages) {\n" +
      "      const raw = JSON.parse(await evaluate(client, `(function(){\n" +
      "        var s = window.__deckRender.slides()[${p - 1}];\n" +
      "        var gs = window.__deckRender.deckGroups(s);\n" +
      "        var nested = 0;\n" +
      "        for (var i=0;i<gs.length;i++){ var els = window.__deckRender.elsOf(gs[i]);\n" +
      "          for (var a=0;a<els.length;a++) for (var b=0;b<els.length;b++) if (a!==b && els[a].contains(els[b])) nested++; }\n" +
      "        return JSON.stringify({ nested: nested,\n" +
      "          layers: gs.map(function(g){ var d = window.__deckRender.groupDescribe(g);\n" +
      "            return { cls: d.cls, memberCount: window.__deckRender.elsOf(g).length }; }) });\n" +
      "      })()`));\n" +
      "      if (raw.nested > 0) nestedPages.push(p);\n" +
      "      domSlides.push({ page: p, layers: raw.layers });\n" +
      "    }",
    new:
      "    // Declared member selectors per page, resolved INSIDE the page below so that\n" +
      "    // member identity — not merely a count — can be compared with the runtime\n" +
      "    // layering. Addressing follows the same 1-based page rule as patchMerge.\n" +
      "    const declSelectors = new Map();\n" +
      "    (mf.merged?.slides ?? []).forEach((s2, i) => {\n" +
      "      const r = declaredPage(s2);\n" +
      "      const pg = r.page ?? (r.via === null ? i + 1 : null);\n" +
      "      if (!pg) return;\n" +
      "      const sets = (s2.layers ?? []).filter((L) => Array.isArray(L.members) && L.members.length).map((L) => L.members);\n" +
      "      if (sets.length) declSelectors.set(pg, sets);\n" +
      "    });\n" +
      "\n" +
      "    const domSlides = [], domMotion = [], nestedPages = [], indexOk = [];\n" +
      "    for (const p of pages) {\n" +
      "      const declSets = declSelectors.get(p) ?? [];\n" +
      "      const raw = JSON.parse(await evaluate(client, `(function(){\n" +
      "        var s = window.__deckRender.slides()[${p - 1}];\n" +
      "        var gs = window.__deckRender.deckGroups(s);\n" +
      "        function sig(el){\n" +
      "          var t = el.tagName.toLowerCase();\n" +
      "          var id = el.id ? ('#' + el.id) : '';\n" +
      "          var cl = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).sort();\n" +
      "          return t + id + (cl.length ? ('.' + cl.join('.')) : '');\n" +
      "        }\n" +
      "        function boxOf(els){\n" +
      "          if (!els.length) return null;\n" +
      "          var x = 1e9, y = 1e9, r = -1e9, b = -1e9;\n" +
      "          for (var i = 0; i < els.length; i++){ var q = els[i].getBoundingClientRect();\n" +
      "            if (q.left < x) x = q.left; if (q.top < y) y = q.top;\n" +
      "            if (q.right > r) r = q.right; if (q.bottom > b) b = q.bottom; }\n" +
      "          return { x: x, y: y, w: r - x, h: b - y };\n" +
      "        }\n" +
      "        var nested = 0;\n" +
      "        for (var i=0;i<gs.length;i++){ var els = window.__deckRender.elsOf(gs[i]);\n" +
      "          for (var a=0;a<els.length;a++) for (var b=0;b<els.length;b++) if (a!==b && els[a].contains(els[b])) nested++; }\n" +
      "        var declSets = ${JSON.stringify(declSets)};\n" +
      "        var resolved = declSets.map(function(sels){ return sels.map(function(sel){\n" +
      "          var bad = false, hits = [];\n" +
      "          try { hits = Array.prototype.slice.call(s.querySelectorAll(sel)); } catch (e) { bad = true; }\n" +
      "          return { sel: sel, invalid: bad, count: hits.length, memberSigs: hits.map(sig).sort() }; }); });\n" +
      "        return JSON.stringify({ nested: nested,\n" +
      "          layers: gs.map(function(g){ var d = window.__deckRender.groupDescribe(g); var m = window.__deckRender.elsOf(g);\n" +
      "            return { cls: d.cls, memberCount: m.length, memberSigs: m.map(sig).sort(), box: boxOf(m) }; }),\n" +
      "          resolved: resolved });\n" +
      "      })()`));\n" +
      "      if (raw.nested > 0) nestedPages.push(p);\n" +
      "      domSlides.push({ page: p, layers: raw.layers, resolved: raw.resolved });\n" +
      "    }\n" +
      "    if (process.env.DECK_DUMP_DOM) {\n" +
      "      writeFileSync(process.env.DECK_DUMP_DOM, JSON.stringify({ total, pages, slides: domSlides, motion: domMotion, nestedPages }, null, 1), \"utf8\");\n" +
      "      console.log(`[manifest] DOM pass 已导出: ${process.env.DECK_DUMP_DOM}`);\n" +
      "    }",
  },
];

const files = new Map();
let bad = 0;
console.log("===== F3 patch: anchor verification =====");
for (const p of patches) {
  if (!files.has(p.file)) files.set(p.file, readFileSync(p.file, "utf8"));
  const hits = files.get(p.file).split(p.old).length - 1;
  if (hits !== 1) bad++;
  console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${p.name.padEnd(52)} hits=${hits}`);
}
if (bad) {
  console.log(`\n${bad} anchor(s) did not resolve exactly once — nothing written.`);
  process.exit(1);
}
console.log("\n===== applying =====");
for (const p of patches) files.set(p.file, files.get(p.file).replace(p.old, p.new));
for (const [f, out] of files) {
  const before = readFileSync(f, "utf8");
  console.log(`  ${f.split("/").pop().padEnd(18)} ${sha(before)} -> ${sha(out)}  (${before.length} -> ${out.length} chars)`);
  if (!dry) writeFileSync(f, out, "utf8");
}
console.log(dry ? "\n--dry: nothing written." : "\nF3 applied.");
