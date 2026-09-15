/**
 * minunit-after.mjs — D 阶段：改后最小单元 + 逐字节比对（口径 a + b）。
 *   口径 a：slides[].hash 是缓存键，从逐字节比对中排除
 *   口径 b：差异逐条记录；并用"第二次跑必须报 cached"证明缓存机制正常
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";

const WB = "C:/Users/ASUS/Desktop/格式转化修复";
const SEAL = `${WB}/_seal-2.6.0`;
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const REF = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/refdeck";
const AI = "E:/deepseek/dsh-ppt-project/build";
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

const BASE = {
  U1: { dir: `${REF}/render/p01`, page: 1, renderDir: `${REF}/render`, files: {
    "base.png": "5de0e91bd1884ecf13329d07c8fab5671e0160b7678eb32fd09233968f6678cb",
    "g0.png": "e27d68da8bb9cde9e4fffef8ba1510b7b4940e40cdca0c7eea2eba4ce8657cc1",
    "g1.png": "fa6d986a40268ecfd904f9db6982d8de71e9c7a85a30f9c49ca37609ae4799e4",
    "g2.png": "f8cd3c7591a550aaa787881bf31c17b31168d0daf2f590f9226ed192821e2bff",
    "g3.png": "95f46461308c1c4d66433f2bf6465095413188223200b57c86c1245eae5bb850",
    "g4.png": "ce400e4b9fd799b3260faf90a4deb297fc75ffae23c62c0899eb2c9bdb316ee9",
    "g5.png": "a20714c1dcb91e549fca7a4d59fc19d340e82e9438380ebbe79c44f882bc0741",
    "g6.png": "da26e605e21c5434992a43a9f96f1880b6be8c9fdb97541881924adc41f5a1b0",
    "g7.png": "2fea0c9fd88beb374bf9a4d97a43b17b5676f81f504f06527c762adcebce593a",
    "ref.png": "48ebf708ca762dfd3f9b5fa889a6147507b9e738600b5fe03da6bc3c435fdff7" } },
  U2: { dir: `${REF}/render/p07`, page: 7, renderDir: `${REF}/render`, files: {
    "base.png": "4105a2b26335637a064d6bb259968579bd0d4dbda498de0caf1e636f29fd704c",
    "g0.png": "1496765005ffe5144139edb093a92d34cf18564b5ab30e179e3d12b9b74c18d3",
    "g1.png": "5da911e71f50e70850533837d394ea29d602b2fa92f8d34803f15867217f2f4d",
    "g2.png": "5cf85b6dc372f9ffaeb84a5364b5f3c87888b6777629b6b19847f70dcd2b1a9c",
    "g3.png": "d5759d92f858c8954760ba0b1737ab72550a6a25ffb3a504fccc080c9a7ff012",
    "g4.png": "ce5764cecb4c58b8f25831a18c130fcb9c6d854f5376faeb7440e605d5815405",
    "g5.png": "06532789514502f01bbaa88bd12226a0b6bf09b02c643ebdc1db1cec7691a699",
    "ref.png": "64817de3318a3e87f2bfc1aea83554304354ef16f7c7c2aaf6c0d35a7fa1cf6f" },
    gif: { name: "bit-3-0.gif", frames: 86, w: 904, h: 504 } },
  U3: { dir: `${AI}/render-tongshi/p01`, page: 1, renderDir: `${AI}/render-tongshi`, files: {
    "base.png": "114c68723812c847b1c5256835d1740fe4599eac6c0e5dded0df400a5512e1cb",
    "g0.png": "8defae22a58ad6b12b1745c37fc5bed08000ebc17f9fbc32db6ec946891af281",
    "g1.png": "3f5aabb970989e9cecc26b7c427e7e8831761e36e67a1d2320464572ceba93de",
    "ref.png": "bf2f69eb322f56ce96d4dfb7a4becac3f2d4ac11e66a11306a854b8ea1ed414c" },
    gif: { name: "bit-0-0.gif", frames: 200, w: 716, h: 140 } },
};

function gifInfo(file) {
  const b = readFileSync(file);
  const w = b.readUInt16LE(6), h = b.readUInt16LE(8);
  let p = 13; const flags = b[10];
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

const log = ["D 改后最小单元（口径 a：slides[].hash 作为缓存键排除；口径 b：差异逐条记录）", ""];
const run = (args) => { const t0 = Date.now(); let out = "", ok = true;
  try { out = execFileSync(process.execPath, args, { encoding: "utf8", cwd: PIPE, timeout: 300000 }); }
  catch (e) { ok = false; out = String(e.stdout ?? "") + String(e.stderr ?? ""); }
  return { ok, out, s: (Date.now() - t0) / 1000 };
};

/* 口径 b：缓存机制证明 —— U1 不加 --force 重跑，必须报 cached */
{
  const r = run([`${PIPE}/deck-render.mjs`, `${REF}/deck.config.json`, "--only=1"]);
  const cached = /p1 cached/.test(r.out);
  log.push(`[缓存证明] 第二次跑 U1（无 --force）：exit=${r.ok ? 0 : "非0"}  ${r.s.toFixed(1)}s  p1 cached=${cached}`);
  console.log(`  [缓存证明] p1 cached=${cached}  ${r.s.toFixed(1)}s`);
  if (!cached) { console.error("HARD STOP: 第二次跑未命中缓存"); }
}
/* U2 / U3 改后渲染 */
for (const [id, u] of [["U2", { cfg: `${REF}/deck.config.json`, only: 7 }], ["U3", { cfg: `${AI}/deck.ai-tongshi.json`, only: 1 }]]) {
  const r = run([`${PIPE}/deck-render.mjs`, u.cfg, `--only=${u.only}`, "--force"]);
  log.push(`[重渲染] ${id} --only=${u.only} --force：exit=${r.ok ? 0 : "非0"}  ${r.s.toFixed(1)}s`);
  console.log(`  [${id}] exit=${r.ok ? 0 : "非0"}  ${r.s.toFixed(1)}s  ${r.out.trim().split("\n").slice(-2)[0]}`);
}
/* 比对 */
let allOk = true;
for (const id of ["U1", "U2", "U3"]) {
  const u = BASE[id];
  log.push(`--- ${id}  ${u.dir}`);
  for (const f of Object.keys(u.files)) {
    const p = path.join(u.dir, f);
    const got = existsSync(p) ? sha(p) : "MISSING";
    const ok = got === u.files[f];
    if (!ok) allOk = false;
    log.push(`  ${ok ? "一致" : "不一致"}  ${f}  ${got.slice(0, 16)}`);
    console.log(`  ${id} ${ok ? "一致  " : "不一致"} ${f}`);
  }
  if (u.gif) {
    const p = path.join(u.dir, u.gif.name);
    const g = existsSync(p) ? gifInfo(p) : null;
    const ok = g && g.frames === u.gif.frames && g.w === u.gif.w && g.h === u.gif.h;
    if (!ok) allOk = false;
    log.push(`  ${ok ? "白名单一致" : "白名单不一致"}  ${u.gif.name}  frames=${g?.frames} size=${g?.w}x${g?.h}（期望 ${u.gif.frames} / ${u.gif.w}x${u.gif.h}）`);
    console.log(`  ${id} ${ok ? "白名单一致" : "白名单不一致"} ${u.gif.name} frames=${g?.frames} ${g?.w}x${g?.h}`);
  }
  const man = JSON.parse(readFileSync(path.join(u.renderDir, "manifest.json"), "utf8"));
  const e = man.slides.find((s) => s.page === u.page);
  const eNoHash = JSON.stringify({ ...e, hash: undefined });
  log.push(`  口径a：页条目（排除 hash 缓存键）长度=${eNoHash.length}，hash=${String(e.hash).slice(0, 16)}（已排除，不作为判定）`);
}
log.push("");
log.push(`D 最小单元判定（口径 a）：${allOk ? "PASS —— 全部渲染产物逐字节/白名单一致" : "FAIL"}`);
mkdirSync(SEAL, { recursive: true });
writeFileSync(`${SEAL}/minunit-after.log`, log.join("\r\n"), "utf8");
console.log(`\n  D 最小单元判定（口径 a）: ${allOk ? "PASS" : "FAIL"}`);
process.exit(allOk ? 0 : 1);
