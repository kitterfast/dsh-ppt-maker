// Re-composite base + alpha layers in Node and diff against the browser reference.
// If this matches the reference but PowerPoint's export does not, the residual is
// PowerPoint-side rendering; if it also differs, the capture is at fault.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
const require = createRequire("E:/deepseek/dsh-ppt-project/package.json");
const { PNG } = require("pngjs");

const outDir = resolve(process.argv[2]);
const pageArg = process.argv[3];
const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));

for (const slide of manifest.slides) {
  if (pageArg && String(slide.page) !== pageArg) continue;
  const ref = PNG.sync.read(readFileSync(join(outDir, slide.ref)));
  const canvas = PNG.sync.read(readFileSync(join(outDir, slide.base)));
  // straight alpha source-over
  for (const g of slide.groups) {
    const layer = PNG.sync.read(readFileSync(join(outDir, g.file)));
    for (let y = 0; y < layer.height; y++) {
      const cy = g.y + y;
      if (cy < 0 || cy >= canvas.height) continue;
      for (let x = 0; x < layer.width; x++) {
        const cx = g.x + x;
        if (cx < 0 || cx >= canvas.width) continue;
        const s = (y * layer.width + x) * 4;
        const a = layer.data[s + 3] / 255;
        if (a === 0) continue;
        const d = (cy * canvas.width + cx) * 4;
        canvas.data[d] = Math.round(layer.data[s] * a + canvas.data[d] * (1 - a));
        canvas.data[d + 1] = Math.round(layer.data[s + 1] * a + canvas.data[d + 1] * (1 - a));
        canvas.data[d + 2] = Math.round(layer.data[s + 2] * a + canvas.data[d + 2] * (1 - a));
      }
    }
  }
  let sum = 0, bad = 0, inkBad = 0, inkTotal = 0;
  const n = ref.width * ref.height;
  const diff = new PNG({ width: ref.width, height: ref.height });
  for (let p = 0; p < n; p++) {
    const o = p * 4;
    const d = Math.max(Math.abs(canvas.data[o] - ref.data[o]), Math.abs(canvas.data[o + 1] - ref.data[o + 1]), Math.abs(canvas.data[o + 2] - ref.data[o + 2]));
    sum += d;
    if (d > 32) bad++;
    const v = Math.min(255, d * 6);
    diff.data[o] = v; diff.data[o + 1] = 0; diff.data[o + 2] = d > 32 ? 0 : 60; diff.data[o + 3] = 255;
  }
  writeFileSync(join(outDir, `_nodecomposite-p${String(slide.page).padStart(2, "0")}.png`), PNG.sync.write(diff));
  console.log(`p${slide.page}: node-composite vs ref -> mean ${(sum / n).toFixed(2)}, bad>32 ${(bad / n * 100).toFixed(2)}%  (${slide.groups.length} layers)`);
}
