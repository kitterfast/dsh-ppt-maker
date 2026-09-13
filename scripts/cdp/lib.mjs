/**
 * Minimal CDP client for the 火山 automation browser.
 *
 * Zero dependencies on purpose: Node 22 ships a global `WebSocket`, so these
 * scripts run on any machine with Node >= 20 (Node 21+ has WebSocket; 20 does
 * not, so require >= 22). No `ws`, no `chrome-remote-interface`, no plugin.
 *
 * Endpoint and screenshot directory are environment-overridable:
 *   VOLC_CDP_HOST  (default 127.0.0.1)
 *   VOLC_CDP_PORT  (default 9222)
 *   VOLC_SHOT_DIR  (default <tmp>/volc-cdp)
 *
 * @module scripts/cdp/lib
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const HOST = process.env.VOLC_CDP_HOST ?? '127.0.0.1'
export const PORT = Number(process.env.VOLC_CDP_PORT ?? 9222)
export const HTTP_BASE = `http://${HOST}:${PORT}`

/** Where screenshots land (created on demand). */
export function shotDir() {
  const dir = process.env.VOLC_SHOT_DIR ?? join(tmpdir(), 'volc-cdp')
  mkdirSync(dir, { recursive: true })
  return dir
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** GET /json/version; throws a readable error when no browser answers. */
export async function version(timeoutMs = 1500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${HTTP_BASE}/json/version`, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    throw new Error(
      `no CDP endpoint at ${HTTP_BASE} (${error instanceof Error ? error.message : String(error)}); ` +
        'start the automation browser with scripts/start-volc-browser.ps1',
    )
  } finally {
    clearTimeout(timer)
  }
}

/** All targets, via /json/list. */
export async function listTargets() {
  const response = await fetch(`${HTTP_BASE}/json/list`)
  return await response.json()
}

/** Open a raw CDP connection and return a call() helper. */
export function connect(wsUrl, { timeoutMs = 30000 } = {}) {
  const socket = new WebSocket(wsUrl)
  let nextId = 0
  const pending = new Map()

  socket.addEventListener('message', (event) => {
    let message
    try {
      message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
    } catch {
      return
    }
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  })

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve())
    socket.addEventListener('error', () => reject(new Error(`websocket failed: ${wsUrl}`)))
  })

  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, (message) =>
        message.error ? reject(new Error(`${method}: ${JSON.stringify(message.error)}`)) : resolve(message.result),
      )
      socket.send(JSON.stringify({ id, sessionId, method, params }))
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`${method} timed out`))
        }
      }, timeoutMs)
    })

  return { ready, call, close: () => socket.close() }
}

/** Attach to an existing page target (prefers a 火山 tab). */
export async function attachPage(client, { prefer = /volcengine|doubao/ } = {}) {
  const targets = await listTargets()
  const pages = targets.filter((target) => target.type === 'page')
  const target = pages.find((page) => prefer.test(page.url)) ?? pages[0]
  if (!target) throw new Error('no page target in the automation browser')
  const { sessionId } = await client.call('Target.attachToTarget', { targetId: target.id, flatten: true })
  await client.call('Page.enable', {}, sessionId)
  return { target, sessionId }
}

/** Create a fresh tab and attach to it. */
export async function newPage(client, url = 'about:blank') {
  const { targetId } = await client.call('Target.createTarget', { url })
  const { sessionId } = await client.call('Target.attachToTarget', { targetId, flatten: true })
  await client.call('Page.enable', {}, sessionId)
  return { targetId, sessionId }
}

/** url / title / innerText of the attached page. */
export async function pageInfo(client, sessionId) {
  const result = await client.call(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify({ url: location.href, title: document.title, text: document.body ? document.body.innerText : '' })`,
      returnByValue: true,
    },
    sessionId,
  )
  return JSON.parse(result.result.value)
}

/** Screenshot the attached page into shotDir(); returns the absolute path. */
export async function screenshot(client, sessionId, name) {
  const shot = await client.call('Page.captureScreenshot', { format: 'png' }, sessionId)
  const file = join(shotDir(), name)
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  return file
}

/** Long token-ish strings on the page (the SSO code is base64). */
export function codesIn(text, minLength = 24) {
  return [...text.matchAll(new RegExp(`[A-Za-z0-9+/=_-]{${minLength},}`, 'g'))].map((match) => match[0])
}

/**
 * Click the first clickable leaf whose text matches one of `labels` exactly,
 * via real mouse events at the element centre (not element.click(), so the
 * page sees a genuine click). Returns the label it clicked, or undefined.
 */
export async function clickExact(client, sessionId, labels) {
  const located = await client.call(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const wanted = ${JSON.stringify(labels)}
        const nodes = [...document.querySelectorAll('button,a,span,div')].filter(
          (el) => el.children.length === 0 && el.innerText && wanted.includes(el.innerText.trim())
        )
        const el = nodes[0]
        if (!el) return 'not-found'
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return 'zero-size'
        return JSON.stringify({ label: el.innerText.trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) })
      })()`,
      returnByValue: true,
    },
    sessionId,
  )
  if (located.result.value === 'not-found' || located.result.value === 'zero-size') return undefined
  const hit = JSON.parse(located.result.value)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await client.call('Input.dispatchMouseEvent', { type, x: hit.x, y: hit.y, button: 'left', clickCount: 1 }, sessionId)
  }
  return hit.label
}
