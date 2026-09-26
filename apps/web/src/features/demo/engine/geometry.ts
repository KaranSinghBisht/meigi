// Positions on the stage in design units. The stage is drawn at a fixed design size and scaled to fit, so a
// screen rect is divided by the current scale; the answer is the same at 1024 px as at 1920 px.

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Box extends Point {
  readonly width: number
  readonly height: number
}

export interface Geo {
  /** The element's box relative to the stage's top-left corner. */
  readonly box: (element: Element) => Box
  /** A point inside the element, as fractions of its box (0.5, 0.5 is the centre). */
  readonly point: (element: Element, fx?: number, fy?: number) => Point
}

export function createGeo(stage: HTMLElement, designWidth: number): Geo {
  const box = (element: Element): Box => {
    const frame = stage.getBoundingClientRect()
    const scale = frame.width > 0 ? frame.width / designWidth : 1
    const rect = element.getBoundingClientRect()
    return {
      x: (rect.left - frame.left) / scale,
      y: (rect.top - frame.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    }
  }
  const point = (element: Element, fx = 0.5, fy = 0.5): Point => {
    const b = box(element)
    return { x: b.x + b.width * fx, y: b.y + b.height * fy }
  }
  return { box, point }
}
