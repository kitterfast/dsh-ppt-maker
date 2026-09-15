/**
 * gate-d-proxy.mjs — deterministic proxy for the D (playback) gate.
 *
 * Real WPS playback is non-deterministic (frame timing), so it cannot decide
 * "did the integration change behaviour". This reads only the produced slide XML
 * and emits a canonical per-slide fingerprint of everything the playback timeline
 * is built from. Two runs that agree here have byte-identical timelines.
 *
 * Usage:
 *   node tools/gate-d-proxy.mjs --deck <unpackedDeck> --out <file.json>
 *   node tools/gate-d-proxy.mjs --deck <unpackedDeck> --baseline <file.json>
 * Exit: 0 = PASS (or fingerprint written), 1 = comparison FAIL, 2 = usage/IO error.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const deckDir = get("--deck");
const outFile = get("--out");
const baseline = get("--baseline");
if (!deckDir) { console.error("usage: --deck <dir> [--out f.json] [--baseline f.json]"); process.exit(2); }

const slideDir = path.join(deckDir, "ppt", "slides");
const slides = fs.readdirSync(slideDir)
  .filter((f) => /^slide\d+\.xml$/.test(f))
  .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);

const count = (s, needle) => s.split(needle).length - 1;

function fingerprint(n) {
  const xml = fs.readFileSync(path.join(slideDir, `slide${n}.xml`), "utf8");
  const effects = [];
  for (const m of xml.matchAll(/<p:cTn\b([^>]*)>/g)) {
    const attrs = m[1];
    if (!/presetClass="entr"/.test(attrs)) continue;
    const tail = xml.slice(m.index + m[0].length, m.index + m[0].length + 6000);
    const g = (re) => { const r = re.exec(attrs); return r ? r[1] : ""; };
    effects.push({
      presetID: g(/presetID="(\d+)"/),
      presetClass: g(/presetClass="(\w+)"/),
      presetSubtype: g(/presetSubtype="(\d+)"/),
      grpId: g(/grpId="(\d+)"/),
      nodeType: g(/nodeType="(\w+)"/),
      delay: +(/<p:cond\s+delay="(\d+)"/.exec(tail)?.[1] ?? -1),
      spid: +(/<p:spTgt\s+spid="(\d+)"/.exec(tail)?.[1] ?? -1),
    });
  }
  return {
    page: n,
    pics: count(xml, "<p:pic>"),
    effects: effects.length,
    set: count(xml, "<p:set>"),
    animEffect: count(xml, "<p:animEffect"),
    anim: count(xml, "<p:anim "),
    animRot: count(xml, "<p:animRot"),
    bldP: count(xml, "<p:bldP"),
    nodeTypes: effects.map((e) => e.nodeType),
    delays: effects.map((e) => e.delay),
    presetAttrs: effects.map((e) => `${e.presetID}|${e.presetClass}|${e.presetSubtype}|${e.grpId}`),
    spids: effects.map((e) => e.spid),
  };
}

const fp = slides.map((f) => fingerprint(+f.match(/\d+/)[0]));

if (outFile) {
  fs.writeFileSync(outFile, JSON.stringify(fp, null, 1), "utf8");
  console.log(`fingerprint written: ${outFile}`);
}

const hdr = "  page  pics eff  set  aEff anim aRot bldP  nodeTypes              delays";
console.log(hdr);
for (const r of fp) {
  console.log(
    `  ${String(r.page).padStart(4)}  ${String(r.pics).padStart(4)} ${String(r.effects).padStart(3)} ` +
    `${String(r.set).padStart(4)} ${String(r.animEffect).padStart(5)} ${String(r.anim).padStart(4)} ` +
    `${String(r.animRot).padStart(4)} ${String(r.bldP).padStart(4)}  ${r.nodeTypes.join(",").padEnd(20)} [${r.delays.join(",")}]`,
  );
}
console.log(`\n  totals: pics=${fp.reduce((a, r) => a + r.pics, 0)} effects=${fp.reduce((a, r) => a + r.effects, 0)}`);
console.log(`  internal consistency (set==animEffect==anim==animRot==bldP==effects per page): ` +
  `${fp.every((r) => r.set === r.effects && r.animEffect === r.effects && r.anim === r.effects && r.animRot === r.effects && r.bldP === r.effects) ? "OK" : "MISMATCH"}`);

if (baseline) {
  const base = JSON.parse(fs.readFileSync(baseline, "utf8"));
  if (base.length !== fp.length) { console.log(`\nFAIL: page count ${fp.length} vs baseline ${base.length}`); process.exit(1); }
  const diffs = [];
  for (let i = 0; i < fp.length; i++) {
    for (const k of Object.keys(fp[i])) {
      const a = JSON.stringify(base[i][k]), b = JSON.stringify(fp[i][k]);
      if (a !== b) diffs.push(`page ${fp[i].page} field ${k}: baseline=${a} current=${b}`);
    }
  }
  if (diffs.length) { console.log(`\nFAIL: ${diffs.length} difference(s)`); for (const d of diffs.slice(0, 20)) console.log("  " + d); process.exit(1); }
  console.log(`\nPASS: fingerprint identical to baseline (${fp.length} pages, all fields)`);
}
