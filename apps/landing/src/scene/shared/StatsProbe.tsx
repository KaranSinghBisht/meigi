import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { sceneBus } from './sceneBus'

export interface SceneStats {
  fps: number
  drawCalls: number
  triangles: number
  frames: number
}

export interface SceneDebug {
  /** Pins the camera at point t (0..1) of the enter glide; 0 releases it. */
  glideTo: (t: number) => void
}

declare global {
  interface Window {
    __meigiStats?: SceneStats
    __meigiDebug?: SceneDebug
  }
}

/** Opt-in with `?stats`: publishes per-frame draw calls and FPS, plus a glide handle, on window. */
export function wantsStats(): boolean {
  return new URLSearchParams(window.location.search).has('stats')
}

export function StatsProbe() {
  const gl = useThree((state) => state.gl)
  const sampleWindow = useRef({ start: performance.now(), frames: 0, total: 0 })

  useEffect(() => {
    gl.info.autoReset = false
    window.__meigiDebug = {
      glideTo: (t) => {
        sceneBus.glideProgress = Math.min(Math.max(t, 0), 1)
        sceneBus.glideActive = t > 0
      },
    }
    return () => {
      gl.info.autoReset = true
      delete window.__meigiDebug
    }
  }, [gl])

  // Lowest priority: runs before every other pass in the frame.
  useFrame(() => {
    gl.info.reset()
  }, -1000)

  // After the composer (priority 1): everything drawn this frame is counted.
  useFrame(() => {
    const now = performance.now()
    const bucket = sampleWindow.current
    bucket.frames += 1
    bucket.total += 1
    const elapsed = now - bucket.start
    if (elapsed < 1000) return
    window.__meigiStats = {
      fps: Math.round((bucket.frames * 1000) / elapsed),
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      frames: bucket.total,
    }
    bucket.start = now
    bucket.frames = 0
  }, 1000)

  return null
}
