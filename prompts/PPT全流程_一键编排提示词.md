# PPT 全流程 · 一键自包含编排提示词（单文件版）

> **两种启动方式，效果完全一样**：
> **① 一句话触发（推荐）**：`@本文件名 帮我完成这个文件的任务` —— 只要本文件在工作目录里，agent 读了它就会自动开跑；
> **② 粘贴启动**：把下面 §0 那 4 条复制粘贴进对话框。
> **不需要任何其他文件**：准备提示词（1/2）、准备提示词-2（生图通道）、PPT 提示词库（一～十一节）的内容**已全部内联在本文件里**。
> **幂等**：已完成的步骤只验证不重做；缺什么补什么。**只打断你四次**（检查点 0/①/②/③），其余全自动。
> **交付物必须报绝对路径 + 登记成能点开的卡片**（见 §0.5）——这是上一轮的真实故障，不许再犯。
> **开工第一件事是确认权限预设**（见 A0）——不确认的话后台每一步都会弹权限确认，极易"卡死"。

---

## §-1 触发约定（**重要：先读这一节**）

**只要用户说了下面任意一句，就视为已授权按本文件从头执行全流程，不要再等用户粘贴 §0：**

- "帮我完成该文件的任务" ／ "按这个文件执行" ／ "跑这个提示词" ／ "照这个文件做" ／ "执行这个 md"
- 或用户用 `@本文件名` 引用了本文件并说了类似的话

**触发后立即按这个顺序做——不要先复述一遍文件内容、不要先问"你确认要跑吗"：**

1. 若**无法确定用户指的是哪个文件**（目录里有多个候选 .md）→ **只问一句**"你是指 `<本文件名>` 吗？"，得到确认后继续；**不要猜、不要挑一个就开跑**；
2. 立刻进入 **§一 阶段 A**（准备环境：验证 + 补齐），做完出就绪报告；
3. 到 **§二 检查点 0** 时**必须先问**用户要不要 AI 生图 —— 说"不要"就**整段跳开阶段 B**，配图改走【七B】；
4. 之后按 **§三 阶段 C** 走完（一 → 十一），在**检查点 ①/②/③ 停下等用户选**；
5. 全程守 **§四 硬规则**；每阶段做完停下等确认再进下一阶段；最后按 §四 D5 交报告。

> 一句话总结：**§0 是给"粘内容"的用法准备的；用一句话触发时，本文件本身就是完整指令。**

---

## 0. 启动指令（复制这一整段；用 §-1 方式触发时可跳过）

> 按本文件（`PPT全流程_一键编排提示词.md`）执行全流程，**自包含，不要去找别的文件**：
> 1. 先做 §一 阶段 A（准备环境）：先跑 **A1.5 新用组件自检**（缺什么自动装），再验证两个 skill 与工具链，出就绪报告；
> 2. **动任何生图步骤之前先问我"要不要 AI 生图"**（检查点 0）：要 → 做 §二 阶段 B；不要 → **整段跳开阶段 B，配图走 §三 C5 的「七B」**，不许碰 arkcli、不许注册火山方舟；
> 3. 然后按 §三 阶段 C 顺序跑完 PPT 全流程（一 → 十一），其中**检查点 ①（要需求）/ ②（选风格）/ ③（转不转 PPTX）必须停下等我选**；
> 4. 全程守 §四 的硬规则；每个阶段做完停下等我确认再进下一阶段；最后按 §四 D5 格式交报告。

---

## §0.5 交付物落盘与打开（**每次产出都必须做｜2026-09-12 用户反馈后新增**）

**每次产出文件（风格演示合集、初稿、终稿、图表截图、PPTX），必须做满"三件套"：**

1. **报绝对路径**：打印**完整路径**，例如 `C:\Users\ASUS\Desktop\插件实验\build\风格预览.html`。
   **不允许**只写"已生成 风格预览.html"、也不允许只给相对路径 —— **上轮用户就是因此找不到文件**。
2. **登记为交付物**：调 `present` 工具把该文件列为本轮交付物，用户即可在 DeepSeek 界面上**直接点开**。
3. **说明打开方式**：HTML → 双击用浏览器打开（或点交付物卡片）；PPTX → WPS / PowerPoint 打开。

**落盘位置约定（防止用户翻目录找文件）：**
- 演示稿与中间稿统一放**当前工作目录**下的 `build/`，图片素材放 `assets/`；
- **不要把风格演示散成 `build/directions/方向N-xxx.html` 这种一堆子文件让用户自己找** ——
  风格演示一律合成**一个** HTML（见 C2【三】），并放在 `build/` 下；
- 若确实产生了多个中间稿，也要在交付物清单里**逐个列出绝对路径**，不许省略。

---

## 1. 总流程图

```
阶段 A  准备环境（幂等：验证 → 补齐，不用问）          产出：就绪报告
   ↓
检查点 0 ★ 问：要不要 AI 生图？
   ├─ 要  → 阶段 B：arkcli + Seedream 通道（幂等验证/补齐；登录闸门① 已 0 手动，只剩 ②③）
   └─ 不要→ 跳过阶段 B，配图走「七B」
   ↓
阶段 C  PPT 全流程
   【一】文案（插槽 1–12 + A–G）        ← 检查点 ① 先向用户要需求
   【二】5 个美术视觉风格方向
   【三】每个方向一张「首页风格演示」HTML  ← 检查点 ② 让用户选方向
   【四】完整初稿（必须预留图表/3D 容器）
   【五】creative-director 智能匹配
   【六】按需素材收集
   【七】AI 生图  或  【七B】程序化图形/SVG（二选一，按检查点 0）
   【八】ECharts 图表 /【九】Three.js 动效 /【十】转场动画
   【十一】转 PPTX                     ← 检查点 ③ 问要不要转、转哪种
   ↓
交付：文件 + 参数对照表 + 验收方法 + 已知限制 + 回退方式
```

---
---

# 一、阶段 A｜准备环境（自动执行，不用问用户）

## A0. 权限预设（**开工第一件事｜不先做这一步，后面几乎必然卡死**）

**先判断当前会话的沙箱/审批设置**，必须是「**完全访问**」（能写工作区以外的路径）。为什么：

| 后续动作 | 会写到工作区外 | 权限不足的后果 |
|---|---|---|
| 装 skill（A2） | `~/.agents/skills`、`~/.dsh`、npm 缓存 | 每装一次弹一次审批 |
| npm 装 9 个包（A3） | 用户级 npm 缓存目录 | 同上 |
| **走过【七】AI 生图** | **`%USERPROFILE%\.arkcli*` 暂存目录** | **arkcli 每调用一次弹一次**（这就是上轮"一直让我确认权限"的真因） |

**处理顺序（只做一次，不要反复问）：**
1. 一句话告诉用户：**请用 `/permission` 把权限预设切到「完全访问」**，并说明原因（否则后台每步都会弹确认）。
2. 用户切好 → 继续 A1。
3. 用户**不切** → **不要硬跑**：
   - 直接建议 **检查点 0 选 B**，并说明"B（程序化图形/SVG）全程**零工作区外写入、零弹窗**"；
   - 用户仍坚持要 A → 把需要放宽的审批点**一次列全**（不是几十个小命令逐个触发审批），再继续。

**防卡死硬规则（与 D3-11 同一条）：** 同一条命令被拒或失败 **不得原样重试**；同一操作最多重试 1 次；
连续 2 次被拒、或同一错误出现 ≥3 次 → **立刻停下**，贴原始报错 + 说明"需要你放宽权限／需要你本人操作"，等用户答复。
**严禁**为了绕开审批而把工作区外写入偷偷改到别处，也**严禁**循环重试同一条命令。

## A1. 能力自检（逐项给证据，不要只说"已确认"）
① 命令执行 ② 文件读写 ③ 联网抓取 ④ Node / npm / npx ⑤ 模型可正常对话（不贴 key）。
缺 ① 或 ②（纯聊天环境）→ **不执行**，直接输出 §四 D6 的人工清单让用户照抄。

**Node 预检**：`node -v`、`npm -v`、`npx --version`。缺 Node **不要硬跑 npx**，报告并给安装指引后停下等用户。

**Windows 命令行预检（重要，先做）**：先试 `npm.cmd -v`、`npx.cmd -v`。
若裸 `npm`/`npx` **没有任何输出**或报 `running scripts is disabled` → PowerShell 拦了 `.ps1` 垫片，
**后续一律用 `.cmd` 后缀**并在报告里注明。**静默无输出 = 失败，不是成功。**

**联网方式预检**：分别实测 Node `fetch` / `Invoke-WebRequest` / `curl.exe`。
实测结论：Windows 上后两者**经常整体不可用**（`curl` 可能返回 `http=000`），
**一切下载动作都用 Node `fetch` 脚本**，不要依赖它们。

### A1.5 本次流程新用组件：自检 + 自动安装（**第一步就跑，一条命令｜2026-09-13 新增**）

"0 手动登录"依赖下面 4 个组件。**开工先整体体检一遍，缺什么自动装什么**——不要等用到某一步才发现缺、再回头打断用户。

```powershell
# <插件目录> = 已安装的 dsh-ppt-maker 目录，**按顺序取第一份存在的**（不要问用户、也不要让用户去找）：
#   ① %USERPROFILE%\.dsh\local-plugins\dsh-ppt-maker              ← link: 安装
#   ② %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-ppt-maker  ← dsh plugin add / pnpm 安装
# 两份都不存在 → 安装不完整：停下报告，不要自己下载脚本凑
powershell -NoProfile -ExecutionPolicy Bypass -File "<插件目录>\scripts\check-env.ps1"
# 只体检、不安装：末尾加 -NoInstall
```

| 组件 | 为什么需要 | 检查方式 | 缺失时自动做什么 |
|---|---|---|---|
| **Node ≥ 22** | `scripts/cdp/*.mjs` 用的是 Node **自带的全局 `WebSocket`**（Node 21+ 才有，故要求 22；这样零第三方依赖） | `node -v` | 报告 + 给安装指引（**不许静默降级到装 `ws`**） |
| **`arkcli`** | 火山方舟通道（生图／模型／用量） | `%APPDATA%\npm\arkcli.cmd --version` | `npm i -g @volcengine/ark-cli@latest` |
| **`dsh-chrome-cdp` 插件** | 让 agent 拥有原生 `chrome_*` 浏览器工具。**注意：0 手动登录并不依赖它**——`scripts/cdp/*.mjs` 自己直连 CDP | 读 `~\.dsh\profiles\web\package.json` 的 `dsh.profile.bundles` 是否含 `dsh-chrome-cdp` | `dsh plugin --profile web add github:xiaobai2017666/dsh-chrome-cdp`（**装完要重启宿主**才会出现工具） |
| **专属自动化浏览器（CDP）** | 自动点【授权】/【开通】等页面操作；独立 profile，**不碰用户日常浏览器** | 探 `http://127.0.0.1:9222/json/version` | **按需**拉起：只有"确实需要登录"时才由脚本启动；**已登录则一个窗口都不弹**。受限沙箱会秒杀 GUI 进程 → 需「完全访问」预设（见 A0） |

**判定**：脚本最后打印 `[DONE] environment ready` = 全绿，直接继续；
打印 `[DONE] unresolved: ...` = **把该行原文贴给用户**并停下等答复，不要自己硬猜。

**唯一可能落到真人身上的一步**（脚本会明确标 `[HUMAN]`）：
专属浏览器**从未登录过火山**时，需要用户在那个窗口里用**手机验证码或扫码**登录**一次**。
之后所有登录/续期都是 0 手动（实测单次约 40 秒）。**除这一步外，不许请用户手工操作。**

---

## A2. 装两个 skill（幂等：先验证，缺才补）

**判定"已安装"的唯一标准**：`SKILL.md` 存在且非空（>200 字节，内容以 `---` 和 `name:` 开头）。
**目录存在但没有 SKILL.md = 失败残留**，必须先整目录删掉再重装。

| skill | 目标路径 | 校验基准 |
|---|---|---|
| `creative-director` | `~/.agents/skills/creative-director/SKILL.md` | 约 **2857** 字节 |
| `emilkowalski-motion` | `~/.agents/skills/emilkowalski-motion/SKILL.md` | 约 **2573** 字节 |

> 落盘可能多出 UTF-8 BOM（实测 **+8 字节**），属正常。

**先判断本地有没有 skill 目录**：列 `~/.agents/skills`（及宿主自带 skill 目录）。
**目录不存在或为空 → 跳过"先读 SKILL.md"，直接进安装流程**（全新环境的正常情况，不是错误，不要因此停下或反复自检）。
只有**已存在同类 skill** 时，才先读它的 `SKILL.md` 再决定装/不装。

**安装顺序固定 A → B → C，A 超时立刻转 B，不要反复重试 A**：

- **A 官方 CLI**：`npx.cmd --yes skills add nexu-io/open-design@<skill> --yes --global`（给 120 秒，超时/留空目录 → 转 B）
  ⚠️ 该命令会**先 clone 整个 `nexu-io/open-design` 仓库（约 2.2GB / 165 个 skill）**，慢且易超时 —— 超时是常态。
- **B 直链下载（推荐，最快最稳）**——直接跑这段（含镜像回退）：
```powershell
node -e "const fs=require('fs'),p=require('path');(async()=>{for(const s of ['creative-director','emilkowalski-motion']){const d=p.join(process.env.USERPROFILE,'.agents','skills',s);fs.mkdirSync(d,{recursive:true});const us=[['https://cdn.jsdelivr.net/gh/nexu-io/open-design@main/skills/'+s+'/SKILL.md',{}],['https://api.github.com/repos/nexu-io/open-design/contents/skills/'+s+'/SKILL.md?ref=main',{'user-agent':'skills-fetch','accept':'application/vnd.github.raw'}]];let ok=false;for(const [u,h] of us){try{const r=await fetch(u,{headers:h});if(!r.ok){console.log('  http',r.status,u.split('/')[2]);continue;}const t=await r.text();if(t.length<200||!t.includes('name:')){console.log('  bad body',t.length);continue;}fs.writeFileSync(p.join(d,'SKILL.md'),t);console.log('OK',s,r.status,t.length+' bytes <-',u.split('/')[2]);ok=true;break;}catch(e){console.log('  miss',u.split('/')[2],e.cause?e.cause.code:e.message);}}if(!ok)console.log('FAILED',s,'- all mirrors unreachable');}})()"
```
  > **为什么必须带第二条回退**：jsdelivr 对部分文件返回 `301` 跳到 `raw.githubusercontent.com`，
  > 而该域名在部分网络下**根本解析不了**（`getaddrinfo ENOENT`）。第二条走 `api.github.com` +
  > `accept: application/vnd.github.raw` 直接拿正文，实测稳定。
- **C GitHub API 兜底**：`GET https://api.github.com/repos/nexu-io/open-design/contents/skills/<skill>`，按 `download_url` 逐个下。

**每个 skill 装完立刻验证**：文件存在、字节数合理（见基准）、能打印前 20 行。

> `find-skills` 由宿主内置，**不需要安装**。以后缺别的 skill：用 `npx skills find <关键词>` 拿到
> `owner/repo@skill` 形式的包名，再按 A→B→C 装（**不要凭名字硬猜包名**）。

## A3. 工具链与目录（幂等；检查逻辑已按实测修正）

**不要只在项目根 `require.resolve`** —— 包可能装在子目录（本机实测：`_ppt-build\node_modules` 里有 5 个，
而 `echarts / three / gsap / lottie-web` 四个是缺的）。**根 + 已有 `node_modules` 子目录一起查，只补真正缺的**：

```powershell
# ① 找有哪些 node_modules
Get-ChildItem . -Directory -Recurse -Depth 2 -Filter node_modules | ForEach-Object { $_.FullName }
# ② 逐个包在这些目录里查
$pkgs = 'pptxgenjs','jszip','pngjs','gifenc','fast-xml-parser','echarts','three','gsap','lottie-web'
foreach($d in @('.','_ppt-build')){ Push-Location $d -ErrorAction SilentlyContinue
  $chk = node -e "const m=process.argv.slice(1);let bad=[];m.forEach(x=>{try{require.resolve(x)}catch(e){bad.push(x)}});console.log(bad.join(',')||'ALL_OK')" $pkgs
  "[$d] 缺失: $chk"; Pop-Location }
# ③ 只把缺的装上（装到项目根，保证后续从根运行都能解析）
npm.cmd i pptxgenjs jszip pngjs gifenc fast-xml-parser echarts three gsap lottie-web
# ④ 复检
node -e "const m=['pptxgenjs','jszip','pngjs','gifenc','fast-xml-parser','echarts','three','gsap','lottie-web'];let bad=[];m.forEach(x=>{try{require.resolve(x)}catch(e){bad.push(x)}});console.log(bad.length?('缺失: '+bad.join(',')):'全部 9 个可解析 ok')"
```

- **必须是这 9 个包**：后 4 个是八/九/十节要用的，漏了会跑到一半卡住
- 子目录里已有同名包**不算完成**（后续脚本从项目根跑解析不到）→ 缺的补到根上
- 浏览器侧若另有独立文件（根目录已有 `echarts.min.js` / `three.min.js`），HTML 稿可直接 `<script src>` 引用；
  但 **Node 侧的渲染/校验/出 PPTX 仍需 npm 包**，两者不能互相替代
- **无头浏览器：不要写死路径**，按顺序探测取第一个存在的：
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` →
  `C:\Program Files\Microsoft\Edge\Application\msedge.exe` →
  `C:\Program Files\Google\Chrome\Application\chrome.exe` →
  `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`；
  一个都没有 → **停下报告"未找到可用浏览器"，不许猜路径**
- 建目录：`assets/`、`assets/_backup/`、`build/`（`build/` 常被漏建）

## A4. 阶段 A 就绪报告（按此格式输出后**继续**，不必等确认）
| 项目 | 状态 | 证据 |
|---|---|---|
| 模型可对话 | ✅/❌ | 一句返回（不贴 key） |
| Node / npm / npx | ✅/❌ | 版本号（注明是否必须 `.cmd`） |
| 联网方式实测 | ✅/❌ | Node fetch / Invoke-WebRequest / curl 各自结果 |
| creative-director | ✅/❌ | 路径 + 字节数 + 走的 A/B/C 哪条 |
| emilkowalski-motion | ✅/❌ | 同上 |
| Node 工具链 | ✅/❌ | 9 个包的校验输出 |
| 无头浏览器 | ✅/❌ | 实际探测到的路径 |
| **新用组件自检（A1.5）** | ✅/❌ | `check-env.ps1` 的 5 行结论：Node／arkcli／dsh-chrome-cdp／CDP 浏览器／火山登录态 |
| 目录结构 | ✅/❌ | 三个目录 |

---
---

# 二、检查点 0 ★ 要不要 AI 生图（**必须先问，不许默认**）

> **PPT 里的配图走哪条？**
> **A. AI 生图**（火山方舟 Seedream）：效果更"照片感/插画感"；需要你**注册火山引擎 + 完成实名 + 开通模型 + 按量计费**（约 0.22–0.3 元/张）。**登录已经 0 手动**：agent 自己跑 `scripts\volc-0manual-login.ps1` 完成（详见 B3）；只有**首次**需要你在专属自动化浏览器里登录一次。
> **B. 程序化图形 / SVG**（走「七B」）：**零成本、零账号、断网可用、可打印**；风格是"设计感/图示感"而非"照片感"。
> 我的建议：需要真实感插画选 A；只要结构图/图标/抽象几何选 B。

- 选 **A** → 做下面的「阶段 B」，PPT 阶段走 **【七】**
- 选 **B** → **整段跳过阶段 B**（不碰 arkcli、不注册、不授权），PPT 阶段走 **【七B】**，并在报告里写明"用户选择 B，未使用 AI 生图"

## 阶段 B｜生图通道（幂等：先验证，缺才补）

### B1. 环境事实（实测，别再试错）
| 事实 | 说明 |
|---|---|
| arkcli 路径 | `C:\Users\ASUS\AppData\Roaming\npm\arkcli.cmd` —— **必须调 `.cmd`**；直接敲 `arkcli` 会命中 `arkcli.ps1` 被 PowerShell 执行策略拦下 |
| 归因前缀 | 每条命令都带：`ARKCLI_NO_UPDATE_NOTIFIER=1`、`ARKCLI_CALLER_TYPE=ai_agent`、`ARKCLI_CALLER_NAME=<agent>`、`ARKCLI_SKILL_NAME=<当前步骤>` |
| 沙箱 | arkcli 要写 `C:\Users\ASUS\.arkcli*`（工作目录之外）→ 会报 `create staging directory ... Access is denied`；**几乎每条命令都要一次"放宽文件权限"批准**，最好开工前一次性放宽 |
| 引号坑 | 调 `.cmd` 时 `--params '{"K":v}'` 里的双引号会被吞掉（`invalid --params JSON`）→ 能不用 JSON flag 就不用 |
| 登录后产物 | 通常会建两个 profile：`agent-plan_*`（默认，套餐）与 `platform_*`（按量，带 API Key） |
| 一句话记住 | **有 Key 的通道没模型，有模型的通道没 Key** |

### B2. Preflight（只读、不花钱）
```powershell
$ark = "$env:APPDATA\npm\arkcli.cmd"      # 归因前缀见 B1
& $ark --version
& $ark auth status --transform 'logged_in'
& $ark auth status --transform 'volc_sso.identity.verified'
& $ark profile keys list
& $ark profile keys list --profile <platform profile 名>
& $ark resources list --modality image
& $ark resources list --modality image --profile <platform profile 名>
& $ark pricing models --model <候选目录名> --format json    # 看 State / SubServices.Status
& $ark models get <候选目录名> --transform supported_params
& $ark models get <候选目录名> --transform name             # 拿目录名（--model 用它）
& $ark models get <候选目录名> --transform primary_version  # 拼完整 ID
& $ark usage balance --type plan                            # --type 必填！
```
**判定只有三种**：**P1** 套餐通道可用（有模型 **且** keys 非空）→ 直接 `+gen`；
**P2** 套餐通道缺 Key → 走闸门②；**P3** 走按量通道（该模型 `State=Available`）→ 先 `+deploy` 再 `+gen`。

### B3. 登录与开通闸门（**① 已改为 0 手动；2026-09-13 实测**）

**闸门①（未登录）→ 0 手动：agent 自己跑一条命令，不要让用户动手**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<插件目录>\scripts\volc-0manual-login.ps1"
```

它内部就是三段（也可拆开单独跑，便于定位失败点）：

1. `arkcli auth login volc-sso --no-browser` → 得到 `authorize_url`（**有效期 600 秒**）；
2. `node scripts\cdp\authorize.mjs "<authorize_url>" --state <state>` → 在**专属自动化浏览器**里点【继续登录】→【授权成功】→ 从隐藏 `textarea` 读出 base64 码，打印 `CODE:`，并落一张截图；
3. `arkcli auth login --no-browser --code <码>` → 交换令牌。

**三条必须守住的约束（全部是踩过的坑）**

- **码必须校验 `state`**：与 Phase 1 的 `state` 不一致的码一律丢弃。曾经因为 `authorize.mjs` 崩了转而读剪贴板，结果**把上一轮的旧码喂进 Phase 2**，服务端正确拒绝：`state 参数不匹配,可能存在安全风险 (CSRF)`。`.ps1` 的剪贴板兜底现在也强制校验 `state`。
- **`authorize_url` 只有 600 秒**：浏览器那步失败就**重跑 Phase 1 拿新链接**，不要拿旧链接反复试。
- **判定成功不能只看 `logged_in: true`**：还要确认 `control_plane_auth.sts_expires_at_ms` **变了**（=本次真的刷新过）；否则可能只是上一轮登录还没过期的**假阳性**。

**闸门②（套餐通道缺 Key）仍是真人步骤**：非交互环境下 `arkcli auth apikey` 报"选择取消"——它是交互式选择器，本流程无法自动化（桌面自动化插件 `dsh-click` 在本机因加载时序 bug 不可用）。**一次列全后等用户**。

**闸门③（模型未开通）**：可以**尝试**用 CDP 自动点开通，但要留退路：
`node scripts\cdp\goto.mjs "<控制台开通页>"` 先读页面确认哪一行是"未开通" → `node scripts\cdp\click.mjs "开通"` 点击 → **必须截图留证**。
**页面结构不匹配、点了没反应、或出现任何确认弹窗 → 立刻回退成"把链接交回用户并点名要开哪一行"**，不要反复点。
控制台开通页：`https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?advancedActiveKey=model`
（`doubao-seedream-5-0`＝"Doubao-Seedream-5.0-lite"；`doubao-seedream-5-0-pro`＝"Doubao-Seedream-5.0-pro"，是两条独立条目）

**已知坑（务必避开）**
- 走"借道 ve 设备码"形态时，打印的 `Successfully logged in!` 是 **ve 的**，arkcli 仍可能 `logged_in:false`
  → 以 `arkcli auth status --transform 'logged_in'` 为准，必要时重跑 B3-①
- 非交互环境**严禁**自己加 `--yes`、设 `ARKCLI_ALLOW_HEADLESS_ACTIVATION=1` / `ARKCLI_ALLOW_HEADLESS_DELETE=1` 代替用户授权
- 套餐通道 `--model` 用套餐模型名（如 `doubao-seedream-5.0-lite`）；**按量通道必须用 `ep-xxx`**，没有就先 `+deploy`：
  `& $ark +deploy --profile <platform> --name <ep名> --model <完整ID>`（执行前复述 model/name/region/计费）

### B4. 参数硬约束（实测，越界必被拒）
| 目录名 | 控制台显示名 | size 总像素范围 | 16:9 安全值 | 文生图价 |
|---|---|---|---|---|
| `doubao-seedream-5-0` | Doubao-Seedream-5.0-**lite** | `[3686400, 16777216]` | `3072x1728` | 0.22 元/张 |
| `doubao-seedream-5-0-pro` | Doubao-Seedream-5.0-**pro** | `[921600, 4624220]` | `2560x1440`（最小 `1280x720`） | `ToICompletion` **0.3 元/张** |

- `--watermark=false` **必须显式传**（服务端默认 `true`，不传就带水印）
- 建议显式 `--output-format png`
- 该模型**没有 `negative_prompt` 字段** → 负面词折进正向词尾部 `Avoid: ...`
- `guidance_scale` 不支持，别传；价格只引用 `pricing models` 的真实 `ChargeItems`（别取到 `ToIPrompt` 0.02）

### B5. endpoint 管理（两个坑）
- **`resources list` 的 `invocable` 不反映运行状态**：`infer endpoint stop` 之后它仍返回 `invocable: true`；
  唯一可信的是 `& $ark infer endpoint get <ep> --transform 'Status'`（`Running` / `Stopped`）
- **刚 `start` 完不能立刻出图**：控制面已 `Running`，数据面仍连续报
  `endpoint is currently closed or temporarily unavailable` —— 实测约 **1.5～2 分钟**才真正可用
  → **退避重试**（间隔约 25 秒 × 4～5 次），不要换模型/重开；这类失败调用**不计费**
- **停止 ≠ 删除**；`delete` 不可逆且非交互环境需 `ARKCLI_ALLOW_HEADLESS_DELETE=1`（`--yes` 不授权）→ **不要替用户设这个变量**

### B6. 试片（零成本预演 + 一次最小真实调用）
```powershell
& $ark +gen --dry-run --modality image --model <模型或ep> --size 1280x720 "test"   # 纯本地预演，不联网
& $ark infer endpoint get <ep> --transform 'Status'                                  # Stopped 就先 start
& $ark +gen --profile <profile> --modality image --model <模型或ep> --size 1280x720 `
    --output-format png --watermark=false --save-to "_prep_test" "<提示词>"
```
> `--dry-run` 只是本地预演，**不校验尺寸/开通状态**，别当服务端验收。

### B7. 阶段 B 就绪报告（按此格式输出后**继续**）
| 项目 | 状态 | 证据 |
|---|---|---|
| arkcli 安装 | ✅/❌ | 版本号（是否必须 `.cmd`） |
| 会话权限 | ✅/❌ | 有无 Access is denied |
| 登录 | ✅/❌ | `auth status` 原始输出 + 走的哪条路线 |
| 身份与实名 | ✅/❌ | whoami 摘要 + `verified` |
| profile 与 Key | ✅/❌ | 哪个 profile 有 Key、数量（**只写掩码**） |
| 模型 + 参数 | ✅/❌ | 目录名 + 完整 ID + 尺寸范围 |
| 开通状态 | ✅/❌ | `State` / `SubServices.Status` |
| 额度 | ✅/❌ | `usage balance --type plan` 摘要 |
| 试片 | ✅/❌ | `local_path` 或原始报错 |
| 计费资源 | — | endpoint id + 停/删命令（**不要替用户执行删除**） |

---
---

# 三、阶段 C｜PPT 全流程（一 → 十一）

> **每个阶段做完停下等用户确认**，再进入下一阶段。

## C1【一】文案 ← 检查点 ①：**先向用户要需求，再动笔**

用**结构化 question-form**（每问带推荐默认项 + 可自定义填写）问清下面这些插槽：

```
《【1｜PPT 标题】》
这份 PPT 的目的：
1.【2-1｜目的：想让谁，看完之后产生什么认知或行动】
2.【2-2｜目的：…】 3.【2-3｜目的：…（可继续加）】
ppt 内容为
1.【3-1｜第一部分讲什么】 2.【3-2｜…】 3.【3-3｜…】（想不好就写"由你根据目的建议"）
【4｜受众与场合】：【谁听、什么场合、要不要评委/领导认可、现场几分钟还是只发给人看】
【5｜风格倾向】：【可留空；或写"先给我方向选"】
【6-0｜资料名称】：【自我介绍 / 项目简介 / 工作经历 / 产品资料】
【6｜该资料正文】：【整段粘贴，长短不限】
实例证明：一："【7-1｜支撑素材①，一段经历/一个案例/一条数据】" 二："【7-2】" 三："【7-3】"
【备注】：一用来证明【8-1｜它要证明什么能力/结论/价值】 二用来证明【8-2】 三用来证明【8-3】
【9｜后续计划/当选后做法/下一步方案/实施路径】：【整段或关键词】
【10｜必须原样保留的原话或关键词】：【…】
【11｜禁止出现的内容】：【某种说法、某种承诺、某些称呼】
【12｜事实红线】：默认禁止编造或推测任何经历、数字、时间、机构名、荣誉；材料里没有的一律先问我
—— 可选进阶 ——
【A｜真实数据】：【有：贴数据与出处 ／ 没有：不得编造数值，改用结构图/关系图/流程图表意】
【B｜希望出现的图表或特殊页】：默认 = 要图表但不编数据，用 ECharts 关系网/结构图/流程链，至少 1 页真图表
【C｜动效需求】：默认 = 翻页转场 + 逐元素入场 + 一层常驻动效（Three.js 粒子/线框或 canvas 波形），只有当前页渲染、切页即停
【D｜播放环境】：【PowerPoint（版本）/ WPS / Keynote / 浏览器 / 投影仪分辨率】
【E｜交付形态与顺序】：【① 逐页文字稿 → ② 设计版 HTML → ③ 动态版 → ④ 导出 PPTX；每阶段等我确认】
【F｜转 PPTX 并保留动画】：按本文件 C7 执行
【G｜交付时附上】：文件路径、验收方法、已知限制、"我给的参数 ↔ 成品实际参数"对照表
```

**拿到答复后**：先输出**逐页文字稿**，再做一个**只有文字、无设计风格的 HTML**（含全部页面），供用户校对标题与文字，
避免加上设计元素后还要改版面。**明确：先不要写代码、不要生成 PPT。**
**停下等用户确认文案。**

## C2【二】风格方向 +【三】首页风格演示 ← 检查点 ②：让用户选

**【二】**基于主题、目的与逐页文案，给 **5 个**能直接指导**画面/排版/色彩/图形/质感**的
「美术视觉风格／艺术语言」方向。
**不要**"咨询风／发布会风／商务汇报风"这类**用途分类**；要的是风格本身
（例：瑞士国际主义、包豪斯、荷兰风格派、Art Deco、Pop Art、Y2K、Minimalism、Glassmorphism…）。

**【三】把 5 个方向合并成「一个」HTML 文件**（**不要再散出 5 个文件**）：
- 一个文件里**纵向排 5 块**，每块 = 该方向的**首页演示**（1280×720 等比缩放），供横向对比；
- **每块上方必须有醒目标签**：`方向 N · 风格名` ＋ **一句话视觉语言**（底/主色/字形/图形/质感），
  让用户不开文件也能知道"哪一张是哪种风格"；
- 顶部放一条**粘性跳转条**（点标签跳到对应方向）；
- 若某个方向是本次选定项，在标签上打「本次已选」角标；
- 技术做法（推荐）：把每个方向的完整 HTML 用 `<iframe srcdoc="…">` 内联进同一个文件 ——
  **单文件、零外部依赖、天然样式隔离**（各方向同名 class 不会互相污染）；
  注意 `srcdoc` 属性值只需转义 `&` 与 `"`，子页面的 `<script>` 会正常执行（等比缩放靠它自己算）。

**交付这个合集文件时必须做满三件套（§0.5）：**
- ① 打印该文件的**绝对路径**（例如 `…\build\风格预览.html`）；
- ② 调 `present` 登记为本轮交付物，**让用户能直接点开**；
- ③ 补一句"点开即可横向对比 5 个方向，顶部标签写明了每张是哪种风格"。
- **禁止**只丢一句"已生成风格方向合集"；**禁止**散成 `方向1-xxx.html`…`方向5-xxx.html` 五个文件交付
  （上一轮就是这么散在 `build/directions/` 里，用户找不到也打不开）。

**然后停下让用户选**（结构化选择 + 允许"都不是，我要…"）。**选定后才进第四节。**

## C3【四】生成初稿

按选定方向出完整 HTML 演示稿（1280×720；翻页、进度条、圆点导航、打印分页齐全）；
初稿完成后**自己在当前工作目录/项目根目录定位最新的 .html**（不要反问用户路径、不要猜），
然后**把绝对路径打印出来、调 `present` 登记为交付物**（见 §0.5），再向用户确认一次。

**若【B】或【C】不是"只要静态"，初稿阶段就必须预留**：
1. 每个图表预留**有确定宽高**的容器（如 `.chart`，560×320）—— **ECharts 在 0 尺寸容器里不渲染**，事后硬塞必返工；
2. 需要 3D 背景的页预留**独立图层**（canvas 或绝对定位容器），不压正文；
3. JS 按"**每页一个 init 函数 + 翻页回调里启停**"的结构写，别写成全局动画；
4. 初稿交付时就说明清楚：哪些页静态、哪些页有图表、哪些页有持续动效。

## C4【五】智能匹配下一步 +【六】素材收集（按需）

**【五】以 `creative-director` 为主要工作流**，按"**诊断 → 风格方向 → 资源选择 → 具体改动/生成 → 验证**"走完全程：
- 设计目标 = 刚完成的 HTML 初稿（自行定位并确认一次）；用户提供的参考图一并作为审美基准，
  先用图像理解读取并拆解：构图、信息密度、字体气质、配色逻辑、质感与光影、留白节奏
- 需要用户选择时用**结构化 question-form**（给推荐默认项，并保留可编辑的自定义答案），确认后继续
- 每一步说明**为什么选这些资源**、以及下一步需要用户确认什么

**【六】自动素材收集（可有可无，但"判断"必做）**
> 本节的对象是**品牌 Logo / 产品截图 / 浏览器素材** —— 也就是"稿子里有真实品牌或产品需要还原"的场景。
> 没有这类对象时通常整节跳过，但 **"跳过"不等于"不输出"**。

1. **无论最终加不加，都必须先输出一张逐页判断清单**（字段固定）：
   `页码 ｜ 这页适合加什么素材 ｜ 该加 / 不该加 ｜ 理由 ｜ 替代方案（若不加，这页靠什么承担表达）`
2. 判"不该加"时**必须写明是哪一条理由**（不许只写"不需要"）：
   ① 没有真实品牌/产品可还原；② 该页已有图表/3D/强版式，再加就是第二个视觉中心；
   ③ 素材的"官方原貌"要求与本片视觉语言冲突（例：粗野主义的高饱和撞色 + 粗黑边 ↔ 官方配色的照片感素材）。
3. **决定要加时**：先联网搜索**官方 / 高清**素材 → 下载到本地并嵌入；**Logo 与产品标识保持官方原貌**
   （不重新上色、不变形、不加特效）；风格统一靠**外层容器**实现（贴纸、浏览器窗口、阵营卡片、厚白边、硬阴影、轻微旋转）；
   **不影响文字可读性**；完成后**逐条说明每页新增了什么**。
4. **结论是"整节跳过"时**：也要把上面那张清单连同理由写进报告，**并至少给出一个"如果非加不可"的替代方案**
   （例如"P3 可做一排工具 Logo 贴纸墙"），由用户决定是否推翻你的判断 —— **不要只写一句"跳过（有理由）"**。

## C5【七】AI 生图 **或**【七B】程序化图形（按检查点 0 二选一）

### 走【七】AI 生图（用户选了 A）
1. **判断哪些页要图**：通读全部页面 → 输出清单（`页码｜要不要图｜画什么｜放哪｜尺寸比例｜正向提示词｜负面词｜理由`）。
   **宁少勿多**：已有图表/强排版/动画承担表达的页不加图；**图不得暗示用户未提供的事实**（奖项、数据、机构、人物肖像、真实场所）。
2. **参数**：`--size` 必须落在该模型像素区间（见 B4）；`--watermark=false`；无 `negative_prompt` → 负面词折进正向词尾部
3. **提示词规范**：英文；末尾统一风格后缀；再末尾 `Avoid:` 列表**必含**
   `text, letters, numbers, chinese characters, people, human figures, faces, hands, watermark, logo, signature, photorealistic, 3d render`
4. **落盘**：统一 `assets/`，命名 `pageNN-用途.png`；另写 `assets/manifest.json`（模型/尺寸/参数/坐标/单价/新建计费资源）
5. **嵌入**（不破图的关键）：
```html
<svg class="bgart" viewBox="…" preserveAspectRatio="xMidYMid slice">…占位图形…</svg>
<img class="bgimg" src="assets/pageNN-用途.png" alt="" onerror="this.remove()">
<span class="bgveil"></span>
```
   层级照抄：`bgart/bgimg 0 → bgveil 1 → 装饰层 2 → 正文 3 → 徽标 4 → 水印 5 → 导航 20`；
   覆盖正文的背景图**必须叠一层"靠文字一侧实、另一侧虚"的渐变遮罩**保对比度；改动前备份到 `assets/_backup/`
6. **验收**：图片真的加载（`naturalWidth`）？铺满正确？文字没被压？断网可开？打印正常？

### 走【七B】程序化图形／SVG（用户选了 B）
> 零成本、零账号、零外部依赖，全用本机 SVG／CSS／Canvas 画。

0. **动手前自检**：① SVG/CSS 画法只需 Node + 无头浏览器；② Canvas 同上；③ 数据驱动图表用 echarts（缺就先 `npm i echarts`）；
   ④ **若最终要进 PPTX，图形必须能被单独栅格化**——每个图形作为独立元素存在，不能和文字焊死在同一个背景层。
1. **先定全篇图形语言**（不要一页一个风格）：色板从主色板取 3–5 色，只允许加黑白灰明度变化；
   圆角/描边/网格/留白节奏/是否渐变全篇统一；沿用首页与初稿已确立的视觉语言。
2. **判断哪些页要图**：先出清单给用户确认（`页码｜要不要｜画什么｜放哪｜尺寸比例｜技法｜配色`）。
   技法五选一：**内联 SVG（首选）**／CSS 几何／Canvas／数据驱动图表（有数据才用）／组合。
   **只在"光靠文字讲不清"或"加图显著提升说服力"时加，宁可少不可凑数。**
3. **术语替换**（程序化图形没有模型）：把"正向提示词/负面词"改成
   **设计规格**（几何关系、技法、色、尺寸、表达什么）+ **负向清单**（默认禁止无意义装饰、通用 AI 渐变、空卡片、杂乱粒子、抢注意力的高饱和块、彩色噪点）。
   判定标准不是"像不像 AI 图"，而是**能不能一眼看懂这张图在说什么**。
4. **硬性规范**：① 自包含，不引外链，字体只用系统字体栈；② **每个图形独立容器，不要挂在入场动画类上**
   （否则会被烘进底图、无法单独截取）；③ 每图形最多 2 个强调色；④ 必写 `viewBox` + `preserveAspectRatio`；
   ⑤ 宽度用百分比/容器单位，不写死 px；⑥ 无外部字体与远程图片，断网照样渲染；⑦ 装饰性图形加 `aria-hidden`，
   有信息含义的加 `title/desc` 且不只靠颜色区分；⑧ 做完逐张单独截图自检（渲染正常、未变形溢出被裁、与文字不重叠）。
5. **验收**：① 每页"含图形/隐藏图形"各截一张；② 空白检查（防 `viewBox` 写错渲染成 0×0）；
   ③ 断网检查；④ PPTX 侧作为**独立栅格化图层**出现（默认走栅格化，不要直接塞原生 SVG）。
6. **交付必须附**：参数对照表（设计规格 ↔ 实际几何/色值/尺寸）、验收方法、已知限制、一键回退方式。

**红线**：本节不做完渲染自检，后面的全篇工作一律不要开始。
**纯 Node 兜底（浏览器起不来时）**：用 `@resvg/resvg-js` 把 SVG 直接栅格化成透明 PNG，
再用 `pptxgenjs.addImage({data:'image/png;base64,'+png.toString('base64'),x,y,w,h})` 当图层插入，用 `pngjs` 校验尺寸像素。
（做不了 CSS 布局与 HTML 截图，但本节以 SVG/程序化图形为主，够用。）

## C6【八】图表 +【九】动态效果 +【十】转场

### 【八】增加图表效果（ECharts）
先扫全部页面，**自行判断哪些页适合加图表、用什么图表、放哪里**；**只有真正有助于表达的页才加，不要每页都加**。
- **A1**：ECharts 5.x + `{ renderer:'canvas' }`；库文件优先放**本地**（与 HTML 同目录的 `echarts.min.js`）；
  必须写 fallback：本地失败 → 试 CDN → 都失败就在容器里显示一行提示，**不要让页面空白**
  - ⚠️ **建图必须给显式尺寸**：`echarts.init(el, null, { renderer:'canvas', width:880, height:400 })`。
    容器在 `display:none` 的页里尺寸为 0，ECharts 不会渲染 —— 结果就是"没翻到该页直接打印/导 PDF"时图表是空的。
    给了显式尺寸后，加载时就能建好图，打印一定有。
  - ⚠️ **本地库是否真的生效要单独验**：断言"没有触发 `onerror`（没走 CDN）"，否则探针目录放错时它会静默回退到 CDN，
    你以为在测本地路径，其实在测网络。
- **A2**：关系网/结构图用 `series.type='graph'`（force 或 circular）；流程链用 `graph` + 固定坐标；时间线用自定义 series。
  **没有真实数据就不许编造数值**；柱状/折线只允许在【A｜真实数据】确有数据时使用
- **A3**：至少两类动效 —— ① **进入本页时**才播放（翻页回调或 `IntersectionObserver` 触发，不要一打开就全播完）；
  ② 常驻轻量动效（力导向自动收敛、节点呼吸式高亮、虚线流动）
- **A4** 验收：每页截图确认图表真的渲染（不是空白 canvas）；断网可用；控制台无报错；打印/导 PDF 时图表仍在

### 【九】增加动态效果（Three.js）
> ⚠️ **先验一件事再动手**：`three` 新版（实测 0.186）**已不再提供 UMD/IIFE 浏览器构建**（只有 `three.module.js` ESM 与 `three.cjs`）。
> ESM 在 `file://` 下会被 CORS 拦死 —— 也就是"双击打开"必然失效；没有 esbuild/rollup 也无法就地打成全局。
> **先跑一次 `node -e "console.log(require('three/package.json').version)"` + 看 `node_modules/three/build/` 有没有 `three.min.js`**：
> 有 → 按下面正常走；**没有 → 改用 canvas 2D 手绘线框/波形**（【C】默认项明确允许"Three.js 粒子/线框**或 canvas 波形**"），
> 行为仍照 B1–B5 执行（单 rAF、逐页启停、`document.hidden` 暂停、失败降级、打印隐藏）。

扫全部页面，**自行判断哪些页适合 3D/粒子**；**只加真正增强表达的页，不要每页都加**。
- **B1**：粒子用 `THREE.Points` + `BufferGeometry` + `PointsMaterial`；线框用 `LineSegments` + `LineBasicMaterial`；
  可用 `CanvasTexture` 贴程序化纹理
- **B2**：背景动效用 `OrthographicCamera` 或低视场 `PerspectiveCamera`；`requestAnimationFrame` **单循环**；
  粒子数 ≤ 2000；`document.hidden` 时暂停
- **B3（关键）**：**只有当前页可见时才渲染它自己的场景**（翻页回调里 start/stop），否则多页 3D 同跑会把风扇拉满、拖慢翻页
- **B4**：无 WebGL / 初始化失败 → **降级成 1 层 CSS 渐变或纯色底，不能出现黑块或报错**；打印样式下隐藏 3D canvas（图表 canvas 保留）
- **B5** 验收：间隔 1 秒截两张图应有差异；翻页后旧页动画确实停了；断网仍能跑；控制台没有 WebGL 警告刷屏

### 【十】增加转场动画（以 `emilkowalski-motion` 为主）
基于当前 HTML/页面元素加入高质量动效：入场、状态切换、过场、GSAP/Motion 微交互**任选最有效的 1-2 处**；
**保持克制，优先 transform/opacity，加 `prefers-reduced-motion` 兜底**。
- **技术映射**（自行判断并说明理由）：CSS keyframes/transition（默认首选）→ Web Animations API（需精确控制/可暂停）→
  GSAP（时间轴/ScrollTrigger，离线优先内嵌）→ Lottie（仅当已有 `.json`）→ Rive（仅当已有 `.riv`）
- **红线**：控件过渡 140–220ms；**只动 transform/opacity**，不碰 top/left/width/height；不叠加无尽装饰性循环；
  同一作品只用一套动效语言；仅对小批量元素做 stagger；用完清理 observer/timer/动画实例
- **沿用既有语言**：初稿里已有动效（时长/缓动/触发）就先沿用并统一，**不要另起一套**
- **改前备份**到 `assets/_backup/`；改后给：改动清单（动效点｜实现方式｜时长缓动｜触发条件）+ 前后对比（截图/GIF）+ 无障碍自检
- 翻页与入场基线：翻页位移+淡入 **0.5–0.6s**；页内元素按 **0.11s** 递增错峰上浮（或按既有语言）

## C7【十一】转 PPTX ← 检查点 ③：**先问用户要不要转**

> **现在要不要转成 PPTX？**
> **A. 转 PPTX（保留转场与逐元素动画）** —— pptxgenjs + JSZip 回写 PowerPoint 原生时间轴；图形/图片作为独立图层
> **B. 转 PPTX（静态版，最稳）** —— 每页一张整页图，无动画，兼容性最好
> **C. 先不转，只要 HTML** —— 需要时再转

**按用户所选出件；选 A/B 时按下面的规范执行：**

**0. 渲染预检（先跑最小验证，通过了再动手做全篇）**
① 无头浏览器能起来并连上调试端口（`GET http://127.0.0.1:9222/json/version` 返回 JSON）；
② 能打开一个 20 行测试 HTML；③ 能截出 100×100 PNG 且前 8 字节为 `89 50 4E 47 0D 0A 1A 0A`；
④ 能按元素 `clip` 截出包围盒大小的图层 PNG。**四条全过再继续**，否则后面所有分层截图/像素回归/GIF 抓帧都会白做。
> 浏览器完全起不来时（典型：`platform_channel.cc:183 Check failed: 拒绝访问`，IPC 命名管道被拦），
> 改走**纯 Node 路线**：`@resvg/resvg-js` 栅格化 SVG → `pptxgenjs.addImage` 图层嵌入。
> 若作品依赖 CSS 布局与 HTML 动画，则必须换到能正常渲染的机器上做——这是环境限制，不是流程问题。

**1. 动手前先向用户确认 5 件事**：① 尺寸（16:9＝13.333×7.5 英寸）/母版/字体要求；
② 文字可编辑性：A 像素级保真（整页图）／B 原生文本框+形状（可编辑）／C 混合；
③ 动效保留级别：① 只要静态 ② 转场+逐元素入场 ③ 还要持续动效；④ 播放软件（PowerPoint 版本/WPS/Keynote/浏览器）；
⑤ 文件名/是否附素材目录/是否需要备注页。

**2. 从 HTML 源码"抄"出动画规格（禁止凭记忆或猜测）**：转场读 `.slide` 的 transition；元素入场逐个列动画类的
`animation` 简写与 `@keyframes` 的 from/to。**先输出"HTML 实测值 ↔ PPTX 写入值"对照表再动手。**
- **坑 1**：CSS animation 未写缓动时默认是 `ease`＝`cubic-bezier(.25,.1,.25,1)`，不是 transition 那条曲线
- **坑 2**：入场动画会覆盖元素自身静态 transform（tilt/rotate/translateY(-50%)）→ 终态是"无变换"，
  **图层必须按这个终态截取**，否则卡片在 PPT 里是歪的

**3. 分层与截屏规范**：底座图＝隐藏所有入场元素后的整页；每个动画组＝一张透明 PNG（按包围盒裁剪，留 8–10px 余量）；
截某组时隐藏其它组但**保留该组的祖先元素**（否则父容器带同类时整组消失→空图）；
**一个动画类可能含多个元素，必须逐个核对组成员**，漏一个就会永久烘进底图；
媒体面板（canvas/3D/图表）单独用 GIF 覆盖并在同组 PNG 里隐藏（避免重影）；合成后做**像素回归**（底座+各层 ≈ 原整页，差异接近 0）。

**4. PowerPoint 原生时间轴（最容易返工，严格按此写）**
- 结构：`tmRoot(id=1) → mainSeq(id=2) → 单个自动触发组[ 外层 par(cond delay="0") → 内层 par(cond delay="0") → 各效果 par ]`
- 每个效果：`presetID / presetClass / presetSubtype + grpId="0" + nodeType`（首个 `afterEffect`，其余 `withEffect`）
- **坑 3**：同一自动组内每个效果的 `<p:cond delay>` 是**相对组起点的绝对时间**（例 40/150/260/370/480/590ms），
  **不是相对上一个的增量**；写成增量会导致所有元素几乎同时出现
- 入场三件套：`<p:set style.visibility>` + `<p:animEffect transition="in" filter="fade" dur=…>` + `<p:anim attrName="ppt_y">`
- **坑 4**：位移必须用**相对公式** `#ppt_y-0.0278` → `#ppt_y`；写成绝对 `<p:fltVal>0.0278</p:fltVal>` 会把元素搬到页面顶部
- 缓动：用多个 `<p:tav tm="…">` 关键帧拟合（tm 单位 1/1000 %）
- 旋转：用 `<p:animRot from="36000" to="0"/>`（单位 1/60000 度）；不要用"基础 rot + by"（失败会留永久倾斜）
- **坑 5**：必须有 `<p:bldLst><p:bldP spid="N" grpId="0"/></p:bldLst>`（PowerPoint 自身生成的文件必有）
- 转场：`mc:AlternateContent → p:transition spd="med" p14:dur="450" → p:fade`
- 每个 slide XML 写完必须过一遍 **XML 合法性校验**；语义不确定就去比对 PowerPoint 自身生成的结构，不要凭记忆写

**5. 持续动效（canvas / WebGL / 图表）**：优先做成**无限循环 GIF**（放映自动播放、无需插件与额外 XML）；
要无缝循环就把动画改造成严格周期函数，用 rAF 手动步进逐帧采样（采样总时长＝动画周期）；
用 MP4 必须额外写 autoplay + `repeatCount="indefinite"`，否则只能点击播放；
图表若在网页里只是"加载时动一次"，PPT 里保持静态终态即可，**不要循环重播**。

**6. 交付前自检（必须跑并把结果贴出）**：逐页核对 —— 效果数＝图层数、延迟值正确且单调、
每个效果含 5 个相对帧 + 1 个 `#ppt_y` 末帧、无 `fltVal` 残留、自动组＝2 层嵌套、`bldP` 数＝效果数、
`animRot` 数＝效果数、转场存在且时长正确、GIF 字节与原文件一致、媒体文件数、全部 XML 合法。
**有任何一项不满足，先修好再交付。**

**7. 交付与验收**：文件被占用（EBUSY，通常用户正开着 PowerPoint）→ 自动改存 `_v2` 并在回复中说明，**不要静默失败**；
回复必须写清怎么验收（F5 放映；「动画 → 动画窗格」看延迟）以及哪些点受 PowerPoint 机制限制无法 100% 一致
（例：转场与入场是"先后"而非"同时"；淡入透明度曲线在 PPT 里是线性的）。

**8. 协作方式**：一次只改一件事，说明"根因 → 修法 → 验证结果"；当用户描述与 HTML 实际不符时**先给证据**
（例："CSS 里只有 1 个 @keyframes，没有 bounce"），不要顺着猜测改；每次返工都给可验证证据（XML 片段、校验表格）。

---
---

# 四、通用规则

## D1. 四个检查点（**必须停下等用户**，可直接照抄问法）
| # | 时机 | 问法 |
|---|---|---|
| **0** | 阶段 A 之后 | "配图走 **A. AI 生图**（要账号+实名+开通+约 0.3 元/张）还是 **B. 程序化图形/SVG**（零成本）？我建议…" |
| **①** | 第一节动笔前 | 结构化 question-form：标题 / 目的 / 分几部分 / 受众场合 / 风格倾向 / 素材原文 / 支撑素材 / 必须保留原话 / 禁止内容 / 事实红线 |
| **②** | 第二、三节做完首页演示后 | "5 个方向**放在同一个 HTML 文件**里（每张带风格名标签），选哪个？（可自定义）" |
| **③** | 第十一节动手前 | "要不要转 PPTX？**A 保留动画 / B 静态稳 / C 先不转**" |

> 除这四点外**不要为了"确认一下"反复打断**；需要决断的自己定，并在报告里写明做了哪些默认选择。

## D2. 验收清单（每步都要给证据）
- **图片/图表真的渲染**：无头探针查 `<img>` 是否被 `onerror` 删掉、`naturalWidth`、ECharts 实例是否存在、**canvas 非空像素数 > 0**
- **动效真的在动**：优先给**确定性钩子**（手动驱动一帧后场景状态是否变化、`rendering` 是否随翻页切换）；
  无头环境 rAF 常被节流，**"肉眼看到在动"请用户在真机确认**
- **布局**：每页 `scrollHeight == clientHeight`；内容不越安全区；文字不压图片/图表
- **探针文件必须放项目根目录**（放子目录会让 `assets/` 相对路径失效，`<img>` 会被全部删掉）
- **断网检查**：本地库与本地图片都在同目录时，断网仍能跑
- **打印**：`@page{size:1280px 720px;margin:0}` + 逐页分页；3D 背景隐藏、图表保留
- **交付物真的能打开**：每个产出都打印了**绝对路径**并调过 `present`（用户在界面上能直接点开），**不是只写文件名**

## D3. 硬规则
1. **幂等**：先检查再安装；判定以关键文件/命令输出为准，不以目录为准
2. **需用户本人操作的**（**首次**在专属自动化浏览器里登录火山、`auth apikey` 绑 Key、付费、删资源）**必须一次列全并等待**；
   其中**闸门①登录**与**闸门③开通**要**先走自动化**（见 B3：`scripts\volc-0manual-login.ps1` 与 `scripts\cdp\*.mjs`），**自动化失败才回退**给用户，不要一上来就把活推给人；
   **严禁**代替用户加 `--yes`、`set ARKCLI_ALLOW_HEADLESS_ACTIVATION=1`、`ARKCLI_ALLOW_HEADLESS_DELETE=1`
3. **不编造**：不虚构版本号、模型名、路径、价格、开通状态、数据；查不到写"未核实"，失败贴**原始报错**
4. **不打印密钥**：API Key / token / secret 只输出掩码
5. **平台假设**：Windows 优先 `cmd /c` 与 `.cmd` 垫片；不要假设有 bash
6. **浏览器路径不写死**：按 A3 的探测顺序取第一个存在的（都没有就停下报告）
7. **位置：命令用相对、报告用绝对**：执行命令时用"当前工作目录/项目根目录"与 `assets/`、`build/` 相对表述即可；
   但只要**产出文件给用户看**，就必须① 打印**绝对路径**、② 调 `present` 登记、③ 说明打开方式（见 §0.5）。
   绝对路径**一律取自工具的真实输出**，不许编造没核实过的路径
8. **只改该改的**：改动前备份到 `assets/_backup/`；不删除或覆盖用户原始文件
9. **每阶段停下等确认**（阶段 A 的准备动作除外）
10. **权限预设先行**：开工第一件事按 **A0** 确认权限是「完全访问」；不是就先请用户用 `/permission` 切换，
    用户不切则**改走【七B】**（零工作区外写入）
11. **禁止审批死循环**：同一条命令被拒/失败**不得原样重试**，同一操作最多重试 1 次；
    连续 2 次被拒、或同一错误出现 ≥3 次 → **立刻停下**，贴原始报错并说明"需要你放宽权限／需要你本人操作"，等答复

## D4. 失败速查
| 现象 | 真因 | 对策 |
|---|---|---|
| 敲 `npm`/`npx`/`arkcli` 无任何输出 | PowerShell 拦了 `.ps1` 垫片 | 一律加 `.cmd`；**静默无输出＝失败** |
| skills 目录空 / 只有目录没文件 | `skills add` 的 2.2GB clone 超时 | 以 `SKILL.md` 判定；删残留目录；**A 超时 120s 即转 B** |
| `raw.githubusercontent.com` 解析失败 | jsdelivr 301 跳到被墙域名 | 用 A2 的双镜像命令（jsdelivr → api.github.com） |
| `Invoke-WebRequest`/`curl` 报连接关闭 / `http=000` | Windows 上二者可能整体不可用 | 下载全走 Node `fetch` |
| 从项目根 `require.resolve` 报全部缺失，但明明装过 | 包装在子目录（如 `_ppt-build\node_modules`） | 按 A3"根 + 子目录一起查"，缺的补到根上 |
| arkcli 报 `create staging directory ... Access is denied` | 沙箱只允许写工作目录 | 放宽会话文件权限（最好开工前一次性放宽） |
| 设备码授权后 `Successfully logged in!` 但 `auth status` 仍 `logged_in:false` | 那句是 `ve` 的 | 以 `auth status --transform 'logged_in'` 为准；重跑 `scripts\volc-0manual-login.ps1` |
| **`state 参数不匹配,可能存在安全风险 (CSRF)`** | 把**非本次**的授权码喂给了 Phase 2 —— 典型是取码脚本失败后读了**剪贴板里的旧码** | 重跑 Phase 1 拿**新的** `authorize_url`；确保 `authorize.mjs --state <本次state>`；**不要用剪贴板里的旧码**（`.ps1` 已强制校验 state） |
| **`authorize.mjs` 不打印 `CODE:` / 卡在某一步** | 专属浏览器没起来，或授权页结构变了 | 先 `check-env.ps1` 看 CDP 是否在线；再看脚本落的截图（`%TEMP%\volc-cdp\authorize-step*.png`）确认停在哪个页面 |
| **登录后 `logged_in: true` 但可能没真的刷新** | `logged_in` 会被上一轮还没过期的会话顶成 `true`（**假阳性**） | 对比 `control_plane_auth.sts_expires_at_ms` 是否变化；验证时最好先 `auth logout` 再跑，排除旧会话 |
| `API Key is required` | 套餐 profile 的 `available_api_keys` 为空 | 用户在自己终端跑 `arkcli auth apikey` |
| `platform data plane requires an endpoint id (ep-...)` | 按量通道不认模型名 | 先 `+deploy` 拿 `ep-xxx` |
| `model_activation_required` | 模型未开通，非交互硬拒 | 把控制台开通链接交回用户；**不许 `--yes`** |
| `image area must be at most/least ... pixels` | `--size` 超该模型像素区间 | 按 `supported_params` 重定（pro→2560×1440；lite→3072×1728） |
| 出图带水印 | 没传 `--watermark`（服务端默认 true） | 显式 `--watermark=false` |
| 刚 `start` 完出图报 endpoint closed | 控制面 Running 但数据面未就绪 | 退避重试（25s × 4–5 次），**不要换模型/重开** |
| `usage balance` 报 `required flag(s) "type" not set` | `--type` 是必填 | `--type plan` / `--type free-quota --modality ComputerVision` / `--type media-asset` |
| ECharts 图表空白 | 容器 0 尺寸 或 翻页前就 init | **第四节预留确定宽高容器**；进入本页时才 init + resize |
| 探针里 `<img>` 全被删 | 探针 HTML 放在子目录 | **探针放项目根目录** |
| 打包后 docx/pptx 打不开 | zip 条目名写成了反斜杠 | 用 `ZipArchive` 手工写条目并统一转 `/` |
| 批量文本替换把文档撑成两倍 | 正则替换串里的 `$_` 在 .NET 里表示"整个输入串" | 改用"先取匹配、再字面 `Replace`" |
| PPTX 里卡片是歪的 | 入场动画覆盖了元素静态 transform | 按**动画终态**（无变换）截取图层（坑 2） |
| PPT 里元素几乎同时出现 | `p:cond delay` 写成了增量 | 改成**相对组起点的绝对时间**（坑 3） |
| PPT 里元素跑到页面顶部 | 位移写成绝对 `fltVal` | 用相对公式 `#ppt_y-0.0278` → `#ppt_y`（坑 4） |
| **一直弹"是否允许"／命令报 `Access is denied`、`EPERM`** | **会话权限是 workspace-write，而该操作要写工作区外**（arkcli 暂存 `%USERPROFILE%\.arkcli*`、装 skill、npm 缓存） | **开工前先让用户 `/permission` 切「完全访问」（见 A0）**；用户不切就改走【七B】；**不要原样重试** |
| **感觉"卡死"、一直卡在权限确认上** | 被拒 → 重试 → 再被拒 的循环 | 同一条命令最多重试 1 次；连续 2 次被拒**立即停下报告**（见 A0 / D3-11） |
| 用户说"找不到文件 / 没告诉我文件在哪" | 只报了文件名或相对路径，没 `present` 登记 | 按 §0.5 三件套：**绝对路径 + `present` + 打开方式** |
| **探针副本放子目录后，页面里的相对依赖静默 404** | 探针 HTML 与演示稿不同目录（如 `_verify/`），`<script src="echarts.min.js">` 解析失败 → **悄悄落到 CDN 回退，测的就不是本地路径了** | **探针副本必须与演示稿同目录**（或把依赖改成绝对 `file://` 路径）；并断言"本地库未触发 onerror" |
| **用 `--dump-dom` 读动效状态，永远读到起始态** | dump-dom **不产生渲染帧**，CSS 动画与 `requestAnimationFrame` 都不推进 | 动效/动画**必须用截图差分**验证（同一时刻点两次截图比对）；dump-dom 只用来读结构、计数、报错 |
| **动画没跑就整页透明（致命）** | 入场动画用了 `animation-fill-mode:both` → 动画未启动时元素停在 `opacity:0` | **不要用 `both`**：`.slide.on` 不填、错峰用 `backwards`；再加一个 1.4s 安全网摘掉动画类，保证任何情况下都回到"终态可见" |
| **跨进程截图比对出现 ±2px 整体位移** | 入场动画正处于不同相位被拍下（`--virtual-time-budget` **不推进 CSS 动画**，相位取决于真实耗时） | 比较"动效是否在动/是否已停"时，先注入 `*{animation:none!important;transition:none!important}`；并做位移搜索确认差异来源 |
| **`three` 新版没有浏览器直挂构建** | `three@0.186` 只有 `three.module.js`(ESM) 与 `three.cjs`，**没有 UMD/IIFE**；ESM 在 `file://` 下被 CORS 拦死 → 双击打开必然失效；本机也无 esbuild/rollup 可就地打包 | 【九】改走**canvas 2D 手绘线框**（【C】默认项已明确允许"Three.js 或 canvas"）；坚持 Three.js 则必须用 http 服务打开或装带 UMD 的旧版 |
| **ECharts 在 `display:none` 的页里不渲染** | 容器尺寸为 0 | 用**显式尺寸**建图：`echarts.init(el, null, {renderer:'canvas', width:880, height:400})`；这样"没翻到该页直接打印/导 PDF"也有图（否则打印出来是空的） |
| **PowerShell 往 `node -e` 传参会吞掉内层双引号** | `node -e "…'x'…"` 里的字符串字面量被破坏 → `SyntaxError` | **改成写脚本文件再 `node file.cjs`**（本次 `_diag/stageA.cjs` 就是这么解决的） |
| **无头 Chromium 在受限沙箱下必崩** | mojo IPC 走**命名管道**被拦：`platform_channel.cc:183 Check failed: 拒绝访问 (0x5)`；crashpad `OpenProcess` 也被拒 | 只有放宽到"完全访问"才能跑；或改走**不依赖浏览器**的路线（但 CSS 布局/canvas 类作品换不了，属环境限制） |
| **拼图/切图只有第一列有内容** | 切块尺寸取了 `1280/3 = 426.67` 这种**小数**，写进类型化数组被**静默丢弃** | 切块尺寸一律 `Math.floor` 取整；并加断言"**每一块都必须有墨迹**"，否则报错 —— 这类静默失败必须靠断言兜住 |
| **逐页截图的画面与用户所见不一致** | 截图探针直接切 `.on` class，绕过了应用自身的翻页逻辑 → `PAGES[n].init()` 没被调用，该页的常驻动效（线框球/图表）根本不出现 | 探针要**走真实翻页路径**（模拟方向键/调用同一入口），不要自己造状态 |

## D5. 收尾报告格式（缺一项都算没做完）
| 项目 | 内容 |
|---|---|
| 阶段 A | 就绪报告（**新用组件自检 5 项** / skill / 工具链 / 目录 / 浏览器路径） |
| 检查点 0 | 用户选择 A 还是 B；若 B 写明"未使用 AI 生图" |
| 阶段 B（走 A 时） | 通道、模型、endpoint id、试片结果、单价 |
| 阶段 C | 各节产出与文件路径；三个检查点的用户选择；**【六】逐页素材判断清单（即使结论是跳过也必须附）** |
| 参数对照表 | 页码｜用途｜模型/技法｜尺寸｜文件｜嵌入坐标｜单价 |
| 验收结果 | 渲染/动效/布局/断网/打印 逐项 ✅❌ |
| **交付物清单** | 每个产出的**绝对路径** + 是否已 `present` 登记（用户能否直接点开） |
| 权限预设 | 用户是否已切「完全访问」；未切则写明"已改走【七B】，全程零弹窗" |
| 已知限制 | 含"agent 不能看图，画面好坏需你亲自过目" |
| 回退方式 | 备份位置 + 一键移除步骤 |
| 计费资源 | 新建 endpoint id + 停/删命令（**不要替用户执行删除**） |

## D6. 人工执行清单（无工具环境时给用户照抄）
```
node -v && npm.cmd -v && npx.cmd -v
# 两个 skill（通道 B：单文件直链，最稳）
node -e "const fs=require('fs'),p=require('path');(async()=>{for(const s of ['creative-director','emilkowalski-motion']){const d=p.join(process.env.USERPROFILE,'.agents','skills',s);fs.mkdirSync(d,{recursive:true});const us=[['https://cdn.jsdelivr.net/gh/nexu-io/open-design@main/skills/'+s+'/SKILL.md',{}],['https://api.github.com/repos/nexu-io/open-design/contents/skills/'+s+'/SKILL.md?ref=main',{'user-agent':'skills-fetch','accept':'application/vnd.github.raw'}]];let ok=false;for(const [u,h] of us){try{const r=await fetch(u,{headers:h});if(!r.ok)continue;const t=await r.text();if(t.length<200||!t.includes('name:'))continue;fs.writeFileSync(p.join(d,'SKILL.md'),t);console.log('OK',s,t.length);ok=true;break;}catch(e){}}if(!ok)console.log('FAILED',s);}})()"
npm.cmd i pptxgenjs jszip pngjs gifenc fast-xml-parser echarts three gsap lottie-web
mkdir assets assets\_backup build
# 仅在"要 AI 生图"时需要（登录已 0 手动：下面这条自己完成 Phase1 → 浏览器点授权 → Phase2）
powershell -NoProfile -ExecutionPolicy Bypass -File "<插件目录>\scripts\check-env.ps1"        # 先体检：缺什么自动装
powershell -NoProfile -ExecutionPolicy Bypass -File "<插件目录>\scripts\volc-0manual-login.ps1"
arkcli.cmd auth status
arkcli.cmd auth apikey
arkcli.cmd resources list --modality image
arkcli.cmd pricing models --model doubao-seedream-5-0-pro --format json
arkcli.cmd infer endpoint list
```
