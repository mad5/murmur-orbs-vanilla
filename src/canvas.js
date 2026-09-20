// Canvas2D CPU fallback renderer.
//
// Keeps the Murmur presence readable when WebGL2 is unavailable: each style
// family gets a recognisable silhouette and the same uniform-driven motion,
// but rendered with 2D gradients instead of GLSL. Deliberately inexpensive —
// a handful of paint calls per frame, no per-pixel work.
//
// Public surface (imported by murmur.js):
//   createCanvasRenderChecker() -> bool, can we draw at all?
//   createCanvasRenderer(canvas) -> { render(style, u), destroy() }

import { familyOf } from "./config.js";

export function createCanvasRenderChecker() {
  const c = document.createElement("canvas");
  return !!(c.getContext && c.getContext("2d"));
}

export function createCanvasRenderer(canvas) {
  return new CanvasRenderer(canvas);
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * clamp01(t);

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  const hue = (x) => {
    x = ((x % 1) + 1) % 1;
    const k = (x * 6 + 1) % 6;
    return l - s * l * Math.min(Math.max(Math.min(k, 4 - k, 1), 0), 1);
  };
  if (s === 0) return [l, l, l];
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const c1 = hue(h);
  return [
    l - c * 0.5 + c * Math.max(0, 1 - c1 * 2),
    l - c * 0.5 + c * Math.max(0, 1 - (c1 * 2 + s > 1 ? 0 : c1 * 2)),
    l - c * 0.5 + c * Math.max(0, 1 - c1 * 2),
  ].map((x) => clamp01(x));
}

class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  destroy() {
    this.ctx = null;
    this.canvas = null;
  }

  render(style, u) {
    const ctx = this.ctx;
    if (!ctx) return;

    const family = this.styleFamily(style);
    const [w, h] = u.u_size;
    const ps = Math.max(u.u_pixelScale || 1, 1);

    ctx.setTransform(ps, 0, 0, ps, 0, 0);

    const ink = u.u_ink;
    const tone = this.hueShifted(u.u_tone, u.u_hueShift);
    const tone2 = u.u_tone2 ? this.hueShifted(u.u_tone2, u.u_hueShift) : tone;

    ctx.fillStyle = this.rgba(ink);
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const base = Math.min(w, h);
    const form = 0.44 + 0.2 * clamp01(u.u_formScale);
    const R = Math.max(base * 0.5 * form, 2);
    const level = clamp01(u.u_level);
    const activity = clamp01(u.u_activity);
    const glow = clamp01(u.u_glow) * (0.55 + 0.6 * level);
    const phase = Math.max(u.u_time || 0, 0) * Math.max(u.u_speed || 1, 0);
    const stateTau = Math.max(u.u_stateTau || 0, 0);
    const stateIndex = u.u_stateIndex || 2;
    const knobs = [u.u_c0, u.u_c1, u.u_c2, u.u_c3].map(clamp01);

    const done = (stateIndex > 3.5 && stateIndex < 4.5) ? smooth01(stateTau / 1.2) : 0;

    // -- glow halo -----------------------------------------------------------
    this.radialGrad(ctx, cx, cy, R * 0.05, R * 2.0, [
      [0, this.rgba(tone, 0.16 + 0.34 * glow)],
      [1, this.rgba(ink, 0)],
    ]);
    ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);

    const fam = family === "liquid" ? this.liquid
      : family === "ink" ? this.ink
      : family === "light" ? this.light
      : family === "signal" ? this.signal
      : family === "orb" ? this.orb
      : family === "presence" ? this.presence
      : this.glass;

    fam.call(this, {
      ctx, cx, cy, R, base, phase, level, activity, glow, tone, tone2, ink,
      knobs, stateTau, done, ps, tilt: u.u_tilt || [0, 0],
    });
  }

  styleFamily(style) {
    try {
      return familyOf(style);
    } catch {
      return "glass";
    }
  }

  // -- colour helpers -------------------------------------------------------

  rgba(c, a = c[3]) {
    const r = Math.round(clamp01(c[0]) * 255);
    const g = Math.round(clamp01(c[1]) * 255);
    const b = Math.round(clamp01(c[2]) * 255);
    return `rgba(${r},${g},${b},${clamp01(a)})`;
  }

  hueShifted(c, shift) {
    if (!shift) return c;
    const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    const [r, g, b] = hslToRgb(h + shift, s, l);
    return [r, g, b, c[3]];
  }

  radialGrad(ctx, x, y, r0, r1, stops) {
    const grad = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, c] of stops) grad.addColorStop(o, c);
    ctx.fillStyle = grad;
  }

  // -- shared body painting --------------------------------------------------

  shade(ctx, x, y, r, tone, ink) {
    const lightX = x - r * 0.3;
    const lightY = y - r * 0.35;
    this.radialGrad(ctx, lightX, lightY, r * 0.05, r * 1.5, [
      [0, this.rgba(lighten(tone, 0.42))],
      [0.35, this.rgba(tone)],
      [0.72, this.rgba(darken(tone, 0.28), 0.97)],
      [1, this.rgba(ink)],
    ]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ring(ctx, x, y, r, width, color, dash = 0, offset = 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash ? [dash, dash] : []);
    ctx.lineDashOffset = offset || 0;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  dots(ctx, x, y, count, radius, dotR, color, spread = Math.PI * 2, start = 0) {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const a = start + (i / count) * spread;
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius;
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // -- family silhouettes -----------------------------------------------------

  liquid(o) {
    const { ctx, cx, cy, R, phase, tone, ink, knobs, glow } = o;
    this.shade(ctx, cx, cy, R * 0.66, tone, ink);
    const drift = phase * 0.6;
    for (let k = 0; k < 3; k++) {
      const rr = R * (0.72 + k * 0.12 + 0.03 * Math.sin(drift + k * 1.7));
      const w = Math.max(R * (0.03 - k * 0.006), 1.2);
      this.ring(
        ctx, cx + Math.sin(drift * 0.5 + k) * R * 0.05,
        cy + Math.cos(drift * 0.4 + k * 2) * R * 0.05,
        rr, w, this.rgba(tone, (0.34 - k * 0.07) * (0.5 + glow * 0.8)),
        rr * 0.2, drift * (k + 1) * 6
      );
    }
    this.highlight(o, 0.3);
  }

  ink(o) {
    const { ctx, cx, cy, R, phase, tone, ink, knobs, activity } = o;
    const blobs = 2 + Math.round(knobs[0] * 4);
    const blur = R * (0.3 + knobs[1] * 0.25);
    for (let k = 0; k < blobs; k++) {
      const a = phase * 0.7 + (k * Math.PI * 2) / blobs;
      const bx = cx + Math.cos(a) * R * 0.32;
      const by = cy + Math.sin(a * 1.3) * R * 0.3;
      const br = R * (0.34 + 0.16 * Math.sin(phase * 0.9 + k * 2.4));
      this.radialGrad(ctx, bx, by, br * 0.1, br + blur, [
        [0, this.rgba(tone, 0.5 * (1 + activity))],
        [1, this.rgba(ink, 0)],
      ]);
      ctx.beginPath();
      ctx.arc(bx, by, br + blur, 0, Math.PI * 2);
      ctx.fill();
    }
    this.shade(ctx, cx, cy + R * 0.04, R * 0.62, tone, ink);
    this.highlight(o, 0.2);
  }

  light(o) {
    const { ctx, cx, cy, R, phase, tone, tone2, ink, activity, knobs } = o;
    this.radialGrad(ctx, cx, cy, R * 0.1, R * 1.1, [
      [0, this.rgba(lighten(tone, 0.5), 0.95)],
      [0.6, this.rgba(tone, 0.55)],
      [1, this.rgba(ink, 0)],
    ]);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
    ctx.fill();
    // rays
    const rays = 3 + Math.round(knobs[1] * 5);
    ctx.strokeStyle = this.rgba(tone2, 0.28 * (0.5 + activity));
    ctx.lineWidth = Math.max(R * 0.03, 1);
    ctx.beginPath();
    for (let k = 0; k < rays; k++) {
      const a = phase * 0.4 + (k * Math.PI * 2) / rays;
      ctx.moveTo(cx + Math.cos(a) * R * 0.4, cy + Math.sin(a) * R * 0.4);
      ctx.lineTo(cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 1.05);
    }
    ctx.stroke();
    this.radialGrad(ctx, cx - R * 0.2, cy - R * 0.25, 0, R * 0.5, [
      [0, "rgba(255,255,255,0.8)"],
      [0.6, this.rgba(lighten(tone, 0.35), 0.35)],
      [1, this.rgba(tone, 0)],
    ]);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  signal(o) {
    const { ctx, cx, cy, R, phase, tone, ink, level, glow } = o;
    this.shade(ctx, cx, cy, R * 0.5, tone, ink);
    const pulses = 2;
    for (let k = 0; k < pulses; k++) {
      const p = ((phase * (0.5 + k * 0.34)) % 1 + 1) % 1;
      const rr = R * (0.55 + p * 0.55);
      const alpha = (1 - p) * (0.4 + 0.4 * level) * (0.5 + glow * 0.7);
      this.ring(ctx, cx, cy, rr, Math.max(R * 0.045, 1.2), this.rgba(tone, alpha), R * 0.5, -p * 40);
    }
    this.highlight(o, 0.4);
  }

  orb(o) {
    const { ctx, cx, cy, R, phase, tone, ink, level, activity, knobs } = o;
    this.shade(ctx, cx, cy, R * 0.6, tone, ink);
    const count = 3 + Math.round(knobs[0] * 5);
    const rad = R * (0.68 + 0.2 * activity);
    this.dots(
      ctx, cx, cy, count, rad, Math.max(R * (0.03 + knobs[2] * 0.03), 1),
      this.rgba(lighten(tone, 0.3), 0.55 + 0.45 * level),
      Math.PI * 2, phase * 0.8
    );
  }

  presence(o) {
    const { ctx, cx, cy, R, phase, tone, tone2, ink, glow, knobs } = o;
    this.shade(ctx, cx, cy, R * 0.5, tone, ink);
    // halo
    const wob = 1 + 0.12 * Math.sin(phase * 0.6);
    const hw = Math.max(R * (0.07 + knobs[1] * 0.06), 1.4);
    this.ring(
      ctx, cx, cy, R * (0.8 * wob), hw,
      this.rgba(tone2, (0.5 + glow * 0.5) * wob), 0, -phase * 3
    );
    this.ring(ctx, cx, cy, R * 1.06, Math.max(hw * 0.6, 1), this.rgba(tone2, 0.22));
    this.highlight(o, 0.35);
  }

  glass(o) {
    const { ctx, cx, cy, R, phase, tone, tone2, ink, level, knobs, tilt } = o;
    this.radialGrad(ctx, cx, cy, R * 0.2, R * 1.15, [
      [0, this.rgba(tone, 0.55)],
      [0.65, this.rgba(tone, 0.28)],
      [1, this.rgba(ink, 0.05)],
    ]);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    // duotone smear
    const sweep = phase * 0.5;
    const gx = cx + Math.cos(sweep) * R * 0.7;
    const gy = cy + Math.sin(sweep) * R * 0.7;
    this.radialGrad(ctx, gx, gy, 0, R * 1.2, [
      [0, this.rgba(tone2, 0.5 * (0.5 + level))],
      [1, this.rgba(ink, 0)],
    ]);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    // rim
    const rimW = Math.max(R * (0.06 + knobs[0] * 0.04), 1.4);
    this.ring(ctx, cx, cy, R - rimW / 2, rimW, this.rgba(lighten(tone, 0.3), 0.7), R * 0.4, phase * 2);
    // specular streak, displaced by the glass parallax tilt
    const tx = clamp01((tilt[0] || 0) + 0.5);
    const ty = clamp01((tilt[1] || 0) + 0.5);
    this.specular(ctx, cx - tx * R * 0.1, cy + ty * R * 0.1, R, tone2, 0.75);
  }

  specular(ctx, cx, cy, R, tone, alpha = 0.7) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 5.5);
    this.radialGrad(ctx, 0, -R * 0.5, 0, R * 0.8, [
      [0, this.rgba(lighten(tone, 0.5), alpha * 0.85)],
      [0.5, this.rgba(tone, alpha * 0.25)],
      [1, this.rgba(tone, 0)],
    ]);
    ctx.beginPath();
    ctx.ellipse(-R * 0.22, -R * 0.42, R * 0.45, R * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  highlight(o, strength) {
    const { ctx, cx, cy, R, level } = o;
    this.radialGrad(ctx, cx - R * 0.3, cy - R * 0.38, 0, R * 0.34, [
      [0, `rgba(255,255,255,${0.5 * strength + 0.3 * level})`],
      [0.6, `rgba(255,255,255,${0.08 * strength})`],
      [1, "rgba(255,255,255,0)"],
    ]);
    ctx.beginPath();
    ctx.arc(cx - R * 0.3, cy - R * 0.38, R * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
}

function smooth01(x) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

function lighten(c, k) {
  return [
    mix(c[0], 1, k),
    mix(c[1], 1, k),
    mix(c[2], 1, k),
    c[3],
  ];
}

function darken(c, k) {
  return [c[0] * (1 - k), c[1] * (1 - k), c[2] * (1 - k), c[3]];
}