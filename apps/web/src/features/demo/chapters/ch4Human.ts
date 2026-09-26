// Chapter 4 (1:22–1:53): a genuine but urgent invoice is held for a person. A different World ID identity is refused
// first; then the approver on file approves through World ID for Agents, and only then does the vault pay.

import type { BuildCtx, ChapterDef } from '../engine/types'
import {
  bar,
  card,
  click,
  cursorTo,
  hide,
  light,
  logGroup,
  logLine,
  rise,
  scrollTo,
  show,
  status,
  step,
  stepDone,
} from './moves'

function arrive(c: BuildCtx): void {
  hide(c, 'compose', 0, { y: 40, duration: 0.4 })
  c.tl.to(c.el('row-bec'), { backgroundColor: '#f6f8fc', fontWeight: 400, duration: 0.3 }, c.t0 + 0.2)
  c.tl.to(c.el('slot-urgent'), { height: 'auto', duration: 0.6, ease: 'power3.out' }, c.t0 + 0.5)
  show(c, 'inbox-count', 0.7)
  status(c, 'draft', 'new', 0.6)
  hide(c, 'scene-bec', 0.8)
  logGroup(c, 'refuse', 'human', 0.8)
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
  scrollTo(c, 'urgent-scroll', 'urgent-urgent', 3.3, 1.2, c.portrait ? 20 : 150)
  light(c, 'urgent-urgent', 4.2)
  c.tl.to(c.el('urgent-urgent'), { '--u': 1, duration: 0.8 }, c.t0 + 4.2)
  rise(c, 'u-flag', 4.4)
}

/** Triage holds it; the kernel's checks all pass (this run was analysed before it was paid); a person decides. */
function triage(c: BuildCtx): void {
  step(c, 'urgent', 2, 4.9)
  card(c, 'urgent', 'u-card-triage', 5.0)
  bar(c, 'u-bar-pressure', 5.4, 0.8)
  bar(c, 'u-bar-safe', 5.7, 0.8)
  bar(c, 'u-bar-susp', 6.0, 0.8)
  rise(c, 'u-triage-hold', 6.7)
  step(c, 'urgent', 3, 7.0)
  card(c, 'urgent', 'u-card-kernel', 7.05)
  step(c, 'urgent', 4, 7.9)
  card(c, 'urgent', 'u-card-decision', 7.95)
  status(c, 'reading', 'hold', 8.0)
}

/** The first request (#78, #79): a different World ID identity proves, is refused, and nothing is paid. */
function refuse(c: BuildCtx): void {
  step(c, 'urgent', 5, 9.4)
  card(c, 'urgent', 'u-card-world', 9.5)
  status(c, 'hold', 'human', 9.6)
  hide(c, 'u-world-wait', 12.4, { duration: 0.2 })
  rise(c, 'u-world-refused', 12.5)
  status(c, 'human', 'wrong', 12.5)
  hide(c, 'u-world-refused', 15.9, { duration: 0.25 })
  hide(c, 'u-world-code-refused', 15.9, { duration: 0.25 })
  show(c, 'u-world-code', 16.15)
  show(c, 'u-world-wait', 16.15)
  status(c, 'wrong', 'human', 16.15)
}

/** The second request (#80, #81): a new code, and the approver on file approves. */
function approve(c: BuildCtx): void {
  show(c, 'phone', 17.6, { x: 0, duration: 0.7 })
  cursorTo(c, 'phone-approve', 18.0, { duration: 1.0, fx: 0.5, fy: 0.6 })
  click(c, 19.1)
  hide(c, 'phone-request', 19.4, { duration: 0.25 })
  show(c, 'phone-face', 19.55, { duration: 0.25 })
  c.tl.to(c.el('phone-ring'), { rotation: 360, duration: 1.6, ease: 'none' }, c.t0 + 19.6)
  hide(c, 'phone-face', 21.2, { duration: 0.2 })
  show(c, 'phone-done', 21.3, { scale: 1, duration: 0.35 })
  hide(c, 'u-world-wait', 21.5, { duration: 0.2 })
  rise(c, 'u-world-ok', 21.6)
  status(c, 'human', 'approved', 21.6)
  stepDone(c, 'urgent', 5, 21.6)
}

function pay(c: BuildCtx): void {
  step(c, 'urgent', 6, 23.2)
  hide(c, 'cursor', 23.0)
  const sent = logLine(c, 'human', 'pay', 23.4, 70)
  const paid = logLine(c, 'human', 'paid', sent + 0.3, 60)
  logLine(c, 'human', 'block', paid + 0.15, 70)
  card(c, 'urgent', 'u-card-paid', paid - 0.2)
  status(c, 'approved', 'paid', paid - 0.2)
  stepDone(c, 'urgent', 6, paid)
  show(c, 'row-urgent-paid', 27.4, { scale: 1 })
  show(c, 'msg-urgent-paid', 27.5, { scale: 1 })
  hide(c, 'phone', 27.8, { x: 40, duration: 0.5 })
}

export const chapter4: ChapterDef = {
  id: 'human',
  title: 'Human approves',
  duration: 31,
  /** The 至急 mail open and its Read card in: before it, the frame is still chapter 3's reply draft and seal. */
  opening: 3.4,
  captions: [
    { at: 0, text: 'A real invoice, but it pushes for speed (至急).' },
    { at: 9.4, text: 'The agent asks a human to approve with World ID for Agents, on World’s sandbox.' },
    { at: 12.4, text: 'A different World ID identity is refused, so nothing is paid.' },
    { at: 15.9, text: 'It asks again, with a new code, for the approver on file.' },
    { at: 19.2, text: 'One fresh World ID proof, bound to this invoice, single-use.' },
    { at: 23.2, text: 'Only now does it pay, still through the vault’s checks.' },
  ],
  build(c) {
    arrive(c)
    read(c)
    triage(c)
    refuse(c)
    approve(c)
    pay(c)
  },
}
