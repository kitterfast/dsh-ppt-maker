// Decisive fork: is the deck's rAF chain starved in pipeline conditions?
import { launchHeadless, evaluate, screenshot, sleep } from "./lib/browser.mjs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const ref = join(here, "..", "refdeck", "ref.html");
const helper = readFileSync(join(here, "lib", "page-helpers.js"), "utf8");
const outDir = join(here, "..", "refdeck", "probe4");

const sha = (b) => createHash("sha1").update(b).digest("hex").slice(0, 10);
const browser = await launchHeadless({ width: 1280, height: 720, scale: 2 });
const W = 1280, H = 720;
const gotoFn = `function (n, skip) { var m = /(\\d+)/.exec(((document.getElementById('counter')||{}).textContent)||''); var cur = m ? Number(m[1]) - 1 : 0; var d = n - cur; var btn = document.getElementById(d >= 0 ? 'nextBtn' : 'prevBtn'); if (!btn) return; for (var i = 0; i < Math.abs(d); i++) btn.click(); }`;
const clip7 = { x: Math.floor(732.4 - 6), y: Math.floor(195.2 - 6), width: Math.ceil(732.4 + 451 + 6) - Math.floor(732.4 - 6), height: Math.ceil(195.2 + 250 + 6) - Math.floor(195.2 - 6) };
const shot = () => screenshot(browser.client, { format: "png", clip: clip7 });

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
  await evaluate(browser.client, `window.__deckRender.ready()`);
  await sleep(600);

  // Patch rAF counter (counts EVERY callback, including the deck's chain)
  await evaluate(browser.client, `(function(){
    var orig = window.requestAnimationFrame.bind(window);
    window.__rafCount = 0;
    window.requestAnimationFrame = function(cb){ window.__rafCount++; return orig(cb); };
    window.__tickerOn = false;
    window.__tick = function(){ if (!window.__tickerOn) return; window.requestAnimationFrame(window.__tick); };
    window.__tickerOn = true; window.__tick();
    return true; })()`);

  async function phase(n) {
    await evaluate(browser.client, `window.__deckRender.goto(${n}); true`);
    await evaluate(browser.client, `window.__deckRender.ready()`);
    await sleep(400);
    await evaluate(browser.client, `window.__deckRender.freezeScale(); true`);
    // hide/isolate dance
    await evaluate(browser.client, `window.__restoreBase = window.__deckRender.hideAll(window.__deckRender.groups(window.__deckRender.slides()[${n}])); true`);
    await evaluate(browser.client, `window.__restoreBase(); true`);
    await evaluate(browser.client, `window.__hideBits = window.__deckRender.hideAll(window.__deckRender.animatedBitsOf(window.__deckRender.slides()[${n}])); true`);
    for (let k = 0; k < 6; k++) {
      await evaluate(browser.client, `(function(){ var s = window.__deckRender.slides()[${n}]; var g = window.__deckRender.groups(s)[${k}]; window.__restore = window.__deckRender.isolate(g); return true; })()`);
      await evaluate(browser.client, `window.__restore(); true`);
    }
    await evaluate(browser.client, `window.__hideBits(); true`);
    // GIF phase
    await evaluate(browser.client, `window.__deckRender.goto(${n === 0 ? 1 : 0}); true`);
    await evaluate(browser.client, `window.__deckRender.gotoAnimated(${n}); true`);
    await evaluate(browser.client, `window.__deckRender.ready()`);
    await evaluate(browser.client, `window.__deckRender.freezeScale(); true`);
    await evaluate(browser.client, `window.__restoreDyn = window.__deckRender.isolate(window.__deckRender.animatedBits(window.__deckRender.groups(window.__deckRender.slides()[${n}])[3])[0]); true`);
    await browser.client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  }

  // ---- A: with my ticker RUNNING (like probe1) ----
  await evaluate(browser.client, `window.__tickerOn = true; window.__tick(); true`);
  await phase(6);
  const a1 = await shot(); await sleep(700); const a2 = await shot();
  console.log(`[p7 ticker=ON ] ${sha(a1)} ${sha(a2)} motion=${sha(a1) !== sha(a2)}`);
  await browser.client.call("Emulation.setDefaultBackgroundColorOverride", {});
  await evaluate(browser.client, `window.__restoreDyn(); true`);
  await sleep(300);

  // ---- B: ticker OFF (pipeline-like) ----
  await evaluate(browser.client, `window.__tickerOn = false; true`);
  await sleep(600); // let any pending frames drain
  await phase(6);
  const b0 = await evaluate(browser.client, `window.__rafCount`);
  const b1 = await shot();
  await sleep(700);
  const b2 = await shot();
  const b3 = await evaluate(browser.client, `window.__rafCount`);
  console.log(`[p7 ticker=OFF] ${sha(b1)} ${sha(b2)} motion=${sha(b1) !== sha(b2)} rafCountDelta=${b3 - b0} over ~1.5s (of which ~0.7s between shots)`);
  await browser.client.call("Emulation.setDefaultBackgroundColorOverride", {});
  await evaluate(browser.client, `window.__restoreDyn(); true`);
  await sleep(300);

  // ---- C: ticker OFF, raf delta over a quiet window (no screenshots) ----
  const c0 = await evaluate(browser.client, `window.__rafCount`);
  await sleep(1000);
  const c1 = await evaluate(browser.client, `window.__rafCount`);
  console.log(`[quiet window] rafCountDelta=${c1 - c0} over 1s (ticker OFF)`);

  // ---- D: ticker OFF for p10 (control — pipeline says it moves) ----
  await phase(9);
  const d1 = await shot(); await sleep(700); const d2 = await shot();
  console.log(`[p10 ticker=OFF] ${sha(d1)} ${sha(d2)} motion=${sha(d1) !== sha(d2)}`);
  await browser.client.call("Emulation.setDefaultBackgroundColorOverride", {});
  await evaluate(browser.client, `window.__restoreDyn(); true`);
} finally {
  browser.close();
}
