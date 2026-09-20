// Bundles the ESM source into a single classic-script file that needs no
// build step and no module system:
//
//   <script src="dist/murmur.js"></script>
//   const orb = new Murmur.Murmur(document.querySelector("#orb"), { style: "aura" });
//
// The concatenation is safe because every module's imports are declared
// somewhere in the same scope (config -> state -> shaders -> webgl -> canvas
// -> murmur), and no two modules bind the same top-level name. The shader
// sources are giant JS string constants, so no minification is attempted.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT_DIR = join(ROOT, "dist");
const OUT_FILE = "murmur.js";

const FILES = [
  "src/config.js",
  "src/state.js",
  "src/shaders/glsl.mjs",
  "src/webgl.js",
  "src/canvas.js",
  "src/murmur.js",
];

// Turn one ES module into plain statements for the shared IIFE scope:
// drop `import ... from "..."` and strip `export`/`export default` markers.
function unmodule(src) {
  let text = src;
  text = text.replace(/^import[\s\S]*?;\s*$/gm, "");
  text = text.replace(/^export\s+default\s+/gm, "");
  text = text.replace(/^export\s+/gm, "");
  return text.trim();
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const banner = `/*!
 * murmur-vanilla-js v${pkg.version}
 * ${pkg.description}
 * MIT License — https://github.com/krispuckett/murmur
 */
`;

const modules = FILES.map((f) => {
  const src = readFileSync(join(ROOT, f), "utf8");
  const code = unmodule(src);
  return `// === ${f} ===\n${code}`;
});

const wrapper = `(function (global) {
  "use strict";
${modules.join("\n\n")}
})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : globalThis);
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, OUT_FILE), banner + wrapper, "utf8");
console.log(`written ${join(OUT_DIR, OUT_FILE)} (${(banner.length + wrapper.length) / 1024 | 0} kB)`);