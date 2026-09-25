/**
 * Camera stations. `hero` is the landing's composition; `gate` is where the
 * landing's enter glide ends, just through the torii, and where the app opens.
 */
export type Station = 'hero' | 'gate' | 'fuji' | 'lake' | 'shore' | 'torii' | 'sky'

/**
 * `ok` (payment settled): a soft sakura gust. `refused` (chain refused a
 * payee): a strong ripple from the centre and a brief vermilion reflection.
 * `frozen` (disputed payee): mist rolls in and stays. `calm`: back to normal.
 * `ok` and `refused` are one-shots; `frozen` lasts until `calm`.
 */
export type SceneMood = 'calm' | 'ok' | 'refused' | 'frozen'

export interface MeigiStageProps {
  readonly station: Station
  /** prefers-reduced-motion: one still frame; stations and moods apply instantly. */
  readonly reducedMotion: boolean
  /**
   * Default true: the pointer ripples the lake and nudges the camera.
   * False: the canvas ignores pointer events so UI above and around it stays clickable.
   */
  readonly interactive?: boolean
  /** Render on demand: frames only while something moves (a glide, ripples, a mood). */
  readonly lowPower?: boolean
  readonly onReady?: () => void
  /** WebGL context failed or was lost; show FallbackScene instead. */
  readonly onLost?: () => void
  readonly className?: string
}
