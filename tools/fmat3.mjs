// Final tiny fact: exact mat3 operand shapes used anywhere in the corpus
// (kit + entries), dedup shapes, family-tagged, one per shape. Plain strings,
// no templates. Writes /tmp/mat3facts.txt
import { writeFileSync } from "node:fs";
import { KIT, ENTRIES } from "../src/shaders/glsl.mjs";

const FAMILIES = Object.keys(KIT);
const corpus = {};
for (const f of FAMILIES) corpus[f] = KIT[f] + "\n" + Object.values(ENTRIES[f]).join("\n");
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/^\s*\n/gm, "");

for (const f of FAMILIES) corpus[f] = strip(corpus[f]);

// find mat3-typed variable names per family (decls)
const matVars = {};
for (const f of FAMILIES) {
  const re = /\bmat3\s+(\w+)/g;
  const set = new Set();
  let m;
  while ((m = re.exec(corpus[f]))) set.add(m[1]);
  matVars[f] = set;
}

const out = [];
const re = /([^;{}]*);/g;
const seen = new Set();
for (const f of FAMILIES) {
  const vars = matVars[f];
  let m;
  let n = 0;
  while ((m = re.exec(corpus[f])) && n < 24) {
    const s = m[1];
    if (!/(?:mat3|transpose)|\*/.test(s)) continue;
    // a statement is interesting if it references a mat var or mat3/transpose kw
    if (!/(?:mat3|transpose)|\*\s*(?:\w+|\(|[0-9])/.test(s)) continue;
    const nameRef = [...vars].some((v) => new RegExp("\\b" + v + "\\b").test(s));
    if (!nameRef && !/\bmat3\b|\btranspose\b/.test(s)) continue;
    const t = s.replace(/[ \t]+/g, " ").trim();
    if (t.length < 3 || t.length > 160) continue;
    const key = f + "|" + t.slice(0, 70);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(f + "  " + t.slice(0, 118));
      n++;
    }
  }
}

// transpose args that are NOT mat (covers all transpose call shapes)
out.push("\n-- transpose() arg types (dedup) --");
{
  const re2 = /transpose\s*\(([^)]*)\)/g;
  const s2 = new Set();
  for (const f of FAMILIES) {
    let m;
    while ((m = re2.exec(corpus[f])) && s2.size < 12) {
      const a = m[1].trim();
      const isMat = /\bmat3\b/.test(a) || /^\w+$/.test(a) && (corpus[f].includes("mat3 " + a) || /\bmat3\s+\w+\s*=/g.test(a) && corpus[f].replace(/^[\s\S]*?export\b/s, "").includes("mat3 " + a));
      out.push("  " + (isMat ? "mat3-arg:  " : "??-arg: ") + a.replace(/\s+/g, " ").slice(0, 40));
    }
  }
}

writeFileSync("/tmp/mat3facts.txt", out.join("\n"), "utf8");
console.log(out.join("\n"));
