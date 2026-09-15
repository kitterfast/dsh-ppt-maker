/**
 * gate-e.mjs — motion gate. Every runtime canvas must survive as a moving picture,
 * in the right place, with the right number of frames.
 *
 * The GIF frame count is read straight from the GIF binary (image separators), so
 * nothing here trusts the renderer's own bookkeeping beyond the manifest's
 * declared expectations, which are then cross-checked against the file.
 *
 * Usage: node tools/gate-e.mjs --deck <unpackedDeck> --render <renderDir> --out <log.txt>
 * Exit: 0 = PASS, 1 = FAIL, 2 = usage/IO.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const deckDir = get("--deck"), renderDir = get("--render"), outFile = get("--out");
if (!deckDir || !renderDir) { console.error("usage: --deck <dir> --render <dir> [--out f]"); process.exit(2); }

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };

/** GIF frame count + pixel size by walking the binary (no dependencies). */
function gifInfo(file) {
  const b = fs.readFileSync(file);
  if (b.slice(0, 3).toString("latin1") !== "GIF") return null;
  const w = b.readUInt16LE(6), h = b.readUInt16LE(8);
  const flags = b[10];
  let p = 13;
  if (flags & 0x80) p += 3 * (1 << ((flags & 0x07) + 1));   // global colour table
  let frames = 0;
  const skipSub = () => { while (p < b.length) { const n = b[p++]; if (n === 0) break; p += n; } };
  while (p < b.length) {
    const blk = b[p++];
    if (blk === 0x3b) break;                                  // trailer
    if (blk === 0x21) { p++; skipSub(); continue; }           // extension
    if (blk === 0x2c) {                                       // image descriptor
      frames++;
      const lf = b[p + 8];
      p += 9;
      if (lf & 0x80) p += 3 * (1 << ((lf & 0x07) + 1));       // local colour table
      p++;                                                    // LZW min code size
      skipSub();
      continue;
    }
    break;                                                    // malformed
  }
  return { w, h, frames, bytes: b.length };
}

const manifest = JSON.parse(fs.readFileSync(path.join(renderDir, "manifest.json"), "utf8"));
const scale = manifest.settings?.captureScale ?? 2;
const EMU = 9525;

function slidePics(n) {
  const dir = path.join(deckDir, "ppt", "slides");
  const xml = fs.readFileSync(path.join(dir, `slide${n}.xml`), "utf8");
  const rels = fs.readFileSync(path.join(dir, "_rels", `slide${n}.xml.rels`), "utf8");
  const rel = new Map();
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]*)"/g)) rel.set(m[1], m[2].split("/").pop());
  const out = [];
  for (const m of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
    const emb = /r:embed="([^"]+)"/.exec(m[0]);
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(m[0]);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(m[0]);
    out.push({
      media: rel.get(emb?.[1]) ?? "",
      x: +off[1] / EMU, y: +off[2] / EMU, w: +ext[1] / EMU, h: +ext[2] / EMU,
    });
  }
  return out;
}

say(`GATE E  ${deckDir}`);
say(`  render manifest: ${path.join(renderDir, "manifest.json")}   captureScale=${scale}`);
say("  page  canvasBits  gifPics  frames(manifest/file)  sizePx(file)  boxPx(deck)            verdict");

let fails = 0, checked = 0;
for (const s of manifest.slides) {
  const bits = (s.groups ?? []).flatMap((g) => (g.bits ?? []).filter((b) => b.gif).map((b) => ({ ...b, k: g.k })));
  const pics = slidePics(s.page);
  const gifPics = pics.filter((p) => p.media.endsWith(".gif"));
  const details = [];
  let ok = true;
  if (bits.length === 0) { ok = gifPics.length === 0; details.push("no canvas declared, no gif present"); }
  else {
    if (gifPics.length < bits.length) { ok = false; details.push(`declared ${bits.length} canvas gif(s), deck has ${gifPics.length}`); }
    for (const b of bits) {
      const f = path.join(renderDir, b.gif);
      if (!fs.existsSync(f)) { ok = false; details.push(`missing file ${b.gif}`); continue; }
      const info = gifInfo(f);
      if (!info) { ok = false; details.push(`${b.gif} not a GIF`); continue; }
      checked++;
      const framesOk = b.gifFrames === undefined || info.frames === b.gifFrames;
      if (!framesOk) { ok = false; details.push(`frames manifest=${b.gifFrames} file=${info.frames}`); }
      const anchor = b.box;
      const match = gifPics.find((p) => Math.abs(p.x - anchor.x) <= 1 && Math.abs(p.y - anchor.y) <= 1);
      if (!match) { ok = false; details.push(`no gif picture at declared box ${anchor.x},${anchor.y}`); }
      else {
        const dw = Math.abs(info.w / scale - match.w), dh = Math.abs(info.h / scale - match.h);
        if (dw > 1 || dh > 1) { ok = false; details.push(`size mismatch gif=${info.w}x${info.h}px box=${match.w}x${match.h}px (Δ ${dw.toFixed(2)},${dh.toFixed(2)})`); }
        details.push(`${b.gif}: frames=${info.frames} size=${info.w}x${info.h}px box=${match.x.toFixed(1)},${match.y.toFixed(1)} ${match.w.toFixed(1)}x${match.h.toFixed(1)}`);
      }
    }
  }
  if (!ok) fails++;
  say(`  ${String(s.page).padStart(4)}  ${String(bits.length).padStart(10)}  ${String(gifPics.length).padStart(7)}  ${" ".padStart(20)}  ${" ".padStart(12)}  ${" ".padStart(22)}  ${ok ? "PASS" : "FAIL"}`);
  for (const d of details) say(`         · ${d}`);
}
say(`\n  pages failing = ${fails} / ${manifest.slides.length}   canvas gifs checked = ${checked}`);
say(`  RESULT: ${fails === 0 ? "PASS" : "FAIL"}`);
if (outFile) fs.writeFileSync(outFile, lines.join("\r\n"), "utf8");
process.exit(fails === 0 ? 0 : 1);
