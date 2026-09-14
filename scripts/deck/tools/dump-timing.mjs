// Print the p:timing PowerPoint itself wrote, pretty-printed.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("E:/deepseek/dsh-ppt-project/package.json");
const JSZip = require("jszip");

const zip = await JSZip.loadAsync(readFileSync(process.argv[2]));
const name = Object.keys(zip.files).find((n) => /^ppt\/slides\/slide1\.xml$/.test(n));
const xml = await zip.file(name).async("string");
const timing = xml.match(/<p:timing>[\s\S]*?<\/p:timing>/)?.[0] ?? "(no p:timing)";
console.log(timing.replace(/></g, ">\n<"));
