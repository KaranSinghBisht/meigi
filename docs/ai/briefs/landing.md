# landing: Build Sakasa-Fuji landing page

Agent type `oh-my-claudecode:designer`, started Sat 02:18 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are building the Meigi landing page for an ETHGlobal Tokyo 2026 hackathon project. It is on the From Scratch track: every line must be written during the hackathon by us. Do NOT copy code or assets from any other project. That includes github.com/MatthewKim323/hyper, which only inspired the layout. Public npm libraries are fine.

Read the full spec first: <workspace>/meigi/docs/landing-spec.md.

Where to build:
- Build it in <workspace>/meigi/apps/landing, package name `@meigi/landing`.
- The repo root already has pnpm-workspace.yaml and a package.json with the scripts `dev:landing` and `build:landing`.
- Only create or modify files inside apps/landing. You may also write screenshots under docs/landing/.
- Do not touch contracts/ or any other folder. Do not git commit, push, or deploy.

Product context, for copy decisions:
- Meigi (名義, "the name on the account") is payee verification for stablecoin and x402 payments in Japan.
- A registry binds a company's government invoice number (a T-number, e.g. T2011001234567) to one payout address. It is exposed via ENS as t2011001234567.payee.eth.
- Redirecting money needs the company's same World ID human plus a 72h public timelock.
- An AI accounts-payable agent's wallet can only pay registered addresses.
- Tagline: "Pay companies, not addresses."

Vibe references (look only):
- Frames of the hyper landing, 1 fps, in /private/tmp/claude-501/-Users-kryptos-Desktop-Projects-ethtokyo/180544df-5a1b-41ff-ac6b-5dc3ed10bf56/scratchpad/hyper_frames/frames/ (f_011–f_039).
- 4×4 contact sheets at 4 fps in ../sheets/.
- Our version must be clearly different: a Japanese dawn lake, Fuji, a torii, sakura, and a hanko cursor.

Technical guidance:
- Stack: Vite + React 19 + TypeScript strict. three + @react-three/fiber v9 + drei + @react-three/postprocessing. gsap for the enter transition. viem for chain reads.
- Water:
  - Implement the cursor ripple as a GPU wave-equation ping-pong: two half-float render targets, about 512².
  - Sample it in the water shader to perturb the reflection UVs and normals.
  - Raycast the pointer onto the water plane to get the ripple UV.
  - Use a planar reflection. If drei's MeshReflectorMaterial can't take a custom distortion texture, write a small custom reflector: render a mirrored camera into a render target at 1024 or less, then sample it with projective UVs plus the ripple offset.
  - The real mountain must never move; only its reflection wobbles.
- Fuji:
  - Build the geometry procedurally: a lathe-like radial profile with Fuji's concave flanks and a flat crater rim, plus ridged noise.
  - Shade it with a custom ShaderMaterial: a snow mask by height plus gully streaks, a sunlit pink tint, and haze by height and distance.
  - It must be instantly recognisable as Fuji.
- Performance and accessibility: meet the bar in the spec (reduced motion, pause in hidden tabs, WebGL fallback, keyboard focus).
- Env:
  - Variables: `VITE_APP_URL` (default '/app'), `VITE_GITHUB_URL`, `VITE_DOCS_URL`, `VITE_RPC_URL`, `VITE_REGISTRY_ADDRESS`. Add apps/landing/.env.example.
  - When the registry env is missing, hide the status pill, and make the resolve popover say the registry isn't deployed yet. Never show fake data.
- Registry ABI subset:
  - `function payeeOf(uint64 tNumber) view returns ((string legalName, address controller, address payout, address pending, uint64 effectiveAt, uint64 nonce, uint8 threshold, uint8 status, bytes32 evidence))`
  - `event PayeeRegistered(uint64 indexed tNumber, address indexed controller, address payout, string legalName, bytes32 evidence)`
  - Status: 0 None, 1 Active, 2 Disputed. T-number digits are stored as uint64 without the "T".
- House rules:
  - Files 200–400 lines max, functions under 50 lines, nesting no deeper than 4.
  - No console.log. Handle errors explicitly. Organize by feature, as listed in the spec.

Verification loop (required):
1. Run `pnpm install` from the repo root, then `pnpm --filter @meigi/landing build`. The build must pass with zero TypeScript errors.
2. Serve the build with `vite preview` and take headless screenshots with Playwright:
   - Install chromium if needed with `pnpm dlx playwright install chromium`, and use GPU flags such as `--use-angle=swiftshader` or `--enable-unsafe-swiftshader` so WebGL renders headless.
   - Capture 1440×900 and 390×844, plus one mid-ripple shot taken after dispatching pointer moves across the water.
   - Save them to <workspace>/meigi/docs/landing/ as hero-desktop.png, hero-mobile.png and ripple.png.
3. Read your own screenshots and iterate on composition, colour and typography at least twice, until it looks like a finished, premium site:
   - soft pastel dawn and crisp typography
   - Fuji clearly recognisable, with its reflection clearly visible
   - the torii reading as vermilion
   - nothing looking like a tech demo

Do not use the user's Chrome/Brave browser or any claude-in-chrome tools.

Report back:
- the file list you created
- how to run it
- the screenshot paths
- performance notes (draw calls, FPS if measurable)
- honest gaps, and which assets (if any) would materially improve the look

## Follow-up instructions

### Sat 02:23 JST: Byline correction for landing page

Byline correction: the team is two people. Use exactly this byline: "Karan Singh Bisht · Adithya Prasanna Suriya Prakash — ETHGlobal Tokyo 2026". Replace the three-name byline from the spec everywhere, including meta tags or README credits. Everything else is unchanged.

### Sat 02:48 JST: Use @meigi/abi for registry ABI

The registry ABI changed after a security review. Import it instead of hand-writing it: add `"@meigi/abi": "workspace:*"` to apps/landing's dependencies and use `import { payeeRegistryAbi } from "@meigi/abi"`. It's generated from the compiled contracts, and viem gets full types from it.

What changed:
- `payeeOf(uint64)` now returns the struct (legalName, controller, payout, pending, effectiveAt, nextController, controllerEffectiveAt, nonce, threshold, status, evidence).
- `payoutOf` returns zero unless the payee is active.
- The PayeeRegistered event is unchanged.

For the "Resolve a T-number" popover, show the name + payout only when status == 1 (Active). For status 2, show "disputed: payments frozen". If `pending` is non-zero, show a "payout change pending until <effectiveAt>" notice, but never display the pending address itself.

### Sat 03:14 JST: Feedback on hero-desktop.png

Feedback on docs/landing/hero-desktop.png. It looks great: Fuji, the reflection, the torii, the sakura and the vertical 名義 all land. Three fixes:
1. The byline still shows the old three names. It must be exactly "Karan Singh Bisht · Adithya Prasanna Suriya Prakash — ETHGlobal Tokyo 2026".
2. The torii intersects the wordmark: its right pillar and kasagi sit behind the "m". Move the torii further left (roughly x ≈ 12–16% of the viewport at 1440w) and/or scale it down about 15%, so the wordmark sits clear of it while the torii still reads large in the water. On mobile, keep it left of or behind the byline, never through the wordmark.
3. The x402 guard pill should copy `npm i @meigi/x402-guard`. That package now exists at packages/x402-guard.

When the landing is done, report back as planned. The next task will be the main app, in the same visual language.

### Sat 03:25 JST: Registry is live: wire status + resolve

The registry is live on Sepolia. For apps/landing/.env (and .env.example with placeholders):
- `VITE_REGISTRY_ADDRESS=0xB2D61a2d1EF2C340F8b4cf9ec90E1eDCB08a6e84`
- `VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com`
- `VITE_GITHUB_URL` stays empty for now.

The live status pill counts PayeeRegistered events: one payee so far, a fictional demo vendor. Resolving `T2011001234567` should show 株式会社メイギ商事 → 0x9B4f…47e4.

Note: public RPCs often cap eth_getLogs ranges. Query from the deployment block (about block 11,785,000; check contracts/broadcast/Deploy.s.sol/11155111/run-latest.json for the exact receipt blockNumber) rather than from 0, and fail soft.

### Sat 03:25 JST: Correction: exact deployment block

Correction: the registry was deployed at Sepolia block 11780968, not ~11,785,000. Querying PayeeRegistered logs from 11,785,000 would miss everything. Use fromBlock = 11780968n. Make it configurable as VITE_REGISTRY_FROM_BLOCK=11780968.

### Sat 03:51 JST: Registry v2 address for the status pill

The registry was redeployed (v2). Use VITE_REGISTRY_ADDRESS=0x205c977cF1f4Ed42e51a48759550eF40160A6396 with VITE_REGISTRY_FROM_BLOCK=11781105. The old 0xB2D6… is retired. Two fixture payees are registered, so the status pill should show 2.

### Sat 04:01 JST: pnpm install fixed (allowBuilds)

If you hit ERR_PNPM_IGNORED_BUILDS / verify-deps failures: fixed. pnpm-workspace.yaml now has `allowBuilds: esbuild: true`, and `pnpm install` exits 0.
