import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3, type Camera, type WebGLRenderer } from 'three'
import { sceneBus } from './sceneBus'

export interface SceneStats {
  fps: number
  drawCalls: number
  triangles: number
  frames: number
}

/** One rendered frame, for diagnosing motion smoothness. */
export interface TraceFrame {
  /** Frame (vsync) time from document.timeline, ms */
  readonly ts: number
  /** Delta R3F handed to useFrame this frame, ms */
  readonly delta: number
  readonly x: number
  readonly y: number
  readonly z: number
  /** Camera forward direction */
  readonly fx: number
  readonly fy: number
  readonly fz: number
  readonly dpr: number
  /** Compiled shader programs so far; a jump means a compile this frame */
  readonly programs: number
  readonly calls: number
  /** A station move is still running after this frame (false on its arrival frame, which shows the final pose) */
  readonly moving: boolean
}

export interface SceneDebug {
  /** Pins the camera at point t (0..1) of the enter glide; 0 releases it. */
  glideTo: (t: number) => void
}

declare global {
  interface Window {
    __meigiStats?: SceneStats
    __meigiDebug?: SceneDebug
    /** Last few hundred frames, newest last (?stats only). */
    __meigiTrace?: TraceFrame[]
  }
}

const TRACE_FRAMES = 600
const forward = new Vector3()

/** Opt-in with `?stats`: publishes FPS, draw calls, a per-frame trace and a glide handle on window. */
export function wantsStats(): boolean {
  return new URLSearchParams(window.location.search).has('stats')
}

function frameTime(): number {
  const time = document.timeline.currentTime
  return typeof time === 'number' ? time : performance.now()
}

function recordFrame(gl: WebGLRenderer, camera: Camera, deltaSeconds: number): void {
  const trace = window.__meigiTrace
  if (!trace) return
  const { x, y, z } = camera.position
  const { x: fx, y: fy, z: fz } = camera.getWorldDirection(forward)
  const programs = gl.info.programs?.length ?? 0
  const dpr = gl.getPixelRatio()
  const calls = gl.info.render.calls
  trace.push({ ts: frameTime(), delta: deltaSeconds * 1000, x, y, z, fx, fy, fz, dpr, programs, calls, moving: sceneBus.cameraMoving })
  if (trace.length > TRACE_FRAMES) trace.shift()
}

interface Bucket {
  start: number
  frames: number
  total: number
}

function publishStats(gl: WebGLRenderer, bucket: Bucket): void {
  const now = performance.now()
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
}

export function StatsProbe() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const bucket = useRef<Bucket>({ start: performance.now(), frames: 0, total: 0 })

  useEffect(() => {
    gl.info.autoReset = false
    window.__meigiTrace = []
    window.__meigiDebug = {
      glideTo: (t) => {
        sceneBus.pinnedGlide = t > 0 ? Math.min(t, 1) : null
        sceneBus.keepAwake(1000)
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
  useFrame((_, delta) => {
    recordFrame(gl, camera, delta)
    publishStats(gl, bucket.current)
  }, 1000)

  return null
}
