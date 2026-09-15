// Replicate the pipeline's GIF phase EXACTLY, dumping state at each step.
import { launchHeadless, evaluate, screenshot, sleep } from "./lib/browser.mjs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const ref = join(here, "..", "refdeck", "ref.html");
const helper = readFileSync(join(here, "lib", "page-helpers.js"), "utf8");
const outDir = join(here, "..", "refdeck", "probe2");

const sha = (b) => createHash("sha1").update(b).digest("hex").slice(0, 10);
const browser = await launchHeadless({ width: 1280, height: 720, scale: 2 });
const W = 1280, H = 720;

const gotoFn = `function (n, skip) { var m = /(\\d+)/.exec(((document.getElementById('counter')||{}).textContent)||''); var cur = m ? Number(m[1]) - 1 : 0; var d = n - cur; var btn = document.getElementById(d >= 0 ? 'nextBtn' : 'prevBtn'); if (!btn) return; for (var i = 0; i < Math.abs(d); i++) btn.click(); }`;

const state = () => evaluate(browser.client, `(function(){
  var act = []; document.querySelectorAll('.slide').forEach(function(s, i){ if (s.classList.contains('active')) act.push(i); });
  var cv = document.querySelector('#threeAI canvas');
  var box7 = document.getElementById('threeAI'), box10 = document.getElementById('threeClass');
  var a4 = document.querySelector('.slide:nth-of-type(7) .a4, #threeAI');
  var cs = a4 ? getComputedStyle(a4) : null;
  return JSON.stringify({
    counter: ((document.getElementById('counter')||{}).textContent||'').trim(),
    activeSlides: act,
    canvas7: cv ? { cw: cv.clientWidth, ch: cv.clientHeight, w: cv.width, h: cv.height } : null,
    a4opacity: cs ? cs.opacity : null,
    a4anim: cs ? cs.animationName : null,
    box7size: box7 ? { w: box7.clientWidth, h: box7.clientHeight } : null,
    box10size: box10 ? { w: box10.clientWidth, h: box10.clientHeight } : null
  });
})()`);

const clip7 = { x: Math.max(0, Math.floor(732.40625 - 6)), y: Math.max(0, Math.floor(195.1875 - 6)), width: Math.min(W, Math.ceil(732.40625 + 451 + 6)) - Math.max(0, Math.floor(732.40625 - 6)), height: Math.min(H, Math.ceil(195.1875 + 250 + 6)) - Math.max(0, Math.floor(195.1875 - 6)) };

function shot(clip) {
  return screenshot(browser.client, { format: "png", clip });
}

try {
  await browser.client.call("Page.navigate", { url: pathToFileURL(ref).href });
  for (let i = 0; i < 100; i++) {
    const ok = await evaluate(browser.client, `!!(window.__deckRender && window.__deckRender.hasGoto())`).catch(() => false);
    if (ok) break;
    await sleep(150);
  }
  // setup identical to pipeline
  await evaluate(browser.client, `${helper}
    window.__deckRender.setCfg({
      chrome: [".hud"], page: "#stage", slide: ".slide",
      groups: { selector: ".a1, .a2, .a3, .a4, .a5, .a6" },
      goto: ${gotoFn}
    }); window.__deckRender.styleOnce(); true`);
  await evaluate(browser.client, `window.__deckRender.ready()`);
  await sleep(600);

  async function pipelineGifPhase(n, tag) {
    console.log(`\n----- ${tag} (slide idx ${n}) -----`);
    await evaluate(browser.client, `window.__deckRender.goto(${n}); true`);       // arrive (as base phase did)
    await evaluate(browser.client, `window.__deckRender.ready()`);
    await sleep(400);
    await evaluate(browser.client, `window.__deckRender.freezeScale(); true`);
    // bits scan toggle (as pipeline line 315)
    await evaluate(browser.client, `(function(){ var s = window.__deckRender.slides()[${n}]; s.classList.add('anim'); void s.offsetWidth; s.classList.remove('anim'); void s.offsetWidth; return true; })()`);
    console.log("after-arrive:", await state());
    // hideAll + per-group isolate dance (no screenshots, but same DOM mutations)
    await evaluate(browser.client, `window.__restoreBase = window.__deckRender.hideAll(window.__deckRender.groups(window.__deckRender.slides()[${n}])); true`);
    await evaluate(browser.client, `window.__restoreBase(); true`);
    await evaluate(browser.client, `window.__hideBits = window.__deckRender.hideAll(window.__deckRender.animatedBitsOf(window.__deckRender.slides()[${n}])); true`);
    for (let k = 0; k < 6; k++) {
      await evaluate(browser.client, `(function(){ var s = window.__deckRender.slides()[${n}]; var g = window.__deckRender.groups(s)[${k}]; window.__restore = window.__deckRender.isolate(g); return true; })()`);
      await evaluate(browser.client, `window.__restore(); true`);
    }
    await evaluate(browser.client, `window.__hideBits(); true`);
    // ---- GIF phase, exact ----
    await evaluate(browser.client, `window.__deckRender.goto(${n === 0 ? 1 : 0}); true`);
    console.log("after-goto-away:", await state());
    await evaluate(browser.client, `window.__deckRender.gotoAnimated(${n}); true`);
    console.log("after-gotoAnimated:", await state());
    await evaluate(browser.client, `window.__deckRender.ready()`);
    await evaluate(browser.client, `window.__deckRender.freezeScale(); true`);
    console.log("after-ready+freeze:", await state());
    await evaluate(browser.client, `window.__restoreDyn = window.__deckRender.isolate(window.__deckRender.animatedBits(window.__deckRender.groups(window.__deckRender.slides()[${n}])[${tag === 'p7' ? 3 : 7}])[0]); true`);
    console.log("after-isolate:", await state());
    await browser.client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    const b1 = await shot(clip7);
    await sleep(700);
    const b2 = await shot(clip7);
    await sleep(700);
    const b3 = await shot(clip7);
    await browser.client.call("Emulation.setDefaultBackgroundColorOverride", {});
    writeFileSync(join(outDir, `${tag}-s1.png`), b1);
    writeFileSync(join(outDir, `${tag}-s2.png`), b2);
    writeFileSync(join(outDir, `${tag}-s3.png`), b3);
    console.log(`[${tag}] ${sha(b1)} ${sha(b2)} ${sha(b3)} motion12=${sha(b1) !== sha(b2)} motion23=${sha(b2) !== sha(b3)}`);
    await evaluate(browser.client, `window.__restoreDyn(); true`);
    console.log("after-restore:", await state());
  }

  await pipelineGifPhase(6, "p7");
  await pipelineGifPhase(9, "p10");
} finally {
  browser.close();
}
