// Chapter 5 (1:22–1:42): a research agent buys compute and data over x402; the guard checks each payee before
// the agent signs.

import { X402_RUN, type X402Purchase } from '../content/x402'
import { terminalLines, type TermLine } from '../content/x402Lines'
import type { BuildCtx, ChapterDef } from '../engine/types'
import { card, hide, rise, show, status, step, stepDone, typeIn } from './moves'

/** When each purchase starts, in seconds from the chapter's start; the captions follow the same beats. */
const SWAPPED_AT = 9.8
const UNDECLARED_AT = 15.6
const STARTS: readonly number[] = [0.9, SWAPPED_AT, UNDECLARED_AT]
const LATE = 17.5

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
  status(c, 'paid', 'x402', 0.4)
}

function termLine(c: BuildCtx, line: TermLine, at: number): number {
  const view = c.el('term').querySelector('.term__view')
  const row = c.el(`term-${line.id}`)
  c.tl.to(
    c.el('term-lines'),
    {
      y: () =>
        -Math.max(0, row.offsetTop + row.offsetHeight + 16 - (view instanceof HTMLElement ? view.clientHeight : 400)),
      duration: 0.3,
      ease: 'power2.out',
    },
    c.t0 + at,
  )
  rise(c, row, at, { duration: 0.2 })
  return typeIn(c, `term-${line.id}-text`, at + 0.05, 95) + 0.12
}

/** One purchase: its terminal lines type out while its card in the panel ticks through the guard's checks. */
function purchase(c: BuildCtx, item: X402Purchase, lines: readonly TermLine[], start: number, first: boolean): void {
  card(c, 'x402', `x-card-${item.id}`, start)
  let at = start + 0.2
  let check = 0
  for (const line of lines) {
    const next = termLine(c, line, at)
    if (line.text.startsWith('guard') && check < item.checks.length) {
      rise(c, `x-${item.id}-check-${check}`, next - 0.1, { duration: 0.25 })
      if (first) step(c, 'x402', Math.min(check + 2, 5), next - 0.1)
      check += 1
    }
    at = next
  }
  rise(c, `x-${item.id}-outcome`, at - 0.1)
  if (first) {
    step(c, 'x402', 6, at - 0.1)
    stepDone(c, 'x402', 6, at + 0.3)
  }
}

export const chapter5: ChapterDef = {
  id: 'agents',
  title: 'Agents pay agents',
  duration: 20,
  captions: [
    { at: 0, text: 'Agents pay each other over x402, before any human looks.' },
    { at: 4.6, text: 'Before signing, the guard checks who it’s paying.' },
    { at: SWAPPED_AT, text: 'A hacked merchant is refused. The agent never signs.' },
    { at: UNDECLARED_AT, text: 'Unknown merchants get a small, screened allowance, or nothing.' },
  ],
  build(c) {
    switchTab(c)
    step(c, 'x402', 1, 0.9)
    const lines = terminalLines(X402_RUN)
    X402_RUN.purchases.forEach((item, index) => {
      const start = STARTS[index] ?? LATE
      purchase(
        c,
        item,
        lines.filter((line) => line.purchase === item.id),
        start,
        index === 0,
      )
    })
  },
}
