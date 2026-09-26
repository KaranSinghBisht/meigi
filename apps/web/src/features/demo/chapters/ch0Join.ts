// Chapter 0: a company joins Meigi, presented as /register's own replay presents it (content/onboardRecording).
// Today that is 株式会社メイギ商事, which the seed script registered on Sepolia directly: no one typed, connected,
// created or pressed Register, so there is no pointer and no click. The wizard's screens show the record, and the
// registry panel beside them fills in with what the chain holds. When a real run through the wizard is recorded,
// the same chapter plays it click by click (ch0Wizard), from the data alone.

import { ONBOARD } from '../content/onboard'
import type { BuildCtx, CaptionDef, ChapterDef } from '../engine/types'
import { handOff, record, registered, turn } from './ch0Shared'
import { buildWizard, WIZARD_DURATION, wizardCaptions } from './ch0Wizard'
import { rise } from './moves'

const SEED_DURATION = 24

/** When each screen turns to the next (screens 1–5), long enough to read each. */
const TURNS = [3.6, 7.2, 9.8, 12.8, 15.2] as const

function seedCaptions(): CaptionDef[] {
  return [
    { at: 0, text: 'How a company joins Meigi, shown with our demo company’s record on Sepolia.' },
    { at: TURNS[0], text: 'Register once: a company binds its registry number to one payout.' },
    { at: TURNS[1], text: 'Real companies also prove their domain and enroll World ID officers; this demo company is labelled.' },
    { at: TURNS[2], text: 'Proving the signer represents the company comes in production.' },
    { at: TURNS[3], text: 'Its placeholder officer means no one can change its payout.' },
    { at: TURNS[4], text: `One registration on Sepolia, and ${ONBOARD.ens} resolves to that payout.` },
  ]
}

/** The seeded registration, screen by screen: each screen as the record has it, the registry panel alongside. */
function buildSeed(c: BuildCtx): void {
  rise(c, 'r-tnumber', 0.8)
  rise(c, 'r-ens', 1.1)
  turn(c, 1, TURNS[0])
  rise(c, 'r-controller', TURNS[0] + 0.7)
  rise(c, 'r-payout', TURNS[0] + 1.0)
  turn(c, 2, TURNS[1])
  rise(c, 'r-domain', TURNS[1] + 0.7)
  turn(c, 3, TURNS[2])
  turn(c, 4, TURNS[3])
  rise(c, 'r-officers', TURNS[3] + 0.7)
  turn(c, 5, TURNS[4])
  record(c, TURNS[4] + 0.8, TURNS[4] + 1.5)
  registered(c, 19.0)
  handOff(c, 22.2)
}

export const chapter0: ChapterDef = {
  id: 'join',
  title: 'Company joins',
  duration: ONBOARD.seeded ? SEED_DURATION : WIZARD_DURATION,
  captions: ONBOARD.seeded ? seedCaptions() : wizardCaptions(),
  build: ONBOARD.seeded ? buildSeed : buildWizard,
}
