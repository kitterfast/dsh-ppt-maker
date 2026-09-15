/**
 * Stage A — --report wording, plus the lessons documentation.
 *
 * A1  The --report summary printed one merged line:
 *       "=> REQUIRED declarations for this deck: version, capturePad"
 *     for a deck whose page 7 genuinely nests its members. That sentence is where
 *     this whole class of divergence started, so static and runtime are now stated
 *     separately and never merged.
 *
 * A2  Lessons appended (idempotently, marker-guarded) to the plugin's and the
 *     repo's docs/经验教训-动画与转换.md:
 *       1 template-literal escape consumption (F3b)
 *       2 anchor replacement must self-check with node --check (F4b/F4c)
 *       3 every() is vacuously true on a one-element array (D-a)
 *       4 block-scoped import visibility (D-b)
 *       5 checker and renderer must decide through one shared function
 *
 * Usage: node tools/stage-a.mjs [--dry]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

const dry = process.argv.includes("--dry");
const PIPE = "C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline";
const VM = `${PIPE}/tools/validate-manifest.mjs`;
const PLUGIN = "C:/Users/ASUS/.dsh/local-plugins/dsh-ppt-maker";
const REPO = "C:/Users/ASUS/Desktop/班委竞选/dsh-fast-ppt";
const LOG = "C:/Users/ASUS/Desktop/格式转化修复/_seal-2.6.0/docs-diff.log";
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16).toUpperCase();
const lines = [];
const say = (s) => { console.log(s); lines.push(s); };

// ── A1: --report wording ────────────────────────────────────────────────────
const vmPatches = [
  {
    name: "A1a compute runtime verdict before the report block",
    old: "/* ── 2. ambiguity report: which fields a manifest MUST declare ───────────── */\n\nif (report) {",
    new:
      "/* ── 2. ambiguity report: which fields a manifest MUST declare ───────────── */\n" +
      "\n" +
      "const runtimeUnresEarly = res.present ? runtimeUnresolved(res.merged, sections.length) : [];\n" +
      "\n" +
      "if (report) {",
  },
  {
    name: "A1b state static and runtime separately",
    old:
      "  const need = [...amb.keys()];\n" +
      '  console.log(`\\n  => REQUIRED declarations for this deck: version, capturePad${need.length ? ", plus coverage for " + need.join(", ") : ""}`);',
    new:
      "  const need = [...amb.keys()];\n" +
      "  // Static and runtime are stated SEPARATELY, never merged into one\n" +
      "  // \"REQUIRED\" line. The merged line used to tell the reader that\n" +
      "  // version+capturePad were enough for a deck whose page 7 genuinely nests its\n" +
      "  // members — the sentence this whole class of divergence started from.\n" +
      '  console.log(`\\n  => static : version, capturePad${need.length ? ", plus coverage for " + need.join(", ") : ""}`);\n' +
      '  console.log(`  => runtime: ${runtimeUnresEarly.length ? `UNRESOLVED (${runtimeUnresEarly.map((u) => u.code).join(", ")}, ${sections.length} page(s))` : "resolved"}`);',
  },
  {
    name: "A1c section 3 reuses the earlier verdict",
    old: "const runtimeUnres = res.present ? runtimeUnresolved(res.merged, sections.length) : [];",
    new: "const runtimeUnres = runtimeUnresEarly;",
  },
];

say("===== STAGE A =====");
say(`pipeline : ${PIPE}`);
say(`plugin   : ${PLUGIN}`);
say(`repo     : ${REPO}`);
say("");
say("----- A1: --report wording -----");
const vmSrc = readFileSync(VM, "utf8");
let bad = 0;
for (const p of vmPatches) {
  const hits = vmSrc.split(p.old).length - 1;
  if (hits !== 1) bad++;
  say(`  [${hits === 1 ? "OK  " : "FAIL"}] ${p.name.padEnd(48)} hits=${hits}`);
}
if (bad) {
  say(`${bad} anchor(s) unresolved — nothing written.`);
  writeFileSync(LOG, lines.join("\n") + "\n", "utf8");
  process.exit(1);
}
let vmOut = vmSrc;
for (const p of vmPatches) vmOut = vmOut.replace(p.old, p.new);
say(`  validate-manifest.mjs  ${sha(vmSrc)} -> ${sha(vmOut)}  (${vmSrc.length} -> ${vmOut.length} chars)`);
if (!dry) writeFileSync(VM, vmOut, "utf8");
try {
  execFileSync(process.execPath, ["--check", VM], { stdio: ["ignore", "pipe", "pipe"] });
  say("  [PASS] node --check validate-manifest.mjs");
} catch (e) {
  say("  [FAIL] node --check\n" + String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n"));
  writeFileSync(LOG, lines.join("\n") + "\n", "utf8");
  process.exit(1);
}

// ── A2: lessons ─────────────────────────────────────────────────────────────
const MARKER = "<!-- 2.6.0-lessons -->";
const LESSONS = `
${MARKER}

## 2.6.0 集成期教训

### 1. 模板字符串内正则转义被消费

给浏览器注入的代码写在模板字符串里时，模板字符串会先消费一层转义。
\`split(/\\s+/)\` 中的 \`\\s\` 不是已识别转义，反斜杠被丢弃，页面实际执行
\`split(/s+/)\` —— **按字母 s 切分**。实测：\`"ai-screen a4".split(/s+/)\` →
\`["ai-","creen a4"]\`，与观测到的错误签名逐字吻合。

危害不是外观：被破坏的签名会跨元素碰撞，身份校验会在本应 FAIL 时通过。

正确写法：不用转义（\`split(' ').filter(Boolean)\`，HTML class 属性以空格分隔），
或双转义 \`split(/\\\\s+/)\`。**不要**直接写 \`\\t\`/\`\\n\`/\`\\r\`：它们在模板字符串里
会变成真实控制字符，而正则字面量含真实换行是语法错误。

任何经模板字符串注入页面的代码，都必须导出实际注入内容核对一次，不能靠读源码判断。

### 2. 锚点替换必须自校验（node --check）

用锚点替换改代码时，**计数括号是不可靠的**。本项目中一次替换吞掉了闭合
\`for\` 循环的花括号，导致后续所有 \`export\` 变成块内语句，整条管线
\`SyntaxError: Unexpected token 'export'\` 而不可运行——而补丁脚本当时报告"成功"。

规则：补丁脚本在写完每个被改文件后必须执行 \`node --check\`，
不通过即失败退出。锚点数量校验（hits==1）只能证明"改到了地方"，
不能证明"改完还能解析"。

### 3. every() 在单元素数组上恒真

校验"声明覆盖了全部页"时写了 \`slides.every(...)\`。当声明只含 1 个条目时，
\`every()\` 恒真——"只声明了 11 页中的第 7 页"被判为"全页已声明"，
校验器于是对一份渲染器会拒收的声明报"合法"。

这正是当时正在修的那类分叉，被原样复制了一遍。

规则：**"全部页"的校验必须显式接收 pageCount**，用
\`targets.size >= pageCount\` 判定，不能依赖对声明数组的 \`every()\`。
凡是以 \`every()\` 表达"覆盖全部"的地方，都要先问：这个数组的长度由谁决定？

### 4. 块级导入作用域

\`patchMerge\` 在 G2 的用例循环体内以 \`const { patchMerge } = await import(...)\`
引入，作用域限于循环体。在循环外新增的代码块引用它即
\`ReferenceError: patchMerge is not defined\`。
新增代码块若要用循环内导入的符号，必须自行导入。

### 5. 校验器与渲染器必须共用同一个判定函数

一整串缺陷的起点是：校验器说"合法"，渲染器却拒收。成因是覆盖判定
（\`covers\` 表）只存在于 \`patchMerge\` 里，而 \`loadAndPlan\` 从不产出
\`E_AMBIGUOUS_UNDECLARED\`，于是校验器打印
"a manifest for this deck would need only version + capturePad" ——
而该稿第 7 页真实存在成员嵌套。

规则：**同一份判定只能有一个实现**。把 \`covers\` 抽为 \`manifest.mjs\` 的导出
\`coversStatic\`，让 \`loadAndPlan\` 与 \`patchMerge\` 都调用它；并新增 G2 case G
断言"校验器拒绝 且 渲染器拒绝"两者一致。

推论：无法在纸面判定的维度（运行期 A_MEMBERS）不得默认放行。
默认模式保守非零退出，\`--report\` 保持顾问行为且不计入退出码。
`;

const DOC = "docs/经验教训-动画与转换.md";
const targets = [];
for (const [label, root] of [["plugin", PLUGIN], ["repo", REPO]]) {
  for (const rel of [DOC, "scripts/deck/" + DOC]) {
    const p = join(root, rel);
    if (existsSync(p)) { targets.push({ label, path: p }); break; }
  }
}
say("");
say("----- A2: lessons documentation -----");
if (!targets.length) {
  say(`  [MISS] no ${DOC} found under plugin or repo — nothing appended`);
} else {
  for (const t of targets) {
    const before = readFileSync(t.path, "utf8");
    if (before.includes(MARKER)) {
      say(`  [SKIP] ${t.label}: already contains the 2.6.0 section (${t.path})`);
      continue;
    }
    const after = before.replace(/\s*$/, "\n") + LESSONS;
    say(`  [OK  ] ${t.label}  ${sha(before)} -> ${sha(after)}  (${before.length} -> ${after.length} chars)`);
    say(`         ${t.path}`);
    if (!dry) writeFileSync(t.path, after, "utf8");
  }
}

// seam check: the docs must be byte-identical across plugin and repo
if (targets.length === 2 && !dry) {
  const [a, b] = targets.map((t) => sha(readFileSync(t.path, "utf8")));
  say(`  plugin/repo doc hashes equal: ${a === b}  (${a} vs ${b})`);
}

say("");
say(`log -> ${LOG}`);
if (!dry) writeFileSync(LOG, lines.join("\n") + "\n", "utf8");
say(dry ? "--dry: nothing written." : "Stage A done.");
