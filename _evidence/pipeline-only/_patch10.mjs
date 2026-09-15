import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2] + "/deck-render.mjs";
let s = readFileSync(f, "utf8");
const old = `        \`(function(){ var s = window.__deckRender.slides()[\${n}];
           var gs = window.__deckRender.groups(s);
           return JSON.stringify(gs.map(function(g){`;
const neu = `        \`(function(){ var s = window.__deckRender.slides()[\${n}];
           var gs = window.__deckRender.groups(s);
           // The loop animations only exist while .anim is applied (the same
           // trap as the permanent-motion probe): without it every getAnimations()
           // call returns nothing and no animated sub-element is ever found.
           s.classList.add('anim');
           var res = JSON.stringify(gs.map(function(g){`;
if (!s.includes(old)) { console.error("anchor missing"); process.exit(1); }
s = s.replace(old, neu);
const old2 = `                 return { box: x, text: d.text, tag: d.cls }; }); })); })()\`,`;
const neu2 = `                 return { box: x, text: d.text, tag: d.cls }; }); }));
           s.classList.remove('anim'); void s.offsetWidth; return res; })()\`,`;
if (!s.includes(old2)) { console.error("anchor2 missing"); process.exit(1); }
s = s.replace(old2, neu2);
s = s.replace('const RENDERER_VERSION = "13"', 'const RENDERER_VERSION = "14"');
writeFileSync(f, s, "utf8");
console.log("bits enumerated with .anim applied");
