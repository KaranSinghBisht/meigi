// Serves the production build with `vite preview` and captures every page with headless Chromium.
//
//   pnpm --filter @meigi/web build && pnpm --filter @meigi/web shots
//
// Writes docs/web/*.png at the repo root (1440 × 900). SHOTS_ONLY=a,b limits the run to named shots;
// SHOTS_HONEST=1 adds the x402 purchases that settle a real Sepolia payment.
// SHOTS_PORT picks the preview port (default 4173, which the services allow for CORS).

import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { mockPendingPayout } from './rpcMock.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(here, '..')
const outDir = resolve(appDir, '../../docs/web')
const port = Number(process.env.SHOTS_PORT ?? 4173)
// SHOTS_HOSTED=1 captures a hosted build (VITE_HOSTED=1) as hosted-*.png.
const hosted = process.env.SHOTS_HOSTED === '1'
const base = `http://localhost:${port}`
const VIEWPORT = { width: 1440, height: 900 }
const RPC_URL = process.env.VITE_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const deployment = JSON.parse(await readFile(resolve(appDir, '../../contracts/deployments/11155111.json'), 'utf8'))
const REGISTRY = process.env.VITE_REGISTRY_ADDRESS || deployment.registry

/** The live chain has no queued change; this shows how the explorer renders one (and that it hides the address). */
const pendingPayout = (page) =>
  mockPendingPayout(page, {
    rpcUrl: RPC_URL,
    registry: REGISTRY,
    pending: '0xbe112970a3854Dfb255dA6202F449819bed794b6',
    landsInSeconds: 71 * 3600 + 42 * 60 + 5,
  })

function startPreview() {
  const bin = resolve(appDir, 'node_modules/.bin/vite')
  const child = spawn(bin, ['preview', '--port', String(port), '--strictPort'], { cwd: appDir })
  return new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('vite preview did not start in 20s')), 20_000)
    child.stdout.on('data', (chunk) => {
      if (!String(chunk).includes(String(port))) return
      clearTimeout(timer)
      done(child)
    })
    child.on('exit', (code) => fail(new Error(`vite preview exited with ${code}`)))
  })
}

async function settle(page, selector, timeout = 45_000) {
  if (selector) await page.waitForSelector(selector, { timeout })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
}

/** The live world draws its first frame (software WebGL here, so give it time), then the camera settles. */
async function sceneReady(page) {
  await page.waitForSelector('.scene-canvas.is-ready', { timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1600)
}

async function snap(page, name, fullPage = false) {
  await page.screenshot({ path: resolve(outDir, `${hosted ? 'hosted-' : ''}${name}.png`), fullPage })
}

const SHOTS = [
  { name: 'landing-hero', path: '/', ready: '.hero__wordmark' },
  // Mid-glide through the torii: the hero has faded and the camera is on its way to the app's gate station.
  { name: 'enter-glide', path: '/', ready: '.hero__wordmark', act: enterGlide },
  { name: 'home', path: '/start', ready: 'main h1' },
  { name: 'registry', path: '/registry/T2011001234567', ready: '.payee__name', after: '.feed__item' },
  { name: 'registry-empty', path: '/registry', ready: '.finder__item' },
  { name: 'registry-pending', path: '/registry/T2011001234567', ready: '.pending', setup: pendingPayout },
  { name: 'register', path: '/register', ready: 'main h1' },
  { name: 'change', path: '/change/T2011001234567', ready: '.picker__option' },
  { name: 'change-approvals', path: '/change/T2011001234567', ready: '.picker__option', act: openIntent },
  { name: 'agent', path: '/agent', ready: '.invoice__example', act: loadExample },
  { name: 'agent-analysis', path: '/agent', ready: '.invoice__example', act: analyzeScam },
  { name: 'agent-refusal', path: '/agent', ready: '.invoice__example', act: forceScam },
  { name: 'agent-force-refused', path: '/agent', ready: '.invoice__example', act: forceInjection },
  { name: 'x402', path: '/x402', ready: '.x402__grid' },
  { name: 'business', path: '/business', ready: '.biz-product' },
  // The research agent's run settles real Sepolia payments (testnet gas + mJPYC), so it only runs with
  // SHOTS_HONEST=1; its compromised mirror is refused before signing.
  { name: 'x402-run', path: '/x402', ready: '.x402__grid', act: runResearchAgent, optIn: 'SHOTS_HONEST' },
]

/** Enter, then wait until the camera is passing through the torii (the glide takes GLIDE_SECONDS, 2.2 s). */
async function enterGlide(page) {
  await page.getByRole('link', { name: /enter/ }).click()
  await page.waitForTimeout(1500)
}

async function loadExample(page) {
  await page.locator('.invoice__example').nth(1).click()
  await page.waitForTimeout(300)
}

/** Needs the verifier. Opening a request writes nothing on-chain; it only asks the officers to prove. */
async function openIntent(page) {
  await page.getByLabel('New payout address').fill('0x1111111111111111111111111111111111111111')
  await page.getByRole('button', { name: 'Open approval request' }).click()
  await page.waitForSelector('.approvals__head', { timeout: 30_000 })
  await page.waitForTimeout(400)
}

/** Needs the AP agent running (VITE_AGENT_URL). The second example is the bank-change scam. */
async function analyzeScam(page) {
  await loadExample(page)
  await page.getByRole('button', { name: 'Analyze' }).click()
  await page.waitForSelector('.decision', { timeout: 120_000 })
  // The console scrolls its results into view; wait for that scroll to finish.
  await page.waitForTimeout(1500)
}

async function forceScam(page) {
  await analyzeScam(page)
  await page.getByRole('button', { name: 'Let the agent pay anyway' }).click()
  await page.waitForSelector('.refusal', { timeout: 120_000 })
  await page.waitForTimeout(1200)
}

/** The hidden-lookalike injection can't be forced: the agent refuses before anything is simulated or sent. */
async function forceInjection(page) {
  await page.getByRole('button', { name: /Prompt injection/ }).click()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await page.waitForSelector('.decision', { timeout: 120_000 })
  await page.getByRole('button', { name: 'Let the agent pay anyway' }).click()
  await page.waitForSelector('.agent__results > .notice', { timeout: 120_000 })
  await page.locator('.agent__results > .notice').scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
}

/** Settles real payments: the research agent buys GPU-minutes and data, and is refused by the swapped mirror. */
async function runResearchAgent(page) {
  await page.getByRole('button', { name: 'Run the research agent' }).click()
  await page.waitForSelector('.agent-run__steps', { timeout: 180_000 })
  await page.locator('.agent-run__steps').evaluate((steps) => steps.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(600)
}

/**
 * Harmless, and not ours: R3F's store builds a THREE.Clock (deprecated since three r183) on every Canvas mount, and
 * SwiftShader reports its own GPU stalls. Everything else a page logs is still reported.
 */
const KNOWN_NOISE = /THREE\.Clock: This module has been deprecated|GL Driver Message/

async function run(browser, shot) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const problems = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return
    if (!KNOWN_NOISE.test(msg.text())) problems.push(`${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  if (shot.setup) await shot.setup(page)
  // The start page keeps a connection busy (live counts, animation), so wait for load, then for a quiet network.
  await page.goto(`${base}${shot.path}`, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await sceneReady(page)
  await settle(page, shot.ready)
  if (shot.after) await settle(page, shot.after)
  if (shot.act) await shot.act(page)
  await snap(page, shot.name, shot.fullPage)
  await context.close()
  return { name: shot.name, problems }
}

/** Straight into each page of a hosted build: services that need the demo machine show their panels. */
const HOSTED_SHOTS = [
  { name: 'landing-hero', path: '/', ready: '.hero__wordmark' },
  { name: 'home', path: '/start', ready: 'main h1' },
  { name: 'registry', path: '/registry/T2011001234567', ready: '.payee__name', after: '.feed__item' },
  { name: 'agent', path: '/agent', ready: '.vault-panel', after: '.recorded' },
  { name: 'x402', path: '/x402', ready: '.x402__grid' },
  { name: 'register', path: '/register', ready: 'main h1' },
  { name: 'change', path: '/change/T2011001234567', ready: '.demo-machine' },
]

function selectShots() {
  const allowed = hosted ? HOSTED_SHOTS : SHOTS.filter((shot) => !shot.optIn || process.env[shot.optIn] === '1')
  const only = process.env.SHOTS_ONLY?.split(',')
  return only ? allowed.filter((shot) => only.includes(shot.name)) : allowed
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const preview = await startPreview()
  // Headless Chromium has no GPU: SwiftShader gives the scene WebGL2.
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  try {
    for (const shot of selectShots()) {
      try {
        process.stdout.write(`${JSON.stringify(await run(browser, shot))}\n`)
      } catch (error) {
        process.stdout.write(`${JSON.stringify({ name: shot.name, failed: String(error.message ?? error) })}\n`)
      }
    }
  } finally {
    await browser.close()
    preview.kill()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
