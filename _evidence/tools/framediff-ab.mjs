// Stage 5: A/B frame comparison between the baseline deck's WPS capture and ours.
// Frames are captured by the same script with the same parameters, so frame N in
// each run sits at a similar elapsed time. Transitional frames (before the show
// window reached the foreground) are reported but excluded from the summary via
// the --skip=N argument.
// Usage: node tools/framediff-ab.mjs <oracleDir> <oursDir> [skipFrames]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire('C:/Users/ASUS/Desktop/班委竞选/package.json');
const { PNG } = req('pngjs');

const [aDir, bDir] = process.argv.slice(2);
const skip = Number(process.argv[4] ?? 3);

const list = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.png')).sort();
const fa = list(aDir), fb = list(bDir);
const n = Math.min(fa.length, fb.length);
console.log(`baseline frames=${fa.length}  ours frames=${fb.length}  comparing ${n}`);
console.log('frame   mean   bad%>24   verdict');

let sum = 0, bad = 0, cnt = 0, worst = { mean: -1 };
for (let i = 0; i < n; i++) {
  const A = PNG.sync.read(fs.readFileSync(path.join(aDir, fa[i])));
  const B = PNG.sync.read(fs.readFileSync(path.join(bDir, fb[i])));
  if (A.width !== B.width || A.height !== B.height) { console.log(`${fa[i]}  SIZE MISMATCH`); continue; }
  const N = A.width * A.height;
  let s = 0, b = 0;
  for (let k = 0; k < N; k++) {
    const o = k * 4;
    const d = Math.max(Math.abs(A.data[o] - B.data[o]), Math.abs(A.data[o + 1] - B.data[o + 1]), Math.abs(A.data[o + 2] - B.data[o + 2]));
    s += d; if (d > 24) b++;
  }
  const mean = s / N, badPct = (b / N) * 100;
  if (i >= skip) { sum += s; bad += b; cnt += N; if (mean > worst.mean) worst = { mean, badPct, frame: fa[i] }; }
  console.log(`${fa[i]}  ${mean.toFixed(2).padStart(7)}  ${badPct.toFixed(3).padStart(7)}%   ${i < skip ? '(transitional, excluded)' : ''}`);
}
if (cnt) {
  console.log(`\nSUMMARY over frames ${skip}..${n - 1}: mean=${(sum / cnt).toFixed(2)}/255  bad>24=${((bad / cnt) * 100).toFixed(2)}%  over ${cnt} px`);
  console.log(`worst frame: ${worst.frame}  mean=${worst.mean.toFixed(2)}  bad=${worst.badPct.toFixed(2)}%`);
}
