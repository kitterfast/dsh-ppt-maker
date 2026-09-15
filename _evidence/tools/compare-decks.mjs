// Side-by-side structural comparison of two unpacked PPTX decks.
// Usage: node tools/compare-decks.mjs <oracleDir> <oursDir>
// Expects deck_ppt/slides/slideN.xml layout (unpacked pptx).
import fs from 'node:fs';
import path from 'node:path';

const [oracleRoot, oursRoot] = process.argv.slice(2);
if (!oracleRoot || !oursRoot) { console.error('usage: node tools/compare-decks.mjs <oracleDir> <oursDir>'); process.exit(2); }

function parse(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const pics = [];
  {
    const re = /<p:pic>([\s\S]*?)<\/p:pic>/g;
    let m;
    while ((m = re.exec(xml))) {
      const b = m[1];
      const nv = /<p:cNvPr id="(\d+)" name="([^"]*)"/.exec(b);
      const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(b);
      const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(b);
      const emb = /r:embed="([^"]+)"/.exec(b);
      pics.push({
        id: nv ? +nv[1] : null, name: nv ? nv[2] : '',
        x: off ? +off[1] : null, y: off ? +off[2] : null,
        cx: ext ? +ext[1] : null, cy: ext ? +ext[2] : null,
        rel: emb ? emb[1] : '',
      });
    }
  }
  const effects = [];
  {
    const re = /<p:cTn\b([^>]*)>/g;
    let m;
    while ((m = re.exec(xml))) {
      const attrs = m[1];
      if (!/presetClass="entr"/.test(attrs)) continue;
      const tail = xml.slice(m.index + m[0].length, m.index + m[0].length + 6000);
      const g = (re2) => { const r = re2.exec(attrs); return r ? r[1] : ''; };
      const cond = /<p:cond\s+delay="(\d+)"/.exec(tail);
      const spid = /<p:spTgt\s+spid="(\d+)"/.exec(tail);
      effects.push({ nodeType: g(/nodeType="(\w+)"/), delay: cond ? +cond[1] : null, spid: spid ? +spid[1] : null });
    }
  }
  const media = new Map();
  const relFile = path.join(path.dirname(file), '..', 'slides', '_rels', path.basename(file) + '.rels');
  if (fs.existsSync(relFile)) {
    const rels = fs.readFileSync(relFile, 'utf8');
    const rre = /Id="([^"]+)"[^>]*Target="([^"]*)"/g;
    let r;
    while ((r = rre.exec(rels))) media.set(r[1], r[2].split('/').pop());
  }
  for (const p of pics) p.media = media.get(p.rel) ?? '';
  return { pics, effects };
}

function boxes(deck, n) {
  const f = path.join(deck, 'ppt', 'slides', `slide${n}.xml`);
  return fs.existsSync(f) ? parse(f) : null;
}

const slides = [];
for (let n = 1; n <= 40; n++) {
  if (fs.existsSync(path.join(oracleRoot, 'ppt', 'slides', `slide${n}.xml`))) slides.push(n);
}

let totO = { p: 0, e: 0 }, totN = { p: 0, e: 0 };
for (const n of slides) {
  const o = boxes(oracleRoot, n), u = boxes(oursRoot, n);
  totO.p += o.pics.length; totO.e += o.effects.length;
  totN.p += u.pics.length; totN.e += u.effects.length;
  const od = o.effects.map((e) => e.delay).join(',');
  const ud = u.effects.map((e) => e.delay).join(',');
  const flag = (o.pics.length === u.pics.length && o.effects.length === u.effects.length && od === ud) ? 'OK ' : '>>>';
  console.log(`${flag} slide${String(n).padStart(2)}  pics ${o.pics.length}/${u.pics.length}  eff ${o.effects.length}/${u.effects.length}`);
  console.log(`      delays oracle[${od}]`);
  console.log(`      delays ours  [${ud}]`);
}
console.log(`\nTOTAL oracle pics=${totO.p} effects=${totO.e}   |   ours pics=${totN.p} effects=${totN.e}`);

console.log('\n=== per-slide picture box detail (oracle | ours) ===');
for (const n of slides) {
  const o = boxes(oracleRoot, n), u = boxes(oursRoot, n);
  console.log(`\n-- slide${n} --`);
  const max = Math.max(o.pics.length, u.pics.length);
  for (let i = 0; i < max; i++) {
    const a = o.pics[i], b = u.pics[i];
    const f = (p) => p ? `id${String(p.id).padStart(3)} r=${String(p.cx).padStart(8)}x${String(p.cy).padStart(7)} @${String(p.x).padStart(8)},${String(p.y).padStart(7)} ${(p.media || '').padEnd(12)}` : '(none)';
    console.log(`  ${String(i).padStart(2)} O ${f(a)}`);
    console.log(`     U ${f(b)}`);
  }
}
