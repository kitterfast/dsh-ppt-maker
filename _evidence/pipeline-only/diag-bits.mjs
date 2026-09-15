// Why does animatedBits() find nothing? Dump the real structure of the groups
// that are flagged as carrying permanent motion.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { evaluate, launchHeadless } from "./lib/browser.mjs";

const configPath = resolve("deck.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const htmlPath = resolve(dirname(configPath), config.html);
const W = config.width ?? 1280, H = config.height ?? 720;
const HELPERS = readFileSync(new URL("./lib/page-helpers.js", import.meta.url), "utf8");

const browser = await launchHeadless({ width: W, height: H });
const client = browser.client;
try {
  await client.call("Page.navigate", { url: `file:///${htmlPath.replace(/\\/g, "/")}` });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(client, `!!(window.__deckRender && window.__deckRender.hasGoto())`).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  const gotoExpr = config.goto ?? "window.__slideInfo.go";
  await evaluate(client, HELPERS);
  await evaluate(
    client,
    `window.__deckRender.setCfg({ chrome: ${JSON.stringify(config.chrome ?? [])},
       slide: ${JSON.stringify(config.slide ?? ".slide")}, page: ${JSON.stringify(config.page ?? ".page")},
       groups: ${JSON.stringify(config.groups ?? { selector: ".body > *" })},
       goto: function (n, skip) { (${gotoExpr})(n, skip); } }); window.__deckRender.styleOnce(); true`,
  );
  await evaluate(client, `window.__deckRender.ready()`);

  for (const page of [0, 8]) {
    await evaluate(client, `window.__deckRender.goto(${page === 0 ? 1 : 0}); true`);
    await evaluate(client, `window.__deckRender.gotoAnimated(${page}); true`);
    await new Promise((r) => setTimeout(r, 1200));
    const dump = await evaluate(
      client,
      `(function(){
         var s = window.__deckRender.slides()[${page}];
         var gs = window.__deckRender.groups(s);
         var out = [];
         gs.forEach(function(g, gi){
           var all = g.querySelectorAll('*');
           var inf = [], canv = [];
           for (var i = 0; i < all.length; i++) {
             var n = all[i];
             if (n.tagName === 'CANVAS') canv.push(i);
             var an = n.getAnimations ? n.getAnimations({subtree:false}) : [];
             var bad = an.filter(function(a){ var t=a.effect&&a.effect.getTiming?a.effect.getTiming():{}; return t.iterations===Infinity; });
             if (bad.length) inf.push(i);
           }
           var desc = function(i){ var n = all[i]; return n.tagName.toLowerCase() + (n.className && n.className.baseVal===undefined ? '.'+String(n.className).split(' ').join('.') : (n.className && n.className.baseVal ? '.'+n.className.baseVal.split(' ').join('.') : '')); };
           out.push({ gi: gi, tag: g.tagName.toLowerCase(), kids: all.length,
                      infinite: inf.map(desc), canvases: canv.map(desc),
                      subtreeInf: (g.getAnimations({subtree:true})||[]).filter(function(a){var t=a.effect&&a.effect.getTiming?a.effect.getTiming():{};return t.iterations===Infinity;}).length,
                      animClass: s.classList.contains('anim') });
         });
         return JSON.stringify(out);
       })()`,
    );
    console.log(`\n===== slide ${page + 1} (anim class on: ${JSON.parse(dump)[0]?.animClass}) =====`);
    for (const g of JSON.parse(dump)) {
      console.log(
        `  g${g.gi} <${g.tag}> descendants=${g.kids}  infiniteAnimations=${g.subtreeInf}  self-infinite=[${g.infinite.join(", ")}]  canvas=[${g.canvases.join(", ")}]`,
      );
    }
  }
} finally {
  browser.close();
}
