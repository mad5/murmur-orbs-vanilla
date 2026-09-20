import { KIT, ENTRIES } from "../src/shaders/glsl.mjs";

const F = Object.keys(KIT);
const corpus = {};
for (const f of F) corpus[f] = KIT[f] + "\n" + Object.values(ENTRIES[f]).join("\n");
const strip = (x) =>
  x
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/^\s*\n/gm, "");
for (const f of F) corpus[f] = strip(corpus[f]);

const RISKY = [
  ["for", /\bfor\s*\(/g],
  ["while", /\bwhile\s*\(/g],
  ["continue", /\bcontinue\b/g],
  ["break", /\bbreak\b/g],
  ["discard", /\bdiscard\b/g],
  ["struct", /\bstruct\b/g],
  ["mat3", /\bmat3\b/g],
  ["mat4", /\bmat4\b/g],
  ["ternary", /[?]/g],
  ["swzWrite", /\.[xyzw]{2,3}\s*=/g],
  ["fwidth", /\bfwidth\b/g],
  ["dFdx", /\bdFdx\b/g],
  ["dFdy", /\bdFdy\b/g],
  ["uintLit", /\b\d+u\b/g],
  ["hashConsts", /\b(?:1597334673|3812015801|2798796415|2246822519|3266489917|668265263|374761393)u\b/g],
];

const per = {};
for (const f of F) {
  per[f] = {};
  for (const [n, re] of RISKY) per[f][n] = (corpus[f].match(re) || []).length;
}
console.log("PER-FAMILY (kit + entries, comments stripped):");
console.table(per);

{
  const S = Object.values(corpus).join("\n");
  const tot = {};
  for (const [n, re] of RISKY) tot[n] = (S.match(re) || []).length;
  console.log("TOTAL corpus:");
  console.table(tot);
}

// Which hash-function source lines use uint multiplies (need Math.imul rewrites)?
// Dump the hash function bodies as used so the transpiler can special-case the
// "uint hash" idiom precisely (the corpus-wide shape).
const S = Object.values(corpus).join("\n");
const fnRe = /(?:u?vec3|uint|uvec3)\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]*?\n\}/g;
const hashes = new Set();
let m;
while ((m = fnRe.exec(S))) {
  if (/(?:u|vec3)\([^)]*u[, )]/.test(m[0]) && /\/\d|&|>>|<<|\^|1597334673u/.test(m[0])) {
    hashes.add(m[0].slice(m[0].indexOf("(") - 1, m[0].indexOf("{") + 120).slice(0, 240));
  }
}
console.log("\n=== hash-ish function heads (48 max) ===");
console.log([...hashes].slice(0, 48).join("\n---\n"));
