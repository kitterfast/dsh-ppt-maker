import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-verify.mjs";
let s = readFileSync(f, "utf8");
const a = s.indexOf("  const reference = firstEntrance(readFileSync(REF_PATH");
const b = s.indexOf("let com = null;");
if (a < 0 || b < 0) { console.error("markers not found", a, b); process.exit(1); }
const block = [
'  const REF_RAW = readFileSync(REF_PATH, "utf8");',
'  const presetOf = (x) => (x.match(/presetID="(\\d+)" presetClass="(\\w+)" presetSubtype="(\\d+)"/) ?? []).join("|");',
'  const behavioursOf = (x) => [...x.matchAll(/<p:(set|animEffect|anim|animRot|animScale|animClr)\\b/g)].map((m) => m[1]);',
'  const refPreset = presetOf(REF_RAW);',
'  const refBehaviours = new Set(behavioursOf(firstEntrance(REF_RAW)));',
'  let mismatch = 0;',
'  for (let i = 0; i < slideNames.length; i++) {',
'    const xml = await zip.file(slideNames[i]).async("string");',
'    const timing = xml.match(/<p:timing>[\\s\\S]*?<\\/p:timing>/)?.[0];',
'    if (!timing) continue;',
'    const minePreset = presetOf(timing);',
'    if (minePreset !== refPreset) {',
'      mismatch++;',
'      if (mismatch === 1) fail("p" + (i + 1) + ": preset " + minePreset + " != proven " + refPreset);',
'      continue;',
'    }',
'    const extra = [...new Set(behavioursOf(firstEntrance(timing)).filter((x) => !refBehaviours.has(x)))];',
'    if (extra.length) {',
'      mismatch++;',
'      if (mismatch === 1) {',
'        fail("p" + (i + 1) + ": 用了已证实写法里没有的效果 " + extra.join(",") + " (proven: " + [...refBehaviours].join("/") + ")");',
'      }',
'    }',
'  }',
'  if (!mismatch) pass(slideNames.length + " slides: preset matches the proven form; no extra behaviours used");',
'} else {',
'  console.log("  skip  reference-entrance.xml absent");',
'}',
'',
''].join("\n");
s = s.slice(0, a) + block + s.slice(b);
writeFileSync(f, s, "utf8");
console.log("A2 rewritten as a subset check");
