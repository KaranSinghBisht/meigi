// Chapter 4 (0:58–1:22): a genuine but urgent invoice is held for a person; a verified human approves it through
// World ID for Agents, and only then does the vault pay.

import type { BuildCtx, ChapterDef } from '../engine/types'
import { bar, card, click, cursorTo, hide, light, logLine, rise, scrollTo, show, status, step, stepDone } from './moves'

function arrive(c: BuildCtx): void {
  hide(c, 'compose', 0, { y: 40, duration: 0.4 })
  c.tl.to(c.el('row-bec'), { backgroundColor: '#f6f8fc', fontWeight: 400, duration: 0.3 }, c.t0 + 0.2)
  c.tl.to(c.el('slot-urgent'), { height: 'auto', duration: 0.6, ease: 'power3.out' }, c.t0 + 0.5)
  show(c, 'inbox-count', 0.7)
  status(c, 'draft', 'new', 0.6)
  hide(c, 'scene-bec', 0.8)
  show(c, 'scene-urgent', 1.0)
  cursorTo(c, 'row-urgent', 1.2, { duration: 0.9, fx: 0.45, fy: 0.35 })
  click(c, 2.1)
  c.tl.to(c.el('row-urgent'), { backgroundColor: '#d3e3fd', duration: 0.2 }, c.t0 + 2.15)
  hide(c, 'inbox-count', 2.2)
  hide(c, 'msg-bec', 2.15, { duration: 0.2 })
  show(c, 'msg-urgent', 2.3, { x: 0 })
}

function read(c: BuildCtx): void {
  step(c, 'urgent', 1, 2.6)
  status(c, 'new', 'reading', 2.6)
  card(c, 'urgent', 'u-card-read', 2.7)
  for (const [index, key] of ['tNumber', 'amount', 'address', 'invoice'].entries()) {
    light(c, `urgent-${key}`, 3.0 + index * 0.25)
    show(c, `u-f-${key}`, 3.2 + index * 0.25)
  }
  scrollTo(c, 'urgent-scroll', 'urgent-urgent', 3.3, 1.2, 150)
  light(c, 'urgent-urgent', 4.2)
  c.tl.to(c.el('urgent-urgent'), { '--u': 1, duration: 0.8 }, c.t0 + 4.2)
  rise(c, 'u-flag', 4.4)
}

function triage(c: BuildCtx): void {
  step(c, 'urgent', 2, 4.9)
  card(c, 'urgent', 'u-card-triage', 5.0)
  bar(c, 'u-bar-pressure', 5.5, 0.8)
  bar(c, 'u-bar-safe', 5.9, 0.8)
  bar(c, 'u-bar-susp', 6.3, 0.8)
  rise(c, 'u-triage-hold', 7.0)
  step(c, 'urgent', 3, 7.3)
  card(c, 'urgent', 'u-card-kernel', 7.4)
  step(c, 'urgent', 4, 8.2)
  card(c, 'urgent', 'u-card-decision', 8.3)
  status(c, 'reading', 'hold', 8.4)
}

function approve(c: BuildCtx): void {
  step(c, 'urgent', 5, 9.4)
  card(c, 'urgent', 'u-card-world', 9.5)
  status(c, 'hold', 'human', 9.6)
  show(c, 'phone', 10.6, { x: 0, duration: 0.7 })
  cursorTo(c, 'phone-approve', 11.0, { duration: 1.0, fx: 0.5, fy: 0.6 })
  click(c, 12.1)
  hide(c, 'phone-request', 12.4, { duration: 0.25 })
  show(c, 'phone-face', 12.55, { duration: 0.25 })
  c.tl.to(c.el('phone-ring'), { rotation: 360, duration: 1.6, ease: 'none' }, c.t0 + 12.6)
  hide(c, 'phone-face', 14.2, { duration: 0.2 })
  show(c, 'phone-done', 14.3, { scale: 1, duration: 0.35 })
  hide(c, 'u-world-wait', 14.5, { duration: 0.2 })
  rise(c, 'u-world-ok', 14.6)
  stepDone(c, 'urgent', 5, 14.6)
}

function pay(c: BuildCtx): void {
  step(c, 'urgent', 6, 16.2)
  hide(c, 'cursor', 16.0)
  const sent = logLine(c, 'pay', 16.4, 70)
  const paid = logLine(c, 'paid', sent + 0.3, 60)
  logLine(c, 'block', paid + 0.15, 70)
  card(c, 'urgent', 'u-card-paid', paid - 0.2)
  status(c, 'human', 'paid', paid - 0.2)
  stepDone(c, 'urgent', 6, paid)
  show(c, 'row-urgent-paid', 20.4, { scale: 1 })
  show(c, 'msg-urgent-paid', 20.5, { scale: 1 })
  hide(c, 'phone', 20.8, { x: 40, duration: 0.5 })
}

export const chapter4: ChapterDef = {
  id: 'human',
  title: 'Human approves',
  duration: 24,
  captions: [
    { at: 0, text: 'A real invoice, but it pushes for speed (至急).' },
    { at: 9.4, text: 'The agent asks a verified human through World ID.' },
    { at: 12.2, text: 'One fresh human proof, bound to this invoice, single-use.' },
    { at: 16.2, text: 'Only now does it pay, still through the vault’s checks.' },
  ],
  build(c) {
    arrive(c)
    read(c)
    triage(c)
    approve(c)
    pay(c)
  },
}
