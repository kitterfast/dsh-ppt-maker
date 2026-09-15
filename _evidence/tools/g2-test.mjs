/**
 * G2 negative tests: a production manifest must FAIL before the browser starts.
 * Case C is also the minimal real manifest for the reference deck and doubles as
 * the A_MEMBERS coverage check (§7 step 5).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadAndPlan, staticAmbiguity } from "../lib/manifest.mjs";

const SRC = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/refdeck/ref.html";
const config = JSON.parse(readFileSync("C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/refdeck/deck.config.json", "utf8"));
const DIR = "C:/Users/ASUS/Desktop/格式转化修复/reports/g2";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const base = readFileSync(SRC, "utf8");

const classDelays = new Map([["a1", 40], ["a2", 150], ["a3", 260], ["a4", 370], ["a5", 480], ["a6", 590]]);
const facts = { config, classesOnPages: [{ page: 1, classes: ["a1"] }], declaredClassDelays: classDelays, elementsWithoutClass: 0, elementsWithMultipleClasses: 0 };
const amb = staticAmbiguity(facts);
const ambWithNesting = new Map([...amb, ["A_MEMBERS", "nested layer members on page(s) 7"]]);

function mk(name, embedded, sidecar) {
  const dir = join(DIR, name);
  mkdirSync(dir, { recursive: true });
  const html = embedded === null ? base
    : base.replace("</head>", `<script type="application/json" id="deck-manifest">${JSON.stringify(embedded)}</script></head>`);
  const p = join(dir, "ref.html");
  writeFileSync(p, html, "utf8");
  if (sidecar) writeFileSync(join(dir, "deck.manifest.json"), JSON.stringify(sidecar), "utf8");
  return p;
}

const cases = [
  ["A 内嵌缺 capturePad",        { version: 1 },                                        null, amb,        "E_REQUIRED"],
  ["B 内嵌与 sidecar 同字段",     { version: 1, capturePad: 10 },                        { capturePad: 10 }, amb, "E_CONFLICT"],
  ["C 最小合法声明 + motion",     { version: 1, capturePad: 10, motion: [{ slide: 7, owner: "#threeAI", kind: "canvas", loopMs: 6000 }] }, null, ambWithNesting, "(no error)"],
  ["D 层合并字段但 G6 未过",      null, { version: 1, capturePad: 10, slides: [{ index: 1, layers: [{ cls: "a1", delayMs: 40, members: ["x"], intent: "merge" }] }] }, amb, "E_INTENT_WITHOUT_G6"],
  ["E motion 条目缺字段",         { version: 1, capturePad: 10, motion: [{ slide: 7, owner: "#threeAI" }] }, null, amb, "E_MOTION_ENTRY"],
  ["F 有歧义但未声明 members",     { version: 1, capturePad: 10 },                        null, ambWithNesting, "E_AMBIGUOUS_UNDECLARED"],
];

console.log("G2 NEGATIVE TESTS — every case must decide BEFORE the browser starts\n");
let pass = 0;
for (const [name, emb, side, ambMap, expect] of cases) {
  const htmlPath = mk(name.slice(0, 1), emb, side);
  const html = readFileSync(htmlPath, "utf8");
  const res = loadAndPlan({ htmlPath, htmlText: html, config, facts: { ...facts }, g6Attested: false });
  const codes = [];
  for (const e of res.errors) codes.push(e.code);
  const { patchMerge } = await import("../lib/manifest.mjs");
  let mergeCodes = [];
  if (res.present) {
    // Supply the runtime facts the declaration itself claims, so this suite tests
    // DECLARATION legality only. (With an empty DOM, a declared motion entry
    // correctly reports E_DOM_MISMATCH -- that is the intended §4.3 behaviour,
    // not a bug, and case E relies on it.)
    const domMotion = (res.merged?.motion ?? [])
      .filter((m) => m && m.slide !== undefined && m.owner)
      .map((m) => ({ page: m.slide, owner: m.owner, kind: m.kind }));
    const dom = { slides: [], motion: domMotion };
    mergeCodes = patchMerge({ merged: res.merged, amb: ambMap, dom }).errors.map((e) => e.code);
  }
  const all = new Set([...codes, ...mergeCodes]);
  const ok = expect === "(no error)" ? all.size === 0 : all.has(expect);
  if (ok) pass++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(26)} expect=${expect.padEnd(28)} got=[${[...all].join(",") || "none"}]`);
}
console.log(`\n  ${pass}/${cases.length} cases behaved as specified`);
process.exit(pass === cases.length ? 0 : 1);
