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
const RENDERER_VERSION = "10";

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
function encodeGif(frameBuffers, delayMs, outPath) {
  const { GIFEncoder, quantize, applyPalette } = require("gifenc");
  const { PNG } = require("pngjs");
  const frames = frameBuffers.map((b) => PNG.sync.read(b));
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
    const opts = { palette, delay: delayMs, transparent: true, transparentIndex: 255, dispose: 2 };
    if (i === 0) opts.repeat = 0; // loop forever
    gif.writeFrame(idx, w, h, opts);
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
const browser = await launchHeadless({ width: W, height: H });
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
  await evaluate(client, `window.__deckRender.ready()`);
  await evaluate(client, `window.__deckRender.freezeScale(); true`);

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
      g.delayMs = delays[k] ?? (delays[delays.length - 1] + (k - delays.length + 1) * fallbackStep);
      g.durationMs = config.groups?.duration ?? 500;
      g.moveY = config.groups?.moveY ?? 14;
      g.easing = config.groups?.easing ?? [0.22, 0.61, 0.36, 1];
    });

    const hash = createHash("sha256")
      .update(deckHash)
      .update(JSON.stringify({ n, groups: groups.map((g) => [g.box, g.delayMs, g.text]) }))
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
      `window.__restoreBase = window.__deckRender.hideAll(window.__deckRender.groups(window.__deckRender.slides()[${n}])); true`,
    );
    const baseFile = config.baseFormat === "jpeg" ? "base.jpg" : "base.png";
    writeFileSync(
      join(slideDir, baseFile),
      await screenshot(client, config.baseFormat === "jpeg" ? { format: "jpeg", quality: baseQuality } : { format: "png" }),
    );
    await evaluate(client, `window.__restoreBase(); true`);

    // --- one true-alpha PNG per animation group
    const layerPaths = [];
    for (let k = 0; k < groups.length; k++) {
      await evaluate(
        client,
        `(function(){
           var s = window.__deckRender.slides()[${n}];
           var g = window.__deckRender.groups(s)[${k}];
           window.__restore = window.__deckRender.isolate(g);
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
      await evaluate(client, `window.__restore(); true`);
      const file = rel(`g${k}.png`);
      writeFileSync(join(outDir, file), png);
      layerPaths.push({ k, file, clip, bytes: png.length });
    }

    // --- permanent motion -> a looping GIF layer ---------------------------
    //
    // A PowerPoint timeline cannot express an endless loop, so any group that
    // keeps moving (CSS `infinite`, or a script-driven <canvas>) is recorded as
    // one looping animated GIF instead. PowerPoint plays an animated GIF as a
    // picture, automatically and forever, with no timeline XML involved 闁?which
    // is exactly how the reference deck carries its own motion (2 embedded GIFs).
    const dynIdx = groups.map((_, k) => k).filter((k) => groups[k].permanent || groups[k].canvas);
    if (dynIdx.length && config.gif !== false) {
      const gifFrames = config.gif?.frames ?? 24;
      const gifInterval = config.gif?.intervalMs ?? 70;
      const gifLead = config.gif?.leadMs ?? 1500;
      // Enter WITH the entrance so keyframe loops and the deck's own JS start.
      // Step to a DIFFERENT page first: `go(n)` on the page that is already
      // current is a no-op (the deck compares the index), so the entrance class
      // is never re-added and CSS loops never start 閳?which silently produced
      // GIFs with zero motion.
      await evaluate(client, `window.__deckRender.goto(${n === 0 ? 1 : 0}); true`);
      await evaluate(client, `window.__deckRender.gotoAnimated(${n}); true`);
      await evaluate(client, `window.__deckRender.ready()`);
      await new Promise((r) => setTimeout(r, gifLead));
      await evaluate(client, `window.__deckRender.freezeScale(); true`);

      for (const k of dynIdx) {
        await evaluate(
          client,
          `window.__restoreDyn = window.__deckRender.isolate(window.__deckRender.groups(window.__deckRender.slides()[${n}])[${k}]); true`,
        );
        await client.call("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
        const clip = clipFor(groups[k].box, pad, W, H);
        const bufs = [];
        for (let f = 0; f < gifFrames; f++) {
          bufs.push(await screenshot(client, { format: "png", clip }));
          await new Promise((r) => setTimeout(r, gifInterval));
        }
        await client.call("Emulation.setDefaultBackgroundColorOverride", {});
        await evaluate(client, `window.__restoreDyn(); true`);

        const digest = (b) => createHash("sha1").update(b).digest("hex");
        const distinct = new Set([digest(bufs[0]), digest(bufs[Math.floor(bufs.length / 2)]), digest(bufs[bufs.length - 1])]).size;
        if (distinct <= 1) {
          // Flagged as dynamic but nothing actually moved (a <canvas> painted
          // once, say). Keep the crisp PNG layer instead of shipping a
          // pointless multi-frame GIF.
          groups[k].gifMoves = false;
          console.log(`[render] p${n + 1} g${k}: no motion in ${gifFrames} frames 鈥?keeping the still layer`);
          continue;
        }
        const file = rel(`g${k}.gif`);
        const count = encodeGif(bufs, gifInterval, join(outDir, file));
        groups[k].gif = file;
        groups[k].gifFrames = count;
        groups[k].gifMoves = true;
        console.log(`[render] p${n + 1} g${k}: ${count}-frame looping GIF -> ${file}`);
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
      groups: groups.map((g, k) => ({
        k,
        file: layerPaths[k].file,
        x: layerPaths[k].clip.x,
        y: layerPaths[k].clip.y,
        w: layerPaths[k].clip.width,
        h: layerPaths[k].clip.height,
        delayMs: g.delayMs,
        durationMs: g.durationMs,
        moveY: g.moveY,
        easing: g.easing,
        permanent: g.permanent,
        canvas: g.canvas,
        gif: g.gif,
        gifFrames: g.gifFrames,
        gifMoves: g.gifMoves,
        text: g.text,
      })),
    });
    const kb = layerPaths.reduce((a, l) => a + l.bytes, 0) / 1024;
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
