# Changelog

版本号写在 `package.json` 与 `lib/client.js` 的 `PLUGIN_VERSION` 两处，校验器会断言两者一致。

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
