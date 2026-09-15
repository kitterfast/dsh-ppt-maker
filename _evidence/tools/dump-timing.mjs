// Print an indented outline of the <p:timing> subtree of a slide XML.
// Usage: node tools/dump-timing.mjs <slide.xml> [maxLines]
import fs from 'node:fs';

const file = process.argv[2];
const maxLines = Number(process.argv[3] ?? 400);
const xml = fs.readFileSync(file, 'utf8');

const start = xml.indexOf('<p:timing');
const end = xml.lastIndexOf('</p:timing>');
if (start < 0 || end < 0) { console.log('no <p:timing> in ' + file); process.exit(0); }
const timing = xml.slice(start, end + '</p:timing>'.length);

const WANT = new Set([
  'p:timing', 'p:tnLst', 'p:seq', 'p:par', 'p:cTn', 'p:stCondLst', 'p:cond',
  'p:endCondLst', 'p:childTnLst', 'p:spTgt', 'p:set', 'p:animEffect', 'p:anim',
  'p:animRot', 'p:animScale', 'p:animMotion', 'p:bldP', 'p:bldLst', 'p:bldAsOne',
  'p:prevCondLst', 'p:nextCondLst', 'p:grpId', 'p:attrNameLst', 'p:to', 'p:from',
]);
const KEEP_ATTRS = /^(id|presetID|presetClass|presetSubtype|fill|nodeType|grpId|dur|restart|spid|delay|filter|transition|by|to|from|accel|decel|attrName)$/;

const tagRe = /<(\/?)([\w:]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
const out = [];
let depth = 0;
let m;
while ((m = tagRe.exec(timing))) {
  const [, closing, name, attrStr, selfClose] = m;
  if (closing) { depth = Math.max(0, depth - 1); continue; }
  if (!WANT.has(name)) {
    // unknown container: descend only if it can hold children
    if (!selfClose) depth++;
    continue;
  }
  const attrs = [];
  const aRe = /([\w:.-]+)="([^"]*)"/g;
  let a;
  while ((a = aRe.exec(attrStr))) if (KEEP_ATTRS.test(a[1])) attrs.push(`${a[1]}=${a[2]}`);
  out.push(`${'  '.repeat(depth)}${name}${attrs.length ? ' ' + attrs.join(' ') : ''}`);
  if (!selfClose) depth++;
}

console.log(`FILE ${file}`);
console.log(`timing lines=${out.length}`);
console.log(out.slice(0, maxLines).join('\n'));
if (out.length > maxLines) console.log(`... (${out.length - maxLines} more)`);
