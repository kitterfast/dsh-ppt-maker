# scripts/deck — HTML → PPTX 确定性管线

**为什么有这个东西**：2026-09-14 那次跑批里，转换是"agent 现场写一个转换器"。
结果是 **1 小时 44 分、48 个一次性脚本**，交出来的 PPTX：

- **一页动画都没有**（分层 PNG 从来没被放进幻灯片）；后来又因为用
  `/cNvPr id="(\d+)"/g` 的数组下标当形状 id（第 0 个是幻灯片自己的组合形状）**把所有效果错开一位**；
- HTML 的翻页按钮、圆点导航、`‹ 06/20 ›` **被烤进每一页**；
- **文字错版**。

管线把每件事各修在一个地方，并且**用播放器本人来验收**，不再自己写正则验收自己写的 XML。

## 三条命令

```powershell
# ① 渲染：一次无头浏览器、一遍过、按页哈希增量
#    先探针一页（10 秒）确认契约没写错：
node scripts\deck\deck-render.mjs build\deck.config.json --only=6
node scripts\deck\deck-render.mjs build\deck.config.json

# ② 生成 PPTX：图层按名字定位形状 id + 原生时间轴 + 常驻动效转循环 GIF
node scripts\deck\deck-to-pptx.mjs build\deck.config.json

# ③ 验收：结构 / 入场写法 / PowerPoint 真机 / 逐页像素（不过就退出码 1）
node scripts\deck\deck-verify.mjs build\deck.config.json
```

20 页实测：渲染 **~80 秒**（含 GIF 录制）、生成 **3 秒**、验收 **~12 秒**。

依赖：`pptxgenjs`、`jszip`、`pngjs`、`gifenc`（装在被转换的**项目根目录**，不是插件目录）。
Node ≥ 22（用自带的全局 `WebSocket` 直连 CDP，零第三方 CDP 依赖）。

## 契约（`deck.config.json`）

从 `deck.config.example.json` 复制一份：

| 字段 | 含义 |
|---|---|
| `html` / `out` / `pptx` | 唯一权威 HTML / 渲染中间件目录 / 输出文件 |
| `chrome` | **只在浏览器里才有意义**的壳：翻页按钮、进度条、页码、提示条。**列不全就会被烤进 PPT** |
| `slide` / `page` | 单页容器 / 版心 |
| `groups.selector` | 逐元素入场的**那一层**；每个匹配项 = 一个动画图层 |
| `groups.delays` | 每个图层的入场延迟（ms，**绝对时间**，照抄 CSS 的 `animation-delay`） |
| `goto` | 可编程翻页入口，签名必须是 `(n, skipAnim)` |
| `gif` | 常驻动效录制参数（默认 24 帧 × 70ms，预热 1500ms）。设 `false` 关闭 |

## 两类动画，两条完全不同的路

| | 入场动画 | 常驻动效（`infinite` / canvas） |
|---|---|---|
| 实现 | PowerPoint **原生时间轴** | **循环 GIF**，当图片插入 |
| 为什么 | 可编辑、清晰、放映是真动画 | 时间轴**表达不了无限循环** |
| 验收 | A2 闸门：与"已证实会播"的写法逐字符比对 | 录制时逐帧比对，**没动就自动降级为静帧** |

GIF 那条路天然免疫"写了不播"：它是图片，PowerPoint/WPS 放映时自动播放并循环，
**不需要任何时间轴 XML**。参考稿《为什么选我做学委_动态版.pptx》正是这么做的（2 张 GIF）。

## 产物

```
build/render/
  manifest.json          每页 base / ref / 图层几何 / 延迟 / 文本 / gif
  p01/ref.png            整页参考渲染（验收比对基准）
  p01/base.png           抽掉所有动画元素后的底图
  p01/g0.png …           真 alpha 静态图层
  p01/g0.gif …           常驻动效的循环 GIF
  _powerpoint/           PowerPoint 逐页导出的 PNG
  _com-report.json       PowerPoint 读到的真实时间轴
  _pixel-report.json     逐页像素比对结果
```

## 已修掉的坑（都在代码里，不用记）

| 症状 | 原因 | 修在哪 |
|---|---|---|
| **动画被列出但永远不播** | 入场写成了"淡入预置 + 手写位移"这种 PowerPoint 不执行的组合；外层组 par 又用了 `delay="indefinite"`+`onBegin` | 照抄**已证实会播**的写法：外层 `delay="0"`；效果 = `presetID=10` + `set` + `animEffect(fade)` + 相对 `ppt_y` + `animRot` |
| 整页底图被当成"要淡入的文字"、放映先空白 | 用 `/cNvPr id="(\d+)"/g` 的数组下标当形状 id | 按**名字**解析 |
| 元素飞到页面顶部 | 位移写成绝对 `<p:fltVal>` | 只写相对量 `#ppt_y-0.019444`，末帧**精确**收在 `#ppt_y` |
| 看不出缓动 | `<p:tav tm>` 写成毫秒 | `tm` 是**时长的千分比**（0–100000） |
| 图层互相遮挡 | 页面纸色 `background` 跟着进图层 | `__deck_isolate` 清空祖先背景 + CDP 背景 alpha=0 |
| 截到的元素"位置不对" | 用 `display:none` 隐藏兄弟节点 —— flexbox 会把要截的元素挪走 | 一律 `visibility:hidden` |
| 参考图与图层对不上 | 第一张截图截早了 | `waitStable()`：连续两张全页截图字节相同才开工 |
| 卡片上下沿整条差异 | 裁剪矩形只取边框盒，box-shadow 被切掉 | `inkBox()` 按计算样式的阴影膨胀 |
| 翻页按钮进了幻灯片 | 整页截图没隐藏浏览器 UI | `chrome` 每次截图前 `display:none` |
| **录出来的 GIF 一动不动** | `go(n)` 对"当前已在的那一页"是**空操作**，`.anim` 没被重新加上、CSS 循环没启动 | 录制前先跳到别的页再回来 |
| 一次 8 分钟 | 每轮全量重渲染 | 单实例无头浏览器 + 每页哈希缓存（`RENDERER_VERSION` 参与哈希） |
| 浏览器被几十个标签页堵死 | 复用**非无头**的登录浏览器 | 一次性 `--headless=new` 临时实例 |

## 怎么判断"到底动没动"（**别再用 XML 自证**）

```powershell
powershell -File scripts\deck\tools\show-start-frames.ps1 -Pptx build\deck.pptx -OutDir frames -Frames 24
node scripts\deck\tools\framediff.mjs frames
```

两个必须记住的坑，否则这个工具会骗你：

1. **COM 创建的 PowerPoint 默认不可见** —— 所谓"正在放映"根本没渲染到屏幕上，抓到的全是桌面。
   必须先 `$app.Visible = -1`。
2. **`GotoSlide(页, ResetSlide)` 不会重放该页的入场动画** —— 用它跳页再抓帧，
   任何文件都会被判成"没动画"。**必须从放映一开始就抓帧、不做任何跳页。**

## tools/

| 脚本 | 用途 |
|---|---|
| `show-start-frames.ps1` | **播放验收**：启动放映、不跳页、连续抓帧 |
| `calibrate.ps1` / `calibrate-fly.ps1` | 让 PowerPoint 自己生成一段入场动画，读回它的 `p:timing` 当基准 |
| `make-reference.mjs` | 从**已证实会播**的稿子生成 `lib/reference-entrance.xml` |
| `dump-timing.mjs` | 缩进打印某个 pptx 的 `p:timing` |
| `composite-check.mjs` | 在 Node 里重算 base+图层，分清"是我截错了"还是"播放器渲染错了" |
| `diffviz.mjs` | 两图做差：最优对齐 + 坏像素行列分布 + 放大差图 |
| `slow-anim.ps1` | 把效果统一拉长到 N 秒，便于观察 |
| `probe-fidelity.mjs` | 逐环节保真探针：隔离 / alpha / clip / 端到端 |

> **不要用"重新打包 pptx 再对比"来定位问题**：JSZip 与 .NET 重新打包都会让参考稿的动画失效，
> 基于它得出的结论全部无效（这条弯路走过很久）。

## 已知限制

- **文字不可在 PPT 里直接改**（版式整体栅格化是"与 HTML 一致"的唯一做法）。
  文字已写进**备注页**与**图片替换文字**，可检索、可复制。
- GIF 只有 256 色。本片是平色设计影响很小；要无损就换 MP4（同样当媒体插入）。
- 入场曲线/位移由**预置 + 相对关键帧**决定，与 HTML 的 `cubic-bezier` 是近似而非逐帧相同。
- 转场与入场在 PPT 里是"先后"关系；淡入的透明度曲线在 PowerPoint 里是线性的。

## 图层的 capturePad：唯一无法推导、必须声明的常量

`capturePad` 决定每个图层框相对「成员元素并集」各边外扩多少像素。它**不能从 HTML 推导**，也无法用默认值补对 —— 代码默认 `2`，而实测存在两种校准：

| 模式 | `groups.selector` | 实测 `capturePad` | 示例文件 |
|---|---|---|---|
| element | 通配，如 `.body > *` | **2** | `deck.config.example.json` |
| class（`.aN`） | `.a1, .a2, …` | **10** | `deck.config.example-class.json` |

**两者不可互用**：若 class 模式的稿照抄 element 示例的 `capturePad: 2`，每层几何会各边少 8px，产物与基准不一致。

`capturePad: 10` 的实测依据：`为什么选我做学委_动态版.pptx` 每一页的图层框都等于「该层所有成员的 `getBoundingClientRect()` 并集」各边外扩 10px。

## 判据是容差制，不是字节相等

`verify.maxMeanDiff`（默认 6）与 `verify.maxBadPixelRatio`（默认 0.02，bad 定义为单像素 `max(|dR|,|dG|,|dB|) > 32`），算法同 `deck-verify.mjs`。

**不要用字节或像素相等来判定一致性**：浏览器渲染天生非确定（抗锯齿、字体 hinting、亚像素舍入），同一份代码连续两次渲染即会产生真实像素差异（实测非 canvas 页 maxDelta 4–10、波动比例 0.0005%–0.3380%）。任何"逐字节一致"的期望都是不可达的。