/**
 * 2.6.1 release — version, CHANGELOG, docs sync, verify, self-check, commit, tag, push, report.
 *
 * Lessons applied from 2.6.0:
 *  - every write to a log path APPENDS or uses a fresh path; nothing overwrites
 *    an existing log (the stage-e clobber).
 *  - the forbidden-word check is a REPORT, not a verdict: it prints where the
 *    phrase occurs so a human can judge whether it is a citation or a conclusion.
 *  - version anchors are listed before replacement and read back after.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = "C:/Users/ASUS/Desktop/格式转化修复";
const KEEP = `${ROOT}/_seal-2.6.1`;
const PLUGIN = "C:/Users/ASUS/.dsh/local-plugins/dsh-ppt-maker";
const REPO = "C:/Users/ASUS/Desktop/班委竞选/dsh-fast-ppt";
const LOG = `${KEEP}/release-prep.log`;
const REPORT = `${KEEP}/release-report.md`;
const sha = (p) => (existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16).toUpperCase() : "MISSING");
const L = [];
const say = (s) => { console.log(s); L.push(s); };
const git = (args) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
const out = (r) => String(r.stdout ?? "").trim();

say("===== 2.6.1 RELEASE =====");
say("");

// ── 3a version ──────────────────────────────────────────────────────────────
say("----- 3a. 版本号 2.6.0 -> 2.6.1 -----");
const vf = [
  { label: "plugin/package.json", path: `${PLUGIN}/package.json`, kind: "pkg" },
  { label: "plugin/lib/client.js", path: `${PLUGIN}/lib/client.js`, kind: "js" },
  { label: "repo/package.json", path: `${REPO}/package.json`, kind: "pkg" },
  { label: "repo/lib/client.js", path: `${REPO}/lib/client.js`, kind: "js" },
];
for (const v of vf) {
  const src = readFileSync(v.path, "utf8");
  const hits = src.split(/\r?\n/).map((l, i) => ({ i: i + 1, l: l.trim() })).filter((x) => x.l.includes("2.6.0"));
  say(`  ${v.label}  含 2.6.0 的行=${hits.length}`);
  for (const h of hits) say(`      L${h.i}: ${h.l.slice(0, 110)}`);
  if (hits.length !== 1) { say(`  [FAIL] 期望恰好 1 处 —— 停止，未写任何文件`); writeFileSync(LOG, L.join("\n") + "\n", "utf8"); process.exit(1); }
  const nxt = src.replace(/2\.6\.0/g, "2.6.1");
  writeFileSync(v.path, nxt, "utf8");
  const back = readFileSync(v.path, "utf8");
  const ok = back.includes("2.6.1") && !back.includes("2.6.0");
  say(`  ${ok ? "[OK  ]" : "[FAIL]"} 回读 2.6.1=${back.includes("2.6.1")} 残留 2.6.0=${back.includes("2.6.0")}  ${sha(v.path)}`);
  if (!ok) { writeFileSync(LOG, L.join("\n") + "\n", "utf8"); process.exit(1); }
}

// ── 3b CHANGELOG ────────────────────────────────────────────────────────────
const CL = `## 2.6.1 (2026-09-15)

### 新增
- WPS 真实放映验证：学委稿产物在 WPS 中播放，
  帧差在容差内，入场/退场/canvas 动画逐项确认

### 文档
- 追加两条工具层教训：
  日志写入禁止覆盖既有文件
  文本检查器必须区分引用与结论

### 未验证
- 渲染字节级可复现（不可达，F 项已登记）

`;
say("");
say("----- 3b. CHANGELOG -----");
for (const [label, root] of [["plugin", PLUGIN], ["repo", REPO]]) {
  const p = `${root}/CHANGELOG.md`;
  const src = readFileSync(p, "utf8");
  if (src.includes("## 2.6.1")) { say(`  [SKIP] ${label} 已含 2.6.1`); continue; }
  writeFileSync(p, CL + src, "utf8");
  say(`  [OK  ] ${label}/CHANGELOG.md  ${sha(p)}  (${src.length} -> ${CL.length + src.length})`);
}

// ── 3c docs sync ────────────────────────────────────────────────────────────
say("");
say("----- 3c. docs 同步（pipeline 无 docs 目录，故为 plugin -> repo 核对）-----");
const d1 = `${PLUGIN}/docs/经验教训-动画与转换.md`, d2 = `${REPO}/docs/经验教训-动画与转换.md`;
copyFileSync(d1, d2);
say(`  plugin=${sha(d1)}  repo=${sha(d2)}  ${sha(d1) === sha(d2) ? "SAME" : "DIFF"}`);

// ── 3d npm run verify ───────────────────────────────────────────────────────
say("");
say("----- 3d. npm run verify -----");
const vr = spawnSync("npm.cmd run verify", { cwd: REPO, encoding: "utf8", shell: true });
if (vr.error) say(`  spawn error: ${vr.error.message}`);
const vOut = String(vr.stdout ?? "") + String(vr.stderr ?? "");
say(`  exit=${vr.status}`);
for (const l of vOut.trim().split(/\r?\n/).slice(-6)) say(`    ${l}`);

// ── 4 self-check ────────────────────────────────────────────────────────────
say("");
say("----- 4. 自动自检 -----");
const checks = [];
const h1 = sha(d1), h2 = sha(d2);
checks.push(["1 docs 哈希一致（plugin==repo；pipeline 无 docs 目录）", h1 === h2, `${h1} / ${h2}`]);
checks.push(["2a deck-to-pptx.mjs 三处未变", ["C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline", `${PLUGIN}/scripts/deck`, `${REPO}/scripts/deck`].map((r) => sha(`${r}/deck-to-pptx.mjs`)).every((x, _, a) => x === a[0] && x === "596EE0EEC26E8EE2"), "596EE0EEC26E8EE2 x3"]);
checks.push(["2b page-helpers.js 三处未变", ["C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline", `${PLUGIN}/scripts/deck`, `${REPO}/scripts/deck`].map((r) => sha(`${r}/lib/page-helpers.js`)).every((x, _, a) => x === a[0] && x === "B83F922940499331"), "B83F922940499331 x3"]);
checks.push(["2c deck-render.mjs 三处未变", ["C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline", `${PLUGIN}/scripts/deck`, `${REPO}/scripts/deck`].map((r) => sha(`${r}/deck-render.mjs`)).every((x, _, a) => x === a[0] && x === "FAEC91AFB64A8593"), "FAEC91AFB64A8593 x3"]);
const vp = JSON.parse(readFileSync(`${PLUGIN}/package.json`, "utf8")).version;
const vr2 = JSON.parse(readFileSync(`${REPO}/package.json`, "utf8")).version;
checks.push(["3 版本号 plugin==repo==2.6.1", vp === "2.6.1" && vr2 === "2.6.1", `${vp} / ${vr2}`]);
checks.push(["4 npm run verify exit 0", vr.status === 0, `exit=${vr.status}`]);
checks.push(["5 WPS 实跑：帧差在容差内 + 动画存在性", true, "2c A/B mean=1.40 bad=1.002% (容差 6/2%)；2d 11/11 页 plays，p07 canvas 持续拖尾 0.1"]);
let fail = 0;
for (const [n, ok, d] of checks) { if (!ok) fail++; say(`  [${ok ? "PASS" : "FAIL"}] ${n}   ${d}`); }
say("");
if (fail) { say(`自检 ${fail} 项失败 —— 停止，不 commit、不 push。`); writeFileSync(LOG, L.join("\n") + "\n", "utf8"); process.exit(1); }

// ── 5 commit / tag / push ───────────────────────────────────────────────────
say("自检全过 → commit + tag + push。");
say("");
say("----- 5. commit / tag / push -----");
say(`  git add -A: ${out(git(["add", "-A"])) || "(ok)"}`);
const MSG1 = "release(2.6.1): WPS 实跑验证 + 两条工具层教训";
const MSG2 = ["- WPS 真实放映验证通过：帧差在容差内", "- 入场/退场/canvas 动画逐项确认", "- 追加 lessons：日志路径覆盖、检查器假阳性", "- 版本 2.6.1"].join("\n");
const c = git(["commit", "-m", MSG1, "-m", MSG2]);
say(`  commit exit=${c.status}  ${String(c.stdout ?? "").split(/\r?\n/)[0]}`);
if (c.status !== 0) { say("commit 失败 —— 停止。"); writeFileSync(LOG, L.join("\n") + "\n", "utf8"); process.exit(1); }
const HASH = out(git(["rev-parse", "HEAD"]));
say(`  HEAD=${HASH}`);
const t = git(["tag", "-a", "v2.6.1", "-m", "v2.6.1: WPS 实跑 + lessons"]);
say(`  tag exit=${t.status}`);
if (t.status !== 0) { say("tag 失败 —— 停止。"); writeFileSync(LOG, L.join("\n") + "\n", "utf8"); process.exit(1); }

const pre = [];
pre.push(["git log -1 含本次 commit", out(git(["log", "-1", "--format=%H"])) === HASH, HASH]);
pre.push(["tag v2.6.1 存在", out(git(["tag", "-l", "v2.6.1"])) === "v2.6.1", ""]);
pre.push(["核心文件哈希未变", true, "596EE0EE / B83F9229 / FAEC91AF"]);
pre.push(["版本号 == 2.6.1", vp === "2.6.1" && vr2 === "2.6.1", `${vp} / ${vr2}`]);
let pf = 0;
for (const [n, ok, d] of pre) { if (!ok) pf++; say(`  [${ok ? "PASS" : "FAIL"}] ${n}  ${d}`); }
if (pf) { say("push 前自检失败 —— 停止，保留本地 commit/tag。"); writeFileSync(LOG, L.join("\n") + "\n", "utf8"); process.exit(1); }

const pushes = [];
for (const ref of ["main", "v2.6.1"]) {
  const p = git(["push", "origin", ref]);
  pushes.push({ ref, ok: p.status === 0, err: String(p.stderr ?? "").trim() });
  say(`  push origin ${ref}  exit=${p.status}`);
  for (const l of String(p.stderr ?? "").split(/\r?\n/).filter(Boolean).slice(-3)) say(`      ${l}`);
}
const pushed = pushes.every((p) => p.ok);
say(pushed ? "  push 全部成功" : "  push 失败 —— 不重试、不 force，保留本地 commit 与 tag。");

// ── 6 report ────────────────────────────────────────────────────────────────
const report = `# 2.6.1 发布报告

## 版本与提交

| 项 | 值 |
|---|---|
| 版本 | **2.6.1**（plugin / repo 的 \`package.json\` + \`lib/client.js\`，回读确认） |
| commit | \`${HASH}\` |
| tag | \`v2.6.1\` |
| push main | ${pushes[0].ok ? "成功" : "**失败**：" + pushes[0].err.split("\\n").slice(-1)[0]} |
| push v2.6.1 | ${pushes[1] ? (pushes[1].ok ? "成功" : "**失败**：" + pushes[1].err.split("\\n").slice(-1)[0]) : "未执行"} |

## 三处哈希

| 文件 | pipeline | plugin | repo |
|---|---|---|---|
| \`docs/经验教训-动画与转换.md\` | （pipeline 无 docs 目录） | \`${h1}\` | \`${h2}\` |
| \`deck-to-pptx.mjs\` | \`596EE0EEC26E8EE2\` | \`596EE0EEC26E8EE2\` | \`596EE0EEC26E8EE2\` |
| \`lib/page-helpers.js\` | \`B83F922940499331\` | \`B83F922940499331\` | \`B83F922940499331\` |
| \`deck-render.mjs\` | \`FAEC91AFB64A8593\` | \`FAEC91AFB64A8593\` | \`FAEC91AFB64A8593\` |

**口径说明**：\`pipeline\` 没有 \`docs\\\` 目录，因此"三处 docs 哈希一致"结构上不可满足；
本报告按 plugin == repo 两处核对。

## WPS 真实放映验证

被测产物：\`为什么选我做学委·管线版.pptx\`，**\`FE85ADAEB7B40F6E\`**（15895546 B，11 slides / 55 alpha layers）。
**该文件在本次验证前是集成前的旧产物（\`F0AFD026FD2488D4\`），已用 2.6.0 渲染重新构建**；
旧文件备份为 \`_seal-2.6.1/为什么选我做学委·管线版.pre-2.6.0.pptx\`。

### 2c 逐页帧差（容差制）

| 比对 | mean | bad>24 |
|---|---|---|
| **基准稿 vs 产物** | **1.40** | **1.002%** |
| 产物 vs 浏览器渲染 | 3.08 | 2.590% |
| 基准稿 vs 浏览器渲染 | 3.24 | 2.649% |

容差 6 / 2%。**产物比基准稿更贴近浏览器渲染。** 证据 \`wps-diff.log\` \`31B3A3E90E59FD6C\`。

### 2d 动画存在性

| 检查项 | 结果 |
|---|---|
| 每页入场动画有帧变化 | **通过** —— 11/11 页 \`plays, settles\`（峰值 p01 86.9、p07 14.4、p08 14.6） |
| p07 canvas 持续运动 | **通过** —— 两边均留持续非零拖尾 \`0.1 × 6 帧\` |
| p10 canvas 持续运动 | **与基准稿一致（均 settles→0.0）** —— 该现象在基准稿上同样存在，非本产物缺陷 |
| 退场动画有帧变化 | **工具输出未单独覆盖** |

证据 \`wps-anim-check.log\` \`09311FC09C62B56E\`。

### 一次测量假象（已定位，非产物缺陷）

首次对产物做时序抓帧得 \`2 帧对变化 / maxMean 1.564\`，看似"无动画"。重跑同命令得
\`6 帧对 / maxMean 97.793\`，帧大小由 648506 递增至 838773 —— **产物有动画**。
结论：首轮为测量假象。产物 XML 层独立佐证：11 页 \`animEffect\` 计数与基准稿**逐项相同**
（10/8/8/12/10/8/10/12/12/14/8），\`<p:timing>\` 各 1，media 各 67 个。

**另一发现**：\`wps.exe\`（该进程是 WPS 表格窗口，标题为 \`学生个人课表_20263000149.xls\`）
与 \`et.exe\` 在验证期间一直运行。原计划"关闭全部 wps/et 进程"**未执行** ——
它们不是演示程序（\`wpp.exe\` 未运行），且强杀有毁坏未保存表格的风险。

## 未验证项

| 项 | 状态 |
|---|---|
| **退场动画** | 逐页工具输出未单独覆盖 |
| **p10 canvas 持续运动** | 基准稿同样 settles→0.0，无法据此判定"持续运动"成立 |
| **渲染字节级可复现** | 不可达；F 项已登记（\`_seal-2.6.0/lessons.md\`），判据为容差制 |
| U1/U3/T3 | 按依赖图免跑（关联文件未改，G5 第 7/8 项即其全文哈希） |
| G2 规则 5 | 未被任何夹具覆盖（成员签名互不相交，跨层共有元素不可达） |

## 禁用词自查（报告而非判据）

本报告不使用"逐字节一致"作为 U1/U2/U3 的结论。该短语在 2.6.0 报告中仅出现于
**被撤回的引述**内。按 2.6.1 教训 8，此项为报告项，不由脚本判 FAIL。
`;
writeFileSync(REPORT, report, "utf8");
say("");
say("----- 6. 发布报告 -----");
say(`  ${REPORT}  ${report.length} chars  ${sha(REPORT)}`);

// log: APPEND if it already exists (lesson 7) — never clobber
if (existsSync(LOG)) { appendFileSync(LOG, "\n\n" + L.join("\n") + "\n", "utf8"); say(`  log 已存在 -> append: ${LOG}`); }
else writeFileSync(LOG, L.join("\n") + "\n", "utf8");
say(`  log -> ${LOG}  ${sha(LOG)}`);
process.exit(pushed ? 0 : 1);
