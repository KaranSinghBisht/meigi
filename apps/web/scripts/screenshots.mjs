// Serves the production build with `vite preview` and captures every page with headless Chromium.
//
//   pnpm --filter @meigi/web build && pnpm --filter @meigi/web shots
//
// Writes docs/web/*.png at the repo root (1440 × 900). SHOTS_ONLY=a,b limits the run to named shots.
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

async function snap(page, name, fullPage = false) {
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage })
}

const SHOTS = [
  { name: 'home', path: '/', ready: '.strip__text .jp' },
  { name: 'registry', path: '/registry/T2011001234567', ready: '.payee__name', after: '.feed__item' },
  { name: 'registry-empty', path: '/registry', ready: '.directory__chip' },
  { name: 'registry-pending', path: '/registry/T2011001234567', ready: '.pending', setup: pendingPayout },
  { name: 'register', path: '/register', act: fillRegistration },
  { name: 'change', path: '/change/T2011001234567', ready: '.picker__option' },
  { name: 'change-approvals', path: '/change/T2011001234567', ready: '.picker__option', act: openIntent },
  { name: 'agent', path: '/agent', ready: '.invoice__example', act: loadExample },
  { name: 'agent-analysis', path: '/agent', ready: '.invoice__example', act: analyzeScam },
  { name: 'agent-refusal', path: '/agent', ready: '.invoice__example', act: forceScam },
  { name: 'x402', path: '/x402', ready: '.merchant', act: buyCompromised },
]

async function fillRegistration(page) {
  await page.getByLabel('T-number').fill(process.env.SHOTS_T_NUMBER ?? 'T5010401067252')
  await page.waitForSelector('.nta-hint', { timeout: 20_000 })
  await page.waitForTimeout(1200)
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
  await page.waitForTimeout(500)
}

async function forceScam(page) {
  await analyzeScam(page)
  await page.getByRole('button', { name: 'Let the agent pay anyway' }).click()
  await page.waitForSelector('.refusal', { timeout: 120_000 })
  await page.waitForTimeout(1200)
}

async function buyCompromised(page) {
  await page.getByRole('button', { name: 'Buy from compromised merchant' }).click()
  await page.waitForSelector('.merchant--compromised .notice', { timeout: 90_000 })
  await page.waitForTimeout(400)
}

async function run(browser, shot) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const problems = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  if (shot.setup) await shot.setup(page)
  await page.goto(`${base}${shot.path}`, { waitUntil: 'networkidle' })
  await settle(page, shot.ready)
  if (shot.after) await settle(page, shot.after)
  if (shot.act) await shot.act(page)
  await snap(page, shot.name, shot.fullPage)
  await context.close()
  return { name: shot.name, problems }
}

function selectShots() {
  const only = process.env.SHOTS_ONLY?.split(',')
  return only ? SHOTS.filter((shot) => only.includes(shot.name)) : SHOTS
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const preview = await startPreview()
  const browser = await chromium.launch({ channel: 'chromium' })
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
