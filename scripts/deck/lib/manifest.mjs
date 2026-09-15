/**
 * lib/manifest.mjs — 2.5.0 input contract. INPUT LAYER ONLY.
 *
 * This module never renders anything. It reads declarations, merges them
 * field-by-field, validates them, detects where reverse-engineering is ambiguous,
 * and produces the per-slide plan the renderer consumes. The render core (canvas
 * recording, GIF encoding, clock takeover, pixel capture, layout, playback) is
 * untouched by design and is fingerprinted separately (tools/core-hash.mjs).
 *
 * FROZEN DECISIONS (the generation side does not choose these)
 *   merge-intent field name .... slides[].layers[].intent = "merge"
 *   cross-source array matching  by POSITION; differing lengths => FAIL
 *   ambiguity outcomes           see AMB / staticAmbiguity / runtimeAmbiguity
 *
 * TRUTH-SOURCE RULES (spec §4)
 *   1. DOM-mapping fields  stage, slides[].index, layers[].cls, layers[].delayMs,
 *                          layers[].members, motion[].slide
 *        undeclared -> HTML/DOM decides; declared -> must equal DOM exactly, else FAIL
 *   2. Structure-intent    layers[].intent
 *        HTML cannot express it -> declaration decides, but must not contradict
 *        observable DOM facts (members pointing at missing elements => FAIL)
 *   3. Runtime motion      motion[].owner / kind / loopMs
 *        owner must exist in the DOM; kind must match the runtime fact; loopMs
 *        decides frame count and duration; motion absent -> runtime probing;
 *        motion present but empty / no entry for a page -> explicitly no motion,
 *        and a moving canvas found at runtime => FAIL
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const EMBED_ID = "deck-manifest";
export const SIDECAR_NAME = "deck.manifest.json";
export const SCHEMA_VERSION = 1;
export const INTENT_MERGE = "merge";

/** Codes are stable so the delivery table can cite them. */
export const ERR = {
  REQUIRED: "E_REQUIRED",
  CONFLICT: "E_CONFLICT",
  SHAPE: "E_SHAPE",
  MOTION_ENTRY: "E_MOTION_ENTRY",
  INTENT_NO_G6: "E_INTENT_WITHOUT_G6",
  AMBIGUOUS_UNDECLARED: "E_AMBIGUOUS_UNDECLARED",
  DOM_MISMATCH: "E_DOM_MISMATCH",
  MOTION_KIND: "E_MOTION_KIND",
  MOTION_ABSENT_BUT_MOVING: "E_MOTION_DECLARED_NONE_BUT_MOVING",
  MEMBERS_MISSING: "E_MEMBERS_NOT_IN_DOM",
};

/** Ambiguity codes produced by the detectors. */
export const AMB = {
  STAGE: "A_STAGE",
  INDEX: "A_INDEX",
  CLS: "A_CLS",
  DELAY: "A_DELAY",
  MEMBERS: "A_MEMBERS",
};

/* ────────────────────────────── reading ─────────────────────────────────── */

/** Extract the embedded <script type="application/json" id="deck-manifest">. */
export function readEmbedded(htmlText) {
  const re = new RegExp(
    `<script[^>]*type=["']application/json["'][^>]*id=["']${EMBED_ID}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "i",
  );
  const m = re.exec(htmlText);
  if (!m) return { present: false, value: null };
  try {
    return { present: true, value: JSON.parse(m[1]) };
  } catch (e) {
    return { present: true, value: null, parseError: `embedded JSON parse failed: ${e.message}` };
  }
}

/** Read the sidecar next to the HTML. */
export function readSidecar(htmlPath) {
  const p = join(dirname(htmlPath), SIDECAR_NAME);
  if (!existsSync(p)) return { present: false, value: null, path: p };
  try {
    return { present: true, value: JSON.parse(readFileSync(p, "utf8")), path: p };
  } catch (e) {
    return { present: true, value: null, path: p, parseError: `sidecar JSON parse failed: ${e.message}` };
  }
}

/* ──────────────────────── field-level merge (§5) ─────────────────────────── */

/**
 * Merge two declaration sources field by field.
 * A field declared by BOTH sources is a conflict regardless of value equality.
 * Arrays are matched by position; differing lengths are a shape conflict.
 */
export function mergeDeclarations(embedded, sidecar) {
  const errors = [];
  const provenance = new Map();
  const out = {};
  const srcs = [];
  if (embedded?.present) srcs.push(["embedded", embedded.value]);
  if (sidecar?.present) srcs.push(["sidecar", sidecar.value]);
  if (!srcs.length) return { present: false, merged: null, provenance, errors };

  const claim = (path, from) => {
    if (provenance.has(path)) {
      if (provenance.get(path) !== from) {
        errors.push({ code: ERR.CONFLICT, field: path, detail: `declared by both ${provenance.get(path)} and ${from}` });
        return false;
      }
      return false;
    }
    provenance.set(path, from);
    return true;
  };

  for (const [from, v] of srcs) {
    if (!v || typeof v !== "object") {
      errors.push({ code: ERR.SHAPE, field: "(root)", detail: `${from}: not an object` });
      continue;
    }
    for (const k of ["version", "capturePad"]) {
      if (k in v && claim(k, from)) out[k] = v[k];
    }
    if (v.stage && typeof v.stage === "object") {
      if (!out.stage) out.stage = {};
      for (const k of ["width", "height"]) if (k in v.stage && claim(`stage.${k}`, from)) out.stage[k] = v.stage[k];
    }
    if (Array.isArray(v.slides)) {
      if (out.slides && out.slides.length !== v.slides.length) {
        errors.push({ code: ERR.SHAPE, field: "slides", detail: `array length differs between sources (${out.slides.length} vs ${v.slides.length})` });
      } else if (!out.slides) {
        out.slides = v.slides.map(() => ({ layers: [] }));
        for (let i = 0; i < v.slides.length; i++) claim(`slides[${i}]`, from);
      }
      for (let i = 0; i < v.slides.length; i++) {
        const s = v.slides[i], dest = out.slides[i];
        if (!s || typeof s !== "object") { errors.push({ code: ERR.SHAPE, field: `slides[${i}]`, detail: "not an object" }); continue; }
        if ("index" in s && claim(`slides[${i}].index`, from)) dest.index = s.index;
        if (!Array.isArray(s.layers)) continue;
        if (dest.layers.length && dest.layers.length !== s.layers.length) {
          errors.push({ code: ERR.SHAPE, field: `slides[${i}].layers`, detail: "array length differs between sources" });
          continue;
        }
        if (!dest.layers.length) {
          dest.layers = s.layers.map(() => ({}));
          for (let j = 0; j < s.layers.length; j++) claim(`slides[${i}].layers[${j}]`, from);
        }
        for (let j = 0; j < s.layers.length; j++) {
          const L = s.layers[j], D = dest.layers[j];
          if (!L || typeof L !== "object") { errors.push({ code: ERR.SHAPE, field: `slides[${i}].layers[${j}]`, detail: "not an object" }); continue; }
          for (const k of ["cls", "delayMs", "intent"]) if (k in L && claim(`slides[${i}].layers[${j}].${k}`, from)) D[k] = L[k];
          if ("members" in L) {
            if (!Array.isArray(L.members) || !L.members.length) {
              errors.push({ code: ERR.SHAPE, field: `slides[${i}].layers[${j}].members`, detail: "members must be a non-empty array of selectors" });
            } else if (claim(`slides[${i}].layers[${j}].members`, from)) D.members = L.members.slice();
          }
        }
      }
    }
    if (Array.isArray(v.motion)) {
      if (claim("motion", from)) {
        out.motion = v.motion.map((mm, i) => {
          const e = { ...mm };
          for (const k of ["slide", "owner", "kind", "loopMs"]) {
            if (!(k in e)) errors.push({ code: ERR.MOTION_ENTRY, field: `motion[${i}].${k}`, detail: "required when motion is declared" });
          }
          return e;
        });
      }
    }
  }
  return { present: true, merged: out, provenance, errors };
}

/* ───────────────────────── declaration validation ───────────────────────── */

export function validateDeclaration(merged, { g6Attested = false } = {}) {
  const errors = [];
  if (!merged) return errors;
  if (!("version" in merged)) errors.push({ code: ERR.REQUIRED, field: "version", detail: "required" });
  else if (merged.version !== SCHEMA_VERSION) errors.push({ code: ERR.SHAPE, field: "version", detail: `must be ${SCHEMA_VERSION}` });
  if (!("capturePad" in merged)) errors.push({ code: ERR.REQUIRED, field: "capturePad", detail: "required (HTML cannot express it)" });
  else if (!Number.isInteger(merged.capturePad) || merged.capturePad < 0) errors.push({ code: ERR.SHAPE, field: "capturePad", detail: "must be a non-negative integer" });
  if (merged.stage) for (const k of ["width", "height"]) if (k in merged.stage && (!Number.isInteger(merged.stage[k]) || merged.stage[k] <= 0)) errors.push({ code: ERR.SHAPE, field: `stage.${k}`, detail: "must be a positive integer" });
  for (const [i, s] of (merged.slides ?? []).entries()) {
    if ("index" in s && (!Number.isInteger(s.index) || s.index < 1)) errors.push({ code: ERR.SHAPE, field: `slides[${i}].index`, detail: "must be an integer >= 1" });
    for (const [j, L] of (s.layers ?? []).entries()) {
      if ("delayMs" in L && (!Number.isFinite(L.delayMs) || L.delayMs < 0)) errors.push({ code: ERR.SHAPE, field: `slides[${i}].layers[${j}].delayMs`, detail: "must be a number >= 0" });
      if ("intent" in L && L.intent !== INTENT_MERGE) errors.push({ code: ERR.SHAPE, field: `slides[${i}].layers[${j}].intent`, detail: `only "${INTENT_MERGE}" is defined` });
      // §8 / §11 G6: the merge-intent field may only appear in a production
      // manifest once the truth-source classification has been attested.
      if (L.intent === INTENT_MERGE && !g6Attested) {
        errors.push({ code: ERR.INTENT_NO_G6, field: `slides[${i}].layers[${j}].intent`, detail: "merge intent present while G6 is not attested" });
      }
    }
  }
  for (const [i, mm] of (merged.motion ?? []).entries()) {
    if (mm && typeof mm === "object" && "kind" in mm && !["canvas", "css"].includes(mm.kind)) {
      errors.push({ code: ERR.MOTION_KIND, field: `motion[${i}].kind`, detail: `unsupported kind "${mm.kind}"` });
    }
    if (mm && typeof mm === "object" && "loopMs" in mm && (!Number.isFinite(mm.loopMs) || mm.loopMs <= 0)) {
      errors.push({ code: ERR.SHAPE, field: `motion[${i}].loopMs`, detail: "must be a positive number" });
    }
  }
  return errors;
}

/* ─────────────── static ambiguity detection (§6 criteria) ────────────────── */

/**
 * Static detectors — everything decidable without a DOM. The two that genuinely
 * need the DOM (index order, member nesting) live in `runtimeAmbiguity` and are
 * evaluated at the first DOM pass, before any capture.
 */
export function staticAmbiguity(facts) {
  const amb = new Map();
  const { config, classesOnPages, declaredClassDelays, elementsWithoutClass, elementsWithMultipleClasses } = facts;

  if (!config?.width || !config?.height) amb.set(AMB.STAGE, "no stage size in config and the HTML cannot decide it");
  if (!config?.slide) amb.set(AMB.INDEX, "no slide selector is declared");

  if (elementsWithMultipleClasses > 0) amb.set(AMB.CLS, `${elementsWithMultipleClasses} layer element(s) carry more than one .aN class`);
  const anyClass = [...(classesOnPages ?? [])].some((s) => s.classes.length > 0);
  if (anyClass && elementsWithoutClass > 0) amb.set(AMB.CLS, `${elementsWithoutClass} layer element(s) carry no .aN class while others do (mixed convention)`);

  for (const s of classesOnPages ?? []) {
    let hit = false;
    for (const c of s.classes) if (!declaredClassDelays?.has(c)) { amb.set(AMB.DELAY, `class .${c} on page ${s.page} has no uniquely declared delay`); hit = true; break; }
    if (hit) break;
  }
  if (!anyClass && !Array.isArray(config?.groups?.delays)) {
    amb.set(AMB.DELAY, "no .aN classes and no config-declared delay table");
  }
  return amb;
}

/** DOM-dependent detectors, run at the first DOM pass before any capture. */
export function runtimeAmbiguity({ slideIndexOrderUnique, nestedLayerGroups }) {
  const amb = new Map();
  if (!slideIndexOrderUnique) amb.set(AMB.INDEX, "slide elements are not a unique, ordered child list of the page container");
  if (nestedLayerGroups?.length) amb.set(AMB.MEMBERS, `nested layer members on page(s) ${nestedLayerGroups.join(",")}: membership is not derivable from the class rule`);
  return amb;
}

/* ───────────────── patch merge (§7) — the whole point ───────────────────── */

/**
 * §7 补丁式合并：
 *   1. reverse-engineering runs first, ONLY to locate ambiguity
 *   2. unambiguous + declared   -> compare with the DOM fact; mismatch => FAIL
 *   3. ambiguous + undeclared   -> FAIL (no guessing, no fallback)
 *   4. unambiguous + undeclared -> DOM value
 *   5. ambiguous + declared     -> declaration decides, but must not contradict
 *                                  observable DOM facts
 *   6. never silent, never degrade
 */
export function patchMerge({ merged, amb, dom }) {
  const errors = [];
  const notes = [];

  // 3. every ambiguous dimension must be covered by a declaration somewhere
  const allSlidesFully = (key) =>
    (merged?.slides ?? []).length > 0 &&
    merged.slides.every((s) => (s.layers ?? []).length > 0 && s.layers.every((L) => key(L)));
  const covers = {
    [AMB.STAGE]: () => !!(merged?.stage && "width" in merged.stage && "height" in merged.stage),
    [AMB.INDEX]: () => (merged?.slides ?? []).length > 0 && merged.slides.every((s) => "index" in s),
    [AMB.CLS]: () => allSlidesFully((L) => "cls" in L),
    [AMB.DELAY]: () => allSlidesFully((L) => "delayMs" in L),
    [AMB.MEMBERS]: () => allSlidesFully((L) => Array.isArray(L.members)) || Array.isArray(merged?.motion),
  };
  for (const [code, detail] of amb) {
    if (!covers[code]?.()) errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: code, detail });
    else notes.push(`${code} resolved by declaration`);
  }

  // 2./5. declared DOM-mapping fields must equal the DOM fact
  const bySlide = new Map((merged?.slides ?? []).map((s, i) => [s.index ?? i + 1, s]));
  const plan = { slides: new Map(), motion: new Map(), capturePad: merged?.capturePad, stage: merged?.stage ?? null };
  for (const d of dom.slides) {
    const dec = bySlide.get(d.page);
    const layers = [];
    if (dec?.layers?.length) {
      if (dec.layers.length !== d.layers.length) {
        errors.push({ code: ERR.DOM_MISMATCH, field: `slide ${d.page}.layers`, detail: `declared ${dec.layers.length} layer(s), DOM has ${d.layers.length}` });
      }
      for (let j = 0; j < dec.layers.length; j++) {
        const L = dec.layers[j], fact = d.layers[j];
        if (!fact) continue;
        if ("cls" in L && L.cls !== fact.cls) errors.push({ code: ERR.DOM_MISMATCH, field: `slide ${d.page}.layer ${j}.cls`, detail: `declared "${L.cls}", DOM "${fact.cls}"` });
        if ("delayMs" in L && L.delayMs !== fact.delayMs) errors.push({ code: ERR.DOM_MISMATCH, field: `slide ${d.page}.layer ${j}.delayMs`, detail: `declared ${L.delayMs}, DOM ${fact.delayMs}` });
        // §2: members must not contradict the DOM (a selector that resolves to
        // nothing, or a set that differs from the DOM layer, is a conflict).
        if (Array.isArray(L.members) && fact.memberCount !== L.members.length) {
          errors.push({ code: ERR.DOM_MISMATCH, field: `slide ${d.page}.layer ${j}.members`, detail: `declared ${L.members.length} member(s), DOM layer has ${fact.memberCount}` });
        }
        layers.push({ ...fact, declared: true, intent: L.intent, members: L.members ?? null });
      }
    } else {
      layers.push(...d.layers.map((f) => ({ ...f, declared: false })));
    }
    plan.slides.set(d.page, layers);
  }

  // 3. stated motion must match the runtime fact
  const declaredMotion = merged && "motion" in merged ? merged.motion : null;
  for (const m of declaredMotion ?? []) {
    const found = dom.motion.find((x) => x.page === m.slide && x.owner === m.owner);
    if (!found) { errors.push({ code: ERR.DOM_MISMATCH, field: `motion ${m.slide}/${m.owner}`, detail: "owner not found in the DOM" }); continue; }
    if (m.kind !== found.kind) errors.push({ code: ERR.MOTION_KIND, field: `motion ${m.slide}/${m.owner}`, detail: `declared kind "${m.kind}", runtime "${found.kind}"` });
    plan.motion.set(`${m.slide}|${m.owner}`, { loopMs: m.loopMs, kind: m.kind });
  }
  if (declaredMotion) {
    for (const f of dom.motion) {
      const hit = declaredMotion.some((m) => m.slide === f.page && m.owner === f.owner);
      if (!hit) errors.push({ code: ERR.MOTION_ABSENT_BUT_MOVING, field: `slide ${f.page} ${f.owner}`, detail: "motion was declared (possibly empty) yet this element is moving at runtime" });
    }
  }
  return { plan, errors, notes };
}

/* ───────────────────────────── entry point ─────────────────────────────── */

export function loadAndPlan({ htmlPath, htmlText, config, facts, g6Attested = false }) {
  const embedded = readEmbedded(htmlText);
  const sidecar = readSidecar(htmlPath);
  const errors = [];
  for (const s of [embedded, sidecar]) if (s.parseError) errors.push({ code: ERR.SHAPE, field: "(json)", detail: s.parseError });
  const m = mergeDeclarations(embedded, sidecar);
  if (!m.present) return { present: false, errors, merged: null, amb: new Map(), plan: null, sources: { embedded: false, sidecar: false } };
  errors.push(...m.errors);
  errors.push(...validateDeclaration(m.merged, { g6Attested }));
  const amb = staticAmbiguity(facts);
  return {
    present: true, errors, merged: m.merged, provenance: m.provenance, amb, plan: null,
    sources: { embedded: embedded.present, sidecar: sidecar.present, sidecarPath: sidecar.path },
  };
}
