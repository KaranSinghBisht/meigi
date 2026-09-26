// A glyph grid on a canvas, shared by the start page's ASCII pieces. The approach is ported from Karan's NightPool
// landing (hackathons/old/midnight/ui/src/components/landing/ascii/useAsciiCanvas.ts): DPR scaling, resize, a pause
// while the canvas is offscreen, and a single still frame when motion is reduced. Added here: the cell comes from
// the font's own advance, strings draw in one call (Japanese is wider than a cell), a still frame is a chosen
// moment of the loop rather than its first, and fonts that arrive late redraw it.

import { useEffect, useLayoutEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '../../../ui/stage/usePrefersReducedMotion'

export interface TextOptions {
  /** Draw in the Japanese face instead of the mono one. */
  readonly jp?: boolean
  /** Font size as a multiple of the grid's own. */
  readonly scale?: number
  readonly weight?: number
  readonly alpha?: number
}

export interface AsciiGrid {
  readonly cols: number
  readonly rows: number
  /** Seconds since the piece started; the chosen still moment when motion is reduced. */
  readonly time: number
  /** One glyph at cell (c, r). */
  put(c: number, r: number, ch: string, color: string, alpha?: number): void
  /** A string starting at cell (c, r); returns how many cells it covers. */
  text(c: number, r: number, s: string, color: string, options?: TextOptions): number
  /** How many cells (fractional) `s` would cover, to centre or space it. */
  width(s: string, options?: TextOptions): number
}

const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace'
const JP = '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif'

interface Metrics {
  size: number
  cellW: number
  cellH: number
  cols: number
  rows: number
}

/** The glyph size that fits `cols` cells across the canvas (JetBrains Mono advances 0.6 em), within 9–20 px. */
function fontSizeFor(width: number, cols: number): number {
  return Math.max(9, Math.min(20, Math.floor(width / (cols * 0.6))))
}

function measure(ctx: CanvasRenderingContext2D, width: number, height: number, cols: number): Metrics {
  const size = fontSizeFor(width, cols)
  ctx.font = `500 ${size}px ${MONO}`
  const cellW = ctx.measureText('0').width || size * 0.6
  // The mono face's own line height: block and box-drawing glyphs tile without gaps at it.
  const cellH = Math.floor(size * 1.32)
  return { size, cellW, cellH, cols: Math.floor(width / cellW), rows: Math.floor(height / cellH) }
}

function fontOf(m: Metrics, options: TextOptions): string {
  const { jp = false, scale = 1, weight = jp ? 700 : 500 } = options
  return `${weight} ${Math.round(m.size * scale)}px ${jp ? JP : MONO}`
}

function makeGrid(ctx: CanvasRenderingContext2D, m: Metrics, time: number): AsciiGrid {
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < m.cols && r < m.rows
  const cellsOf = (s: string) => Math.ceil(ctx.measureText(s).width / m.cellW)
  return {
    cols: m.cols,
    rows: m.rows,
    time,
    put(c, r, ch, color, alpha = 1) {
      if (!inside(c, r) || alpha <= 0.01) return
      ctx.globalAlpha = Math.min(1, alpha)
      ctx.fillStyle = color
      ctx.fillText(ch, c * m.cellW, r * m.cellH + m.cellH / 2)
    },
    text(c, r, s, color, options = {}) {
      const alpha = options.alpha ?? 1
      if (r < -2 || r > m.rows + 2 || alpha <= 0.01) return 0
      ctx.font = fontOf(m, options)
      ctx.globalAlpha = Math.min(1, alpha)
      ctx.fillStyle = color
      ctx.fillText(s, c * m.cellW, r * m.cellH + m.cellH / 2)
      const cells = cellsOf(s)
      ctx.font = fontOf(m, {})
      return cells
    },
    width(s, options = {}) {
      ctx.font = fontOf(m, options)
      const cells = ctx.measureText(s).width / m.cellW
      ctx.font = fontOf(m, {})
      return cells
    },
  }
}

export interface AsciiPiece {
  /** Seconds into the loop that stand for the whole piece when motion is reduced. */
  readonly stillAt: number
  /** Cells the composition needs across; the glyphs are sized so it fills the canvas. */
  readonly cols: number
}

/**
 * Runs `draw` on every frame while the canvas is on screen. With reduced motion it draws once, at `stillAt` seconds
 * into the loop, and again whenever the canvas resizes or a font arrives.
 */
export function useAsciiCanvas(draw: (g: AsciiGrid) => void, { stillAt, cols }: AsciiPiece) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef(draw)
  const reduced = usePrefersReducedMotion()
  useLayoutEffect(() => {
    drawRef.current = draw
  })

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    return runLoop(canvas, ctx, { reduced, stillAt, cols, draw: (g) => drawRef.current(g) })
  }, [reduced, stillAt, cols])

  return ref
}

interface LoopOptions extends AsciiPiece {
  readonly reduced: boolean
  readonly draw: (g: AsciiGrid) => void
}

/** Sizes the backing store for the device pixel ratio and returns the grid that fits the canvas now. */
function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, cols: number): Metrics {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const { clientWidth: w, clientHeight: h } = canvas
  canvas.width = Math.max(1, Math.round(w * dpr))
  canvas.height = Math.max(1, Math.round(h * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.textBaseline = 'middle'
  return measure(ctx, w, h, cols)
}

/** Calls `resized` when the canvas changes size or a font arrives, and `seen` as it enters or leaves the viewport. */
function watch(canvas: HTMLCanvasElement, resized: () => void, seen: (visible: boolean) => void): () => void {
  const resizeObserver = new ResizeObserver(resized)
  resizeObserver.observe(canvas)
  const intersection = new IntersectionObserver(([entry]) => seen(entry?.isIntersecting ?? false), { threshold: 0.05 })
  intersection.observe(canvas)
  document.fonts.addEventListener('loadingdone', resized)
  return () => {
    resizeObserver.disconnect()
    intersection.disconnect()
    document.fonts.removeEventListener('loadingdone', resized)
  }
}

function runLoop(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, options: LoopOptions): () => void {
  let start = performance.now()
  let metrics: Metrics | null = null
  let raf = 0
  let visible = false

  const paint = (now: number) => {
    if (!metrics || metrics.cols < 1 || metrics.rows < 1) return
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const time = options.reduced ? options.stillAt : Math.max(0, (now - start) / 1000)
    options.draw(makeGrid(ctx, metrics, time))
    ctx.globalAlpha = 1
  }
  const frame = (now: number) => {
    paint(now)
    if (visible && !options.reduced) raf = requestAnimationFrame(frame)
  }
  const repaint = () => {
    metrics = fit(canvas, ctx, options.cols)
    if (options.reduced || !visible) paint(performance.now())
  }
  // Each time a piece comes into view it starts from the top of its loop, so the story is seen from its start.
  const seen = (now: boolean) => {
    if (now === visible) return
    visible = now
    cancelAnimationFrame(raf)
    start = performance.now()
    if (visible && !options.reduced) raf = requestAnimationFrame(frame)
  }

  const unwatch = watch(canvas, repaint, seen)
  repaint()
  return () => {
    cancelAnimationFrame(raf)
    unwatch()
  }
}
