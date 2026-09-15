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
  SLIDE_NOT_FOUND: "E_SLIDE_NOT_FOUND",
  LAYER_BOX_UNRESOLVED: "E_LAYER_BOX_UNRESOLVED",
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
        if ("page" in s && claim(`slides[${i}].page`, from)) dest.page = s.page;
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
    // The declaration side is 1-BASED everywhere. `page` is the canonical
    // field; `index` is kept as a 1-based alias for schema v1. This is NOT the
    // same thing as the render manifest's slides[].index, which is 0-based —
    // reusing that number here silently targeted the wrong page.
    if ("index" in s && (!Number.isInteger(s.index) || s.index < 1)) errors.push({ code: ERR.SHAPE, field: `slides[${i}].index`, detail: "must be an integer >= 1 (1-based page)" });
    if ("page" in s && (!Number.isInteger(s.page) || s.page < 1)) errors.push({ code: ERR.SHAPE, field: `slides[${i}].page`, detail: "must be an integer >= 1" });
    if (Number.isInteger(s.index) && Number.isInteger(s.page) && s.index !== s.page) {
      errors.push({ code: ERR.CONFLICT, field: `slides[${i}]`, detail: `index ${s.index} and page ${s.page} disagree (both are 1-based page numbers)` });
    }
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

/**
 * Resolve a declared slide's target page. The declaration side is 1-BASED:
 * `page` is canonical, `index` survives as a 1-based alias from schema v1.
 * This must never be confused with the render manifest's slides[].index,
 * which is 0-BASED — that confusion is what silently dropped declarations.
 * Returns { page, via }; page is null when undeclared or self-contradictory.
 */
export function declaredPage(s) {
  const hasPage = Number.isInteger(s?.page);
  const hasIndex = Number.isInteger(s?.index);
  if (hasPage && hasIndex && s.page !== s.index) return { page: null, via: "conflict" };
  if (hasPage) return { page: s.page, via: "page" };
  if (hasIndex) return { page: s.index, via: "index" };
  return { page: null, via: null };
}

const countInto = (arr) => {
  const c = new Map();
  for (const v of arr) c.set(v, (c.get(v) ?? 0) + 1);
  return c;
};

/** Multiset equality — signatures can repeat, so counting is required. */
export function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  const c = countInto(a);
  for (const v of b) {
    const n = c.get(v) ?? 0;
    if (!n) return false;
    c.set(v, n - 1);
  }
  return true;
}

/** Multiset containment: does `sup` contain every element of `sub`? */
export function containsMultiset(sup, sub) {
  const c = countInto(sup);
  for (const v of sub) {
    const n = c.get(v) ?? 0;
    if (!n) return false;
    c.set(v, n - 1);
  }
  return true;
}

/**
 * Coverage of the ambiguity dimensions that are decidable BEFORE a browser runs.
 *
 * Extracted from patchMerge so that loadAndPlan reaches the SAME verdict: a
 * checker that calls a manifest legal while the renderer refuses it is exactly
 * the divergence this contract exists to prevent. A_MEMBERS is deliberately
 * absent here — it needs the DOM; see runtimeUnresolved.
 */
export function coversStatic(merged, amb) {
  const allSlidesFully = (key) =>
    (merged?.slides ?? []).length > 0 &&
    merged.slides.every((s) => (s.layers ?? []).length > 0 && s.layers.every((L) => key(L)));
  // `page` is accepted alongside `index`: both are 1-based page numbers.
  const table = {
    [AMB.STAGE]: () => !!(merged?.stage && "width" in merged.stage && "height" in merged.stage),
    [AMB.INDEX]: () => (merged?.slides ?? []).length > 0 && merged.slides.every((s) => "index" in s || "page" in s),
    [AMB.CLS]: () => allSlidesFully((L) => "cls" in L),
    [AMB.DELAY]: () => allSlidesFully((L) => "delayMs" in L),
  };
  const resolved = [], unresolved = [];
  for (const [code, detail] of amb) {
    if (code === AMB.MEMBERS) continue;
    if (table[code]?.()) resolved.push(code);
    else unresolved.push({ code, detail });
  }
  return { resolved, unresolved };
}

/**
 * Runtime dimensions a DOM pass must decide.
 *
 * A_MEMBERS is the only one that cannot be settled on paper: whether members
 * nest is a property of the rendered DOM. The test below is deliberately
 * CONSERVATIVE — it reports covered only when every layer of every slide names
 * its members, which is sufficient but not necessary. Anything weaker is what
 * let a manifest pass here and be refused by the renderer.
 */
export function runtimeUnresolved(merged, pageCount) {
  const slides = merged?.slides ?? [];
  // Conservatively sufficient AND checkable on paper: the declaration must
  // address EVERY page of the deck, and every layer entry it carries must name
  // members. A single slide entry out of eleven must not read as "fully
  // declared" — with a one-element every() it did, and the checker then
  // certified a manifest that leaves ten pages uncovered.
  const targets = new Set();
  slides.forEach((s, i) => { const r = declaredPage(s); targets.add(r.page ?? i + 1); });
  const allPagesDeclared = Number.isInteger(pageCount) && pageCount > 0
    ? targets.size >= pageCount
    : slides.length > 0;
  const everyLayerNamesMembers =
    slides.length > 0 &&
    slides.every((s) => (s.layers ?? []).length > 0 && s.layers.every((L) => Array.isArray(L.members) && L.members.length));
  return allPagesDeclared && everyLayerNamesMembers
    ? []
    : [{ code: AMB.MEMBERS, detail: `nested layer membership is only decidable once the DOM is available; cover it on paper by addressing all ${Number.isInteger(pageCount) ? pageCount : "?"} page(s) with members entries on every declared layer, or let the renderer decide` }];
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
  // The same function loadAndPlan uses, so the checker and the renderer cannot
  // reach different verdicts on one manifest. A_MEMBERS is still not decided
  // here: it depends on a declaration landing on the ambiguous page, which is
  // only known once the per-page plan below exists.
  const { resolved: staticOk, unresolved: staticBad } = coversStatic(merged, amb);
  for (const code of staticOk) notes.push(`${code} resolved by declaration`);
  for (const u of staticBad) errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: u.code, detail: u.detail });

  // 2./5. declared DOM-mapping fields must equal the DOM fact.
  // A slide declaration is addressed by its 1-BASED page. It is never mapped by
  // array position in silence, and a page the deck does not have is an error
  // rather than a declaration that quietly applies to nothing.
  const bySlide = new Map();
  (merged?.slides ?? []).forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    const r = declaredPage(s);
    if (r.via === "conflict") return; // already reported by validateDeclaration
    if (r.page === null) {
      if (!(s.layers ?? []).length) return;
      bySlide.set(i + 1, s);
      notes.push(`slides[${i}] declares no page/index: read as page ${i + 1} by array position`);
      return;
    }
    if (dom.total && (r.page < 1 || r.page > dom.total)) {
      errors.push({ code: ERR.SLIDE_NOT_FOUND, field: `slides[${i}].${r.via}`, detail: `declared page ${r.page}, but the deck has ${dom.total} page(s)` });
      return;
    }
    if (bySlide.has(r.page)) {
      errors.push({ code: ERR.CONFLICT, field: `slides[${i}].${r.via}`, detail: `page ${r.page} is declared by more than one slide entry` });
      return;
    }
    bySlide.set(r.page, s);
  });
  const plan = { slides: new Map(), motion: new Map(), capturePad: merged?.capturePad, stage: merged?.stage ?? null };
  // Pages where a declaration actually LANDED and carried a members entry.
  // Coverage is read from this set, never from the declaration text at large.
  const membersResolvedPages = new Set();
  for (const d of dom.slides) {
    const dec = bySlide.get(d.page);
    const layers = [];
    if (dec?.layers?.length) {
      // F5 guard: a layer with no element cannot be captured. Letting a null
      // box through turns a validation failure into an uncaught TypeError in
      // clipOf, so it is rejected here, before any capture.
      d.layers.forEach((f, k) => {
        if (!f || !f.box) {
          errors.push({ code: ERR.LAYER_BOX_UNRESOLVED, field: `slide ${d.page}.layer ${k}`, detail: `layer "${f?.cls ?? "?"}" has no resolvable element box (${(f?.memberSigs ?? []).length} member element(s))` });
        }
      });
      if (dec?.layers?.length) {
        // F4: locate each declared layer by the selectors in `members`.
        const locate = [];
        for (const [j, L] of dec.layers.entries()) {
          const where = `slide ${d.page}.layers[${j}]`;
          if (!Array.isArray(L.members) || !L.members.length) {
            errors.push({ code: ERR.REQUIRED, field: `${where}.members`, detail: "members is the addressing key: a declared layer must name the selectors that identify it" });
            continue;
          }
          const found = (d.resolved ?? [])[j] ?? [];
          const badSel = found.filter((r) => r.invalid || r.count === 0);
          if (badSel.length) {
            errors.push({ code: ERR.MEMBERS_MISSING, field: `${where}.members`, detail: badSel.map((r) => `${r.invalid ? "invalid selector" : "matched no element"}: ${r.sel}`).join("; ") });
            continue;
          }
          const S = [].concat(...found.map((r) => r.memberSigs ?? [])).sort();
          const cands = [];
          d.layers.forEach((f, k) => { if (containsMultiset(f.memberSigs ?? [], S)) cands.push(k); });
          if (!cands.length) {
            errors.push({ code: ERR.MEMBERS_MISSING, field: `${where}.members`, detail: `no layer on page ${d.page} contains the declared member set [${S.join(", ")}]` });
            continue;
          }
          if (cands.length > 1) {
            // Rule 5, kept as a guard. Not reachable while the layering keeps
            // member signatures disjoint; see u4-c-expected.json.
            errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: `${where}.members`, detail: `declared member set matches ${cands.length} layers on page ${d.page} (layers ${cands.join(",")}): the declaration cannot uniquely locate a layer` });
            continue;
          }
          const k = cands[0], fact = d.layers[k];
          if (!sameMultiset(fact.memberSigs ?? [], S)) {
            errors.push({ code: ERR.MEMBERS_MISSING, field: `${where}.members`, detail: `declared member set does not equal the located layer ${k} on page ${d.page}: declared ${S.length} [${S.join(", ")}], layer has ${(fact.memberSigs ?? []).length} [${(fact.memberSigs ?? []).join(", ")}]` });
            continue;
          }
          if ("cls" in L && L.cls !== fact.cls) errors.push({ code: ERR.DOM_MISMATCH, field: `${where}.cls`, detail: `declared "${L.cls}", located layer ${k} has "${fact.cls}"` });
          if ("delayMs" in L && L.delayMs !== fact.delayMs) errors.push({ code: ERR.DOM_MISMATCH, field: `${where}.delayMs`, detail: `declared ${L.delayMs}, located layer ${k} has ${fact.delayMs}` });
          locate.push({ k, members: L.members.slice(), delayMs: L.delayMs, intent: L.intent });
        }
        if (locate.length) {
          membersResolvedPages.add(d.page);
          // D7: ONLY pages that actually carry a located declared layer enter
          // the plan. Routing an undeclared page into the declared branch gave
          // every one of its layers an empty member list, hence a null box,
          // hence a crash at capture time.
          plan.slides.set(d.page, locate);
        }
      }
    }
  }

  // A_MEMBERS: every page the runtime detector called ambiguous must have been
  // resolved by a declaration that landed on THAT page. `motion` does not cover
  // it — motion describes runtime animation, membership describes which
  // elements form a layer, and conflating them left the ambiguity unresolved.
  if (amb.has(AMB.MEMBERS)) {
    // Coverage is verified against the pages the runtime detector flagged. If the
    // caller did not supply that list, coverage CANNOT be verified — refuse and
    // say so. Treating a missing list as "nothing unresolved" is silent
    // acceptance of a known ambiguity, which the caliber forbids.
    if (!Array.isArray(dom.nestedPages)) {
      errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: AMB.MEMBERS, detail: `${amb.get(AMB.MEMBERS)}; the caller supplied no ambiguous page list, so membership coverage cannot be verified` });
    } else {
      const pages = dom.nestedPages;
      const unresolved = pages.filter((p) => !membersResolvedPages.has(p));
      if (unresolved.length) {
        errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: AMB.MEMBERS, detail: `${amb.get(AMB.MEMBERS)}; no landing members declaration for page(s) ${unresolved.join(",")}` });
      } else {
        notes.push(`${AMB.MEMBERS} resolved by declaration on page(s) ${pages.join(",")}`);
      }
    }
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
  // The static verdict comes from the SAME function patchMerge uses. loadAndPlan
  // previously emitted no E_AMBIGUOUS_UNDECLARED at all, so this checker could
  // print "needs only version + capturePad" for a deck whose page 7 genuinely
  // nests its members — and the renderer then refused that manifest.
  for (const u of coversStatic(m.merged, amb).unresolved) {
    errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: u.code, detail: u.detail });
  }
  return {
    present: true, errors, merged: m.merged, provenance: m.provenance, amb, plan: null,
    sources: { embedded: embedded.present, sidecar: sidecar.present, sidecarPath: sidecar.path },
  };
}
