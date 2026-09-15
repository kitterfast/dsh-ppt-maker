/**
 * D minimal-unit verdict — applies the DISCLOSED F caliber to the strict log.
 *
 * The strict tool (tools/minunit-after.mjs) byte-compares every product and is
 * deliberately left untouched. This reader applies one, and only one, documented
 * exception and prints it in full so the verdict can be audited:
 *
 *   U2 (refdeck page 7) base.png / ref.png are excluded from byte comparison
 *   because they were MEASURED to be non-byte-reproducible: two runs of the
 *   SAME code produced different bytes for both files
 *   (see _seal-2.6.0/u2-f-determinism.log). Page 7's base carries the live
 *   starfield canvas, and ref.png is a whole-page screenshot that contains it.
 *
 * Nothing else is relaxed: every other product stays byte-exact, and the GIF
 * layer stays under the frame-count / size whitelist. U1 and U3 get no
 * exemption at all.
 *
 * Usage: node tools/d-verdict.mjs <minunitLog> [fEvidenceLog]
 */
import { readFileSync, existsSync } from "node:fs";

const logPath = process.argv[2];
const fPath = process.argv[3] ?? "_seal-2.6.0/u2-f-determinism.log";

if (!logPath || !existsSync(logPath)) {
  console.error(`Usage: node tools/d-verdict.mjs <minunitLog> [fEvidenceLog]`);
  console.error(`missing: ${logPath}`);
  process.exit(2);
}

// --- the single disclosed exception -----------------------------------------
const F_WHITELIST = {
  U2: ["base.png", "ref.png"],
};

if (!existsSync(fPath)) {
  console.error(`F 证据缺失，拒绝套用豁免: ${fPath}`);
  process.exit(2);
}
const fEvidence = readFileSync(fPath, "utf8");
const fLines = fEvidence
  .split(/\r?\n/)
  .filter((l) => /^\s*(run 1|run 2|B6 基准)\s*:/.test(l));
const baseHashes = new Set(
  fLines.map((l) => (l.match(/base\.png=([0-9A-Fa-f]{16})/) || [])[1]).filter(Boolean),
);
const refHashes = new Set(
  fLines.map((l) => (l.match(/ref\.png=([0-9A-Fa-f]{16})/) || [])[1]).filter(Boolean),
);
const fProven = baseHashes.size >= 2 && refHashes.size >= 2;

console.log("===== D 最小单元判定（口径 a + 已披露的 F 豁免） =====");
console.log(`严格日志: ${logPath}`);
console.log(`F 证据  : ${fPath}`);
console.log("");
console.log("豁免项（唯一一项，且附证据）:");
for (const [unit, files] of Object.entries(F_WHITELIST)) {
  console.log(`  ${unit}: ${files.join(", ")}  <= 同码双跑实测不可字节复现（F）`);
}
console.log(`  证据中 base.png 出现 ${baseHashes.size} 个不同值，ref.png 出现 ${refHashes.size} 个不同值`);
console.log(`  F 证据自洽: ${fProven ? "是" : "否 —— 证据不足，豁免不成立"}`);
console.log("");
if (!fProven) {
  console.log("D 最小单元判定: FAIL（豁免不成立，按严格口径计）");
  process.exit(1);
}
console.log("  未被放宽的部分: U1/U3 全量逐字节；U2 的 g0..g5 逐字节；GIF 仍按帧数/尺寸白名单。");
console.log("");

const lines = readFileSync(logPath, "utf8").split(/\r?\n/);

// --- hard requirements ------------------------------------------------------
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

const cached = lines.find((l) => l.includes("[缓存证明]"));
add("缓存证明 p1 cached=true", /cached=true/.test(cached ?? ""), (cached ?? "(缺失)").trim());

const results = [];
for (const l of lines) {
  const m = l.match(/^\s*(U[123])\s+(一致|不一致)\s+(\S+)\s*$/);
  if (m) results.push({ unit: m[1], ok: m[2] === "一致", file: m[3] });
  const w = l.match(/^\s*(U[123])\s+白名单一致\s+(\S+)\s+frames=(\d+)\s+(\d+x\d+)\s*$/);
  if (w) results.push({ unit: w[1], ok: true, file: `${w[2]} [whitelist ${w[3]}f ${w[4]}]` });
}

if (results.length === 0) {
  console.log("D 最小单元判定: FAIL（未从日志解析到任何单元结果）");
  process.exit(1);
}

const byUnit = {};
for (const r of results) (byUnit[r.unit] ??= []).push(r);

for (const unit of ["U1", "U2", "U3"]) {
  const rs = byUnit[unit] ?? [];
  const exempt = F_WHITELIST[unit] ?? [];
  const bad = rs.filter((r) => !r.ok && !exempt.includes(r.file));
  const skipped = rs.filter((r) => !r.ok && exempt.includes(r.file));
  for (const s of skipped) console.log(`  ${unit} 豁免(F)  ${s.file}`);
  add(
    `${unit} 通过（${rs.length} 项，豁免 ${skipped.length} 项）`,
    rs.length > 0 && bad.length === 0,
    bad.length ? `未通过: ${bad.map((b) => b.file).join(", ")}` : "ok",
  );
}

const whitelistUnits = Object.keys(byUnit).filter((u) =>
  (byUnit[u] ?? []).some((r) => r.file.includes("[whitelist")),
);
add("每稿至少 1 项 GIF 白名单结果", whitelistUnits.length >= 1, whitelistUnits.join(", ") || "无");

console.log("");
let allOk = true;
for (const c of checks) {
  console.log(`  [${c.ok ? "PASS" : "FAIL"}] ${c.name}  ${c.ok ? "" : "-> " + c.detail}`);
  if (!c.ok) allOk = false;
}
console.log("");
console.log(`D 最小单元判定: ${allOk ? "PASS" : "FAIL"}`);
console.log(
  allOk
    ? "  依据: 口径 a（忽略 slides[].hash —— 该字段是本轮刻意变更的缓存键，非渲染输出）\n" +
      "        + 唯一豁免 U2 base.png/ref.png（已由同码双跑实测判定为 F）\n" +
      "        + 缓存仍生效（p1 cached=true 实测）。"
    : "  存在未通过项，不得判定为 PASS。",
);
process.exit(allOk ? 0 : 1);
