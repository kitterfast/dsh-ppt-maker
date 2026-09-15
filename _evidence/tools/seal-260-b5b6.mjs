/**
 * seal-260-b5b6.mjs — B5 最小单元基线（3 次单页渲染）+ B6 记录基线产物哈希。
 * 口径：
 *   逐字节比 -> render\pNN\*.png（非 GIF）+ 该页 manifest 条目（除 generatedAt）
 *   F 白名单 -> render\pNN\*.gif 只比 帧数 / 像素尺寸
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";

const WB = "C:/Users/ASUS/Desktop/格式转化修复";
const SEAL = `${WB}/_seal-2.6.0`;
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const REF = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/refdeck";
const AI = "E:/deepseek/dsh-ppt-project/build";

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const W = (f, s) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, s, "utf8"); };

function gifInfo(file) {
  const b = readFileSync(file);
  if (b.slice(0, 3).toString("latin1") !== "GIF") return null;
  const w = b.readUInt16LE(6), h = b.readUInt16LE(8);
  let p = 13;
  const flags = b[10];
  if (flags & 0x80) p += 3 * (1 << ((flags & 0x07) + 1));
  let frames = 0;
  const skipSub = () => { while (p < b.length) { const n = b[p++]; if (n === 0) break; p += n; } };
  while (p < b.length) {
    const blk = b[p++];
    if (blk === 0x3b) break;
    if (blk === 0x21) { p++; skipSub(); continue; }
    if (blk === 0x2c) { frames++; const lf = b[p + 8]; p += 9; if (lf & 0x80) p += 3 * (1 << ((lf & 0x07) + 1)); p++; skipSub(); continue; }
    break;
  }
  return { w, h, frames };
}

const UNITS = [
  { id: "U1", label: "学委稿 p1（class 模式，普通页）", cfg: `${REF}/deck.config.json`, only: 1, dir: `${REF}/render`, page: 1 },
  { id: "U2", label: "学委稿 p7（class 模式，canvas 宿主+丢弃+GIF）", cfg: `${REF}/deck.config.json`, only: 7, dir: `${REF}/render`, page: 7 },
  { id: "U3", label: "AI通史 p1（element/legacy 模式）", cfg: `${AI}/deck.ai-tongshi.json`, only: 1, dir: `${AI}/render-tongshi`, page: 1 },
];

const log = ["B5 最小单元基线（无声明路径，--only=N --force）", ""];
const prod = ["B6 最小单元基线产物哈希", "口径：PNG 与 manifest 页条目逐字节；GIF 按 F 白名单只比帧数/尺寸", ""];

for (const u of UNITS) {
  const argv = [`${PIPE}/deck-render.mjs`, u.cfg, `--only=${u.only}`, "--force"];
  log.push(`--- ${u.id}  ${u.label}`);
  log.push(`命令: node ${argv.join(" ")}`);
  const t0 = Date.now();
  let ok = true, out = "";
  try { out = execFileSync(process.execPath, argv, { encoding: "utf8", cwd: PIPE, timeout: 300000 }); }
  catch (e) { ok = false; out = String(e.stdout ?? "") + String(e.stderr ?? ""); }
  const ms = Date.now() - t0;
  const tail = out.trim().split("\n").slice(-4).join("\n");
  log.push(`退出码: ${ok ? 0 : "非0"}   墙钟: ${(ms / 1000).toFixed(1)} s`);
  log.push(tail);
  log.push("");
  console.log(`  [B5] ${u.id} ${ok ? "OK" : "FAIL"}  ${(ms / 1000).toFixed(1)} s  ${u.label}`);
  console.log("        " + tail.replace(/\n/g, "\n        "));
  if (!ok) { W(`${SEAL}/minunit-before.log`, log.join("\r\n")); console.error("HARD STOP: 最小单元渲染失败"); process.exit(1); }

  const pd = path.join(u.dir, `p${String(u.page).padStart(2, "0")}`);
  prod.push(`--- ${u.id}  page ${u.page}  ${pd}`);
  for (const f of readdirSync(pd).sort()) {
    const p = path.join(pd, f);
    if (f.endsWith(".gif")) {
      const g = gifInfo(p);
      prod.push(`  ${f}\t${statSync(p).size}\tF白名单\tframes=${g?.frames} size=${g?.w}x${g?.h}`);
    } else {
      prod.push(`  ${f}\t${statSync(p).size}\t${sha(p)}\t逐字节`);
    }
  }
  const man = JSON.parse(readFileSync(path.join(u.dir, "manifest.json"), "utf8"));
  const entry = man.slides.find((s) => s.page === u.page);
  const entryHash = createHash("sha256").update(JSON.stringify(entry)).digest("hex");
  prod.push(`  manifest.slides[page=${u.page}]\t-\t${entryHash}\t逐字节（除 generatedAt，页条目内不含）`);
  prod.push("");
}

W(`${SEAL}/minunit-before.log`, log.join("\r\n"));
W(`${SEAL}/minunit-before-products.txt`, prod.join("\r\n"));
console.log(`\n  [B6] 已写 ${SEAL}/minunit-before-products.txt`);
console.log("B5/B6 完成，无硬失败。");
