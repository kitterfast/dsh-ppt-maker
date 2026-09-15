/**
 * Fallback so decks that declare their layers as `.body > *` (the AI decks — no
 * .aN class anywhere) keep the legacy one-layer-per-element split instead of
 * having every layer filtered out by the class grouper.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/lib/page-helpers.js';
let src = readFileSync(FILE, 'utf8');
let ok = true;

function sub(name, oldText, newText) {
  const parts = src.split(oldText);
  if (parts.length - 1 !== 1) { console.error(`FAIL [${name}]: found ${parts.length - 1}`); ok = false; return; }
  src = parts.join(newText);
  console.log(`  ok ${name}`);
}

sub('deckGroups-fallback',
`  function deckGroups(slideEl) {
    var els = groups(slideEl), order = [], map = {};
    for (var i = 0; i < els.length; i++) {
      var c = classOf(els[i]);
      if (!c) continue;
      if (!map[c]) { map[c] = { cls: c, els: [] }; order.push(c); }
      map[c].els.push(els[i]);
    }
    order.sort(function (a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
    return order.map(function (c) { return map[c]; });
  }`,
`  function deckGroups(slideEl) {
    var els = groups(slideEl), order = [], map = {}, allClassed = true;
    for (var i = 0; i < els.length; i++) {
      var c = classOf(els[i]);
      if (c) {
        if (!map[c]) { map[c] = { cls: c, els: [] }; order.push(c); }
        map[c].els.push(els[i]);
      } else {
        // A deck whose layer selector carries no .aN class (the AI decks declare
        // theirs as \`.body > *\`, with delays from nth-child rules) must keep the
        // legacy one-layer-per-element split. Without this every element would be
        // skipped and the deck would build with ZERO pictures.
        allClassed = false;
        var key = '#' + i;
        map[key] = { cls: null, els: [els[i]], legacy: true };
        order.push(key);
      }
    }
    if (allClassed) {
      order.sort(function (a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
    }
    return order.map(function (k) { return map[k]; });
  }`);

sub('unionRect-legacy',
`  function unionRect(x) {
    var els = elsOf(x), r = null;`,
`  function unionRect(x) {
    var els = elsOf(x), r = null;
    // Classless (legacy) groups keep the old box: the element's own INK extent,
    // box-shadow included, because those decks have no measured 10px convention.
    if (x && x.legacy && els.length === 1) return inkBox(els[0]);`);

sub('groupDescribe-null-cls',
`  function groupDescribe(g) {
    var els = elsOf(g);
    if (g && g.cls) {
      var texts = [];
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].innerText || '').replace(/\\s+/g, ' ').trim();
        if (t) texts.push(t);
      }
      return { text: texts.join(' | ').slice(0, 400), cls: g.cls + ' ' + els.map(function (e) { return String(e.className); }).join(' ') };
    }
    return describe(g);
  }`,
`  function groupDescribe(g) {
    var els = elsOf(g), texts = [];
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].innerText || '').replace(/\\s+/g, ' ').trim();
      if (t) texts.push(t);
    }
    var names = els.map(function (e) { return String(e.className); }).join(' ');
    return {
      text: texts.join(' | ').slice(0, 400),
      cls: (g && g.cls ? g.cls + ' ' : '') + names,
    };
  }`);

if (ok) { writeFileSync(FILE, src, 'utf8'); console.log('page-helpers.js patched'); }
else { console.error('Aborted.'); process.exit(1); }
