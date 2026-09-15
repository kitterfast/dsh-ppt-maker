// Splice the round-2 verification sections into the seal report by anchor.
import { readFileSync, writeFileSync } from 'node:fs';

const SEAL = 'C:/Users/ASUS/Desktop/格式转化修复/_seal-20260915-120632';
const FILE = `${SEAL}/封版报告.md`;
let src = readFileSync(FILE, 'utf8');
let ok = true;

const gateC = readFileSync('C:/Users/ASUS/Desktop/格式转化修复/reports/sec-gate-c.md', 'utf8');
const wpsPages = readFileSync('C:/Users/ASUS/Desktop/格式转化修复/reports/sec-wps-pages.md', 'utf8');
const unverified = readFileSync('C:/Users/ASUS/Desktop/格式转化修复/reports/sec-unverified.md', 'utf8');

function insertBefore(name, anchor, text) {
  const n = src.split(anchor).length - 1;
  if (n !== 1) { console.error(`FAIL [${name}]: anchor found ${n} times`); ok = false; return; }
  src = src.replace(anchor, text + anchor);
  console.log(`  ok ${name}`);
}

insertBefore('gate-c', '## 五、WPS 实跑', gateC);
insertBefore('wps-pages', '## 六、插件自检', wpsPages);

// replace items 1..5 of the remaining-unverified list, keep the rest
const m = /1\. \*\*AI 两稿的视觉保真未验证\*\*[\s\S]*?\n(?=6\. \*\*构建非字节可复现\*\*)/.exec(src);
if (!m) { console.error('FAIL [unverified]: anchor not found'); ok = false; }
else { src = src.replace(m[0], unverified + '\n'); console.log('  ok unverified-list'); }

if (ok) { writeFileSync(FILE, src, 'utf8'); console.log(`report now ${src.length} chars`); }
else process.exit(1);
