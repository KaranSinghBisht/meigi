# Landing page spec: "Sakasa Fuji" (逆さ富士)

The first ten seconds of the demo video and the showcase link. It leads into the main app, which lives at a
separate URL. Layout ideas were inspired by the *hyper* landing (HackMIT 2026). All code and assets here are
our own, written from scratch.

## The idea in one line

Dawn over a still lake: Mt Fuji and its perfect reflection. **Your cursor can ripple the reflection, but the
mountain never moves.** That is the product in one image: an address on an invoice is a reflection that
anyone can distort; the registered company is the mountain.

> Anyone can bend the reflection. No one can move the mountain.

## Stack

`apps/landing`: Vite + React 19 + TypeScript + three + @react-three/fiber + @react-three/drei +
@react-three/postprocessing, gsap for the enter transition, and viem for the live chain reads. It builds to a
static site (Vercel or Cloudflare Pages). Fonts come from Google Fonts: **Inter Tight** (Latin) and
**Shippori Mincho** (Japanese).

## Scene (procedural, no image backdrops required)

| Element | Notes |
|---|---|
| Sky | Gradient dome: zenith lavender `#B9B4E6` → pink `#F2C4D3` → horizon peach `#FFE3C8`. Slow fbm cloud bands and a low sun glow left of Fuji for bloom. |
| Mt Fuji | Custom radial mesh with Fuji's concave flanks and a flattened crater rim. Ridged-noise gullies. Lavender-blue body `#8D8FC4`→`#A7A3D6` hazing into the horizon colour near the base. Snow cap from ~62% height, with streaks running down the gullies and a pink tint on the sunlit side. Far away; the peak sits ~35% of screen height above the horizon. |
| Foothills | 2–3 layered ridge silhouettes, lighter with distance. Optional small five-story pagoda silhouette on the left hill. |
| Lake | Planar reflection distorted by gentle analytic wind waves **plus a cursor-driven ripple height field** (GPU ping-pong wave equation, ~512²). The cursor injects drops, and so do petals landing on the water. Fuji's reflection wobbles; the real mountain stays perfectly still. Fresnel mix with a deep-water tint `#9C9CCB`. |
| Torii | Vermilion `#E0452B` lacquer with a black kasagi, standing in the water mid-left (like Hakone's Peace Torii) and reflected. Procedural: tapered hashira, nuki, and kasagi/shimaki with upturned ends. |
| Sakura | ~250 instanced petals that flutter and drift. On touching the water they spawn a small ripple, float, then fade. An optional soft, out-of-focus blossom branch frames the top-left corner. |
| Mist | 3–4 soft noise planes drifting along the water line. |
| Post | ACES tone mapping, restrained bloom (sun and torii glint only), subtle film grain, vignette, and a hint of chromatic aberration at the edges. Target look: a Kawase Hasui print rendered in 3D. |
| Camera | Eye level just above the water, idle drift, mouse parallax of about ±1.5°. **Enter:** a 2.2 s glide low over the water *through the torii* toward Fuji (power2.inOut) while the UI fades, then a fade to white and navigation to `VITE_APP_URL`. |

## Interface (DOM overlay)

- **Byline** (small): `Karan Singh Bisht · Adithya Prasanna Suriya Prakash — ETHGlobal Tokyo 2026`
- **Wordmark**: `meigi.` in Inter Tight 500, tracking about −0.065em, size `clamp(96px, 16vw, 240px)`, charcoal `#2A2730`.
- **Vertical label** near the right edge (`writing-mode: vertical-rl`, Shippori Mincho): `名義` and `支払先を、確かめる。`
- **Subtitle**: `Pay companies, not addresses.` Then a white pill `enter ↘`; on hover it turns charcoal with white text.
- **Ripple caption**: shown the first time someone disturbs the water, then fades after about 3 s: *Anyone can bend the reflection. No one can move the mountain.*
- **Bottom-left, live status**: `● Sepolia · {n} payees verified`, counted from `PayeeRegistered` events (`VITE_REGISTRY_ADDRESS`, `VITE_RPC_URL`). If the values are missing or the chain can't be reached, hide it. Never show invented numbers.
- **Bottom-right pills**:
  - `GitHub ↗`
  - `Docs ↗`
  - `Resolve a T-number`: a frosted popover with an input validated by `/^T?\d{13}$/`. It resolves through the registry and shows ✓ legal name + short address, or "not registered".
  - `x402 guard`: copies `npm i @meigi/x402-guard`, and the pill reads "Copied" for 1.5 s.
- **Cursor** (fine pointers only):
  - A vermilion hanko ring (24px, 1.5px stroke) with a lerped follow.
  - It fills softly over anything interactive.
  - Clicking the wordmark stamps a square 名義 seal impression (SVG with an ink-texture filter, slightly rotated) that fades over 1.5 s.
- **Mobile**: touch ripples; no custom cursor; pills wrap.

## Quality bar

- DPR capped at 1.75 and the reflection target at 1024 or less. Rendering pauses in hidden tabs.
- `prefers-reduced-motion` freezes ripples, petals and drift but keeps a still render.
- If WebGL fails, show a CSS gradient + SVG Fuji fallback with the same UI.
- Keyboard focus on every control, visible focus rings, and `aria-label`s.
- House rules: files under 400 lines, functions under 50 lines, no `console.log`, no secrets in code. Env comes from `import.meta.env` with an `.env.example`.
- Folder layout by feature: `src/scene/{sky,fuji,lake,torii,sakura,mist,post,camera}`, `src/ui/{hero,pills,cursor,resolve,status}`, `src/lib/{chain,env}`.

## Nice-to-have assets (not required)

- A painted dawn matte (2:1, 4K) behind the procedural Fuji for extra richness.
- Ambient audio: lake water, wind, and a single furin chime on enter. Muted by default, with a toggle.
