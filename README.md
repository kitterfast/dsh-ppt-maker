# dsh-ppt-maker

**DSH（DeepSeek Harness）Web 插件：在输入框左下角的「+」菜单里加一个「PPT 制作」入口，一次点击就把整套 PPT 全流程提示词跑起来。**

- 只加**一个菜单项**、只发**一条**消息 —— 不改会话权限、不开宿主接口、不往聊天里灌文档
- 提示词**随插件自带**（58 KB 自包含文档），工作目录是空的也能跑
- 全流程**只需要一次确认**（就是下面那条 `/permission`），之后不再逐条打断
- 两套自动化校验 + GitHub Actions，改动不留暗坑

---

## 它是什么

这个插件本身不做 PPT。它是一个**触发器**：把一份「自包含的 PPT 全流程编排提示词」交给当前会话里的 agent，让 agent 按文档走完
准备环境 → 问需求 → 出 5 个风格方向 → 初稿 → 程序化图形 / AI 生图 → 图表动效 → 导出 PPTX。

那份文档是插件的全部载荷：[`prompts/PPT全流程_一键编排提示词.md`](prompts/PPT全流程_一键编排提示词.md)。
**想改成自己的工作流，直接改这一个文件**（改完跑 `npm run verify` 会检查它还在、没被截断）。

## 前置要求

| | |
|---|---|
| DSH | 桌面端或 web profile（需要 `@deepseek-ai/dsh-client-ui-commands` 与 `-ui-conversation`） |
| Node | ≥ 20（只在开发/校验时需要，插件运行时不依赖 npm 包） |

## 安装

**仓库地址（可以直接交给 agent）**：`https://github.com/kitterfast/dsh-ppt-maker`
**DSH / pnpm 规格**：`github:kitterfast/dsh-ppt-maker`

### 方式 A：一句话给 agent（推荐）

把下面这句**原样**交给你的 DSH agent（连仓库地址一起给，它就能自己装）：

> 让Agent执行命令：「帮我装 DSH 插件 github:kitterfast/dsh-ppt-maker（profile 用 web），装完重启桌面端」，安装插件后在对话框左下方的加号处可以找到「PPT 制作」
> 插件地址：https://github.com/kitterfast/dsh-ppt-maker · v1.4.2

**装完就什么都不用管了。** 第一次点「PPT 制作 → A. 使用 AI 生图」时，插件投送的第一条消息里就有第 2 步硬指令：
让 agent 自己跑 `scripts\check-env.ps1`（缺 arkcli／缺插件／缺浏览器／没登录，它都自己补）。**只有**在"专属浏览器从未登录过火山"这一种情况下，才会需要你本人用手机验证码或扫码登录**一次**。

或者它自己执行：

```powershell
dsh plugin --profile web add github:kitterfast/dsh-ppt-maker          # 跟随 main（永远最新）
dsh plugin --profile web add github:kitterfast/dsh-ppt-maker#v1.4.2   # 固定 v1.4.2（可复现）
```

`dsh plugin add` 会把参数转发给 profile 目录下的 pnpm。仓库里已经声明了 `dsh.bundle.patch` 与 `dsh.client`，
所以**装上即挂载**，不需要手改 `bundles`。

### 方式 B：手动挂载（不想用 pnpm / 想改源码时）

```powershell
# 1) 克隆到固定位置
git clone https://github.com/kitterfast/dsh-ppt-maker "$env:USERPROFILE\.dsh\local-plugins\dsh-ppt-maker"

# 2) 挂进 web profile：编辑 "$env:USERPROFILE\.dsh\profiles\web\package.json"
#    a. dependencies 里加一行：
#       "dsh-ppt-maker": "link:../../local-plugins/dsh-ppt-maker"
#    b. dsh.profile.bundles 数组末尾加一行：
#       "dsh-ppt-maker"

# 3) 建目录联接，让 profile 能解析到这个包
New-Item -ItemType Junction `
  -Path   "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-ppt-maker" `
  -Target "$env:USERPROFILE\.dsh\local-plugins\dsh-ppt-maker"

# 4) 重启 DeepSeek Harness Desktop
```

装好后校验一下（可选，但很快）：

```powershell
node "$env:USERPROFILE\.dsh\local-plugins\dsh-ppt-maker\_verify\verify-package.mjs"
```

## 使用

1. 点输入框左下角 **`+`** → 菜单里出现 **`PPT制作`**（敲 `/` 也能看到）
2. 弹出第二步，选一个：
   - **A. 使用 AI 生图** —— 走【七】Seedream（需火山方舟账号/授权，约 0.3 元/张）
   - **B. 不使用 AI 生图** —— 走【七B】程序化图形/SVG（零成本、断网可用）
3. 插件往当前会话发**一条** kickoff 消息：让 agent 读文档、并**替你预答检查点 0**
4. 之后只剩 **检查点 ①（要需求）/ ②（选风格）/ ③（转不转 PPTX）** 会停下等你选 —— 这三个是文档本身设计的打断点

## 全流程只确认一次

跑完整流程要用到无头浏览器（做渲染验收）和写工作区外的临时目录（arkcli 暂存、npm 缓存），
在受限沙箱下这些操作**每一步都会弹权限确认**。所以 kickoff 的**第 1 条**就是：

```
/permission danger-full-access
```

你发这一句，之后**全程不再逐条打断**。不想放开也行 —— agent 会按文档 A0 改走【七B】，那条路径零工作区外写入。

> 插件**不会**替你改会话权限：这是一次安全边界的决定，只能由你按下。

## HTML → PPTX：自带的确定性管线（v2.0.0 新增）

**为什么有它**：2026-09-14 的真实跑批里，转换是"agent 每次现场写一个转换器"。结果是
**1 小时 44 分、48 个一次性脚本**，交出来的 PPTX 一页动画都没有、把浏览器翻页按钮烤进了每一页、文字错版。

现在这件事是**插件自带的代码**（`scripts/deck/`），不是每次重新发明：

```powershell
node scripts\deck\deck-render.mjs build\deck.config.json    # ① 一次无头浏览器 + 真 alpha 图层 + 增量
node scripts\deck\deck-to-pptx.mjs build\deck.config.json   # ② 按名字定位形状 id + 写原生时间轴
node scripts\deck\deck-verify.mjs build\deck.config.json    # ③ 结构 + PowerPoint 真机 + 逐页像素
```

20 页实测：渲染 **41 秒**、生成 **3 秒**、验收 **~12 秒**；三道闸门全过
（逐页像素 mean 0.02–0.96 / 255，19 页 0 个坏像素）。详见
[`scripts/deck/README.md`](scripts/deck/README.md)。

代价说清楚：**版式与文字一起栅格化**（跨引擎搬运坐标必然错版，这是上一轮的病根），
所以 PPT 里的文字不能直接改；文字已写进**备注页**与**图片替换文字**。
**无限循环动效**（CSS `infinite`）无法用 PowerPoint 时间轴表达，管线会**检测并警告**具体是哪几页哪几层。

## 目录结构

```
.
├─ package.json                 dsh.bundle.patch + dsh.client{inject,platform} + npm scripts
├─ cordis.patch.yml             插入一行 id: ppt-maker / name: dsh-ppt-maker
├─ lib/index.js                 node 半边：空功能 + 启动自检自带提示词是否在，写一行日志
├─ lib/client.js                客户端半边：菜单项 + 二级选择 + 发一条 kickoff
├─ prompts/PPT全流程_一键编排提示词.md   ← 插件的全部载荷（唯一来源，不要复制第二份）
├─ scripts/deck/                HTML→PPTX 确定性管线（渲染 / 生成 / 验收 + 工具）
├─ scripts/check-env.ps1        环境自检（Node / arkcli / CDP 浏览器 / 登录态）
├─ scripts/cdp/                 零依赖 CDP 客户端（0 手动登录用）
├─ docs/已删除的机制说明.md       设计边界与"为什么不做那些事"的留档
├─ _verify/verify-package.mjs    源完整性 / 可发布性 / 提示词载荷 / 安装一致性
├─ _verify/verify-client-bundle.mjs  客户端 bundle 的真实行为（含全部降级分支）
└─ .github/workflows/verify.yml  CI：Node 20 / 22 各跑一遍
```

## 开发

```powershell
npm run verify          # 两套校验一起跑（与 CI 完全一致）
npm run verify:package  # 只跑源完整性 / 打包元数据 / 安装一致性
npm run verify:client   # 只跑客户端行为
```

- 改 `lib/client.js` → DSH 里**刷新页面**即可（客户端 HMR 会重建 bundle）
- 改 `lib/index.js` 或 `prompts/` → 需要**重启** DSH
- 改了插件本体，记得同步到安装目录（`verify:package` 会比对并报出不一致的文件）

## 设计边界（有意不做）

| 不做 | 原因 |
|---|---|
| 不改会话权限 | 安全边界只能由用户按；插件最多提醒你发哪一句 |
| 不开宿主 HTTP 路由 | 插件不该在用户客户端上加未认证端点 |
| 不往聊天里塞提示词全文 | 一大坨字，而且会让文档版本管理失效（改成读文件） |
| 不发 composer 通知 | 消息发没发出去，看聊天框就知道 |

这些机制曾经实现过又被删除，精确 API 与取舍记在 [`docs/已删除的机制说明.md`](docs/已删除的机制说明.md)。

## License

MIT

---

## English

**dsh-ppt-maker** is a [DSH (DeepSeek Harness)](https://github.com/) web plugin that adds a `PPT 制作` entry to the composer's `+` menu.
Picking it sends **one** short kickoff message that hands the bundled, self-contained PPT orchestration prompt
(`prompts/PPT全流程_一键编排提示词.md`) to the current session, pre-answering the document's first checkpoint.

Design rules: no session-permission changes, no host routes, no dumping the document into the chat, no extra notices.
The whole run needs exactly **one** user confirmation — sending `/permission danger-full-access` once when the kickoff asks for it.

```powershell
dsh plugin --profile web add github:kitterfast/dsh-ppt-maker
# or manually: git clone https://github.com/kitterfast/dsh-ppt-maker "$env:USERPROFILE\.dsh\local-plugins\dsh-ppt-maker"
# then add "dsh-ppt-maker" to dsh.profile.bundles in %USERPROFILE%\.dsh\profiles\web\package.json and restart DSH.
npm run verify   # package + client behaviour checks (also runs in CI)
```

MIT licensed.
