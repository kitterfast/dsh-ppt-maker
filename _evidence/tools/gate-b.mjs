/**
 * gate-b.mjs — geometry gate, baseline-free.
 *
 * Expected boxes come from a FRESH DOM measurement in a real browser (union of the
 * layer's members' getBoundingClientRect, plus capturePad per side; a canvas GIF
 * layer sits on its owning element's rect with no padding). Actual boxes come from
 * the produced PPTX (`a:off`/`a:ext`, EMU -> px). Nothing is compared against
 * another deck.
 *
 * SCOPE / LIMITS, stated plainly:
 *   · layer membership uses the same documented model as the renderer
 *     (one layer per distinct .aN class; legacy decks: one layer per selector
 *     match). This gate therefore validates the NUMBERS -- measurement, padding,
 *     EMU conversion, layer order, drop decision -- not the model itself.
 *   · the base picture is NOT compared here: it always covers the whole stage and
 *     carries no per-layer geometry.
 *
 * Usage: node tools/gate-b.mjs --config <deck.config.json> --deck <unpackedDeck> --out <log.txt>
 * Exit: 0 = PASS (max |delta| <= 1px), 1 = FAIL, 2 = usage/IO.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const cfgPath = get("--config"), deckDir = get("--deck"), outFile = get("--out");
if (!cfgPath || !deckDir) { console.error("usage: --config <cfg> --deck <dir> --out <log>"); process.exit(2); }

const config = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const root = path.dirname(cfgPath);
const htmlPath = path.resolve(root, config.html);
const renderDir = path.resolve(get("--render") ?? path.join(root, config.out ?? "render"));
const manifest = JSON.parse(fs.readFileSync(path.join(renderDir, "manifest.json"), "utf8"));
const pad = config.capturePad ?? 2;
const EMU = 9525;
const TOL = 1.0;

const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const { launchHeadless, evaluate } = await import(pathToFileURL(PIPE + "/lib/browser.mjs").href);
const helpers = fs.readFileSync(PIPE + "/lib/page-helpers.js", "utf8");

const MEASURE = (n) => `(function(){
  var s = window.__deckRender.slides()[${n}];
  var gs = window.__deckRender.deckGroups(s);
  return JSON.stringify(gs.map(function(g){
    var bits = window.__deckRender.groupAnimatedBits(g);
    var owners = [];
    for (var i=0;i<bits.length;i++){
      var b = bits[i], keep = b;
      if (b.tagName === 'CANVAS') keep = window.__deckRender.canvasOwner(b);
      if (owners.indexOf(keep) === -1) owners.push(keep);
    }
    return { cls: (g.cls || null),
             union: window.__deckRender.unionRect(g),
             owners: owners.map(function(o){ return { id: o.id || '', rect: window.__deckRender.rectOf(o) }; }) };
  }));
})()`;

function pics(pageNo) {
  const dir = path.join(deckDir, "ppt", "slides");
  const xml = fs.readFileSync(path.join(dir, `slide${pageNo}.xml`), "utf8");
  const rels = fs.readFileSync(path.join(dir, "_rels", `slide${pageNo}.xml.rels`), "utf8");
  const rel = new Map();
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]*)"/g)) rel.set(m[1], m[2].split("/").pop());
  const out = [];
  for (const m of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
    const emb = /r:embed="([^"]+)"/.exec(m[0]);
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(m[0]);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(m[0]);
    out.push({ media: rel.get(emb?.[1]) ?? "", x: +off[1] / EMU, y: +off[2] / EMU, w: +ext[1] / EMU, h: +ext[2] / EMU });
  }
  return out;
}

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const W = manifest.width, H = manifest.height;

say(`GATE B  ${cfgPath}`);
say(`  html=${htmlPath}`);
say(`  deck=${deckDir}`);
say(`  render=${renderDir}`);
say(`  capturePad=${pad}   TOL=${TOL}px`);

const browser = await launchHeadless({ width: W, height: H, scale: manifest.settings?.captureScale ?? 2 });
const client = browser.client;
let fails = 0, compared = 0, maxAbs = 0, sumAbs = 0;
const values = [];
try {
  await client.call("Page.navigate", { url: `file:///${htmlPath.replace(/\\/g, "/")}` });
  for (let i = 0; i < 100; i++) {
    const ok = await evaluate(client, `!!(window.__deckRender && window.__deckRender.hasGoto())`).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await evaluate(client, helpers);
  await evaluate(client, `window.__deckRender.setCfg({ chrome: ${JSON.stringify(config.chrome ?? [])},
    slide: ${JSON.stringify(config.slide ?? ".slide")}, page: ${JSON.stringify(config.page ?? ".page")},
    groups: ${JSON.stringify(config.groups ?? {})},
    goto: function (n, skip) { (${config.goto ?? "window.__slideInfo.go"})(n, skip); } });
    window.__deckRender.styleOnce(); true`);
  await evaluate(client, `window.__deckRender.ready()`);

  say("");
  say("  page  layer          expected(x,y,w,h)                    actual(x,y,w,h)                      dx       dy       dw       dh");
  for (const s of manifest.slides) {
    const n = s.index;       // 0-based, for window.__deckRender.slides()[n] / goto(n)
    const pageNo = s.page;   // 1-based, for ppt/slides/slideN.xml
    await evaluate(client, `window.__deckRender.goto(${n}); true`);
    await evaluate(client, `window.__deckRender.ready()`);
    await evaluate(client, `(async function(){ var t0=Date.now();
      while (Date.now()-t0 < 6000) { var an=document.getAnimations?document.getAnimations():[];
        if (!an.filter(function(a){return a.playState==='running'||a.playState==='pending';}).length) break;
        await new Promise(function(r){setTimeout(r,80);}); }
      await new Promise(function(r){setTimeout(r,150);}); return true; })()`);
    await evaluate(client, `window.__deckRender.freezeScale(); true`);

    const dom = JSON.parse(await evaluate(client, MEASURE(n)));
    const actual = pics(pageNo);
    const expected = [{ name: "base", box: { x: 0, y: 0, w: W, h: H } }];
    for (let k = 0; k < s.groups.length; k++) {
      const g = s.groups[k], d = dom[k];
      if (!d) { say(`  [p${pageNo}] group ${k}: DOM group missing`); fails++; continue; }
      for (const b of (g.bits ?? []).filter((x) => x.gif)) {
        let own = d.owners.find((o) => Math.abs(o.rect.x - b.box.x) < 3 && Math.abs(o.rect.w - b.box.w) < 3);
        if (!own) own = d.owners[0];
        if (!own) { say(`  [p${pageNo}] g${k}: no canvas owner measured`); fails++; continue; }
        expected.push({ name: `g${k}bit(gif)`, box: own.rect });
      }
      if (!g.dropped) {
        expected.push({ name: `g${k}static`, box: { x: d.union.x - pad, y: d.union.y - pad, w: d.union.w + pad * 2, h: d.union.h + pad * 2 } });
      }
    }
    if (expected.length !== actual.length) { say(`  [p${pageNo}] PICTURE COUNT: expected ${expected.length}, deck ${actual.length}`); fails++; }
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
      const e = expected[i], a = actual[i];
      const dx = a.x - e.box.x, dy = a.y - e.box.y, dw = a.w - e.box.w, dh = a.h - e.box.h;
      const mag = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dw), Math.abs(dh));
      if (i > 0) {
        compared += 4; sumAbs += Math.abs(dx) + Math.abs(dy) + Math.abs(dw) + Math.abs(dh);
        if (mag > maxAbs) maxAbs = mag;
        values.push({ page: pageNo, layer: e.name, dx, dy, dw, dh });
      }
      const bad = mag > TOL;
      if (bad) fails++;
      say(`  ${String(pageNo).padStart(4)}  ${e.name.padEnd(13)}  ` +
        `${[e.box.x, e.box.y, e.box.w, e.box.h].map((v) => v.toFixed(3).padStart(10)).join(",")}  ` +
        `${[a.x, a.y, a.w, a.h].map((v) => v.toFixed(3).padStart(10)).join(",")}  ` +
        `${dx.toFixed(4).padStart(8)} ${dy.toFixed(4).padStart(8)} ${dw.toFixed(4).padStart(8)} ${dh.toFixed(4).padStart(8)}${bad ? "  <<" : ""}`);
    }
  }
} finally {
  browser.close();
}

say("");
say(`  本门口径：非 base 层数 = ${values.length}，数值个数 = ${values.length} x 4 = ${compared}（${manifest.slides.length} 页）：`);
say(`    ${values.length} 层 x (dx,dy,dw,dh) 4 个分量 = ${compared} 个数值。base 不参与本门比对。`);
say(`  修复报告 268 系按 67 图（含 11 张 base）x 4 算，非本门口径。`);
say(`  0.001/0.0 的显示精度问题与本门数值个数无关。`);
say("");
say(`  values compared = ${compared}   max |delta| = ${maxAbs.toFixed(4)} px   mean |delta| = ${(compared ? sumAbs / compared : 0).toFixed(4)} px   TOL = ${TOL} px`);
say(`  RESULT: ${fails === 0 && maxAbs <= TOL ? "PASS" : "FAIL"}   (${fails} problem(s))`);
if (outFile) fs.writeFileSync(outFile, lines.join("\r\n"), "utf8");
process.exit(fails === 0 && maxAbs <= TOL ? 0 : 1);
