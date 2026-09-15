// Set capturePad to the proven deck's constant layer padding (10 px).
import { readFileSync, writeFileSync } from 'node:fs';
const FILE = 'C:/Users/ASUS/Desktop/班委竞选/_ppt-skill-forensics/refdeck/deck.config.json';
const cfg = JSON.parse(readFileSync(FILE, 'utf8'));
const before = cfg.capturePad;
cfg.capturePad = 10;
cfg.$capturePadNote = '10px per side: measured on every page of 为什么选我做学委_动态版.pptx (layer box == union of the class members rects + 10).';
writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log(`capturePad ${before} -> ${cfg.capturePad}`);
