/**
 * Open a URL in the automation browser, wait, then print title/url/text and a
 * screenshot path. Read-only: it navigates and reads, it never clicks.
 *
 *   node goto.mjs "https://console.volcengine.com/ark" [name.png]
 *
 * The screenshot path is printed so the caller can attach or inspect it.
 *
 * @module scripts/cdp/goto
 */

import { attachPage, connect, pageInfo, screenshot, sleep, version } from './lib.mjs'

const url = process.argv[2]
const name = process.argv[3] ?? 'goto.png'
if (!url) {
  console.error('usage: node goto.mjs <url> [screenshot.png]')
  process.exit(2)
}

const info = await version()
console.log(`browser: ${info.Browser}`)

const client = connect(info.webSocketDebuggerUrl)
await client.ready
const { sessionId } = await attachPage(client)

await client.call('Page.navigate', { url }, sessionId)
await sleep(Number(process.env.VOLC_GOTO_WAIT_MS ?? 8000))

const page = await pageInfo(client, sessionId)
console.log(`url:   ${page.url}`)
console.log(`title: ${page.title}`)
console.log('--- text ---')
console.log(page.text.slice(0, 1200))
console.log('screenshot: ' + (await screenshot(client, sessionId, name)))

client.close()
