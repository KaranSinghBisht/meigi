// Chapter 0 (0:00–0:24): 株式会社メイギ商事 joins Meigi. Its T-number, its two wallets, its domain and an officer,
// then one registration on Sepolia and a payee name that resolves. The registry panel beside the browser fills
// in with what the chain will hold.

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
  show(c, 'slot-browser', 0, { duration: 0.7 })
  show(c, 'slot-registry', 0.15, { duration: 0.7 })
  railStep(c, 1, 0.2)
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

function domainAndOfficer(c: BuildCtx): void {
  advance(c, 2, 8.9)
  press(c, 'onb-domain', 10.2)
  rise(c, 'r-domain', 10.6)
  advance(c, 3, 11.8)
  // The officer approves in World App on their own phone; the QR ticks when the proof arrives.
  show(c, 'onb-qr-ok', 13.3, { duration: 0.3 })
  hide(c, 'onb-officer-wait', 13.4, { duration: 0.2 })
  show(c, 'onb-officer', 13.5, { duration: 0.3 })
  rise(c, 'r-officers', 13.6)
}

function register(c: BuildCtx): void {
  advance(c, 4, 14.8)
  rise(c, 'r-evidence', 15.2)
  cursorTo(c, 'onb-register', 15.5, { duration: 0.8 })
  click(c, 16.4)
  hide(c, 'onb-register', 16.6, { duration: 0.2 })
  show(c, 'onb-registered', 16.8, { duration: 0.3 })
  rise(c, 'r-event', 16.9)
  hide(c, 'r-status-none', 17.0, { duration: 0.2 })
  show(c, 'r-status-active', 17.15, { duration: 0.3 })
}

function verified(c: BuildCtx): void {
  hide(c, 'cursor', 18.0)
  turn(c, 5, 18.3)
  show(c, 'onb-resolves', 19.7, { duration: 0.35 })
  rise(c, 'r-resolve', 19.8)
  c.tl.to(c.el('onb-step-6'), { '--on': 0, '--done': 1, duration: 0.3 }, c.t0 + 20.2)
  hide(c, 'slot-browser', 22.9, { duration: 0.6 })
  hide(c, 'slot-registry', 23.0, { duration: 0.6 })
}

export const chapter0: ChapterDef = {
  id: 'join',
  title: 'Company joins',
  duration: 24,
  captions: [
    { at: 0, text: 'Verify once: a company binds its registry number to one payout.' },
    { at: 4.6, text: 'One key controls the record; a separate wallet only receives.' },
    { at: 8.9, text: 'It proves its domain, and an officer proves they’re a unique human with World ID.' },
    { at: 14.8, text: `One registration on Sepolia, and ${ONBOARD.ens} resolves to that payout.` },
  ],
  build(c) {
    company(c)
    wallets(c)
    domainAndOfficer(c)
    register(c)
    verified(c)
  },
}
