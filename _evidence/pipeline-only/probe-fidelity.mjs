/**
 * Fidelity probe: which capture step breaks pixel equality?
 *
 *   ref        full page, every group visible            (the acceptance target)
 *   baseAll    full page, every group hidden
 *   isoOpaque  full page, ONLY group k visible, page background kept
 *   isoAlpha   full page, ONLY group k visible, backgrounds transparent
 *   clipped    the production path: clip-capture in isolate+transparent mode
 *
 *   (1) isoOpaque vs ref          -> does isolation change rendering?
 *   (2) isoAlpha over baseAll     -> is the alpha layer faithful?
 *   (3) clipped vs isoAlpha crop  -> does clip-capture rasterise differently?
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { evaluate, launchHeadless, screenshot } from "./lib/browser.mjs";

const require = createRequire("E:/deepseek/dsh-ppt-project/package.json");
const { PNG } = require("pngjs");

const PAGE = Number(process.argv[2] ?? 12) - 1;
const configPath = resolve("deck.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const htmlPath = resolve(dirname(configPath), config.html);
const W = config.width, H = config.height;

const browser = await launchHeadless({ width: W, height: H });
const client = browser.client;
const out = resolve("..", "deck", "render", "_probe");
const { mkdirSync } = await import("node:fs");
mkdirSync(out, { recursive: true });

const PAGE_HELPERS = readFileSync("lib/page-helpers.js", "utf8");
await client.call("Page.navigate", { url: `file:///${htmlPath.replace(/\\/g, "/")}` });
for (let i = 0; i < 80; i++) {
  const ok = await evaluate(client, `!!(window.__deckRender && window.__deckRender.hasGoto())`).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 150));
}
await evaluate(client, PAGE_HELPERS);
await evaluate(
  client,
  `window.__deckRender.setCfg({ chrome: ${JSON.stringify(config.chrome)}, slide: ${JSON.stringify(config.slide)},
     page: ${JSON.stringify(config.page)}, groups: ${JSON.stringify(config.groups)},
     goto: function (n) { (window.__slideInfo.go)(n, true); } }); window.__deckRender.styleOnce(); true`,
);
await evaluate(client, `window.__deckRender.goto(${PAGE}); true`);
await evaluate(client, `window.__deckRender.ready()`);
await new Promise((r) => setTimeout(r, 500));
await evaluate(client, `window.__deckRender.freezeScale(); true`);

const groups = JSON.parse(
  await evaluate(
    client,
    `(function(){ var s = window.__deckRender.slides()[${PAGE}];
       return JSON.stringify(window.__deckRender.groups(s).map(function(g){ return window.__deckRender.box(g); })); })()`,
  ),
);
console.log(`page ${PAGE + 1}: ${groups.length} groups`, groups.map((b) => `[${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}]`).join(" "));

const ref = await screenshot(client, { format: "png" });
const ref2 = await screenshot(client, { format: "png" });
await new Promise((r) => setTimeout(r, 300));
const ref3 = await screenshot(client, { format: "png" });
const baseAll = await (async () => {
  await evaluate(client, `window.__deckRender.hideAll(window.__deckRender.groups(window.__deckRender.slides()[${PAGE}])); true`);
  const shot = await screenshot(client, { format: "png" });
  await evaluate(client, `window.__deckRender.groups(window.__deckRender.slides()[${PAGE}]).forEach(function(e){e.style.visibility=''}); true`);
  return shot;
})();

const pad = 2;
const clip = (b) => ({
  x: Math.max(0, Math.floor(b.x - pad)),
  y: Math.max(0, Math.floor(b.y - pad)),
  width: Math.min(W, Math.ceil(b.x + b.w + pad)) - Math.max(0, Math.floor(b.x - pad)),
  height: Math.min(H, Math.ceil(b.y + b.h + pad)) - Math.max(0, Math.floor(b.y - pad)),
});

const crop = (png, r) => {
  const outPng = new PNG({ width: r.width, height: r.height });
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const s = ((r.y + y) * png.width + (r.x + x)) * 4, d = (y * r.width + x) * 4;
    outPng.data[d] = png.data[s]; outPng.data[d + 1] = png.data[s + 1];
    outPng.data[d + 2] = png.data[s + 2]; outPng.data[d + 3] = png.data[s + 3];
  }
  return outPng;
};
const stats = (a, b, label) => {
  const n = a.width * a.height;
  let sum = 0, bad = 0, worst = 0;
  for (let p = 0; p < n; p++) {
    const o = p * 4;
    const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
    sum += d; if (d > 32) bad++; if (d > worst) worst = d;
  }
  console.log(`  ${label.padEnd(38)} mean ${(sum / n).toFixed(2).padStart(6)}  bad>32 ${(bad / n * 100).toFixed(2).padStart(5)}%  max ${worst}`);
};

const refPng = PNG.sync.read(ref);
const basePng = PNG.sync.read(baseAll);

console.log("\n=== 0. determinism: same state captured repeatedly ===");
stats(PNG.sync.read(ref2), refPng, "ref vs ref (immediate)");
stats(PNG.sync.read(ref3), refPng, "ref vs ref (+300ms)");

const alphas = [];
for (let k = 0; k < groups.length; k++) {
  const r = clip(groups[k]);
  console.log(`\n--- group ${k} rect ${r.x},${r.y} ${r.width}x${r.height} ---`);

  await evaluate(client, `(function(){ var s = window.__deckRender.slides()[${PAGE}];
     var gs = window.__deckRender.groups(s);
     for (var i=0;i<gs.length;i++) gs[i].style.visibility = (i===${k} ? '' : 'hidden');
     return true; })()`);
  const isoOpaque = PNG.sync.read(await screenshot(client, { format: "png" }));

  await evaluate(client, `window.__isoRestore = window.__deckRender.isolate(window.__deckRender.groups(window.__deckRender.slides()[${PAGE}])[${k}]); true`);
  await client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  const isoAlpha = PNG.sync.read(await screenshot(client, { format: "png" }));
  alphas.push(isoAlpha);
  const clipped = PNG.sync.read(await screenshot(client, { format: "png", clip: r }));
  await client.call("Emulation.setDefaultBackgroundColorOverride", {});
  await evaluate(client, `window.__isoRestore(); window.__deckRender.groups(window.__deckRender.slides()[${PAGE}]).forEach(function(e){e.style.visibility=''}); true`);

  const refC = crop(refPng, r);
  const baseC = crop(basePng, r);
  const opaqueC = crop(isoOpaque, r);
  const alphaC = crop(isoAlpha, r);

  stats(opaqueC, refC, "(1) isoOpaque vs ref");
  const over = new PNG({ width: r.width, height: r.height });
  for (let p = 0; p < r.width * r.height; p++) {
    const o = p * 4, a = alphaC.data[o + 3] / 255;
    for (let c = 0; c < 3; c++) over.data[o + c] = Math.round(alphaC.data[o + c] * a + baseC.data[o + c] * (1 - a));
    over.data[o + 3] = 255;
  }
  stats(over, opaqueC, "(2) alpha-over-base vs isoOpaque");
  stats(clipped, alphaC, "(3) clipped vs full-page alpha crop");
  stats(alphaC, opaqueC, "(4) alpha vs opaque (same frame)");

  let clear = 0;
  for (let p = 0; p < r.width * r.height; p++) if (alphaC.data[p * 4 + 3] === 0) clear++;
  console.log(`  alpha layer: ${(clear / (r.width * r.height) * 100).toFixed(1)}% fully transparent`);
  writeFileSync(join(out, `g${k}-ref.png`), PNG.sync.write(refC));
  writeFileSync(join(out, `g${k}-opaque.png`), PNG.sync.write(opaqueC));
  writeFileSync(join(out, `g${k}-alpha.png`), PNG.sync.write(alphaC));
}
// ---- end-to-end: base + every alpha layer, exactly what the PPTX composites
const full = PNG.sync.read(baseAll);
for (let k = 0; k < alphas.length; k++) {
  const r = clip(groups[k]);
  const layer = alphas[k];
  for (let y = 0; y < r.height; y++) {
    const cy = r.y + y;
    if (cy < 0 || cy >= H) continue;
    for (let x = 0; x < r.width; x++) {
      const cx = r.x + x;
      if (cx < 0 || cx >= W) continue;
      const s = (cy * W + cx) * 4, d = (cy * W + cx) * 4;
      const a = layer.data[s + 3] / 255;
      if (a === 0) continue;
      for (let c = 0; c < 3; c++) full.data[d + c] = Math.round(layer.data[s + c] * a + full.data[d + c] * (1 - a));
    }
  }
}
console.log("\n=== end-to-end: base + all alpha layers vs ref ===");
stats(full, refPng, "full composite vs ref");
{
  const rowBad = new Array(H).fill(0), colBad = new Array(W).fill(0);
  let bad = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    const d = Math.max(Math.abs(full.data[o] - refPng.data[o]), Math.abs(full.data[o + 1] - refPng.data[o + 1]), Math.abs(full.data[o + 2] - refPng.data[o + 2]));
    if (d > 32) { bad++; rowBad[y]++; colBad[x]++; }
  }
  console.log("  worst rows:", rowBad.map((v, i) => [i, v]).sort((p, q) => q[1] - p[1]).slice(0, 8).map(([i, v]) => `${i}:${v}`).join(" "));
  console.log("  worst cols:", colBad.map((v, i) => [i, v]).sort((p, q) => q[1] - p[1]).slice(0, 8).map(([i, v]) => `${i}:${v}`).join(" "));
  const vis = new PNG({ width: W, height: H });
  for (let p = 0; p < W * H; p++) {
    const o = p * 4;
    const d = Math.max(Math.abs(full.data[o] - refPng.data[o]), Math.abs(full.data[o + 1] - refPng.data[o + 1]), Math.abs(full.data[o + 2] - refPng.data[o + 2]));
    const v = Math.min(255, d * 6);
    vis.data[o] = v; vis.data[o + 1] = 0; vis.data[o + 2] = d > 32 ? 0 : 60; vis.data[o + 3] = 255;
  }
  writeFileSync(join(out, "e2e-diff.png"), PNG.sync.write(vis));
  writeFileSync(join(out, "e2e-composite.png"), PNG.sync.write(full));
}

browser.close();
