/**
 * bake-anim.mjs — 把 HTML 的动画逐帧烘成"入场覆盖层 GIF"。
 *
 * 为什么不是原生时间轴：PowerPoint 只能**近似**任何一种 CSS 动画，而且能不能播
 * 还要看播放器脸色（这条路上已经失败三次）。唯一能做到"与 HTML 完全一致"的构造是
 * **不要让 PowerPoint 演绎，直接把 HTML 的渲染录下来**。
 *
 * 精确性来自一个恒等式，而不是"看起来差不多"：
 *
 *     终态图 final（清晰、24 位）
 *   + 覆盖层 GIF 的第 t 帧 F_t（只在 F_t != final 的像素上不透明，其余全透明）
 *   = F_t   （逐像素相等）
 *
 * 因为不透明的像素取的就是 F_t 本身，透明的像素露出 final，而那里 F_t == final。
 * 所以合成结果**恒等于**浏览器那一帧的渲染 —— 不是近似。
 *
 * 播放行为：GIF 循环，但结尾补 N 帧"全透明"的静止帧（delta 编码后几乎不占体积）。
 * 于是静止时露出清晰底图，重播周期被拉到几十秒，现场翻页看不到重播。
 *
 * 用法: node bake-anim.mjs deck.config.json [--pages=1,6] [--fps=15] [--hold=12]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { evaluate, launchHeadless, screenshot } from "./lib/browser.mjs";

const args = process.argv.slice(2);
const configPath = resolve(args.find((a) => !a.startsWith("--")) ?? "deck.config.json");
const pagesArg = args.find((a) => a.startsWith("--pages="));
const only = pagesArg ? new Set(pagesArg.slice(8).split(",").map((n) => Number(n.trim()) - 1)) : null;
const fps = Number(args.find((a) => a.startsWith("--fps="))?.slice(6) ?? 15);
const holdFrames = Number(args.find((a) => a.startsWith("--hold="))?.slice(7) ?? 12);

const config = JSON.parse(readFileSync(configPath, "utf8"));
const projectRoot = dirname(configPath);
const require = createRequire(join(projectRoot, "package.json"));
const { GIFEncoder, quantize, applyPalette } = require("gifenc");
const { PNG } = require("pngjs");
const htmlPath = resolve(projectRoot, config.html);
const outDir = resolve(projectRoot, config.out ?? "render");
const manifestPath = join(outDir, "manifest.json");
const W = config.width ?? 1280;
const H = config.height ?? 720;

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const interval = Math.round(1000 / fps);
const rampMs = config.bake?.rampMs ?? 1300; // 覆盖入场（最晚延迟 500 + 时长 500 + 余量）
const steps = Math.ceil(rampMs / interval);
const diffThreshold = config.bake?.threshold ?? 8;

const HELPERS = readFileSync(new URL("./lib/page-helpers.js", import.meta.url), "utf8");

/** 与终态不同的像素才不透明，其余全透明 —— 合成回去恒等于该帧。 */
function overlayFrame(frame, finalPng, threshold) {
  const w = frame.width, h = frame.height;
  const out = new PNG({ width: w, height: h });
  let inkPixels = 0;
  for (let p = 0; p < w * h; p++) {
    const o = p * 4;
    const d = Math.max(
      Math.abs(frame.data[o] - finalPng.data[o]),
      Math.abs(frame.data[o + 1] - finalPng.data[o + 1]),
      Math.abs(frame.data[o + 2] - finalPng.data[o + 2]),
    );
    if (d > threshold) {
      out.data[o] = frame.data[o];
      out.data[o + 1] = frame.data[o + 1];
      out.data[o + 2] = frame.data[o + 2];
      out.data[o + 3] = 255;
      inkPixels++;
    }
  }
  return { png: out, inkRatio: inkPixels / (w * h) };
}

function encodeLoopingGif(frames, delayMs, outPath) {
  const sample = Buffer.concat(frames.filter((_, i) => i % 2 === 0).map((f) => f.data));
  const palette255 = quantize(new Uint8Array(sample), 255, { format: "rgb565" });
  const palette = palette255.concat([[0, 0, 0]]);
  const gif = GIFEncoder();
  frames.forEach((f, i) => {
    const rgba = new Uint8Array(f.data);
    const idx = applyPalette(rgba, palette255, "rgb565");
    for (let p = 0; p < idx.length; p++) if (rgba[p * 4 + 3] < 128) idx[p] = 255;
    const opts = { palette, delay: delayMs, transparent: true, transparentIndex: 255, dispose: 2 };
    if (i === 0) opts.repeat = 0;
    gif.writeFrame(idx, frames[0].width, frames[0].height, opts);
  });
  gif.finish();
  writeFileSync(outPath, Buffer.from(gif.bytes()));
}

const browser = await launchHeadless({ width: W, height: H });
const client = browser.client;
const report = [];

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

  const total = await evaluate(client, `window.__deckRender.slides().length`);
  for (let n = 0; n < total; n++) {
    if (only && !only.has(n)) continue;
    const slide = manifest.slides.find((s) => s.index === n);
    if (!slide) continue;
    const finalPng = PNG.sync.read(readFileSync(join(outDir, slide.ref)));

    // 站在别的页，再带动画进来 —— go(n) 对当前页是空操作
    await evaluate(client, `window.__deckRender.goto(${n === 0 ? 1 : 0}); true`);
    await evaluate(client, `window.__deckRender.gotoAnimated(${n}); true`);
    await evaluate(client, `window.__deckRender.freezeScale(); true`);

    const frames = [];
    for (let i = 0; i <= steps; i++) {
      const raw = PNG.sync.read(await screenshot(client, { format: "png" }));
      frames.push(overlayFrame(raw, finalPng, diffThreshold).png);
      if (i < steps) await new Promise((r) => setTimeout(r, interval));
    }
    const ink = frames.map((f) => {
      let c = 0;
      for (let p = 3; p < f.data.length; p += 4) if (f.data[p] > 0) c++;
      return c / (f.width * f.height);
    });
    // 结尾补全透明静止帧：拉长重播周期，静止时露出清晰底图
    const blank = new PNG({ width: W, height: H });
    for (let i = 0; i < holdFrames; i++) frames.push(blank);

    const rel = `p${String(n + 1).padStart(2, "0")}/enter.gif`;
    encodeLoopingGif(frames, interval, join(outDir, rel));
    slide.enterGif = rel;
    slide.enterFrames = steps + 1;
    const bytes = readFileSync(join(outDir, rel)).length;
    report.push({ page: n + 1, rel, frames: steps + 1, bytes, inkMax: Math.max(...ink), inkLast: ink[ink.length - 1] });
    console.log(
      `[bake] p${n + 1}: ${steps + 1} frames +${holdFrames} hold -> ${rel} (${(bytes / 1024).toFixed(0)} KB)  ` +
        `ink ${(Math.min(...ink) * 100).toFixed(1)}%→${(ink[ink.length - 1] * 100).toFixed(1)}%`,
    );
  }
} finally {
  browser.close();
}

for (const r of report) {
  const s = manifest.slides.find((x) => x.page === r.page);
  if (s) { s.enterGif = r.rel; s.enterFrames = r.frames; }
}
manifest.bakedAt = new Date().toISOString();
manifest.bake = { fps, rampMs, holdFrames, threshold: diffThreshold };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1), "utf8");
const totalKb = report.reduce((a, r) => a + r.bytes, 0) / 1024;
console.log(`\n[bake] ${report.length} slides -> ${(totalKb / 1024).toFixed(1)} MB total`);
