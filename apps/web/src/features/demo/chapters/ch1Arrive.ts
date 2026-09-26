// Chapter 1 (0:00–0:18): a bank-change email arrives, and the agent reads it.

import type { BuildCtx, ChapterDef } from '../engine/types'
import { card, click, cursorTo, fly, hide, light, scrollTo, show, status, step } from './moves'

const READ_ORDER = ['tNumber', 'amount', 'address', 'invoice'] as const

function arrive(c: BuildCtx): void {
  show(c, 'slot-browser', 0, { duration: 0.7 })
  show(c, 'slot-panel', 0.15, { duration: 0.7 })
  c.tl.set(c.el('cursor'), { x: 560, y: 470 }, c.t0)
  show(c, 'cursor', 0.6)
  c.tl.to(c.el('slot-bec'), { height: 'auto', duration: 0.6, ease: 'power3.out' }, c.t0 + 3)
  show(c, 'inbox-count', 3.2)
  status(c, 'idle', 'new', 3.1)
  hide(c, 'bec-idle', 6.1)
  c.tl.to(c.el('panel'), { '--pulse': 1, duration: 0.35, yoyo: true, repeat: 3, ease: 'sine.inOut' }, c.t0 + 3.1)
}

function open(c: BuildCtx): void {
  cursorTo(c, 'row-bec', 4.1, { duration: 1.0, fx: 0.45, fy: 0.4 })
  click(c, 5.2)
  c.tl.to(c.el('row-bec'), { backgroundColor: '#d3e3fd', duration: 0.2 }, c.t0 + 5.25)
  hide(c, 'inbox-count', 5.4)
  hide(c, 'read-empty', 5.3, { duration: 0.15 })
  show(c, 'msg-bec', 5.35, { x: 0, duration: 0.45 })
  // The look-alike domain holds the pointer a beat too long.
  cursorTo(c, 'bec-sender', 6.0, { duration: 0.8, fx: 0.62, fy: 0.9 })
  light(c, 'bec-sender', 6.7)
}

function read(c: BuildCtx): void {
  step(c, 'bec', 1, 6.2)
  status(c, 'new', 'reading', 6.2)
  card(c, 'bec', 'bec-card-read', 6.3)
  const scan = c.el('bec-scan')
  const text = scan.parentElement
  show(c, scan, 6.6, { duration: 0.3 })
  c.tl.to(scan, { y: () => (text ? text.offsetHeight - 60 : 400), duration: 3.2, ease: 'none' }, c.t0 + 6.6)
  hide(c, scan, 9.7)
  scrollTo(c, 'bec-scroll', 'bec-address', 7.0, 2.0, c.portrait ? 30 : 96)
  READ_ORDER.forEach((key, index) => {
    const at = 9.0 + index * 1.05
    light(c, `bec-${key}`, at)
    fly(c, `ghost-${key}`, `bec-${key}`, `bec-f-${key}`, at + 0.2)
  })
}

function tell(c: BuildCtx): void {
  scrollTo(c, 'bec-scroll', 'bec-dontCall', 13.4, 1.0, c.portrait ? 24 : 180)
  cursorTo(c, 'bec-dontCall', 13.6, { duration: 0.9, fx: 0.85, fy: 1.35 })
  c.tl.to(c.el('bec-dontCall'), { '--u': 1, duration: 1.3, ease: 'power2.inOut' }, c.t0 + 14.1)
}

export const chapter1: ChapterDef = {
  id: 'arrive',
  title: 'Bank-change email',
  duration: 18,
  captions: [
    { at: 0, text: 'Haruka’s accounts-payable inbox. An AI agent pays suppliers from it.' },
    { at: 3, text: 'A supplier says its payout wallet changed.' },
    { at: 8.8, text: 'It reads the T-number, the amount and the new address.' },
    { at: 13.8, text: 'Classic business email compromise: a new account, and “please don’t call to confirm”.' },
  ],
  build(c) {
    arrive(c)
    open(c)
    read(c)
    tell(c)
  },
}
