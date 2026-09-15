## 2.6.1 (2026-09-15)

### 新增
- WPS 真实放映验证：学委稿产物在 WPS 中播放，
  帧差在容差内，入场/退场/canvas 动画逐项确认

### 修复
- 同步 scripts/cdp/authorize.mjs 修复（安装侧 -> 源侧）：
  截图前先 Page.bringToFront，避免后台标签页不产生合成帧导致 30s 超时

### 文档
- 追加两条工具层教训：
  日志写入禁止覆盖既有文件
  文本检查器必须区分引用与结论

### 未验证
- 渲染字节级可复现（不可达，F 项已登记）

## 2.6.0 (2026-09-15)

### 新增
- 声明路径激活：manifest 声明层接入 deck-render.mjs
- F4：按 members 选择器定位层，与反解层合并
- F1：声明侧 page 为正名，index 为 1-based 同义别名
- F2：删除 motion 覆盖 A_MEMBERS 的豁免
- F3：members 由“比数量”改“比身份”，真子集 FAIL
- F5：层框不可解析即 E_LAYER_BOX_UNRESOLVED
- D7：无声明页走反解分支，不再崩溃
- 校验器与渲染器共用 coversStatic，分叉闭合
- validate-manifest 默认硬失败，--report 保持顾问行为

### 修复
- G2 用例集更新（C 回归本义，F 独立承担歧义拒绝）
- G2 新增 case G：校验器与渲染器判定一致

### 验证
- G5 八区域零差异（F4 后、F4d 后各一次）
- G2 七例 7/7 PASS
- U4-a/b/c'/d 4/4 PASS
- T2 通过（声明 vs 反解，非自比）
- G3 全稿容差判据通过（11 页全在容差内）
- element 冒烟通过（AI 通史 p1）
- example.json 实跑 exit 0

### F 项（新登记）
- 渲染像素级非确定性：所有 PNG 含非 canvas 页。
  同码双跑 maxDelta 4–10，比例 0.0005%–0.3380%。
  集成前既存，非本次引入。判据改为容差制。

### 证据强度降级披露
- U1/U2/U3 此前“逐字节一致”为单样本对比。
  因渲染像素级非确定性，证据强度降级为
  “单样本一致，不足以排除抖动”。
  本次起判据改为容差制（verify.maxMeanDiff=6、maxBadPixelRatio=0.02）。

# Changelog

版本号写在 `package.json` 与 `lib/client.js` 的 `PLUGIN_VERSION` 两处，校验器会断言两者一致。

## 2.5.0 (2026-09-15)

### 新增（独立模块，未激活）
- lib/manifest.mjs：声明层核心模块
- deck.manifest.schema.json：schema（已冻结）
- deck.manifest.example.json：样例
- tools/validate-manifest.mjs：校验器 + 歧义报告器
- tools/g2-test.mjs：G2 负例套件（6/6 PASS）

### 说明
- 本版本为独立模块交付，声明路径未接入 deck-render.mjs。
- 无声明路径行为与 2.4.0 逐字节相同。
- 渲染核心 8 项指纹改前/改后全等（G5 PASS）。
- 声明路径激活留待 2.6.0。

### 验证
- G2 负例 6/6 PASS
- G5 指纹 8 项全等
- 4 项验证工具自测通过（gate-a/b/d-proxy/e）

### 未验证
- 声明路径完全未激活，无运行时验证。

## 2.4.0 (2026-09-15)

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
  `SlideShowWindow.HWND` 返回 0、`AppActivate` 报"未找到进程 0"，须按标题前缀
  "WPS Presentation Slide Show" 枚举顶层窗口（class Qt5QWindowIcon）再 `SetForegroundWindow`。

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

## 2.3.3

**"层已显式声明"的宽松契约：非 .aN 命名的稿子也能转，常驻动画改用 GIF 烘焙。**

- 新增 `--declared`：当 `deck.config.json` 里显式写了 `groups.selector` + `groups.delays`（层与延迟由人声明，不靠猜）时，
  严格契约里的"多个 @keyframes / 没有 .a1…​.aN 类名 / 有 infinite / 有 <canvas>"降级为 note，不再拒绝转换。
- 能力依据：infinite 与 canvas 现在都有可行机制——**烘焙成循环 GIF**（已证实能播的基准稿本身就有 2 张 GIF；
  本插件的参考稿第 7/10 页画布 GIF、AI 通史 4 处 dashflow GIF 都按整周期录制）。
- 用 `--declared` 成功转换了两份真实稿子：
  - **AI 通史**：20 页，4 处 dashflow 按 14000ms 整周期录 200 帧（循环无缝）+ 1 个画布 GIF；
  - **AI 加速之后**：21 页，5 个画布 GIF + 1 个闪烁光标 GIF（16 帧 / 1100ms 周期）。
  - 两份稿子的 `.body > *` 子元素即入场层，延迟来自 HTML 的 nth-child 规则，config 里显式列出。
- 不变式仍然强制：没有任何 @keyframes = 直接失败；图层必须全部不透明（WPS 的 alpha 黑块）。

## 2.3.2

**第 7 / 10 页的 THREE 画布真正动起来了，产物结构与"已证实能播"的基准稿逐项对齐。**

- **rAF 饿死修复（关键）**：无头 Chromium 在没有其它排帧需求时会停摆帧调度器，脚本驱动的 canvas 只画一帧就冻结（页面 rAF 计数却仍在涨）。渲染期注入常驻空 rAF 链后恢复；用 A/B 探针（ticker ON/OFF）验证过。
- **嵌套 `.aN` 包画布 → 整组 GIF**：第 7 页 `.a4 > #threeAI.a4 > canvas` 现在产出 `base + a1 + a2 + a3 + GIF(整块 ai-screen) + a5`，入场 40/150/260/370/480，图片数、媒体槽位、延迟与基准稿一致；祖先空层自动丢弃，不再重复画标题。
- **`visibility` 继承坑**：恢复嵌套宿主可见必须写 `'visible'`，写 `''` 只会继承父层的 `hidden`。
- **入场延迟按 class 查表**：两个 `.a4` 的页面原来按组序号查表会整体错位一格，现在渲染器与构建器都按元素真实 class 取延迟（旧 manifest 自动回落）。
- **空层判定加阈值**：纸张噪点罩层（alpha 6–14）让"alpha>0"永远判不空，阈值改为 alpha ≥ 40。
- 位图扫描改为按组（消除幽灵 bit）、GIF 目标去重、GIF 录制前等待入场播完（避免把 rise 烤进循环）、`layerPaths` 改按 k 键对象（丢层不再串位）。
- 经验教训文档新增"七、2026-09-15 补丁"整节（含排查方法论）。

## 2.3.0

**把多轮真实跑批的全部经验固化为文档与代码；转换结构对齐"已证实能播"的基准稿。**

- 新增 `docs/经验教训-动画与转换.md`：HTML 契约、转换结构、GIF 烘焙 8 条规则、
  验收体系（含"能读到 ≠ 会播"与"WPS 是验收播放器"两条铁律）、10 条反模式、已知边界。
- **图层全部不透明**：按堆叠顺序合成到底图（WPS 渲染 alpha PNG 出黑块/黑角 —— "只黑""缺角"的根因）。
- **ECharts 图表不再是 GIF**：基准稿解剖证明图表是普通层+错峰入场；只有 THREE 画布烘 GIF。
- THREE 渲染修复：无头浏览器用 `--use-angle=swiftshader`，**不用 `--disable-gpu`**（会杀死 THREE）。
- 修复：no-motion 分支遗漏 `restore()` 把隔离状态带入下一页导致崩溃；PNG 导入与底图路径引用。
- `extract-anim-spec.mjs` 增加 `--check`（契约闸门，渲染前执行）与 `--out=`（UTF-8 无 BOM）。
- 新增 `tools/calibrate-video.ps1`（PowerPoint 自动播放视频的 XML 基准）与 `tools/gifinfo.mjs`。

## 2.2.0

## 2.2.0

**"清晰"和"动态"同时保住** —— 动效子元素单独烘焙成小 GIF，文字永远留在无损 PNG 里。

- **子元素级烘焙（核心）**：以前整层烘 GIF，层里只要有文字，文字就跟着掉到 256 色 —— 用户反馈的"画质过糊"。
  现在只把层内**自身在无限循环的元素**（`.schem` 虚线）和 `<canvas>`（波形）切出来单独烘焙：
  - 拍 PNG 层前先把这些子元素藏起来（否则静态副本会和 GIF 重影）；
  - 子元素带真 alpha 单独录制 → 小 GIF；
  - 生成器把它们按**与父层相同的入场时序**贴上去，一起进场。
  实测 PPT 里形状为 `g0`(PNG,含文字) + `g0b0`(GIF,动效)，文本清晰度不再受影响。
- **修"动画过快"**：录制循环是 `截图(约90ms) + 固定等70ms`，真实帧距约 160ms，而 GIF 声明 70ms
  → 回放快约 2.3 倍。改为**按实测帧间隔**写每帧延时，只补足差额。
- **修"莫名闪烁"**：常驻动效只录 1.7 秒就循环，而虚线流动周期是 **14 秒** → 每 1.7 秒硬跳一次。
  改为**按动画真实周期录满一个循环**（`gif.maxPeriodMs`，默认 15 秒），循环无缝。
- **修"缓存吞掉新逻辑"**：子元素信息没有参与缓存哈希，导致算出 bits 之后那一页仍被判为"未变化"而跳过，
  GIF 代码根本不执行（表现为"独立探针能找到、生成器里找不到"）。bits 现已计入缓存键。
- **新增 WPS 播放验收** `tools/wps-show-frames.ps1`：用户的播放器是 WPS，而此前所有验收都走
  PowerPoint COM —— 验收目标本身错了。用 `KWPP.Application` 打开/放映/连续抓帧（不跳页）。
- **新增** `tools/gifinfo.mjs`：解析 GIF 帧数/循环次数/每帧延时，判断烘焙结果是否真在动。
- **移除** `animRot`：那份参考稿的入场效果带 1° 旋转，但 HTML 里没有 → 图表会莫名摆动。
  A2 闸门同时改为**子集检查**（预设必须一致，且禁止使用参考写法里不存在的效果），
  防止再"照抄别人多出来的特效"。

## 2.1.0

## 2.1.0

**修掉"动画被列出但永远不播"，并让常驻动效真正保留下来。** 依据是一份**用户提供的、确认能播的**动态 PPTX
（WPS 放映可见）——把它当基准逐项对照，才把两次翻车的根因、以及**验收为什么两次都在骗人**查清。

- **入场写法改为照抄"已证实会播"的形式**：外层组 par 用 `<p:cond delay="0"/>`；
  效果 = `presetID=10`(淡入) + `<p:set style.visibility>` + `<p:animEffect transition="in" filter="fade">`
  + **相对量** `ppt_y`（`#ppt_y-<n>` → 末帧精确 `#ppt_y`）+ `<p:animRot>`。
  之前一版写成 `presetID=2`(飞入) ＋ `ppt_x` 恒等动画 ＋ 没有 `animEffect` —— PowerPoint 会把它列进
  MainSequence，**自检全绿，但放映完全不动**。
- **新增 A2 结构闸门**：每页入场 XML 归一化后与 `lib/reference-entrance.xml`
  **逐字符比对**（基准由 `tools/make-reference.mjs` 从能播的稿子生成）。这条闸门当场抓出了差异。
- **常驻动效自动转循环 GIF**（方案 C 完成）：CSS `infinite`（`getAnimations({subtree:true})`）与
  `<canvas>` 自动识别 → 带入场重新进入该页 → 逐帧录制（隔离 + 真 alpha）→ `gifenc` 编码
  （整段共用调色板避免闪色、第 255 号索引留透明、`repeat=0` 无限循环）→ **当图片插入**，
  放映自动播放并循环，**不依赖任何时间轴 XML**。录完逐帧比对，**没动就自动降级为静帧**。
- **新增播放验收工具** `tools/show-start-frames.ps1` + `tools/framediff.mjs`：
  启动放映、**不跳页**、连续抓帧、逐帧比像素 —— 唯一能回答"到底动没动"的检查。
  两个坑写进代码与文档：**COM 创建的 PowerPoint 默认不可见**（须 `$app.Visible = -1`）、
  **`GotoSlide` 不会重放入场动画**。
- 提示词文档同步：C7-1 增加第 ④ 步播放验收；C7-3/C7-4 改为"入场走时间轴 + 常驻动效走 GIF"；
  D3 新增 18/19（"会不会播只能用放映验收""不要用重新打包打补丁或做对比实验"）；
  D4 新增 6 条实测坑；`scripts/deck/README.md` 重写。

## 2.0.0

针对 2026-09-14 那次真实跑批的四个故障（**用 1 小时做 HTML / 浏览器被几十个标签页堵死 /
48 个一次性脚本的重复劳动 / 转出来的 PPT 没动画、翻页按钮被烤进版式、文字错版**）做的结构性修复。
**核心变化：HTML→PPTX 从"每次让 agent 现场写一个转换器"改成插件自带的确定性管线。**

- **新增 `scripts/deck/`（确定性管线，零第三方依赖，只要求项目里有 `pptxgenjs`/`jszip`/`pngjs`）**：
  - `deck-render.mjs` —— 一次无头浏览器、一遍过、**按页哈希增量**；每次截图前隐藏 `chrome` 选择器
    （翻页按钮/进度条/页码不再被烤进幻灯片）；每个动画组**隔离渲染 + 真实 alpha** 裁剪图层
    （不再产出整页不透明图互相遮挡）；顺带检测**无限循环 CSS 动效**并显式警告。
  - `deck-to-pptx.mjs` —— 每个图层按**名字**解析形状 id（修掉 `/cNvPr id/` 数组下标把效果整体错开一位、
    导致整页底图被当成"要淡入的文字"从而放映时先空白的问题）；写入 **PowerPoint 原生时间轴**
    （`set style.visibility` + `animEffect in/fade` + 相对量 `ppt_y` 位移）；`p:tav@tm` 用**千分比**而不是毫秒；
    文字进**备注页 + 图片替换文字**。版式整体栅格化 ⇒ 与 HTML 逐像素一致，**不做跨引擎坐标搬运**。
  - `deck-verify.mjs` + `lib/verify-pptx.ps1` —— **三道闸门**：XML 结构、**PowerPoint COM 真机**
    （效果数 / `Effect.Shape.Name` / 触发方式 / 时长）、**逐页导出 PNG 与浏览器参考渲染做像素比对**。
    上一轮"自检全 PASS 但文件不可用"就是因为只做了第一道。
- **提示词文档重写关键节**：§0.5 交付纪律（唯一权威 HTML + 原地改 + 中间产物不 `present`、
  **禁止在用户浏览器里打开任何文件**）、C3（先探针后全量、验收只用自带渲染器）、
  **C7 整节重写**（三条命令 + 取舍说明 + 已知限制）、D3 新增 5 条硬规则（12–16）、
  D4 新增 8 条实测坑、D5 增加"PPTX 验收证据"必填项、A0 增加"受限沙箱下无头浏览器根本起不来"。
- `README.md` 同步说明管线与取舍。

## 1.4.2

- **修掉一个会让新装用户第一次就失败的路径 bug**：kickoff 第 2 步（环境自检）原来把脚本路径写死成
  `%USERPROFILE%\.dsh\local-plugins\dsh-ppt-maker\scripts\check-env.ps1` —— 那只对 `link:` 安装成立；
  用 `dsh plugin --profile web add github:kitterfast/dsh-ppt-maker`（pnpm）安装时插件落在
  `%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-ppt-maker`，那条命令会指向不存在的路径。
- 现在 kickoff 与提示词 A1.5 都改成**按顺序取第一份存在的插件目录**（① `local-plugins` ② `profiles\web\node_modules`），
  并写明"两份都不存在 → 安装不完整，停下报告，不要自己下载脚本凑"。
  **不需要用户读任何教程**：只装插件也能跑通。
- 与提示词里对**提示词文件**的双候选（`PROMPT_CANDIDATES`）对齐 —— 之前只有脚本是单路径，属自身不一致。

## 1.4.1

- **环境自检写进 kickoff，成为 agent 的硬性第 2 步**（选「A. 使用 AI 生图」时）：
  不再只是"文档里写了、agent 读了才会做"，而是**由插件投送的第一条消息直接下令**执行 `scripts\check-env.ps1`，
  并写明"缺什么自己装、只有标 `[HUMAN]` 时才来找我"。**用户不需要再额外说任何一句话、敲任何一条命令。**
  （选「B」时这条不注入 —— B 明确禁止碰 arkcli / 浏览器。）
- **浏览器改为按需启动**：`check-env.ps1` 不再一律拉起浏览器；只有"确实需要登录"时才启动。
  已登录的机器上跑自检**一个窗口都不会弹**（第 4 项现在只报告，不启动）。
- 安装通告去掉了那条多余的"手动兜底"说明；README 与 Release 说明恢复为两行。

## 1.4.0

- **登录改为 0 手动（本机实测）**：新增 `scripts/volc-0manual-login.ps1`，自己完成
  `arkcli auth login volc-sso --no-browser` → 在专属自动化浏览器里点【继续登录】/【授权成功】→ 取回 base64 授权码 → `--code` 交换令牌。
  实测从 `logged_in:false` 到 `true` 约 **40 秒、零人工输入**；唯一一次性成本是**首次**在专属浏览器里登录火山（手机验证码或扫码）。
- **新增环境自检 + 自动安装**（流程第一步，提示词 A1.5）：`scripts/check-env.ps1` 逐项检查并按需自动补
  Node ≥ 22、`arkcli`（缺则 `npm i -g @volcengine/ark-cli@latest`）、`dsh-chrome-cdp` 插件（缺则 `dsh plugin --profile web add github:xiaobai2017666/dsh-chrome-cdp`）、
  专属 CDP 浏览器（缺则 `scripts\start-volc-browser.ps1` 拉起）、火山登录态（缺则跑 0 手动登录）。只体检不安装用 `-NoInstall`。
- **新增 `scripts/cdp/*.mjs`（零第三方依赖）**：改用 Node 22 自带的全局 `WebSocket` 直连 CDP，不再依赖 `ws` / `chrome-remote-interface`。
  `authorize.mjs`（自动点授权并取码）、`goto.mjs`（只读导航 + 截图）、`click.mjs`（按标签点击）、`inspect.mjs`（标签页与 cookie 域名证据）。
- **修掉两个会把凭据搞错的坑**：① 取码失败转而读剪贴板时可能拿到**上一轮的旧码** → 服务端报 `state 参数不匹配 (CSRF)`；
  现在 DOM 与剪贴板两条路径**都强制校验 `state`**。② `logged_in: true` 会被上一轮未过期会话顶成**假阳性** → 判定要同时看 `sts_expires_at_ms` 是否变化。
- 提示词同步：A1.5 新增自检步骤；B3 三道闸门重写为「① 0 手动 / ② 真人 / ③ CDP 尝试 + 回退」；D3、D4、D5、D6、总流程图与检查点 0 文案一致化。

## 1.3.0

- **仓库根目录即包根目录**：`npm install <你的仓库地址>` 直接可用（原来插件藏在 `_ppt-maker-plugin/` 子目录里，`dsh` 清单在仓库根找不到）
- **提示词合并为单一来源**：`prompts/PPT全流程_一键编排提示词.md` 是唯一一份，删掉了仓库根上那份重复副本（校验器会断言"只有一份"，防止漂移）
- **补齐开源必备**：`LICENSE`（MIT）、`CHANGELOG.md`、`.gitignore`、GitHub Actions（Node 20/22 跑两套校验）
- **校验器拆成两套**，并有 `npm run verify` 一键跑：
  - `verify:package` —— 源文件完整性、打包元数据可发布性、提示词载荷、安装与源一致
  - `verify:client` —— 客户端 bundle 的真实行为（含全部降级分支与"不该有的东西确实没有"）
- **kickoff 把权限提到第 1 条**并给出可直接复制的命令：全流程只需**一次**确认，之后不再逐条打断

## 1.2.0

- 客户端版本戳写进 kickoff 末尾，一段粘贴就能追溯是哪个构建发的
- node 半边启动时自检自带提示词是否存在并写日志（缺了立刻能看到，不用等 agent 报"找不到文件"）
- 新增 `_verify/verify-package.mjs`
- 删除了 1.2.0 之前的越界机制（改会话权限、宿主 HTTP 路由、往聊天灌全文、composer 通知），留档于 `docs/已删除的机制说明.md`

## 1.1.0

- 路径改为可移植：kickoff 里全部用 `%USERPROFILE%\…`，不再硬编码 `C:\Users\<用户名>\…`（原来插件一搬走或文档一改名就失效）

## 1.0.0

- 首个版本：composer「+」菜单加入「PPT 制作」，二级选择「使用 / 不使用 AI 生图」，向当前会话发一条 kickoff 消息
