// Append the 2026-09-15 lessons to the plugin's lessons doc (UTF-8, no BOM).
import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const doc = join(homedir(), ".dsh", "local-plugins", "dsh-ppt-maker", "docs", "经验教训-动画与转换.md");

const section = `

## 七、2026-09-15 补丁：THREE 画布终于动了（第 7 / 10 页）

### 根因一：无头 Chromium 的 rAF 会饿死（不是 WebGL、不是资源）
- 现象：\`#threeAI\` 画布只画了第一帧，之后 24 帧截图逐字节相同 →"no motion"→ 丢掉整层，第 7 页星空整块消失。
- 实测（probe4）：**注入一条常驻空 rAF 链后画布立刻恢复运动**；不注入则冻结，即便页面里 rAF 回调计数器仍在涨（~145 次/秒）。
- 结论：无头模式下帧调度器会在没有其它排帧需求时停摆，脚本驱动的 canvas 渲染循环随之停摆。截图循环本身不足以持续驱动它。
- 修法：\`setup()\` 之后注入一次
  \`window.__tickerOn = true; (function __t(){ if (window.__tickerOn) requestAnimationFrame(__t); })();\`
  常驻整场渲染。它对静态页无副作用（只影响"什么时候出帧"，不影响像素内容）。

### 根因二：\`visibility\` 是继承属性——\`style.visibility = ''\` 不等于"可见"
- 现象：底座里把嵌套画布宿主"恢复可见"后，\`getComputedStyle\` 仍然是 \`hidden\`，底座里星空依旧没有。
- 原因：父层（外层 \`.a4\`）被隐藏后，子元素清空内联值只会**继承**父层的 \`hidden\`。必须显式写 \`style.visibility = 'visible'\` 才能覆盖。
- 修法：\`own.style.visibility = 'visible'\`（不是 \`''\`）。

### 结构：嵌套 \`.aN\` 包住画布时，必须按"整组 GIF + 丢弃被覆盖的祖先层"来做
- \`ref.html\` 第 7 页是 \`.a4 > .ai-screen.a4#threeAI > canvas\`——同一个画布落在**两个** \`.aN\` 层里。
- 正确产物（与已证实能播的基准稿逐项对齐）：
  \`base（含冻结的星空 + 标题）+ a1 + a2 + a3 + GIF（整块 ai-screen，含标题）+ a5\`，
  入场 40 / 150 / 260 / 370（GIF）/ 480 —— 基准稿图片顺序、\`image-7-5.gif\` 槽位、各延迟全部一致。
- 做法：
  1. **位图扫描按组进行**（\`animatedBits(g)\`），不要用"全页 bits 再 filter by contains"——后者会让嵌套画布在每个祖先组里各出现一次（幽灵 bit，长度对不上）。
  2. **画布 GIF 的隔离对象改成宿主 \`.aN\` 层**（\`canvasOwner\`），标题/底色随 GIF 一起走，避免图层与 GIF 各画一遍。
  3. **图层捕获时隐藏宿主**（\`hiddenBits\`）并**连带隐藏该组的后代 \`.aN\` 组**（\`nestedOwners\`）：祖先层因此全透明 → 丢层，延迟槽自然落回 GIF 与 \`.a5\`。
  4. 底座捕获**反过来**把嵌套宿主显式设为 visible，让冻结星空留在底座（基准稿底座里同样有 4318 个橙色像素）。
  5. GIF 目标按 (tag, box) **去重**：同一画布只出一张 GIF，否则叠画两次。

### 根因三：\`.slide::after\` 的纸张噪点让"空层"永远不空
- \`body{background:#b9ac8d}\` + 噪点罩层（opacity 0.055）会给整页铺上 alpha ≈ 6–14 的灰纱。
- 于是"alpha > 0 就算有内容"的判空永远失败，该丢的层丢不掉。
- 修法：判空阈值提到 **alpha ≥ 40**（噪点 <=14，真实笔画为 255）。

### 根因四：入场延迟不能用组序号查表
- 第 7 页有两个 \`.a4\` 组，按 \`k\` 索引查 \`entranceRules[k]\` 会把第二个 \`.a4\` 读成 \`.a5\` 的延迟，后面每一层都错位一格（\`.a5\` 变成 590）。
- 修法：渲染器读 \`anim-spec.json\`，按元素**真实 class**（\`\\ba\\d+\\b\`）取延迟并写进 manifest 的 \`delayMs\`/\`cls\`；构建器同样**按 class 查表**，不再按 \`k\`。旧 manifest 没有 \`cls\` 时自动回落到 \`delayMs\`，向后兼容。

### 其它两个小坑
- **GIF 必须等入场播完再录**（\`leadMs = max(delayMs) + duration + 100\`）：否则 rise+fade 被烤进 GIF，循环一次就重播一次，和原生入场叠加成二次入场。
- **\`layerPaths\` 不能用稀疏数组**：丢层后 \`layerPaths[k]\` 会串位（k=3 读到 g5），必须用按 \`k\` 键的对象。

### 排查这类问题的方法论（下次直接照做）
用**一次性探针脚本**逐步复刻管线条件并逐步 dump 状态，而不是读代码猜：
- probe1 干净导航对照 → 证明画布本身会动；
- probe2 逐字节复刻 GIF 阶段 + 每步 dump（counter / activeSlides / canvas 尺寸 / \`.a4\` opacity / animationName）→ 定位到"入场在动、画布不动"；
- probe4 注入 ticker 做 A/B → 锁定 rAF 饿死；
- probe7/probe8 复刻单层捕获 + 可见性 dump → 锁定 \`visibility\` 继承与噪点阈值。

**验收口径不变：以 WPS 播放为准；"能读到 ≠ 会播"；组件差异（图片数、媒体槽位、延迟表）必须与已证实能播的稿子逐项对齐后才算通过。**
`;

const before = readFileSync(doc, "utf8");
if (before.includes("2026-09-15 补丁")) {
  console.log("already appended");
} else {
  appendFileSync(doc, section, "utf8");
  console.log(`appended ${section.length} chars -> ${doc}`);
}
