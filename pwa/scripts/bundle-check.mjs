#!/usr/bin/env node
// PWA bundle-size guard — enforces NFR-02 (≤ 300 KB gz main bundle).
// Run after `vite build`. Prints a per-chunk gzipped-size table to
// stdout and exits non-zero if the main chunk exceeds the cap.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const HARD_CAP_KB = 300;          // NFR-02
const DEFENSIVE_CAP_KB = 275;     // tightens after 3 clean runs (N-05)
const DIST_ASSETS = new URL("../dist/assets", import.meta.url).pathname;

let assets;
try {
  assets = readdirSync(DIST_ASSETS);
} catch (err) {
  console.error(`[bundle-check] cannot read ${DIST_ASSETS} — did you run \`vite build\`?`);
  process.exit(2);
}

const jsFiles = assets
  .filter((f) => f.endsWith(".js"))
  .map((f) => {
    const path = join(DIST_ASSETS, f);
    const raw = readFileSync(path);
    const gz = gzipSync(raw);
    return { name: f, rawBytes: raw.length, gzBytes: gz.length };
  })
  .sort((a, b) => b.gzBytes - a.gzBytes);

console.log("\n[bundle-check] per-chunk gzipped sizes:");
console.log("  chunk                                       raw KB    gz KB");
console.log("  " + "-".repeat(64));
for (const f of jsFiles) {
  const raw = (f.rawBytes / 1024).toFixed(1).padStart(7);
  const gz = (f.gzBytes / 1024).toFixed(1).padStart(7);
  console.log(`  ${f.name.padEnd(40)}    ${raw}    ${gz}`);
}

// Main chunk = the entry point (Vite emits `index-<hash>.js` by default).
const main = jsFiles.find((f) => /^index-[a-zA-Z0-9_-]+\.js$/.test(f.name));
if (!main) {
  console.error("[bundle-check] could not find `index-*.js` main entry chunk.");
  process.exit(2);
}

const mainKb = main.gzBytes / 1024;
console.log(`\n[bundle-check] main bundle: ${mainKb.toFixed(1)} KB gz`);
console.log(`[bundle-check] NFR-02 hard cap: ${HARD_CAP_KB} KB`);
console.log(`[bundle-check] defensive ceiling: ${DEFENSIVE_CAP_KB} KB`);

if (mainKb > HARD_CAP_KB) {
  console.error(`[bundle-check] FAIL: main bundle ${mainKb.toFixed(1)} KB > ${HARD_CAP_KB} KB hard cap (NFR-02)`);
  process.exit(1);
}
if (mainKb > DEFENSIVE_CAP_KB) {
  console.warn(`[bundle-check] WARN: main bundle ${mainKb.toFixed(1)} KB > ${DEFENSIVE_CAP_KB} KB defensive ceiling — investigate before continuing`);
}
console.log("[bundle-check] OK\n");
