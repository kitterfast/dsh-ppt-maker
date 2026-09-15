// Probe the exact base-capture expression and see why #threeAI stays hidden.
import { launchHeadless, evaluate, screenshot, sleep } from "./lib/browser.mjs";
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
  await sleep(2000);

  await evaluate(browser.client, `window.__restoreBase = window.__deckRender.hideAll(window.__deckRender.groups(window.__deckRender.slides()[6])); (function(){ var s = window.__deckRender.slides()[6]; var bits = window.__deckRender.animatedBitsOf(s); var out = []; for (var i = 0; i < bits.length; i++){ if (bits[i].tagName === 'CANVAS' && window.__deckRender.nestedCanvas(bits[i])){ var own = window.__deckRender.canvasOwner(bits[i]); if (own && own.closest('.slide') === s) { own.style.visibility = ''; out.push(own.id); } } } return JSON.stringify(out); })()`);
  const vis = await evaluate(browser.client, `JSON.stringify({ threeAI: getComputedStyle(document.getElementById('threeAI')).visibility, outer: getComputedStyle(document.querySelector('.a4')).visibility, inline3: document.getElementById('threeAI').style.visibility, inlineOuter: document.querySelector('.a4').style.visibility, slideVis: getComputedStyle(document.querySelector('.slide.active')).visibility })`);
  console.log("visibilities:", vis);
  const clip = { x: 1462, y: 388, width: 906, height: 504 };
  const png = await screenshot(browser.client, { format: "png", clip });
  writeFileSync(join(here, "..", "refdeck", "probe6", "base-clip.png"), png);
  const { PNG } = require("pngjs");
  const p = PNG.sync.read(png);
  let dark = 0, bright = 0, orange = 0, n = 0;
  for (let i = 0; i < p.data.length; i += 4) {
    n++;
    const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
    if (r + g + b < 200) dark++;
    if (r + g + b > 540) bright++;
    if (r > 170 && g > 60 && g < 180 && b < 110) orange++;
  }
  console.log("base clip:", { n, dark, bright, orange });
} finally {
  browser.close();
}
