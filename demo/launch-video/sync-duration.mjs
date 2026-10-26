// Sets the film length in index.html from config.js (end.at + end.hold).
// Runs before every render: `npm run render`.
import { readFileSync, writeFileSync } from "node:fs";
const window = {};
new Function("window", readFileSync(new URL("./config.js", import.meta.url), "utf8"))(window);
const { end } = window.DIZKO_DEMO;
const total = +(end.at + end.hold).toFixed(3);
const file = new URL("./index.html", import.meta.url);
const html = readFileSync(file, "utf8");
const next = html.replace(/(id="(?:root|stage)"[^>]*?data-duration=")[\d.]+"/g, `$1${total}"`);
if (next !== html) writeFileSync(file, next);
console.log(`film length ${total}s`);
