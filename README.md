# Murmur (vanilla JS)

Responsive AI presence orbs for the web. Volumetric glass and material orbs, rendered with WebGL2 (Canvas2D fallback), that work in any page.

This project is a **port** of [krispuckett/murmur](https://github.com/krispuckett/murmur) — the SwiftUI / Metal package — to vanilla JavaScript with no runtime dependencies.

| opal | droplet | helix |
|---|---|---|
| glass · opal | glass · droplet | glass · helix |

- **66 species** across 7 families: liquid, ink, light, signal, orb, presence, and glass (18 glass styles plus a 48-style archive)
- **6 states**: `idle`, `listening`, `thinking`, `responding`, `success`, `error`, with designed transitions
- **Live signals**: `level` (voice) and `activity` (typing / token stream) move the material
- **Tilt parallax** (glass family), duotone (`tone2`), per-state dials
- One driver API, no image assets, no videos — WebGL2 primary, Canvas2D when WebGL is unavailable

## Install

```bash
npm install murmur-vanilla-js
```

Or drop in the built bundle with no build step:

```html
<script src="dist/murmur.js"></script>
```

## Quick start

### Script tag

```html
<div id="orb" style="width: 120px; height: 120px;"></div>
<script src="dist/murmur.js"></script>
<script>
  const orb = new Murmur(document.querySelector("#orb"), {
    style: "aura",
    state: "thinking",
    tone: "#6c63ff",
  });

  orb.setState("listening");
  orb.setSignals({ level: 0.6, activity: 0.2 });
</script>
```

### ES module

```js
import Murmur from "murmur-vanilla-js";

const orb = new Murmur("#orb", {
  style: "limn",
  state: "thinking",
  ink: "#0a0a0b",
  tone: "#6c63ff",
});

orb.setState("responding");
orb.setSignals({ level: micLevel, activity: tokenRate });
```

### Custom element

`<murmur-orb>` is registered automatically when the bundle loads:

```html
<script src="dist/murmur.js"></script>

<murmur-orb
  style-name="aura"
  state="thinking"
  level="0.5"
  activity="0.6"
  style="display:block;width:80px;height:80px;">
</murmur-orb>
```

Attributes: `style-name`, `state`, `level`, `activity`, `tilt-x`, `tilt-y`, `signals` (JSON), `config` (JSON).

## Configuration

```js
const orb = new Murmur(el, {
  style: "opal",           // required — see roster below
  state: "thinking",       // initial state
  backend: "auto",         // "auto" | "webgl2" | "canvas2d"
  ink: "#0a0a0b",          // background / ink color
  tone: "#6c63ff",         // primary accent
  tone2: "#9b5cff",        // optional duotone (glass family only)
  fps: 30,
  animated: true,
  states: {
    thinking: { speed: 1.4, glow: 1.2 },
  },
});
```

Colors accept `#RGB`, `#RRGGBB`, `#RRGGBBAA`, or `{ r, g, b, a }` floats in 0–1.

Per-state dials (speed, glow, depth, formScale, hueShift, character knobs) mirror the Swift package. Override any state:

```js
orb.setConfig({
  states: {
    thinking: {
      speed: 1.4,
      character: { c0: 0.7, c1: 0.4, c2: 0.25, c3: 0.8 },
    },
  },
});
```

## API

| Method | Description |
|---|---|
| `new Murmur(el, config)` | Mount into an element (or CSS selector) |
| `.setState(name)` | Transition to a state |
| `.setSignals({ level, activity })` | Drive live voice / typing signals (0–1) |
| `.setTilt(x, y)` | Parallax tilt (glass family) |
| `.setConfig(partial)` | Patch style, colors, dials, fps, … |
| `.renderStill(time)` | Draw one deterministic frame at `time` (seconds) |
| `.destroy()` | Tear down RAF, observers, and renderer |

Read-only: `.currentState`, `.style`, `.backend` (`"webgl2"` \| `"canvas2d"`).

Helpers on the constructor: `Murmur.STATES`, `Murmur.version`, `Murmur.parseColor`, `Murmur.setWebGLContextBudget(n)`.

## Styles

**Glass** (18): aura, droplet, nebula, prism, limn, duet, fathom, arc, opal, comet, still, flux, tempest, helix, geode, sol, abyss, chorus

**Archive** (48), by family:

| Family | Styles |
|---|---|
| liquid | eddy, well, tide, undertow, meander, confluence, melt, glaze |
| ink | bloom, marbling, wick, strata, halation, pool, feather, palimpsest |
| light | caustic, aurora, ember, lantern, mirage, oculus, dapple, eclipse |
| signal | murmuration, loom, cipher, tuning, current, veil, echo, glyph |
| orb | breathe, orbit, glimmer, vortex, gather, stir, daybreak, skein |
| presence | halo, nucleus, iris, filament, flare, braid, mote, ripple |

Full roster: `src/config.js`.

## Demo

```bash
npm run build          # rebuild dist/murmur.js
# then open demo/index.html in a browser
```

The demo drives states, signals, tilt, colors, backends, the custom element, and the full style roster.

## Relation to the Swift package

Public surface mirrors [Murmur](https://github.com/krispuckett/murmur):

| Swift | This port |
|---|---|
| `MurmurView(config)` | `new Murmur(el, config)` |
| `state:` binding | `.setState(...)` |
| `signals:` | `.setSignals(...)` |
| `tilt:` | `.setTilt(x, y)` |
| Metal shaders | WebGL2 GLSL (Canvas2D fallback) |

Swift-only features (haptics, device gyro wiring, `MurmurPill`, Lab export) are not included. Gyro/parallax can be fed via `.setTilt` from your own sensors.

## Requirements

- Modern browser with Canvas2D; WebGL2 preferred
- No runtime npm dependencies

## License

MIT — same spirit as the [original Murmur package](https://github.com/krispuckett/murmur).
