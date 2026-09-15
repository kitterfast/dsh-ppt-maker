import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let s = readFileSync(f, "utf8");
const old = "    const dynIdx = groups.map((_, k) => k).filter((k) => groups[k].permanent || groups[k].canvas);";
const neu = `    // Bake ONLY layers with no text. A GIF is 256 colours, so baking a layer
    // that carries text turns crisp type into mush -- the reported "画质过糊".
    // Text-bearing layers keep their lossless PNG and get their entrance from
    // the native timeline instead; only pure line-art (dashed flow, waveform)
    // is baked, where a small palette is harmless.
    const dynIdx = groups.map((_, k) => k).filter((k) => (groups[k].permanent || groups[k].canvas) && !groups[k].text);
    const skipped = groups.map((_, k) => k).filter((k) => (groups[k].permanent || groups[k].canvas) && groups[k].text);
    if (skipped.length) {
      console.log(
        \`[render] p\${n + 1}: \${skipped.length} 层含文字且带常驻动效，保持 PNG 清晰（不烘 GIF）：\` +
          skipped.map((k) => \`g\${k}\`).join(","),
      );
    }`;
if (!s.includes(old)) { console.error("anchor not found"); process.exit(1); }
s = s.replace(old, neu);
s = s.replace('const RENDERER_VERSION = "11"', 'const RENDERER_VERSION = "12"');
writeFileSync(f, s, "utf8");
console.log("patched: only text-free layers are baked to GIF");
