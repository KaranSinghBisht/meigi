// Chapter 3 (0:45–0:58): someone talks the agent into paying anyway; the vault refuses; the agent drafts the
// safe reply.

import type { BuildCtx, ChapterDef } from '../engine/types'
import { click, cursorTo, logGroup, logLine, rise, show, status, typeIn } from './moves'

function force(c: BuildCtx): void {
  c.tl.set(c.el('cursor'), { x: 700, y: 560 }, c.t0)
  show(c, 'cursor', 0.1)
  cursorTo(c, 'bec-force', 0.3, { duration: 1.4, fx: 0.5, fy: 0.55 })
  click(c, 2.0)
  c.tl.to(c.el('bec-force'), { scale: 0.96, duration: 0.1, yoyo: true, repeat: 1 }, c.t0 + 2.0)
}

function refuse(c: BuildCtx): void {
  logGroup(c, null, 'refuse', 2.6)
  const simulated = logLine(c, 'refuse', 'sim', 2.8, 60)
  const reverted = logLine(c, 'refuse', 'revert', simulated + 0.2, 60)
  logLine(c, 'refuse', 'nothing', reverted + 0.2, 70)
  c.tl.fromTo(
    c.el('bec-seal'),
    { autoAlpha: 0, scale: 1.5, rotation: -14 },
    { autoAlpha: 1, scale: 1, rotation: -7, duration: 0.35, ease: 'back.out(2)', immediateRender: false },
    c.t0 + reverted - 0.3,
  )
  status(c, 'hold', 'refused', reverted - 0.3)
}

function draft(c: BuildCtx): void {
  c.tl.to(c.el('browser-dim'), { autoAlpha: 0, duration: 0.6 }, c.t0 + 8.2)
  cursorTo(c, 'msg-bec', 8.2, { duration: 1.0, fx: 0.55, fy: 0.35 })
  show(c, 'compose', 8.8, { y: 0, duration: 0.6 })
  status(c, 'refused', 'draft', 9.0)
  const typed = typeIn(c, 'compose-ja', 9.4, 20)
  rise(c, 'compose-en', typed + 0.1)
  show(c, 'compose-review', typed + 0.4)
}

export const chapter3: ChapterDef = {
  id: 'refuse',
  title: 'Pay anyway',
  duration: 13,
  captions: [
    { at: 0, text: 'Say someone talks the agent into paying anyway.' },
    { at: 3, text: 'The vault itself refuses: the address isn’t the registered payout.' },
    { at: 8.8, text: 'It drafts the safe reply: we’ll pay the registered account.' },
  ],
  build(c) {
    force(c)
    refuse(c)
    draft(c)
  },
}
