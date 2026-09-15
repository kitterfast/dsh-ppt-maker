// Run the EXACT query deck-render uses, in the EXACT state it runs in
// (terminal: .anim removed), and print the raw result plus an immediate
// re-check after a forced reflow.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { evaluate, launchHeadless } from "./lib/browser.mjs";

const configPath = resolve("deck.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const htmlPath = resolve(dirname(configPath), config.html);
const HELPERS = readFileSync(new URL("./lib/page-helpers.js", import.meta.url), "utf8");

const browser = await launchHeadless({ width: config.width ?? 1280, height: config.height ?? 720 });
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

  // exactly what deck-render does before the query: terminal state
  await evaluate(client, `window.__deckRender.goto(0); true`);
  await evaluate(client, `window.__deckRender.goto(0); true`);
  await new Promise((r) => setTimeout(r, 400));

  const probe = (label, extra) => `(function(){
     var s = window.__deckRender.slides()[0];
     var gs = window.__deckRender.groups(s);
     s.classList.add('anim');
     ${extra}
     var out = gs.map(function(g, gi){
       var all = g.querySelectorAll('*');
       var selfInf = 0, anyInf = 0;
       for (var i = 0; i < all.length; i++) {
         var an = all[i].getAnimations ? all[i].getAnimations({subtree:false}) : [];
         for (var a = 0; a < an.length; a++) { var t = an[a].effect && an[a].effect.getTiming ? an[a].effect.getTiming() : {}; if (t.iterations === Infinity) { selfInf++; break; } }
       }
       var sub = g.getAnimations({subtree:true}) || [];
       for (var a2 = 0; a2 < sub.length; a2++) { var t2 = sub[a2].effect && sub[a2].effect.getTiming ? sub[a2].effect.getTiming() : {}; if (t2.iterations === Infinity) anyInf++; }
       return { gi: gi, perNodeInfinite: selfInf, subtreeInfinite: anyInf,
                viaHelper: window.__deckRender.animatedBitsOf(s).filter(function(b){ return g.contains(b); }).length,
                animOn: s.classList.contains('anim') };
     });
     s.classList.remove('anim'); void s.offsetWidth;
     return JSON.stringify({ label: ${JSON.stringify(label)}, gs: out });
   })()`;

  console.log("A) immediate query after classList.add('anim'):");
  console.log("   " + (await evaluate(client, probe("immediate", ""))));
  console.log("B) query after a forced reflow:");
  console.log("   " + (await evaluate(client, probe("reflow", "void s.offsetWidth;"))));
  console.log("C) query after a 120ms wait:");
  const p = probe("wait", "");
  await evaluate(client, `window.__pending = null; (function(){ var s = window.__deckRender.slides()[0]; s.classList.add('anim'); return true; })()`);
  await new Promise((r) => setTimeout(r, 120));
  console.log(
    "   " +
      (await evaluate(
        client,
        `(function(){ var s = window.__deckRender.slides()[0];
           var gs = window.__deckRender.groups(s);
           var r = JSON.stringify(gs.map(function(g){ return window.__deckRender.animatedBitsOf(s).filter(function(b){ return g.contains(b); }).length; }));
           s.classList.remove('anim'); void s.offsetWidth; return r; })()`,
      )),
  );
} finally {
  browser.close();
}
