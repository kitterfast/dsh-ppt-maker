/**
 * Click one labelled element on the page currently open in the automation
 * browser, using real mouse events. Intended for console work such as
 * 「开通」/「选择使用」/「复制授权码」.
 *
 *   node click.mjs "开通" ["开通管理"] ["确定"]
 *
 * Every label is tried in order until one is found; it prints which one it
 * clicked, then re-reads the page so the caller can see the effect.
 *
 * @module scripts/cdp/click
 */

import { attachPage, clickExact, connect, pageInfo, screenshot, sleep, version } from './lib.mjs'

const labels = process.argv.slice(2)
if (labels.length === 0) {
  console.error('usage: node click.mjs "<label>" ["<label>" ...]')
  process.exit(2)
}

const info = await version()
const client = connect(info.webSocketDebuggerUrl)
await client.ready
const { sessionId } = await attachPage(client)

const before = await pageInfo(client, sessionId)
console.log(`before: ${before.url}  |  ${before.title}`)

const clicked = await clickExact(client, sessionId, labels)
if (clicked === undefined) {
  console.log(`没有找到这些标签中的任何一个: ${labels.join(' / ')}`)
  console.log('screenshot: ' + (await screenshot(client, sessionId, 'click-not-found.png')))
  client.close()
  process.exit(3)
}

console.log(`clicked: ${clicked}`)
await sleep(Number(process.env.VOLC_CLICK_WAIT_MS ?? 5000))

const after = await pageInfo(client, sessionId)
console.log(`after:  ${after.url}  |  ${after.title}`)
console.log('--- text ---')
console.log(after.text.slice(0, 1200))
console.log('screenshot: ' + (await screenshot(client, sessionId, 'click-after.png')))

client.close()
