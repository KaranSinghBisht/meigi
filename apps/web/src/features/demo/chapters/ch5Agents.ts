// Chapter 5 (1:22 on): a research agent buys compute and data over x402; the guard checks each payee before the
// agent signs. The pacing follows the run itself: each purchase takes as long as its log lines take to type.

import { X402_RUN, type X402Purchase, type X402Run } from '../content/x402'
import { terminalLines, type TermLine } from '../content/x402Lines'
import type { BuildCtx, CaptionDef, ChapterDef } from '../engine/types'
import { card, hide, logGroup, logLine, rise, show, status, step, stepDone, typeIn } from './moves'

const CPS = 140
const FIRST = 0.9
const PURCHASE_GAP = 0.6
/** The panel's pipeline for the first purchase: 402, ENS, Registry, Screen, Sign, Settle. */
const STEP_OF: Readonly<Record<string, number>> = { 'ENS name resolves': 2, Registry: 3, 'payTo matches': 3, Screening: 4 }

interface Beat {
  readonly purchase: X402Purchase
  readonly lines: readonly TermLine[]
  readonly start: number
  readonly end: number
}

const lineTime = (line: TermLine): number => Math.max(0.25, line.text.length / CPS) + 0.17

function schedule(run: X402Run): Beat[] {
  const all = terminalLines(run)
  let at = FIRST
  return run.purchases.map((purchase) => {
    const lines = all.filter((line) => line.purchase === purchase.id)
    const start = at
    const end = start + 0.2 + lines.reduce((sum, line) => sum + lineTime(line), 0)
    at = end + PURCHASE_GAP
    return { purchase, lines, start, end }
  })
}

const BEATS = schedule(X402_RUN)

function captions(): CaptionDef[] {
  const refused = BEATS.find((beat) => beat.purchase.outcome.status === 'refused' && beat.purchase.declared)
  const undeclared = BEATS.find((beat) => !beat.purchase.declared)
  const list: CaptionDef[] = [
    { at: 0, text: 'Agents pay each other over x402, before any human looks.' },
    { at: 4.2, text: 'Before signing, the guard checks who it’s paying.' },
  ]
  if (refused) list.push({ at: refused.start, text: 'A hacked merchant is refused. The agent never signs.' })
  if (undeclared) list.push({ at: undeclared.start, text: 'Unknown merchants get a small, screened allowance, or nothing.' })
  return list.sort((a, b) => a.at - b.at)
}

function switchTab(c: BuildCtx): void {
  show(c, 'tab-agent', 0)
  c.tl.to(c.el('tab-mail'), { backgroundColor: 'rgba(255, 255, 255, 0)', duration: 0.3 }, c.t0 + 0.1)
  c.tl.to(c.el('tab-agent'), { backgroundColor: '#fbfbfd', duration: 0.3 }, c.t0 + 0.1)
  hide(c, 'url-mail', 0.1, { duration: 0.15 })
  show(c, 'url-agent', 0.2, { duration: 0.2 })
  hide(c, 'mail', 0.15, { duration: 0.2 })
  show(c, 'term', 0.25, { duration: 0.3 })
  hide(c, 'scene-urgent', 0.3)
  show(c, 'scene-x402', 0.45)
  logGroup(c, 'human', 'agents', 0.4)
  status(c, 'paid', 'x402', 0.4)
}

function termLine(c: BuildCtx, line: TermLine, at: number): number {
  const view = c.el('term-view')
  const row = c.el(`term-${line.id}`)
  c.tl.to(
    c.el('term-lines'),
    {
      y: () => -Math.max(0, row.offsetTop + row.offsetHeight + 16 - view.clientHeight),
      duration: 0.3,
      ease: 'power2.out',
    },
    c.t0 + at,
  )
  rise(c, row, at, { duration: 0.2 })
  return typeIn(c, `term-${line.id}-text`, at + 0.05, CPS) + 0.12
}

/** One purchase: its log types out while its card in the panel ticks through the guard's checks. */
function purchase(c: BuildCtx, beat: Beat, first: boolean): void {
  const { purchase: item } = beat
  card(c, 'x402', `x-card-${item.id}`, beat.start)
  let at = beat.start + 0.2
  for (const line of beat.lines) {
    const next = termLine(c, line, at)
    if (line.check !== null) {
      rise(c, `x-${item.id}-check-${line.check}`, next - 0.1, { duration: 0.25 })
      const index = STEP_OF[item.checks[line.check]?.label ?? '']
      if (first && index) step(c, 'x402', index, next - 0.1)
    }
    at = next
  }
  rise(c, `x-${item.id}-outcome`, at - 0.1)
  if (item.outcome.status === 'settled' && item.outcome.txHash) logLine(c, 'agents', `settle-${item.id}`, at, 90)
  if (!first) return
  for (const index of [1, 2, 3, 4, 5, 6]) stepDone(c, 'x402', index, at + 0.1)
}

/** The last purchase has settled, then the stage clears for the end card, so chapter 6 opens on the card. */
const OUTRO = 1.2
const DURATION = Math.max(20, (BEATS.at(-1)?.end ?? 18) + 1.6) + OUTRO

function outro(c: BuildCtx): void {
  const at = DURATION - OUTRO
  hide(c, 'slot-browser', at, { duration: 0.5 })
  hide(c, 'slot-panel', at + 0.1, { duration: 0.5 })
  show(c, 'end', at + 0.3, { scale: 1, duration: 0.8 })
}

export const chapter5: ChapterDef = {
  id: 'agents',
  title: 'Agents pay agents',
  duration: DURATION,
  captions: captions(),
  build(c) {
    switchTab(c)
    step(c, 'x402', 1, FIRST)
    BEATS.forEach((beat, index) => purchase(c, beat, index === 0))
    logLine(c, 'agents', 'refused', (BEATS.at(-1)?.end ?? 18) + 0.3, 90)
    outro(c)
  },
}
