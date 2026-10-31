# Sensible & Latent — Heating, Cooling & Air

**A Tucson HVAC firm's site that runs one pound of refrigerant once around the cycle, seen through a technician's thermal imager.**

On load, an evaporator coil starts up. A cold front runs its copper hairpins and frost blooms along every pass. Then you fly *between two fins* into the firm's reel. Nine takes later, the closing frost melts off the lens to reveal the work order.

The firm is named for the two halves of a cooling load:

- **Sensible** heat is what a thermostat reads.
- **Latent** heat is the water in the air.

Most bad installs are sized for the first half only. The concept, palette, type and the check against the sibling projects are in [CONCEPT.md](CONCEPT.md).

## Launch

```bash
npm start
```

That installs, type-checks, builds and serves the production bundle at **http://127.0.0.1:4211**. For development with hot reload, run `npm run dev` and open **http://127.0.0.1:5211**. No other project in `C:\Users\indik` uses ports 5211 or 4211.

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `preview` | Vite dev server (5211), type-check + production bundle, preview (4211) |
| `npm run media` | `assets-src/stills` → `public/media/img`, `public/media/tex` (WebP, sized per role) |
| `npm run reel` | `assets-src/video` → 19 s graded reel at 1080p and 720p, plus the poster (ffmpeg) |
| `npm run shoot -- <url> <out> [--vp=desktop\|mobile] [--only=hero,process] [--fps]` | headless-Chrome verification captures (dev server only, it uses the dev hooks) |
| `node scripts/prod-check.mjs` | production-bundle check, normal and `prefers-reduced-motion` |
| `node scripts/boot-time.mjs` | per-scene shader warm-up timing |
| `node scripts/engines.mjs` | WebKit and Firefox smoke test (Playwright builds) against the production preview |
| `node scripts/probe.mjs <take> <p,p>` | re-captures exact states of one take to chase a rendering fault |

## Stack

- Vite 8 and vanilla TypeScript (strict).
- Tailwind CSS v4 for layout and the reset; everything visual uses custom properties.
- Three.js r187 with six WebGL contexts, each rendering only while its take is on screen.
- GSAP + ScrollTrigger and Lenis.
- Archivo variable (`wdth` 62–125, `wght` 100–900), self-hosted from Fontsource.
- One `requestAnimationFrame`: the GSAP ticker drives Lenis, every stage, every renderer, the HUD and the cursor, in a fixed order (`src/core/loop.ts`).

## Architecture blueprint

```
index.html                 all markup and every word of copy; inline critical CSS so frame one is the gauge
CONCEPT.md                 point of view, palette, type, layout principles, sibling-project check
src/
  main.ts                  boot: loop + locked scroll → preloader streams bytes → hero + glass compile while the
                           reel downloads → remaining takes built → decay test holds until programs are ready →
                           preloader parts → THEN the hero intro starts and scroll unlocks → other scenes compile
                           in the background. Global teardown on pagehide and Vite HMR.
  core/
    loop.ts                the only clock (GSAP ticker), ordered subscribers, each returns its own disposer
    scroll.ts              Lenis ⇄ ScrollTrigger; sticky-stage registry (one progress scalar per take, no pin spacers)
    preloader.ts           evacuation gauge: 760,000 µ → 500 µ on a log scale from real streamed bytes; ready(url) lets
                           compilation start per asset; decay test holds while shaders compile; halves part
    themes.ts              per-take palettes picked by temperature, blended across take boundaries
    assets.ts / env.ts / math.ts / disposer.ts
  gl/
    stage.ts               GLStage base: renderer per canvas, visibility-gated rendering, adaptive resolution
                           (targets 60 fps), compileAsync + initTexture warm-up, full GPU disposal
    bloom.ts               LiteBloom: 3-program quarter/eighth-res bloom (UnrealBloom compiles 8 programs on first frame)
    lens.ts                final pass: vignette, anamorphic streak, lateral chromatic aberration
    build.ts               per-instance build animation (aStart/aDur/aFrom/aOut, one uBuild uniform, overshoot, hot
                           glow) patched into both the lit material and the shadow-depth material
    hero.ts                coil start-up: 84 instanced fins, serpentine copper circuit (arc-length TubeGeometry),
                           refrigerant front, frost bands, air particles, the reel on the plenum wall lighting the
                           coil through a RectAreaLight sampled from the footage, dolly-zoom through a fin gap
    process.ts             the install: ghost house, ~600 GPU-built pieces, craned condenser, brazed line set with
                           sparks, test/vacuum/charge, airflow, noon→dusk sky with mountains and stars, thermal pass
    damper.ts              opposed-blade damper gallery: per-blade spring-damper on a linkage cascade, flutter, air
    glass.ts               condensation pane with rack focus (mip-LOD bokeh, refracting droplets, wipeable fog)
    imager.ts              thermal-imager lens (ironbow) with whip-pan directional blur
    frost.ts               frost ferns growing from the frame edges, hot-gas melt from the centre
    screen.ts / noise.ts   full-screen quad base; hash, value noise, fbm, ironbow palette
  sections/                one controller per take (hero, about, services, process, projects, testimonials, team,
                           faq, contact) + window.ts (crossfade windows that never overlap, staircase dwell/move)
  ui/
    hud.ts                 thermal-imager viewfinder: take / move / lens / timecode / spot °F, letterbox, cut pulse,
                           pressure–enthalpy chart tracing the refrigerant's state
    cursor.ts              reticle that locks its four brackets onto controls; reads the spot temperature
    magnetic.ts            magnetic buttons and magnetic display letters (individual `translate`)
    split.ts / grain.ts    DOM-safe char/word splitting; live film grain (never baked into video)
  dev/hooks.ts             DEV ONLY (window.__SL: goto, introDone, frameStats); absent from the production bundle
  styles/main.css          tokens, Renard R10 spacing, fluid clamp() type, every take
scripts/                   media.mjs, cut-reel.sh, shoot.mjs, sheet.mjs, prod-check.mjs, boot-time.mjs, overflow*.mjs
public/media/              img/ (WebP stills), tex/ (material textures), video/ (reel 1080 + 720, poster)
assets-src/                original fal.ai generations (stills, clips) and contact sheets; not shipped and not in
                           git (176 MB), so `npm run media` / `npm run reel` need a local copy
```

## Takes: camera move and motion language

| # | Take | Named move | Motion language |
|---|---|---|---|
| 00 | Preloader | locked-off | **Evacuation.** A micron gauge pulls down on a log scale from real bytes, then a decay test holds while shaders compile. The two halves part, and the intro waits for that to finish. |
| 01 | Start-up (hero) | **Push-in** (dolly-zoom) | The compressor kick jolts the camera. A cyan refrigerant front runs 11 passes of copper, frost forms in bands along every tube, and the air through the pack turns from amber to blue. The title condenses out of heat shimmer (`wdth` 125 → 84 under an SVG displacement that settles). The reel plays on the wall behind the coil and lights it. Scroll flies through one fin gap until a crisp 1080p `<video>` takes over. |
| 02 | Two kinds of heat (about) | **Rack focus** | Material depth: a sweating pane against a 112 °F afternoon. Focus racks from the desert (*Sensible* sharp) to the droplets (*Latent* sharp), each drop refracting a small inverted image. The pointer wipes the fog, and it re-forms. |
| 03 | IR survey (services) | **Whip pan** | Craft reveal: the pointer is the thermal imager, so the ironbow view sits inside the lens with a live spot temperature read from the same heat field. Services change with a directional-blur whip. |
| 04 | The install (process) | **Walkaround** (Catmull-Rom) | Signature sequence, staged on an architectural section model (stucco walls cut at 1.0 m with a pale section cap, furnished rooms, the storey above the cut drawn as a ghost): survey (thermal heat gain, laser points) → design ghost → ductwork hung piece by piece → condenser craned onto its pad with overshoot and a jolt → line set brazed under nitrogen with sparks → 450 psig test and vacuum → charge and start → air on, as noon becomes dusk under lit cirrus and the rooms light. Live counters, an install clock and pinned spec callouts run throughout. |
| 05 | Damper bank (projects) | **Tilt-up** | Projects are printed across the blades of an opposed-blade damper. Scroll is the actuator: blades flip in a cascading, underdamped ripple, flutter in the airflow, and the plenum glows through the gaps. |
| 06 | Seven-day charts (testimonials) | **Overhead lock-off** (slow creep) | A circular chart recorder per client. The paper turns under a fixed pen, dry bulb in copper ink and RH in blue, until the install mark, where the trace goes flat and the quote is set word by word. |
| 07 | Rating plates (team) | **Snap zoom** | Each technician snaps into frame on a riveted equipment rating plate. The stamped rows punch in character by character, and the portrait comes up from ironbow to colour (hover returns it to thermal). |
| 08 | Troubleshooting (FAQ) | **Crane down** | A service-manual tree: the trunk line is drawn down the page, symptoms branch off as you pass, and answers open (grid-template-rows). |
| 09 | Defrost (contact) | **Zoom-out** | Frost ferns close over a frozen coil, the reversing valve shifts, hot gas melts the lens from the centre while it pulls back, and the corners stay iced. Then the work-order form. |

Across every take:

- The viewfinder HUD shows take, move, lens, timecode, spot temperature and a live P-h chart.
- Letterbox bars appear on the 3D takes, and a two-frame cut pulse marks each change of take.
- Themes blend by temperature: copper-dark on the hot side of the cycle, frost-light on the cold side.

## Media pipeline (fal.ai)

- **Stills:** 24 from FLUX1.1 [pro] ultra in one grade (inky blacks, pooled tungsten key, cyan rim, Alexa/anamorphic): 5 hero keyframes, 6 projects, 5 services, 4 portraits, 3 material textures and 1 desert window. They are converted to WebP by `scripts/media.mjs`.
- **Video:** 5 clips from Kling 2.5 Turbo Pro image-to-video, 1928×1072 at 24 fps, no audio. The heat-pump clip is cut from the reel because the generator morphs the unit and grows fake lettering on it.
- **Reel (`scripts/cut-reel.sh`):**
  - speed ramps with motion-interpolated slow motion (`minterpolate`);
  - two-frame warm flash frames at the hard cuts;
  - a warm split-tone grade, S-curve and vignette;
  - **no baked grain**: the browser adds it live;
  - outputs: 1080p (10.7 MB), 720p (4.5 MB, also the in-scene texture) and a WebP poster.

### Asset spend (estimate from fal list prices at generation time)

| Item | Model | Unit price | Qty | Cost |
|---|---|---|---|---|
| Stills | `fal-ai/flux-pro/v1.1-ultra` | $0.06 / image | 24 | $1.44 |
| Clips, 5 s each | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | $0.07 / s | 25 s | $1.75 |
| **Total** | | | | **≈ $3.19 of the $5.00 budget** |

No generation was retried. The unused heat-pump clip ($0.35) is included in the total.

## Verification

`scripts/shoot.mjs` drives the installed Chrome headless with the GPU on: ANGLE over D3D11 on the machine's Intel Iris Xe. It runs at 1440×900 and 390×844 (mobile UA, touch, DPR 2). Through the dev-only hooks it jumps to exact scroll states (8 process stages, mid-flip damper states, frost/melt states), waits for the hero intro to finish, captures about 43 frames per viewport and measures frame times. Seven passes were run (`shots/pass1` … `pass7`). Each pass named problems per take, fixed them and re-captured. The main fixes:

- **Pass 1 → 2:**
  - blown-out white coil (exposure, fin material, vignette, framing);
  - opaque "plastic" ghost walls;
  - the damper's plenum blowing out to white;
  - frost that read as smoke, with stripe artefacts and a hole at the centre;
  - "Latent" clipped;
  - purple-flat IR palette;
  - 26 s boot.
- **Pass 2 → 3:**
  - fins lit flat (raking key);
  - process sun behind the camera (backlit condenser);
  - glossy floor reflecting the plenum;
  - frost revealing the title before the melt (added a frozen-coil plate, title fades in on melt);
  - added the RH pen.
- **Pass 3 → 4:**
  - mobile layout viewport widened to 454 px by the team snap-zoom start state (`main { overflow-x: clip }`);
  - mobile HUD collisions;
  - portrait film framing;
  - callouts running off-screen;
  - frost bands along tube rows instead of a white sheet;
  - environment lighting for the ducts.
- **Pass 4 → 5:**
  - mobile hero data colliding with the kicker;
  - portrait process FOV;
  - hero title scrim;
  - dusk sky and windows;
  - adaptive resolution now targets 60 fps;
  - shader compile overlapped with the download.
- **Pass 5 → 7 (the push toward 9.5):**
  - the install house rebuilt as a section-cut model (solid stucco to 1.0 m, section cap, floor finishes, furniture), merged into 6 draw calls so it costs less than the old ghost;
  - lit cirrus in the sky and a deeper dusk gradient;
  - hoar-frost fibres on the coil and cold mist spilling off the drain pan;
  - portrait hero: a 52° lens from low and close, with the film wall growing up behind the coil, so phones get a layered frame instead of a black void;
  - darker noon materials (the top-down Design frame was washing out);
  - an adaptive-resolution resize now re-renders in the same frame (a resize clears the canvas, and a background compile could leave it black for a frame);
  - a shorter loader ceremony.

Results from the final pass (dev server, Intel Iris Xe; pass 7 plus a follow-up install/damper run):

- **Console:** 0 errors and 0 warnings, desktop and mobile. The production bundle (`prod-check.mjs`) is also clean, in normal and reduced-motion runs.
- **Frame rate:**

  | Viewport | About | Services | Projects | Process | Hero |
  |---|---|---|---|---|---|
  | Desktop 1440×900 | 60 | 60 | 52–60 | 53 | 59 |
  | Mobile 390×844 | 60 | 60 | 60 | 60 | 60 |

  Below 54 fps the adaptive resolution steps down. The damper figure varies between runs: 59.6 in pass 5, and 48–52 when the measurement overlaps the background compile of the frost scene.
- **Ready (preloader fully cleared):** production preview with a cold shader cache took 4.0, 4.7 and 7.4 s over three runs, and about 2.4 s with a warm cache. Runs made while the in-app browser pane had the site open in two tabs took 11–13 s; that is GPU contention from those tabs, not the site. The cost is ANGLE/D3D11 shader compilation, so only the hero and glass block the preloader; the other four scenes compile in the background in page order and fade in when ready.
- **Production build:** passes `tsc --noEmit` (strict) and `vite build`. The dev hooks are absent from `dist/` (verified by grep).
- **Other engines** (`engines.mjs`, Playwright 1.55 builds, production preview):
  - **WebKit:** loads, all six WebGL scenes compile and render, 0 console issues. This Windows WebKit port (WinCairo) does not vary glyph outlines for variable fonts at all, for weight or width, whichever CSS is used, so its headings render at default width with stretched advances. That is a limitation of the port, not of Safari, which renders variable fonts through CoreText. It still needs a check on real Safari.
  - **Firefox:** loads, all six scenes render, variable-font widths are correct, no errors. It logs 69 warnings, all WebGL performance notices: lazy texture initialisation from three's environment-map generation, no parallel shader compile, a depth-compare filtering note, and a scroll-linked-positioning hint.

### Not verified

- Real devices: no physical phone or tablet, and no high-refresh or discrete-GPU desktop. All numbers come from headless Chrome on an integrated Intel GPU.
- Real Safari on macOS and iOS (only Playwright's Windows WebKit build was run), including iOS video autoplay inside WebGL textures, `backdrop-filter`, and variable-font rendering.
- Firefox frame rate (only a load-and-render smoke test was run).
- Screen readers beyond semantic markup and `aria-*` checks. No full keyboard-only pass through the form.
- The form's network path: with no `VITE_FORM_ENDPOINT` set it opens a pre-filled email. The JSON POST path was not exercised.

## Invented details to replace before going live

The firm, people, licence number (AZ ROC 331408), address number, phone ((520) 555-0187 is a fictional 555 number) and email domain are invented. So are the testimonials, project figures and statistics. Every image and clip is AI-generated, and the portraits are not real staff. The rebate copy is deliberately general.

Because the deployed concept is public, it carries a one-line "design concept, fictional company" note in the footer and a `noindex, nofollow` robots tag in `index.html`. Remove both when the details are real.

## Deployment

Live: **https://sensible-and-latent.vercel.app**, from the Vercel project `sensible-and-latent` (scope "indi's projects"), connected to `github.com/indi886/sensible-and-latent`. Every push to `main` deploys to production, and other branches get preview URLs.

Vercel builds it from `vercel.json` (Vite, `npm run build`, `dist/`). Hashed bundles are cached for a year and `/media` for a week.
