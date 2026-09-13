/**
 * Drive the 火山 SSO authorize page to completion and print the base64 code.
 *
 * Two entry points:
 *   node authorize.mjs "<authorize_url>"     open the URL in a new tab, then drive it
 *   node authorize.mjs --current            drive whatever 火山 tab is already open
 *
 * The flow, as measured (2026-09-13):
 *   identity confirm  「您已经登录火山引擎，是否继续使用此账号」 -> 【继续登录】
 *   -> 「授权成功」 dialog with the code parked in a hidden textarea
 *   -> print CODE:<base64>
 *
 * Env: VOLC_CDP_HOST / VOLC_CDP_PORT / VOLC_SHOT_DIR (see lib.mjs).
 *
 * @module scripts/cdp/authorize
 */

import { attachPage, clickExact, codesIn, connect, newPage, pageInfo, screenshot, sleep, version } from './lib.mjs'

const CONTINUE = ['继续登录', '继续', '下一步', '确认', '确定', '同意', '同意并继续']
const CONSENT = ['授权', '同意授权', '确认授权', '允许', 'Authorize', 'Allow']
const FORBIDDEN = /切换|其他身份|退出|取消|拒绝|简体中文|English/

const argument = process.argv[2]
if (!argument) {
  console.error('usage: node authorize.mjs "<authorize_url>" | --current [--state <state>]')
  process.exit(2)
}

// The expected CSRF state from phase 1. When present, a code is only accepted
// if its decoded payload carries this exact state — that is what stops a stale
// code (e.g. one sitting in the clipboard) from being fed to phase 2.
const stateFlag = process.argv.indexOf('--state')
const expectedState = stateFlag > -1 ? process.argv[stateFlag + 1] : undefined
if (expectedState === undefined) console.log('warn: no --state given, accepting any authorization code')

const info = await version()
console.log(`browser: ${info.Browser}`)

const client = connect(info.webSocketDebuggerUrl)
await client.ready

const attached =
  argument === '--current' ? await attachPage(client) : await newPage(client, argument)
const sessionId = attached.sessionId

/** True when a base64 code belongs to this authorize request. */
function codeMatchesState(value) {
  if (expectedState === undefined) return true
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8')
    return decoded.includes(`state=${expectedState}`)
  } catch {
    return false
  }
}

/** Read hidden textarea/input values too: the code lives there, not in innerText. */
async function codeFromDom() {
  const result = await client.call(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify([...document.querySelectorAll('input,textarea')].map((el) => el.value))`,
      returnByValue: true,
    },
    sessionId,
  )
  const values = JSON.parse(result.result.value).filter((value) => /^[A-Za-z0-9+/=_-]{24,}$/.test(value))
  const matching = values.find(codeMatchesState)
  if (matching !== undefined) return matching

  const page = await pageInfo(client, sessionId)
  const fromUrl = /[?&]code=([^&\s]+)/.exec(page.url)
  if (fromUrl) {
    const candidate = decodeURIComponent(fromUrl[1])
    if (codeMatchesState(candidate)) return candidate
  }
  const candidates = codesIn(page.text)
  return candidates.find(codeMatchesState)
}

for (let step = 1; step <= 6; step++) {
  await sleep(step === 1 ? 8000 : 6000)
  const page = await pageInfo(client, sessionId)
  console.log(`\n--- step ${step} ---`)
  console.log(`url:   ${page.url}`)
  console.log(`title: ${page.title}`)
  console.log(page.text.slice(0, 400))
  console.log('screenshot: ' + (await screenshot(client, sessionId, `authorize-step${step}.png`)))

  const code = await codeFromDom()
  if (code !== undefined) {
    console.log('\n授权码已取得')
    console.log('CODE:' + code)
    client.close()
    process.exit(0)
  }

  // Consent first: on the success screen 继续登录 is gone, so order matters.
  const clicked = (await clickExact(client, sessionId, CONSENT)) ?? (await clickExact(client, sessionId, CONTINUE))
  if (clicked === undefined || FORBIDDEN.test(clicked)) {
    console.log('\n!! 没有可点的下一步，请人工看一眼截图')
    client.close()
    process.exit(3)
  }
  console.log(`-> 点击「${clicked}」`)
}

console.log('\n6 步之后仍未拿到授权码')
client.close()
process.exit(4)
