// Live-check hiddenBits/canvasOwner/nestedCanvas inside the real page.
import { launchHeadless, evaluate, sleep } from "./lib/browser.mjs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

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
  await sleep(1500);
  const out = await evaluate(browser.client, `(function(){
    var s = window.__deckRender.slides()[6];
    var cv = document.querySelector('#threeAI canvas');
    return JSON.stringify({
      typeofHiddenBits: typeof window.__deckRender.hiddenBits,
      owner: window.__deckRender.canvasOwner(cv) ? { id: window.__deckRender.canvasOwner(cv).id, cls: window.__deckRender.canvasOwner(cv).className } : null,
      nested: window.__deckRender.nestedCanvas(cv),
      hiddenBits: window.__deckRender.hiddenBits(s).map(function(e){ return e.id || e.tagName + '.' + (e.className||'').toString().slice(0,30); }),
      groups: window.__deckRender.groups(s).map(function(g){ return g.id || g.tagName + '.' + (g.className||'').toString().slice(0,30); })
    });
  })()`);
  console.log(out);
} finally {
  browser.close();
}
