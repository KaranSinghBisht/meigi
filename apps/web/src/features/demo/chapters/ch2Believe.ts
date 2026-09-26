// Chapter 2 (0:18–0:45): triage flags it, the LLM believes it, the kernel reads the chain, and the payment is held.

import { BEC } from '../content/bec'
import type { BuildCtx, ChapterDef } from '../engine/types'
import { bar, card, feed, hide, rise, status, step, typeIn } from './moves'

function triage(c: BuildCtx): void {
  c.tl.to(c.el('browser-dim'), { autoAlpha: 1, duration: 0.6 }, c.t0)
  hide(c, 'cursor', 0.2)
  step(c, 'bec', 2, 0.1)
  card(c, 'bec', 'bec-card-triage', 0.2)
  bar(c, 'bec-bar-type', 0.9)
  bar(c, 'bec-bar-dest', 1.5)
  bar(c, 'bec-bar-susp', 2.1)
  rise(c, 'bec-triage-hold', 3.4)
}

function belief(c: BuildCtx): void {
  step(c, 'bec', 3, 6)
  card(c, 'bec', 'bec-card-belief', 6.1)
  const typed = typeIn(c, 'bec-belief-text', 6.8, 50)
  rise(c, 'bec-belief-wants', typed + 0.3)
}

/** Check rows tick in one by one; the failing one holds the eye a moment longer. */
function kernel(c: BuildCtx): number {
  step(c, 'bec', 4, 12)
  card(c, 'bec', 'bec-card-kernel', 12.1)
  let at = 12.8
  BEC.analysis.kernel.checks.forEach((check, index) => {
    rise(c, `bec-check-${index}`, at, { duration: 0.3 })
    at += check.ok ? 0.42 : 1.6
  })
  return at
}

function decide(c: BuildCtx, from: number): void {
  step(c, 'bec', 5, from)
  card(c, 'bec', 'bec-card-screen', from + 0.1)
  step(c, 'bec', 6, from + 1.6)
  card(c, 'bec', 'bec-card-decision', from + 1.7)
  status(c, 'reading', 'hold', from + 1.8)
  typeIn(c, 'bec-explain', from + 2.6, 110)
  feed(c, 'bec', 'bec-card-decision', from + 5.6, 1.2)
}

export const chapter2: ChapterDef = {
  id: 'believe',
  title: 'Agent vs chain',
  duration: 27,
  captions: [
    { at: 0, text: `Our fine-tuned 0.8B triage model flags it in ${triageMs()} ms.` },
    { at: 6, text: 'The LLM believes the email. That’s expected: it only proposes.' },
    { at: 12, text: `The kernel reads the chain: ${BEC.legalName} is paid at ${BEC.registeredShort}, nowhere else.` },
    { at: 19.4, text: 'Payment held.' },
  ],
  build(c) {
    triage(c)
    belief(c)
    const end = kernel(c)
    decide(c, Math.max(end, 17.6))
  },
}

function triageMs(): number {
  const { triage } = BEC.analysis
  return triage.status === 'ok' ? triage.latencyMs : 0
}
