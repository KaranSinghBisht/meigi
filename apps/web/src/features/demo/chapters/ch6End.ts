// Chapter 6 (1:42–1:50): the end card, then a fade so the loop starts clean.

import type { ChapterDef } from '../engine/types'
import { hide, show } from './moves'

export const chapter6: ChapterDef = {
  id: 'end',
  title: 'End',
  duration: 8,
  captions: [{ at: 0, text: 'Pay companies, not addresses.' }],
  build(c) {
    c.tl.to(c.el('browser-dim'), { autoAlpha: 1, duration: 0.6 }, c.t0)
    show(c, 'end', 0.3, { scale: 1, duration: 0.7 })
    hide(c, 'end', 7.3, { duration: 0.6 })
  },
}
