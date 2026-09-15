/**
 * deck-render.mjs 闁?one headless pass over an HTML deck.
 *
 * Fixes three of the four defects measured in the 2026-09-14 run:
 *
 *   1. CHROME BAKED INTO SLIDES. The old flow screenshotted the whole page,
 *      including the browser-only navigation (progress bar, 闁?闁?buttons, dot
 *      rail, hint bar), so every PPTX slide carried dead browser UI. Here the
 *      chrome selectors are hidden for *every* capture, and the deck's own
 *      page-scale transform is neutralised so 1280x720 is captured 1:1.
 *
 *   2. OPAQUE LAYERS THAT OCCLUDE EACH OTHER. The old flow hid elements with
 *      `visibility:hidden`, which keeps the page background, so every "layer"
 *      was a full-page opaque image. Here each animation group is rendered in
 *      ISOLATION (all other nodes `display:none`, every ancestor background
 *      forced transparent, CDP default background set to alpha 0) and captured
 *      clipped to its own box -> a true-alpha PNG of just that group.
 *
 *   3. MINUTES PER ITERATION. One browser launch for the whole deck, one pass,
 *      and a per-slide content hash cache: unchanged slides are reused instead
 *      of re-rendered, so a tweak to page 7 costs one slide, not twenty.
 *
 * Output: <out>/manifest.json + <out>/pNN/{ref.png,base.jpg,gK.png}
 *
 * Usage: node deck-render.mjs [deck.config.json] [--force] [--only=3,7]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, launchHeadless, screenshot } from "./lib/browser.mjs";
import { loadAndPlan, patchMerge, runtimeAmbiguity, declaredPage, ERR } from "./lib/manifest.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",").map((n) => Number(n.trim()) - 1)) : null;
const configPath = resolve(args.find((a) => !a.startsWith("--")) ?? "deck.config.json");

const config = JSON.parse(readFileSync(configPath, "utf8"));
const projectRoot = dirname(configPath);
/** gifenc/pngjs are resolved from the deck's own project, not from the plugin. */
const require = createRequire(join(projectRoot, "package.json"));
const htmlPath = resolve(projectRoot, config.html);
const outDir = resolve(projectRoot, config.out ?? "render");

/** Bump when the capture logic changes, so stale caches are never reused. */
const RENDERER_VERSION = "28";

// Per-class entrance delays from the animation spec (HTML truth). Groups carry
// their real class, so repeated classes (two .a4 wrappers) still map correctly —
// indexing by group number was off by one whenever a class repeated.
const animSpecPath = resolve(projectRoot, config.animSpec ?? "anim-spec.json");
const animSpec = existsSync(animSpecPath) ? JSON.parse(readFileSync(animSpecPath, "utf8")) : null;
const classDelayMs = new Map();
for (const r of animSpec?.entranceRules ?? []) {
  const m = /\.(a\d+)\s*$/.exec((r.selector ?? "").trim());
  if (m && !r.infinite && typeof r.delayMs === "number") classDelayMs.set(m[1], r.delayMs);
}

/* ══ 2.6.0 声明层入口（输入层）══════════════════════════════════════════════
 * 无声明：只多两次文件读取与正则，mode="reverse"，行为与 2.5.0 一致。
 * 有声明：逐字段合并 + 严格校验 + 静态歧义判定；任何错误在【开浏览器之前】FAIL。
 * 运行期歧义（A_INDEX / A_MEMBERS）在同一次 DOM pass 内、任何抓取之前判定。 */
const htmlText = readFileSync(htmlPath, "utf8");
const declFacts = (() => {
  const sections = htmlText.split(/<section\b[^>]*class="[^"]*\bslide\b/).slice(1);
  const classesOnPages = sections.map((raw, i) => {
    const body = raw.split("</section>")[0];
    const set = new Set();
    for (const c of body.matchAll(/class="([^"]*)"/g)) for (const tok of c[1].split(/\s+/)) if (/^a\d+$/.test(tok)) set.add(tok);
    return { page: i + 1, classes: [...set] };
  });
  let multiple = 0;
  for (const raw of sections) {
    const body = raw.split("</section>")[0];
    for (const c of body.matchAll(/class="([^"]*)"/g)) if (c[1].split(/\s+/).filter((t) => /^a\d+$/.test(t)).length > 1) multiple++;
  }
  return { config, classesOnPages, declaredClassDelays: classDelayMs, elementsWithoutClass: 0, elementsWithMultipleClasses: multiple };
})();
const mf = loadAndPlan({ htmlPath, htmlText, config, facts: declFacts, g6Attested: false });
const declMode = mf.present ? "declared" : "reverse";
const declFingerprint = mf.present ? createHash("sha256").update(JSON.stringify(mf.merged)).digest("hex").slice(0, 16) : "none";
if (mf.errors.length) {
  console.error(`[manifest] FAILED 声明层校验未通过（开浏览器前拒收）—— ${mf.errors.length} 项:`);
  for (const e of mf.errors) console.error(`  ${e.code}  ${e.field}  ${e.detail}`);
  process.exit(1);
}
console.log(mf.present
  ? `[manifest] 声明路径已启用：合并字段 ${mf.provenance.size} 个（来源 embedded=${mf.sources.embedded} sidecar=${mf.sources.sidecar}）`
  : "[contract] 本稿走宽松路径，未做声明级验证");

const W = mf.merged?.stage?.width ?? config.width ?? 1280;
const H = mf.merged?.stage?.height ?? config.height ?? 720;

/** Hash decides whether a slide can be reused. Config participates, so changing
 *  a delay or a chrome selector invalidates the cache too. */
const deckHash = createHash("sha256")
  .update(RENDERER_VERSION)
  .update(readFileSync(htmlPath))
  .update(JSON.stringify(config))
  // G7：声明路径与反解路径的中间缓存不得共享
  .update(declMode)
  .update(declFingerprint)
  .digest("hex")
  .slice(0, 16);

const manifestPath = join(outDir, "manifest.json");
// Fail fast, before launching a browser: assets that are referenced by absolute
// path or by URL are not bound to the HTML and will break the moment it moves.
checkAssetBinding(htmlPath, readFileSync(htmlPath, "utf8"));const oldManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const oldByIndex = new Map((oldManifest?.slides ?? []).map((s) => [s.index, s]));

// ---------------------------------------------------------------- page helpers

/** Injected into the page; shared verbatim with the fidelity probe so the probe
 *  measures the real capture path. */
const PAGE_HELPERS = readFileSync(new URL("./lib/page-helpers.js", import.meta.url), "utf8");

/**
 * Wait until two consecutive full-page captures are byte-identical.
 *
 * A fixed sleep is not enough: the first raster pass after a navigation can
 * still be settling (fonts, chart init), and a reference captured then disagrees
 * with the layers captured moments later. Measured on the "AI 闂侇偅鑹捐ぐ? deck, that
 * single mistake accounted for the entire residual (mean 1.8-10.8 per channel,
 * concentrated on glyphs, ~3% of pixels). Captures are bit-for-bit deterministic,
 * so equality of two consecutive shots is a sound readiness signal.
 */
async function waitStable(client, { tries = 16, delayMs = 120 } = {}) {
  let prev = null;
  for (let i = 0; i < tries; i++) {
    const shot = await screenshot(client, { format: "png" });
    const h = createHash("sha1").update(shot).digest("hex");
    if (prev === h) return i + 1;
    prev = h;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return -1;
}

/**
 * Encode captured frames as a looping, palette-quantised animated GIF.
 *
 * The palette is computed once from a sample across the whole clip so colours do
 * not shimmer between frames; index 255 is reserved for transparency so the GIF
 * behaves like the PNG layer it replaces (a layer, not an opaque rectangle).
 */
function encodeGif(frameBuffers, delayMs, outPath, opts = {}) {
  const delayAt = (i) => (Array.isArray(delayMs) ? delayMs[Math.min(i, delayMs.length - 1)] : delayMs);
  const { GIFEncoder, quantize, applyPalette } = require("gifenc");
  const { PNG } = require("pngjs");
  const frames = frameBuffers.map((b) => PNG.sync.read(b));
  if (opts.opaqueBase) {
    for (const fr of frames) {
      for (let p = 0; p < fr.width * fr.height; p++) {
        const o = p * 4;
        const a = fr.data[o + 3] / 255;
        const bx = opts.opaqueBase[o], by = opts.opaqueBase[o + 1], bz = opts.opaqueBase[o + 2];
        fr.data[o] = Math.round(fr.data[o] * a + bx * (1 - a));
        fr.data[o + 1] = Math.round(fr.data[o + 1] * a + by * (1 - a));
        fr.data[o + 2] = Math.round(fr.data[o + 2] * a + bz * (1 - a));
        fr.data[o + 3] = 255;
      }
    }
  }
  const w = frames[0].width;
  const h = frames[0].height;
  const sample = Buffer.concat(frames.filter((_, i) => i % 2 === 0).map((f) => f.data));
  const palette255 = quantize(new Uint8Array(sample), 255, { format: "rgb565" });
  const palette = palette255.concat([[0, 0, 0]]); // 255 = transparent slot
  const gif = GIFEncoder();
  frames.forEach((f, i) => {
    const rgba = new Uint8Array(f.data);
    const idx = applyPalette(rgba, palette255, "rgb565");
    for (let p = 0; p < idx.length; p++) if (rgba[p * 4 + 3] < 128) idx[p] = 255;
    const enc = { palette, delay: delayAt(i), dispose: 2 };
    if (!opts.opaqueBase) { enc.transparent = true; enc.transparentIndex = 255; }
    if (i === 0) opts.repeat = 0; // loop forever
    gif.writeFrame(idx, w, h, enc);
  });
  gif.finish();
  writeFileSync(outPath, Buffer.from(gif.bytes()));
  return frames.length;
}

/**
 * Assets must be BOUND to the HTML: local, relatively referenced, and present.
 *
 * Without this a deck can reference an image by absolute path or by URL, render
 * fine on this machine, and then lose every image the moment the HTML is moved
 * or opened offline. Fail on anything that breaks the binding; warn on remote
 * references (a CDN fallback for a local library is allowed, as long as the
 * local copy is the primary path).
 */
function checkAssetBinding(htmlPath, html) {
  const dir = dirname(htmlPath);
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const fatal = [];
  const warn = [];
  for (const ref of refs) {
    if (/^(data:|#|mailto:|javascript:)/i.test(ref)) continue;
    if (/^https?:\/\//i.test(ref) || /^\/\//.test(ref)) {
      warn.push(ref);
      continue;
    }
    if (/^file:\/\//i.test(ref) || /^[A-Za-z]:[\\/]/.test(ref)) {
      fatal.push(`绝对路径引用（HTML 一搬就断图）: ${ref}`);
      continue;
    }
    const target = resolve(dir, decodeURIComponent(ref.split(/[?#]/)[0]));
    if (!existsSync(target)) fatal.push(`引用的本地文件不存在: ${ref}`);
  }
  if (warn.length) {
    console.log(
      `[render] WARNING ${warn.length} 处远程引用（只能是本地优先的 fallback，断网必须仍能开）:\n` +
        warn.slice(0, 5).map((w) => `         ${w}`).join("\n"),
    );
  }
  if (fatal.length) {
    console.error(
      `[render] FAILED 资源没有和 HTML 绑定 —— ${fatal.length} 处:\n` +
        fatal.slice(0, 10).map((f) => `         ${f}`).join("\n") +
        `\n         素材一律放 HTML 同目录树下（如 assets/）并用相对路径引用。`,
    );
    process.exit(1);
  }
  console.log(`[render] asset binding ok (${refs.length} refs, ${warn.length} remote fallback)`);
}

async function setup(client, config) {
  const gotoExpr = config.goto ?? "window.__slideInfo.go";
  await evaluate(client, PAGE_HELPERS);
  await evaluate(
    client,
    `window.__deckRender.setCfg({
       chrome: ${JSON.stringify(config.chrome ?? [])},
       slide: ${JSON.stringify(config.slide ?? ".slide")},
       page: ${JSON.stringify(config.page ?? ".page")},
       groups: ${JSON.stringify(config.groups ?? { selector: ".body > *" })},
       goto: function (n, skip) { (${gotoExpr})(n, skip); }
     }); window.__deckRender.styleOnce(); true`,
  );
}

/**
 * Capture rect for a layer: ROUND the origin, FLOOR the size. Verified against
 * the proven deck's own PNG dimensions -- see the note in deck-render's history.
 * clipFor() below stays for the legacy one-element path and the padded GIF clip.
 */
function clipOf(box, W, H) {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.max(1, Math.floor(box.w));
  const h = Math.max(1, Math.floor(box.h));
  return { x, y, width: Math.min(w, W - x), height: Math.min(h, H - y) };
}

/** Clip rect clamped into the viewport, padded so box-shadows survive. */
function clipFor(box, pad, W, H) {
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  const right = Math.min(W, Math.ceil(box.x + box.w + pad));
  const bottom = Math.min(H, Math.ceil(box.y + box.h + pad));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

// ---------------------------------------------------------------------- render

const pad = mf.merged?.capturePad ?? config.capturePad ?? 2;
const settleMs = config.settleMs ?? 180;
const baseQuality = config.baseQuality ?? 88;

mkdirSync(outDir, { recursive: true });
const shots = [];
const t0 = Date.now();
const captureScale = config.captureScale ?? 2;
const browser = await launchHeadless({ width: W, height: H, scale: captureScale });
let client = browser.client;

try {
  await client.call("Page.navigate", { url: `file:///${htmlPath.replace(/\\/g, "/")}` });
  // The deck boots off DOMContentLoaded; wait for its public API.
  for (let i = 0; i < 100; i++) {
    const ok = await evaluate(client, `!!(window.__deckRender && window.__deckRender.hasGoto())`).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await setup(client, config);
  // Headless Chromium can starve requestAnimationFrame when nothing else
  // schedules frames, freezing script-driven WebGL canvases mid-capture
  // (measured: p7 constellation rendered once, then never again — while the
  // page's rAF counter kept climbing). A persistent no-op rAF chain keeps the
  // frame scheduler alive for the whole session; the deck's own render loop
  // then keeps drawing. Verified with probe4: motion only with this ticker.
  await evaluate(client, `window.__tickerOn = true; (function __t(){ if (window.__tickerOn) requestAnimationFrame(__t); })(); true`);
  await evaluate(client, `window.__deckRender.ready()`);
  await evaluate(client, `window.__deckRender.freezeScale(); true`);

  // Contract gate: refuse to bake a deck whose animation cannot be mapped
  // 1:1 (infinite loops and canvas have NO working mechanism in WPS).
  {
    const { spawnSync } = await import("node:child_process");
    // A config that declares groups.selector + groups.delays has already fixed
    // the layer split, so the strict .a1…​.aN naming is a convention, not a
    // requirement; infinite/canvas still get baked as looping GIFs either way.
    const declaredLayers = !!(config.groups?.selector && Array.isArray(config.groups?.delays));
    const checkArgs = [fileURLToPath(new URL("./tools/extract-anim-spec.mjs", import.meta.url)), htmlPath, "--check"];
    if (declaredLayers) checkArgs.push("--declared");
    const r = spawnSync(process.execPath, checkArgs, { encoding: "utf8" });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status !== 0) process.exit(1);
  }

  const total = await evaluate(client, `window.__deckRender.slides().length`);
  if (!total) throw new Error(`no slides matched ${config.slide ?? ".slide"}`);
  console.log(`[render] ${total} slides, deck hash ${deckHash}`);

  /* ── 2.6.0 运行期歧义 + 声明一致性：一次 DOM pass，任何抓取之前 ───────── */
  let declPlan = null;
  if (mf.present) {
    const pages = [];
    for (let p = 1; p <= total; p++) if (!only || only.has(p - 1)) pages.push(p);
    // Declared member selectors per page, resolved INSIDE the page below so that
    // member identity — not merely a count — can be compared with the runtime
    // layering. Addressing follows the same 1-based page rule as patchMerge.
    const declSelectors = new Map();
    (mf.merged?.slides ?? []).forEach((s2, i) => {
      const r = declaredPage(s2);
      const pg = r.page ?? (r.via === null ? i + 1 : null);
      if (!pg) return;
      const sets = (s2.layers ?? []).filter((L) => Array.isArray(L.members) && L.members.length).map((L) => L.members);
      if (sets.length) declSelectors.set(pg, sets);
    });

    const domSlides = [], domMotion = [], nestedPages = [], indexOk = [];
    for (const p of pages) {
      const declSets = declSelectors.get(p) ?? [];
      const raw = JSON.parse(await evaluate(client, `(function(){
        var s = window.__deckRender.slides()[${p - 1}];
        var gs = window.__deckRender.deckGroups(s);
        function sig(el){
          var t = el.tagName.toLowerCase();
          var id = el.id ? ('#' + el.id) : '';
          // no backslash escapes here: this source lives inside a template
          // literal, which would turn \s into a bare s and split on the letter s
          var cl = (el.getAttribute('class') || '').split(' ').filter(Boolean).sort();
          return t + id + (cl.length ? ('.' + cl.join('.')) : '');
        }
        function boxOf(els){
          if (!els.length) return null;
          var x = 1e9, y = 1e9, r = -1e9, b = -1e9;
          for (var i = 0; i < els.length; i++){ var q = els[i].getBoundingClientRect();
            if (q.left < x) x = q.left; if (q.top < y) y = q.top;
            if (q.right > r) r = q.right; if (q.bottom > b) b = q.bottom; }
          return { x: x, y: y, w: r - x, h: b - y };
        }
        var nested = 0;
        for (var i=0;i<gs.length;i++){ var els = window.__deckRender.elsOf(gs[i]);
          for (var a=0;a<els.length;a++) for (var b=0;b<els.length;b++) if (a!==b && els[a].contains(els[b])) nested++; }
        var declSets = ${JSON.stringify(declSets)};
        var resolved = declSets.map(function(sels){ return sels.map(function(sel){
          var bad = false, hits = [];
          try { hits = Array.prototype.slice.call(s.querySelectorAll(sel)); } catch (e) { bad = true; }
          return { sel: sel, invalid: bad, count: hits.length, memberSigs: hits.map(sig).sort() }; }); });
        return JSON.stringify({ nested: nested,
          layers: gs.map(function(g){ var d = window.__deckRender.groupDescribe(g); var m = window.__deckRender.elsOf(g);
            return { cls: d.cls, memberCount: m.length, memberSigs: m.map(sig).sort(), box: boxOf(m) }; }),
          resolved: resolved });
      })()`));
      if (raw.nested > 0) nestedPages.push(p);
      domSlides.push({ page: p, layers: raw.layers, resolved: raw.resolved });
    }
    if (process.env.DECK_DUMP_DOM) {
      writeFileSync(process.env.DECK_DUMP_DOM, JSON.stringify({ total, pages, slides: domSlides, motion: domMotion, nestedPages }, null, 1), "utf8");
      console.log(`[manifest] DOM pass 已导出: ${process.env.DECK_DUMP_DOM}`);
    }
    const amb = runtimeAmbiguity({ slideIndexOrderUnique: true, nestedLayerGroups: nestedPages });
    for (const m of (mf.merged.motion ?? [])) {
      const r = JSON.parse(await evaluate(client, `(function(){
        var s = window.__deckRender.slides()[${m.slide - 1}];
        var el = s ? s.querySelector(${JSON.stringify(m.owner)}) : null;
        if (!el) return JSON.stringify({ found: false });
        var own = (el.tagName === 'CANVAS') ? window.__deckRender.canvasOwner(el) : el;
        var isCv = own.tagName === 'CANVAS' || !!own.querySelector('canvas');
        return JSON.stringify({ found: true, kind: isCv ? 'canvas' : 'css' });
      })()`));
      if (r.found) domMotion.push({ page: m.slide, owner: m.owner, kind: r.kind });
    }
    const res = patchMerge({ merged: mf.merged, amb, dom: { slides: domSlides, motion: domMotion, total, nestedPages } });
    if (res.errors.length) {
      console.error(`[manifest] FAILED 声明与 DOM 不一致（未做任何抓取）—— ${res.errors.length} 项:`);
      for (const e of res.errors) console.error(`  ${e.code}  ${e.field}  ${e.detail}`);
      process.exit(1);
    }
    for (const n2 of res.notes) console.log(`[manifest] ${n2}`);
    if (mf.merged.motion) {
      for (const f of domMotion) {
        if (!mf.merged.motion.some((m) => m.slide === f.page && m.owner === f.owner)) {
          console.error(`[manifest] FAILED ${ERR.MOTION_ABSENT_BUT_MOVING} slide ${f.page} ${f.owner}：motion 已声明但该元素在动`);
          process.exit(1);
        }
      }
    }
    declPlan = res.plan;
    console.log(`[manifest] DOM pass 完成：检查 ${pages.length} 页，run-time 歧义 ${[...amb.keys()].join(",") || "无"}`);
  }

  for (let n = 0; n < total; n++) {
    if (only && !only.has(n)) { if (oldByIndex.get(n)) shots.push(oldByIndex.get(n)); continue; }
    const slideDir = join(outDir, `p${String(n + 1).padStart(2, "0")}`);
    const rel = (f) => `p${String(n + 1).padStart(2, "0")}/${f}`;

    // Terminal state (no entrance animation running) so the group is captured
    // where the PPT animation must END.
    await evaluate(client, `window.__deckRender.goto(${n}); true`);

    // Permanent (infinite) CSS motion cannot be expressed on a PowerPoint
    // timeline. Detect it while the entrance class is applied, then restore the
    // terminal state 闁?reporting it beats silently shipping a still frame.
    const permanentFlags = JSON.parse(
      await evaluate(
        client,
        `(function(){
           var s = window.__deckRender.slides()[${n}];
           var gs = window.__deckRender.deckGroups(s);
           s.classList.add('anim');
           var out = gs.map(function(g){
             var els = window.__deckRender.elsOf(g);
             var permanent = els.some(function(el){
               var an = (el.getAnimations ? el.getAnimations({ subtree: true }) : []);
               return an.some(function(a){ var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; return t.iterations === Infinity; });
             });
             return { permanent: permanent, canvas: window.__deckRender.groupHasCanvas(g) };
           });
           s.classList.remove('anim');
           void s.offsetWidth;
           return JSON.stringify(out);
         })()`,
      ),
    );
    await evaluate(client, `window.__deckRender.goto(${n}); true`);
    await evaluate(client, `window.__deckRender.ready()`);
    // waitStable() alone is NOT enough, and this cost a whole measurement round:
    // during the entrance DELAY (up to 480ms) animation-fill-mode:both holds the
    // element at its `from` state, so two consecutive captures are identical
    // while nothing has played yet. waitStable() then reports "stable" and the
    // group boxes are measured 20px low, at opacity 0. Wait for the animations
    // themselves to drain first.
    await evaluate(
      client,
      `(async function(){ var t0 = Date.now();
         while (Date.now() - t0 < 6000) {
           var an = document.getAnimations ? document.getAnimations() : [];
           var busy = an.filter(function(a){ return a.playState === 'running' || a.playState === 'pending'; });
           if (!busy.length) break;
           await new Promise(function(r){ setTimeout(r, 80); });
         }
         await new Promise(function(r){ setTimeout(r, 120); });
         return true; })()`,
    );
    await new Promise((r) => setTimeout(r, settleMs));
    await evaluate(client, `window.__deckRender.freezeScale(); true`);
    const stableAfter = await waitStable(client);
    if (stableAfter < 0) console.log(`[render] p${n + 1}: WARNING page never stopped changing; captures may disagree`);

    // D7 + F4: the reverse grouping is ALWAYS computed. A declared layer then
    // overrides the box of the layer patchMerge located it to, and every layer
    // that was not declared keeps the reverse result. A page with no located
    // declaration carries no plan entry at all, so it never enters this branch —
    // previously it did, with empty member lists, producing a null box and a
    // crash inside the frozen capture block.
    const declLayers = declPlan?.slides?.get(n + 1) ?? null;
    const declSpec = declLayers ? declLayers.map((L) => ({ k: L.k, sels: L.members })) : [];
    const shape = await evaluate(
      client,
      `(function(){
         var s = window.__deckRender.slides()[${n}];
         var gs = window.__deckRender.deckGroups(s);
         var groups = gs.map(function(g){ var d = window.__deckRender.groupDescribe(g); var b = window.__deckRender.unionRect(g);
           return { box: b, text: d.text, cls: d.cls }; });
         var spec = ${JSON.stringify(declSpec)};
         var decl = spec.map(function(e){
           var els = [];
           for (var i = 0; i < e.sels.length; i++) {
             var hits = s.querySelectorAll(e.sels[i]);
             for (var j = 0; j < hits.length; j++) if (els.indexOf(hits[j]) === -1) els.push(hits[j]);
           }
           var g = { cls: null, els: els };
           return { k: e.k, box: window.__deckRender.unionRect(g), n: els.length };
         });
         return JSON.stringify({ groups: groups, decl: decl });
       })()`,
    );
    const parsed = JSON.parse(shape);
    const groups = parsed.groups;
    if (declLayers) {
      for (const dd of parsed.decl) {
        const g = groups[dd.k];
        if (!g) {
          console.error(`[manifest] FAILED ${ERR.DOM_MISMATCH} slide ${n + 1}: 声明的层 k=${dd.k} 超出反解层数 ${groups.length}`);
          process.exit(1);
        }
        if (!dd.box || dd.n === 0) {
          console.error(`[manifest] FAILED ${ERR.LAYER_BOX_UNRESOLVED} slide ${n + 1} layer ${dd.k}: 声明的 members 在页内解析不到元素`);
          process.exit(1);
        }
        g.box = dd.box;
      }
      for (const L of declLayers) {
        const g = groups[L.k];
        if (g) g.declaredDelayMs = L.delayMs;
      }
    }
    // The proven deck pads EVERY layer box by a constant 10px per side; this is
    // measured, not guessed. Page 3 .a1 ships at 86,66,1108x46 while its layout
    // rect is 96,76,1088x26 -- and the same +10 holds on every page, including
    // the tilted card rows where the rotated-vs-layout box differed.
    for (const g of groups) {
      if (!g.box) continue;
      g.box = { x: g.box.x - pad, y: g.box.y - pad, w: g.box.w + pad * 2, h: g.box.h + pad * 2 };
    }
    const delays = config.groups?.delays ?? [60, 170, 280, 390, 500];
    const fallbackStep = config.groups?.stagger ?? 110;
    groups.forEach((g, k) => {
      g.permanent = permanentFlags[k]?.permanent === true;
      g.canvas = permanentFlags[k]?.canvas === true;
      // Delay from the element's ACTUAL class (spec), so repeated classes and
      // non-sequential group order map to the HTML's own staggering — indexing
      // by k is off whenever a class repeats (p7 has two .a4 groups).
      const cls = (g.cls || "").match(/\ba\d+\b/)?.[0] ?? null;
      g.delayMs = (cls && classDelayMs.has(cls))
        ? classDelayMs.get(cls)
        : (delays[k] ?? (delays[delays.length - 1] + (k - delays.length + 1) * fallbackStep));
      // 声明路径：延迟用声明值，且声明必须与反解值一致，否则 FAIL（不静默、不折中）
      if (g.declaredDelayMs !== undefined && g.declaredDelayMs !== null) {
        if (g.declaredDelayMs !== g.delayMs) {
          console.error(`[manifest] FAILED ${ERR.DOM_MISMATCH} slide ${n + 1} layer ${k}: 声明 delayMs=${g.declaredDelayMs}，反解=${g.delayMs}`);
          process.exit(1);
        }
        g.delayMs = g.declaredDelayMs;
      }
      g.durationMs = config.groups?.duration ?? 500;
      g.moveY = config.groups?.moveY ?? 14;
      g.easing = config.groups?.easing ?? [0.22, 0.61, 0.36, 1];
    });

    // Describe the animated sub-elements of every group, so the crisp PNG layer
    // can be captured WITHOUT them and each one can be baked as its own GIF.
    const __rawBits = await evaluate(
        client,
        `(function(){ var s = window.__deckRender.slides()[${n}];
           var gs = window.__deckRender.deckGroups(s);
           s.classList.add('anim');
           var res = JSON.stringify(gs.map(function(g){
             return window.__deckRender.groupAnimatedBits(g)
               .map(function(b){
                 var d = window.__deckRender.describe(b);
                 var isCanvas = b.tagName === 'CANVAS';
                 // A canvas is drawn by its own GIF, and the proven deck's GIF
                 // covers the whole .aN layer that OWNS the canvas (screen chrome
                 // included) at that layer's UNPADDED rect.
                 var target = isCanvas ? window.__deckRender.canvasOwner(b) : b;
                 var x = isCanvas ? window.__deckRender.rectOf(target) : window.__deckRender.inkBox(b);
                 return { box: x, text: d.text, tag: isCanvas ? 'canvas' : d.cls, owner: target.id || '' }; }); }));
           s.classList.remove('anim'); void s.offsetWidth; return res; })()`,
      );
    const bitsPerGroup = JSON.parse(__rawBits);

    groups.forEach((g, k) => { g.bits = bitsPerGroup[k] || []; });

    const hash = createHash("sha256")
      .update(deckHash)
      .update(JSON.stringify({ n, groups: groups.map((g) => [g.box, g.delayMs, g.text]), bits: groups.map((g) => (g.bits || []).map((b) => b.box)) }))
      .digest("hex")
      .slice(0, 16);
    const prev = oldByIndex.get(n);
    // A dropped group (empty static part) ships no layer file, so `file` is null
    // in the manifest; it must not be probed on disk. Probing it crashed every
    // full non-force re-render of a deck that has such a layer.
    if (!force && prev && prev.hash === hash && (prev.groups || []).every((g) => !g.file || existsSync(join(outDir, g.file))) && existsSync(join(outDir, prev.base)) && existsSync(join(outDir, prev.ref))) {
      console.log(`[render] p${n + 1} cached`);
      shots.push(prev);
      continue;
    }
    mkdirSync(slideDir, { recursive: true });

    // --- reference: the whole slide, chrome hidden, everything at terminal state
    writeFileSync(join(slideDir, "ref.png"), await screenshot(client, { format: "png" }));

    // --- base: every animated group removed, so the background carries no
    //     element that will later animate on top of it.
    //     PNG, not JPEG: the verifier diffs PowerPoint's own export against the
    //     browser render, and JPEG ringing around text edges shows up as a
    //     several-percent pixel difference that has nothing to do with layout.
    //     The restore handle comes from the page helper: hiding switches
    //     `visibility`, and restoring `display` instead left every group hidden
    //     so all the layers below were captured empty.
    await evaluate(
      client,
      `window.__restoreBase = window.__deckRender.hideAll(window.__deckRender.groups(window.__deckRender.slides()[${n}])); (function(){ var s = window.__deckRender.slides()[${n}]; var bits = window.__deckRender.animatedBitsOf(s); for (var i = 0; i < bits.length; i++){ if (bits[i].tagName === 'CANVAS' && window.__deckRender.nestedCanvas(bits[i])){ var own = window.__deckRender.canvasOwner(bits[i]); if (own && own.closest('.slide') === s) own.style.visibility = 'visible'; } } return true; })()`,
    );
    const baseFile = config.baseFormat === "jpeg" ? "base.jpg" : "base.png";
    writeFileSync(
      join(slideDir, baseFile),
      await screenshot(client, config.baseFormat === "jpeg" ? { format: "jpeg", quality: baseQuality } : { format: "png" }),
    );
    await evaluate(client, `window.__restoreBase(); true`);
    // Layers become OPAQUE, composited in stack order over the base, exactly
    // like the proven deck. WPS renders alpha PNGs badly (black corners), so the
    // deck ships with zero alpha anywhere.
    const sc = captureScale ?? 2;
    const { PNG: PNG2 } = require("pngjs");
    const stack = PNG2.sync.read(readFileSync(join(slideDir, baseFile)));

    // The animated sub-elements must NOT be baked into the PNG layer: they are
    // drawn by their own GIF on top, and a static copy underneath would ghost.
    // For a canvas nested in .aN layers, the whole owning layer is hidden so its
    // chrome (title text, background) moves into the GIF exactly like the
    // proven deck — the layer then comes out empty and is dropped below.
    await evaluate(
      client,
      `window.__hideBits = window.__deckRender.hideAll(window.__deckRender.hiddenBits(window.__deckRender.slides()[${n}])); true`,
    );

    // --- one true-alpha PNG per animation group
    const layerPaths = {};
    for (let k = 0; k < groups.length; k++) {
      await evaluate(
        client,
        `(function(){
           var s = window.__deckRender.slides()[${n}];
           var g = window.__deckRender.deckGroups(s)[${k}];
           window.__restore = window.__deckRender.isolateMany(g);
           // Whatever this group bakes into a GIF must not also sit in the PNG.
           // Page 7 shows why this is per-group and not slide-wide: the .a4 group
           // captures fully transparent once its canvas layer is hidden, so it is
           // dropped and the GIF carries that entrance slot alone.
           var hb = window.__deckRender.groupHiddenBits(g);
           window.__restoreExtra = hb.length ? window.__deckRender.hideAll(hb) : null;
           return true;
         })()`,
      );
      await client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const clip = clipOf(groups[k].box, W, H);
      let png;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          png = await screenshot(client, { format: "png", clip });
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      await client.call("Emulation.setDefaultBackgroundColorOverride", {});
      await evaluate(client, `window.__restoreExtra && window.__restoreExtra(); window.__restore(); true`);
      // A layer whose chrome moved into a nested-canvas GIF captures fully
      // transparent. Shipping it would double-draw the GIF's text, so drop it
      // and let the GIF picture carry the group's entrance slot.
      // Threshold >= 40: the deck's paper-noise ::after veil paints alpha ~6-14
      // over the whole slide, so "no ink" is not alpha==0 but "no real paint".
      {
        const rawLayer = PNG2.sync.read(png);
        let ink = false;
        for (let i = 3; i < rawLayer.data.length; i += 4) {
          if (rawLayer.data[i] >= 40) { ink = true; break; }
        }
        if (!ink) {
          groups[k].dropped = true;
          console.log(`[render] p${n + 1} g${k}: layer fully transparent -> dropped (GIF carries its ink)`);
          continue;
        }
      }
      const file = rel(`g${k}.png`);
      writeFileSync(join(outDir, file), png);
      // Layers ship with TRUE ALPHA, exactly like the proven deck (its layer
      // PNGs are RGBA with 70-99% fully transparent pixels; measured). The old
      // "composite each layer over the base" step baked the paper background
      // into every layer: the files were far heavier, and the entrance's 20px
      // rise dragged an opaque rectangle of background across the slide.
      layerPaths[k] = { k, file, clip, box: groups[k].box, bytes: png.length };
    }

    await evaluate(client, `window.__hideBits(); true`);

    // --- permanent motion -> a looping GIF layer ---------------------------
    //
    // A PowerPoint timeline cannot express an endless loop, so any group that
    // keeps moving (CSS `infinite`, or a script-driven <canvas>) is recorded as
    // one looping animated GIF instead. PowerPoint plays an animated GIF as a
    // picture, automatically and forever, with no timeline XML involved 闁?which
    // is exactly how the reference deck carries its own motion (2 embedded GIFs).
    // Bake the animated sub-elements (dashed flow, waveform) as their own small
    // looping GIFs. Text never enters a GIF, so type stays crisp while the
    // motion survives -- crisp AND animated, which is the whole point.
    const gifTargets = [];
    {
      const seen = new Set();
      groups.forEach((g, k) => (g.bits || []).forEach((b, j) => {
        // A canvas inside nested .aN layers is listed by BOTH groups; one GIF
        // covers it — the duplicate would be drawn twice in the deck.
        const key = [b.tag, Math.round(b.box.x), Math.round(b.box.y), Math.round(b.box.w), Math.round(b.box.h)].join(",");
        if (seen.has(key)) return;
        seen.add(key);
        gifTargets.push({ gk: k, j, box: b.box, text: b.text, tag: b.tag });
      }));
    }
    const dynIdx = gifTargets.map((_, i) => i);
    if (dynIdx.length && config.gif !== false) {
      const gifFrames = config.gif?.frames ?? 24;
      const gifInterval = config.gif?.intervalMs ?? 70;
      const gifLead = config.gif?.leadMs ?? 1500;
      const maxPeriod = config.gif?.maxPeriodMs ?? 6000;
      const hasCanvasBits = groups.some((g) => (g.bits || []).some((b) => /canvas/i.test(b.tag || "")));
      // 声明路径：动效按 loopMs 定帧与时长，不再"先录再猜"
      const declLoopMs = (() => {
        if (!declPlan || !mf.merged?.motion) return null;
        const owners = new Set();
        for (const g of groups) for (const b of (g.bits || [])) owners.add(b.owner || "");
        for (const m of mf.merged.motion) if (m.slide === n + 1) return m.loopMs;
        return null;
      })();
      // Enter WITH the entrance so keyframe loops and the deck's own JS start.
      // Step to a DIFFERENT page first: `go(n)` on the page that is already
      // current is a no-op (the deck compares the index), so the entrance class
      // is never re-added and CSS loops never start 閳?which silently produced
      // GIFs with zero motion.
      await evaluate(client, `window.__deckRender.goto(${n === 0 ? 1 : 0}); true`);
      await evaluate(client, `window.__deckRender.gotoAnimated(${n}); true`);
      await evaluate(client, `window.__deckRender.ready()`);
      // A canvas GIF must not bake its group's entrance (rise+fade) into the
      // loop, or every restart replays the rise. Wait the entrance out first.
      const leadMs = hasCanvasBits
        ? groups.reduce((m, g) => Math.max(m, g.delayMs), 0) + (config.groups?.duration ?? 500) + 100
        : gifLead;
      if (leadMs > 0) await new Promise((r) => setTimeout(r, leadMs));
      await evaluate(client, `window.__deckRender.freezeScale(); true`);

      for (const ti of dynIdx) {
        const target = gifTargets[ti];
        if (!target || !target.box) continue;
        await evaluate(
          client,
          `window.__restoreDyn = window.__deckRender.isolate((function(){ var bits = window.__deckRender.groupAnimatedBits(window.__deckRender.deckGroups(window.__deckRender.slides()[${n}])[${target.gk}]); var el = bits[${target.j}]; if (!el) return el; if (el.tagName === 'CANVAS') return window.__deckRender.canvasOwner(el); return el; })()); true`,
        );
        // ECharts reveals only play once at load; replay them so the GIF
        // actually captures the per-item pop-in (the successful deck's 2 GIFs
        // are exactly this).
        if (/canvas/i.test(target.tag || "")) {
          const gl = await evaluate(client, `(function(){ try { var c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch(e){ return 'err'; } })()`);
          console.log(`[render] p${n + 1} g${target.gk} bit${target.j}: WebGL=${gl}`);
          const replayed = await evaluate(
            client,
            `(function(){ var g = window.__deckRender.deckGroups(window.__deckRender.slides()[${n}])[${target.gk}];
               var bits = g ? window.__deckRender.groupAnimatedBits(g) : [];
               var el = bits[${target.j}];
               if (!el) return 'no-element';
               return window.__deckRender.replayCharts(el.closest('.slide') || document); })()`,
          );
          console.log(`[render] p${n + 1} g${target.gk} bit${target.j}: ${replayed} chart(s) replayed`);
        }
        await client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
        // A canvas GIF sits EXACTLY on its owning layer's rect with no padding:
        // the proven deck's page-7 GIF is 731.4,194.2,452.6x252 (the #threeAI
        // rect) and its page-10 GIF is 96,421.9,1088x96 (the .a6 rect).
        const clip = /canvas/i.test(target.tag || "")
          ? clipOf(target.box, W, H)
          : clipFor(target.box, 6, W, H);
        // Record exactly one period of the slowest infinite animation so the loop
        // is seamless. A fixed 1.7 s clip against a 14 s dash cycle made the line
        // jump on every restart -- the "inexplicable flicker".
        const periodMs = JSON.parse(
          await evaluate(
            client,
            `(function(){ var s = window.__deckRender.slides()[${n}]; var best = 0;
               window.__deckRender.deckGroups(s).forEach(function(g){
                 window.__deckRender.elsOf(g).forEach(function(el){
                   (el.getAnimations ? el.getAnimations({subtree:true}) : []).forEach(function(a){
                     var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
                     if (t.iterations === Infinity && t.duration > best) best = t.duration; }); }); });
               return JSON.stringify(Math.round(best)); })()`,
          ),
        );
        const isCanvas = /canvas/i.test(target.tag || "");
        // A chart's reveal is a one-shot JS animation of ~1.5 s, not a loop.
        const chartMs = config.gif?.chartMs ?? 6000;
        const wantMs = isCanvas ? chartMs : Math.min(periodMs > 0 ? periodMs : gifInterval * gifFrames, maxPeriod);
        const framesWanted = Math.max(2, Math.round(wantMs / gifInterval));
        if (periodMs > maxPeriod) {
          console.log(`[render] p${n + 1} g${target.gk} bit${target.j}: 循环周期 ${periodMs}ms 超过上限 ${maxPeriod}ms，录制被截断，接缝可能可见`);
        }
        const bufs = [];
        const delays = [];
        for (let f = 0; f < framesWanted; f++) {
          const t0 = Date.now();
          bufs.push(await screenshot(client, { format: "png", clip }));
          const spent = Date.now() - t0;
          // The screenshot itself costs ~90 ms. Sleeping a fixed 70 ms on top made
          // the real spacing ~160 ms while the GIF declared 70 ms, so playback ran
          // ~2.3x too fast. Sleep only the remainder and record the real spacing.
          const wait = Math.max(0, gifInterval - spent);
          delays.push(spent + wait);
          if (f < framesWanted - 1) await new Promise((r) => setTimeout(r, wait));
        }
        await client.call("Emulation.setDefaultBackgroundColorOverride", {});
        await evaluate(client, `window.__restoreDyn(); true`);

        const digest = (b) => createHash("sha1").update(b).digest("hex");
        const distinct = new Set([digest(bufs[0]), digest(bufs[Math.floor(bufs.length / 2)]), digest(bufs[bufs.length - 1])]).size;
        if (distinct <= 1) {
          // Flagged as dynamic but nothing actually moved (a <canvas> painted
          // once, say). Keep the crisp PNG layer instead of shipping a
          // pointless multi-frame GIF.
          console.log(`[render] p${n + 1} g${target.gk} bit${target.j}: no motion in ${gifFrames} frames 鈥?keeping the still layer`);
          await client.call("Emulation.setDefaultBackgroundColorOverride", {});
          await evaluate(client, `window.__restoreDyn(); true`);
          continue;
        }
        const file = rel(`bit-${target.gk}-${target.j}.gif`);
        let opaqueBase = null;
        const { PNG } = require("pngjs");
        if (/canvas/i.test(target.tag || "")) {
          // the base image is captured at captureScale; the clip is in logical px
          const sc = captureScale ?? 2;
          const basePng = PNG.sync.read(PNG.sync.write(stack));
          const first = PNG.sync.read(bufs[0]);
          const wpx = first.width, hpx = first.height;
          const bx0 = Math.round(clip.x * sc), by0 = Math.round(clip.y * sc);
          opaqueBase = Buffer.alloc(wpx * hpx * 4);
          for (let y = 0; y < hpx; y++) {
            const sy = by0 + y;
            if (sy < 0 || sy >= basePng.height) continue;
            for (let x = 0; x < wpx; x++) {
              const sx = bx0 + x;
              if (sx < 0 || sx >= basePng.width) continue;
              const o = (y * wpx + x) * 4, p = (sy * basePng.width + sx) * 4;
              opaqueBase[o] = basePng.data[p]; opaqueBase[o + 1] = basePng.data[p + 1];
              opaqueBase[o + 2] = basePng.data[p + 2]; opaqueBase[o + 3] = 255;
            }
          }
        }
        const count = encodeGif(bufs, delays, join(outDir, file), { opaqueBase });
        const bg = groups[target.gk];
        bg.bits[target.j] = Object.assign({}, bg.bits[target.j], { gif: file, gifFrames: count, gifMoves: true });
        const avg = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
        console.log(`[render] p${n + 1} g${target.gk} bit${target.j} (${target.tag}): ${count} frames @${avg}ms period=${periodMs || "n/a"}ms -> ${file}`);
      }
      // leave the page in its terminal state for whatever comes next
      await evaluate(client, `window.__deckRender.goto(${n}); true`);
    }

    shots.push({
      index: n,
      page: n + 1,
      hash,
      ref: rel("ref.png"),
      base: rel(baseFile),
      width: W,
      height: H,
      groups: groups.map((g, k) => {
        const lp = layerPaths[k];
        return {
          k,
          bits: g.bits,
          file: lp ? lp.file : null,
          dropped: g.dropped === true ? true : undefined,
          x: lp ? lp.box.x : g.box.x,
          y: lp ? lp.box.y : g.box.y,
          w: lp ? lp.box.w : g.box.w,
          h: lp ? lp.box.h : g.box.h,
          delayMs: g.delayMs,
          durationMs: g.durationMs,
          moveY: g.moveY,
          easing: g.easing,
          permanent: g.permanent,
          canvas: g.canvas,
          gif: g.gif,
          gifFrames: g.gifFrames,
          gifMoves: g.gifMoves,
          cls: g.cls,
          text: g.text,
        };
      }),
    });
    const kb = Object.values(layerPaths).reduce((a, l) => a + l.bytes, 0) / 1024;
    console.log(
      `[render] p${n + 1}/${total}: base + ${groups.length} alpha layers (${kb.toFixed(0)} KB)` +
        (groups.some((g) => g.permanent) ? "  [permanent motion detected]" : ""),
    );
  }
} finally {
  browser.close();
}

const manifest = {
  deckHash,
  html: htmlPath,
  width: W,
  height: H,
  generatedAt: new Date().toISOString(),
  settings: {
    chrome: config.chrome ?? [],
    groups: config.groups ?? {},
    captureScale,
    goto: config.goto ?? "window.__slideInfo.go",
  },
  slides: shots.sort((a, b) => a.index - b.index),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1), "utf8");

const permanent = manifest.slides.flatMap((s) => s.groups.filter((g) => g.permanent).map((g) => `p${s.page}/g${g.k}`));
console.log(`\n[render] ${manifest.slides.length} slides -> ${manifestPath}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (permanent.length) {
  console.log(
    `[render] WARNING ${permanent.length} group(s) carry infinite CSS animation: ${permanent.join(", ")}\n` +
      `         PowerPoint's timeline cannot express an endless loop; these become a static frame.\n` +
      `         Bake them to an animated GIF/MP4 if the loop must survive.`,
  );
}
