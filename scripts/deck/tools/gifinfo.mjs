import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("E:/deepseek/dsh-ppt-project/package.json");
const JSZip = require("jszip");

// minimal GIF walker: frame count, loop count, per-frame delay
function gifInfo(buf) {
  if (buf.toString("latin1", 0, 3) !== "GIF") return null;
  const w = buf.readUInt16LE(6), h = buf.readUInt16LE(8);
  let p = 13;
  const flags = buf[10];
  if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1)); // global color table
  let frames = 0, loops = null, totalDelay = 0, delays = [];
  while (p < buf.length) {
    const b = buf[p];
    if (b === 0x3b) break;                       // trailer
    if (b === 0x21) {                            // extension
      const label = buf[p + 1]; p += 2;
      if (label === 0xf9) { const sz = buf[p]; delays.push(buf.readUInt16LE(p + 2)); p += sz + 1; }
      else if (label === 0xff) { const sz = buf[p]; if (buf.toString("latin1", p + 1, p + 12) === "NETSCAPE2.0") loops = buf.readUInt16LE(p + 14); p += sz + 1; }
      while (buf[p] !== 0) p += buf[p] + 1;      // sub-blocks
      p += 1;
    } else if (b === 0x2c) {                     // image descriptor
      frames++;
      const lf = buf[p + 9];
      p += 10;
      if (lf & 0x80) p += 3 * (1 << ((lf & 7) + 1));
      p += 1;                                    // LZW min code size
      while (buf[p] !== 0) p += buf[p] + 1;      // sub-blocks
      p += 1;
    } else p++;
  }
  totalDelay = delays.reduce((a, b) => a + b, 0);
  return { w, h, frames, loops, seconds: (totalDelay / 100).toFixed(1), firstDelay: delays[0], lastDelay: delays[delays.length - 1] };
}

for (const path of process.argv.slice(2)) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const gifs = Object.keys(zip.files).filter((n) => /^ppt\/media\/.*\.gif$/i.test(n)).sort();
  console.log(`\n=== ${path.split("\\").pop()} — ${gifs.length} gif ===`);
  let shown = 0;
  for (const g of gifs) {
    const info = gifInfo(await zip.file(g).async("nodebuffer"));
    if (!info) { console.log(`  ${g}: not a GIF`); continue; }
    if (shown < 6) { console.log(`  ${g}: ${info.w}x${info.h} frames=${info.frames} loops=${info.loops} total=${info.seconds}s first=${info.firstDelay}cs last=${info.lastDelay}cs`); shown++; }
  }
}
