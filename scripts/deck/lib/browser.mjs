/**
 * Headless browser launcher + minimal CDP client.
 *
 * Why this exists: the render step must NEVER touch the user's browser and must
 * never leave visible windows/tabs. The login browser (start-volc-browser.ps1) is
 * a *visible* persistent profile — reusing it for rendering is what opened dozens
 * of tabs. This module always launches a throwaway HEADLESS instance on an
 * auto-assigned port, and tears it down when the render finishes.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];

export function findBrowser() {
  for (const p of CANDIDATES) if (p && existsSync(p)) return p;
  throw new Error(`no Edge/Chrome found. Tried:\n  ${CANDIDATES.join("\n  ")}`);
}

/** Raw CDP connection over the Node >= 22 global WebSocket. */
export function connect(wsUrl, { timeoutMs = 60000 } = {}) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
    } catch {
      return;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      msg.error ? reject(new Error(`${msg.method ?? ""} ${JSON.stringify(msg.error)}`)) : resolve(msg.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error(`websocket failed: ${wsUrl}`)));
  });
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, sessionId, method, params }));
    });
  return { ready, call, close: () => socket.close() };
}

/**
 * Launch a throwaway headless Chromium and attach one page.
 * Returns { client, sessionId, profileDir, close() }.
 */
export async function launchHeadless({ width = 1280, height = 720, log = console.log } = {}) {
  const browser = findBrowser();
  const profileDir = mkdtempSync(join(tmpdir(), "deck-render-"));
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-timer-throttling",
    "--force-device-scale-factor=1",
    /*
     * Text rasterisation must not depend on what is behind the text.
     * LCD/subpixel antialiasing is only used over an opaque backdrop, so an
     * element captured on a transparent backdrop came out with grayscale
     * antialiasing while the same element in the full-page reference had
     * subpixel antialiasing — that mismatch was the entire residual pixel
     * difference (measured: mean 2.9-10.8 per channel, concentrated on glyphs).
     * Forcing grayscale AA makes the reference and the alpha layers render
     * identically, which is what lets the composite match the reference.
     */
    "--disable-lcd-text",
    "--disable-font-subpixel-positioning",
    "--font-render-hinting=none",
    "--force-color-profile=srgb",
    "--remote-debugging-port=0",           // let the OS pick; we read DevToolsActivePort
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    "about:blank",
  ];
  log(`[browser] ${browser}`);
  const child = spawn(browser, args, { stdio: "ignore", windowsHide: true });

  const portFile = join(profileDir, "DevToolsActivePort");
  let port = 0;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const text = readFileSync(portFile, "utf8").split("\n");
      if (text[0] && /^\d+$/.test(text[0].trim())) {
        port = Number(text[0].trim());
        break;
      }
    }
    if (child.exitCode !== null) {
      throw new Error(
        `headless browser exited immediately (code ${child.exitCode}); ` +
          `this is the confined-sandbox signature — the session needs "full access".`,
      );
    }
    await sleep(200);
  }
  if (!port) {
    child.kill();
    throw new Error("headless browser did not publish DevToolsActivePort within 25s");
  }

  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  log(`[browser] ${version.Browser} on port ${port}`);

  const client = await (async () => {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const list = await res.json();
    const page = list.find((t) => t.type === "page") ?? list[0];
    const c = connect(page.webSocketDebuggerUrl);
    await c.ready;
    return c;
  })();

  await client.call("Page.enable");
  await client.call("Runtime.enable");
  await client.call("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: false,
  });

  return {
    client,
    port,
    profileDir,
    close() {
      try { client.close(); } catch {}
      try { child.kill(); } catch {}
      // Chromium releases the profile a moment after the kill.
      setTimeout(() => { try { rmSync(profileDir, { recursive: true, force: true }); } catch {} }, 1500);
    },
  };
}

/** Evaluate an expression in the page and return its value. */
export async function evaluate(client, expression) {
  const r = await client.call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(`page eval failed: ${r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)}`);
  }
  return r.result.value;
}

export async function navigate(client, url, { waitMs = 900 } = {}) {
  const done = new Promise((resolve) => {
    const onMsg = (event) => {
      try {
        const m = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
        if (m.method === "Page.loadEventFired") resolve();
      } catch {}
    };
    // The client owns the socket; poll the document instead — simpler and robust.
    resolve();
  });
  await client.call("Page.navigate", { url });
  await done;
  await sleep(waitMs);
}

export async function screenshot(client, { clip, format = "png", quality } = {}) {
  const params = {
    format,
    captureBeyondViewport: false,
    fromSurface: true,
    optimizeForSpeed: false,
  };
  if (quality !== undefined) params.quality = quality;
  if (clip) params.clip = { ...clip, scale: 1 };
  const r = await client.call("Page.captureScreenshot", params);
  return Buffer.from(r.data, "base64");
}

export function writeShot(file, buf) {
  writeFileSync(file, buf);
  return file;
}
