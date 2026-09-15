/**
 * Turn the seal report from "push failed" into "seal complete", with the remote
 * evidence. Every replacement asserts its match count.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'C:/Users/ASUS/Desktop/格式转化修复/_seal-20260915-120632/封版报告.md';
let src = readFileSync(FILE, 'utf8');
let ok = true;

function sub(name, oldText, newText) {
  const n = src.split(oldText).length - 1;
  if (n !== 1) { console.error(`FAIL [${name}]: found ${n}`); ok = false; return; }
  src = src.replace(oldText, newText);
  console.log(`  ok ${name}`);
}

sub('header',
`**封版状态：未完成 —— 本地已提交并打 tag，但 push 未成功（网络不可达）。**`,
`**封版状态：完成 —— 本地提交并打 tag，已成功 push 到 origin；远端 \`refs/heads/main\` 与
\`refs/tags/v2.4.0\` 已实测与本地一致（见第九节）。**`);

sub('table-push',
`| push | **失败**，\`origin\` 未收到本 commit 与 tag |`,
`| push | **成功**（第 2 次重试），\`main\` 与 \`v2.4.0\` 均已在远端 |`);

sub('table-tag',
`| tag | \`v2.4.0\`，tag 对象 \`47ad22e5fcfde10befa8b7b7b7db36a94f0a9682\`（**仅本地**） |`,
`| tag | \`v2.4.0\`，tag 对象 \`47ad22e5fcfde10befa8b7b7b7db36a94f0a9682\`（已推送） |`);

sub('unverified-list',
`1. **push 未完成** —— 本地 commit + tag 已建，远端未收到。\`github.com:443\` 不可达。
2. **AI 两稿的视觉保真未验证** —— 它们没有基准稿。本轮只证明：能渲染、层数 62/71 与修复前一致、
   无 0 层、退出码 0。体积变化（110 MB→65 MB）来自真透明图层，**未做像素或播放验收**。
3. **AI 两稿未跑 WPS**。
4. **"完全一致"未达到** —— WPS 稳定态仍有 1.341% 像素差 >24；整页合成 mean 1.40/255、
   bad 0.67%。残余来源已定位为画布逐帧渲染与亚像素抗锯齿，**未消除**。
5. **第 3 页缺角** —— 用户最初提出的该现象本轮**未单独复核**；本轮只做了整页比对。
6. **只抓了第 1 页** —— 抓帧工具按设计"从放映开始、不导航"，因此 WPS 实跑只覆盖第 1 页的
   入场与稳定态，第 2–11 页的播放**未验**。
7. **构建非字节可复现**（GIF 录制自活动画），因此产物 SHA256 每次构建都会变。`,
`1. **AI 两稿的视觉保真未验证** —— 它们没有基准稿。本轮只证明：能渲染、层数 62/71 与修复前一致、
   无 0 层、退出码 0。体积变化（110 MB→65 MB）来自真透明图层，**未做像素或播放验收**。
2. **AI 两稿未跑 WPS**。
3. **"完全一致"未达到** —— WPS 稳定态仍有 1.341% 像素差 >24；整页合成 mean 1.40/255、
   bad 0.67%。残余来源已定位为画布逐帧渲染与亚像素抗锯齿，**未消除**。
4. **第 3 页缺角** —— 用户最初提出的该现象本轮**未单独复核**；本轮只做了整页比对。
5. **只抓了第 1 页** —— 抓帧工具按设计"从放映开始、不导航"，因此 WPS 实跑只覆盖第 1 页的
   入场与稳定态，第 2–11 页的播放**未验**。
6. **构建非字节可复现**（GIF 录制自活动画），因此产物 SHA256 每次构建都会变。
7. **SSH 通道不可用** —— \`github.com:22\` 与 \`ssh.github.com:443\` 可达，但本机 \`~/.ssh\` 下无密钥，
   \`ssh -T git@github.com\` 返回 \`Permission denied (publickey)\`。本次推送走的是 HTTPS
   （\`credential.helper=manager\`），且 \`github.com:443\` 存在间歇性阻断：同一命令第 1 次
   exit 128、第 2 次成功。**后续推送可能仍需重试。**`);

sub('rollback-c',
`**C. 若网络恢复，继续封版**

\`\`\`powershell
git -C 'C:\\Users\\ASUS\\Desktop\\班委竞选\\dsh-fast-ppt' push origin main
git -C 'C:\\Users\\ASUS\\Desktop\\班委竞选\\dsh-fast-ppt' push origin v2.4.0
\`\`\``,
`**C. 远端已推送**（2026-09-15，见第九节）。如需把远端回退到本次封版之前：

\`\`\`powershell
git -C 'C:\\Users\\ASUS\\Desktop\\班委竞选\\dsh-fast-ppt' push --delete origin v2.4.0
git -C 'C:\\Users\\ASUS\\Desktop\\班委竞选\\dsh-fast-ppt' push --force origin d435775:main
\`\`\``);

sub('section9',
`---

## 附：阶段日志索引`,
`---

## 九、push 结果（本次补记）

\`\`\`
TCP 实测   github.com:443        reachable = False     <- 被阻断
           github.com:22         reachable = True
           ssh.github.com:443    reachable = True
           codeload.github.com:443 reachable = True
           www.baidu.com:443     reachable = True      <- 整机外网正常
credential.helper = manager (system)
ssh -T git@github.com -> Permission denied (publickey)   <- 无密钥，SSH 通道不可用

git push origin main     第1次 exit 128 (Failed to connect port 443)
                         第2次 exit 0   d435775..8b03a26  main -> main
git push origin v2.4.0   第1次 exit 0   * [new tag] v2.4.0 -> v2.4.0
\`\`\`

远端引用核对（\`git ls-remote --heads --tags origin\`）：

\`\`\`
8b03a26890d144038fe1066f8a0b759470404868   refs/heads/main
47ad22e5fcfde10befa8b7b7b7db36a94f0a9682   refs/tags/v2.4.0
8b03a26890d144038fe1066f8a0b759470404868   refs/tags/v2.4.0^{}
\`\`\`

与本地逐项一致：

\`\`\`
local  main   = 8b03a26890d144038fe1066f8a0b759470404868
remote main   = 8b03a26890d144038fe1066f8a0b759470404868
local  v2.4.0 = 47ad22e5fcfde10befa8b7b7b7db36a94f0a9682
remote v2.4.0 = 47ad22e5fcfde10befa8b7b7b7db36a94f0a9682
git status -sb -> ## main...origin/main   （无 ahead/behind，工作区干净）
\`\`\`

---

## 附：阶段日志索引`);

if (ok) { writeFileSync(FILE, src, 'utf8'); console.log(`report updated, ${src.length} chars`); }
else { console.error('Aborted: some replacements did not match.'); process.exit(1); }
