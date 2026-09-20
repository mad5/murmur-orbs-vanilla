// Transcribes the Swift package's Metal shader packs to GLSL ES 3.00.
//
// The Material/Metal and GLSL ES 3.00 shading languages are close enough that
// the port is mechanical. This script is that mechanism, kept instead of a
// by-hand transcription so the two stay in sync: rerun `node tools/metal2glsl.mjs`
// after the .metal files change.
//
// The output (src/shaders/glsl.mjs) is the single source of truth the WebGL2
// renderer compiles and the Canvas2D fallback transpiler reads.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHADER_DIR = join(HERE, "..", "..", "murmur", "Sources", "Murmur", "Shaders");
const OUT_DIR = join(HERE, "..", "src", "shaders");

const PACKS = [
  ["liquid", "MurmurLiquid.metal"],
  ["ink", "MurmurInk.metal"],
  ["light", "MurmurLight.metal"],
  ["signal", "MurmurSignal.metal"],
  ["orb", "MurmurOrb.metal"],
  ["presence", "MurmurPresence.metal"],
  ["glass", "MurmurGlass.metal"],
];

// -- preprocessing -----------------------------------------------------------

function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (src[i] === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      i = end < 0 ? src.length : end + 1;
    } else {
      out += src[i++];
    }
  }
  return out;
}

function preprocess(src) {
  let text = stripComments(src);
  text = text
    .split("\n")
    .filter((l) => !/^\s*#include\b/.test(l) && !/\busing namespace metal\s*;/.test(l))
    .join("\n");
  return text;
}

// -- top-level item splitting ------------------------------------------------

function topLevelItems(src) {
  const items = [];
  let i = 0;
  let cut = 0;
  const n = src.length;

  const flush = (end) => {
    const seg = src.slice(cut, end);
    if (!/^\s*$/.test(seg)) items.push(seg);
    cut = end;
  };

  while (i < n) {
    const ch = src[i];
    if (ch === "#") {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? n : end;
      items.push(src.slice(cut, stop));
      cut = stop;
      i = stop;
      continue;
    }
    if (ch === "{") {
      let j = i + 1;
      let d = 1;
      while (j < n && d > 0) {
        if (src[j] === "{") d++;
        else if (src[j] === "}") d--;
        j++;
      }
      // Keep the declaration (signature) with the brace group it opens:
      // a top-level '{' can only follow a function/struct/constant
      // declaration, so decl + body always belongs together. Splitting them
      // would orphan every [[ stitchable ]] entry signature from its body.
      items.push(src.slice(cut, j));
      cut = j;
      i = j;
      continue;
    }
    if (ch === ";" ) {
      i++;
      flush(i);
      continue;
    }
    i++;
  }
  flush(n);

  // A struct's trailing ';' ends up as an empty segment; merge it back onto the
  // preceding struct item so the GLSL declaration stays legal.
  const merged = [];
  for (const item of items) {
    if (/^\s*;\s*$/.test(item) && /struct\s+[\w]+\s*\{[\s\S]*\}$/.test(merged[merged.length - 1] ?? "")) {
      merged[merged.length - 1] += item;
    } else if (item.trim().length > 0) {
      merged.push(item);
    }
  }
  return merged;
}

// -- expression rewrites --------------------------------------------------------

// Find the top-level arguments of `name(...)` at `openIdx` (the index of the
// '('). Returns an array of raw substring slices.
function callArgs(text, openIdx) {
  const args = [];
  let i = openIdx + 1;
  let d = 1;
  let start = i;
  while (i < text.length && d > 0) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
    if (d === 0) {
      args.push(text.slice(start, i).trim());
    } else if (c === "," && d === 1) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
    i++;
  }
  return { args, end: i };
}

// Rewrite every call to `name(` using fn(args, fullText, openIdx) -> text.
function rewriteCalls(text, name, fn) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf(name + "(", i);
    if (at < 0) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, at);
    const { args, end } = callArgs(text, at + name.length);
    out += fn(args, at);
    i = end;
  }
  return out;
}

// -- the identifier/type layer -----------------------------------------------------

const TYPE_RENAMES = [
  [/\bhalf4\b/g, "vec4"],
  [/\bhalf3\b/g, "vec3"],
  [/\bhalf2\b/g, "vec2"],
  [/\bhalf\b/g, "float"],
  [/\bfloat4x4\b/g, "mat4"],
  [/\bfloat3x3\b/g, "mat3"],
  [/\bfloat2x2\b/g, "mat2"],
  [/\bfloat4\b/g, "vec4"],
  [/\bfloat3\b/g, "vec3"],
  [/\bfloat2\b/g, "vec2"],
  [/\bint3\b/g, "ivec3"],
  [/\bint2\b/g, "ivec2"],
  [/\buint3\b/g, "uvec3"],
  [/\buint2\b/g, "uvec2"],
];

function renameTypes(text) {
  let t = text;
  for (const [re, repl] of TYPE_RENAMES) t = t.replace(re, repl);
  return t;
}

// Metal identifiers that collide with GLSL ES 3.00 reserved words. Applies only
// to the preprocessed code (comments already stripped), on whole words.
const RESERVED_IDENTIFIERS = ["patch"];

function renameReservedIdentifiers(text) {
  let t = text;
  for (const word of RESERVED_IDENTIFIERS) {
    t = t.replace(new RegExp("\\b" + word + "\\b", "g"), word + "_");
  }
  return t;
}

function rewriteBase(text) {
  let t = text;
  t = t.replace(/\bconstant\b/g, "const");
  t = t.replace(/\bstatic\s+inline\b/g, "").replace(/\bstatic\b/g, "");
  t = t.replace(/\bM_PI_F\b/g, "3.141592653589793");
  // Metal half-suffixed literals (1.0h) -> plain
  t = t.replace(/(\b\d+(?:\.\d+)?)h\b/g, "$1");
  // atan2(y, x) -> atan(y, x)
  t = t.replace(/\batan2\(/g, "atan(");
  // rsqrt(x) -> inversesqrt(x)   [no rsqrt in GLSL ES 3.00]
  t = t.replace(/\brsqrt\(/g, "inversesqrt(");

  // Rewrite passes must run repeatedly so nested calls resolve innermost-first.
  for (let round = 0; round < 8; round++) {
    const before = t;

    // select(a, b, cond) -> (cond ? b : a)   [Metal b is returned when cond true]
    // GLSL has no bool vectors in ternary conditions, and no vec?bools: when
    // `cond` is a component-wise comparison (Metal legal, e.g. `c > 0.04045`)
    // convert it into a float mask with step() and drop to mix().
    t = rewriteCalls(t, "select", (args) => {
      if (args.length !== 3) throw new Error("select with !=3 args: " + args.join("|"));
      const m = /^\s*(.+?)\s*(>|<|>=|<=)\s*(.+?)\s*$/.exec(args[2]);
      if (m) {
        const [, lhs, op, rhs] = m;
        const mask =
          op === ">" || op === ">=" ? `step((${rhs}), (${lhs}))` : `step((${lhs}), (${rhs}))`;
        return `mix((${args[0]}), (${args[1]}), ${mask})`;
      }
      return `((${args[2]}) ? (${args[1]}) : (${args[0]}))`;
    });
    // fma(a, b, c) -> (a * b + c)      [no fma in GLSL ES 3.00]
    t = rewriteCalls(t, "fma", (args) => {
      if (args.length !== 3) throw new Error("fma with !=3 args");
      return `((${args[0]}) * (${args[1]}) + (${args[2]}))`;
    });
    // saturate(x) -> clamp(x, 0, 1)    [not a GLSL function]
    t = rewriteCalls(t, "saturate", (args) => `clamp(${args[0]}, 0.0, 1.0)`);
    // Metal pow(vec, scalar) broadcasts the exponent; GLSL ES 3.00 has no such
    // overload. `x * 0.0 + e` forces the exponent into x's domain. Already
    // rewritten calls end up with an exponent containing `* 0.0 +`; skip them
    // so the fixed-point loop does not stack parens forever.
    t = rewriteCalls(t, "pow", (args) => {
      if (args.length !== 2) throw new Error("pow with !=2 args");
      if (args[1].indexOf("* 0.0 +") !== -1) return `pow(${args[0]}, ${args[1]})`;
      return `pow((${args[0]}), ((${args[0]}) * 0.0 + (${args[1]})))`;
    });

    if (t === before) break;
  }
  return t;
}

// -- classification ------------------------------------------------------------

const ENTRY_RE = /^\[\[\s*stitchable\s*\]\]/;

function classify(item) {
  const open = item.indexOf("{");
  const decl = open < 0 ? item : item.slice(0, open);
  if (ENTRY_RE.test(decl.trimStart())) {
    let stripped = decl.trim().replace(/^\s*\[\[\s*stitchable\s*\]\]\s*/, "");
    const name = /^[^\s]+\s+(\w+)\s*\(/.exec(stripped);
    if (!name) throw new Error("cannot parse entry name from: " + decl);
    return { kind: "entry", name: name[1], decl: stripped, body: item.slice(open) };
  }
  return { kind: "helper", decl, body: open < 0 ? "" : item.slice(open) };
}

// -- main ---------------------------------------------------------------------

const kits = {};
const entries = {};

for (const [family, file] of PACKS) {
  const src = readFileSync(join(SHADER_DIR, file), "utf8");
  const items = topLevelItems(preprocess(src));

  const helpers = [];
  const e = {};
  for (const item of items) {
    const transformed = renameReservedIdentifiers(renameTypes(rewriteBase(item)));
    const cls = classify(transformed);
    if (cls.kind === "entry") {
      const full = cls.decl + cls.body;
      // strip the [[ stitchable ]] marker
      const stripped = full.replace(/^\[\[\s*stitchable\s*\]\]\s*/, "");
      e[cls.name] = stripped;
    } else {
      helpers.push(transformed);
    }
  }

  const kitText = helpers.join("\n");
  kits[family] = kitText;

  const styleNames = Object.keys(e).sort();
  console.log(`${family}: ${styleNames.length} entries, kit ${kitText.length} chars`);
  entries[family] = e;
}

// sanity pass: anything that should have been rewritten must be gone
for (const family of Object.keys(kits)) {
  const all = kits[family] + "\n" + Object.values(entries[family]).join("\n");
  for (const pat of [/\bhalf\d?\b/, /\bselect\(/, /\bfma\(/, /\bsaturate\(/, /\batan2\(/, /\bM_PI_F\b/]) {
    if (pat.test(all)) {
      const m = all.split("\n").findIndex((l) => pat.test(l));
      throw new Error(`${family}: leftover ${pat} at line ${m}`);
    }
  }
}

const out = `// GENERATED by tools/metal2glsl.mjs — do not edit by hand.
// Ported from murmur/Sources/Murmur/Shaders/*.metal (GLSL ES 3.00).

export const KIT = ${JSON.stringify(kits)};

export const ENTRIES = ${JSON.stringify(entries)};
`;

writeFileSync(join(OUT_DIR, "glsl.mjs"), out, "utf8");
console.log("written src/shaders/glsl.mjs");