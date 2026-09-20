// Last, surgical probe: mat3 operand shapes + real swizzle-writes + fwidth
// shapes + loop heads, distilled from the full transpile corpus (kit+entries,
// comments stripped). Output goes to /tmp/facts.txt via node fs, so nothing
// fights shell quoting. Printed at the end too.
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
for (const f of FAMILIES) corpus[f] = strip(corpus[f]);

const out = [];

// A. mat3 expression SHAPES: find every mat3 var, then every statement that
//    uses mat3-typed vars in a `*` or `transpose` or scaling op.
out.push("=== A. mat3 expression statements (dedup per family) ===");
{
  const matvar = (s) => {
    const set = new Set();
    const re = /\bmat3\s+(\w+)/g;
    let m;
    while ((m = re.exec(s))) set.add(m[1]);
    return set;
  };
  for (const f of FAMILIES) {
    const s = corpus[f];
    const vars = matvar(s);
    if (!vars.size) continue;
    const re = /([^;{}]*\b(?:transpose|\*)[^;{}]*);/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(s))) {
      const line = m[1];
      if (!/mat3|transpose/.test(line)) continue;
      const usesVar = [...vars].some((v) => new RegExp("\\b" + v + "\\b").test(line));
      if (!usesVar) continue;
      const t = line.replace(/[ \t]+/g, " ").trim();
      if (t.length > 4 && !seen.has(t.slice(0, 60))) {
        seen.add(t.slice(0, 60));
        out.push(f + "  " + t.slice(0, 110));
      }
    }
  }
}

// B. REAL swizzle writes: target.xyzw(=2..3) `=` or compound-assign (not ==)
out.push("\n=== B. true swizzle writes (target swizzle = / op=) ===");
{
  const re = /(\b\w+)\.([xyzw]{2,3})\s*(\+|-|\*|\/)?=(?!=)[^;]*;/g;
  const seen = new Set();
  for (const f of FAMILIES) {
    let m;
    while ((m = re.exec(corpus[f]))) {
      const key = f + " ." + m[2];
      const t = m[0].replace(/[ \t]+/g, " ").trim();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(f + "  ." + m[2] + m[3] + "= " + t.slice(0, 76));
      }
    }
  }
}

// C. fwidth argument shapes
out.push("\n=== C. fwidth / dFdx / dFdy argument shapes ===");
{
  const re = /\b(fwidth|dFdx|dFdy)\s*\([^)]*\)/g;
  const seen = new Set();
  for (const f of FAMILIES) {
    let m;
    while ((m = re.exec(corpus[f]))) {
      const t = m[0].replace(/\s+/g, " ");
      const k = f + " " + t.slice(0, 70);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(f + "  " + t.slice(0, 70));
      }
    }
  }
}

// D. loop heads present in corpus (shape check: any while/do/odd-for?)
out.push("\n=== D. loop heads (all families, dedup shapes) ===");
{
  const seen = new Set();
  for (const f of FAMILIES) {
    const re = /\b(for|while|do)\s*\([^;()]*[^)]*\)/g;
    let m;
    while ((m = re.exec(corpus[f]))) {
      const t = m[0].replace(/\s+/g, " ").slice(0, 60);
      const k = (m[1] === "for" ? t.slice(4, 15) : m[1] + t.slice(4));
      if (!seen.has(k) && !/\bwhile\b/.test(t.replace(/^while/, ""))) {
        seen.add(k);
        out.push(f + "  " + t);
      }
      if (m[1] === "while" || m[1] === "do") out.push("  !! " + f + " while/do: " + t);
    }
  }
}

// E. continue / break / discard / ternary-with-vec: quick confirm of zero
out.push("\n=== E. control-flow risk confirm ===");
for (const tok of ["while", "do", "continue", "break", "discard", "dFdx", "dFdy"]) {
  const counts = {};
  for (const f of FAMILIES) counts[f] = (corpus[f].match(new RegExp("\\b" + tok + "\\b", "g")) || []).length;
  out.push(tok + ": " + Object.entries(counts).filter(([, v]) => v).map(([k, v]) => k + "=" + v).join("  "));
}

writeFileSync("/tmp/facts.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
