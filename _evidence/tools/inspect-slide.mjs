// Dump the entrance-animation structure + picture inventory of one slide XML.
// Usage: node tools/inspect-slide.mjs <slide.xml> [--json]
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/inspect-slide.mjs <slide.xml> [--json]'); process.exit(2); }
const asJson = process.argv.includes('--json');
const xml = fs.readFileSync(file, 'utf8');

// ---- pictures -------------------------------------------------------------
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
      id: nv ? +nv[1] : null,
      name: nv ? nv[2] : '',
      x: off ? +off[1] : null, y: off ? +off[2] : null,
      cx: ext ? +ext[1] : null, cy: ext ? +ext[2] : null,
      rel: emb ? emb[1] : '',
    });
  }
}

// ---- entrance effects -----------------------------------------------------
const effects = [];
{
  const re = /<p:cTn\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    if (!/presetClass="entr"/.test(attrs)) continue;
    const tail = xml.slice(m.index + m[0].length, m.index + m[0].length + 6000);
    const pick = (re2) => { const r = re2.exec(attrs); return r ? r[1] : ''; };
    const cond = /<p:cond\s+delay="(\d+)"/.exec(tail);
    const spid = /<p:spTgt\s+spid="(\d+)"/.exec(tail);
    effects.push({
      presetID: pick(/presetID="(\d+)"/),
      nodeType: pick(/nodeType="(\w+)"/),
      grpId: pick(/grpId="(\d+)"/),
      dur: pick(/dur="(\d+)"/),
      delay: cond ? +cond[1] : null,
      spid: spid ? +spid[1] : null,
    });
  }
}

const byId = new Map(pics.map((p) => [p.id, p]));
for (const e of effects) {
  const p = byId.get(e.spid);
  e.target = p ? p.name : `(spid ${e.spid} not a pic)`;
}

if (asJson) {
  console.log(JSON.stringify({ file, pics, effects }, null, 2));
} else {
  console.log(`FILE ${file}`);
  console.log(`pics=${pics.length} effects=${effects.length}`);
  const ns = pics.map((p) => /^(\d+)/.exec(p.name)?.[1] ?? '').filter(Boolean);
  console.log(`pic id/number sequence: ${ns.join(',')}`);
  console.log('\n-- pictures --');
  for (const p of pics) {
    console.log(`  id=${String(p.id).padStart(3)} num=${String(/^(\d+)/.exec(p.name)?.[1] ?? '-').padStart(4)} ${p.rel.padEnd(8)} pos=(${p.x},${p.y}) size=${p.cx}x${p.cy}`);
  }
  console.log('\n-- entrance effects (delay asc) --');
  for (const e of [...effects].sort((a, b) => (a.delay ?? -1) - (b.delay ?? -1))) {
    console.log(`  delay=${String(e.delay).padStart(6)} preset=${e.presetID} dur=${e.dur} grpId=${e.grpId || '-'} node=${e.nodeType || '-'} spid=${e.spid} -> ${e.target}`);
  }
}
