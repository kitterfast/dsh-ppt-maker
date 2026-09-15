/**
 * seal-250.mjs — 阶段一 步骤 0..4，逐步落盘，硬停。
 * 仅使用 node 写文件（UTF-8 无 BOM）；复制用二进制复制，不经文本解码。
 * 任一步骤出现硬失败 → 立即 exit 1，不再继续后续步骤。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const PLUGIN = "C:/Users/ASUS/.dsh/local-plugins/dsh-ppt-maker";
const REPO = "C:/Users/ASUS/Desktop/班委竞选/dsh-fast-ppt";
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const WB = "C:/Users/ASUS/Desktop/格式转化修复";
const RB = `${WB}/_seal-2.5.0-release-rollback`;
const SEAL = `${WB}/_seal-2.5.0`;
const NEWVER = "2.5.0";

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const size = (f) => statSync(f).size;
const W = (f, s) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, s, "utf8"); };
let failed = false;
const fail = (m) => { console.error("HARD STOP: " + m); failed = true; };

/* ── 步骤 0：回滚准备 ────────────────────────────────────────────── */
{
  mkdirSync(`${RB}/plugin/lib`, { recursive: true });
  mkdirSync(`${RB}/repo/lib`, { recursive: true });
  const maps = [
    [`${PLUGIN}/package.json`, `${RB}/plugin/package.json`],
    [`${PLUGIN}/lib/client.js`, `${RB}/plugin/lib/client.js`],
    [`${PLUGIN}/CHANGELOG.md`, `${RB}/plugin/CHANGELOG.md`],
    [`${REPO}/package.json`, `${RB}/repo/package.json`],
    [`${REPO}/lib/client.js`, `${RB}/repo/lib/client.js`],
    [`${REPO}/CHANGELOG.md`, `${RB}/repo/CHANGELOG.md`],
  ];
  const rows = ["源路径\t备份路径\t大小\tSHA256\t状态"];
  for (const [src, dst] of maps) {
    if (!existsSync(src)) { rows.push(`${src}\t${dst}\t-\t-\t缺失（跳过）`); console.log(`  [0] 缺失跳过: ${src}`); continue; }
    copyFileSync(src, dst);
    const h = sha(dst), z = size(dst);
    if (h !== sha(src) || z !== size(src)) fail(`步骤0 复制校验不一致: ${src}`);
    rows.push(`${src}\t${dst}\t${z}\t${h}\t已备份`);
    console.log(`  [0] 备份 ${z} B  ${h.slice(0, 16)}  ${src}`);
  }
  W(`${RB}/backup-manifest.txt`, rows.join("\r\n") + "\r\n");
  W(`${SEAL}/release-rollback-backup.log`, rows.join("\r\n") + "\r\n");
  console.log("  [0] 回滚目录: " + RB);
}
if (failed) process.exit(1);

/* ── 步骤 1：版本号 bump ────────────────────────────────────────── */
const versionTargets = [
  { name: "plugin/package.json", file: `${PLUGIN}/package.json`, re: /("version"\s*:\s*")([^"]+)(")/ },
  { name: "plugin/lib/client.js", file: `${PLUGIN}/lib/client.js`, re: /(PLUGIN_VERSION\s*=\s*")([^"]+)(")/ },
  { name: "repo/package.json", file: `${REPO}/package.json`, re: /("version"\s*:\s*")([^"]+)(")/ },
  { name: "repo/lib/client.js", file: `${REPO}/lib/client.js`, re: /(PLUGIN_VERSION\s*=\s*")([^"]+)(")/ },
];
{
  const before = ["步骤1 改前版本号（读自磁盘）", ""];
  const plan = [];
  for (const t of versionTargets) {
    const txt = readFileSync(t.file, "utf8");
    const m = t.re.exec(txt);
    if (!m) { fail(`步骤1 找不到版本字段: ${t.name}`); continue; }
    before.push(`${t.name}\t当前=${m[2]}`);
    plan.push({ ...t, old: m[2], txt });
  }
  if (failed) { W(`${SEAL}/version-before.txt`, before.join("\r\n") + "\r\n"); process.exit(1); }

  const after = [];
  for (const p of plan) {
    if (p.old === NEWVER) { after.push(`${p.name}\t已是 ${NEWVER}，跳过写入`); console.log(`  [1] 跳过（已是 ${NEWVER}）: ${p.name}`); continue; }
    writeFileSync(p.file, p.txt.replace(p.re, `$1${NEWVER}$3`), "utf8");
    const raw = readFileSync(p.file);
    const hasBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
    const now = p.re.exec(readFileSync(p.file, "utf8"))?.[2];
    if (now !== NEWVER || hasBom) { fail(`步骤1 写入校验失败: ${p.name} now=${now} BOM=${hasBom}`); continue; }
    if (p.file.endsWith("package.json")) { try { JSON.parse(readFileSync(p.file, "utf8")); } catch (e) { fail(`步骤1 JSON.parse 失败 ${p.name}: ${e.message}`); } }
    after.push(`${p.name}\t${p.old} -> ${now}\tBOM=${hasBom}\tOK`);
    console.log(`  [1] ${p.old} -> ${now}  ${p.name}`);
  }
  W(`${SEAL}/version-before.txt`, before.join("\r\n") + "\r\n\r\n步骤1 改后\r\n" + after.join("\r\n") + "\r\n");
}
if (failed) process.exit(1);

/* ── 步骤 2：同步 5 个新增文件 ──────────────────────────────────── */
const FILES = [
  ["lib/manifest.mjs", `${PIPE}/lib/manifest.mjs`, `${PLUGIN}/scripts/deck/lib/manifest.mjs`, `${REPO}/scripts/deck/lib/manifest.mjs`],
  ["deck.manifest.schema.json", `${PIPE}/deck.manifest.schema.json`, `${PLUGIN}/scripts/deck/deck.manifest.schema.json`, `${REPO}/scripts/deck/deck.manifest.schema.json`],
  ["deck.manifest.example.json", `${PIPE}/deck.manifest.example.json`, `${PLUGIN}/scripts/deck/deck.manifest.example.json`, `${REPO}/scripts/deck/deck.manifest.example.json`],
  ["tools/validate-manifest.mjs", `${PIPE}/tools/validate-manifest.mjs`, `${PLUGIN}/scripts/deck/tools/validate-manifest.mjs`, `${REPO}/scripts/deck/tools/validate-manifest.mjs`],
  ["tools/g2-test.mjs", `${PIPE}/tools/g2-test.mjs`, `${PLUGIN}/scripts/deck/tools/g2-test.mjs`, `${REPO}/scripts/deck/tools/g2-test.mjs`],
];
const syncLines = ["文件\tpipeline\tplugin\trepo\t结果"];
{
  for (const [rel, src, dp, dr] of FILES) {
    if (!existsSync(src)) { fail(`步骤2 源缺失: ${src}`); continue; }
    const hs = sha(src);
    const row = [rel, hs];
    for (const dst of [dp, dr]) {
      mkdirSync(path.dirname(dst), { recursive: true });
      if (existsSync(dst)) {
        const hd = sha(dst);
        if (hd === hs) { console.log(`  [2] 已存在且一致，跳过: ${dst}`); row.push(hd); continue; }
        fail(`步骤2 目标已存在但哈希不一致，拒绝覆盖: ${dst}\n        src=${hs}\n        dst=${hd}`);
        row.push("CONFLICT");
        continue;
      }
      copyFileSync(src, dst);
      const hd = sha(dst);
      if (hd !== hs) { fail(`步骤2 复制后哈希不一致: ${dst}`); row.push("MISMATCH"); continue; }
      console.log(`  [2] ${size(dst)} B  ${hd.slice(0, 16)}  ${dst}`);
      row.push(hd);
    }
    syncLines.push(row.join("\t") + "\t" + (row[2] === hs && row[3] === hs ? "OK" : "PROBLEM"));
  }
  W(`${SEAL}/sync-hashes.log`, syncLines.join("\r\n") + "\r\n\r\n共 " + FILES.length + " 文件 x 3 处 = " + FILES.length * 3 + " 个哈希\r\n");
}
if (failed) process.exit(1);

/* ── 步骤 3：三处核心文件重验 ───────────────────────────────────── */
{
  const cores = [
    ["deck-render.mjs", `${PIPE}/deck-render.mjs`, `${PLUGIN}/scripts/deck/deck-render.mjs`, `${REPO}/scripts/deck/deck-render.mjs`, "af3253c263ba791b"],
    ["deck-to-pptx.mjs", `${PIPE}/deck-to-pptx.mjs`, `${PLUGIN}/scripts/deck/deck-to-pptx.mjs`, `${REPO}/scripts/deck/deck-to-pptx.mjs`, "596ee0eec26e8ee2"],
    ["lib/page-helpers.js", `${PIPE}/lib/page-helpers.js`, `${PLUGIN}/scripts/deck/lib/page-helpers.js`, `${REPO}/scripts/deck/lib/page-helpers.js`, "b83f922940499331"],
  ];
  const lines = ["文件\tpipeline\tplugin\trepo\t期望前缀\t结果"];
  for (const [rel, a, b, c, exp] of cores) {
    const h = [sha(a), sha(b), sha(c)];
    const ok = h[0] === h[1] && h[1] === h[2] && h[0].startsWith(exp);
    if (!ok) fail(`步骤3 核心文件变动: ${rel} ${h.map((x) => x.slice(0, 16)).join(" / ")}`);
    lines.push(`${rel}\t${h[0].slice(0, 16)}\t${h[1].slice(0, 16)}\t${h[2].slice(0, 16)}\t${exp}\t${ok ? "未变" : "变动"}`);
    console.log(`  [3] ${rel}: ${h.map((x) => x.slice(0, 16)).join(" / ")}  ${ok ? "OK" : "FAIL"}`);
  }
  W(`${SEAL}/core-hash-recheck.log`, lines.join("\r\n") + "\r\n");
}
if (failed) process.exit(1);

/* ── 步骤 4：CHANGELOG 前插 ─────────────────────────────────────── */
const ENTRY = `## 2.5.0 (2026-09-15)

### 新增（独立模块，未激活）
- lib/manifest.mjs：声明层核心模块
- deck.manifest.schema.json：schema（已冻结）
- deck.manifest.example.json：样例
- tools/validate-manifest.mjs：校验器 + 歧义报告器
- tools/g2-test.mjs：G2 负例套件（6/6 PASS）

### 说明
- 本版本为独立模块交付，声明路径未接入 deck-render.mjs。
- 无声明路径行为与 2.4.0 逐字节相同。
- 渲染核心 8 项指纹改前/改后全等（G5 PASS）。
- 声明路径激活留待 2.6.0。

### 验证
- G2 负例 6/6 PASS
- G5 指纹 8 项全等
- 4 项验证工具自测通过（gate-a/b/d-proxy/e）

### 未验证
- 声明路径完全未激活，无运行时验证。

`;
{
  const lines = [];
  for (const f of [`${PLUGIN}/CHANGELOG.md`, `${REPO}/CHANGELOG.md`]) {
    const created = !existsSync(f);
    const before = created ? "" : readFileSync(f, "utf8");
    if (before.includes("## 2.5.0 (")) { lines.push(`${f}\t已含 2.5.0，跳过`); console.log(`  [4] 跳过（已含）: ${f}`); continue; }
    const m = /^## /m.exec(before);
    const after = m ? before.slice(0, m.index) + ENTRY + before.slice(m.index) : ENTRY + before;
    writeFileSync(f, after, "utf8");
    const raw = readFileSync(f);
    const hasBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
    const heads = readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("## ")).slice(0, 3);
    if (hasBom || heads[0] !== "## 2.5.0 (2026-09-15)") fail(`步骤4 校验失败: ${f} BOM=${hasBom} head=${heads[0]}`);
    lines.push(`${f}\t新建=${created}\t${before.length} -> ${raw.length} B\tBOM=${hasBom}\t首三段: ${heads.join(" | ")}`);
    console.log(`  [4] ${created ? "新建" : "前插"} ${before.length} -> ${raw.length} B  ${f}`);
  }
  W(`${SEAL}/changelog-diff.log`, lines.join("\r\n") + "\r\n\r\n--- 插入内容原文 ---\r\n" + ENTRY);
}
if (failed) process.exit(1);
console.log("\n步骤 0-4 全部完成，无硬失败。");
