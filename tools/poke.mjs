// Last tiny probe: (1) exact mat3 operand shapes across the corpus, and
// (2) the full set of STRUCT field names (so generated JS objects mirror GLSL
// struct layouts bit-for-bit). Writes /tmp/pfacts.txt, prints it.
import { writeFileSync } from "node:fs";
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

const out = [];

// (1) mat3 operand shapes ------------------------------------------------
out.push("=== A. mat3 statement shapes (dedup, all families) ===");
{
  const seen = new Set();
  // every statement that mentions a mat3-typed value doing * transpose = mat3(...)
  const re = /[^;{}]*(?:\bmat3\b|transpose\s*\()[^;{}]*;/g;
  for (const f of FAMILIES) {
    let m;
    while ((m = re.exec(corpus[f]))) {
      const t = m[0].replace(/[ \t]+/g, " ").trim();
      if (t.length < 4 || t.length > 140) continue;
      const k = t.slice(0, 90);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(f + "  " + t.slice(0, 130));
      }
    }
  }
}

// (2) struct fields -------------------------------------------------------
out.push("\n=== B. struct bodies (field names, so JS mirrors) ===");
{
  const re = /struct\s+(\w+)\s*\{([^}]*)\}/g;
  const seen = new Set();
  for (const f of FAMILIES) {
    let m;
    while ((m = re.exec(corpus[f]))) {
      const fields = m[2]
        .split(";")
        .map((s) => s.replace(/^[\s\S]*?(?:vec[234]|float|int|uint|bool)\s+(\w+).*/, "$1").trim())
        .filter(Boolean);
      const k = m[1] + "{" + fields.join(",") + "}";
      if (!seen.has(k)) {
        seen.add(k);
        out.push(f + "  " + m[0].replace(/\s+/g, " ").trim().slice(0, 110));
      }
    }
  }
}

// (3) array decls (types + sizes) -----------------------------------------
out.push("\n=== C. array declarations (type,name,sizes) ===");
{
  const re = /\b(float|vec2|vec3|vec4|int|uint)\s+(\w+)\s*\[\s*(\w*)\s*\]\s*;?/g;
  const seen = new Set();
  for (const f of FAMILIES) {
    let m;
    let n = 0;
    while ((m = re.exec(corpus[f])) && n < 10) {
      const k = m[1] + " " + m[2] + "[" + m[3] + "]";
      if (!seen.has(k)) {
        seen.add(k);
        out.push(f + "  " + k);
      }
      n++;
    }
  }
}

// (4) swizzle WRITES (real target.swz =, non-compare) ----------------------
out.push("\n=== D. true swizzle writes ===");
{
  const re = /(\w+)\.([xyzw]{2,3})\s*=(?!=)[^;]*;/g;
  for (const f of FAMILIES) {
    let m;
    const seen = new Set();
    while ((m = re.exec(corpus[f]))) {
      const t = m[0].replace(/[ \t]+/g, " ").trim();
      const k = f + " ." + m[2] + "= " + t.slice(0, 26);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(f + "  ." + m[2] + "=  " + t.slice(0, 72));
      }
    }
  }
}

writeFileSync("/tmp/pfacts.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
