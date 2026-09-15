/**
 * Peek at one deck's derived render facts — the evidence reader for T2/U4.
 *
 * Prints, for a given page, exactly what the renderer derived (or, on the
 * declared path, what it accepted): each layer's class, delay, dropped flag,
 * canvas/gif binding and bit count. T2 compares this between the reverse and
 * the declared path; U4 needs it to author a declaration that must match the
 * DOM exactly.
 *
 * Usage: node tools/peek.mjs <deckDir> [page]
 */
import { readFileSync, existsSync } from "node:fs";

const deck = process.argv[2];
if (!deck) {
  console.error("Usage: node tools/peek.mjs <deckDir> [page]");
  process.exit(2);
}
const page = Number(process.argv[3] ?? 7);

const mf = `${deck}/render/manifest.json`;
if (!existsSync(mf)) {
  console.error(`missing ${mf}`);
  process.exit(2);
}
const m = JSON.parse(readFileSync(mf, "utf8"));
console.log(`deckHash=${m.deckHash}  slides=${m.slides.length}  ${m.width}x${m.height}`);
console.log(`settings.capturePad=${m.settings?.capturePad ?? "(not recorded)"}`);

const s = m.slides.find((x) => x.page === page);
if (!s) {
  console.error(`no page ${page}`);
  process.exit(2);
}
console.log(`\n--- p${s.page} (index=${s.index}) groups=${s.groups.length} ---`);
for (const g of s.groups) {
  console.log(
    JSON.stringify({
      k: g.k,
      cls: g.cls,
      delayMs: g.delayMs,
      dropped: g.dropped,
      canvas: g.canvas,
      gif: g.gif,
      gifFrames: g.gifFrames,
      gifMoves: g.gifMoves,
      permanent: g.permanent,
      moveY: g.moveY,
      nbits: (g.bits || []).length,
      text: (g.text || "").slice(0, 34),
    }),
  );
}

const cfg = `${deck}/deck.config.json`;
if (existsSync(cfg)) {
  console.log("\n--- deck.config.json ---");
  console.log(readFileSync(cfg, "utf8"));
}
