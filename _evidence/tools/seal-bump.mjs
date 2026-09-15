/**
 * Stage 7: bump the plugin version in all four places, UTF-8 WITHOUT BOM, and
 * re-read each file afterwards to prove what was actually written.
 *
 * Target files:
 *   <plugin>/package.json          "version"
 *   <plugin>/lib/client.js         PLUGIN_VERSION
 *   <repo>/package.json            "version"
 *   <repo>/lib/client.js           PLUGIN_VERSION
 */
import { readFileSync, writeFileSync } from 'node:fs';

const NEW = process.argv[2] ?? '2.4.0';
const PLUGIN = 'C:/Users/ASUS/.dsh/local-plugins/dsh-ppt-maker';
const REPO = 'C:/Users/ASUS/Desktop/班委竞选/dsh-fast-ppt';

const targets = [
  { name: 'plugin/package.json', file: `${PLUGIN}/package.json`, re: /("version"\s*:\s*")([^"]+)(")/ },
  { name: 'plugin/lib/client.js', file: `${PLUGIN}/lib/client.js`, re: /(PLUGIN_VERSION\s*=\s*")([^"]+)(")/ },
  { name: 'repo/package.json', file: `${REPO}/package.json`, re: /("version"\s*:\s*")([^"]+)(")/ },
  { name: 'repo/lib/client.js', file: `${REPO}/lib/client.js`, re: /(PLUGIN_VERSION\s*=\s*")([^"]+)(")/ },
];

let failed = false;
for (const t of targets) {
  const before = readFileSync(t.file, 'utf8');
  const m = t.re.exec(before);
  if (!m) { console.error(`FAIL ${t.name}: version pattern not found`); failed = true; continue; }
  const old = m[2];
  if (old === NEW) { console.log(`SKIP ${t.name}: already ${NEW}`); continue; }
  const after = before.replace(t.re, `$1${NEW}$3`);
  writeFileSync(t.file, after, 'utf8'); // node writes UTF-8 with no BOM

  // prove it: re-read from disk, and check the byte order mark independently
  const raw = readFileSync(t.file);
  const hasBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  const reread = readFileSync(t.file, 'utf8');
  const now = t.re.exec(reread)?.[2];
  const ok = now === NEW && !hasBom;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${t.name}: ${old} -> ${now}  BOM=${hasBom}  bytes=${raw.length}`);
  if (!ok) failed = true;

  if (t.file.endsWith('package.json')) {
    try { JSON.parse(reread); console.log(`     JSON.parse OK`); }
    catch (e) { console.error(`     JSON.parse FAILED: ${e.message}`); failed = true; }
  }
}
process.exit(failed ? 1 : 0);
