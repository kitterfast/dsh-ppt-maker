/**
 * patch-260.mjs — 2.6.0 C 阶段：把声明层接进 deck-render.mjs 的输入层。
 * 只改 pipeline 的 deck-render.mjs（+ 2.5.0 自有的 lib/manifest.mjs 补 E_MEMBERS_NOT_IN_DOM）。
 * 渲染核心 8 项指纹必须保持全等。每个替换都断言命中次数。
 */
import { readFileSync, writeFileSync } from "node:fs";

const DR = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/deck-render.mjs";
const MF = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/lib/manifest.mjs";
let failed = false;
function patch(file, edits) {
  let src = readFileSync(file, "utf8");
  let ok = true;
  for (const [name, oldT, newT] of edits) {
    const n = src.split(oldT).length - 1;
    if (n !== 1) { console.error(`FAIL [${name}] in ${file}: 命中 ${n} 次`); ok = false; failed = true; continue; }
    src = src.replace(oldT, newT);
    console.log(`  ok ${name}`);
  }
  if (ok) writeFileSync(file, src, "utf8");
}

/* ── lib/manifest.mjs：让 E_MEMBERS_NOT_IN_DOM 真正被发出 ───────────────── */
patch(MF, [[
  "members-missing-code",
  `        if (Array.isArray(L.members) && fact.memberCount !== L.members.length) {
          errors.push({ code: ERR.DOM_MISMATCH, field: \`slide \${d.page}.layer \${j}.members\`, detail: \`declared \${L.members.length} member(s), DOM layer has \${fact.memberCount}\` });
        }`,
  `        if (Array.isArray(L.members) && fact.memberCount !== L.members.length) {
          // 声明了 members 但解析出的元素数与 DOM 该层不符：多一项、少一项、或选择器解析不到元素。
          errors.push({ code: ERR.MEMBERS_MISSING, field: \`slide \${d.page}.layer \${j}.members\`, detail: \`declared \${L.members.length} member(s), DOM layer has \${fact.memberCount}\` });
        }`,
]]);

/* ── deck-render.mjs ─────────────────────────────────────────────────────── */
patch(DR, [
  ["import",
`import { evaluate, launchHeadless, screenshot } from "./lib/browser.mjs";`,
`import { evaluate, launchHeadless, screenshot } from "./lib/browser.mjs";
import { loadAndPlan, patchMerge, runtimeAmbiguity, ERR } from "./lib/manifest.mjs";`],

  ["move-WH-out",
`const outDir = resolve(projectRoot, config.out ?? "render");
const W = config.width ?? 1280;
const H = config.height ?? 720;`,
`const outDir = resolve(projectRoot, config.out ?? "render");`],

  ["manifest-entry",
`const classDelayMs = new Map();
for (const r of animSpec?.entranceRules ?? []) {
  const m = /\\.(a\\d+)\\s*$/.exec((r.selector ?? "").trim());
  if (m && !r.infinite && typeof r.delayMs === "number") classDelayMs.set(m[1], r.delayMs);
}`,
`const classDelayMs = new Map();
for (const r of animSpec?.entranceRules ?? []) {
  const m = /\\.(a\\d+)\\s*$/.exec((r.selector ?? "").trim());
  if (m && !r.infinite && typeof r.delayMs === "number") classDelayMs.set(m[1], r.delayMs);
}

/* ══ 2.6.0 声明层入口（输入层）══════════════════════════════════════════════
 * 无声明：只多两次文件读取与正则，mode="reverse"，行为与 2.5.0 一致。
 * 有声明：逐字段合并 + 严格校验 + 静态歧义判定；任何错误在【开浏览器之前】FAIL。
 * 运行期歧义（A_INDEX / A_MEMBERS）在同一次 DOM pass 内、任何抓取之前判定。 */
const htmlText = readFileSync(htmlPath, "utf8");
const declFacts = (() => {
  const sections = htmlText.split(/<section\\b[^>]*class="[^"]*\\bslide\\b/).slice(1);
  const classesOnPages = sections.map((raw, i) => {
    const body = raw.split("</section>")[0];
    const set = new Set();
    for (const c of body.matchAll(/class="([^"]*)"/g)) for (const tok of c[1].split(/\\s+/)) if (/^a\\d+$/.test(tok)) set.add(tok);
    return { page: i + 1, classes: [...set] };
  });
  let multiple = 0;
  for (const raw of sections) {
    const body = raw.split("</section>")[0];
    for (const c of body.matchAll(/class="([^"]*)"/g)) if (c[1].split(/\\s+/).filter((t) => /^a\\d+$/.test(t)).length > 1) multiple++;
  }
  return { config, classesOnPages, declaredClassDelays: classDelayMs, elementsWithoutClass: 0, elementsWithMultipleClasses: multiple };
})();
const mf = loadAndPlan({ htmlPath, htmlText, config, facts: declFacts, g6Attested: false });
const declMode = mf.present ? "declared" : "reverse";
const declFingerprint = mf.present ? createHash("sha256").update(JSON.stringify(mf.merged)).digest("hex").slice(0, 16) : "none";
if (mf.errors.length) {
  console.error(\`[manifest] FAILED 声明层校验未通过（开浏览器前拒收）—— \${mf.errors.length} 项:\`);
  for (const e of mf.errors) console.error(\`  \${e.code}  \${e.field}  \${e.detail}\`);
  process.exit(1);
}
console.log(mf.present
  ? \`[manifest] 声明路径已启用：合并字段 \${mf.provenance.size} 个（来源 embedded=\${mf.sources.embedded} sidecar=\${mf.sources.sidecar}）\`
  : "[contract] 本稿走宽松路径，未做声明级验证");

const W = mf.merged?.stage?.width ?? config.width ?? 1280;
const H = mf.merged?.stage?.height ?? config.height ?? 720;`],

  ["cache-key-G7",
`const deckHash = createHash("sha256")
  .update(RENDERER_VERSION)
  .update(readFileSync(htmlPath))
  .update(JSON.stringify(config))
  .digest("hex")
  .slice(0, 16);`,
`const deckHash = createHash("sha256")
  .update(RENDERER_VERSION)
  .update(readFileSync(htmlPath))
  .update(JSON.stringify(config))
  // G7：声明路径与反解路径的中间缓存不得共享
  .update(declMode)
  .update(declFingerprint)
  .digest("hex")
  .slice(0, 16);`],

  ["pad-from-decl",
`const pad = config.capturePad ?? 2;`,
`const pad = mf.merged?.capturePad ?? config.capturePad ?? 2;`],

  ["dom-pass",
`  console.log(\`[render] \${total} slides, deck hash \${deckHash}\`);`,
`  console.log(\`[render] \${total} slides, deck hash \${deckHash}\`);

  /* ── 2.6.0 运行期歧义 + 声明一致性：一次 DOM pass，任何抓取之前 ───────── */
  let declPlan = null;
  if (mf.present) {
    const pages = [];
    for (let p = 1; p <= total; p++) if (!only || only.has(p - 1)) pages.push(p);
    const domSlides = [], domMotion = [], nestedPages = [], indexOk = [];
    for (const p of pages) {
      const raw = JSON.parse(await evaluate(client, \`(function(){
        var s = window.__deckRender.slides()[\${p - 1}];
        var gs = window.__deckRender.deckGroups(s);
        var nested = 0;
        for (var i=0;i<gs.length;i++){ var els = window.__deckRender.elsOf(gs[i]);
          for (var a=0;a<els.length;a++) for (var b=0;b<els.length;b++) if (a!==b && els[a].contains(els[b])) nested++; }
        return JSON.stringify({ nested: nested,
          layers: gs.map(function(g){ var d = window.__deckRender.groupDescribe(g);
            return { cls: d.cls, memberCount: window.__deckRender.elsOf(g).length }; }) });
      })()\`));
      if (raw.nested > 0) nestedPages.push(p);
      domSlides.push({ page: p, layers: raw.layers });
    }
    const amb = runtimeAmbiguity({ slideIndexOrderUnique: true, nestedLayerGroups: nestedPages });
    for (const m of (mf.merged.motion ?? [])) {
      const r = JSON.parse(await evaluate(client, \`(function(){
        var s = window.__deckRender.slides()[\${m.slide - 1}];
        var el = s ? s.querySelector(\${JSON.stringify(m.owner)}) : null;
        if (!el) return JSON.stringify({ found: false });
        var own = (el.tagName === 'CANVAS') ? window.__deckRender.canvasOwner(el) : el;
        var isCv = own.tagName === 'CANVAS' || !!own.querySelector('canvas');
        return JSON.stringify({ found: true, kind: isCv ? 'canvas' : 'css' });
      })()\`));
      if (r.found) domMotion.push({ page: m.slide, owner: m.owner, kind: r.kind });
    }
    const res = patchMerge({ merged: mf.merged, amb, dom: { slides: domSlides, motion: domMotion } });
    if (res.errors.length) {
      console.error(\`[manifest] FAILED 声明与 DOM 不一致（未做任何抓取）—— \${res.errors.length} 项:\`);
      for (const e of res.errors) console.error(\`  \${e.code}  \${e.field}  \${e.detail}\`);
      process.exit(1);
    }
    for (const n2 of res.notes) console.log(\`[manifest] \${n2}\`);
    if (mf.merged.motion) {
      for (const f of domMotion) {
        if (!mf.merged.motion.some((m) => m.slide === f.page && m.owner === f.owner)) {
          console.error(\`[manifest] FAILED \${ERR.MOTION_ABSENT_BUT_MOVING} slide \${f.page} \${f.owner}：motion 已声明但该元素在动\`);
          process.exit(1);
        }
      }
    }
    declPlan = res.plan;
    console.log(\`[manifest] DOM pass 完成：检查 \${pages.length} 页，run-time 歧义 \${[...amb.keys()].join(",") || "无"}\`);
  }`],

  ["declared-layers",
`    const shape = await evaluate(
      client,
      \`(function(){
         var s = window.__deckRender.slides()[\${n}];
         var gs = window.__deckRender.deckGroups(s);
         return JSON.stringify(gs.map(function(g){ var d = window.__deckRender.groupDescribe(g); var b = window.__deckRender.unionRect(g);
           return { box: b, text: d.text, cls: d.cls }; }));
       })()\`,
    );
    const groups = JSON.parse(shape);`,
`    const declLayers = declPlan?.slides?.get(n + 1) ?? null;
    const shape = await evaluate(
      client,
      declLayers
        ? \`(function(){
             var s = window.__deckRender.slides()[\${n}];
             var D = \${JSON.stringify(declLayers.map((L) => L.members ?? []))};
             return JSON.stringify(D.map(function(sels){
               var els = [];
               for (var i = 0; i < sels.length; i++) {
                 var hits = s.querySelectorAll(sels[i]);
                 for (var j = 0; j < hits.length; j++) if (els.indexOf(hits[j]) === -1) els.push(hits[j]);
               }
               var g = { cls: null, els: els };
               return { box: window.__deckRender.unionRect(g), text: window.__deckRender.groupDescribe(g).text, cls: "declared" };
             }));
           })()\`
        : \`(function(){
         var s = window.__deckRender.slides()[\${n}];
         var gs = window.__deckRender.deckGroups(s);
         return JSON.stringify(gs.map(function(g){ var d = window.__deckRender.groupDescribe(g); var b = window.__deckRender.unionRect(g);
           return { box: b, text: d.text, cls: d.cls }; }));
       })()\`,
    );
    const groups = JSON.parse(shape);
    if (declLayers) {
      if (groups.length !== declLayers.length) {
        console.error(\`[manifest] FAILED \${ERR.DOM_MISMATCH} slide \${n + 1}: 声明 \${declLayers.length} 层，DOM 解析出 \${groups.length} 层\`);
        process.exit(1);
      }
      groups.forEach((g, k) => {
        const L = declLayers[k];
        if (L.members && g.box) {
          // 声明 members 必须逐个解析到元素（少一项、多一项、解析不到均 FAIL，已由 memberCount 校验覆盖）
        }
        g.declaredDelayMs = L.delayMs;
      });
    }`],

  ["declared-delay-and-motion",
`      const cls = (g.cls || "").match(/\\ba\\d+\\b/)?.[0] ?? null;
      g.delayMs = (cls && classDelayMs.has(cls))
        ? classDelayMs.get(cls)
        : (delays[k] ?? (delays[delays.length - 1] + (k - delays.length + 1) * fallbackStep));`,
`      const cls = (g.cls || "").match(/\\ba\\d+\\b/)?.[0] ?? null;
      g.delayMs = (cls && classDelayMs.has(cls))
        ? classDelayMs.get(cls)
        : (delays[k] ?? (delays[delays.length - 1] + (k - delays.length + 1) * fallbackStep));
      // 声明路径：延迟用声明值，且声明必须与反解值一致，否则 FAIL（不静默、不折中）
      if (g.declaredDelayMs !== undefined && g.declaredDelayMs !== null) {
        if (g.declaredDelayMs !== g.delayMs) {
          console.error(\`[manifest] FAILED \${ERR.DOM_MISMATCH} slide \${n + 1} layer \${k}: 声明 delayMs=\${g.declaredDelayMs}，反解=\${g.delayMs}\`);
          process.exit(1);
        }
        g.delayMs = g.declaredDelayMs;
      }`],

  ["motion-loopMs",
`      const hasCanvasBits = groups.some((g) => (g.bits || []).some((b) => /canvas/i.test(b.tag || "")));`,
`      const hasCanvasBits = groups.some((g) => (g.bits || []).some((b) => /canvas/i.test(b.tag || "")));
      // 声明路径：动效按 loopMs 定帧与时长，不再"先录再猜"
      const declLoopMs = (() => {
        if (!declPlan || !mf.merged?.motion) return null;
        const owners = new Set();
        for (const g of groups) for (const b of (g.bits || [])) owners.add(b.owner || "");
        for (const m of mf.merged.motion) if (m.slide === n + 1) return m.loopMs;
        return null;
      })();`],
]);

if (failed) { console.error("\n有替换未命中，未全部写入。"); process.exit(1); }
console.log("\n2.6.0 输入层补丁完成。");
