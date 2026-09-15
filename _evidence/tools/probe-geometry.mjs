// Measure, per slide and per distinct .aN class, the union geometry of its members.
// This is the ground truth needed to reproduce the baseline's layer boxes.
// Usage: node tools/probe-geometry.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PIPE = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline';
const REFDECK = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/refdeck';
const { launchHeadless, evaluate } = await import(pathToFileURL(PIPE + '/lib/browser.mjs').href);

const config = JSON.parse(readFileSync(REFDECK + '/deck.config.json', 'utf8'));
const helpers = readFileSync(PIPE + '/lib/page-helpers.js', 'utf8');
const htmlPath = REFDECK + '/' + config.html;

const W = config.width, H = config.height;
const browser = await launchHeadless({ width: W, height: H, scale: config.captureScale ?? 2 });
const client = browser.client;

const MEASURE = (n) => `(function(){
  var s = window.__deckRender.slides()[${n}];
  var els = Array.prototype.slice.call(s.querySelectorAll(${JSON.stringify(config.groups.selector)}));
  var byCls = {};
  els.forEach(function(el){
    var m = /(?:^|\\s)(a[1-6])(?=\\s|$)/.exec(el.className || '');
    var c = m ? m[1] : '?';
    (byCls[c] = byCls[c] || []).push(el);
  });
  var out = {};
  Object.keys(byCls).forEach(function(c){
    var g = byCls[c];
    function uni(fn){ var r = null; g.forEach(function(el){ var b = fn(el);
      r = r ? { x:Math.min(r.x,b.x), y:Math.min(r.y,b.y), r:Math.max(r.r,b.x+b.w), b:Math.max(r.b,b.y+b.h) }
            : { x:b.x, y:b.y, r:b.x+b.w, b:b.y+b.h }; });
      return { x:r.x, y:r.y, w:r.r-r.x, h:r.b-r.y }; }
    var nb = g.map(function(el){ return window.__deckRender.box(el); });
    var ik = g.map(function(el){ return window.__deckRender.inkBox(el); });
    var ly = g.map(function(el){ var t = el.style.transform; el.style.transform='none';
      var r = el.getBoundingClientRect(); el.style.transform=t;
      return { x:r.left, y:r.top, w:r.width, h:r.height }; });
    out[c] = { n: g.length, box: uni(function(el){ return window.__deckRender.box(el); }),
               ink: uni(function(el){ return window.__deckRender.inkBox(el); }),
               layout: uni(function(el){ var t=el.style.transform; el.style.transform='none';
                 var r=el.getBoundingClientRect(); el.style.transform=t;
                 return {x:r.left,y:r.top,w:r.width,h:r.height}; }),
               grow: ik.map(function(b){ return b.grow; }),
               cls: g.map(function(el){ return String(el.className).trim(); }),
               members: g.map(function(el){
                 var cv = el.querySelectorAll('canvas');
                 return { tag: el.tagName.toLowerCase(),
                          cls: String(el.className).trim().slice(0,60),
                          rect: window.__deckRender.box(el),
                          ink: window.__deckRender.inkBox(el),
                          canvases: cv.length,
                          txt: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40) };
               }) };
  });
  return JSON.stringify(out);
})()`;

try {
  await client.call('Page.navigate', { url: `file:///${htmlPath.replace(/\\/g, '/')}` });
  for (let i = 0; i < 100; i++) {
    const ok = await evaluate(client, `!!(window.__deckRender && window.__deckRender.hasGoto())`).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await evaluate(client, helpers);
  await evaluate(client, `window.__deckRender.setCfg({
    chrome: ${JSON.stringify(config.chrome ?? [])},
    slide: ${JSON.stringify(config.slide ?? '.slide')},
    page: ${JSON.stringify(config.page ?? '.page')},
    groups: ${JSON.stringify(config.groups ?? {})},
    goto: function (n, skip) { (${config.goto})(n, skip); }
  }); window.__deckRender.styleOnce(); true`);
  await evaluate(client, `window.__deckRender.ready()`);
  await evaluate(client, `window.__deckRender.freezeScale(); true`);

  const total = await evaluate(client, `window.__deckRender.slides().length`);
  const all = {};
  for (let n = 0; n < total; n++) {
    await evaluate(client, `window.__deckRender.goto(${n}); true`);
    await evaluate(client, `window.__deckRender.ready()`);
    // The last entrance can start at 480ms and run 500ms; sampling before it
    // settles records a MID-RISE rect (translateY still applied), which is not
    // the terminal geometry the layer must be captured at.
    await evaluate(
      client,
      `(async function(){ var t0 = Date.now();
         while (Date.now() - t0 < 4000) {
           var an = document.getAnimations ? document.getAnimations() : [];
           var running = an.filter(function(a){ return a.playState === 'running'; });
           if (!running.length) break;
           await new Promise(function(r){ setTimeout(r, 100); });
         }
         await new Promise(function(r){ setTimeout(r, 300); });
         return true; })()`,
    );
    await evaluate(client, `window.__deckRender.freezeScale(); true`);
    all[n] = JSON.parse(await evaluate(client, MEASURE(n)));
    const ks = Object.keys(all[n]).join(',');
    console.log(`slide ${n + 1}: classes {${ks}}`);
  }
  writeFileSync('reports/geometry.json', JSON.stringify(all, null, 1));
  console.log('\nwrote reports/geometry.json');
} finally {
  browser.close();
}
