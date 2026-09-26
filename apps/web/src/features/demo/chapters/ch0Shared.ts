// Moves chapter 0 makes whatever registration it presents: the rail, the turn to the next screen, the chain's
// record appearing in the registry panel, the registered screen, and the hand-over to chapter 1.

import type { BuildCtx } from '../engine/types'
import { hide, rise, show } from './moves'

/** The rail lights step `n` and ticks the one before it. */
export function railStep(c: BuildCtx, n: number, at: number): void {
  c.tl.to(c.el(`onb-step-${n}`), { '--on': 1, duration: 0.3 }, c.t0 + at)
  if (n > 1) c.tl.to(c.el(`onb-step-${n - 1}`), { '--on': 0, '--done': 1, duration: 0.3 }, c.t0 + at)
}

/** The next screen slides in from the right, as in the real wizard. */
export function turn(c: BuildCtx, n: number, at: number): void {
  hide(c, `onb-screen-${n}`, at, { x: -24, duration: 0.3 })
  show(c, `onb-screen-${n + 1}`, at + 0.15, { x: 0, duration: 0.4 })
  railStep(c, n + 1, at)
}

/** The chain's record: its evidence, then the PayeeRegistered event and the payee's status, active. */
export function record(c: BuildCtx, evidenceAt: number, eventAt: number): void {
  rise(c, 'r-evidence', evidenceAt)
  rise(c, 'r-event', eventAt)
  hide(c, 'r-status-none', eventAt + 0.1, { duration: 0.2 })
  show(c, 'r-status-active', eventAt + 0.25, { duration: 0.3 })
}

/** The registered screen: the payee card, then its name resolving in any ENS client, and the rail's last tick. */
export function registered(c: BuildCtx, at: number): void {
  turn(c, 6, at)
  show(c, 'onb-resolves', at + 1.4, { duration: 0.35 })
  rise(c, 'r-resolve', at + 1.5)
  c.tl.to(c.el('onb-step-7'), { '--on': 0, '--done': 1, duration: 0.3 }, c.t0 + at + 1.9)
}

/**
 * A different company's desk: the browser and the registry panel fade out, the browser swaps Meigi's /register for
 * Haruka's inbox while it is away, and it comes back with the agent panel, all before chapter 1 starts. So the
 * first frame of chapter 1 is fully drawn, as every chapter's is.
 */
export function handOff(c: BuildCtx, at: number): void {
  hide(c, 'slot-browser', at, { duration: 0.5 })
  hide(c, 'slot-registry', at + 0.1, { duration: 0.5 })
  const swap = c.t0 + at + 0.65
  for (const name of ['onboard-page', 'tab-face-register', 'url-register']) c.tl.set(c.el(name), { autoAlpha: 0 }, swap)
  for (const name of ['tab-face-mail', 'url-mail']) c.tl.set(c.el(name), { autoAlpha: 1 }, swap)
  show(c, 'slot-browser', at + 0.8, { duration: 0.6 })
  show(c, 'slot-panel', at + 0.95, { duration: 0.6 })
}
