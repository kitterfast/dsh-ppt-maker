// Print PNG/GIF dimensions for every file in a media directory.
// Usage: node tools/media-dims.mjs <mediaDir>
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/media-dims.mjs <mediaDir>'); process.exit(2); }

function dims(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(32);
  fs.readSync(fd, head, 0, 32, 0);
  fs.closeSync(fd);
  if (head.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
    return { kind: 'png', w: head.readUInt32BE(16), h: head.readUInt32BE(20), ct: head[25] };
  }
  if (head.slice(0, 3).toString('latin1') === 'GIF') {
    return { kind: 'gif', w: head.readUInt16LE(6), h: head.readUInt16LE(8) };
  }
  return { kind: '?', w: 0, h: 0 };
}

const files = fs.readdirSync(dir).filter((f) => /\.(png|gif|jpe?g)$/i.test(f)).sort();
let total = 0;
for (const f of files) {
  const full = path.join(dir, f);
  const st = fs.statSync(full);
  total += st.size;
  const d = dims(full);
  const ct = d.kind === 'png' ? ` ct=${d.ct}${d.ct === 6 ? '(RGBA)' : d.ct === 2 ? '(RGB)' : d.ct === 3 ? '(PAL)' : ''}` : '';
  console.log(`${f.padEnd(24)} ${d.kind.padEnd(4)} ${String(d.w).padStart(6)}x${String(d.h).padStart(5)} px${ct.padEnd(12)} ${(st.size / 1024).toFixed(1).padStart(9)} KB`);
}
console.log(`\n${files.length} files, ${(total / 1048576).toFixed(1)} MB total in ${dir}`);
