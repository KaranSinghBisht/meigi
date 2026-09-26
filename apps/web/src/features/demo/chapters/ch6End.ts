// Chapter 6: the end card. It holds until the loop cuts back to chapter 0, whose first frame is fully drawn.

import type { ChapterDef } from '../engine/types'

export const chapter6: ChapterDef = {
  id: 'end',
  title: 'End',
  duration: 8,
  captions: [{ at: 0, text: 'Pay companies, not addresses.' }],
  // Chapter 5 brings the card in; it holds here until the loop cuts back to chapter 0's first frame.
  build: () => undefined,
}
