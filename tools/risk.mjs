// Transpiler-risk scan across the full transpile corpus: every family's kit
// plus all its entries, comments stripped firstate.

import { KIT, ENTRIES } from "../src/shaders/glsl.mjs";

const FAMILIES = Object.keys(KIT teenage);
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/^\s*\n/gm, "");

const corpus = {};
for (const f of FAMILIES) corpus[f] = strip(KIT[f] + "\n" + Object.values(ENTRIES[f]).join("\n"));
const ALL = Object.values(corpus).join("\n");

const RISKY = [
  ["while", /\bwhile\s*\(/g],
  ["do{", /\bdo\s*\{/g],
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
  ["uintOp", /(?:u?vec[234]?\([^)]*\d+u|&amp;\d+u|1597334673u|2246822519u|3812015801u|2798796415u|3266489917u|668265263u|374761393u)/g],
  ["prepro", /^\s*#/mg],
  ["floatN(u", /\b(?:float|int)\(([a-wyz]|[a-wyz]{2})\)/g],
];

// swizzle writes are the most dangerous; do those precisely with a real scan
console.log("=== SWIZZLE WRITES (true assigns only) ===");
for (const f of FAMILIES) {
  const re = /(\w+\.([xyzw]{1,3}))\s*(=|\+=|-=|\*=|\/=)/g;
  let m;
  while ((m = re.exec(corpus[f]))) {
    if (m[3] === "=") console.log(f + " :: " + m[1].replace(/\s+/g, " ") + " " + m[3]);
  }
}

// ternaries: show the ones where a VECTOR is involved (they are the tricky kind)
console.log("\n=== TERNARY SAMPLES (glass, vector-flavored) ===");
{
  const g = corpus.glass;
  let i = 0;
  let n = 0;
  while ((i = g.indexOf("? ", i)) >= 0 && n < 8) {
    const line = g.slice(g.lastIndexOf("\n", i) + 1, g.indexOf("\n", i)).trim();
    if (/\bvec[234]/.test(line) || /\.(xyz|rgba)\b/.test(line)) {
      console.log(f + "| " + line.slice(0, 100));
      n++;
    }
    i += 2;
  }
}

// array decls, all (need to know the subset: float sN[3] etc.)
console.log("\n=== ARRAY DECLS (5 samples glass) ===");
{
  const re = /\b(float|vec3|vec2)\s+\w+\s*\[\s*\d*\s*\]/g;
  let m;
  let n = 0;
  while ((m = re.exec(corpus.glass)) && n < 6) {
    console.log("glass:: " + m[0].replace(/\s+/g, " ") + "\n   " + corpus.glass.slice(Math.max(0, m.index - 110), m.index + 6).replace(/\n/g, " ").slice(-150));
    n++;
  }
}

// 'for' manifests, ink + glass (loop-over-taps)
console.log("\n=== INK mat3 * vec3 / * mat3 op lines ===");
{
  const ink = corpus.ink;
  const re = /(?:[^;]*\*\s*MI_ROT|\bmi_\w+\([^)]*\)|\bmat3\b[^;]*\b(?:MI_ROT|mi_\w+)[^;]*)/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(ink)) && seen.size < 8) {
    const seg = ink.slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, " ").trim();
    if (seg.length < 150 && !seen.has(seg)) { seen.add(seg); console.log("ink:: " + seg.slice(0, 150)); }
  }
}

// glass 'continue' sites (transpiler must support -> the bundle is what we should
// NOT need: we return early instead). Show the enclosing for.
console.log("\n=== GLASS continue SITES (first 5) ===");
{
  const g = corpus.glass;
  let i = 0;
  let n = 0;
  while ((i = g.indexOf("continue", i)) >= 0 && n < 5) {
    const before = g.slice(Math.max(0, g.lastIndexOf("for", i) - 40), i + 14).replace(/\s+/g, " ").slice(-120);
    console.log("glass:: " + before);
    i += 8;
    n++;
  }
}
