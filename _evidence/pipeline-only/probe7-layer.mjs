// Reproduce layer capture for p7 k=4 (#threeAI) with __hideBits applied.
import { launchHeadless, evaluate, screenshot, sleep } from "./lib/browser.mjs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const ref = join(here, "..", "refdeck", "ref.html");
const helper = readFileSync(join(here, "lib", "page-helpers.js"), "utf8");
const browser = await launchHeadless({ width: 1280, height: 720, scale: 2 });
const gotoFn = `function (n, skip) { var m = /(\\d+)/.exec(((document.getElementById('counter')||{}).textContent)||''); var cur = m ? Number(m[1]) - 1 : 0; var d = n - cur; var btn = document.getElementById(d >= 0 ? 'nextBtn' : 'prevBtn'); if (!btn) return; for (var i = 0; i < Math.abs(d); i++) btn.click(); }`;

try {
  await browser.client.call("Page.navigate", { url: pathToFileURL(ref).href });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(browser.client, `!!(window.__deckRender && window.__deckRender.hasGoto())`).catch(() => false)) break;
    await sleep(150);
  }
  await evaluate(browser.client, `${helper}
    window.__deckRender.setCfg({ chrome: [".hud"], page: "#stage", slide: ".slide",
      groups: { selector: ".a1, .a2, .a3, .a4, .a5, .a6" }, goto: ${gotoFn} });
    window.__deckRender.styleOnce(); true`);
  await evaluate(browser.client, `window.__deckRender.goto(6); true`);
  await sleep(1800);
  await evaluate(browser.client, `window.__deckRender.freezeScale(); true`);

  // replicate pipeline order: hideAll groups for base, unhide nested owner, restore, then __hideBits
  await evaluate(browser.client, `window.__restoreBase = window.__deckRender.hideAll(window.__deckRender.groups(window.__deckRender.slides()[6])); (function(){ var s = window.__deckRender.slides()[6]; var bits = window.__deckRender.animatedBitsOf(s); for (var i = 0; i < bits.length; i++){ if (bits[i].tagName === 'CANVAS' && window.__deckRender.nestedCanvas(bits[i])){ var own = window.__deckRender.canvasOwner(bits[i]); if (own && own.closest('.slide') === s) own.style.visibility = ''; } } return true; })()`);
  await evaluate(browser.client, `window.__restoreBase(); true`);
  await evaluate(browser.client, `window.__hideBits = window.__deckRender.hideAll(window.__deckRender.hiddenBits(window.__deckRender.slides()[6])); true`);

  const vis = () => evaluate(browser.client, `JSON.stringify({ threeAI: getComputedStyle(document.getElementById('threeAI')).visibility, concl: getComputedStyle(document.querySelector('.concl')).visibility, overlay: getComputedStyle(document.querySelector('.ai-overlay')).visibility })`);
  console.log("after hideBits:", await vis());

  // k=4 capture
  await evaluate(browser.client, `(function(){ var s = window.__deckRender.slides()[6]; var g = window.__deckRender.groups(s)[4]; window.__restore = window.__deckRender.isolate(g); return true; })()`);
  console.log("during isolate k=4:", await vis());
  await browser.client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  const clip = { x: Math.floor(722 - 2), y: Math.floor(185 - 2), width: Math.ceil(722 + 471 + 2) - Math.floor(722 - 2), height: Math.ceil(185 + 271 + 2) - Math.floor(185 - 2) };
  const png = await screenshot(browser.client, { format: "png", clip });
  await browser.client.call("Emulation.setDefaultBackgroundColorOverride", {});
  await evaluate(browser.client, `window.__restore(); true`);
  console.log("after restore:", await vis());
  writeFileSync(join(here, "..", "refdeck", "probe6", "g4-raw.png"), png);
  const { PNG } = require("pngjs");
  const p = PNG.sync.read(png);
  let ink = 0, tot = 0;
  for (let i = 3; i < p.data.length; i += 4) { tot++; if (p.data[i] > 0) ink++; }
  console.log("g4 raw ink:", ink, "/", tot, "(", (ink / tot * 100).toFixed(1), "%)");
} finally {
  browser.close();
}
