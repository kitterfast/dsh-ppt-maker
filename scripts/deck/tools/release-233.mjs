// v2.3.3: lenient declared-layer contract + lessons learned converting the AI decks.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const root = join(homedir(), ".dsh", "local-plugins", "dsh-ppt-maker");

// ---- changelog ----
const chf = join(root, "CHANGELOG.md");
let ch = readFileSync(chf, "utf8");
if (!ch.includes("## 2.3.3")) {
  const entry = `## 2.3.3

**"层已显式声明"的宽松契约：非 .aN 命名的稿子也能转，常驻动画改用 GIF 烘焙。**

- 新增 \`--declared\`：当 \`deck.config.json\` 里显式写了 \`groups.selector\` + \`groups.delays\`（层与延迟由人声明，不靠猜）时，
  严格契约里的"多个 @keyframes / 没有 .a1…​.aN 类名 / 有 infinite / 有 <canvas>"降级为 note，不再拒绝转换。
- 能力依据：infinite 与 canvas 现在都有可行机制——**烘焙成循环 GIF**（已证实能播的基准稿本身就有 2 张 GIF；
  本插件的参考稿第 7/10 页画布 GIF、AI 通史 4 处 dashflow GIF 都按整周期录制）。
- 用 \`--declared\` 成功转换了两份真实稿子：
  - **AI 通史**：20 页，4 处 dashflow 按 14000ms 整周期录 200 帧（循环无缝）+ 1 个画布 GIF；
  - **AI 加速之后**：21 页，5 个画布 GIF + 1 个闪烁光标 GIF（16 帧 / 1100ms 周期）。
  - 两份稿子的 \`.body > *\` 子元素即入场层，延迟来自 HTML 的 nth-child 规则，config 里显式列出。
- 不变式仍然强制：没有任何 @keyframes = 直接失败；图层必须全部不透明（WPS 的 alpha 黑块）。

`;
  const i = ch.indexOf("## 2.3.2");
  ch = i === -1 ? ch + "\n" + entry : ch.slice(0, i) + entry + ch.slice(i);
  writeFileSync(chf, ch, "utf8");
  console.log("changelog 2.3.3 written");
} else console.log("changelog already has 2.3.3");

// ---- lessons ----
const doc = join(root, "docs", "经验教训-动画与转换.md");
let text = readFileSync(doc, "utf8");
if (!text.includes("2026-09-15 补丁二")) {
  const section = `

## 八、2026-09-15 补丁二：接手"另一种写法"的稿子（AI 通史 / AI 加速之后）

### 宽松契约（--declared）的适用条件
另一份稿子不写 \`.a1…​.aN\`，而是 \`.body > *\` 的子元素按 \`nth-child\` 错峰入场（\`@keyframes enter\`）。
这类稿子**可以转**，前提是"层与延迟由配置显式声明"：

\`\`\`json
"goto": "function (n, skip) { window.__slideInfo.go(n, skip); }",
"groups": { "selector": ".body > *", "delays": [60,170,280,390,500,610], "moveY": 14 }
\`\`\`

- 触发类不是 \`.active\` 而是 \`.anim\` 时**不影响转换**：渲染器用 \`goto(n, true/false)\` 控制"跳过/播放入场"，
  只要稿子暴露了 \`window.__slideInfo.go(n, skip)\`（或任意 \`function(n, skip)\`）即可。
- 严格契约只保留两条不可放宽的红线：**没有任何 @keyframes** 与 **图层必须不透明**。

### 常驻动效一律烘焙成 GIF，但要"按整周期录"
- \`dashflow 14s linear infinite\` 这类循环必须录满一个周期，否则循环接缝肉眼可见。
  把 \`gif.maxPeriodMs\` 提到 15000，工具会录 200 帧（帧数 = 周期 / intervalMs），一次循环无缝。
- 只烘焙**真正在动的最小元素**（例：SVG 里那几条 \`<path>\`，不是整个图形层），
  这样图形里的文字仍留在无损 PNG 图层里，不会被 256 色 GIF 糊掉——这是"清晰 + 动态"能同时成立的关键。
- 闪烁光标这类短周期动效按它自己的周期录（实测 1100ms / 16 帧），不要套用长周期。

### 成本认知（交付前先告知用户）
- 画布 GIF 是体积大头：一个 86 帧的大画布 GIF 约 10–25 MB，21 页的稿子成品可到 ~107 MB。
  想要小体积就得减帧或缩小录制区域，代价是循环变短/画面变小——**这是取舍，不是 bug，务必先说明**。
- 20 页稿子单轮渲染约 4 分钟，21 页含 5 个画布 GIF 约 8 分钟；渲染放后台跑，不要在前台干等。

### 不要覆盖用户的成品
给他重做的稿子一律写**新文件名**（\`AI通史·管线版.pptx\`、\`AI加速之后·管线版.pptx\`），
新配置也叫 \`deck.ai-*.json\`——用户原有的 \`deck.config.json\` 与 \`*.pptx\` 一个都不动。
`;
  appendFileSync(doc, section, "utf8");
  console.log("lessons section 八 appended");
} else console.log("lessons already appended");
