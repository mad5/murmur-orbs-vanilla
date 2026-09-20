// Ports of the Swift package's state machinery, verbatim in behavior:
//   MurmurState.swift   (seeds, entries, transitionDuration)
//   MurmurParameters.swift (per-state dial set + blending)
//   MurmurClock.swift   (integrated tempo -> phase)
//   MurmurSignals.swift (smoothed live signals + generic lifts)
//
// Only `config.js` provides style defaults; everything here is frames-agnostic
// so it can be unit-tested without a DOM or a WebGL context.

import { characterDefaults } from "./config.js";

// -- States ------------------------------------------------------------------

export const STATES = ["idle", "listening", "thinking", "responding", "success", "error"];

export const TRANSITION_DURATION = 0.6;

// Fixed by the shader contract in SPEC.md; these numbers are not free to move.
export function shaderIndex(state) {
  return { idle: 0, listening: 1, thinking: 2, responding: 3, success: 4, error: 5 }[state] ?? 2;
}

// Entering these replays the settle arc on styles that have one.
export function restartsArc(state) {
  return state === "thinking" || state === "success";
}

// The seed factors, per state, from MurmurState.seed.
const SEEDS = {
  idle: { speed: 0.3, glow: 0.65, depth: 0.75, hueShift: 0, entry: "none" },
  listening: { speed: 0.9, glow: 1.1, depth: 1.1, hueShift: 0, entry: "none" },
  thinking: { speed: 1.15, glow: 1.2, depth: 1.25, hueShift: 0, entry: "wake" },
  responding: { speed: 1.45, glow: 1.3, depth: 1.25, hueShift: 0, entry: "none" },
  success: { speed: 0.55, glow: 1.05, depth: 1.0, hueShift: 0, entry: "swell" },
  error: { speed: 0.65, glow: 0.8, depth: 1.2, hueShift: -0.35, entry: "stutter" },
};

export function seedParameters(state, style) {
  const s = SEEDS[state] ?? SEEDS.thinking;
  return {
    speed: s.speed,
    formScale: 1,
    depth: s.depth,
    glow: s.glow,
    hueShift: s.hueShift,
    character: characterDefaults(style),
  };
}

// -- MurmurParameters --------------------------------------------------------

export function cloneParameters(p) {
  return { ...p, character: p.character.slice() };
}

// Crossfade between two complete dial sets (character knobs included).
// Written as a*(1-t) + b*t so the ends land exactly on the endpoints.
export function blendParameters(a, b, amount) {
  const t = Math.min(Math.max(amount, 0), 1);
  const mix = (x, y) => x * (1 - t) + y * t;
  const count = Math.max(a.character.length, b.character.length);
  const character = [];
  for (let i = 0; i < count; i++) {
    const x = i < a.character.length ? a.character[i] : 0.5;
    const y = i < b.character.length ? b.character[i] : 0.5;
    character.push(mix(x, y));
  }
  return {
    speed: mix(a.speed, b.speed),
    formScale: mix(a.formScale, b.formScale),
    depth: mix(a.depth, b.depth),
    glow: mix(a.glow, b.glow),
    hueShift: mix(a.hueShift, b.hueShift),
    character,
  };
}

// -- Entries ------------------------------------------------------------------

const ENTRY_STYLES = {
  wake: {
    duration: 2.5,
    // speed boost: 1 + wakeOvershoot * exp(-tau / wakeDecay)
    speedBoost: (tau) => (tau > 0 && tau < 2.5 ? 1 + 0.6 * Math.exp(-tau / 0.4) : 1),
    glowBoost: (tau) => 1,
    phaseOffset: () => 0,
  },
  swell: {
    duration: 1.5,
    speedBoost: () => 1,
    // Gamma shape: exactly 0 at the change, exactly 1 at the peak, long soft
    // tail, tapered to zero just before the duration.
    glowBoost: (tau) => {
      if (tau <= 0 || tau >= 1.5) return 1;
      const x = tau / 0.4;
      const shape = Math.pow(x, 2) * Math.exp(2 * (1 - x));
      const taper = 1 - smoothstep((tau - (1.5 - 0.4)) / 0.4);
      return 1 + 0.35 * shape * taper;
    },
    phaseOffset: () => 0,
  },
  stutter: {
    duration: 0.5,
    speedBoost: () => 1,
    glowBoost: () => 1,
    // Two arches rather than a square hold: depths picked so the instantaneous
    // rate dips to about half and overshoots to about one and a half.
    phaseOffset: (tau) => {
      if (tau <= 0 || tau >= 0.5) return 0;
      return -(
        0.03 * arch(tau, 0.05, 0.2) +
        0.018 * arch(tau, 0.28, 0.16)
      );
    },
  },
  none: {
    duration: 0,
    speedBoost: () => 1,
    glowBoost: () => 1,
    phaseOffset: () => 0,
  },
};

export function entryDuration(entry) {
  return (ENTRY_STYLES[entry] ?? ENTRY_STYLES.none).duration;
}
function entryOf(entry) {
  return ENTRY_STYLES[entry] ?? ENTRY_STYLES.none;
}
/** Public accessor mirroring entryOf: returns the live entry-behavior object. */
export function entryByName(entry) {
  return entryOf(entry);
}

function smoothstep(x) {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
}
function arch(tau, start, width) {
  const u = (tau - start) / width;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(Math.PI * u);
}

// -- MurmurClock ----------------------------------------------------------------

// The tempo at tau: the crossfading speed (from -> to) times the entry's
// speed overshoot.
export function tempoAt(tau, from, to, entry) {
  const t = ease(tau);
  const level = from.speed * (1 - t) + to.speed * t;
  return level * entryOf(entry).speedBoost(tau);
}

// Where the phase has got to, tau seconds into a segment. Past the horizon
// the tempo is constant, so that part is exact; inside it Simpson on a fixed
// number of steps is both cheaper and clearer than the closed form.
export function phaseThrough(tau, from, to, entry) {
  if (tau <= 0) return 0;
  const horizon = Math.max(TRANSITION_DURATION, entryDuration(entry));
  const inner = Math.min(tau, horizon);
  let total = simpson(inner, (s) => tempoAt(s, from, to, entry));
  if (tau > horizon) total += (tau - horizon) * to.speed;
  return total;
}

// Composite Simpson over [0, b]; 32 steps on a smooth integrand is always
// plenty.
function simpson(b, f) {
  if (b <= 0) return 0;
  const steps = 32;
  const h = b / steps;
  let sum = f(0) + f(b);
  for (let i = 1; i < steps; i++) {
    sum += f(i * h) * (i % 2 === 0 ? 2 : 4);
  }
  return (sum * h) / 3;
}

export function ease(elapsed) {
  return smoothstep(elapsed / TRANSITION_DURATION);
}

// -- Live signals ----------------------------------------------------------------

export const SIGNALS = {
  activitySpeedLift: 0.25, // typing quickens the material by up to a quarter
  levelGlowLift: 0.35, // voice lifts the light by up to a third
  attack: 0.05, // rise time
  release: 0.25, // fall time, five times the attack
};

export function clampSignals(signals) {
  return {
    level: Math.min(Math.max((signals && signals.level) ?? 0, 0), 1),
    activity: Math.min(Math.max((signals && signals.activity) ?? 0, 0), 1),
  };
}

// Holds the smoothed signals between frames and integrates the activity
// lift into an extra phase (the shaders use time*speed as their phase, so
// scaling speed against a large time would drag the whole field forward).
export class SignalEnvelope {
  constructor() {
    this.current = { level: 0, activity: 0 };
    this.extraPhase = 0;
    this.lastTick = null;
  }

  // `now` in ms since an arbitrary epoch (performance.now()-compatible).
  step(toward, now, baseTempo) {
    const goal = clampSignals(toward);
    if (this.lastTick === null) {
      this.lastTick = now;
      this.current = goal;
      return this.current;
    }
    if (now === this.lastTick) return this.current;

    // Clamped so a backgrounded view does not resume with an enormous step.
    const dt = Math.min(Math.max((now - this.lastTick) / 1000, 0), 0.25);
    this.lastTick = now;

    this.current = {
      level: approach(this.current.level, goal.level, dt),
      activity: approach(this.current.activity, goal.activity, dt),
    };
    this.extraPhase += dt * baseTempo * SIGNALS.activitySpeedLift * this.current.activity;
    return this.current;
  }

  resetPhase() {
    this.extraPhase = 0;
  }
}

function approach(value, target, dt) {
  const tau = target > value ? SIGNALS.attack : SIGNALS.release;
  return value + (target - value) * (1 - Math.exp(-dt / tau));
}