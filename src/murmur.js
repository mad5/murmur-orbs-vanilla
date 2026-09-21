// The vanilla-JS port of MurmurView: one driver, two backends.
//
//   WebGL2                    primary backend, all 66 styles
//   Canvas2D (CPU rasterizer) fallback, graceful degradation
//
// The public surface mirrors the Swift package:
//   new Murmur(el, config) -> driving instance, exactly like MurmurView(config)
//   .setState("thinking")   -> like `state:` binding
//   .setSignals(...)        -> like `signals:`
//   .setConfig(partial)     -> like rebuilding the configuration
//   .setTilt(...)           -> like `tilt:`, glass family parallax
//   .destroy()              -> teardown
//   <murmur-orb>            -> custom element wrapper

import { characterDefaults, hasArc, isGlass } from "./config.js";
import {
  SIGNALS,
  SignalEnvelope,
  STATES,
  blendParameters,
  clampSignals,
  ease,
  entryByName,
  entryDuration,
  phaseThrough,
  restartsArc,
  seedParameters,
  shaderIndex,
} from "./state.js";
import {
  createRenderer,
  setWebGLContextBudget,
  webGLContextBudget,
  webGLContextsInUse,
} from "./webgl.js";
import { createCanvasRenderChecker, createCanvasRenderer } from "./canvas.js";

const DEFAULT_INK = { r: 0.039, g: 0.039, b: 0.043, a: 1 };
const DEFAULT_TONE = { r: 0.424, g: 0.388, b: 0.91, a: 1 };

export const version = "0.1.0";

// -- configuration ------------------------------------------------------------

// Accepts sRGB components as floats or as "#RRGGBB" / "#RRGGBBAA" / "#RGB".
export function parseColor(color, fallback) {
  if (color == null) return fallback ? { ...fallback } : null;
  if (typeof color === "string") {
    const m = color.match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{8}|[0-9a-fA-F]{3})$/);
    if (!m) throw new Error(`bad color: ${color}`);
    return parseHexColor(color.replace("#", ""));
  }
  const { r = 0, g = 0, b = 0, a = 1 } = color;
  return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
}

function parseHexColor(hex) {
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const v = parseInt(hex, 16);
  const bytes = [
    (v >> 16) & 255,
    (v >> 8) & 255,
    v & 255,
    hex.length === 8 ? (v >> 24) & 255 : 255,
  ];
  return {
    r: bytes[0] / 255,
    g: bytes[1] / 255,
    b: bytes[2] / 255,
    a: bytes[3] / 255,
  };
}

export function toRGBArray(c) {
  return [c.r, c.g, c.b, c.a];
}

function normalizeStates(config, style) {
  const states = {};
  for (const s of STATES) states[s] = { ...seedParameters(s, style) };
  if (config.states) {
    for (const s of Object.keys(config.states)) {
      if (!STATES.includes(s)) throw new Error(`unknown state: ${s}`);
      states[s] = {
        ...states[s],
        ...config.states[s],
        character: config.states[s].character
          ? normalizeCharacter(config.states[s].character, style)
          : states[s].character,
      };
    }
  }
  return states;
}

function normalizeCharacter(ch, style) {
  const defaults = characterDefaults(style);
  if (Array.isArray(ch)) {
    return defaults.map((d, i) => (i < ch.length ? Number(ch[i]) : d));
  }
  if (typeof ch === "object" && ch !== null) {
    // Partial overlay { c0: .., c3: .. } onto the style's tuned defaults.
    const out = defaults.slice();
    for (const key of Object.keys(ch)) {
      const i = Number(key.replace(/^c/i, ""));
      if (Number.isInteger(i)) out[i] = Number(ch[key]);
    }
    return out;
  }
  throw new Error("character must be a 4-value array or { c0..c3 } overlay");
}

function normalizeEntries(config) {
  const entries = { idle: "none", listening: "none", thinking: "wake", responding: "none", success: "swell", error: "stutter" };
  if (config.entries) {
    for (const s of Object.keys(config.entries)) {
      if (!STATES.includes(s)) throw new Error(`unknown state: ${s}`);
      entries[s] = config.entries[s];
    }
  }
  return entries;
}

export function normalizeConfig(config) {
  const cfg = config || {};
  if (!cfg.style) throw new Error("Murmur requires a style (see src/config.js roster)");
  if (!isGlass(cfg.style) && cfg.tone2 != null) throw new Error("tone2 is glass-family only");
  const backend = cfg.backend === "webgl2" ? "webgl2" : cfg.backend === "canvas2d" ? "canvas2d" : "auto";
  if (backend === "webgl2" && typeof WebGL2RenderingContext === "undefined") {
    throw new Error("Murmur: backend 'webgl2' requested but WebGL2 is not supported here");
  }
  return {
    style: cfg.style,
    backend,
    ink: parseColor(cfg.ink, DEFAULT_INK),
    tone: parseColor(cfg.tone, DEFAULT_TONE),
    tone2: cfg.tone2 != null ? parseColor(cfg.tone2, null) : null,
    state: STATES.includes(cfg.state) ? cfg.state : "thinking",
    states: normalizeStates(cfg, cfg.style),
    entries: normalizeEntries(cfg),
    fps: cfg.fps ?? 30,
    animated: cfg.animated !== false,
    stillTime: cfg.stillTime ?? 4,
    preserveDrawingBuffer: cfg.preserveDrawingBuffer === true,
  };
}

// -- element plumbing ------------------------------------------------------------

function appendCanvas(container) {
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.borderRadius = "50%";
  const existing = container.querySelector(":scope > canvas");
  if (existing) container.removeChild(existing);
  container.appendChild(canvas);
  container.style.position = container.style.position || "relative";
  container.style.position = "relative";
  container.style.overflow = "hidden";
  container.style.borderRadius = "50%";
  return canvas;
}

// -- the driver ---------------------------------------------------------------

export class Murmur {
  constructor(container, config, { backgroundColor } = {}) {
    if (typeof container === "string") {
      container = document.querySelector(container);
    }
    if (!container || !container.appendChild) {
      throw new Error("Murmur needs an element to render into");
    }
    this.element = container;
    this.config = normalizeConfig(config);
    this.signals = clampSignals(config?.signals ?? null);
    this.tilt = { x: config?.tilt?.x ?? 0, y: config?.tilt?.y ?? 0 };
    this.backgroundColor = parseColor(backgroundColor, null);

    this.canvas = appendCanvas(container);
    this.pixelScale = window.devicePixelRatio || 1;

    this.renderer = createRenderer(this.canvas, this.config.backend, {
      preserve: this.config.preserveDrawingBuffer,
    });
    this.usingCanvas2D = !this.renderer;
    if (this.renderer) {
      this.canvas.addEventListener("webglcontextlost", this._onContextLost);
    } else if (this.config.backend === "webgl2") {
      console.warn(
        "Murmur: WebGL2 requested (backend: 'webgl2') but no working context could be created; using the Canvas2D fallback."
      );
    }
    if (!this.renderer) {
      const renders = createCanvasRenderChecker();
      if (!renders) {
        throw new Error("neither WebGL2 nor Canvas2D is available here");
      }
      this.renderer = createCanvasRenderer(this.canvas, this.config);
    }

    // Clock state, mirroring MurmurView's @State trio.
    const now = performance.now();
    this.birth = now;
    this.stateChangedAt = now;
    this.previousState = this.config.state;
    this.state = this.config.state;
    this.phaseAtChange = 0;
    this.envelope = new SignalEnvelope();

    this._raf = null;
    this._lastRender = -Infinity;
    this._resizeObserver = null;

    this._onResize = () => this._resize();
    this._onContextLost = (e) => {
      e.preventDefault();
      this._fallbackToCanvas();
    };
    this._resize();

    if (this.config.animated) {
      const interval = 1000 / Math.max(this.config.fps, 1);
      const tick = (nowMs) => {
        if (!this._raf) return;
        if (nowMs - this._lastRender >= interval) {
          this._frame(nowMs);
        }
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    } else {
      this._frame(performance.now());
    }

    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._onResize());
      this._resizeObserver.observe(this.element);
    }
  }

  _resize() {
    const rect = this.element.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === 0 || h === 0) return;
    const pw = Math.round(w * this.pixelScale);
    const ph = Math.round(h * this.pixelScale);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this._size = [w, h];
    this._backing = [pw, ph];
    if (!this.config.animated) this._frame(performance.now());
  }

  // -- public API ----------------------------------------------------------

  get style() {
    return this.config.style;
  }

  get currentState() {
    return this.state;
  }

  get backend() {
    return this.usingCanvas2D ? "canvas2d" : "webgl2";
  }

  setState(next) {
    if (!STATES.includes(next)) throw new Error(`unknown state: ${next}`);
    if (next === this.state) return;
    const now = performance.now();
    this.phaseAtChange += phaseThrough(
      (now - this.stateChangedAt) / 1000,
      this.paramsFor(this.previousState),
      this.paramsFor(this.state),
      this.entriesFor(this.state)
    );
    this.previousState = this.state;
    this.stateChangedAt = now;
    this.state = next;
    if (restartsArc(next) && hasArc.has(this.config.style)) {
      this.birth = now;
      this.phaseAtChange = 0;
      this.envelope.resetPhase();
    }
    this._touch();
  }

  setSignals(signals) {
    this.signals = clampSignals(signals);
    this._touch();
  }

  setTilt(x, y) {
    this.tilt = { x: Number(x ?? 0), y: Number(y ?? 0) };
    this._touch();
  }

  setConfig(partial) {
    const prev = this.config;
    // Keep every dial the designer already set; only the named slices move.
    const styleChanged = !!partial?.style && partial.style !== prev.style;
    let states = { ...prev.states, ...(partial?.states ?? {}) };
    if (styleChanged) {
      // withStyle semantics: the old knobs meant something else entirely.
      for (const s of STATES) {
        states[s] = { ...states[s], character: characterDefaults(partial.style) };
      }
    }
    this.config = normalizeConfig({
      style: partial?.style ?? prev.style,
      backend: partial?.backend ?? prev.backend,
      ink: partial?.ink ?? toColor(prev.ink),
      tone: partial?.tone ?? toColor(prev.tone),
      tone2: partial?.tone2 ?? (prev.tone2 ? toColor(prev.tone2) : undefined),
      states,
      entries: { ...prev.entries, ...(partial?.entries ?? {}) },
      state: prev.state,
      fps: partial?.fps ?? prev.fps,
      animated: partial?.animated ?? prev.animated,
      stillTime: partial?.stillTime ?? prev.stillTime,
    });
    this._touch();
  }

  /** Render one deterministic frame. `time` is the shader clock in seconds. */
  renderStill(time) {
    this._frameAt(performance.now(), { timeOverride: time });
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = null;
    window.removeEventListener("resize", this._onResize);
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this._onContextLost);
      if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      this.canvas = null;
    }
    this.renderer.destroy?.();
    this.renderer = null;
  }

  // -- internals ------------------------------------------------------------

  paramsFor(state) {
    return this.config.states[state] ?? seedParameters(state, this.config.style);
  }

  entriesFor(state) {
    return this.config.entries[state];
  }

  _hasSize() {
    return this._size && this._size[0] > 0 && this._size[1] > 0;
  }

  _touch() {
    // Force an immediate frame so an API call is visible right away rather
    // than at the next rAF interval.
    if (this._raf) this._frame(performance.now());
  }

  // WebGL gave up (context lost, or the driver rejects our shaders). Swap the
  // orb over to the Canvas2D renderer so it keeps living instead of going blank.
  _fallbackToCanvas() {
    if (this.usingCanvas2D || !this.renderer) return;
    if (this.canvas) this.canvas.removeEventListener("webglcontextlost", this._onContextLost);
    this.renderer.destroy?.();
    this.renderer = null;
    // appendCanvas removes the old canvas (and its possibly-lost WebGL
    // buffer) and appends a fresh one, so a 2D context is never blocked.
    const fresh = appendCanvas(this.element);
    this.canvas = fresh;
    this.renderer = createCanvasRenderer(fresh);
    this.usingCanvas2D = true;
    this._resize();
  }

  _frame(nowMs) {
    this._frameAt(nowMs, {});
  }

  _frameAt(nowMs, { timeOverride } = {}) {
    if (!this._hasSize()) return;

    const tau = (nowMs - this.stateChangedAt) / 1000;
    const from = this.paramsFor(this.previousState);
    const to = this.paramsFor(this.state);
    const entry = entryByName(this.entriesFor(this.state));
    const design = blendParameters(from, to, ease(tau));

    const tempo = design.speed * entry.speedBoost(tau);
    const run = this.phaseAtChange + phaseThrough(tau, from, to, entry);
    const base = Math.max(run + entry.phaseOffset(tau) * to.speed, 0);
    const live = this.envelope.step(this.signals, nowMs, tempo);
    const quickened = tempo * (1 + SIGNALS.activitySpeedLift * live.activity);
    const glow =
      design.glow *
      entry.glowBoost(tau) *
      (1 + SIGNALS.levelGlowLift * live.level);

    this._lastRender = nowMs;

    const _ink = this.backgroundColor || this.config.ink;
    const u = {
      u_size: this._size,
      u_time:
        timeOverride != null
          ? timeOverride
          : (base + this.envelope.extraPhase) / Math.max(quickened, 1e-6),
      u_pixelScale: this.pixelScale,
      u_ink: toRGBArray(_ink),
      u_tone: toRGBArray(this.config.tone),
      u_hueShift: design.hueShift,
      u_formScale: design.formScale,
      u_speed: quickened,
      u_depth: design.depth,
      u_glow: glow,
      u_c0: design.character[0],
      u_c1: design.character[1],
      u_c2: design.character[2],
      u_c3: design.character[3],
      u_epoch: 0,
      u_stateIndex: shaderIndex(this.state),
      u_stateTau: Math.max(tau, 0),
      u_level: live.level,
      u_activity: live.activity,
      u_tilt: [this.tilt.x, this.tilt.y],
      u_tone2: this.config.tone2 ? toRGBArray(this.config.tone2) : toRGBArray(this.config.tone),
    };

    if (this.renderer?.unusable && !this.usingCanvas2D) {
      this._fallbackToCanvas();
    }
    this.renderer.render(this.config.style, u);
  }
}

function toColor(rgba) {
  return { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a };
}

// -- custom element -------------------------------------------------------------

const hasCustomElements = typeof window !== "undefined" && "customElements" in window;
let defined = false;

export function defineMurmurElement() {
  if (!hasCustomElements || defined) return;
  defined = true;
  class MurmurOrbElement extends HTMLElement {
    static get observedAttributes() {
      return ["state", "level", "activity", "tilt-x", "tilt-y", "signals", "config"];
    }

    connectedCallback() {
      if (this._murmur) return;
      this._parseConfig();
      this._murmur = new Murmur(this, this._config);
      this._applyAttrState();
      this._applyAttrSignals();
      this._applyAttrTilt();
    }

    disconnectedCallback() {
      if (this._murmur) {
        this._murmur.destroy();
        this._murmur = null;
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      if (!this._murmur) return;
      if (name === "state") this._applyAttrState();
      if (name === "level" || name === "activity") this._applyAttrSignals();
      if (name === "tilt-x" || name === "tilt-y") this._applyAttrTilt();
      if (name === "signals") this._applyAttrSignals();
      if (name === "config") {
        this._parseConfig();
        this._murmur.setConfig(this._config);
      }
    }

    _parseConfig() {
      const attr = this.getAttribute("config");
      const parsed = attr ? JSON.parse(attr) : {};
      this._config = {
        style: this.getAttribute("style-name") || parsed.style || "aura",
        ...parsed,
      };
    }

    _applyAttrState() {
      const s = this.getAttribute("state");
      if (s) this._murmur.setState(s);
    }

    _applyAttrSignals() {
      const m = this._murmur;
      const level = attrFloat(this, "level");
      const activity = attrFloat(this, "activity");
      const raw = this.getAttribute("signals");
      if (raw) {
        const s = JSON.parse(raw);
        m.setSignals({ ...s, ...(level != null ? { level } : {}), ...(activity != null ? { activity } : {}) });
        return;
      }
      if (level != null || activity != null) {
        m.setSignals({ level: level ?? 0, activity: activity ?? 0 });
      }
    }

    _applyAttrTilt() {
      const x = attrFloat(this, "tilt-x") ?? 0;
      const y = attrFloat(this, "tilt-y") ?? 0;
      if (x !== 0 || y !== 0) this._murmur.setTilt(x, y);
    }
  }
  customElements.define("murmur-orb", MurmurOrbElement);
  return MurmurOrbElement;
}

function attrFloat(el, name) {
  const v = el.getAttribute(name);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// -- module surface -------------------------------------------------------------

Murmur.version = version;
Murmur.STATES = STATES;
Murmur.parseColor = parseColor;
Murmur.normalizeConfig = normalizeConfig;
Murmur.defineMurmurElement = defineMurmurElement;
Murmur.setWebGLContextBudget = setWebGLContextBudget;
Murmur.webGLContextBudget = webGLContextBudget;
Murmur.webGLContextsInUse = webGLContextsInUse;
export default Murmur;
if (typeof self !== "undefined") {
  self.Murmur = Murmur;
  defineMurmurElement();
}