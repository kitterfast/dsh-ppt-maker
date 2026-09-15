/**
 * F4 + F5 + D7 patch — declared layers are located by their member selectors and
 * MERGED with the reverse grouping. Delivered as one batch: applying F4 alone
 * would leave D7 (undeclared pages routed into the declared branch) still
 * crashing, and F5 alone would only convert that crash into a FAIL.
 *
 * D7  every page is grouped by the REVERSE path; only pages carrying a located
 *     declared layer get a plan entry, so an undeclared page never enters the
 *     declared branch (it used to, with empty member lists -> null box -> crash).
 * F4  a declared layer is located by the selectors in `members` (rules 1-6):
 *       S = union of what the selectors resolve to inside the page
 *       candidates = layers whose member multiset CONTAINS S
 *       0 -> E_MEMBERS_NOT_IN_DOM; >=2 -> E_AMBIGUOUS_UNDECLARED (rule 5, kept as
 *       a guard); exactly 1 -> located, and the multiset must then be EQUAL
 *       (a proper subset is a FAIL, not an accepted answer).
 *     cls / delayMs become optional cross-checks against the located layer.
 * F5  patchMerge validates that every layer the DOM pass reported has a
 *     resolvable box; otherwise E_LAYER_BOX_UNRESOLVED before any capture.
 *
 * Frozen regions NOT touched: clipOf (L252), waitStable (L131), layer capture
 * block (L597-629), GIF frame loop (L746-759), page-helpers.js, deck-to-pptx.mjs.
 *
 * Usage: node tools/apply-f4.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dry = process.argv.includes("--dry");
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const MF = `${PIPE}/lib/manifest.mjs`;
const DR = `${PIPE}/deck-render.mjs`;
const EX = `${PIPE}/deck.manifest.example.json`;
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();

const patches = [
  // ── F5 error code ──────────────────────────────────────────────────────────
  {
    file: MF,
    name: "M1 ERR.LAYER_BOX_UNRESOLVED",
    old: '  SLIDE_NOT_FOUND: "E_SLIDE_NOT_FOUND",\n};',
    new: '  SLIDE_NOT_FOUND: "E_SLIDE_NOT_FOUND",\n  LAYER_BOX_UNRESOLVED: "E_LAYER_BOX_UNRESOLVED",\n};',
  },
  // ── multiset helpers ───────────────────────────────────────────────────────
  {
    file: MF,
    name: "M2 multiset helpers",
    old: "/* ───────────────── patch merge (§7) — the whole point ───────────────────── */",
    new:
      "const countInto = (arr) => {\n" +
      "  const c = new Map();\n" +
      "  for (const v of arr) c.set(v, (c.get(v) ?? 0) + 1);\n" +
      "  return c;\n" +
      "};\n" +
      "\n" +
      "/** Multiset equality — signatures can repeat, so counting is required. */\n" +
      "export function sameMultiset(a, b) {\n" +
      "  if (a.length !== b.length) return false;\n" +
      "  const c = countInto(a);\n" +
      "  for (const v of b) {\n" +
      "    const n = c.get(v) ?? 0;\n" +
      "    if (!n) return false;\n" +
      "    c.set(v, n - 1);\n" +
      "  }\n" +
      "  return true;\n" +
      "}\n" +
      "\n" +
      "/** Multiset containment: does `sup` contain every element of `sub`? */\n" +
      "export function containsMultiset(sup, sub) {\n" +
      "  const c = countInto(sup);\n" +
      "  for (const v of sub) {\n" +
      "    const n = c.get(v) ?? 0;\n" +
      "    if (!n) return false;\n" +
      "    c.set(v, n - 1);\n" +
      "  }\n" +
      "  return true;\n" +
      "}\n" +
      "\n" +
      "/* ───────────────── patch merge (§7) — the whole point ───────────────────── */",
  },
  // ── F4 + F5 + D7 core ─────────────────────────────────────────────────────
  {
    file: MF,
    name: "M3 locate declared layers by members; merge-safe plan; F5 box guard",
    old:
      "      if (dec.layers.some((L) => Array.isArray(L.members) && L.members.length)) membersResolvedPages.add(d.page);\n" +
      "      if (dec.layers.length !== d.layers.length) {\n" +
      "        errors.push({ code: ERR.DOM_MISMATCH, field: `slide ${d.page}.layers`, detail: `declared ${dec.layers.length} layer(s), DOM has ${d.layers.length}` });\n" +
      "      }\n" +
      "      for (let j = 0; j < dec.layers.length; j++) {\n" +
      "        const L = dec.layers[j], fact = d.layers[j];\n" +
      "        if (!fact) continue;\n" +
      '        if ("cls" in L && L.cls !== fact.cls) errors.push({ code: ERR.DOM_MISMATCH, field: `slide ${d.page}.layer ${j}.cls`, detail: `declared "${L.cls}", DOM "${fact.cls}"` });\n' +
      '        if ("delayMs" in L && L.delayMs !== fact.delayMs) errors.push({ code: ERR.DOM_MISMATCH, field: `slide ${d.page}.layer ${j}.delayMs`, detail: `declared ${L.delayMs}, DOM ${fact.delayMs}` });\n' +
      "        // §2: members must not contradict the DOM (a selector that resolves to\n" +
      "        // nothing, or a set that differs from the DOM layer, is a conflict).\n" +
      "        if (Array.isArray(L.members) && fact.memberCount !== L.members.length) {\n" +
      "          // 声明了 members 但解析出的元素数与 DOM 该层不符：多一项、少一项、或选择器解析不到元素。\n" +
      "          errors.push({ code: ERR.MEMBERS_MISSING, field: `slide ${d.page}.layer ${j}.members`, detail: `declared ${L.members.length} member(s), DOM layer has ${fact.memberCount}` });\n" +
      "        }\n" +
      "        layers.push({ ...fact, declared: true, intent: L.intent, members: L.members ?? null });\n" +
      "      }\n" +
      "    } else {\n" +
      "      layers.push(...d.layers.map((f) => ({ ...f, declared: false })));\n" +
      "    }\n" +
      "    plan.slides.set(d.page, layers);\n" +
      "  }",
    new:
      "      // F5 guard: a layer with no element cannot be captured. Letting a null\n" +
      "      // box through turns a validation failure into an uncaught TypeError in\n" +
      "      // clipOf, so it is rejected here, before any capture.\n" +
      "      d.layers.forEach((f, k) => {\n" +
      "        if (!f || !f.box) {\n" +
      "          errors.push({ code: ERR.LAYER_BOX_UNRESOLVED, field: `slide ${d.page}.layer ${k}`, detail: `layer \"${f?.cls ?? \"?\"}\" has no resolvable element box (${(f?.memberSigs ?? []).length} member element(s))` });\n" +
      "        }\n" +
      "      });\n" +
      "      if (dec?.layers?.length) {\n" +
      "        // F4: locate each declared layer by the selectors in `members`.\n" +
      "        const locate = [];\n" +
      "        for (const [j, L] of dec.layers.entries()) {\n" +
      "          const where = `slide ${d.page}.layers[${j}]`;\n" +
      "          if (!Array.isArray(L.members) || !L.members.length) {\n" +
      "            errors.push({ code: ERR.REQUIRED, field: `${where}.members`, detail: \"members is the addressing key: a declared layer must name the selectors that identify it\" });\n" +
      "            continue;\n" +
      "          }\n" +
      "          const found = (d.resolved ?? [])[j] ?? [];\n" +
      "          const badSel = found.filter((r) => r.invalid || r.count === 0);\n" +
      "          if (badSel.length) {\n" +
      "            errors.push({ code: ERR.MEMBERS_MISSING, field: `${where}.members`, detail: badSel.map((r) => `${r.invalid ? \"invalid selector\" : \"matched no element\"}: ${r.sel}`).join(\"; \") });\n" +
      "            continue;\n" +
      "          }\n" +
      "          const S = [].concat(...found.map((r) => r.memberSigs ?? [])).sort();\n" +
      "          const cands = [];\n" +
      "          d.layers.forEach((f, k) => { if (containsMultiset(f.memberSigs ?? [], S)) cands.push(k); });\n" +
      "          if (!cands.length) {\n" +
      "            errors.push({ code: ERR.MEMBERS_MISSING, field: `${where}.members`, detail: `no layer on page ${d.page} contains the declared member set [${S.join(\", \")}]` });\n" +
      "            continue;\n" +
      "          }\n" +
      "          if (cands.length > 1) {\n" +
      "            // Rule 5, kept as a guard. Not reachable while the layering keeps\n" +
      "            // member signatures disjoint; see u4-c-expected.json.\n" +
      "            errors.push({ code: ERR.AMBIGUOUS_UNDECLARED, field: `${where}.members`, detail: `declared member set matches ${cands.length} layers on page ${d.page} (layers ${cands.join(\",\")}): the declaration cannot uniquely locate a layer` });\n" +
      "            continue;\n" +
      "          }\n" +
      "          const k = cands[0], fact = d.layers[k];\n" +
      "          if (!sameMultiset(fact.memberSigs ?? [], S)) {\n" +
      "            errors.push({ code: ERR.MEMBERS_MISSING, field: `${where}.members`, detail: `declared member set does not equal the located layer ${k} on page ${d.page}: declared ${S.length} [${S.join(\", \")}], layer has ${(fact.memberSigs ?? []).length} [${(fact.memberSigs ?? []).join(\", \")}]` });\n" +
      "            continue;\n" +
      "          }\n" +
      '          if ("cls" in L && L.cls !== fact.cls) errors.push({ code: ERR.DOM_MISMATCH, field: `${where}.cls`, detail: `declared "${L.cls}", located layer ${k} has "${fact.cls}"` });\n' +
      '          if ("delayMs" in L && L.delayMs !== fact.delayMs) errors.push({ code: ERR.DOM_MISMATCH, field: `${where}.delayMs`, detail: `declared ${L.delayMs}, located layer ${k} has ${fact.delayMs}` });\n' +
      "          locate.push({ k, members: L.members.slice(), delayMs: L.delayMs, intent: L.intent });\n" +
      "        }\n" +
      "        if (locate.length) {\n" +
      "          membersResolvedPages.add(d.page);\n" +
      "          // D7: ONLY pages that actually carry a located declared layer enter\n" +
      "          // the plan. Routing an undeclared page into the declared branch gave\n" +
      "          // every one of its layers an empty member list, hence a null box,\n" +
      "          // hence a crash at capture time.\n" +
      "          plan.slides.set(d.page, locate);\n" +
      "        }\n" +
      "      }",
  },
  // ── D7 + F4 render side ───────────────────────────────────────────────────
  {
    file: DR,
    name: "R1 always reverse-group, then overlay declared boxes",
    old:
      "    const declLayers = declPlan?.slides?.get(n + 1) ?? null;\n" +
      "    const shape = await evaluate(\n" +
      "      client,\n" +
      "      declLayers\n" +
      "        ? `(function(){\n" +
      "             var s = window.__deckRender.slides()[${n}];\n" +
      "             var D = ${JSON.stringify(declLayers.map((L) => L.members ?? []))};\n" +
      "             return JSON.stringify(D.map(function(sels){\n" +
      "               var els = [];\n" +
      "               for (var i = 0; i < sels.length; i++) {\n" +
      "                 var hits = s.querySelectorAll(sels[i]);\n" +
      "                 for (var j = 0; j < hits.length; j++) if (els.indexOf(hits[j]) === -1) els.push(hits[j]);\n" +
      "               }\n" +
      "               var g = { cls: null, els: els };\n" +
      '               return { box: window.__deckRender.unionRect(g), text: window.__deckRender.groupDescribe(g).text, cls: "declared" };\n' +
      "             }));\n" +
      "           })()`\n" +
      "        : `(function(){\n" +
      "         var s = window.__deckRender.slides()[${n}];\n" +
      "         var gs = window.__deckRender.deckGroups(s);\n" +
      "         return JSON.stringify(gs.map(function(g){ var d = window.__deckRender.groupDescribe(g); var b = window.__deckRender.unionRect(g);\n" +
      "           return { box: b, text: d.text, cls: d.cls }; }));\n" +
      "       })()`,\n" +
      "    );\n" +
      "    const groups = JSON.parse(shape);\n" +
      "    if (declLayers) {\n" +
      "      if (groups.length !== declLayers.length) {\n" +
      "        console.error(`[manifest] FAILED ${ERR.DOM_MISMATCH} slide ${n + 1}: 声明 ${declLayers.length} 层，DOM 解析出 ${groups.length} 层`);\n" +
      "        process.exit(1);\n" +
      "      }\n" +
      "      groups.forEach((g, k) => {\n" +
      "        const L = declLayers[k];\n" +
      "        if (L.members && g.box) {\n" +
      "          // 声明 members 必须逐个解析到元素（少一项、多一项、解析不到均 FAIL，已由 memberCount 校验覆盖）\n" +
      "        }\n" +
      "        g.declaredDelayMs = L.delayMs;\n" +
      "      });\n" +
      "    }",
    new:
      "    // D7 + F4: the reverse grouping is ALWAYS computed. A declared layer then\n" +
      "    // overrides the box of the layer patchMerge located it to, and every layer\n" +
      "    // that was not declared keeps the reverse result. A page with no located\n" +
      "    // declaration carries no plan entry at all, so it never enters this branch —\n" +
      "    // previously it did, with empty member lists, producing a null box and a\n" +
      "    // crash inside the frozen capture block.\n" +
      "    const declLayers = declPlan?.slides?.get(n + 1) ?? null;\n" +
      "    const declSpec = declLayers ? declLayers.map((L) => ({ k: L.k, sels: L.members })) : [];\n" +
      "    const shape = await evaluate(\n" +
      "      client,\n" +
      "      `(function(){\n" +
      "         var s = window.__deckRender.slides()[${n}];\n" +
      "         var gs = window.__deckRender.deckGroups(s);\n" +
      "         var groups = gs.map(function(g){ var d = window.__deckRender.groupDescribe(g); var b = window.__deckRender.unionRect(g);\n" +
      "           return { box: b, text: d.text, cls: d.cls }; });\n" +
      "         var spec = ${JSON.stringify(declSpec)};\n" +
      "         var decl = spec.map(function(e){\n" +
      "           var els = [];\n" +
      "           for (var i = 0; i < e.sels.length; i++) {\n" +
      "             var hits = s.querySelectorAll(e.sels[i]);\n" +
      "             for (var j = 0; j < hits.length; j++) if (els.indexOf(hits[j]) === -1) els.push(hits[j]);\n" +
      "           }\n" +
      "           var g = { cls: null, els: els };\n" +
      "           return { k: e.k, box: window.__deckRender.unionRect(g), n: els.length };\n" +
      "         });\n" +
      "         return JSON.stringify({ groups: groups, decl: decl });\n" +
      "       })()`,\n" +
      "    );\n" +
      "    const parsed = JSON.parse(shape);\n" +
      "    const groups = parsed.groups;\n" +
      "    if (declLayers) {\n" +
      "      for (const dd of parsed.decl) {\n" +
      "        const g = groups[dd.k];\n" +
      "        if (!g) {\n" +
      "          console.error(`[manifest] FAILED ${ERR.DOM_MISMATCH} slide ${n + 1}: 声明的层 k=${dd.k} 超出反解层数 ${groups.length}`);\n" +
      "          process.exit(1);\n" +
      "        }\n" +
      "        if (!dd.box || dd.n === 0) {\n" +
      "          console.error(`[manifest] FAILED ${ERR.LAYER_BOX_UNRESOLVED} slide ${n + 1} layer ${dd.k}: 声明的 members 在页内解析不到元素`);\n" +
      "          process.exit(1);\n" +
      "        }\n" +
      "        g.box = dd.box;\n" +
      "      }\n" +
      "      for (const L of declLayers) {\n" +
      "        const g = groups[L.k];\n" +
      "        if (g) g.declaredDelayMs = L.delayMs;\n" +
      "      }\n" +
      "    }",
  },
];

// ── example manifest: rewritten for the new addressing rules ────────────────
const EXAMPLE = `{
  "_comment": "deck.manifest v1 样例。只声明 HTML 表达不了、或反解有歧义的信息；其余一律不写，由 DOM 决定。",
  "version": 1,
  "capturePad": 10,

  "_addressing_comment": [
    "声明侧一律 1-BASED。定位一页用 page（推荐）；index 是等价的 1-based 别名，二者同时出现时必须一致，否则 E_CONFLICT。",
    "注意：声明侧的 index/page 与输出 manifest 里的 slides[].index 不同义 —— 后者是 0-BASED 数组下标。",
    "声明指向不存在的页 -> E_SLIDE_NOT_FOUND（不会静默丢弃）。"
  ],

  "_layers_comment": [
    "layers[] 不是按位对齐的列表，顺序无关。每一层靠 members 里的选择器【定位】：",
    "  1. 用这些选择器在 DOM 里解析出元素集合 S；",
    "  2. 在运行时分层结果里找哪些层包含 S；",
    "  3. 恰好一层包含 S -> 该层即被声明的层；",
    "  4. 多层包含 S -> E_AMBIGUOUS_UNDECLARED（声明无法唯一定位层）；",
    "  5. S 为空、或某选择器解析不到元素 -> E_MEMBERS_NOT_IN_DOM；",
    "  6. S 是该层成员集合的真子集 -> 同样 E_MEMBERS_NOT_IN_DOM（声明不全 = 歧义未解决）。",
    "因此不必声明整页的所有层，只声明有歧义的那一层即可。",
    "cls / delayMs 是可选的交叉校验：写了就必须与被定位的层一致，不一致即 E_DOM_MISMATCH。"
  ],
  "slides": [
    {
      "page": 7,
      "layers": [
        {
          "members": [".a4"],
          "_members_comment": "slide 7 上带 .a4 的元素恰有两个（外层 div.a4 与其内层 div#threeAI.ai-screen.a4），同类嵌套使成员无法由类规则导出，故须声明。"
        }
      ]
    }
  ],

  "_motion_comment": [
    "运行期动效。owner 必须在 DOM 中；kind 必须与运行期事实一致；loopMs 用于定帧数与时长。",
    "不写 motion = 未声明，回退运行期探测；写空数组 = 显式声明无动效，运行期发现元素在动即 FAIL。",
    "motion 与 A_MEMBERS 是两个维度：声明 motion 不能覆盖层成员歧义，后者必须由 layers[].members 定位解决。"
  ]
}
`;

const files = new Map();
let bad = 0;
console.log("===== F4+F5+D7 patch: anchor verification =====");
for (const p of patches) {
  if (!files.has(p.file)) files.set(p.file, readFileSync(p.file, "utf8"));
  const hits = files.get(p.file).split(p.old).length - 1;
  if (hits !== 1) bad++;
  console.log(`  [${hits === 1 ? "OK  " : "FAIL"}] ${p.name.padEnd(60)} hits=${hits}`);
}
console.log(`  [OK  ] ${"X1 rewrite deck.manifest.example.json".padEnd(60)} (full replace)`);
if (bad) {
  console.log(`\n${bad} anchor(s) did not resolve exactly once — nothing written.`);
  process.exit(1);
}

console.log("\n===== applying =====");
for (const p of patches) files.set(p.file, files.get(p.file).replace(p.old, p.new));
for (const [f, out] of files) {
  console.log(`  ${f.split("/").pop().padEnd(26)} ${sha(readFileSync(f, "utf8"))} -> ${sha(out)}  (${readFileSync(f, "utf8").length} -> ${out.length} chars)`);
  if (!dry) writeFileSync(f, out, "utf8");
}
const exBefore = readFileSync(EX, "utf8");
console.log(`  ${"deck.manifest.example.json".padEnd(26)} ${sha(exBefore)} -> ${sha(EXAMPLE)}  (${exBefore.length} -> ${EXAMPLE.length} chars)`);
if (!dry) writeFileSync(EX, EXAMPLE, "utf8");
console.log(dry ? "\n--dry: nothing written." : "\nF4+F5+D7 applied.");
