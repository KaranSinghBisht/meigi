/**
 * The scene needs WebGL2 and renderable half-float targets (ripple sim and
 * HDR reflection). Anything less gets the static SVG fallback instead.
 */
export function supportsScene(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return false
    const renderable =
      gl.getExtension('EXT_color_buffer_float') !== null ||
      gl.getExtension('EXT_color_buffer_half_float') !== null
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return renderable
  } catch {
    return false
  }
}
