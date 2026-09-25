import { PerformanceMonitor, type PerformanceMonitorApi } from '@react-three/drei'
import { Canvas, type RootState } from '@react-three/fiber'
import { useCallback, useState } from 'react'
import { CameraRig } from './camera/CameraRig'
import { Foothills } from './fuji/Foothills'
import { Fuji } from './fuji/Fuji'
import { Lake } from './lake/Lake'
import { Mist } from './mist/Mist'
import { Post } from './post/Post'
import { Sakura } from './sakura/Sakura'
import { DemandPump, ReadySignal, VisibilityPause } from './shared/lifecycle'
import { HEX } from './shared/palette'
import { StatsProbe, wantsStats } from './shared/StatsProbe'
import { WORLD } from './shared/world'
import { Sky } from './sky/Sky'
import { Torii } from './torii/Torii'

export interface StageProps {
  /** prefers-reduced-motion: render one still frame, nothing drifts. */
  readonly reducedMotion: boolean
  readonly onReady: () => void
  /** The GPU context went away; the page swaps to the static fallback. */
  readonly onLost: () => void
}

const MAX_DPR = 1.75

/** Device pixel ratio capped at MAX_DPR; the performance monitor scales below it. */
function deviceDpr(): number {
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DPR)
}

/** Maps the monitor's 0..1 quality factor onto [1, device DPR] in 0.05 steps. */
function dprForFactor(factor: number): number {
  const top = deviceDpr()
  return Math.round((1 + (top - 1) * factor) * 20) / 20
}

function SceneContents({ animate, multisampling }: { animate: boolean; multisampling: number }) {
  return (
    <>
      <CameraRig animate={animate} />
      <Sky animate={animate} />
      <Fuji />
      <Foothills />
      <Torii />
      <Lake animate={animate} />
      <Mist animate={animate} />
      <Sakura animate={animate} />
      <Post multisampling={multisampling} />
    </>
  )
}

export default function Stage({ reducedMotion, onReady, onLost }: StageProps) {
  const animate = !reducedMotion
  const [multisampling] = useState(() => (window.devicePixelRatio >= 1.5 ? 2 : 4))
  const [showStats] = useState(wantsStats)
  const [dpr, setDpr] = useState(deviceDpr)
  const onPerformance = useCallback((api: PerformanceMonitorApi) => setDpr(dprForFactor(api.factor)), [])
  const onFallback = useCallback(() => setDpr(1), [])

  const handleCreated = useCallback(
    ({ gl }: RootState) => {
      gl.setClearColor(HEX.horizon)
      gl.domElement.addEventListener(
        'webglcontextlost',
        (event) => {
          event.preventDefault()
          onLost()
        },
        { once: true },
      )
    },
    [onLost],
  )

  return (
    <Canvas
      className="stage__canvas"
      aria-hidden="true"
      dpr={dpr}
      frameloop={animate ? 'always' : 'demand'}
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      camera={{ fov: 34, near: 0.1, far: WORLD.cameraFar, position: [0, WORLD.eyeHeight, 0] }}
      onCreated={handleCreated}
    >
      <SceneContents animate={animate} multisampling={multisampling} />
      {animate && <PerformanceMonitor factor={1} flipflops={3} onChange={onPerformance} onFallback={onFallback} />}
      <VisibilityPause loop={animate ? 'always' : 'demand'} />
      <DemandPump enabled={!animate} />
      <ReadySignal onReady={onReady} />
      {showStats && <StatsProbe />}
    </Canvas>
  )
}
