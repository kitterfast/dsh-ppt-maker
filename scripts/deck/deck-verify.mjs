/**
 * deck-verify.mjs — machine acceptance for the generated PPTX.
 *
 * Three independent gates, because the previous run's self-check passed while
 * the file was unusable:
 *
 *   A. STRUCTURE  — pure XML: every animation target resolves to a real picture,
 *                   effect count == build count == manifest count, `tm` values
 *                   legal, no absolute `fltVal` on ppt_y.
 *   B. POWERPOINT — COM: how many effects PowerPoint actually parsed, which SHAPE
 *                   each one is attached to, trigger type, delay, duration.
 *                   Regex cannot see this; PowerPoint can.
 *   C. PIXELS     — export every slide as PNG and diff it against the browser's
 *                   own reference render, so "文字错版" becomes a number instead
 *                   of something a human has to notice.
 *
 * Usage: node deck-verify.mjs [deck.config.json] [--structure-only] [--keep-shots]
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The COM helper ships WITH the pipeline, not with the deck's project. */
const PS1 = fileURLToPath(new URL("./lib/verify-pptx.ps1", import.meta.url));

const args = process.argv.slice(2);
const structureOnly = args.includes("--structure-only");
const configPath = resolve(args.find((a) => !a.startsWith("--")) ?? "deck.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const projectRoot = dirname(configPath);
const outDir = resolve(projectRoot, config.out ?? "render");
const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
const pptx = resolve(projectRoot, config.pptx ?? "deck.pptx");

const require = createRequire(join(projectRoot, "package.json"));
const JSZip = require("jszip");

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// ------------------------------------------------------------ A. structure

console.log(`\n=== A. 结构（XML） ===`);
const zip = await JSZip.loadAsync(readFileSync(pptx));
const slideNames = Object.keys(zip.files)
  .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));

if (slideNames.length !== manifest.slides.length) fail(`slide count ${slideNames.length} != manifest ${manifest.slides.length}`);
else pass(`slide count = ${slideNames.length}`);

const structure = [];
for (let i = 0; i < slideNames.length; i++) {
  const xml = await zip.file(slideNames[i]).async("string");
  const slide = manifest.slides[i];
  const pics = new Map();
  for (const block of xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? []) {
    const m = block.match(/<p:cNvPr id="(\d+)" name="([^"]*)"/);
    if (m) pics.set(Number(m[1]), m[2]);
  }
  const timing = xml.match(/<p:timing>[\s\S]*?<\/p:timing>/)?.[0];
  if (!timing) { fail(`p${i + 1}: no <p:timing>`); continue; }
  if (!xml.includes("<p:transition")) fail(`p${i + 1}: no <p:transition>`);

  const targets = [...timing.matchAll(/<p:spTgt spid="(\d+)"/g)].map((m) => Number(m[1]));
  const uniq = [...new Set(targets)];
  const bad = uniq.filter((id) => !pics.has(id));
  if (bad.length) fail(`p${i + 1}: animation targets ${bad.join(",")} are not pictures (names: ${[...pics.values()].join(",")})`);

  const effectCount = (timing.match(/presetClass="entr"/g) ?? []).length;
  const bldCount = (timing.match(/<p:bldP /g) ?? []).length;
  const groupCount =
    slide.groups.length + slide.groups.reduce((n, g) => n + (g.bits || []).filter((b) => b.gif).length, 0);
  if (effectCount !== groupCount) fail(`p${i + 1}: ${effectCount} effects but manifest has ${groupCount} layers`);
  if (bldCount !== effectCount) fail(`p${i + 1}: bldP ${bldCount} != effects ${effectCount}`);

  const tms = [...timing.matchAll(/<p:tav tm="(\d+)"/g)].map((m) => Number(m[1]));
  if (tms.some((t) => t > 100000)) fail(`p${i + 1}: tav tm out of range (${Math.max(...tms)} > 100000)`);
  if (/ppt_y[\s\S]{0,80}<p:fltVal>/.test(timing)) fail(`p${i + 1}: absolute fltVal next to ppt_y would teleport the shape`);

  const visSets = (timing.match(/style\.visibility/g) ?? []).length;
  if (visSets !== effectCount) fail(`p${i + 1}: ${visSets} visibility sets != ${effectCount} effects`);

  const animatedNames = [];
  for (const g of slide.groups) {
    const main = byName(pics, g.k);
    if (main) animatedNames.push(main);
    (g.bits || []).forEach((bit, j) => {
      if (!bit.gif) return;
      for (const [id, nm] of pics) if (nm === `g${g.k}b${j}`) animatedNames.push({ id, name: nm });
    });
  }
  structure.push({ slide: i + 1, effectCount, targets: animatedNames });
}
function byName(pics, k) {
  for (const [id, name] of pics) if (name === `g${k}`) return { id, name };
  return null;
}
if (!failures.length) pass(`${slideNames.length} slides: targets ok, counts ok, tm ok, relative motion only`);

// ----------------------------------------------------------- B. PowerPoint

// ------------------------------------------- A2. entrance equals PowerPoint's own
//
// The 2026-09-14 deck shipped effects that PowerPoint LISTED in MainSequence but
// never played, because the XML was a hand-written combination ("Fade preset +
// custom motion") that PowerPoint does not run. A structural self-check cannot
// see that. This gate compares the emitted entrance block, normalised, against
// the block PowerPoint itself writes for the same effect. The reference is
// regenerable with tools/calibrate-fly.ps1 + tools/dump-timing.mjs.
const REF_PATH = fileURLToPath(new URL("./lib/reference-entrance.xml", import.meta.url));
if (existsSync(REF_PATH)) {
  /**
   * Normalise away everything that legitimately differs between slides (ids,
   * target shapes, delays, keyframe times, keyframe magnitudes) while keeping
   * the parts that decide whether a player will RUN the effect: the preset,
   * the behaviour sequence, the attribute names, and the *shape* of every
   * formula (e.g. "#ppt_y-<n>" vs "#ppt_y+<n>" vs "0-#ppt_h/2").
   */
  const normalize = (s) =>
    s
      // keyframes: keep how MANY, which DIRECTION they travel, and whether the
      // motion settles exactly on the bare formula. Exact magnitudes are the
      // deck's own business and legitimately differ.
      .replace(/<p:tavLst>([\s\S]*?)<\/p:tavLst>/g, (full, body) => {
        const frames = [...body.matchAll(/<p:tav tm="\d+"><p:val><p:strVal val="([^"]*)"\/>/g)].map((m) => m[1]);
        const dirs = [...new Set(frames.map((v) => (v === "#ppt_y" ? "0" : v.includes("+") ? "+" : v.includes("-") ? "-" : "?")))].join("");
        return `<p:tavLst dir="${dirs}" last="${frames[frames.length - 1]}"/>`;
      })
      .replace(/ id="\d+"/g, "")
      .replace(/ spid="\d+"/g, ' spid="#"')
      .replace(/(<p:cond delay=")\d+(")/g, "$1N$2")
      .replace(/ dur="\d+"/g, ' dur="N"')
      .replace(/\s+/g, "")
      .replace(/> </g, "><")
      .trim();
  /** First entrance effect block: from `presetClass="entr"` to the next one. */
  const firstEntrance = (timing) => {
    const parts = timing.split('presetClass="entr"');
    if (parts.length < 2) return "";
    return normalize('presetClass="entr"' + parts[1]);
  };
  const REF_RAW = readFileSync(REF_PATH, "utf8");
  const presetOf = (x) => (x.match(/presetID="(\d+)" presetClass="(\w+)" presetSubtype="(\d+)"/) ?? []).join("|");
  const behavioursOf = (x) => [...x.matchAll(/<p:(set|animEffect|anim|animRot|animScale|animClr)\b/g)].map((m) => m[1]);
  const refPreset = presetOf(REF_RAW);
  const refBehaviours = new Set(behavioursOf(firstEntrance(REF_RAW)));
  let mismatch = 0;
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.file(slideNames[i]).async("string");
    const timing = xml.match(/<p:timing>[\s\S]*?<\/p:timing>/)?.[0];
    if (!timing) continue;
    const minePreset = presetOf(timing);
    if (minePreset !== refPreset) {
      mismatch++;
      if (mismatch === 1) fail("p" + (i + 1) + ": preset " + minePreset + " != proven " + refPreset);
      continue;
    }
    const extra = [...new Set(behavioursOf(firstEntrance(timing)).filter((x) => !refBehaviours.has(x)))];
    if (extra.length) {
      mismatch++;
      if (mismatch === 1) {
        fail("p" + (i + 1) + ": 用了已证实写法里没有的效果 " + extra.join(",") + " (proven: " + [...refBehaviours].join("/") + ")");
      }
    }
  }
  if (!mismatch) pass(slideNames.length + " slides: preset matches the proven form; no extra behaviours used");
} else {
  console.log("  skip  reference-entrance.xml absent");
}

let com = null;
const shotDir = join(outDir, "_powerpoint");
if (!structureOnly) {
  console.log(`\n=== B. PowerPoint（COM 真机验收） ===`);
  if (!existsSync(pptx)) {
    fail(`pptx missing: ${pptx}`);
  } else {
    const jsonPath = join(outDir, "_com-report.json");
    rmSync(shotDir, { recursive: true, force: true });
    mkdirSync(shotDir, { recursive: true });
    const t0 = Date.now();
    const ps = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1,
        "-Pptx", pptx, "-OutJson", jsonPath, "-ShotDir", shotDir,
        "-Width", String(manifest.width), "-Height", String(manifest.height)],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (ps.stdout) process.stdout.write(ps.stdout);
    if (ps.stderr) process.stderr.write(ps.stderr);
    if (!existsSync(jsonPath)) {
      fail(`PowerPoint COM produced no report (${((Date.now() - t0) / 1000).toFixed(1)}s): ${ps.error?.message ?? "see stderr"}`);
    } else {
      com = JSON.parse(readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, ""));
      if (!com.ok) fail(`PowerPoint COM error: ${com.error}`);
      else {
        pass(`PowerPoint ${com.powerpoint}: opened, ${com.slides} slides, ${((com.tookMs ?? 0) / 1000).toFixed(1)}s`);
        console.log(`\n       page  effects  triggers            shapes`);
        for (const entry of com.timeline) {
          const expected = structure[entry.slide - 1];
          const names = entry.effects.map((e) => e.shapeName);
          const triggers = entry.effects.map((e) => e.triggerType).join(",");
          const delays = entry.effects.map((e) => e.delaySec.toFixed(2)).join(",");
          if (!expected) continue;
          console.log(
            `       ${String(entry.slide).padStart(4)}  ${String(entry.count).padStart(7)}  ${triggers.padEnd(18)}  ${names.join(" ")}`,
          );
          const want = expected.targets.map((t) => t.name);
          const missing = want.filter((w) => !names.includes(w));
          const extra = names.filter((n) => !want.includes(n));
          if (missing.length || extra.length) {
            fail(`p${entry.slide}: PowerPoint attached effects to [${names.join(",")}] but expected [${want.join(",")}]`);
          }
          const badTrigger = entry.effects
            .map((e, idx) => (e.triggerType === (idx === 0 ? 3 : 2) ? null : `${idx + 1}=${e.triggerType}`))
            .filter(Boolean);
          if (badTrigger.length) {
            fail(`p${entry.slide}: ${badTrigger.length}/${entry.count} trigger types wrong (${badTrigger.slice(0, 6).join(" ")}) — want first=3(after previous), rest=2(with previous); delays=${delays}`);
          }
          const zero = entry.effects.filter((e) => e.durationSec <= 0.001);
          if (zero.length) fail(`p${entry.slide}: ${zero.length} effect(s) have no duration`);
        }
        const total = com.timeline.reduce((a, t) => a + t.count, 0);
        const wantTotal = manifest.slides.reduce(
          (a, s) => a + s.groups.length + s.groups.reduce((n, g) => n + (g.bits || []).filter((b) => b.gif).length, 0),
          0,
        );
        if (total !== wantTotal) fail(`PowerPoint parsed ${total} effects, manifest has ${wantTotal} layers`);
        else pass(`${total} entrance effects parsed by PowerPoint, all attached to the expected pictures`);
      }
    }
  }
}

// ---------------------------------------------------------------- C. pixels

if (!structureOnly && com?.ok && com.exported.length) {
  console.log(`\n=== C. 像素（PowerPoint 导出的每页 vs 浏览器参考渲染） ===`);
  let PNG;
  try {
    PNG = require("pngjs").PNG;
  } catch {
    fail("pngjs not installed — cannot diff pixels (npm i pngjs)");
  }
  if (PNG) {
    const tolerance = config.verify?.maxMeanDiff ?? 6;
    const badPixelTolerance = config.verify?.maxBadPixelRatio ?? 0.02;
    const rows = [];
    for (let i = 0; i < com.exported.length; i++) {
      const shot = com.exported[i];
      const refPath = join(outDir, manifest.slides[i].ref);
      if (!existsSync(shot) || !existsSync(refPath)) { fail(`p${i + 1}: missing ${shot} or ${refPath}`); continue; }
      const a = PNG.sync.read(readFileSync(shot));
      const b = PNG.sync.read(readFileSync(refPath));
      if (a.width !== b.width || a.height !== b.height) {
        fail(`p${i + 1}: size mismatch export ${a.width}x${a.height} vs ref ${b.width}x${b.height}`);
        continue;
      }
      let sum = 0, bad = 0;
      const n = a.width * a.height;
      for (let p = 0; p < n; p++) {
        const o = p * 4;
        const d = Math.max(
          Math.abs(a.data[o] - b.data[o]),
          Math.abs(a.data[o + 1] - b.data[o + 1]),
          Math.abs(a.data[o + 2] - b.data[o + 2]),
        );
        sum += d;
        if (d > 32) bad++;
      }
      const mean = sum / n;
      const ratio = bad / n;
      rows.push({ page: i + 1, mean: +mean.toFixed(2), badRatio: +(ratio * 100).toFixed(2) });
      if (mean > tolerance) fail(`p${i + 1}: mean channel diff ${mean.toFixed(2)} > ${tolerance}`);
      if (ratio > badPixelTolerance) fail(`p${i + 1}: ${(ratio * 100).toFixed(2)}% pixels differ by >32 (> ${badPixelTolerance * 100}%)`);
    }
    const worst = rows.slice().sort((x, y) => y.mean - x.mean)[0];
    console.log(`       page  meanDiff  badPixel%`);
    for (const r of rows) console.log(`       ${String(r.page).padStart(4)}  ${String(r.mean).padStart(8)}  ${String(r.badRatio).padStart(8)}`);
    if (worst) console.log(`       worst: p${worst.page} mean ${worst.mean}`);
    if (!rows.some((r) => r.mean > tolerance)) pass(`all ${rows.length} slides within tolerance (mean <= ${tolerance})`);
    writeFileSync(join(outDir, "_pixel-report.json"), JSON.stringify(rows, null, 1), "utf8");
  }
}

// ----------------------------------------------------------------- verdict

console.log(`\n=== 判定 ===`);
if (failures.length) {
  console.log(`${failures.length} 项不通过：`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("PASS：结构、PowerPoint 时间轴、逐页像素三项全过。");
