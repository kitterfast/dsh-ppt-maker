/**
 * Match the proven deck's isolation rule: a class layer hides the OTHER .aN
 * layers but KEEPS non-animated content that falls inside its box.
 *
 * Evidence: page 6's left column has a plain `<div><span class="note hand tilt-r">`
 * (ref.html line 406) carrying no .aN class. The proven deck bakes that yellow
 * note into its .a4 layer (visible at 1:1 in the layer PNG); hiding non-member
 * siblings -- what this pipeline did -- leaves it only in the base, so the note
 * would not rise with that entrance at all.
 *
 * Legacy one-element groups (the AI decks, whose selector is `.body > *`) keep
 * the previous sibling-walk behaviour unchanged.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/pipeline/lib/page-helpers.js';
let src = readFileSync(FILE, 'utf8');
const oldText =
`    for (var j = 0; j < keep.length; j++) {
      var cur = keep[j];
      while (cur && cur !== document.body && cur.parentElement) {
        var kids = cur.parentElement.children;
        for (var t = 0; t < kids.length; t++) {
          var k = kids[t];
          if (k === cur) continue;
          var has = false;
          for (var q = 0; q < keep.length; q++) if (k === keep[q] || k.contains(keep[q])) { has = true; break; }
          if (!has) toHide.push(k);
        }
        cur = cur.parentElement;
      }
    }`;
const newText =
`    // Only LEGACY groups hide non-member siblings too. A class layer keeps the
    // slide's non-animated content, exactly like the proven deck -- page 6's
    // yellow note (a plain div, no .aN class) is baked into its .a4 layer there,
    // so it rises with that entrance instead of sitting still in the base.
    if (x && x.legacy) {
      for (var j = 0; j < keep.length; j++) {
        var cur = keep[j];
        while (cur && cur !== document.body && cur.parentElement) {
          var kids = cur.parentElement.children;
          for (var t = 0; t < kids.length; t++) {
            var k = kids[t];
            if (k === cur) continue;
            var has = false;
            for (var q = 0; q < keep.length; q++) if (k === keep[q] || k.contains(keep[q])) { has = true; break; }
            if (!has) toHide.push(k);
          }
          cur = cur.parentElement;
        }
      }
    }`;
const parts = src.split(oldText);
if (parts.length - 1 !== 1) { console.error(`FAIL: found ${parts.length - 1}`); process.exit(1); }
writeFileSync(FILE, parts.join(newText), 'utf8');
console.log('ok: class layers now keep non-animated content (legacy groups unchanged)');
