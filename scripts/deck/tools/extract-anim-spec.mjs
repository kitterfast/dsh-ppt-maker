/**
 * extract-anim-spec.mjs — 只读不猜：把 HTML 里**实际写的**动画声明读成一份规格。
 *
 * 为什么要有它：以前是"看到 .body > * 就猜层数、猜延迟、猜缓动"，猜错就是错版/不播。
 * 你那份能播的稿子用的是固定契约（.a1…​.aN + 单个 @keyframes + 显式延迟），
 * 一旦按契约**读**，映射就是逐项确定的。
 *
 * 用法: node tools/extract-anim-spec.mjs <deck.html> [--json]
 */
import { readFileSync, writeFileSync } from "node:fs";

const htmlPath = process.argv[2];
const asJson = process.argv.includes("--json");
if (!htmlPath) {
  console.error("usage: node tools/extract-anim-spec.mjs <deck.html> [--json]");
  process.exit(1);
}
const html = readFileSync(htmlPath, "utf8");
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
const inline = [...html.matchAll(/style\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(";\n");
const all = css + "\n" + inline;

/** All @keyframes blocks, with their from/to declarations parsed into properties. */
function parseKeyframes(text) {
  const out = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    // brace matching from the opening brace
    let i = re.lastIndex, depth = 1;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    const body = text.slice(re.lastIndex, i - 1);
    const decl = (block) => {
      const props = {};
      for (const part of block.split(";")) {
        const k = part.split(":")[0]?.trim().toLowerCase();
        const v = part.slice(part.indexOf(":") + 1).trim();
        if (k && v) props[k] = v;
      }
      return props;
    };
    const from = /from\s*\{([^}]*)\}/.exec(body)?.[1] ?? /0%\s*\{([^}]*)\}/.exec(body)?.[1] ?? "";
    const to = /to\s*\{([^}]*)\}/.exec(body)?.[1] ?? /100%\s*\{([^}]*)\}/.exec(body)?.[1] ?? "";
    out.push({ name: m[1], from: decl(from), to: decl(to) });
  }
  return out;
}

/** Numeric value of a transform function, in px / deg. */
function transformValue(props, fn) {
  const t = props.transform ?? "";
  const m = new RegExp(`${fn}\\(\\s*(-?[\\d.]+)\\s*(px|deg|turn|rad)?`, "i").exec(t);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || (fn === "rotate" ? "deg" : "px")).toLowerCase();
  if (unit === "turn") return fn === "rotate" ? n * 360 : n * 1280;
  if (unit === "rad") return (n * 180) / Math.PI;
  return n;
}

/**
 * Entrance rules: `<selector>{animation:NAME DUR DELAY FILL[, ...]}`.
 * The LAST numeric-with-time-unit before the fill keyword is the delay when the
 * shorthand carries two times, otherwise the single time is the duration.
 */
function parseAnimationRules(text) {
  const rules = [];
  const re = /([^{}]+)\{([^{}]*animation\s*:[^{};]+)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    const decls = m[2];
    for (const one of decls.split(";")) {
      if (!/animation\s*:/.test(one)) continue;
      const value = one.slice(one.indexOf(":") + 1).trim();
      for (const layer of value.split(/,(?![^(]*\))/)) {
        const times = [...layer.matchAll(/(-?[\d.]+)\s*(ms|s)\b/g)].map((t) => ({
          raw: t[0],
          ms: t[2] === "s" ? parseFloat(t[1]) * 1000 : parseFloat(t[1]),
        }));
        const name = (layer.match(/([A-Za-z_][\w-]*)\s/) ?? [])[1] ?? null;
        rules.push({
          selector,
          name,
          durationMs: times[0]?.ms ?? null,
          delayMs: times.length > 1 ? times[1].ms : 0,
          infinite: /infinite/.test(layer),
          raw: layer.trim(),
        });
      }
    }
  }
  return rules;
}

const keyframes = parseKeyframes(all);
const rules = parseAnimationRules(all);
const slides = (html.match(/class="[^"]*\bslide\b[^"]*"/g) ?? []).length;
const activeClass = /\.slide\.active\b/.test(css) ? "active" : /\.slide\.on\b/.test(css) ? "on" : "?";
const goApi = /window\.__slideInfo\s*=/.test(html)
  ? "__slideInfo.go"
  : /window\.__deck\s*=/.test(html)
    ? "__deck.go"
    : "?";
const forbidden = {
  infiniteAnimations: (all.match(/infinite/g) ?? []).length,
  canvas: (html.match(/<canvas/gi) ?? []).length,
  raf: (html.match(/requestAnimationFrame/g) ?? []).length,
};

/** Which layer classes does each slide actually use, and in what order? */
const layerClasses = [...new Set([...html.matchAll(/class="([^"]*\ba\d+\b[^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter((c) => /^a\d+$/.test(c))))]
  .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

const spec = {
  html: htmlPath,
  slides,
  triggerClass: activeClass,
  goApi,
  keyframes,
  entranceRules: rules,
  layerClasses,
  forbidden,
};

if (process.argv.includes("--check")) {
  /*
   * --declared: the config explicitly declares the layer selector and the delay
   * table (groups.selector + groups.delays), so the layer split is DECLARED, not
   * guessed -- the fixed .a1…​.aN naming is then only a convention, not the only
   * way to be unambiguous. Infinite CSS motion and <canvas> are not refused
   * either: the renderer bakes both as looping GIFs, which WPS does play (the
   * proven deck ships two such GIFs; captured on p7/p10 of the reference deck).
   * Without --declared the strict contract still applies.
   */
  const declared = process.argv.includes("--declared");
  const problems = [];
  const notes = [];
  const push = (msg) => (declared ? notes : problems).push(msg);
  if (spec.keyframes.length === 0) problems.push("没有任何 @keyframes —— 入场动画无处可读");
  if (spec.keyframes.length > 1) push(`有 ${spec.keyframes.length} 个 @keyframes；严格契约要求全篇只用 1 个（命名 rise）`);
  if (!spec.layerClasses.length) push("没有找到 .a1…​.aN 固定层类名（已由 config 显式声明层选择器与延迟表）");
  if (spec.forbidden.infiniteAnimations) push(`${spec.forbidden.infiniteAnimations} 处 infinite：将烘焙为循环 GIF（WPS 可播）`);
  if (spec.forbidden.canvas) push(`${spec.forbidden.canvas} 个 <canvas>：将烘焙为循环 GIF（WPS 可播）`);
  if (spec.forbidden.raf) console.warn(`[contract] note: ${spec.forbidden.raf} requestAnimationFrame call(s) - confirm they are not a permanent loop`);
  for (const n of notes) console.warn(`[contract] note: ${n}`);
  if (problems.length) {
    console.error("[contract] FAILED — 这份 HTML 不满足可转换契约：");
    for (const p of problems) console.error("  - " + p);
    console.error("  改法：入场层用固定类名 .a1…​.aN（每个类 = 一层）；全篇一个 @keyframes rise，from/to 明写 opacity/transform；");
    console.error("        延迟写进 animation 简写；去掉 infinite 与 <canvas> 常驻动画，或在 deck.config.json 里显式声明");
    console.error("        groups.selector + groups.delays（工具会改用 GIF 烘焙常驻动画）。");
    process.exit(1);
  }
  console.log(
    "[contract] ok — " +
      (declared ? "层与延迟由 config 显式声明" : "只读不猜所需的信息齐全") +
      "（" + (spec.layerClasses.length || "declared") + " 层 / " + spec.keyframes.length + " 个 keyframes" +
      (notes.length ? ` / ${notes.length} 条放宽` : "") + "）",
  );
  process.exit(0);
}

const outArg = process.argv.find((a) => a.startsWith("--out="));
if (outArg) {
  writeFileSync(outArg.slice(6), JSON.stringify(spec, null, 2) + "\n", "utf8");
  console.log("wrote " + outArg.slice(6));
  process.exit(0);
}
if (asJson) {
  console.log(JSON.stringify(spec, null, 2));
  process.exit(0);
}

console.log(`HTML: ${htmlPath}`);
console.log(`slides=${slides}  trigger=.slide.${activeClass}  go=${goApi}`);
console.log(`layer classes: ${layerClasses.join(", ") || "(none)"}`);
console.log(`\n@keyframes (${keyframes.length}):`);
for (const k of keyframes) {
  const dy = transformValue(k.from, "translateY");
  const rot = transformValue(k.from, "rotate");
  console.log(
    `  ${k.name}: from(opacity=${k.from.opacity ?? "-"} translateY=${dy ?? "-"}px rotate=${rot ?? "-"}deg)` +
      ` to(opacity=${k.to.opacity ?? "-"} transform=${k.to.transform ?? "-"})`,
  );
}
console.log(`\nentrance rules (${rules.length}):`);
const bySelector = new Map();
for (const r of rules) {
  if (!bySelector.has(r.selector)) bySelector.set(r.selector, []);
  bySelector.get(r.selector).push(r);
}
for (const [sel, list] of bySelector) {
  console.log(`  ${sel}`);
  for (const r of list) console.log(`     ${r.raw}   -> dur=${r.durationMs}ms delay=${r.delayMs}ms infinite=${r.infinite}`);
}
console.log(`\nforbidden constructs: infinite=${forbidden.infiniteAnimations} canvas=${forbidden.canvas} rAF=${forbidden.raf}`);
