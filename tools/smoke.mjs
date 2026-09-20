// Node smoke test for the dist classic-script bundle using a minimal DOM shim.
// Covers the Canvas2D fallback path (getContext('webgl2') returns null) and
// the full public API. The real WebGL2 path is exercised in headless Chromium.

const gradStub = { addColorStop() {} };

function fakeCtx() {
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineDashOffset: 0,
    setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {},
    arc() {}, fill() {}, stroke() {}, ellipse() {}, translate() {},
    rotate() {}, save() {}, restore() {}, moveTo() {}, lineTo() {},
    setLineDash() {},
    createRadialGradient() { return gradStub; },
  };
  return ctx;
}

class El {
  constructor() {
    this.children = [];
    this.style = {};
    this._attrs = {};
    this._ctx = null;
  }
  appendChild(c) { this.children.push(c); }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() { return { width: 200, height: 200 }; }
  querySelector() { return null; }
  getAttribute(name) { return this._attrs[name] ?? null; }
  setAttribute(name, value) { this._attrs[name] = value; }
  getContext(kind) {
    if (kind === "webgl2") return null; // force Canvas2D fallback
    if (kind === "2d") {
      if (!this._ctx) this._ctx = fakeCtx();
      return this._ctx;
    }
    return null;
  }
}

class HTMLElementStub {}
const defined = [];

global.self = global;
global.customElements = {
  define(name, cls) { defined.push([name, cls]); },
  whenDefined() { return Promise.resolve(); },
  get() { return undefined; },
};
global.window = {
  devicePixelRatio: 1,
  customElements: global.customElements,
  addEventListener() {},
  removeEventListener() {},
};
global.document = { createElement: () => new El() };
global.HTMLElement = HTMLElementStub;
global.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 16);
global.cancelAnimationFrame = () => {};

import { readFileSync } from "node:fs";
eval(readFileSync(process.argv[2], "utf8"));

const api = global.Murmur;
if (!api) throw new Error("global.Murmur not defined");
console.log("version:", Murmur.version, "| states:", Murmur.STATES.join(","));

const styles = [
  "eddy", "well", "tide", "undertow", "meander", "confluence", "melt", "glaze",
  "bloom", "marbling", "wick", "strata", "halation", "pool", "feather", "palimpsest",
  "caustic", "aurora", "ember", "lantern", "mirage", "oculus", "dapple", "eclipse",
  "murmuration", "loom", "cipher", "tuning", "current", "veil", "echo", "glyph",
  "breathe", "orbit", "glimmer", "vortex", "gather", "stir", "daybreak", "skein",
  "halo", "nucleus", "iris", "filament", "flare", "braid", "mote", "ripple",
  "aura", "droplet", "nebula", "prism", "limn", "duet", "fathom", "arc", "opal",
  "comet", "still", "flux", "tempest", "helix", "geode", "sol", "abyss", "chorus",
];
const glass = new Set(styles.slice(48));
console.log("style count to render through Canvas2D fallback:", styles.length);

let failures = 0;
for (const style of styles) {
  try {
    const el = new El();
    const orb = new Murmur(el, { style, animated: false });
    orb.setState("success");
    orb.setSignals({ level: 0.6, activity: 0.8 });
    orb.setTilt(0.1, -0.2);
    orb.setConfig({ ink: "#0a0a0f", tone: "#6c5ce7", ...(glass.has(style) ? { tone2: "#ffd93d" } : {}) });
    orb.renderStill(1.2);
    orb.destroy();
  } catch (e) {
    failures++;
    console.error("FAIL", style, e && e.stack ? e.stack.split("\n")[0] : e);
  }
}
if (failures) throw new Error(failures + " styles failed");

// API surface
const el = new El();
const orb = new Murmur(el, { style: "aura", animated: false, states: { thinking: { glow: 1.5 } } });
if (orb.currentState !== "thinking") throw new Error("state init wrong");
if (!(el.children.length)) throw new Error("canvas not appended");
orb.setState("listening");
orb.setState("error");
const cfg = Murmur.normalizeConfig({ style: "aura", state: "idle" });
if (cfg.state !== "idle") throw new Error("normalizeConfig state");
Murmur.parseColor("#6c5ce7");
orb.destroy();

// custom element auto-definition happened
if (!defined.some(([name]) => name === "murmur-orb")) throw new Error("murmur-orb not defined");
console.log("custom element murmur-orb:", "defined");

// error paths
let threw = false;
try { new Murmur(new El(), { style: "eddy", tone2: "#fff" }); } catch { threw = true; }
if (!threw) throw new Error("tone2 on non-glass should throw");

console.log("SMOKE_OK — all 66 styles rendered via Canvas2D fallback, API checks passed");