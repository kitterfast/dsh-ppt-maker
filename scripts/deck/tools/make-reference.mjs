/**
 * Regenerate lib/reference-entrance.xml — the entrance form that is CONFIRMED to
 * play — from a deck known to animate.
 *
 *   node tools/make-reference.mjs <proven-deck.pptx> [slideNo]
 *
 * The stored block is compared by deck-verify.mjs against every generated slide.
 * Source of truth is deliberately a real deck that plays (verified by capturing
 * frames from a running slide show, see tools/show-start-frames.ps1), not a
 * hand-written expectation.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const src = process.argv[2] ?? join(here, "..", "lib", "calib", "calib-fly.pptx");
const slideNo = process.argv[3] ?? "1";
const out = join(here, "..", "lib", "reference-entrance.xml");

if (!existsSync(src)) {
  console.error(`missing ${src}`);
  process.exit(1);
}
const require = createRequire(join(process.cwd(), "package.json"));
const JSZip = require("jszip");
const zip = await JSZip.loadAsync(readFileSync(src));
const name = `ppt/slides/slide${slideNo}.xml`;
const xml = await zip.file(name).async("string");
const timing = xml.match(/<p:timing>[\s\S]*?<\/p:timing>/)?.[0];
if (!timing) {
  console.error(`no p:timing in ${src} / ${name}`);
  process.exit(1);
}
writeFileSync(out, timing, "utf8");
console.log(`wrote ${out} (${timing.length} chars, UTF-8) from ${src} ${name}`);
