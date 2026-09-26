// Chapter 0 (0:00–0:26): 株式会社メイギ商事 joins Meigi, through the seven steps /register has. Its T-number and
// its two wallets; then the three steps it passes without doing (no domain as a fictional company,
// representation not built for anyone yet, a placeholder officer), shown as the record has them; one registration
// on Sepolia, and a payee name that resolves. The registry panel beside it fills in as it goes.

import { ONBOARD } from '../content/onboard'
import type { BuildCtx, ChapterDef } from '../engine/types'
import { click, cursorTo, hide, rise, show, typeIn } from './moves'

/** The rail lights step `n` and ticks the one before it. */
function railStep(c: BuildCtx, n: number, at: number): void {
  c.tl.to(c.el(`onb-step-${n}`), { '--on': 1, duration: 0.3 }, c.t0 + at)
  if (n > 1) c.tl.to(c.el(`onb-step-${n - 1}`), { '--on': 0, '--done': 1, duration: 0.3 }, c.t0 + at)
}

/** The next screen slides in from the right, as in the real wizard. */
function turn(c: BuildCtx, n: number, at: number): void {
  hide(c, `onb-screen-${n}`, at, { x: -24, duration: 0.3 })
  show(c, `onb-screen-${n + 1}`, at + 0.15, { x: 0, duration: 0.4 })
  railStep(c, n + 1, at)
}

/** Continue: the pointer goes to the button, clicks, and the screen turns. */
function advance(c: BuildCtx, n: number, at: number): void {
  cursorTo(c, `onb-next-${n}`, at - 0.95, { duration: 0.8 })
  click(c, at - 0.1)
  turn(c, n, at)
}

/** A button that turns into its result in place (connect, create, check). */
function press(c: BuildCtx, name: string, at: number): void {
  cursorTo(c, `${name}-action`, at - 0.85, { duration: 0.7 })
  click(c, at - 0.05)
  hide(c, `${name}-action`, at + 0.15, { duration: 0.15 })
  show(c, name, at + 0.25, { duration: 0.3 })
}

function company(c: BuildCtx): void {
  c.tl.set(c.el('cursor'), { x: 720, y: 430 }, c.t0)
  show(c, 'cursor', 0.5)
  cursorTo(c, 'onb-input', 0.7, { duration: 0.8, fx: 0.3 })
  click(c, 1.5)
  c.tl.to(c.el('onb-input'), { '--focus': 1, duration: 0.2 }, c.t0 + 1.5)
  typeIn(c, 'onb-tnumber', 1.7, 11)
  typeIn(c, 'onb-ens', 1.7, 19)
  c.tl.to(c.el('onb-input'), { '--focus': 0, duration: 0.3 }, c.t0 + 3.2)
  rise(c, 'onb-record', 3.2)
  rise(c, 'r-tnumber', 3.3)
  rise(c, 'r-ens', 3.5)
}

function wallets(c: BuildCtx): void {
  advance(c, 1, 4.6)
  press(c, 'onb-controller', 5.8)
  rise(c, 'r-controller', 6.2)
  press(c, 'onb-payout', 7.2)
  rise(c, 'r-payout', 7.6)
}

/**
 * The three steps a demo company passes without doing: no domain, representation (not built for anyone yet), and a
 * placeholder officer. Each screen says so, then moves on.
 */
function passedSteps(c: BuildCtx): void {
  advance(c, 2, 8.6)
  rise(c, 'r-domain', 9.3)
  advance(c, 3, 10.9)
  advance(c, 4, 13.6)
  rise(c, 'r-officers', 14.3)
}

function register(c: BuildCtx): void {
  advance(c, 5, 15.8)
  rise(c, 'r-evidence', 16.2)
  cursorTo(c, 'onb-register', 16.5, { duration: 0.8 })
  click(c, 17.4)
  hide(c, 'onb-register', 17.6, { duration: 0.2 })
  show(c, 'onb-registered', 17.8, { duration: 0.3 })
  rise(c, 'r-event', 17.9)
  hide(c, 'r-status-none', 18.0, { duration: 0.2 })
  show(c, 'r-status-active', 18.15, { duration: 0.3 })
}

function registered(c: BuildCtx): void {
  hide(c, 'cursor', 19.0)
  turn(c, 6, 19.3)
  show(c, 'onb-resolves', 20.7, { duration: 0.35 })
  rise(c, 'r-resolve', 20.8)
  c.tl.to(c.el('onb-step-7'), { '--on': 0, '--done': 1, duration: 0.3 }, c.t0 + 21.2)
  handOff(c, 24.2)
}

/**
 * A different company's desk: the browser and the registry panel fade out, the browser swaps Meigi's /register for
 * Haruka's inbox while it is away, and it comes back with the agent panel, all before chapter 1 starts. So the
 * first frame of chapter 1 is fully drawn, as every chapter's is.
 */
function handOff(c: BuildCtx, at: number): void {
  hide(c, 'slot-browser', at, { duration: 0.5 })
  hide(c, 'slot-registry', at + 0.1, { duration: 0.5 })
  const swap = c.t0 + at + 0.65
  for (const name of ['onboard-page', 'tab-face-register', 'url-register']) c.tl.set(c.el(name), { autoAlpha: 0 }, swap)
  for (const name of ['tab-face-mail', 'url-mail']) c.tl.set(c.el(name), { autoAlpha: 1 }, swap)
  show(c, 'slot-browser', at + 0.8, { duration: 0.6 })
  show(c, 'slot-panel', at + 0.95, { duration: 0.6 })
}

export const chapter0: ChapterDef = {
  id: 'join',
  title: 'Company joins',
  duration: 26,
  captions: [
    { at: 0, text: 'Register once: a company binds its registry number to one payout.' },
    { at: 4.6, text: 'A business key approves changes; one address receives every payment.' },
    { at: 8.6, text: 'Real companies also prove their domain and enroll World ID officers; this demo company is labelled.' },
    { at: 10.9, text: 'Proving the signer represents the company comes in production.' },
    { at: 15.8, text: `One registration on Sepolia, and ${ONBOARD.ens} resolves to that payout.` },
  ],
  build(c) {
    company(c)
    wallets(c)
    passedSteps(c)
    register(c)
    registered(c)
  },
}
