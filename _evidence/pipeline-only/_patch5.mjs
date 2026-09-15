import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let s = readFileSync(f, "utf8");
const orig = s;

// 1) encodeGif: accept a per-frame delay array
s = s.replace(
  "function encodeGif(frameBuffers, delayMs, outPath) {",
  "function encodeGif(frameBuffers, delayMs, outPath) {\n  const delayAt = (i) => (Array.isArray(delayMs) ? delayMs[Math.min(i, delayMs.length - 1)] : delayMs);",
);
s = s.replace(
  "const opts = { palette, delay: delayMs, transparent: true, transparentIndex: 255, dispose: 2 };",
  "const opts = { palette, delay: delayAt(i), transparent: true, transparentIndex: 255, dispose: 2 };",
);

// 2) measure the real loop period, and record the remainder of each interval
const oldFrames = "      const gifFrames = config.gif?.frames ?? 24;\n      const gifInterval = config.gif?.intervalMs ?? 70;\n      const gifLead = config.gif?.leadMs ?? 1500;";
const newFrames = `      const gifFrames = config.gif?.frames ?? 24;
      const gifInterval = config.gif?.intervalMs ?? 70;
      const gifLead = config.gif?.leadMs ?? 1500;
      const maxPeriod = config.gif?.maxPeriodMs ?? 6000;`;
if (!s.includes(oldFrames)) { console.error("anchor A not found"); process.exit(1); }
s = s.replace(oldFrames, newFrames);

const oldLoop = `        const bufs = [];
        for (let f = 0; f < gifFrames; f++) {
          bufs.push(await screenshot(client, { format: "png", clip }));
          await new Promise((r) => setTimeout(r, gifInterval));
        }`;
const newLoop = `        // Record exactly one period of the slowest infinite animation so the loop
        // is seamless. A fixed 1.7 s clip against a 14 s dash cycle made the line
        // jump on every restart -- the "inexplicable flicker".
        const periodMs = JSON.parse(
          await evaluate(
            client,
            \`(function(){ var s = window.__deckRender.slides()[\${n}]; var best = 0;
               window.__deckRender.groups(s).forEach(function(g){
                 (g.getAnimations ? g.getAnimations({subtree:true}) : []).forEach(function(a){
                   var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
                   if (t.iterations === Infinity && t.duration > best) best = t.duration; }); });
               return JSON.stringify(Math.round(best)); })()\`,
          ),
        );
        const wantMs = Math.min(periodMs > 0 ? periodMs : gifInterval * gifFrames, maxPeriod);
        const framesWanted = Math.max(2, Math.round(wantMs / gifInterval));
        if (periodMs > maxPeriod) {
          console.log(\`[render] p\${n + 1} g\${k}: 循环周期 \${periodMs}ms 超过上限 \${maxPeriod}ms，录制被截断，接缝可能可见\`);
        }
        const bufs = [];
        const delays = [];
        for (let f = 0; f < framesWanted; f++) {
          const t0 = Date.now();
          bufs.push(await screenshot(client, { format: "png", clip }));
          const spent = Date.now() - t0;
          // The screenshot itself costs ~90 ms. Sleeping a fixed 70 ms on top made
          // the real spacing ~160 ms while the GIF declared 70 ms, so playback ran
          // ~2.3x too fast. Sleep only the remainder and record the real spacing.
          const wait = Math.max(0, gifInterval - spent);
          delays.push(spent + wait);
          if (f < framesWanted - 1) await new Promise((r) => setTimeout(r, wait));
        }`;
if (!s.includes(oldLoop)) { console.error("anchor B not found"); process.exit(1); }
s = s.replace(oldLoop, newLoop);

s = s.replace("const count = encodeGif(bufs, gifInterval, join(outDir, file));",
              "const count = encodeGif(bufs, delays, join(outDir, file));");
s = s.replace(
  "console.log(`[render] p${n + 1} g${k}: ${count}-frame looping GIF -> ${file}`);",
  "const avg = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);\n        console.log(`[render] p${n + 1} g${k}: ${count} frames @${avg}ms (period ${periodMs || \"n/a\"}ms) -> ${file}`);",
);
s = s.replace('const RENDERER_VERSION = "10"', 'const RENDERER_VERSION = "11"');
if (s === orig) { console.error("no changes"); process.exit(1); }
writeFileSync(f, s, "utf8");
console.log("patched: measured per-frame delays + period-aligned loop");
