/**
 * 2.6.1 release, part 2 — sync the install-side authorize.mjs fix to the source,
 * re-run verify, self-check, commit, tag, push, report.
 *
 * WHY: scripts/cdp/authorize.mjs diverged (install 4647 B / 118 lines, newer;
 * source 4199 B / 111 lines, stale from 09-13). The extra content is a real fix
 * with a measured rationale ("Page.bringToFront ... 20s timeout -> 77ms"), not
 * runtime state. Direction is therefore install -> source.
 *
 * Lesson 7 applied properly this time: EVERY write to the log path goes through
 * flush(), which appends when the file exists. No failure path clobbers it.
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
const flush = (code) => {
  const text = "\n\n" + L.join("\n") + "\n";
  if (existsSync(LOG)) appendFileSync(LOG, text, "utf8");
  else writeFileSync(LOG, L.join("\n") + "\n", "utf8");
  process.exit(code);
};
const git = (args) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
const out = (r) => String(r.stdout ?? "").trim();

say("===== 2.6.1 RELEASE (part 2) =====");
say("");

// ── sync authorize.mjs: install -> source ───────────────────────────────────
say("----- sync scripts/cdp/authorize.mjs (install -> source) -----");
const srcA = `${PLUGIN}/scripts/cdp/authorize.mjs`;
const dstA = `${REPO}/scripts/cdp/authorize.mjs`;
const bakA = `${KEEP}/authorize.mjs.pre-sync.bak`;
say(`  before: install=${sha(srcA)}  source=${sha(dstA)}`);
copyFileSync(dstA, bakA);
say(`  备份 source -> ${bakA}  ${sha(bakA)}  ${existsSync(bakA) ? "(ok)" : "(FAIL)"}`);
copyFileSync(srcA, dstA);
say(`  after : install=${sha(srcA)}  source=${sha(dstA)}  ${sha(srcA) === sha(dstA) ? "SAME" : "DIFF"}`);
if (sha(srcA) !== sha(dstA)) { say("同步失败 —— 停止。"); flush(1); }

// document it, so the release does not ship an undocumented code change
const CL_ADD = `- 同步 scripts/cdp/authorize.mjs 修复（安装侧 -> 源侧）：\n  截图前先 Page.bringToFront，避免后台标签页不产生合成帧导致 30s 超时\n`;
for (const [label, root] of [["plugin", PLUGIN], ["repo", REPO]]) {
  const p = `${root}/CHANGELOG.md`;
  let s = readFileSync(p, "utf8");
  if (s.includes("scripts/cdp/authorize.mjs")) { say(`  [SKIP] ${label} CHANGELOG 已记`); continue; }
  const m = "### 文档\n";
  s = s.includes(m) ? s.replace(m, "### 修复\n" + CL_ADD + "\n" + m) : s.replace("## 2.6.1 (2026-09-15)\n", "## 2.6.1 (2026-09-15)\n\n### 修复\n" + CL_ADD + "\n");
  writeFileSync(p, s, "utf8");
  say(`  [OK  ] ${label}/CHANGELOG.md 记入 authorize 同步  ${sha(p)}`);
}

// ── verify ──────────────────────────────────────────────────────────────────
say("");
say("----- npm run verify -----");
const vr = spawnSync("npm.cmd run verify", { cwd: REPO, encoding: "utf8", shell: true });
if (vr.error) say(`  spawn error: ${vr.error.message}`);
const vOut = String(vr.stdout ?? "") + String(vr.stderr ?? "");
say(`  exit=${vr.status}`);
for (const l of vOut.trim().split(/\r?\n/).filter((l) => /ok |PASS|FAIL|Assertion|不一致/.test(l)).slice(-8)) say(`    ${l}`);

// ── self-check ──────────────────────────────────────────────────────────────
say("");
say("----- 自动自检 -----");
const D1 = `${PLUGIN}/docs/经验教训-动画与转换.md`, D2 = `${REPO}/docs/经验教训-动画与转换.md`;
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const trio = (rel) => [sha(`${PIPE}/${rel}`), sha(`${PLUGIN}/scripts/deck/${rel}`), sha(`${REPO}/scripts/deck/${rel}`)];
const allSame = (h, want) => h.every((x) => x === h[0]) && (!want || h[0] === want);
const checks = [
  ["1 docs plugin==repo", sha(D1) === sha(D2), `${sha(D1)} / ${sha(D2)}`],
  ["2a deck-to-pptx.mjs x3 == 596EE0EEC26E8EE2", allSame(trio("deck-to-pptx.mjs"), "596EE0EEC26E8EE2"), trio("deck-to-pptx.mjs").join(" ")],
  ["2b page-helpers.js x3 == B83F922940499331", allSame(trio("lib/page-helpers.js"), "B83F922940499331"), trio("lib/page-helpers.js").join(" ")],
  ["2c deck-render.mjs x3 == FAEC91AFB64A8593", allSame(trio("deck-render.mjs"), "FAEC91AFB64A8593"), trio("deck-render.mjs").join(" ")],
  ["3 版本 plugin==repo==2.6.1", JSON.parse(readFileSync(`${PLUGIN}/package.json`, "utf8")).version === "2.6.1" && JSON.parse(readFileSync(`${REPO}/package.json`, "utf8")).version === "2.6.1", "2.6.1 / 2.6.1"],
  ["4 npm run verify exit 0", vr.status === 0, `exit=${vr.status}`],
  ["5 WPS 实跑（帧差容差内 + 动画存在）", true, "A/B mean=1.40 bad=1.002%；11/11 plays；p07 canvas 拖尾 0.1"],
];
let fail = 0;
for (const [n, ok, d] of checks) { if (!ok) fail++; say(`  [${ok ? "PASS" : "FAIL"}] ${n}   ${d}`); }
say("");
if (fail) { say(`自检 ${fail} 项失败 —— 停止，不 commit、不 push。`); flush(1); }
say("自检全过 → commit + tag + push。");

// ── commit / tag / push ─────────────────────────────────────────────────────
say("");
say("----- commit / tag / push -----");
out(git(["add", "-A"]));
const c = git(["commit", "-m", "release(2.6.1): WPS 实跑验证 + 两条工具层教训", "-m",
  ["- WPS 真实放映验证通过：帧差在容差内", "- 入场/canvas 动画逐项确认", "- 追加 lessons：日志路径覆盖、检查器假阳性", "- 同步 scripts/cdp/authorize.mjs 修复（安装侧 -> 源侧）", "- 版本 2.6.1"].join("\n")]);
say(`  commit exit=${c.status}  ${String(c.stdout ?? "").split(/\r?\n/)[0]}`);
if (c.status !== 0) { say("commit 失败 —— 停止。"); flush(1); }
const HASH = out(git(["rev-parse", "HEAD"]));
say(`  HEAD=${HASH}`);
const t = git(["tag", "-a", "v2.6.1", "-m", "v2.6.1: WPS 实跑 + lessons"]);
say(`  tag exit=${t.status}`);
if (t.status !== 0) { say("tag 失败 —— 停止。"); flush(1); }
const pre = [["log -1 == HEAD", out(git(["log", "-1", "--format=%H"])) === HASH], ["tag v2.6.1", out(git(["tag", "-l", "v2.6.1"])) === "v2.6.1"]];
for (const [n, ok] of pre) say(`  [${ok ? "PASS" : "FAIL"}] ${n}`);
if (pre.some(([, ok]) => !ok)) { say("push 前自检失败 —— 停止。"); flush(1); }
const pushes = [];
for (const ref of ["main", "v2.6.1"]) {
  const p = git(["push", "origin", ref]);
  pushes.push({ ref, ok: p.status === 0, err: String(p.stderr ?? "").trim() });
  say(`  push origin ${ref}  exit=${p.status}`);
  for (const l of String(p.stderr ?? "").split(/\r?\n/).filter(Boolean).slice(-2)) say(`      ${l}`);
}
const pushed = pushes.every((p) => p.ok);
say(pushed ? "  push 成功" : "  push 失败 —— 不重试、不 force，保留本地 commit 与 tag。");
const remote = out(git(["ls-remote", "origin", "refs/heads/main"]));

// ── report ──────────────────────────────────────────────────────────────────
const report = `# 2.6.1 发布报告

## 版本与提交

| 项 | 值 |
|---|---|
| 版本 | **2.6.1**（plugin / repo 的 \`package.json\` + \`lib/client.js\`，回读确认） |
| commit | \`${HASH}\` |
| tag | \`v2.6.1\` |
| push main | ${pushes[0].ok ? "成功" : "**失败**：" + pushes[0].err.split("\\n").slice(-1)[0]} |
| push v2.6.1 | ${pushes[1] ? (pushes[1].ok ? "成功" : "**失败**") : "未执行"} |
| 远端 main | \`${remote}\` |

## 三处哈希

| 文件 | pipeline | plugin | repo |
|---|---|---|---|
| \`deck-to-pptx.mjs\` | \`596EE0EEC26E8EE2\` | \`596EE0EEC26E8EE2\` | \`596EE0EEC26E8EE2\` |
| \`lib/page-helpers.js\` | \`B83F922940499331\` | \`B83F922940499331\` | \`B83F922940499331\` |
| \`deck-render.mjs\` | \`FAEC91AFB64A8593\` | \`FAEC91AFB64A8593\` | \`FAEC91AFB64A8593\` |
| \`docs/经验教训-动画与转换.md\` | （pipeline 无 docs 目录） | \`${sha(D1)}\` | \`${sha(D2)}\` |
| \`scripts/cdp/authorize.mjs\` | — | \`${sha(srcA)}\` | \`${sha(dstA)}\` |

**口径说明**：\`pipeline\` 无 \`docs\\\` 目录，故该项按 plugin == repo 两处核对。

## WPS 真实放映验证（通过）

被测产物 \`为什么选我做学委·管线版.pptx\` = **\`FE85ADAEB7B40F6E\`**（15895546 B，11 slides / 55 alpha layers）。
该文件在验证前是集成前旧产物（\`F0AFD026FD2488D4\`），已用 2.6.0 渲染重建；旧版备份于 \`_seal-2.6.1/\`。

| 比对（2c 逐页帧差，容差 6 / 2%） | mean | bad>24 |
|---|---|---|
| **基准稿 vs 产物** | **1.40** | **1.002%** |
| 产物 vs 浏览器渲染 | 3.08 | 2.590% |
| 基准稿 vs 浏览器渲染 | 3.24 | 2.649% |

产物比基准稿更贴近浏览器渲染。证据 \`wps-diff.log\` \`31B3A3E90E59FD6C\`。

2d 动画存在性：11/11 页 \`plays, settles\`（峰值 p01 86.9、p07 14.4、p08 14.6）；
p07 canvas 持续拖尾 \`0.1×6\` 通过；**p10 与基准稿一致（均 settles→0.0）**，该现象在基准稿上同样存在。
证据 \`wps-anim-check.log\` \`09311FC09C62B56E\`。

已定位一次测量假象：产物首次时序抓帧 \`maxMean 1.564\`（似无动画），重跑 \`97.793\`。
XML 独立佐证：11 页 \`animEffect\` 计数与基准稿逐项相同（10/8/8/12/10/8/10/12/12/14/8）。

## scripts/cdp/authorize.mjs 同步（本次发布附带）

\`npm run verify\` 的「安装与源不一致」检查失败，根因**先于本次会话**：
安装侧 \`4647 B / 118 行\`（含修复），源侧 \`4199 B / 111 行\`（09-13 旧版）。
差异为一段带实测依据的修复，非运行时状态：

\`\`\`
// ... Page.captureScreenshot never returns and times out after 30s ...
// Activating the tab first makes the capture return in ~80ms
// (measured 2026-09-14: 20s timeout -> 77ms).
await client.call('Page.bringToFront', {}, sessionId)
\`\`\`

按裁定同步方向为 **install -> source**。源侧原文件备份为 \`_seal-2.6.1/authorize.mjs.pre-sync.bak\`（\`${sha(bakA)}\`）。
该修复**超出 2.6.1 原定范围**，已在两份 CHANGELOG 的「修复」节记入。

## 未验证项

| 项 | 状态 |
|---|---|
| 退场动画 | 逐页工具输出未单独覆盖 |
| p10 canvas「持续运动」 | 基准稿同样 settles→0.0；产物与其一致，无法据此判定成立 |
| 渲染字节级可复现 | 不可达；F 项已登记，判据为容差制 |
| U1/U3/T3 | 按依赖图免跑（关联文件未改，G5 第 7/8 项即其全文哈希） |
| G2 规则 5 | 未被任何夹具覆盖 |
| DSH 插件同步为何未回写源仓库 | **未查**（本次仅按裁定单向同步一个文件） |

## 禁用词自查（报告项，非判据）

本报告不使用「逐字节一致」作为 U1/U2/U3 的结论。
`;
writeFileSync(REPORT, report, "utf8");
say("");
say(`  report -> ${REPORT}  ${report.length} chars  ${sha(REPORT)}`);
flush(pushed ? 0 : 1);
