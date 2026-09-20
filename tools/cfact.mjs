// Two contract questions, settled cleanly. Real file, plain strings only.
//  a) how murmur.js drives the canvas renderer (uniform names / call shape)
//  b) which shader uniforms the CPU kit actually uses (union), and the mat3 +
//     swizzle-write + struct + array shapes the transpiler must cover.
// Output -> /tmp/cfact.txt then printed. Nothing fancy.

import { readFileSync, writeFileSync } from "node:fs";
import { KIT, ENTRIES } from "../src/shaders/glsl.mjs";

const FAMILIES = Object.keys(KIT);
const corpus = {};
for (const f of FAMILIES)
  corpus[f] = KIT[f] + "\n" + Object.values(ENTRIES[f]).join("\n");
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/^\s*\n/gm, "");
for (const f of FAMILIES) corpus[f] = strip(corpus[f]);

const out = [];

// (a) murmur.js — every place canvas renderer / uniforms get touched
out.push("=== murmur.js: canvas contract ===\n" +
  (() => {
    const m = readFileSync(new URL("../src/murmur.js", import.meta.url), "utf8");
    const lines = [];
    const re = /(?:canvas|Canvas|uniform|u_\w+|\.render\(|\.setTilt|safeArea|checker|renderer|size|tilt)[^\n]*/g;
    let i = 0;
    const seen = new Set();
    let m2;
    while ((m2 = re.exec(m)) && i < 40) {
      const t = m2[0].trim().slice(0, 90);
      const k = t.slice(0, 60);
      if (t.length > 3 && !seen.has(k)) { seen.add(k); lines.push("  " + t.slice(0, 84)); i++; }
    }
    return lines.join("\n");
  })());

// (b) uniform variable reads inside the GLSL corpus — which names appear
out.push("\n=== B. uniform READ names (u_*) used across full corpus ===\n" +
  (() => {
    const s = new Set();
    for (const f of FAMILIES) {
      let m;
      const re = /\bu_[a-zA-Z]+\b/g;
      while ((m = re.exec(corpus[f]))) s.add(m[0]);
    }
    return [...s].sort().join(" ");
  })());

// (c) knob strip set — the members of the tiny GLSL `struct` types
out.push("\n=== C. struct bodies ===\n" + (() => {
  const rows = [];
  const re = /struct\s+(\w+)\s*\{[^}]*\}/g;
  const seen = new Set();
  for (const f of FAMILIES) {
    let m;
    while ((m = re.exec(corpus[f]))) {
      const k = m[0].slice(0, 5) + m[1];
      if (!seen.has(k)) { seen.add(k); rows.push(f + "  " + m[0].replace(/\s+/g, " ").trim().slice(0, 120)); }
    }
  }
  return rows.join("\n");
})());

writeFileSync("/tmp/cfact.txt", out.join("\n\n"), "utf8");
console.log(out.join("\n\n"));
