// WebGL2 renderer: compiles one GLSL program per style (kit + entry), lazily,
// and draws a fullscreen triangle each frame. Falls back to Canvas2D when the
// context is unavailable.
//
// The shaders are ported verbatim from the Swift package (see tools/metal2glsl.mjs)
// and composed as: prelude + family kit + the style's [[ stitchable ]] entry.

import { KIT, ENTRIES } from "./shaders/glsl.mjs";
import { familyOf, roster, shaderName } from "./config.js";

// Browsers cap how many WebGL contexts can be live at once (Firefox defaults
// to 16 per principal, Chrome evicts the oldest under GPU pressure). A page
// that mounts more orbs than that does not fail cleanly — older contexts get
// lost and shader compilation starts failing, which is what produced repeated
// "shader failed" logs and blank orbs. Keep a budget and route the overflow to
// the Canvas2D renderer instead, deterministically and without noise.
const DEFAULT_CONTEXT_BUDGET = 12;
let contextBudget = DEFAULT_CONTEXT_BUDGET;
let activeContexts = 0;

export function setWebGLContextBudget(n) {
  contextBudget = Math.max(0, n | 0);
}

export function webGLContextBudget() {
  return contextBudget;
}

export function webGLContextsInUse() {
  return activeContexts;
}

// backend: "auto" (best available, budget-aware),
//          "webgl2"  (force WebGL2, ignore the budget),
//          "canvas2d" (force the CPU fallback).
export function createRenderer(canvas, backend = "auto") {
  if (backend === "canvas2d") return null;
  const forced = backend === "webgl2";
  if (!forced && activeContexts >= contextBudget) return null; // budget spent -> Canvas2D
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false });
  if (!gl) return null;
  if (!probeGL(gl)) {
    // A live context that still refuses our ES 3.00 shaders (driver/stub
    // quirk). Surfacing it as null makes the caller roam to the Canvas2D
    // path instead of spamming "shader failed" and staying blank.
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return null;
  }
  activeContexts++;
  return new WebGL2Renderer(gl);
}


const PRELUDE = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  u_size;
uniform float u_time;
uniform float u_pixelScale;
uniform vec4  u_ink;
uniform vec4  u_tone;
uniform float u_hueShift;
uniform float u_formScale;
uniform float u_speed;
uniform float u_depth;
uniform float u_glow;
uniform float u_c0;
uniform float u_c1;
uniform float u_c2;
uniform float u_c3;
uniform float u_epoch;
uniform float u_stateIndex;
uniform float u_stateTau;
uniform float u_level;
uniform float u_activity;
uniform vec2  u_tilt;
uniform vec4  u_tone2;

out vec4 outColor;
`;

const VERT = `#version 300 es
precision highp float;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

function buildFragment(style) {
  const family = familyOf(style);
  const name = shaderName(style);
  const entry = ENTRIES[family][name];
  const glass = family === "glass";
  const main = `
void main() {
  vec2 position = gl_FragCoord.xy / max(u_pixelScale, 1e-6);
  vec4 currentColor = vec4(0.0);
  outColor = ${name}(
    position, currentColor, u_size, u_time, u_pixelScale,
    u_ink, u_tone, u_hueShift, u_formScale, u_speed, u_depth, u_glow,
    u_c0, u_c1, u_c2, u_c3, u_epoch, u_stateIndex, u_stateTau,
    u_level, u_activity${glass ? ", u_tilt, u_tone2" : ""}
  );
}
`;
  return PRELUDE + "\n" + KIT[family] + "\n\n" + entry + "\n" + main;
}

const UNIFORM_NAMES = [
  "u_size", "u_time", "u_pixelScale", "u_ink", "u_tone",
  "u_hueShift", "u_formScale", "u_speed", "u_depth", "u_glow",
  "u_c0", "u_c1", "u_c2", "u_c3", "u_epoch",
  "u_stateIndex", "u_stateTau", "u_level", "u_activity", "u_tilt", "u_tone2",
];

export function isWebGL2Supported() {
  if (typeof WebGL2RenderingContext === "undefined") return false;
  return true;
}

// Compile+link a trivial ES 3.00 program to confirm the context can actually
// compile our shaders. On drivers that report WebGL2 but fail shader
// compilation this returns false and we degrade gracefully.
function probeGL(gl) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, `#version 300 es\nprecision highp float;\nvoid main() { gl_Position = vec4(0.0); }`);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    gl.deleteShader(vs);
    return false;
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, `#version 300 es\nprecision highp float;\nout vec4 fragColor;\nvoid main() { fragColor = vec4(0.0); }`);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return false;
  }
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  const ok = gl.getProgramParameter(p, gl.LINK_STATUS);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.deleteProgram(p);
  return ok;
}

class WebGL2Renderer {
  constructor(gl) {
    this.gl = gl;
    this.programs = new Map(); // style -> { program, uniforms: {name: location} }
    this.current = null;
    // Flip to true after the first compile failure: the context rejects our
    // shaders, so retrying every frame would only re-log and stay blank. The
    // host swaps this orb to the Canvas2D renderer once this is set.
    this.unusable = false;
    // readback disable per renderer unrelated to shaders
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.CULL_FACE);
    this._released = false;
  }

  programFor(style) {
    if (this.unusable) return null;
    let p = this.programs.get(style);
    if (p) return p;
    const frag = buildFragment(style);
    const program = compileProgram(this.gl, VERT, frag, true);
    if (!program) {
      this.programs.set(style, null);
      this.unusable = true;
      console.warn(
        `Murmur: WebGL2 rejected the "${style}" shader; this orb will fall back to Canvas2D.`
      );
      return null;
    }
    const uniforms = {};
    for (const n of UNIFORM_NAMES) uniforms[n] = this.gl.getUniformLocation(program, n);
    p = { program, uniforms, error: null };
    this.programs.set(style, p);
    return p;
  }

  /** Compile every style up front; returns a list of failures. */
  prewarm() {
    const failed = [];
    for (const family of Object.keys(roster)) {
      for (const style of roster[family]) {
        if (!this.programFor(style)) failed.push(style);
      }
    }
    return failed;
  }

  /**
   * @param u plain object of uniform values (u_size etc.).
   */
  render(style, u) {
    const gl = this.gl;
    const p = this.programFor(style);
    if (!p) return;
    if (this.current !== style) {
      gl.useProgram(p.program);
      this.current = style;
    }
    const loc = p.uniforms;
    if (loc.u_size) gl.uniform2f(loc.u_size, u.u_size[0], u.u_size[1]);
    if (loc.u_time) gl.uniform1f(loc.u_time, u.u_time);
    if (loc.u_pixelScale) gl.uniform1f(loc.u_pixelScale, u.u_pixelScale);
    if (loc.u_ink) gl.uniform4f(loc.u_ink, u.u_ink[0], u.u_ink[1], u.u_ink[2], u.u_ink[3]);
    if (loc.u_tone) gl.uniform4f(loc.u_tone, u.u_tone[0], u.u_tone[1], u.u_tone[2], u.u_tone[3]);
    if (loc.u_hueShift) gl.uniform1f(loc.u_hueShift, u.u_hueShift);
    if (loc.u_formScale) gl.uniform1f(loc.u_formScale, u.u_formScale);
    if (loc.u_speed) gl.uniform1f(loc.u_speed, u.u_speed);
    if (loc.u_depth) gl.uniform1f(loc.u_depth, u.u_depth);
    if (loc.u_glow) gl.uniform1f(loc.u_glow, u.u_glow);
    if (loc.u_c0) gl.uniform1f(loc.u_c0, u.u_c0);
    if (loc.u_c1) gl.uniform1f(loc.u_c1, u.u_c1);
    if (loc.u_c2) gl.uniform1f(loc.u_c2, u.u_c2);
    if (loc.u_c3) gl.uniform1f(loc.u_c3, u.u_c3);
    if (loc.u_epoch) gl.uniform1f(loc.u_epoch, u.u_epoch);
    if (loc.u_stateIndex) gl.uniform1f(loc.u_stateIndex, u.u_stateIndex);
    if (loc.u_stateTau) gl.uniform1f(loc.u_stateTau, u.u_stateTau);
    if (loc.u_level) gl.uniform1f(loc.u_level, u.u_level);
    if (loc.u_activity) gl.uniform1f(loc.u_activity, u.u_activity);
    if (loc.u_tilt) gl.uniform2f(loc.u_tilt, u.u_tilt[0], u.u_tilt[1]);
    if (loc.u_tone2) gl.uniform4f(loc.u_tone2, u.u_tone2[0], u.u_tone2[1], u.u_tone2[2], u.u_tone2[3]);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy() {
    if (this._released) return;
    this._released = true;
    activeContexts = Math.max(0, activeContexts - 1);
    const gl = this.gl;
    for (const entry of this.programs.values()) {
      if (entry && entry.program) gl.deleteProgram(entry.program);
    }
    this.programs.clear();
  }
}

function compileProgram(gl, vertSrc, fragSrc, quiet) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vertSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(vs);
    gl.deleteShader(vs);
    if (!quiet) console.error("vertex shader failed:", log);
    return null;
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fragSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(fs);
    gl.deleteShader(fs);
    gl.deleteShader(vs);
    if (!quiet) console.error("fragment shader failed:", log);
    return null;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    if (!quiet) console.error("program link failed:", log);
    return null;
  }
  return program;
}