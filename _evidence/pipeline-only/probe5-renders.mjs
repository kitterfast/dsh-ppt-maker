// Count THREE render() calls per scene + collect console errors, under pipeline conditions.
import { launchHeadless, evaluate, screenshot, sleep } from "./lib/browser.mjs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const ref = join(here, "..", "refdeck", "ref.html");
const helper = readFileSync(join(here, "lib", "page-helpers.js"), "utf8");

const sha = (b) => createHash("sha1").update(b).digest("hex").slice(0, 10);
const browser = await launchHeadless({ width: 1280, height: 720, scale: 2 });
const gotoFn = `function (n, skip) { var m = /(\\d+)/.exec(((document.getElementById('counter')||{}).textContent)||''); var cur = m ? Number(m[1]) - 1 : 0; var d = n - cur; var btn = document.getElementById(d >= 0 ? 'nextBtn' : 'prevBtn'); if (!btn) return; for (var i = 0; i < Math.abs(d); i++) btn.click(); }`;

try {
  await browser.client.call("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__dbg = { ai: 0, cs: 0, other: 0, errors: [], raf: 0 };
      (function(){
        var origErr = console.error.bind(console);
        console.error = function(){ try { window.__dbg.errors.push(Array.prototype.map.call(arguments, String).join(' ')); } catch(e){} return origErr.apply(null, arguments); };
      })();
    `,
  });
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

  // patch THREE prototype render counter
  await evaluate(browser.client, `(function(){
    var orig = THREE.WebGLRenderer.prototype.render;
    THREE.WebGLRenderer.prototype.render = function(scene, camera){
      var box = this.domElement && this.domElement.closest ? this.domElement.closest('#threeAI, #threeClass') : null;
      if (box && box.id === 'threeAI') window.__dbg.ai++;
      else if (box && box.id === 'threeClass') window.__dbg.cs++;
      else window.__dbg.other++;
      return orig.call(this, scene, camera);
    };
    return true; })()`);

  async function phase(n) {
    await evaluate(browser.client, `window.__deckRender.goto(${n}); true`);
    await evaluate(browser.client, `window.__deckRender.ready()`);
    await sleep(400);
    await evaluate(browser.client, `window.__deckRender.freezeScale(); true`);
    await evaluate(browser.client, `window.__restoreBase = window.__deckRender.hideAll(window.__deckRender.groups(window.__deckRender.slides()[${n}])); true`);
    await evaluate(browser.client, `window.__restoreBase(); true`);
    await evaluate(browser.client, `window.__hideBits = window.__deckRender.hideAll(window.__deckRender.animatedBitsOf(window.__deckRender.slides()[${n}])); true`);
    for (let k = 0; k < 6; k++) {
      await evaluate(browser.client, `(function(){ var s = window.__deckRender.slides()[${n}]; var g = window.__deckRender.groups(s)[${k}]; window.__restore = window.__deckRender.isolate(g); return true; })()`);
      await evaluate(browser.client, `window.__restore(); true`);
    }
    await evaluate(browser.client, `window.__hideBits(); true`);
    await evaluate(browser.client, `window.__deckRender.goto(${n === 0 ? 1 : 0}); true`);
    await evaluate(browser.client, `window.__deckRender.gotoAnimated(${n}); true`);
    await evaluate(browser.client, `window.__deckRender.ready()`);
    await evaluate(browser.client, `window.__deckRender.freezeScale(); true`);
    await evaluate(browser.client, `window.__restoreDyn = window.__deckRender.isolate(window.__deckRender.animatedBits(window.__deckRender.groups(window.__deckRender.slides()[${n}])[3])[0]); true`);
  }

  async function dbg(label) {
    const r = await evaluate(browser.client, `JSON.stringify(window.__dbg)`);
    console.log(`[${label}] ${r}`);
  }

  await phase(6);
  await dbg("p7 arrive");
  await sleep(1500); // quiet, no screenshots
  await dbg("p7 quiet+1.5s");
  // now a mini shot loop like the pipeline (6 shots ~160ms apart)
  for (let i = 0; i < 6; i++) { await screenshot(browser.client, {}); await sleep(90); }
  await dbg("p7 after 6 shots");
  console.log("errors:", JSON.stringify(await evaluate(browser.client, `window.__dbg.errors.slice(-5)`)));

  await phase(9);
  await dbg("p10 arrive");
  await sleep(1500);
  await dbg("p10 quiet+1.5s");
} finally {
  browser.close();
}
