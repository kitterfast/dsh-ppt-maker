import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2];

// ---- 1. deck-to-pptx.mjs: drop animRot (it is NOT in the HTML) -------------
{
  const f = `${dir}/deck-to-pptx.mjs`;
  let s = readFileSync(f, "utf8");
  const before = s.length;
  s = s.replace(/\s*const rot =\n[\s\S]*?<\/p:animRot>`;\n/, "\n");
  s = s.replace("${setVis}${fade}${move}${rot}", "${setVis}${fade}${move}");
  s = s.replace(/\s*const rotId = nextId\(\);\n/, "\n");
  if (s.includes("animRot")) { console.error("FAILED: animRot still present"); process.exit(1); }
  writeFileSync(f, s, "utf8");
  console.log(`deck-to-pptx.mjs: animRot removed (${before} -> ${s.length} chars)`);
}

// ---- 2. deck-verify.mjs: A2 becomes a SUBSET check ------------------------
// The proven deck carries a rotation our HTML does not have, so comparing the
// behaviour list literally would force us to copy effects the HTML never had.
// The rule is: same preset, and never a behaviour the proven form lacks.
{
  const f = `${dir}/deck-verify.mjs`;
  let s = readFileSync(f, "utf8");
  const a = s.indexOf("  const reference = firstEntrance(readFileSync(REF_PATH");
  const b = s.indexOf("let com = null;");
  if (a < 0 || b < 0) { console.error("FAILED: A2 markers not found", a, b); process.exit(1); }
  const block = `  const REF_RAW = readFileSync(REF_PATH, "utf8");
  const presetOf = (s) => (s.match(/presetID="(\\d+)" presetClass="(\\w+)" presetSubtype="(\\d+)"/) ?? []).join("|");
  const behavioursOf = (s) => [...s.matchAll(/<p:(set|animEffect|anim|animRot|animScale|animClr)\\b/g)].map((m) => m[1]);
  const refPreset = presetOf(REF_RAW);
  const refBehaviours = new Set(behavioursOf(firstEntrance(REF_RAW)));
  let mismatch = 0;
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.file(slideNames[i]).async("string");
    const timing = xml.match(/<p:timing>[\\s\\S]*?<\\/p:timing>/)?.[0];
    if (!timing) continue;
    const mine = presetOf(timing);
    if (mine !== refPreset) {
      mismatch++;
      if (mismatch === 1) fail(\`p\${i + 1}: preset \${mine} != proven \\\`\${refPreset}\\\`\`);
      continue;
    }
    const extra = [...new Set(behavioursOf(firstEntrance(timing)).filter((x) => !refBehaviours.has(x)))];
    if (extra.length) {
      mismatch++;
      if (mismatch === 1) {
        fail(\`p\${i + 1}: 用了"已证实会播"的写法里没有的效果 \${extra.join(", ")} —— 命令 \${[...refBehaviours].join("/")}\`);
      }
    }
  }
  if (!mismatch) pass(\`\${slideNames.length} slides: preset matches the proven form and no extra behaviours are used\`);
} else {
  console.log(\`  skip  reference-entrance.xml absent — regenerate via tools/make-reference.mjs\`);
}

`;
  s = s.slice(0, a) + block + s.slice(b);
  writeFileSync(f, s, "utf8");
  console.log("deck-verify.mjs: A2 is now a subset check (same preset, no extra behaviours)");
}
