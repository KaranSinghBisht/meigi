// Chapter 0 for a real run through the live wizard (a recording with `source: 'wizard'`): every click as it was
// made. The T-number is typed, the business wallet connected, the payout chosen, the officers enrolled, Register
// pressed, and the registration's real transaction follows.

import { ONBOARD } from '../content/onboard'
import type { BuildCtx, CaptionDef } from '../engine/types'
import { handOff, record, registered, turn } from './ch0Shared'
import { click, cursorTo, hide, rise, show, typeIn } from './moves'

export const WIZARD_DURATION = 26

/** Continue: the pointer goes to the button, clicks, and the screen turns. */
function advance(c: BuildCtx, n: number, at: number): void {
  cursorTo(c, `onb-next-${n}`, at - 0.95, { duration: 0.8 })
  click(c, at - 0.1)
  turn(c, n, at)
}

/** A button that turns into its result in place (connect, create). */
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

/** Domain and representation, then the officers enrolling one by one. */
function proofs(c: BuildCtx): void {
  advance(c, 2, 8.6)
  rise(c, 'r-domain', 9.3)
  advance(c, 3, 10.9)
  advance(c, 4, 13.6)
  ONBOARD.officers.forEach((_, index) => rise(c, `onb-officer-${index + 1}`, 14.0 + index * 0.25))
  rise(c, 'r-officers', 14.3)
}

function register(c: BuildCtx): void {
  advance(c, 5, 15.8)
  cursorTo(c, 'onb-register', 16.5, { duration: 0.8 })
  click(c, 17.4)
  hide(c, 'onb-register', 17.6, { duration: 0.2 })
  show(c, 'onb-registered', 17.8, { duration: 0.3 })
  record(c, 16.2, 17.9)
}

export function wizardCaptions(): CaptionDef[] {
  return [
    { at: 0, text: 'A company joins Meigi: a real run through the wizard, registered on Sepolia.' },
    { at: 4.6, text: 'A business key requests changes; one address receives every payment.' },
    {
      at: 8.6,
      text: ONBOARD.fixture
        ? 'A demo company has no domain to prove; a real company signs a DNS record.'
        : 'The business key signs a DNS record: the company proves its domain.',
    },
    { at: 10.9, text: 'Proving the signer represents the company comes in production.' },
    {
      at: 13.6,
      text: ONBOARD.placeholder
        ? 'With a placeholder officer, the company itself can’t change its payout.'
        : 'Officers enroll with World ID: a verified human approves every change the company asks for.',
    },
    { at: 15.8, text: `One registration on Sepolia, and ${ONBOARD.ens} resolves to that payout.` },
  ]
}

export function buildWizard(c: BuildCtx): void {
  company(c)
  wallets(c)
  proofs(c)
  register(c)
  hide(c, 'cursor', 19.0)
  registered(c, 19.3)
  handOff(c, 24.2)
}
