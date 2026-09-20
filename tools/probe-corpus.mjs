// Probe: exact shape of the generated corpus, the things the transpiler must
// consume. Reads src/shaders/glsl.mjs and prints a small report to /tmp/corpus.txt
import { writeFileSync } from "node:fs";
import { KIT, ENTRIES } from "../src/shaders/glsl.mjs";

const F = Object.keys(KIT);
const lines = [];
lines.push("families: " + F.join(","));
for (const f of F) lines.push(f + " entries: " + Object.keys(ENTRIES[f]).join(","));

// Sample a full entry body (glass family arc for the swizzle + mat? none) and
// the head of KIT.liquid to see how helpers + entry bodies are laid out.
lines.push("\n=== KIT.liquid: first 60 lines ===");
lines.push(KIT.liquid.split("\n").slice(0, 60).join("\n"));

// An entry body: show mh_aura fully (it had mat? no; shows structs for glass)
lines.push("\n=== ENTRIES.glass.mh_aura (full) ===");
const aura = ENTRIES.glass["mh_aura"];
lines.push(typeof aura === "string" ? aura : JSON.stringify(aura).slice(0, 200));

// Confirm: are entry values full function source (with body)?
const first = ENTRIES.liquid["ml_eddy"];
lines.push("\n=== ENTRIES.liquid.ml_eddy (first 500 chars) ===");
lines.push(first.slice(0, 500));

// struct count inside one glass kit
lines.push("\n=== KIT.glass: struct decls ===");
{
  const re = /struct\s+(\w+)\s*\{[^}]*\}/g;
  let m;
  const n = [];
  while ((m = re.exec(KIT.glass))) n.push(m[0]);
  lines.push(n.length ? n.join("\n---\n") : "(none)");
}

// mat3 usage inside liquid kit + entries (statements)
lines.push("\n=== KIT.liquid + entries: mat3 / transpose / swizzle-write statement shapes ===");
{
  const s = KIT.liquid + "\n" + Object.values(ENTRIES.liquid).join("\n");
  const re = /[^;{}]*(?:mat3|transpose|\.(?:xy|yz|x|y|z|xy|yz|xyz)\s*=(?!=))[^;{}]*;/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(s))) {
    const t = m[0].replace(/[ \t]+/g, " ").trim();
    if (/mat3|transpose/.test(t)) {
      const k = t.slice(0, 60);
      if (!seen.has(k)) {
        seen.add(k);
        lines.push("  " + t.slice(0, 120));
      }
    }
  }
}

// swizzle-writes of vec2/vec3 len: full list 2..3 char swizzle targets with "="
lines.push("\n=== ALL true swizzle writes (.xx? no, [xyzw]{2,3} =) ===");
{
  const re = /(\w+)\.([xyzw]{2,3})\s*=(?!=)[^;]*;/g;
  for (const f of F) {
    const s = KIT[f] + "\n" + Object.values(ENTRIES[f]).join("\n");
    let m;
    const seen = new Set();
    while ((m = re.exec(s))) {
      const k = f + " ." + m[2] + " " + m[0].replace(/[ \t]+/g, " ").trim().slice(0, 40);
      if (!seen.has(k)) { seen.add(k); lines.push(k); }
    }
  }
}

// uint-op statements: exact snippet per family (the `u` suffix + hex consts)
lines.push("\n=== uint-op snippets (dedup, first families) ===");
{
  const re = /[^;{}]*(?:uvec[234]|uint\(|1597334673u|3812015801u|2246822519u|2798796415u|3266489917u|668265263u|374761393u|&\s*[0-9a-fx]+u?|>>\s*\d+u?(?![a-z]))[^;{}]*;/g;
  const seen = new Set();
  for (const f of F) {
    const s = KIT[f] + "\n" + Object.values(ENTRIES[f]).join("\n");
    let m;
    let n = 0;
    while ((m = re.exec(s)) && n < 3) {
      const t = m[0].replace(/[ \t]+/g, " ").trim();
      const k = f + "|" + t.slice(0, 80);
      if (!seen.has(k)) { seen.add(k); lines.push(k); n++; }
    }
  }
}

writeFileSync("/tmp/corpus.txt", lines.join("\n"), "utf8");
console.log(lines.join("\n"));
