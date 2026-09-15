// Insert the 2.3.2 entry into the plugin CHANGELOG (UTF-8, no BOM).
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const f = join(homedir(), ".dsh", "local-plugins", "dsh-ppt-maker", "CHANGELOG.md");
const text = readFileSync(f, "utf8");
if (text.includes("## 2.3.2")) {
  console.log("already present");
  process.exit(0);
}
const entry = `## 2.3.2

**第 7 / 10 页的 THREE 画布真正动起来了，产物结构与"已证实能播"的基准稿逐项对齐。**

- **rAF 饿死修复（关键）**：无头 Chromium 在没有其它排帧需求时会停摆帧调度器，脚本驱动的 canvas 只画一帧就冻结（页面 rAF 计数却仍在涨）。渲染期注入常驻空 rAF 链后恢复；用 A/B 探针（ticker ON/OFF）验证过。
- **嵌套 \`.aN\` 包画布 → 整组 GIF**：第 7 页 \`.a4 > #threeAI.a4 > canvas\` 现在产出 \`base + a1 + a2 + a3 + GIF(整块 ai-screen) + a5\`，入场 40/150/260/370/480，图片数、媒体槽位、延迟与基准稿一致；祖先空层自动丢弃，不再重复画标题。
- **\`visibility\` 继承坑**：恢复嵌套宿主可见必须写 \`'visible'\`，写 \`''\` 只会继承父层的 \`hidden\`。
- **入场延迟按 class 查表**：两个 \`.a4\` 的页面原来按组序号查表会整体错位一格，现在渲染器与构建器都按元素真实 class 取延迟（旧 manifest 自动回落）。
- **空层判定加阈值**：纸张噪点罩层（alpha 6–14）让"alpha>0"永远判不空，阈值改为 alpha ≥ 40。
- 位图扫描改为按组（消除幽灵 bit）、GIF 目标去重、GIF 录制前等待入场播完（避免把 rise 烤进循环）、\`layerPaths\` 改按 k 键对象（丢层不再串位）。
- 经验教训文档新增"七、2026-09-15 补丁"整节（含排查方法论）。

`;
const marker = "## 2.3.0";
const i = text.indexOf(marker);
const out = i === -1 ? text + "\n" + entry : text.slice(0, i) + entry + text.slice(i);
writeFileSync(f, out, "utf8");
console.log("changelog updated");
