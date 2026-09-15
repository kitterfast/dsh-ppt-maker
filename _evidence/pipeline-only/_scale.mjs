import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2];

// 1) browser: allow a capture scale (deviceScaleFactor)
{
  const f = dir + "/lib/browser.mjs";
  let s = readFileSync(f, "utf8");
  s = s.replace("export async function launchHeadless({ width = 1280, height = 720, log = console.log } = {}) {",
                "export async function launchHeadless({ width = 1280, height = 720, scale = 1, log = console.log } = {}) {");
  s = s.replace("    width, height, deviceScaleFactor: 1, mobile: false,",
                "    width, height, deviceScaleFactor: scale, mobile: false,");
  if (!s.includes("deviceScaleFactor: scale")) { console.error("browser.mjs anchor missing"); process.exit(1); }
  writeFileSync(f, s, "utf8");
  console.log("browser.mjs: capture scale supported");
}

// 2) render: launch at the configured scale; clips stay in CSS px (CDP scales the output)
{
  const f = dir + "/deck-render.mjs";
  let s = readFileSync(f, "utf8");
  s = s.replace("const browser = await launchHeadless({ width: W, height: H });",
                "const captureScale = config.captureScale ?? 2;\nconst browser = await launchHeadless({ width: W, height: H, scale: captureScale });");
  s = s.replace('const RENDERER_VERSION = "15"', 'const RENDERER_VERSION = "16"');
  if (!s.includes("captureScale")) { console.error("render anchor missing"); process.exit(1); }
  writeFileSync(f, s, "utf8");
  console.log("deck-render.mjs: captures at " + "config.captureScale ?? 2");
}

// 3) verify: export at the same pixel density the render used
{
  const f = dir + "/deck-verify.mjs";
  let s = readFileSync(f, "utf8");
  s = s.replace('"-Width", String(manifest.width), "-Height", String(manifest.height)],',
                '"-Width", String(manifest.width * (manifest.settings?.captureScale ?? 2)),\n        "-Height", String(manifest.height * (manifest.settings?.captureScale ?? 2))],');
  if (!s.includes("captureScale")) console.error("verify anchor MISSING (will fix next)");
  else console.log("deck-verify.mjs: exports at the capture scale");
  writeFileSync(f, s, "utf8");
}

// 4) manifest must record the scale
{
  const f = dir + "/deck-render.mjs";
  let s = readFileSync(f, "utf8");
  s = s.replace('    groups: config.groups ?? {},', '    groups: config.groups ?? {},\n    captureScale,');
  writeFileSync(f, s, "utf8");
}
