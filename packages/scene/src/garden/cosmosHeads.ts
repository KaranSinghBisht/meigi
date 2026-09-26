import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter } from 'three'
import { seededRandom } from '../shared/noise'

// Cosmos heads painted on a canvas at mount: eight petals, each with a
// base-to-tip gradient, faint veins and a notched tip, around a stippled
// golden heart. The channels carry shape rather than colour so one texture
// serves every tint: R runs from 0.27 at a petal's base to 1 at its tip
// (darker along the veins), G is the heart, A the coverage. A second,
// pre-blurred copy is the bokeh for the nearest row.

const PAINT = 512
const SHARP = 256
const BOKEH = 128

function context(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable for the cosmos texture')
  return { canvas, ctx }
}

function petalPath(ctx: CanvasRenderingContext2D, length: number, width: number): void {
  const [l, w] = [length, width]
  ctx.beginPath()
  ctx.moveTo(l * 0.1, 0)
  ctx.bezierCurveTo(l * 0.35, -w * 1.1, l * 0.8, -w * 1.15, l * 0.95, -w * 0.62)
  // Three shallow teeth across the tip.
  ctx.lineTo(l, -w * 0.36)
  ctx.lineTo(l * 0.955, -w * 0.14)
  ctx.lineTo(l * 0.995, 0)
  ctx.lineTo(l * 0.955, w * 0.14)
  ctx.lineTo(l, w * 0.36)
  ctx.lineTo(l * 0.95, w * 0.62)
  ctx.bezierCurveTo(l * 0.8, w * 1.15, l * 0.35, w * 1.1, l * 0.1, 0)
  ctx.closePath()
}

function paintPetal(ctx: CanvasRenderingContext2D, length: number, width: number): void {
  petalPath(ctx, length, width)
  const gradient = ctx.createLinearGradient(length * 0.1, 0, length, 0)
  gradient.addColorStop(0, 'rgb(70, 0, 0)')
  gradient.addColorStop(1, 'rgb(255, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)'
  ctx.lineWidth = 1.4
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath()
    ctx.moveTo(length * 0.14, 0)
    ctx.quadraticCurveTo(length * 0.55, k * width * 0.32, length * 0.93, k * width * 0.42)
    ctx.stroke()
  }
  ctx.restore()
}

/** The golden heart: a soft disc stippled with florets and ringed a little darker. */
function paintHeart(ctx: CanvasRenderingContext2D, centre: number, random: () => number): void {
  const radius = centre * 0.15
  ctx.fillStyle = 'rgb(0, 150, 0)'
  ctx.beginPath()
  ctx.arc(centre, centre, radius, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 170; i++) {
    const r = radius * Math.sqrt(random()) * 0.95
    const a = random() * Math.PI * 2
    ctx.fillStyle = random() < 0.7 ? 'rgb(0, 255, 0)' : 'rgb(0, 110, 0)'
    ctx.beginPath()
    ctx.arc(centre + Math.cos(a) * r, centre + Math.sin(a) * r, 1.2 + random() * 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
}

function paintHead(ctx: CanvasRenderingContext2D, size: number): void {
  const random = seededRandom(1031)
  const centre = size / 2
  ctx.clearRect(0, 0, size, size)
  for (let i = 0; i < 8; i++) {
    ctx.save()
    ctx.translate(centre, centre)
    ctx.rotate((i / 8) * Math.PI * 2 + (random() - 0.5) * 0.18)
    paintPetal(ctx, centre * (0.9 + random() * 0.08), centre * (0.19 + random() * 0.04))
    ctx.restore()
  }
  paintHeart(ctx, centre, random)
}

function resample(source: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const { canvas, ctx } = context(size)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, size, size)
  return canvas
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const map = new CanvasTexture(canvas)
  map.minFilter = LinearMipmapLinearFilter
  map.magFilter = LinearFilter
  return map
}

/** One box-blur pass along rows (or columns) of premultiplied RGBA; outside the image is clear. */
function boxPass(px: Float32Array, size: number, radius: number, rows: boolean): void {
  const line = new Float32Array(size * 4)
  for (let a = 0; a < size; a++) {
    for (let b = 0; b < size; b++) {
      const i = (rows ? a * size + b : b * size + a) * 4
      for (let c = 0; c < 4; c++) line[b * 4 + c] = px[i + c] ?? 0
    }
    const sum = [0, 0, 0, 0]
    for (let b = -radius; b <= radius; b++) for (let c = 0; c < 4; c++) sum[c] = (sum[c] ?? 0) + (b >= 0 && b < size ? line[b * 4 + c] ?? 0 : 0)
    for (let b = 0; b < size; b++) {
      const i = (rows ? a * size + b : b * size + a) * 4
      for (let c = 0; c < 4; c++) {
        px[i + c] = (sum[c] ?? 0) / (radius * 2 + 1)
        const out = b - radius
        const inn = b + radius + 1
        sum[c] = (sum[c] ?? 0) - (out >= 0 ? line[out * 4 + c] ?? 0 : 0) + (inn < size ? line[inn * 4 + c] ?? 0 : 0)
      }
    }
  }
}

/** A genuinely out-of-focus copy: three box blurs (close to a Gaussian) in premultiplied space. */
function blurred(source: HTMLCanvasElement, size: number, radius: number): HTMLCanvasElement {
  const { canvas, ctx } = context(size)
  ctx.drawImage(source, 0, 0, size, size)
  const image = ctx.getImageData(0, 0, size, size)
  const data = image.data
  const px = new Float32Array(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const a = (data[i + 3] ?? 0) / 255
    px[i] = (data[i] ?? 0) * a
    px[i + 1] = (data[i + 1] ?? 0) * a
    px[i + 2] = (data[i + 2] ?? 0) * a
    px[i + 3] = data[i + 3] ?? 0
  }
  for (let pass = 0; pass < 3; pass++) {
    boxPass(px, size, radius, true)
    boxPass(px, size, radius, false)
  }
  for (let i = 0; i < data.length; i += 4) {
    const a = (px[i + 3] ?? 0) / 255
    data[i] = a > 0 ? (px[i] ?? 0) / a : 0
    data[i + 1] = a > 0 ? (px[i + 1] ?? 0) / a : 0
    data[i + 2] = a > 0 ? (px[i + 2] ?? 0) / a : 0
    data[i + 3] = px[i + 3] ?? 0
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

export interface CosmosHeads {
  readonly sharp: CanvasTexture
  readonly bokeh: CanvasTexture
}

export function paintCosmosHeads(): CosmosHeads {
  const painted = context(PAINT)
  paintHead(painted.ctx, PAINT)
  const sharp = resample(painted.canvas, SHARP)
  // The same flower, genuinely out of focus (smooth, so it never dithers into blocks).
  const bokeh = blurred(sharp, BOKEH, 5)
  return { sharp: toTexture(sharp), bokeh: toTexture(bokeh) }
}
