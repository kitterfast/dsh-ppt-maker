// Smoke test: can a headless browser start and screenshot under the current sandbox?
import { launchHeadless, evaluate, navigate, screenshot } from "./lib/browser.mjs";

const t0 = Date.now();
try {
  const b = await launchHeadless({ width: 1280, height: 720 });
  await navigate(b.client, "data:text/html,<body style='margin:0;background:#123'><div id=x style='position:absolute;left:100px;top:50px;width:200px;height:120px;background:#e33'></div></body>", { waitMs: 400 });
  const info = await evaluate(b.client, `JSON.stringify({w:innerWidth,h:innerHeight,ok:!!document.getElementById('x')})`);
  console.log("page info:", info);
  const png = await screenshot(b.client);
  const sig = png.subarray(0, 8).toString("hex");
  console.log("png bytes:", png.length, "signature:", sig, sig === "89504e470d0a1a0a" ? "OK" : "BAD");
  const clip = await screenshot(b.client, { clip: { x: 100, y: 50, width: 200, height: 120 } });
  console.log("clipped png bytes:", clip.length);
  b.close();
  console.log(`elapsed ${Date.now() - t0}ms`);
} catch (error) {
  console.error("FAILED:", error.message);
  process.exit(1);
}
