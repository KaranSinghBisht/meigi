// Serves the production build with `vite preview` and captures the hero with
// headless Chromium (SwiftShader WebGL by default).
//
//   pnpm --filter @meigi/landing build && pnpm --filter @meigi/landing shots
//
// Writes docs/landing/{hero-desktop,hero-mobile,ripple}.png at the repo root.
// SHOTS_EXTRA=1 also captures resolve, focus, glide-*, reduced-motion and
// no-webgl views. SHOTS_ONLY=a,b limits the run to named shots.

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(here, '..')
const outDir = resolve(appDir, '../../docs/landing')
const port = Number(process.env.SHOTS_PORT ?? 4173)
const base = `http://localhost:${port}/?stats`
const settleMs = Number(process.env.SHOTS_SETTLE ?? 2600)

const SOFTWARE_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
const HARDWARE_GL = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
const GL_ARGS = process.env.SHOTS_GPU === 'metal' ? HARDWARE_GL : SOFTWARE_GL

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

function startPreview() {
  const child = spawn(resolve(appDir, 'node_modules/.bin/vite'), ['preview', '--port', String(port), '--strictPort'], {
    cwd: appDir,
  })
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

async function waitForScene(page) {
  await page.waitForSelector('.stage.is-ready', { timeout: 90_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(settleMs)
}

async function snap(page, name) {
  await page.screenshot({ path: resolve(outDir, `${name}.png`) })
}

async function sweepWater(page) {
  const { width, height } = page.viewportSize()
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    await page.mouse.move(width * (0.14 + 0.72 * t), height * (0.8 + Math.sin(t * Math.PI * 2) * 0.05))
  }
  await page.mouse.click(width * 0.62, height * 0.76)
  await page.waitForTimeout(500)
  await snap(page, 'ripple')
}

async function resolveNumber(page) {
  await page.getByRole('button', { name: 'Resolve a T-number' }).click()
  await page.keyboard.type('T2011001234567')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.resolve__card, .resolve__note', { timeout: 30_000 })
  await page.waitForTimeout(400)
  await snap(page, 'resolve')
}

async function focusEnter(page) {
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const onEnter = await page.evaluate(() => document.activeElement?.classList.contains('pill--enter'))
    if (onEnter) break
  }
  await page.waitForTimeout(300)
  await snap(page, 'focus')
}

async function glideFrames(page) {
  await page.evaluate(() => {
    document.querySelector('.overlay')?.setAttribute('style', 'opacity:0')
  })
  for (const [index, t] of [[1, 0.25], [2, 0.45], [3, 0.6], [4, 0.85]]) {
    await page.evaluate((value) => window.__meigiDebug?.glideTo(value), t)
    await page.waitForTimeout(1500)
    await snap(page, `glide-${index}`)
  }
}

async function stampSeal(page) {
  const box = await page.locator('.hero__wordmark').boundingBox()
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.55, { steps: 6 })
  await page.waitForTimeout(350)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(170)
  await snap(page, 'stamp')
}

async function copyInstall(page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: /x402 guard/ }).click()
  await page.waitForTimeout(250)
  await snap(page, 'copy')
  return page.evaluate(() => navigator.clipboard.readText())
}

const SHOTS = [
  { name: 'hero-desktop', context: DESKTOP, act: (page) => snap(page, 'hero-desktop') },
  { name: 'hero-mobile', context: MOBILE, act: (page) => snap(page, 'hero-mobile') },
  { name: 'ripple', context: DESKTOP, act: sweepWater },
  { name: 'resolve', extra: true, context: DESKTOP, act: resolveNumber },
  { name: 'focus', extra: true, context: DESKTOP, act: focusEnter },
  { name: 'glide', extra: true, context: DESKTOP, act: glideFrames },
  { name: 'stamp', extra: true, context: DESKTOP, act: stampSeal },
  { name: 'copy', extra: true, context: DESKTOP, act: copyInstall },
  {
    name: 'reduced-motion',
    extra: true,
    context: { ...DESKTOP, reducedMotion: 'reduce' },
    act: (page) => snap(page, 'reduced-motion'),
  },
  { name: 'no-webgl', extra: true, noWebgl: true, context: DESKTOP, act: (page) => snap(page, 'no-webgl') },
]

async function run(browser, shot) {
  const context = await browser.newContext(shot.context)
  const page = await context.newPage()
  const problems = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  await page.goto(base, { waitUntil: 'networkidle' })
  await waitForScene(page)
  const stats = await page.evaluate(() => window.__meigiStats ?? null)
  const output = await shot.act(page)
  await context.close()
  return { name: shot.name, stats, output, problems }
}

function selectShots() {
  const only = process.env.SHOTS_ONLY?.split(',')
  if (only) return SHOTS.filter((shot) => only.includes(shot.name))
  return SHOTS.filter((shot) => !shot.extra || process.env.SHOTS_EXTRA === '1')
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const preview = await startPreview()
  const browsers = {}
  try {
    browsers.gl = await chromium.launch({ channel: 'chromium', args: GL_ARGS })
    browsers.none = await chromium.launch({ channel: 'chromium', args: ['--disable-webgl', '--disable-webgl2'] })
    for (const shot of selectShots()) {
      const result = await run(shot.noWebgl ? browsers.none : browsers.gl, shot)
      process.stdout.write(`${JSON.stringify(result)}\n`)
    }
  } finally {
    await Promise.all(Object.values(browsers).map((browser) => browser.close()))
    preview.kill()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
