// Roster data, transcribed from the Swift package's MurmurStyle.swift.
// Every fact a style carries that is not pixels lives here.
//
// Families: liquid (ml_), ink (mi_), light (mg_), signal (ms_), orb (mo_),
// presence (mq_), glass (mh_).

export const families = {
  liquid: { displayName: "Liquid", prefix: "ml_", pack: "liquid" },
  ink: { displayName: "Ink", prefix: "mi_", pack: "ink" },
  light: { displayName: "Light", prefix: "mg_", pack: "light" },
  signal: { displayName: "Signal", prefix: "ms_", pack: "signal" },
  orb: { displayName: "Orb", prefix: "mo_", pack: "orb" },
  presence: { displayName: "Presence", prefix: "mq_", pack: "presence" },
  glass: { displayName: "Glass", prefix: "mh_", pack: "glass" },
};

// family -> ordered style names
export const roster = {
  liquid: ["eddy", "well", "tide", "undertow", "meander", "confluence", "melt", "glaze"],
  ink: ["bloom", "marbling", "wick", "strata", "halation", "pool", "feather", "palimpsest"],
  light: ["caustic", "aurora", "ember", "lantern", "mirage", "oculus", "dapple", "eclipse"],
  signal: ["murmuration", "loom", "cipher", "tuning", "current", "veil", "echo", "glyph"],
  orb: ["breathe", "orbit", "glimmer", "vortex", "gather", "stir", "daybreak", "skein"],
  presence: ["halo", "nucleus", "iris", "filament", "flare", "braid", "mote", "ripple"],
  glass: [
    "aura", "droplet", "nebula", "prism", "limn", "duet",
    "fathom", "arc", "opal", "comet", "still", "flux",
    "tempest", "helix", "geode", "sol", "abyss", "chorus",
  ],
};

export const allStyles = Object.keys(roster).flatMap((f) => roster[f].map((s) => ({ name: s, family: f })));

// c0..c3 knobs per style, from SPEC.md roster tables.
const K = (label, defaultValue) => ({ label, defaultValue });

const knobs = {
  // Liquid
  eddy: [K("swirl", 0.5), K("drift", 0.3), K("grain", 0.4), K("shear", 0.5)],
  well: [K("pull", 0.5), K("depthGlow", 0.5), K("churn", 0.3), K("offset", 0.5)],
  tide: [K("reach", 0.5), K("lean", 0.4), K("foam", 0.3), K("period", 0.5)],
  undertow: [K("contrast", 0.5), K("slip", 0.5), K("veil", 0.3), K("bias", 0.5)],
  meander: [K("width", 0.4), K("wander", 0.5), K("bank", 0.4), K("flow", 0.5)],
  confluence: [K("approach", 0.5), K("mingle", 0.5), K("shimmer", 0.3), K("angle", 0.5)],
  melt: [K("mass", 0.5), K("viscosity", 0.6), K("dripAbsorb", 0.5), K("heat", 0.4)],
  glaze: [K("sheet", 0.5), K("slide", 0.5), K("sheen", 0.5), K("tilt", 0.5)],
  // Ink
  bloom: [K("spread", 0.5), K("edgeTear", 0.5), K("tail", 0.4), K("asymmetry", 0.3)],
  marbling: [K("folds", 0.5), K("comb", 0.4), K("contrast", 0.5), K("drift", 0.3)],
  wick: [K("climb", 0.5), K("fiber", 0.5), K("pooling", 0.3), K("dryEdge", 0.4)],
  strata: [K("layers", 0.5), K("settle", 0.5), K("disturb", 0.2), K("tilt", 0.5)],
  halation: [K("mass", 0.5), K("corona", 0.5), K("morph", 0.4), K("offset", 0.5)],
  pool: [K("tension", 0.5), K("tremor", 0.2), K("sheen", 0.5), K("tilt", 0.5)],
  feather: [K("bleed", 0.5), K("fiber", 0.5), K("direction", 0.5), K("dryness", 0.4)],
  palimpsest: [K("layers", 0.5), K("legibility", 0.4), K("surfacing", 0.5), K("age", 0.5)],
  // Light
  caustic: [K("web", 0.5), K("depthWater", 0.5), K("swim", 0.4), K("focus", 0.5)],
  aurora: [K("fold", 0.5), K("height", 0.5), K("wander", 0.4), K("thin", 0.5)],
  ember: [K("heat", 0.5), K("shimmer", 0.4), K("floor", 0.5), K("updraft", 0.4)],
  lantern: [K("fog", 0.5), K("reach", 0.5), K("drift", 0.4), K("offset", 0.5)],
  mirage: [K("bands", 0.5), K("bend", 0.5), K("distance", 0.5), K("haze", 0.4)],
  oculus: [K("aperture", 0.5), K("rim", 0.4), K("beam", 0.5), K("dust", 0.3)],
  dapple: [K("canopy", 0.5), K("breeze", 0.5), K("patch", 0.5), K("depthLight", 0.5)],
  eclipse: [K("occlude", 0.5), K("corona", 0.5), K("drift", 0.4), K("softness", 0.5)],
  // Signal
  murmuration: [K("flock", 0.5), K("turn", 0.5), K("cohesion", 0.5), K("sky", 0.3)],
  loom: [K("threads", 0.5), K("tension", 0.5), K("sheen", 0.4), K("angle", 0.5)],
  cipher: [K("reveal", 0.5), K("structure", 0.5), K("dwell", 0.5), K("scatter", 0.3)],
  tuning: [K("band", 0.5), K("lock", 0.5), K("hiss", 0.3), K("drift", 0.4)],
  current: [K("pathways", 0.5), K("pulseRate", 0.4), K("glow", 0.5), K("branch", 0.5)],
  veil: [K("layers", 0.5), K("parallax", 0.5), K("legibility", 0.4), K("drift", 0.3)],
  echo: [K("repeats", 0.5), K("decay", 0.5), K("offset", 0.5), K("blur", 0.4)],
  glyph: [K("marks", 0.5), K("formation", 0.5), K("dissolve", 0.5), K("ink", 0.5)],
  // Orb
  breathe: [K("breath", 0.5), K("depthFade", 0.5), K("dotSize", 0.5), K("material", 0.3)],
  orbit: [K("bands", 0.5), K("flow", 0.5), K("dotSize", 0.5), K("material", 0.3)],
  glimmer: [K("sparkle", 0.5), K("spread", 0.5), K("dotSize", 0.5), K("material", 0.3)],
  vortex: [K("swirl", 0.6), K("pole", 0.5), K("dotSize", 0.5), K("material", 0.3)],
  gather: [K("pull", 0.5), K("ring", 0.5), K("dotSize", 0.5), K("material", 0.3)],
  stir: [K("jitter", 0.5), K("settle", 0.5), K("dotSize", 0.5), K("material", 0.3)],
  daybreak: [K("sweep", 0.5), K("softness", 0.5), K("dotSize", 0.5), K("material", 0.3)],
  skein: [K("winding", 0.5), K("trail", 0.5), K("dotSize", 0.5), K("material", 0.3)],
  // Presence
  halo: [K("tilt", 0.5), K("thickness", 0.4), K("waviness", 0.5), K("shimmer", 0.4)],
  nucleus: [K("coreSize", 0.5), K("shell", 0.5), K("circulate", 0.5), K("swellRange", 0.5)],
  iris: [K("petals", 0.5), K("openness", 0.5), K("softness", 0.5), K("twist", 0.4)],
  filament: [K("length", 0.5), K("knot", 0.5), K("brightness", 0.5), K("sway", 0.4)],
  flare: [K("discSize", 0.5), K("licks", 0.5), K("reach", 0.5), K("flicker", 0.3)],
  braid: [K("strands", 0.5), K("twist", 0.5), K("separation", 0.5), K("glowBalance", 0.5)],
  mote: [K("wander", 0.4), K("lean", 0.5), K("size", 0.4), K("tail", 0.3)],
  ripple: [K("stillness", 0.5), K("ringSpeed", 0.5), K("decay", 0.5), K("sheen", 0.5)],
  // Glass
  aura: [K("ribbons", 0.5), K("swirl", 0.5), K("spread", 0.5), K("depth3d", 0.5)],
  droplet: [K("wobble", 0.5), K("tension", 0.5), K("sheen", 0.5), K("spread", 0.3)],
  nebula: [K("density", 0.5), K("fold", 0.5), K("glintRate", 0.4), K("spread", 0.4)],
  prism: [K("beams", 0.4), K("split", 0.5), K("drift", 0.5), K("spread", 0.6)],
  limn: [K("rimWidth", 0.4), K("travel", 0.5), K("innerHint", 0.3), K("spread", 0.4)],
  duet: [K("separation", 0.5), K("orbit", 0.5), K("sizeRatio", 0.5), K("spread", 0.6)],
  fathom: [K("layers", 0.5), K("parallax", 0.5), K("murk", 0.4), K("spread", 0.4)],
  arc: [K("arcLength", 0.5), K("sway", 0.5), K("corePin", 0.5), K("spread", 0.3)],
  opal: [K("flashes", 0.5), K("drift", 0.4), K("softness", 0.6), K("spread", 0.7)],
  comet: [K("orbitTilt", 0.5), K("trail", 0.5), K("pointSize", 0.4), K("spread", 0.3)],
  still: [K("glintRate", 0.3), K("clarity", 0.6), K("presence", 0.5), K("spread", 0.2)],
  flux: [K("stream", 0.5), K("bend", 0.5), K("height", 0.5), K("spread", 0.6)],
  tempest: [K("storm", 0.5), K("churn", 0.5), K("flicker", 0.3), K("spread", 0.5)],
  helix: [K("turns", 0.5), K("rise", 0.4), K("strandGlow", 0.5), K("spread", 0.6)],
  geode: [K("facets", 0.5), K("glimmer", 0.4), K("depthCrystal", 0.5), K("spread", 0.5)],
  sol: [K("coronaSize", 0.5), K("prominence", 0.5), K("simmer", 0.4), K("spread", 0.4)],
  abyss: [K("creatures", 0.4), K("rarity", 0.6), K("drift", 0.5), K("spread", 0.4)],
  chorus: [K("voices", 0.5), K("sync", 0.5), K("breatheDepth", 0.4), K("spread", 0.5)],
};

// Styles whose concept has an arrival (epoch-driven settle arc).
export const hasArc = new Set([
  "confluence", "bloom", "strata", "oculus", "tuning", "feather", "gather",
]);

export function familyOf(style) {
  for (const f of Object.keys(roster)) {
    if (roster[f].includes(style)) return f;
  }
  throw new Error(`unknown style: ${style}`);
}

export function shaderName(style) {
  return families[familyOf(style)].prefix + style;
}

export function characterKnobs(style) {
  return knobs[style] ?? [K("c0", 0.5), K("c1", 0.5), K("c2", 0.5), K("c3", 0.5)];
}

export function characterDefaults(style) {
  return characterKnobs(style).map((k) => k.defaultValue);
}

export function isGlass(style) {
  return familyOf(style) === "glass";
}