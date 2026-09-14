/**
 * deck-to-pptx.mjs — turn a render manifest into a PPTX with a native timeline.
 *
 * Fixes the two defects that made the 2026-09-14 deck unusable:
 *
 *   1. ANIMATIONS TARGETED THE WRONG SHAPES. The old post-pass collected shape
 *      ids with `matchAll(/<p:cNvPr id="(\d+)"/g)` and used `ids[0]` as the
 *      picture. But every slide's first `<p:cNvPr>` is the slide's OWN group
 *      shape (`<p:nvGrpSpPr><p:cNvPr id="1">`), so every animation was shifted
 *      by one: the full-bleed background picture received a *text* entrance
 *      (which sets `style.visibility`, so the page started blank) and the last
 *      text box received nothing. Here ids are resolved by NAME from the
 *      generated XML — no positional guessing anywhere.
 *
 *   2. THE ANIMATED LAYERS WERE NEVER PLACED. The builder added only the base
 *      image; `manifest.groups` was written but never drawn, so nothing existed
 *      to animate. Here every alpha layer becomes a real picture at exact EMU
 *      coordinates and is animated by name.
 *
 * Text fidelity: slide bodies are rasterised, so layout is identical by
 * construction. The text itself is preserved as picture alt-text and in the
 * slide notes, so nothing is lost for search/copy.
 *
 * Usage: node deck-to-pptx.mjs [deck.config.json] [--out=deck.pptx]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const configPath = resolve(args.find((a) => !a.startsWith("--")) ?? "deck.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const projectRoot = dirname(configPath);
const outDir = resolve(projectRoot, config.out ?? "render");
const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));

// --- animation spec: read, never guess -------------------------------------
// Layer count / delay / translate / rotate / duration come from what the HTML
// actually declares. A config value is only a fallback for decks that predate
// the contract.
const specPath = resolve(projectRoot, config.animSpec ?? "anim-spec.json");
const spec = existsSync(specPath) ? JSON.parse(readFileSync(specPath, "utf8")) : null;
const kf = spec?.keyframes?.find((k) => k.name === "rise") ?? spec?.keyframes?.[0] ?? null;
const tf = (props, fn) => {
  const t = props?.transform ?? "";
  const m = new RegExp(fn + "\\(\\s*(-?[\\d.]+)\\s*(px|deg|turn)?", "i").exec(t);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || (fn === "rotate" ? "deg" : "px")).toLowerCase();
  return unit === "turn" ? (fn === "rotate" ? n * 360 : n * 1280) : n;
};
const specMoveY = kf ? Math.abs(tf(kf.from, "translateY") ?? config.groups?.moveY ?? 14) : null;
const specRotDeg = kf ? tf(kf.from, "rotate") : null;
const specDuration = spec?.entranceRules?.find((r) => r.durationMs)?.durationMs ?? null;
const specLayerDelays = (() => {
  if (!spec?.entranceRules?.length) return null;
  const out = [];
  for (const r of spec.entranceRules) {
    const m = /\.a(\d+)\s*$/.exec(r.selector.replace(/\s+/g, " ").trim());
    if (m && !r.infinite) out[Number(m[1]) - 1] = r.delayMs;
  }
  return out.filter((x) => x !== undefined).length ? out : null;
})();

// 12192000 EMU / 1280 px == 6858000 EMU / 720 px == 9525 EMU per px  ->  px/96 inch.
const SLIDE_W_EMU = 12192000;
const SLIDE_H_EMU = 6858000;
const EMU_PER_PX = SLIDE_W_EMU / manifest.width;
const inch = (px) => (px * EMU_PER_PX) / 914400;

const pptxOut = resolve(
  projectRoot,
  args.find((a) => a.startsWith("--out="))?.slice(6) ?? config.pptx ?? "deck.pptx",
);

if ((manifest.height / manifest.width).toFixed(4) !== (SLIDE_H_EMU / SLIDE_W_EMU).toFixed(4)) {
  throw new Error(`manifest ${manifest.width}x${manifest.height} is not 16:9; refusing to stretch`);
}

const require = createRequire(join(projectRoot, "package.json"));
let PptxGenJS, JSZip;
try {
  PptxGenJS = require("pptxgenjs");
  JSZip = require("jszip");
} catch (error) {
  throw new Error(
    `pptxgenjs/jszip not resolvable from ${projectRoot}: ${error.message}\n` +
      `Run: npm i pptxgenjs jszip   (in the project root)`,
  );
}

// ------------------------------------------------------------------ 1. pictures

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "DECK16x9", width: SLIDE_W_EMU / 914400, height: SLIDE_H_EMU / 914400 });
pptx.layout = "DECK16x9";
pptx.title = config.title ?? "Deck";
pptx.author = "dsh-ppt-maker";

for (const slide of manifest.slides) {
  const s = pptx.addSlide();
  const base = join(outDir, slide.base);
  if (!existsSync(base)) throw new Error(`missing base image ${base}`);
  s.addImage({ path: base, x: 0, y: 0, w: inch(manifest.width), h: inch(manifest.height), objectName: "base" });

  for (const g of slide.groups) {
    // A group with permanent motion ships as a looping GIF instead of a still:
    // PowerPoint plays an animated GIF automatically, with no timeline XML, so
    // the endless loop survives. The entrance effect is attached just the same.
    const useGif = g.gif && existsSync(join(outDir, g.gif));
    const file = join(outDir, useGif ? g.gif : g.file);
    if (!existsSync(file)) throw new Error(`missing layer ${file}`);
    s.addImage({
      path: file,
      x: inch(g.x),
      y: inch(g.y),
      w: inch(g.w),
      h: inch(g.h),
      objectName: `g${g.k}`,
      altText: g.text || `slide ${slide.page} layer ${g.k}`,
    });
    // Animated sub-elements (dashed flow, waveform) ride on top of their parent
    // layer as their own looping GIF, so the surrounding text stays lossless.
    (g.bits || []).forEach((b, j) => {
      if (!b.gif || !existsSync(join(outDir, b.gif))) return;
      s.addImage({
        path: join(outDir, b.gif),
        x: inch(b.box.x),
        y: inch(b.box.y),
        w: inch(b.box.w),
        h: inch(b.box.h),
        objectName: `g${g.k}b${j}`,
        altText: b.text || `slide ${slide.page} bit ${g.k}.${j}`,
      });
    });
  }

  const notes = [
    `第 ${slide.page} 页 · 幻灯片正文（栅格化以保证与 HTML 完全一致，文字原样留在这里便于检索/复制）`,
    "",
    ...slide.groups.map((g, i) => `[${i + 1}] ${g.text || "(图形层)"}`),
  ].join("\n");
  s.addNotes(notes);
}

const raw = await pptx.write({ outputType: "nodebuffer" });
console.log(`[build] ${manifest.slides.length} slides, ${manifest.slides.reduce((a, s) => a + s.groups.length, 0)} alpha layers`);

// ------------------------------------------------------- 2. native timeline

const EASE_CACHE = new Map();
function cubicBezier(x1, y1, x2, y2) {
  const key = [x1, y1, x2, y2].join(",");
  if (EASE_CACHE.has(key)) return EASE_CACHE.get(key);
  const bx = (t) => 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3;
  const by = (t) => 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
  const fn = (x) => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) {
      const cx = bx(t);
      if (Math.abs(cx - x) < 1e-5) break;
      if (cx < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return by(t);
  };
  EASE_CACHE.set(key, fn);
  return fn;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Relative-motion keyframes for `ppt_y`.
 *
 * The shape is already placed at its FINAL position, so the first frame must sit
 * `moveY` px LOWER and the last frame must be exactly 0. Every frame is a
 * relative expression (`#ppt_y+n`), never an absolute `<p:fltVal>` — an absolute
 * value is interpreted as a page coordinate and teleports the shape to the top
 * of the slide.
 */
function yKeyframes(moveFrac, easing) {
  const ease = cubicBezier(...easing);
  const frames = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const p = i / N;
    // The final frame must be EXACTLY "#ppt_y" (offset 0): the confirmed-playing
    // deck ends on the bare formula, and a residue like #ppt_y-0.000012 leaves
    // the shape a hair off its layout position.
    const offset = i === N ? 0 : (1 - ease(p)) * moveFrac;
    // `p:tav/@tm` is a percentage of the effect duration in 1/1000 of a percent
    // (0 .. 100000), NOT milliseconds.
    const tm = Math.round(p * 100000);
    frames.push(
      `<p:tav tm="${tm}"><p:val><p:strVal val="${offset < 1e-5 ? "#ppt_y" : `#ppt_y-${offset.toFixed(6)}`}"/></p:val></p:tav>`,
    );
  }
  return frames.join("");
}

let idSeq = 100;
const nextId = () => ++idSeq;

/**
 * One entrance effect. The shape of this XML is copied from a deck that is
 * CONFIRMED to play (a user-supplied animated deck, measured with a real
 * slide-show frame capture: frames change by mean 1.49 / 0.88% of pixels).
 *
 * What it does, and why each part matters:
 *   presetID="10" presetClass="entr" presetSubtype="0"   Fade entrance
 *   <p:set style.visibility>                             start hidden
 *   <p:animEffect transition="in" filter="fade">          the fade itself
 *   <p:anim ppt_y>  #ppt_y-<d>  ->  #ppt_y                the move, RELATIVE only
 *
 * An earlier attempt emitted presetID="2" (Fly In) with a ppt_x identity anim and
 * no animEffect, copied from what PowerPoint writes for its own Fly In preset.
 * PowerPoint listed those effects but the show never played them.
 */
function effectPar({ spid, delayMs, moveFrac, easing, durationMs, nodeType, rotFrom }) {
  const effectId = nextId();
  const setId = nextId();
  const fadeId = nextId();
  const moveId = nextId();
  const rotId = nextId();
  const setVis =
    `<p:set><p:cBhvr><p:cTn id="${setId}" dur="1" fill="hold">` +
    `<p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
    `<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>` +
    `<p:to><p:strVal val="visible"/></p:to></p:set>`;
  const fade =
    `<p:animEffect transition="in" filter="fade"><p:cBhvr>` +
    `<p:cTn id="${fadeId}" dur="${durationMs}"/>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`;
  const move =
    `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base">` +
    `<p:cTn id="${moveId}" dur="${durationMs}" fill="hold"/>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
    `<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr>` +
    `<p:tavLst>${yKeyframes(moveFrac, easing)}</p:tavLst></p:anim>`;
    const rot =
    rotFrom === null || rotFrom === 0
      ? ""
      : `<p:animRot from="${rotFrom}" to="0"><p:cBhvr>` +
        `<p:cTn id="${rotId}" dur="${durationMs}" fill="hold"/>` +
        `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animRot>`;
  return (
    `<p:par><p:cTn id="${effectId}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">` +
    `<p:stCondLst><p:cond delay="${delayMs}"/></p:stCondLst>` +
    `<p:childTnLst>${setVis}${fade}${move}${rot}</p:childTnLst></p:cTn></p:par>`
  );
}

/**
 * Whole-slide timeline, structurally identical to what PowerPoint itself emits
 * for an automatic staggered entrance sequence:
 *
 *   mainSeq -> ONE group par (cond delay=indefinite + onBegin tn=2)
 *              -> ONE inner par (delay 0)
 *                 -> one par per effect (presetID=10, nodeType, absolute delay)
 *
 * Emitting the effect pars directly under mainSeq instead made PowerPoint report
 * 3 effects per layer and trigger type "none" (measured: 62 layers -> 186).
 * Delay of the first effect is measured from the slide; a `withEffect` delay is
 * measured from the PREVIOUS effect's start, so absolute HTML delays are
 * converted to increments here.
 */
function timingXml(effects, buildIds) {
  // Time-node ids restart at 3 for EVERY slide, matching the deck that is
  // confirmed to play (1 = tmRoot, 2 = mainSeq, then 3,4,5…). Letting a single
  // module-level counter run across all 20 slides produced ids in the 180-300
  // range, and that file played no animation at all.
  idSeq = 2;
  const groupId = nextId();
  const innerId = nextId();
  let prevDelay = 0;
  const pars = effects
    .map((e, i) => {
      const nodeType = i === 0 ? "afterEffect" : "withEffect";
      const delay = i === 0 ? e.delayMs : Math.max(0, e.delayMs - prevDelay);
      prevDelay = e.delayMs;
      return effectPar({ ...e, delayMs: delay, nodeType });
    })
    .join("");
  const bld = buildIds.map((id) => `<p:bldP spid="${id}" grpId="0"/>`).join("");
  // Wrapper shape matches the confirmed-playing deck: two nested pars that both
  // simply start at delay 0. PowerPoint's own files use `delay="indefinite"` plus
  // an `onBegin` condition here, and effects written that way were listed but
  // never played.
  return (
    `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>` +
    `<p:par><p:cTn id="${groupId}" fill="hold">` +
    `<p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
    `<p:childTnLst><p:par><p:cTn id="${innerId}" fill="hold">` +
    `<p:stCondLst><p:cond delay="0"/></p:stCondLst>` +
    `<p:childTnLst>${pars}</p:childTnLst></p:cTn></p:par></p:childTnLst>` +
    `</p:cTn></p:par>` +
    `</p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>` +
    `</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>` +
    `<p:bldLst>${bld}</p:bldLst></p:timing>`
  );
}

const transitionXml =
  `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">` +
  `<mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14">` +
  `<p:transition spd="med" p14:dur="${config.transitionMs ?? 450}"><p:fade/></p:transition></mc:Choice>` +
  `<mc:Fallback><p:transition spd="med"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;

const zip = await JSZip.loadAsync(raw);
const slideNames = Object.keys(zip.files)
  .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));
if (slideNames.length !== manifest.slides.length) {
  throw new Error(`pptx has ${slideNames.length} slides but manifest has ${manifest.slides.length}`);
}

const report = [];
for (let i = 0; i < slideNames.length; i++) {
  const name = slideNames[i];
  const slide = manifest.slides[i];
  let xml = await zip.file(name).async("string");

  // Resolve ids by NAME (never by position).
  const byName = new Map();
  for (const pic of xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? []) {
    const m = pic.match(/<p:cNvPr id="(\d+)" name="([^"]*)"/);
    if (m) byName.set(m[2], Number(m[1]));
  }
  for (const g of slide.groups) {
    if (!byName.has(`g${g.k}`)) throw new Error(`${name}: no picture named g${g.k} (found: ${[...byName.keys()].join(", ")})`);
  }
  if (!byName.has("base")) throw new Error(`${name}: no picture named base`);

  const moveFrac = (specMoveY ?? config.groups?.moveY ?? 14) / manifest.height;
  const easing = config.groups?.easing ?? [0.22, 0.61, 0.36, 1];
  const rotFrom = specRotDeg ? Math.round(specRotDeg * 60000) : null;
  const durationMs = specDuration ?? config.groups?.duration ?? 500;
  const effects = [];
  for (const g of slide.groups) {
    effects.push({ spid: byName.get(`g${g.k}`), delayMs: specLayerDelays?.[g.k] ?? g.delayMs, moveFrac, easing, durationMs, rotFrom });
    (g.bits || []).forEach((b, j) => {
      if (!b.gif) return;
      const spid = byName.get(`g${g.k}b${j}`);
      if (spid === undefined) throw new Error(`${name}: no picture named g${g.k}b${j}`);
      effects.push({ spid, delayMs: specLayerDelays?.[g.k] ?? g.delayMs, moveFrac, easing, durationMs, rotFrom });
    });
  }
  effects.sort((a, b) => a.delayMs - b.delayMs);

  xml = xml.replace(/<p:timing>[\s\S]*?<\/p:timing>/g, "");
  xml = xml.replace(/<mc:AlternateContent>[\s\S]*?<\/mc:AlternateContent>/g, "");
  xml = xml.replace(/<p:transition[\s\S]*?<\/p:transition>/g, "");
  xml = xml.replace(/<p:transition[^>]*\/>/g, "");
  xml = xml.replace("</p:sld>", transitionXml + timingXml(effects, effects.map((e) => e.spid)) + "</p:sld>");

  if (!/<\/p:sld>\s*$/.test(xml)) throw new Error(`${name}: malformed after injection`);
  zip.file(name, xml);
  report.push({ slide: i + 1, effects: effects.length, spids: effects.map((e) => e.spid).join(",") });
}

const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(pptxOut, out);
console.log(`[build] wrote ${pptxOut} (${(out.length / 1024).toFixed(0)} KB)`);
console.log(`[build] ${report.map((r) => `p${r.slide}:${r.effects}`).join(" ")}`);
