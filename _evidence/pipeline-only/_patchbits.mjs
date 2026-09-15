import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-to-pptx.mjs";
let s = readFileSync(f, "utf8");

// 1) add each baked sub-element as its own picture, right after its parent layer
const anchor = `      altText: g.text || \`slide \${slide.page} layer \${g.k}\`,
    });
  }`;
if (!s.includes(anchor)) { console.error("picture anchor missing"); process.exit(1); }
s = s.replace(anchor, `      altText: g.text || \`slide \${slide.page} layer \${g.k}\`,
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
        objectName: \`g\${g.k}b\${j}\`,
        altText: b.text || \`slide \${slide.page} bit \${g.k}.\${j}\`,
      });
    });
  }`);

// 2) give each bit the SAME entrance timing as its parent, so they enter together
const eff = `  const effects = slide.groups
    .map((g) => ({ spid: byName.get(\`g\${g.k}\`), delayMs: g.delayMs, moveFrac, easing, durationMs }))
    .sort((a, b) => a.delayMs - b.delayMs);`;
if (!s.includes(eff)) { console.error("effects anchor missing"); process.exit(1); }
s = s.replace(eff, `  const effects = [];
  for (const g of slide.groups) {
    effects.push({ spid: byName.get(\`g\${g.k}\`), delayMs: g.delayMs, moveFrac, easing, durationMs });
    (g.bits || []).forEach((b, j) => {
      if (!b.gif) return;
      const spid = byName.get(\`g\${g.k}b\${j}\`);
      if (spid === undefined) throw new Error(\`\${name}: no picture named g\${g.k}b\${j}\`);
      effects.push({ spid, delayMs: g.delayMs, moveFrac, easing, durationMs });
    });
  }
  effects.sort((a, b) => a.delayMs - b.delayMs);`);
writeFileSync(f, s, "utf8");
console.log("builder now places and animates the baked sub-elements");
