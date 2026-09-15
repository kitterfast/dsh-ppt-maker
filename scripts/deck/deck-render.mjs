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
const W = config.width ?? 1280;
const H = config.height ?? 720;

/** Bump when the capture logic changes, so stale caches are never reused. */
const RENDERER_VERSION = "25";

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

/** Hash decides whether a slide can be reused. Config participates, so changing
 *  a delay or a chrome selector invalidates the cache too. */
const deckHash = createHash("sha256")
  .update(RENDERER_VERSION)
  .update(readFileSync(htmlPath))
  .update(JSON.stringify(config))
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

/** Clip rect clamped into the viewport, padded so box-shadows survive. */
function clipFor(box, pad, W, H) {
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  const right = Math.min(W, Math.ceil(box.x + box.w + pad));
  const bottom = Math.min(H, Math.ceil(box.y + box.h + pad));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

// ---------------------------------------------------------------------- render

const pad = config.capturePad ?? 2;
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
    const r = spawnSync(process.execPath, [fileURLToPath(new URL("./tools/extract-anim-spec.mjs", import.meta.url)), htmlPath, "--check"], { encoding: "utf8" });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.status !== 0) { if (r.stderr) process.stderr.write(r.stderr); process.exit(1); }
  }

  const total = await evaluate(client, `window.__deckRender.slides().length`);
  if (!total) throw new Error(`no slides matched ${config.slide ?? ".slide"}`);
  console.log(`[render] ${total} slides, deck hash ${deckHash}`);

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
           var gs = window.__deckRender.groups(s);
           s.classList.add('anim');
           var out = gs.map(function(g){
             var an = (g.getAnimations ? g.getAnimations({ subtree: true }) : []);
             return {
               permanent: an.some(function(a){ var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; return t.iterations === Infinity; }),
               canvas: window.__deckRender.hasCanvas(g)
             };
           });
           s.classList.remove('anim');
           void s.offsetWidth;
           return JSON.stringify(out);
         })()`,
      ),
    );
    await evaluate(client, `window.__deckRender.goto(${n}); true`);
    await evaluate(client, `window.__deckRender.ready()`);
    await new Promise((r) => setTimeout(r, settleMs));
    await evaluate(client, `window.__deckRender.freezeScale(); true`);
    const stableAfter = await waitStable(client);
    if (stableAfter < 0) console.log(`[render] p${n + 1}: WARNING page never stopped changing; captures may disagree`);

    const shape = await evaluate(
      client,
      `(function(){
         var s = window.__deckRender.slides()[${n}];
         var gs = window.__deckRender.groups(s);
         return JSON.stringify(gs.map(function(g){ var d = window.__deckRender.describe(g); var b = window.__deckRender.inkBox(g);
           return { box: b, text: d.text, cls: d.cls }; }));
       })()`,
    );
    const groups = JSON.parse(shape);
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
      g.durationMs = config.groups?.duration ?? 500;
      g.moveY = config.groups?.moveY ?? 14;
      g.easing = config.groups?.easing ?? [0.22, 0.61, 0.36, 1];
    });

    // Describe the animated sub-elements of every group, so the crisp PNG layer
    // can be captured WITHOUT them and each one can be baked as its own GIF.
    const __rawBits = await evaluate(
        client,
        `(function(){ var s = window.__deckRender.slides()[${n}];
           var gs = window.__deckRender.groups(s);
           // The loop animations only exist while .anim is applied (the same
           // trap as the permanent-motion probe): without it every getAnimations()
           // call returns nothing and no animated sub-element is ever found.
           // Per-group scan, NOT the merged slide scan: a canvas inside NESTED
           // .aN groups (like .a4 wrapping #threeAI.a4) landed in every ancestor
           // group's list before, producing duplicate "phantom" bits per group.
           s.classList.add('anim');
           var res = JSON.stringify(gs.map(function(g){
             return window.__deckRender.animatedBits(g)
               .map(function(b){ var d = window.__deckRender.describe(b); var x = window.__deckRender.inkBox(b);
                 return { box: x, text: d.text, tag: d.cls }; }); }));
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
    if (!force && prev && prev.hash === hash && prev.groups.every((g) => existsSync(join(outDir, g.file))) && existsSync(join(outDir, prev.base)) && existsSync(join(outDir, prev.ref))) {
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
           var g = window.__deckRender.groups(s)[${k}];
           window.__restore = window.__deckRender.isolate(g);
           // When the slide has a nested canvas owner (e.g. #threeAI.a4 inside
           // .a4), an ancestor group's own capture must not keep the ink of its
           // descendant groups -- the GIF and the child layers carry it, and a
           // copy here would double both the pixels and the entrance timing.
           var owners = window.__deckRender.nestedOwners(s);
           if (owners.length) {
             var gs = window.__deckRender.groups(s), extra = [];
             for (var i = 0; i < gs.length; i++) {
               if (gs[i] !== g && g.contains(gs[i])) extra.push(gs[i]);
             }
             window.__restoreExtra = extra.length ? window.__deckRender.hideAll(extra) : null;
           } else window.__restoreExtra = null;
           return true;
         })()`,
      );
      await client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const clip = clipFor(groups[k].box, pad, W, H);
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
      {
        const layer = PNG2.sync.read(png);
        const rw = layer.width, rh = layer.height;
        const rx = Math.round(clip.x * sc), ry = Math.round(clip.y * sc);
        const out2 = new PNG2({ width: rw, height: rh });
        for (let y = 0; y < rh; y++) {
          const sy = ry + y;
          if (sy < 0 || sy >= stack.height) continue;
          for (let x = 0; x < rw; x++) {
            const sx = rx + x;
            if (sx < 0 || sx >= stack.width) continue;
            const o = (y * rw + x) * 4, p = (sy * stack.width + sx) * 4;
            const al = layer.data[o + 3] / 255;
            out2.data[o] = Math.round(layer.data[o] * al + stack.data[p] * (1 - al));
            out2.data[o + 1] = Math.round(layer.data[o + 1] * al + stack.data[p + 1] * (1 - al));
            out2.data[o + 2] = Math.round(layer.data[o + 2] * al + stack.data[p + 2] * (1 - al));
            out2.data[o + 3] = 255;
            stack.data[p] = out2.data[o];
            stack.data[p + 1] = out2.data[o + 1];
            stack.data[p + 2] = out2.data[o + 2];
            stack.data[p + 3] = 255;
          }
        }
        writeFileSync(join(outDir, file), PNG2.sync.write(out2));
      }
      layerPaths[k] = { k, file, clip, bytes: png.length };
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
          `window.__restoreDyn = window.__deckRender.isolate((function(){ var bits = window.__deckRender.animatedBits(window.__deckRender.groups(window.__deckRender.slides()[${n}])[${target.gk}]); var el = bits[${target.j}]; if (!el) return el; if (el.tagName === 'CANVAS' && window.__deckRender.nestedCanvas(el)) return window.__deckRender.canvasOwner(el); return el; })()); true`,
        );
        // ECharts reveals only play once at load; replay them so the GIF
        // actually captures the per-item pop-in (the successful deck's 2 GIFs
        // are exactly this).
        if (/canvas/i.test(target.tag || "")) {
          const gl = await evaluate(client, `(function(){ try { var c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch(e){ return 'err'; } })()`);
          console.log(`[render] p${n + 1} g${target.gk} bit${target.j}: WebGL=${gl}`);
          const replayed = await evaluate(
            client,
            `(function(){ var g = window.__deckRender.groups(window.__deckRender.slides()[${n}])[${target.gk}];
               var bits = g ? window.__deckRender.animatedBits(g) : [];
               var el = bits[${target.j}];
               if (!el) return 'no-element';
               return window.__deckRender.replayCharts(el.closest('.slide') || document); })()`,
          );
          console.log(`[render] p${n + 1} g${target.gk} bit${target.j}: ${replayed} chart(s) replayed`);
        }
        await client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
        const clip = clipFor(
          /canvas/i.test(target.tag || "") ? { x: target.box.x, y: target.box.y, w: target.box.w, h: target.box.h } : target.box,
          6,
          W,
          H,
        );
        // Record exactly one period of the slowest infinite animation so the loop
        // is seamless. A fixed 1.7 s clip against a 14 s dash cycle made the line
        // jump on every restart -- the "inexplicable flicker".
        const periodMs = JSON.parse(
          await evaluate(
            client,
            `(function(){ var s = window.__deckRender.slides()[${n}]; var best = 0;
               window.__deckRender.groups(s).forEach(function(g){
                 (g.getAnimations ? g.getAnimations({subtree:true}) : []).forEach(function(a){
                   var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
                   if (t.iterations === Infinity && t.duration > best) best = t.duration; }); });
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
          x: lp ? lp.clip.x : Math.round(g.box.x),
          y: lp ? lp.clip.y : Math.round(g.box.y),
          w: lp ? lp.clip.width : Math.round(g.box.w),
          h: lp ? lp.clip.height : Math.round(g.box.h),
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
