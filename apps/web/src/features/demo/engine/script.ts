import type { Caption, ChapterDef, Script } from './types'

/** A beat is shown fully drawn just before the next one starts. */
const SETTLE = 0.05

/** Lays the chapters end to end and derives the caption track and the reduced-motion steps. */
export function buildScript(defs: readonly ChapterDef[]): Script {
  let start = 0
  const chapters = defs.map((def) => {
    const chapter = { ...def, start }
    start += def.duration
    return chapter
  })
  const duration = start
  const captions: Caption[] = []
  chapters.forEach((chapter, index) => {
    const end = chapter.start + chapter.duration
    chapter.captions.forEach((caption, i) => {
      const next = chapter.captions[i + 1]
      captions.push({
        start: chapter.start + caption.at,
        end: next ? chapter.start + next.at : end,
        text: caption.text,
        chapter: index,
      })
    })
  })
  const steps = captions.map((caption) => Math.max(caption.start, caption.end - SETTLE))
  return { chapters, captions, steps, duration }
}

export function chapterAt(script: Script, time: number): number {
  let found = 0
  script.chapters.forEach((chapter, index) => {
    if (time >= chapter.start) found = index
  })
  return found
}

export function captionAt(script: Script, time: number): number {
  return script.captions.findIndex((caption) => time >= caption.start && time < caption.end)
}

/** The reduced-motion step showing `time`, or the last one before it. */
export function stepAt(script: Script, time: number): number {
  let found = 0
  script.steps.forEach((step, index) => {
    if (time + 1e-3 >= step) found = index
  })
  return found
}
