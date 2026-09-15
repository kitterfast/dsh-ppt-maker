/**
 * seal-260-b0b4.mjs — 阶段二 B0..B4。硬停；只新增/复制，不改任何既有文件。
 * 备份口径（按"最小化 + 覆盖所有风险面"）：
 *   三个 pptx 产物（86 MB，B5-pre 的护栏对象）
 *   + 三份 render manifest.json（机器可读的"测量事实"记录，T3 不变性比对的基准）
 *   + 学委稿 render\p01、p07 与 AI通史 render-tongshi\p01（T1 最小单元 U1/U2/U3 的基准）
 */
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, statSync, readdirSync, statfsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";

const WB = "C:/Users/ASUS/Desktop/格式转化修复";
const SEAL = `${WB}/_seal-2.6.0`;
const RB = `${WB}/_rollback-2.6.0-integration`;
const REF = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/refdeck";
const MAINPPTX = "C:/Users/ASUS/Desktop/班委竞选/为什么选我做学委·管线版.pptx";
const AI = "E:/deepseek/dsh-ppt-project/build";
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const W = (f, s) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, s, "utf8"); };
let failed = false;
const fail = (m) => { console.error("HARD STOP: " + m); failed = true; };

/* ── B0 磁盘空间 ─────────────────────────────────────────────────── */
{
  const lines = ["B0 磁盘空间检查（fs.statfsSync）", ""];
  let readable = true;
  for (const [name, p] of [["C:", "C:/"], ["E:", "E:/"]]) {
    try {
      const s = statfsSync(p);
      const freeGB = (s.bsize * s.bfree) / 1024 ** 3;
      const totalGB = (s.bsize * s.blocks) / 1024 ** 3;
      lines.push(`${name}  free=${freeGB.toFixed(1)} GB  total=${totalGB.toFixed(1)} GB`);
      console.log(`  [B0] ${name} free=${freeGB.toFixed(1)} GB / ${totalGB.toFixed(1)} GB`);
      if (freeGB < 10) fail(`B0 ${name} 剩余空间 ${freeGB.toFixed(1)} GB < 10 GB`);
    } catch (e) {
      lines.push(`${name}  读取失败: ${e.message}`);
      console.log(`  [B0] ${name} 读取失败: ${e.message}`);
      if (name === "E:") { fail(`B0 无法判定 E: 剩余空间（按规则停下，不假定通过）`); readable = false; }
    }
  }
  W(`${SEAL}/b0-diskspace.log`, lines.join("\r\n") + "\r\n" + (readable ? "" : "\r\n结论：E: 不可判定 -> 停止\r\n"));
}
if (failed) process.exit(1);

/* ── B1 建目录 ───────────────────────────────────────────────────── */
for (const d of [SEAL, RB, `${RB}/products/refdeck-render`, `${RB}/products/deck-main`, `${RB}/products/ai-tongshi`, `${RB}/products/ai-jiasu`]) {
  mkdirSync(d, { recursive: true });
}
console.log(`  [B1] 已建: ${SEAL}`);
console.log(`  [B1] 已建: ${RB}\\products\\{refdeck-render,deck-main,ai-tongshi,ai-jiasu}`);

/* ── B2 备份（目录 4 步判定 / 文件 3 步判定）────────────────────── */
const rows = ["类别\t源\t目标\t大小(B)\tSHA256\t状态"];
function backFile(label, src, dst) {
  if (!existsSync(src)) { rows.push(`文件\t${src}\t${dst}\t-\t-\t源文件缺失（跳过）`); console.log(`  [B2] 缺失跳过: ${src}`); return; }
  mkdirSync(path.dirname(dst), { recursive: true });
  cpSync(src, dst, { force: true });
  const h = sha(dst), z = statSync(dst).size;
  if (h !== sha(src) || z !== statSync(src).size) fail(`B2 复制校验不一致: ${src}`);
  rows.push(`文件\t${src}\t${dst}\t${z}\t${h}\t已备份`);
  console.log(`  [B2] ${String(z).padStart(9)} B  ${h.slice(0, 16)}  ${src}`);
}
function backDir(label, src, dst) {
  if (!existsSync(src)) { rows.push(`目录\t${src}\t${dst}\t-\t-\t源目录缺失（跳过）`); console.log(`  [B2] 缺失跳过: ${src}`); return; }
  const n = readdirSync(src).length;
  if (n === 0) { rows.push(`目录\t${src}\t${dst}\t-\t-\t目录为空（跳过）`); console.log(`  [B2] 空目录跳过: ${src}`); return; }
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true, force: true });
  let bytes = 0, files = 0;
  for (const f of readdirSync(dst, { recursive: true })) {
    const p = path.join(dst, f);
    try { if (statSync(p).isFile()) { bytes += statSync(p).size; files++; } } catch {}
  }
  rows.push(`目录\t${src}\t${dst}\t${bytes}\t(${files} 文件)\t已备份`);
  console.log(`  [B2] ${String(bytes).padStart(9)} B  ${files} 文件  ${src}`);
}

backDir("refdeck-render", `${REF}/render/p01`, `${RB}/products/refdeck-render/p01`);
backDir("refdeck-render", `${REF}/render/p07`, `${RB}/products/refdeck-render/p07`);
backFile("refdeck-manifest", `${REF}/render/manifest.json`, `${RB}/products/refdeck-render/manifest.json`);
backFile("main-pptx", MAINPPTX, `${RB}/products/deck-main/为什么选我做学委·管线版.pptx`);
backFile("ai-tongshi-pptx", `${AI}/AI通史·管线版.pptx`, `${RB}/products/ai-tongshi/AI通史·管线版.pptx`);
backDir("ai-tongshi-render", `${AI}/render-tongshi/p01`, `${RB}/products/ai-tongshi/render/p01`);
backFile("ai-tongshi-manifest", `${AI}/render-tongshi/manifest.json`, `${RB}/products/ai-tongshi/render/manifest.json`);
backFile("ai-jiasu-pptx", `${AI}/AI加速之后·管线版.pptx`, `${RB}/products/ai-jiasu/AI加速之后·管线版.pptx`);
backFile("ai-jiasu-manifest", `${AI}/render-jiasu/manifest.json`, `${RB}/products/ai-jiasu/render/manifest.json`);

W(`${SEAL}/backup-manifest.txt`, rows.join("\r\n") + "\r\n");
if (failed) process.exit(1);

/* ── B3 已由 backup-manifest.txt 覆盖（同上）────────────────────── */

/* ── B4 改前 G5 指纹 ─────────────────────────────────────────────── */
{
  const out = execFileSync(process.execPath, [`${WB}/tools/core-hash.mjs`, PIPE, "BEFORE (2.6.0 集成前)"], { encoding: "utf8" });
  writeFileSync(`${SEAL}/fingerprint-before.txt`, out, "utf8");
  console.log(out.split("\n").map((l) => "  [B4] " + l).join("\n"));
}

/* ── B5-pre 三个 pptx vs v2.4.0 ──────────────────────────────────── */
{
  const expect = [
    ["为什么选我做学委·管线版.pptx", MAINPPTX, "f0afd026fd2488d4430d725c69ed9e0051874fc4f2b13a99e9e25e19222899a2"],
    ["AI通史·管线版.pptx", `${AI}/AI通史·管线版.pptx`, "dd6b97b11ce3947cd44b64c073b02e44b19aa09bbdaed29ce916623554eb4ae4"],
    ["AI加速之后·管线版.pptx", `${AI}/AI加速之后·管线版.pptx`, "4453bdd810a0ce91750008637b7f032ccfdadc0a8ec0ba722196a7cbacc05f09"],
  ];
  const lines = ["B5-pre 当前磁盘 pptx vs v2.4.0 封版哈希（不比 render 目录内独立 GIF：F 白名单）", ""];
  for (const [name, p, exp] of expect) {
    if (!existsSync(p)) { fail(`B5-pre 产物缺失: ${p}`); lines.push(`${name}\t缺失\t\t停止`); continue; }
    const h = sha(p);
    const ok = h === exp;
    lines.push(`${name}\t${statSync(p).size} B\t${h}\t${ok ? "一致" : "不一致"}${ok ? "" : ` (期望 ${exp})`}`);
    console.log(`  [B5-pre] ${ok ? "一致" : "不一致"}  ${name}  ${h.slice(0, 16)}`);
    if (!ok) fail(`B5-pre 哈希不一致: ${name}`);
  }
  W(`${SEAL}/b5pre-compare.txt`, lines.join("\r\n") + "\r\n");
}
if (failed) process.exit(1);
console.log("\nB0–B4 + B5-pre 完成，无硬失败。");
