// Chapter 6 (1:42–1:50): the end card, then a fade so the loop starts clean.

import type { ChapterDef } from '../engine/types'
import { hide, show } from './moves'

export const chapter6: ChapterDef = {
  id: 'end',
  title: 'End',
  duration: 8,
  captions: [{ at: 0, text: 'Pay companies, not addresses.' }],
  build(c) {
    hide(c, 'cursor', 0)
    hide(c, 'slot-browser', 0.1, { duration: 0.6 })
    hide(c, 'slot-panel', 0.2, { duration: 0.6 })
    show(c, 'end', 0.6, { scale: 1, duration: 0.8 })
    hide(c, 'end', 7.2, { duration: 0.7 })
  },
}
