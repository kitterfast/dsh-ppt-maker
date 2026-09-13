/**
 * Evidence dump for the automation browser: tabs, and which 火山-related cookie
 * domains exist (names only — never cookie values). This is how the flow proves
 * "the dedicated browser is really logged in".
 *
 *   node inspect.mjs
 *
 * @module scripts/cdp/inspect
 */

import { connect, listTargets, version } from './lib.mjs'

const info = await version()
console.log(`browser: ${info.Browser}`)

const targets = await listTargets()
console.log(`--- tabs (${targets.length}) ---`)
for (const target of targets) {
  if (target.type === 'page') console.log(`[page] ${target.title}  <${target.url}>`)
}

const client = connect(info.webSocketDebuggerUrl)
await client.ready
const { cookies } = await client.call('Storage.getCookies')

const hosts = new Map()
for (const cookie of cookies) hosts.set(cookie.domain, (hosts.get(cookie.domain) ?? 0) + 1)

console.log(`--- cookies total: ${cookies.length} ---`)
const relevant = [...hosts.entries()].filter(([domain]) => /volc|ark|doubao|bytedance/i.test(domain))
if (relevant.length === 0) {
  console.log('火山相关 cookie: 0  ->  这个浏览器还没有登录态')
} else {
  for (const [domain, count] of relevant) console.log(`  ${count}\t${domain}`)
  const names = cookies
    .filter((cookie) => /volc|ark|doubao/i.test(cookie.domain))
    .map((cookie) => `${cookie.domain} :: ${cookie.name}`)
  console.log('--- 关键 cookie 名 ---')
  console.log(names.join('\n'))
}

client.close()
