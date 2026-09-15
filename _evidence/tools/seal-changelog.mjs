/**
 * Stage 8: insert the 2.4.0 entry at the top of both CHANGELOGs (before the first
 * "## " heading), UTF-8 WITHOUT BOM, then re-read to prove what was written.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PLUGIN = 'C:/Users/ASUS/.dsh/local-plugins/dsh-ppt-maker/CHANGELOG.md';
const REPO = 'C:/Users/ASUS/Desktop/班委竞选/dsh-fast-ppt/CHANGELOG.md';

const ENTRY = `## 2.4.0 (2026-09-15)

**按基准稿的真实结构重做分层与延迟：图片 79->67、效果 68->56、延迟改绝对值、图层改真透明。**

### 修复
- 入场延迟改为绝对值（原为相邻增量，导致 11 页全部错位）
- 图层按 .aN 类合并（原按元素切，图片 79->67，效果 68->56）
- 图层包围盒改为成员并集 + 每边 capturePad=10px
- canvas GIF 层使用宿主 .aN 元素自身矩形，不加内边距
- 图层输出真透明 PNG（原为底座合成后的不透明块）
- 图层保留无 .aN 类的非动画内容
- 截取原点四舍五入、尺寸向下取整
- 隔离时关闭整页 ::after/::before 纸纹遮罩
- wps-show-frames.ps1 抓帧前把放映窗口置前。原版抓到的是前台障碍窗口（实测 paper 占比
  3.4-3.7%、中心像素 16,22,36），上一轮的错误结论即源于此。WPS 的
  \`SlideShowWindow.HWND\` 返回 0、\`AppActivate\` 报"未找到进程 0"，须按标题前缀
  "WPS Presentation Slide Show" 枚举顶层窗口（class Qt5QWindowIcon）再 \`SetForegroundWindow\`。

### 保留
- 无 .aN 类的稿子自动退回旧"一元素一层"路径

### 验收
- 结构：11 页 pics/eff/delays 逐页一致（共 67 图 / 56 效果）
- 几何：268 个数值平均偏差 0.001px，最大 0.0px
- 像素：整页合成 mean 1.40/255，bad>32 0.67%
- 体积：35,756,638 B -> 15,859,656 B
- WPS 实跑 A/B（与基准稿在同一环境各抓 40 帧）：mean 1.44/255，bad>24 1.26%
- WPS 抓帧工具自检：整帧 mean 1.70（阈值 6）、四边带 0.85-0.95、无标题栏/任务栏

### 更正
- 2.3.3 条目末尾的"图层必须全部不透明（WPS 的 alpha 黑块）"**作废**：实测基准稿自身图层即为
  RGBA 且 70-99% 像素完全透明，该不变式无依据。2.4.0 起图层为真透明。

`;

let failed = false;
for (const file of [PLUGIN, REPO]) {
  const before = readFileSync(file, 'utf8');
  if (before.includes('## 2.4.0 (')) { console.log(`SKIP ${file}: 2.4.0 already present`); continue; }
  const m = /^## /m.exec(before);
  if (!m) { console.error(`FAIL ${file}: no "## " heading found`); failed = true; continue; }
  const after = before.slice(0, m.index) + ENTRY + before.slice(m.index);
  writeFileSync(file, after, 'utf8');
  const raw = readFileSync(file);
  const hasBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  const reread = readFileSync(file, 'utf8');
  const head = reread.split('\n').filter((l) => l.startsWith('## ')).slice(0, 3);
  const ok = reread.includes('## 2.4.0 (2026-09-15)') && !hasBom;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${file}`);
  console.log(`     bytes ${before.length} -> ${raw.length}  BOM=${hasBom}`);
  console.log(`     first headings: ${head.join(' | ')}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
