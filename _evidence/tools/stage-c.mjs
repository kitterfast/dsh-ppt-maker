/**
 * Stage C — version bump, CHANGELOG, three-way sync, npm run verify.
 *
 * Phase 1 verifies every anchor and REFUSES to write anything if any of them is
 * off. Phase 2 applies. Nothing is trusted until it has been read back.
 *
 * Version files: plugin/repo package.json + lib/client.js. The exact 2.5.0
 * occurrences are printed BEFORE any replacement, so the log shows what was
 * actually changed rather than what was assumed.
 *
 * Usage: node tools/stage-c.mjs
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, appendFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const utf8 = "utf8";
const ROOT = "C:/Users/ASUS/Desktop/格式转化修复";
const KEEP = `${ROOT}/_seal-2.6.0`;
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const PLUGIN = "C:/Users/ASUS/.dsh/local-plugins/dsh-ppt-maker";
const REPO = "C:/Users/ASUS/Desktop/班委竞选/dsh-fast-ppt";
const LOG = `${KEEP}/release-prep.log`;
const sha = (p) => (existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16).toUpperCase() : "MISSING");
const L = [];
const say = (s) => { console.log(s); L.push(s); };

const SYNC = ["lib/manifest.mjs", "deck-render.mjs", "deck.manifest.example.json", "tools/g2-test.mjs", "tools/validate-manifest.mjs"];
const CORE = ["deck-to-pptx.mjs", "lib/page-helpers.js"];

const CHANGELOG = `## 2.6.0 (2026-09-15)

### 新增
- 声明路径激活：manifest 声明层接入 deck-render.mjs
- F4：按 members 选择器定位层，与反解层合并
- F1：声明侧 page 为正名，index 为 1-based 同义别名
- F2：删除 motion 覆盖 A_MEMBERS 的豁免
- F3：members 由“比数量”改“比身份”，真子集 FAIL
- F5：层框不可解析即 E_LAYER_BOX_UNRESOLVED
- D7：无声明页走反解分支，不再崩溃
- 校验器与渲染器共用 coversStatic，分叉闭合
- validate-manifest 默认硬失败，--report 保持顾问行为

### 修复
- G2 用例集更新（C 回归本义，F 独立承担歧义拒绝）
- G2 新增 case G：校验器与渲染器判定一致

### 验证
- G5 八区域零差异（F4 后、F4d 后各一次）
- G2 七例 7/7 PASS
- U4-a/b/c'/d 4/4 PASS
- T2 通过（声明 vs 反解，非自比）
- G3 全稿容差判据通过（11 页全在容差内）
- element 冒烟通过（AI 通史 p1）
- example.json 实跑 exit 0

### F 项（新登记）
- 渲染像素级非确定性：所有 PNG 含非 canvas 页。
  同码双跑 maxDelta 4–10，比例 0.0005%–0.3380%。
  集成前既存，非本次引入。判据改为容差制。

### 证据强度降级披露
- U1/U2/U3 此前“逐字节一致”为单样本对比。
  因渲染像素级非确定性，证据强度降级为
  “单样本一致，不足以排除抖动”。
  本次起判据改为容差制（verify.maxMeanDiff=6、maxBadPixelRatio=0.02）。

`;

const F_DOC = `
### 6. 渲染像素级非确定性（F 项）

**现象**：同一份代码、同一输入，连续两次渲染即产生**真实像素差异**（不是编码差异）。

**实测**：baseline（2.5.0 已发布代码）同码双跑 6 个文件像素不同，其中 3 个不是 canvas 页；
current（集成后）4 个文件，其中 1 个不是 canvas 页。非 canvas 页 maxDelta 4–10、
比例 0.0005%–0.3380%；canvas 页 maxDelta 176–207、0.34%–1.14%。
**没有任何文件是「字节不同、像素相同」**——差异不是 zlib 抖动。

**归属**：集成前既存，非 2.6.0 引入。2.5.0 自身同码双跑即出现差异，且 current 波动更少。

**判据的连带修订**：「完全一致」是**视觉要求**，不是字节/像素相等要求。
浏览器渲染天生非确定（抗锯齿、字体 hinting、亚像素舍入），没有渲染系统能保证字节级可复现。
正确判据是**容差制**，使用项目既有口径 \`verify.maxMeanDiff\`（默认 6）与
\`verify.maxBadPixelRatio\`（默认 0.02，bad = 单像素 \`max(|dR|,|dG|,|dB|) > 32\`），
算法同 \`deck-verify.mjs\`。

**对既有结论的影响**：此前的「逐字节一致」结论为**单样本对比**，
单样本无法区分「一致」与「在抖动范围内」，证据强度应降级表述。
`;

// ── Phase 1: verify every anchor -------------------------------------------------
say("===== STAGE C =====");
say(`plugin: ${PLUGIN}`);
say(`repo  : ${REPO}`);
say("");

const versionFiles = [
  { label: "plugin/package.json", path: `${PLUGIN}/package.json`, kind: "pkg" },
  { label: "plugin/lib/client.js", path: `${PLUGIN}/lib/client.js`, kind: "js" },
  { label: "repo/package.json", path: `${REPO}/package.json`, kind: "pkg" },
  { label: "repo/lib/client.js", path: `${REPO}/lib/client.js`, kind: "js" },
];

say("----- 1. 版本号：替换前逐一列出 2.5.0 出现位置 -----");
let bad = 0;
const vPlan = [];
for (const v of versionFiles) {
  if (!existsSync(v.path)) { say(`  [FAIL] ${v.label}: 不存在`); bad++; continue; }
  const src = readFileSync(v.path, utf8);
  const hits = [];
  src.split(/\r?\n/).forEach((line, i) => { if (line.includes("2.5.0")) hits.push({ i: i + 1, line: line.trim() }); });
  say(`  ${v.label}  (${sha(v.path)})  含 2.5.0 的行数=${hits.length}`);
  for (const h of hits) say(`      L${h.i}: ${h.line.slice(0, 120)}`);
  if (hits.length === 0) { say(`  [FAIL] ${v.label}: 未找到 2.5.0`); bad++; continue; }
  if (v.kind === "pkg" && !/"version"\s*:\s*"2\.5\.0"/.test(src)) { say(`  [FAIL] ${v.label}: 无 "version": "2.5.0"`); bad++; continue; }
  if (v.kind === "js" && !/PLUGIN_VERSION/.test(src)) { say(`  [FAIL] ${v.label}: 无 PLUGIN_VERSION`); bad++; continue; }
  vPlan.push({ ...v, src, out: src.replace(/2\.5\.0/g, "2.6.0"), n: hits.length });
}
if (bad) { say(`\n${bad} 处版本锚点异常 —— 未写任何文件。`); writeFileSync(LOG, L.join("\n") + "\n", utf8); process.exit(1); }

say("");
say("----- 2. CHANGELOG / docs 锚点 -----");
const clPlan = [];
for (const [label, root] of [["plugin", PLUGIN], ["repo", REPO]]) {
  const cl = `${root}/CHANGELOG.md`;
  if (!existsSync(cl)) { say(`  [FAIL] ${label}/CHANGELOG.md 不存在`); bad++; continue; }
  const src = readFileSync(cl, utf8);
  if (src.includes("## 2.6.0")) { say(`  [SKIP] ${label}/CHANGELOG.md 已含 2.6.0`); }
  else { clPlan.push({ label, path: cl, out: CHANGELOG + src }); say(`  [OK  ] ${label}/CHANGELOG.md  ${sha(cl)} -> 前置 2.6.0 段  (${src.length} -> ${CHANGELOG.length + src.length} chars)`); }
  const doc = `${root}/docs/经验教训-动画与转换.md`;
  const marker = "### 6. 渲染像素级非确定性";
  if (!existsSync(doc)) { say(`  [FAIL] ${label} docs 不存在`); bad++; continue; }
  const dsrc = readFileSync(doc, utf8);
  if (dsrc.includes(marker)) say(`  [SKIP] ${label} docs 已含 F 项`);
  else { clPlan.push({ label: label + "/docs", path: doc, out: dsrc.replace(/\s*$/, "\n") + F_DOC }); say(`  [OK  ] ${label} docs 追加 F 项  (${dsrc.length} -> ${dsrc.replace(/\s*$/, "\n").length + F_DOC.length} chars)`); }
}
if (bad) { say(`\n锚点异常 —— 未写任何文件。`); writeFileSync(LOG, L.join("\n") + "\n", utf8); process.exit(1); }

// ── Phase 2: apply ---------------------------------------------------------------
say("");
say("----- 3. 应用版本号 -----");
for (const v of vPlan) {
  writeFileSync(v.path, v.out, utf8);
  const back = readFileSync(v.path, utf8);
  const ok = back.includes("2.6.0") && !back.includes("2.5.0");
  say(`  ${ok ? "[OK  ]" : "[FAIL]"} ${v.label}  ${sha(v.path)}  回读 2.6.0=${back.includes("2.6.0")} 残留 2.5.0=${back.includes("2.5.0")}`);
  if (!ok) { say("回读失败 —— 停止。"); writeFileSync(LOG, L.join("\n") + "\n", utf8); process.exit(1); }
}
say("");
say("----- 4. 应用 CHANGELOG / docs -----");
for (const c of clPlan) { writeFileSync(c.path, c.out, utf8); say(`  [OK  ] ${c.label}  ${sha(c.path)}`); }

say("");
say("----- 5. 三处同步（5 文件） -----");
for (const rel of SYNC) {
  const src = join(PIPE, rel);
  const dsts = [[PLUGIN, join(PLUGIN, "scripts/deck", rel)], [REPO, join(REPO, "scripts/deck", rel)]];
  copyFileSync(src, dsts[0][1]);
  copyFileSync(src, dsts[1][1]);
  say(`  ${rel}`);
  say(`      pipeline=${sha(src)}  plugin=${sha(dsts[0][1])}  repo=${sha(dsts[1][1])}`);
}

say("");
say("----- 6. 15 个哈希 + 核心文件 -----");
let mismatch = 0;
for (const rel of SYNC) {
  const h = [join(PIPE, rel), join(PLUGIN, "scripts/deck", rel), join(REPO, "scripts/deck", rel)].map(sha);
  const same = h[0] === h[1] && h[0] === h[2];
  if (!same) mismatch++;
  say(`  ${same ? "[SAME]" : "[DIFF]"} ${rel.padEnd(30)} ${h.join("  ")}`);
}
say("");
for (const rel of CORE) {
  const h = [join(PIPE, rel), join(PLUGIN, "scripts/deck", rel), join(REPO, "scripts/deck", rel)].map(sha);
  const same = h[0] === h[1] && h[0] === h[2];
  if (!same) mismatch++;
  say(`  ${same ? "[SAME]" : "[DIFF]"} ${("core: " + rel).padEnd(30)} ${h.join("  ")}`);
}
say("");
if (mismatch) { say(`!! ${mismatch} 处哈希不一致 —— 停止，不继续 verify。`); writeFileSync(LOG, L.join("\n") + "\n", utf8); process.exit(1); }
say("三处哈希全部一致。");

say("");
say("----- 7. npm run verify -----");
let vOut = "", vCode = -1;
// spawnSync + shell, and the failure reason is LOGGED rather than swallowed:
// execFileSync("npm.cmd") failed to spawn here and returned an empty message.
const vr = spawnSync("npm.cmd run verify", { cwd: REPO, encoding: "utf8", shell: true });
vCode = vr.status ?? -1;
vOut = String(vr.stdout ?? "") + String(vr.stderr ?? "");
if (vr.error) say(`  spawn error: ${vr.error.message}`);
const tail = vOut.trim().split(/\r?\n/).slice(-20);
say(`command: npm.cmd run verify   (cwd=${REPO})`);
say(`exit=${vCode}`);
for (const l of tail) say(`    ${l}`);

say("");
say(`log -> ${LOG}`);
writeFileSync(LOG, L.join("\n") + "\n", utf8);
process.exit(vCode === 0 && mismatch === 0 ? 0 : 1);
