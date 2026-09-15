/**
 * tools/validate-manifest.mjs — declaration legality checker AND ambiguity reporter.
 *
 * It never renders. Two jobs:
 *   1. Validate a production manifest's own legality against the schema rules
 *      (required fields, conflicts between sources, per-entry requirements,
 *      merge-intent gating) — this is the pre-browser half of G2.
 *   2. Report, per deck, WHICH fields reverse-engineering finds ambiguous, i.e.
 *      which fields a manifest for that deck would be REQUIRED to declare.
 *
 * Usage:
 *   node tools/validate-manifest.mjs <deck.config.json>            DEFAULT: validation gate
 *   node tools/validate-manifest.mjs <deck.config.json> --report   advisory report
 *
 * DEFAULT mode mirrors what the renderer does: every declaration error counts
 * towards the exit code, E_AMBIGUOUS_UNDECLARED included. A checker that exits 0
 * while the pipeline refuses the same manifest is a contradiction the quality
 * constraint does not allow.
 *
 * --report keeps the advisory behaviour — it answers "which fields would a
 * manifest for this deck have to declare?" — so an unresolved ambiguity is
 * information there rather than a verdict, and is excluded from the exit code.
 *
 * NOT decidable here: A_MEMBERS is a RUNTIME ambiguity, so it takes a DOM to see
 * whether members nest. Even in default mode a 0 means "legally well-formed",
 * not "the renderer will accept it". The renderer stays authoritative for
 * runtime coverage; U4 covers that path.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import {
  loadAndPlan, staticAmbiguity, runtimeUnresolved, AMB, ERR, SCHEMA_VERSION, EMBED_ID, SIDECAR_NAME,
} from "../lib/manifest.mjs";

const cfgPath = resolve(process.argv[2] ?? "deck.config.json");
const report = process.argv.includes("--report");
if (!existsSync(cfgPath)) { console.error(`config not found: ${cfgPath}`); process.exit(2); }
const config = JSON.parse(readFileSync(cfgPath, "utf8"));
const projectRoot = dirname(cfgPath);
const htmlPath = resolve(projectRoot, config.html);
const html = readFileSync(htmlPath, "utf8");
const specPath = resolve(projectRoot, config.animSpec ?? "anim-spec.json");
const spec = existsSync(specPath) ? JSON.parse(readFileSync(specPath, "utf8")) : null;

/* ── facts the static detectors need ─────────────────────────────────────── */

const declaredClassDelays = new Map();
for (const r of spec?.entranceRules ?? []) {
  const m = /\.(a\d+)\s*$/.exec((r.selector ?? "").replace(/\s+/g, " ").trim());
  if (m && !r.infinite && typeof r.delayMs === "number") declaredClassDelays.set(m[1], r.delayMs);
}

const sel = config.groups?.selector ?? "";
const isClassSelector = /\.a\d+/.test(sel);
const sections = html.split(/<section\b[^>]*class="[^"]*\bslide\b/).slice(1);
const classesOnPages = sections.map((raw, i) => {
  const body = raw.split("</section>")[0];
  const set = new Set();
  for (const c of body.matchAll(/class="([^"]*)"/g)) {
    for (const tok of c[1].split(/\s+/)) if (/^a\d+$/.test(tok)) set.add(tok);
  }
  return { page: i + 1, classes: [...set] };
});
let elementsWithMultipleClasses = 0, elementsWithoutClass = 0;
for (const raw of sections) {
  const body = raw.split("</section>")[0];
  for (const c of body.matchAll(/class="([^"]*)"/g)) {
    const an = c[1].split(/\s+/).filter((t) => /^a\d+$/.test(t));
    if (an.length > 1) elementsWithMultipleClasses++;
  }
}

const facts = { config, classesOnPages, declaredClassDelays, elementsWithoutClass, elementsWithMultipleClasses };

/* ── 1. manifest legality (pre-browser half of G2) ───────────────────────── */

const res = loadAndPlan({ htmlPath, htmlText: html, config, facts, g6Attested: false });
const g6Attested = existsSync(join(projectRoot, "deck.manifest.g6-attested"));

console.log(`MANIFEST CHECK  ${cfgPath}`);
console.log(`  html            : ${htmlPath}`);
console.log(`  embedded <script id="${EMBED_ID}">  : ${res.sources.embedded ? "present" : "absent"}`);
console.log(`  sidecar ${SIDECAR_NAME} : ${res.sources.sidecar ? "present" : "absent"}`);

if (!res.present) {
  console.log("  manifest        : ABSENT -> full fallback to reverse-engineering (G3 path)");
} else {
  console.log(`  merged fields   : ${[...(res.provenance?.keys() ?? [])].join(", ") || "(none)"}`);
  // Default mode lists every error, because every error is fatal to the run.
  // --report lists ambiguity separately: advice there, not a verdict.
  const shown = report ? res.errors.filter((e) => e.code !== ERR.AMBIGUOUS_UNDECLARED) : res.errors;
  const ambErrs = report ? res.errors.filter((e) => e.code === ERR.AMBIGUOUS_UNDECLARED) : [];
  if (shown.length) {
    console.log(`  DECLARATION ERRORS (${shown.length}):`);
    for (const e of shown) console.log(`    ${e.code}  ${e.field}  ${e.detail}`);
  } else {
    console.log("  declaration     : legal (version/capturePad present, no conflicts, entries well-formed)");
  }
  if (ambErrs.length) {
    console.log(`  ADVISORY (--report only, not counted in the exit code): ${ambErrs.length}`);
    for (const e of ambErrs) console.log(`    ${e.code}  ${e.field}  ${e.detail}`);
  }
  console.log(`  g6 attestation  : ${g6Attested ? "present" : "absent"} (merge-intent field ${g6Attested ? "allowed" : "would FAIL with E_INTENT_WITHOUT_G6"})`);
}

/* ── 2. ambiguity report: which fields a manifest MUST declare ───────────── */

const runtimeUnresEarly = res.present ? runtimeUnresolved(res.merged, sections.length) : [];

if (report) {
  const amb = staticAmbiguity(facts);
  console.log(`\n  reverse-engineering mode : ${isClassSelector ? "class-based (.aN)" : "config-declared selector"}`);
  console.log(`  pages                    : ${sections.length}`);
  console.log(`  distinct .aN classes/page: ${classesOnPages.map((s) => s.classes.length).join(",")}`);
  console.log(`  declared class delays    : ${declaredClassDelays.size ? [...declaredClassDelays.entries()].map(([k, v]) => `${k}=${v}`).join(" ") : "(none)"}`);
  console.log(`  STATIC ambiguity:`);
  if (!amb.size) console.log("    none — a manifest for this deck would need only version + capturePad");
  for (const [code, detail] of amb) console.log(`    ${code}  ${detail}`);
  console.log(`  RUNTIME ambiguity (needs the DOM; evaluated at the first pass, before any capture):`);
  console.log(`    A_MEMBERS  nested layer members (one .aN member containing another member of the same class)`);
  console.log(`    A_INDEX    slide order not a unique ordered child list of the page container`);
  const need = [...amb.keys()];
  // Static and runtime are stated SEPARATELY, never merged into one
  // "REQUIRED" line. The merged line used to tell the reader that
  // version+capturePad were enough for a deck whose page 7 genuinely nests its
  // members — the sentence this whole class of divergence started from.
  console.log(`\n  => static : version, capturePad${need.length ? ", plus coverage for " + need.join(", ") : ""}`);
  console.log(`  => runtime: ${runtimeUnresEarly.length ? `UNRESOLVED (${runtimeUnresEarly.map((u) => u.code).join(", ")}, ${sections.length} page(s))` : "resolved"}`);
}

/* ── 3. runtime dimensions: undecidable on paper ─────────────────────────── */

const runtimeUnres = runtimeUnresEarly;
if (runtimeUnres.length) {
  console.log(`\n  RUNTIME UNRESOLVED (no DOM here): ${runtimeUnres.length}`);
  for (const u of runtimeUnres) console.log(`    ${u.code}  ${u.detail}`);
  console.log("    this checker alone cannot certify the manifest while these remain; the renderer is authoritative");
}

// DEFAULT: every declaration error is fatal, E_AMBIGUOUS_UNDECLARED included,
// and a runtime dimension that cannot be settled on paper fails conservatively.
// Exiting 0 here must never imply "the renderer will accept it".
// --report: advisory only, nothing counts towards the exit code.
const fatal = report
  ? res.errors.filter((e) => e.code !== ERR.AMBIGUOUS_UNDECLARED)
  : res.errors;
const runtimeFatal = report ? [] : runtimeUnres;
process.exit(res.present && (fatal.length || runtimeFatal.length) ? 1 : 0);
