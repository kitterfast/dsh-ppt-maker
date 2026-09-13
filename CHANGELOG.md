# Changelog

版本号写在 `package.json` 与 `lib/client.js` 的 `PLUGIN_VERSION` 两处，校验器会断言两者一致。

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
