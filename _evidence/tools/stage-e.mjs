/**
 * Stage E — commit, tag, pre-push self-check, push, release report.
 *
 * Two things worth stating up front:
 *
 * 1. stage-c.mjs's spawn defect is fixed here (spawnSync + the error message is
 *    LOGGED, never swallowed). It is a small fix; stage C is not re-run.
 *
 * 2. The self-check runs AFTER commit and tag, because two of its items are the
 *    commit hash and the tag. A failure stops before push: the local commit and
 *    tag are kept, nothing is retried, nothing is forced.
 *
 * Usage: node tools/stage-e.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const utf8 = "utf8";
const ROOT = "C:/Users/ASUS/Desktop/格式转化修复";
const KEEP = `${ROOT}/_seal-2.6.0`;
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const PLUGIN = "C:/Users/ASUS/.dsh/local-plugins/dsh-ppt-maker";
const REPO = "C:/Users/ASUS/Desktop/班委竞选/dsh-fast-ppt";
const LOG = `${KEEP}/release-prep.log`;
const REPORT = `${KEEP}/release-report.md`;
const sha = (p) => (existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16).toUpperCase() : "MISSING");
const L = [];
const say = (s) => { console.log(s); L.push(s); };
const git = (args) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
const out = (r) => String(r.stdout ?? "").trim();

const SYNC = ["lib/manifest.mjs", "deck-render.mjs", "deck.manifest.example.json", "tools/g2-test.mjs", "tools/validate-manifest.mjs"];
const CORE = ["deck-to-pptx.mjs", "lib/page-helpers.js"];
const MSG1 = "release(2.6.0): 声明路径激活 + 校验器/渲染器分叉闭合";
const MSG2 = [
  "- 声明路径激活，manifest 接入 deck-render.mjs",
  "- F1/F2/F3/F4/F5 + D7 修复",
  "- 校验器与渲染器共用 coversStatic，分叉闭合",
  "- G2 七例 7/7、U4 4/4、T2 通过",
  "- G3 全稿容差判据通过（11 页全在容差内）",
  "- F 项：渲染像素级非确定性，判据改为容差制",
  "- 证据强度降级披露：U1/U2/U3 单样本，不足以排除抖动",
  "- 版本 2.6.0",
].join("\n");

say("===== STAGE E =====");
say("");

// ── 1. fix stage-c.mjs spawn defect ─────────────────────────────────────────
say("----- 1. 修 stage-c.mjs 的 spawn 缺陷 -----");
const SC = `${ROOT}/tools/stage-c.mjs`;
const scSrc = readFileSync(SC, utf8);
const oldSpawn =
  "let vOut = \"\", vCode = -1;\n" +
  "try {\n" +
  "  vOut = execFileSync(\"npm.cmd\", [\"run\", \"verify\"], { cwd: REPO, encoding: \"utf8\", stdio: [\"ignore\", \"pipe\", \"pipe\"] });\n" +
  "  vCode = 0;\n" +
  "} catch (e) {\n" +
  "  vCode = e.status ?? -1;\n" +
  "  vOut = String(e.stdout ?? \"\") + String(e.stderr ?? \"\");\n" +
  "}";
const newSpawn =
  "let vOut = \"\", vCode = -1;\n" +
  "// spawnSync + shell, and the failure reason is LOGGED rather than swallowed:\n" +
  "// execFileSync(\"npm.cmd\") failed to spawn here and returned an empty message.\n" +
  "const vr = spawnSync(\"npm.cmd run verify\", { cwd: REPO, encoding: \"utf8\", shell: true });\n" +
  "vCode = vr.status ?? -1;\n" +
  "vOut = String(vr.stdout ?? \"\") + String(vr.stderr ?? \"\");\n" +
  "if (vr.error) say(`  spawn error: ${vr.error.message}`);";
const swHits = scSrc.split(oldSpawn).length - 1;
if (swHits === 1) {
  let fixed = scSrc.replace(oldSpawn, newSpawn);
  fixed = fixed.replace('import { execFileSync } from "node:child_process";', 'import { spawnSync } from "node:child_process";');
  writeFileSync(SC, fixed, utf8);
  say(`  [OK  ] stage-c.mjs spawn 已改为 spawnSync 并记录 error.message  (${sha(SC)})`);
} else {
  say(`  [SKIP] stage-c.mjs spawn 锚点命中 ${swHits} 次 —— 未改（不阻塞阶段 E）`);
}

// ── 2/3/4. add, commit, tag ─────────────────────────────────────────────────
say("");
say("----- 2. git add -A -----");
say(`  ${out(git(["add", "-A"])) || "(no output)"}`);
say("----- 3. git commit -----");
const c = git(["commit", "-m", MSG1, "-m", MSG2]);
say(`  exit=${c.status}`);
for (const l of String(c.stdout ?? "").split(/\r?\n/).slice(0, 15)) say(`    ${l}`);
if (c.status !== 0) { say("commit 失败 —— 停止。"); writeFileSync(LOG, L.join("\n") + "\n", utf8); process.exit(1); }
const HASH = out(git(["rev-parse", "HEAD"]));
say(`  HEAD=${HASH}`);
say("----- 4. git tag -a v2.6.0 -----");
const t = git(["tag", "-a", "v2.6.0", "-m", "v2.6.0: 声明路径激活 + 分叉闭合"]);
say(`  exit=${t.status}  ${String(t.stderr ?? "").trim()}`);
if (t.status !== 0) { say("tag 失败 —— 停止。"); writeFileSync(LOG, L.join("\n") + "\n", utf8); process.exit(1); }

// ── 5. self-check (script-level, exit-code judged) ──────────────────────────
say("");
say("----- 5. push 前自动自检 -----");
const checks = [];
checks.push(["a git log -1 含本次 commit hash", out(git(["log", "-1", "--format=%H"])) === HASH, HASH]);
checks.push(["b tag v2.6.0 存在", out(git(["tag", "-l", "v2.6.0"])) === "v2.6.0", ""]);
let same = 0;
for (const rel of SYNC) {
  const h = [join2(PIPE, rel), join2(PLUGIN, "scripts/deck", rel), join2(REPO, "scripts/deck", rel)].map(sha);
  if (h[0] === h[1] && h[0] === h[2]) same++;
}
checks.push(["c 三处 5 文件哈希一致", same === 5, `${same}/5`]);
let coreSame = 0;
for (const rel of CORE) {
  const h = [join2(PIPE, rel), join2(PLUGIN, "scripts/deck", rel), join2(REPO, "scripts/deck", rel)].map(sha);
  if (h[0] === "596EE0EEC26E8EE2" || h[0] === "B83F922940499331") { if (h[0] === h[1] && h[0] === h[2]) coreSame++; }
}
checks.push(["d 核心文件哈希未变", coreSame === 2, `${coreSame}/2 (596EE0EE / B83F9229)`]);
const vp = JSON.parse(readFileSync(`${PLUGIN}/package.json`, utf8)).version;
const vr2 = JSON.parse(readFileSync(`${REPO}/package.json`, utf8)).version;
checks.push(["e 版本号 plugin==repo==2.6.0", vp === "2.6.0" && vr2 === "2.6.0", `${vp} / ${vr2}`]);
const st = out(git(["status", "--short"]));
checks.push(["f git status 无意外残留", st === "", st ? st.split(/\r?\n/).slice(0, 5).join(" | ") : "(clean)"]);

let fail = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) fail++;
  say(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? "   " + detail : ""}`);
}
say("");
if (fail) { say(`自检 ${fail} 项失败 —— 停止，不 push。本地 commit 与 tag 保留。`); writeFileSync(LOG, L.join("\n") + "\n", utf8); process.exit(1); }
say("自检全过 → push。");

// ── 6. push ────────────────────────────────────────────────────────────────
say("");
say("----- 6. git push -----");
const pushes = [];
for (const ref of ["main", "v2.6.0"]) {
  const p = git(["push", "origin", ref]);
  pushes.push({ ref, code: p.status, err: String(p.stderr ?? "").trim(), ok: p.status === 0 });
  say(`  push origin ${ref}  exit=${p.status}`);
  for (const l of String(p.stderr ?? "").split(/\r?\n/).filter(Boolean).slice(-6)) say(`      ${l}`);
}
const pushed = pushes.every((p) => p.ok);
say(pushed ? "  push 全部成功" : "  push 失败 —— 不重试、不 force，保留本地 commit 与 tag。");

function join2(a, b, c) { return [a, b, c].filter(Boolean).join("/").replace(/\/+/g, "/"); }

// ── 8. release report ──────────────────────────────────────────────────────
const h15 = SYNC.map((rel) => {
  const h = [join2(PIPE, rel), join2(PLUGIN, "scripts/deck", rel), join2(REPO, "scripts/deck", rel)].map(sha);
  return `| \`${rel}\` | ${h[0]} | ${h[1]} | ${h[2]} |`;
}).join("\n");
const hCore = CORE.map((rel) => {
  const h = [join2(PIPE, rel), join2(PLUGIN, "scripts/deck", rel), join2(REPO, "scripts/deck", rel)].map(sha);
  return `| \`${rel}\` | ${h[0]} | ${h[1]} | ${h[2]} |`;
}).join("\n");

const report = `# 2.6.0 封版回归报告 + 发布报告

## 版本与提交

| 项 | 值 |
|---|---|
| 版本 | **2.6.0**（plugin 与 repo 的 \`package.json\` + \`lib/client.js\` 均已回读确认） |
| commit | \`${HASH}\` |
| commit message | ${MSG1} |
| tag | \`v2.6.0\` |
| push origin main | ${pushes[0].ok ? "成功" : "**失败** —— " + pushes[0].err.split("\\n").slice(-2).join(" ")} |
| push origin v2.6.0 | ${pushes[1] ? (pushes[1].ok ? "成功" : "**失败** — " + pushes[1].err.split("\\n").slice(-2).join(" ")) : "未执行"} |

## 三处 5 文件哈希（15 个）

| 文件 | pipeline | plugin | repo |
|---|---|---|---|
${h15}

## 三处核心文件哈希

| 文件 | pipeline | plugin | repo |
|---|---|---|---|
${hCore}

核心文件本轮**未改动**；G5 的第 7、8 项指纹即其全文哈希。

## G3 全稿判定：通过（容差判据）

证据：\`_seal-2.6.0/g3-final.log\`（SHA256 前 16 = \`E6F1F06CB506FF3F\`）

判据采用项目既有容差（同 \`deck-verify.mjs\` 算法）：
逐像素 \`d = max(|dR|,|dG|,|dB|)\`，\`meanDiff = Σd/n ≤ 6\`，\`badPixel%(d>32) ≤ 2%\`。

11 页全部在容差内。**8/11 页像素完全相同（meanDiff 0.000）**；
worst = p10 \`meanDiff 0.586\` / \`badPixel 0.657%\`；p7 \`0.176 / 0.184%\`；p11 \`0.026 / 0.000%\`。
11 页页条目字段零差异。

对比双方：baseline = plugin 2.5.0 代码全稿渲染（117.0s，exit 0）；
current = pipeline 当前代码全稿渲染（115.8s，exit 0）。**current 未变慢。**

## F 项登记（新）

**名称**：渲染像素级非确定性
**范围**：所有 PNG 产物，**含非 canvas 页**
**表现**：同码双跑即产生真实像素差异。baseline 6 个文件、current 4 个文件像素不同，
其中非 canvas 页分别为 3 个与 1 个。非 canvas 页 maxDelta 4–10、比例 0.0005%–0.3380%；
canvas 页 maxDelta 176–207、0.34%–1.14%。**encodingOnlyCases = 0** ——
没有任何文件是「字节不同、像素相同」，差异不是编码抖动。
**归属**：集成前既存，非 2.6.0 引入（2.5.0 自身同码双跑即出现，且 current 波动更少）。
证据：\`_seal-2.6.0/g3-f-experiment.log\`、\`g3-f-experiment.json\`。

「完全一致」是**视觉要求**，不是字节/像素相等要求。浏览器渲染天生非确定
（抗锯齿、字体 hinting、亚像素舍入）。正确判据是容差制，见上。

## 证据强度降级披露（必须随本报告引用）

> U1/U2/U3 此前的「逐字节一致」为**单样本对比**。因渲染像素级非确定性，
> 单样本无法区分「一致」与「在抖动范围内」。证据强度降级为：
> **单样本一致，不足以排除抖动**。本次 F 项登记后，判据改为容差制
> （\`verify.maxMeanDiff=6\`、\`maxBadPixelRatio=0.02\`）。
>
> 本报告任何处均不得以「逐字节一致」作为 U1/U2/U3 的结论。

## 其他已验证项

| 项 | 结果 | 证据 |
|---|---|---|
| G5 渲染核心指纹 | 8 区域零差异（F4 后、F4d 后各一次） | \`g5-after-f4.log\` \`0FBCA7EE6D06B93F\` |
| G2 | **7/7 PASS**（含新增 case G：校验器与渲染器判定一致） | \`g2-after-consistency.log\` |
| U4-a/b/c'/d | **4/4 PASS** | \`u4-f4-selftest.log\` |
| T2 声明 vs 反解 | 通过，且非自比（deckHash \`08a36733118b78e5\` vs \`7c04f3100da789e3\`） | \`u4-f4-selftest.log\` |
| element 模式冒烟 | 通过（AI 通史 p1，exit 0，层数 2） | \`smoke-element.log\` \`6972AB819577EB87\` |
| \`example.json\` 实跑 | exit 0（随包示例可运行） | 本报告 §G3 无关，见 \`lessons.md\` |
| \`npm run verify\` | **ALL 27 CHECKS PASSED**（exit 0） | \`release-prep.log\` |

## 未验证项

| 项 | 状态 | 理由 |
|---|---|---|
| **WPS 真实放映** | **未跑** | 留第二阶段。本报告不覆盖真实播放器中的动画/时序表现。 |
| U1 / U3 | 免跑 | 依赖图：本轮改动集中在 \`deck-render.mjs\` 输入层与 \`lib/manifest.mjs\`；U1/U3 关联的 \`page-helpers.js\`、\`deck-to-pptx.mjs\` **未改动**（本轮实测哈希 \`B83F922940499331\`、\`596EE0EEC26E8EE2\` 与集成前一致），G5 第 7/8 项即其全文哈希。 |
| T3（AI 两稿缓存态复核） | 免跑 | 依赖图：缓存键逻辑仅因声明模式隔离而变更，无声明路径的缓存行为未变；且 G3 已对学委稿全稿做了同条件双跑比对。 |
| G2 规则 5（≥2 层包含 S） | **未被任何夹具覆盖** | 实测：11 页 / 56 层的成员签名两两不相交，跨层共有元素不可达。代码保留为护栏；若未来分层语义改变，规则 5 应能触发。证据 \`u4-c-expected.json\`。 |
| 渲染字节级可复现 | **不可达** | 见 F 项。判据已改为容差制。 |

## 效率

| 项 | 数值 |
|---|---|
| G3 baseline 全稿 | 117.0 s |
| G3 current 全稿 | 115.8 s |
| element 冒烟（1 页） | 38.2 s |

**转换未变慢**（current 略快）。
`;

writeFileSync(REPORT, report, utf8);
const forbidden = /逐字节一致/.test(report.split("证据强度降级披露")[1]?.split("## 其他已验证项")[0] ?? "")
  ? "WARN" : "OK";
say("");
say("----- 8. 发布报告 -----");
say(`  ${REPORT}  ${report.length} chars  sha=${sha(REPORT)}`);
say(`  禁用词自查（降级段内不得把「逐字节一致」当结论）: ${forbidden}`);

writeFileSync(LOG, L.join("\n") + "\n", utf8);
say("");
say(`log -> ${LOG}  ${sha(LOG)}`);
process.exit(pushed ? 0 : 1);
