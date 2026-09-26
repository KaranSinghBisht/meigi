// The player's vocabulary: every chapter is written in these moves. Each adds `to` tweens (or a fromTo that
// doesn't render early) at `t0 + at`, so the master timeline can be set to any time and draw that moment.
// Start states live in CSS ([data-enter] is hidden), never in the timeline.

import type { BuildCtx } from '../engine/types'

type Target = string | HTMLElement

const pick = (c: BuildCtx, target: Target): HTMLElement => (typeof target === 'string' ? c.el(target) : target)
const pos = (c: BuildCtx, at: number): number => c.t0 + at

export function show(c: BuildCtx, target: Target, at: number, vars: gsap.TweenVars = {}): void {
  c.tl.to(pick(c, target), { autoAlpha: 1, duration: 0.4, ease: 'power3.out', ...vars }, pos(c, at))
}

/** Shows an element whose CSS starts it a little low (cards, log lines). */
export function rise(c: BuildCtx, target: Target, at: number, vars: gsap.TweenVars = {}): void {
  show(c, target, at, { y: 0, duration: 0.5, ...vars })
}

export function hide(c: BuildCtx, target: Target, at: number, vars: gsap.TweenVars = {}): void {
  c.tl.to(pick(c, target), { autoAlpha: 0, duration: 0.3, ease: 'power1.out', ...vars }, pos(c, at))
}

/** Types an element's text in place. The text is the invisible copy beside it (see Typed). */
export function typeIn(c: BuildCtx, name: string, at: number, cps = 45): number {
  const live = c.el(name)
  const text = live.previousElementSibling?.textContent ?? ''
  const duration = Math.max(0.25, text.length / cps)
  c.tl.to(live, { text: { value: text }, duration, ease: 'none' }, pos(c, at))
  return at + duration
}

export function light(c: BuildCtx, target: Target, at: number, value = 1, duration = 0.35): void {
  c.tl.to(pick(c, target), { '--lit': value, duration, ease: 'power2.out' }, pos(c, at))
}

interface CursorMove {
  readonly duration?: number
  readonly fx?: number
  readonly fy?: number
}

export function cursorTo(c: BuildCtx, target: Target, at: number, move: CursorMove = {}): void {
  const { duration = 0.9, fx = 0.5, fy = 0.5 } = move
  const element = pick(c, target)
  c.tl.to(
    c.el('cursor'),
    {
      x: () => c.geo.point(element, fx, fy).x,
      y: () => c.geo.point(element, fx, fy).y,
      duration,
      ease: 'power2.inOut',
    },
    pos(c, at),
  )
}

export function click(c: BuildCtx, at: number): void {
  c.tl.to(
    c.el('cursor-arrow'),
    { scale: 0.82, duration: 0.09, yoyo: true, repeat: 1, ease: 'power1.inOut' },
    pos(c, at),
  )
  c.tl.fromTo(
    c.el('cursor-ripple'),
    { scale: 0.3, autoAlpha: 0.6 },
    { scale: 1.8, autoAlpha: 0, duration: 0.55, ease: 'power2.out', immediateRender: false },
    pos(c, at),
  )
}

/** A chip flies from a value in the document to its field in the panel, where the value then appears. */
export function fly(c: BuildCtx, ghost: string, from: Target, to: Target, at: number, duration = 0.8): void {
  const chip = c.el(ghost)
  const source = pick(c, from)
  const target = pick(c, to)
  c.tl.fromTo(
    chip,
    { x: () => c.geo.box(source).x, y: () => c.geo.box(source).y, autoAlpha: 1, scale: 1.04 },
    {
      x: () => c.geo.box(target).x,
      y: () => c.geo.box(target).y,
      scale: 1,
      duration,
      ease: 'power3.inOut',
      immediateRender: false,
    },
    pos(c, at),
  )
  c.tl.to(chip, { autoAlpha: 0, duration: 0.2 }, pos(c, at + duration))
  show(c, target, at + duration - 0.1, { duration: 0.25 })
}

/**
 * Scrolls a panel feed so `card` sits at the bottom of its view, or at the top if it is taller than the view.
 * "end" always shows its bottom: for reading down a tall card.
 */
export function feed(
  c: BuildCtx,
  scene: string,
  card: string,
  at: number,
  duration = 0.6,
  align: 'fit' | 'end' = 'fit',
): void {
  const view = c.el(`${scene}-view`)
  const element = c.el(card)
  const offset = (): number => {
    const pad = 12
    const bottom = element.offsetTop + element.offsetHeight + pad - view.clientHeight
    return Math.max(0, align === 'end' ? bottom : Math.min(bottom, element.offsetTop - pad))
  }
  c.tl.to(c.el(`${scene}-stack`), { y: () => -offset(), duration, ease: 'power3.inOut' }, pos(c, at))
}

/** A card arrives in a scene's feed: the feed makes room, then the card rises in. */
export function card(c: BuildCtx, scene: string, name: string, at: number): void {
  feed(c, scene, name, at)
  rise(c, name, at + 0.15)
}

/** Lights pipeline step `index` of a scene and marks the one before it done. */
export function step(c: BuildCtx, scene: string, index: number, at: number): void {
  c.tl.to(c.el(`${scene}-step-${index}`), { '--on': 1, duration: 0.3 }, pos(c, at))
  if (index > 1) c.tl.to(c.el(`${scene}-step-${index - 1}`), { '--on': 0, '--done': 1, duration: 0.3 }, pos(c, at))
}

export function stepDone(c: BuildCtx, scene: string, index: number, at: number): void {
  c.tl.to(c.el(`${scene}-step-${index}`), { '--on': 0, '--done': 1, duration: 0.3 }, pos(c, at))
}

/** Swaps the panel header's status chip. */
export function status(c: BuildCtx, from: string, to: string, at: number): void {
  hide(c, `status-${from}`, at, { duration: 0.2 })
  show(c, `status-${to}`, at + 0.15, { duration: 0.3 })
}

/** A bar fills to its recorded value, then its number appears. */
export function bar(c: BuildCtx, name: string, at: number, duration = 0.9): void {
  const fill = c.el(`${name}-fill`)
  const value = Number(fill.dataset.fill ?? '0')
  c.tl.to(fill, { scaleX: Number.isFinite(value) ? value : 0, duration, ease: 'power3.out' }, pos(c, at))
  show(c, `${name}-value`, at + duration * 0.55, { duration: 0.25 })
}

/** Scrolls a scroll box so `target` sits `margin` design pixels below its top. */
export function scrollTo(c: BuildCtx, box: string, target: Target, at: number, duration = 1.6, margin = 72): void {
  const element = pick(c, target)
  const scroller = c.el(box)
  c.tl.to(
    scroller,
    {
      scrollTop: () => Math.max(0, Math.min(element.offsetTop - margin, scroller.scrollHeight - scroller.clientHeight)),
      duration,
      ease: 'power2.inOut',
    },
    pos(c, at),
  )
}

/** Swaps the chain log to a chapter's own group (and its "where" label). */
export function logGroup(c: BuildCtx, from: string | null, to: string, at: number): void {
  if (from) {
    hide(c, `log-group-${from}`, at, { duration: 0.25 })
    hide(c, `log-where-${from}`, at, { duration: 0.25 })
  }
  show(c, `log-group-${to}`, at + 0.15, { duration: 0.25 })
  show(c, `log-where-${to}`, at + 0.15, { duration: 0.25 })
}

/** A line of a chapter's chain log: it appears, types out, and the group scrolls to keep it in view. */
export function logLine(c: BuildCtx, group: string, id: string, at: number, cps = 70): number {
  hide(c, 'log-idle', at, { duration: 0.2 })
  const view = c.el('log-view')
  const line = c.el(`log-${id}`)
  c.tl.to(
    c.el(`log-stack-${group}`),
    { y: () => -Math.max(0, line.offsetTop + line.offsetHeight - view.clientHeight), duration: 0.35, ease: 'power2.out' },
    c.t0 + at,
  )
  rise(c, line, at, { duration: 0.25 })
  return typeIn(c, `log-${id}-text`, at + 0.1, cps)
}
