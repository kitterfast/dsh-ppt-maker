// One-shot diagnosis of #threeAI (no motion) vs #threeClass (works), refdeck.
import { launchHeadless, evaluate, screenshot, sleep } from "./lib/browser.mjs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const ref = join(here, "..", "refdeck", "ref.html");
const outDir = join(here, "..", "refdeck", "probe");

const sha = (b) => createHash("sha1").update(b).digest("hex").slice(0, 12);
const browser = await launchHeadless({ width: 1280, height: 720, scale: 2 });

try {
  await browser.client.call("Page.navigate", { url: pathToFileURL(ref).href });
  await sleep(1500);
  await evaluate(browser.client, `window.__p7ticks = 0; (function __t(){ window.__p7ticks++; requestAnimationFrame(__t); })(); true`);
  await sleep(400);

  async function probeSlide(clicks, label) {
    for (let i = 0; i < clicks; i++) {
      await evaluate(browser.client, `document.getElementById('nextBtn').click(); true`);
      await sleep(220);
    }
    await sleep(2500);
    const info = await evaluate(browser.client, `(function(){
      var id = ${JSON.stringify(label)};
      var box = document.getElementById(id);
      var out = {
        counter: ((document.getElementById('counter')||{}).textContent||'').trim(),
        rAFticks: window.__p7ticks,
        THREE: window.THREE ? window.THREE.REVISION : 'MISSING',
        boxExists: !!box,
        msg: box ? box.getAttribute('data-3d-msg') : null,
        children: box ? Array.prototype.map.call(box.children, function(c){ return c.tagName + '.' + (c.className||'').toString().slice(0,20); }) : null
      };
      if (box){
        var cv = box.querySelector('canvas');
        out.canvas = cv ? {
          w: cv.width, h: cv.height, cw: cv.clientWidth, ch: cv.clientHeight,
          lost: (function(){ try { return cv.getContext('webgl') ? cv.getContext('webgl').isContextLost() : 'no-gl'; } catch(e){ return 'getContext:'+e.message; } })()
        } : null;
        out.boxSize = { w: box.clientWidth, h: box.clientHeight };
        var r = box.getBoundingClientRect();
        out.rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }
      return JSON.stringify(out);
    })()`);
    console.log(`\n=== ${label} ===\n${info}\n`);
    const rect = JSON.parse(info).rect;
    const buf1 = await screenshot(browser.client, { clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } });
    await sleep(700);
    const buf2 = await screenshot(browser.client, { clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } });
    writeFileSync(join(outDir, `${label}-t1.png`), buf1);
    writeFileSync(join(outDir, `${label}-t2.png`), buf2);
    const full = await screenshot(browser.client, {});
    writeFileSync(join(outDir, `${label}-full.png`), full);
    console.log(`[${label}] t1=${sha(buf1)} t2=${sha(buf2)} motion=${sha(buf1) !== sha(buf2)} (full: ${full.length} bytes)`);
    return rect;
  }

  const r7 = await probeSlide(6, "threeAI");
  await probeSlide(3, "threeClass");
} finally {
  browser.close();
}
