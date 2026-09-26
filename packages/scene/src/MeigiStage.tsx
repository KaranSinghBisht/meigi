import { PerformanceMonitor, type PerformanceMonitorApi } from '@react-three/drei'
import { Canvas, type RootState } from '@react-three/fiber'
import { useCallback, useState, type CSSProperties } from 'react'
import { CameraRig } from './camera/CameraRig'
import { Foothills } from './fuji/Foothills'
import { Garden } from './garden/Garden'
import { Fuji } from './fuji/Fuji'
import { Lake } from './lake/Lake'
import { Mist } from './mist/Mist'
import { Post } from './post/Post'
import { Sakura } from './sakura/Sakura'
import { FrameClockDriver } from './shared/frameClock'
import { DemandPump, ReadySignal, VisibilityPause, WakeKeeper } from './shared/lifecycle'
import { MoodDriver } from './shared/MoodDriver'
import { HEX } from './shared/palette'
import { sceneBus } from './shared/sceneBus'
import { StatsProbe, wantsStats } from './shared/StatsProbe'
import { WORLD } from './shared/world'
import { Sky } from './sky/Sky'
import { StageBoundary } from './StageBoundary'
import { Torii } from './torii/Torii'
import type { MeigiStageProps, Station } from './types'

type Loop = 'always' | 'demand'

const MAX_DPR = 1.75
const noop = () => {}

/** Device pixel ratio capped at MAX_DPR; the performance monitor scales below it. */
function deviceDpr(): number {
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DPR)
}

/** Maps the monitor's 0..1 quality factor onto [1, device DPR] in 0.05 steps. */
function dprForFactor(factor: number): number {
  const top = deviceDpr()
  return Math.round((1 + (top - 1) * factor) * 20) / 20
}

interface ContentsProps {
  readonly station: Station
  readonly animate: boolean
  readonly drift: boolean
  readonly interactive: boolean
  readonly multisampling: number
}

function SceneContents({ station, animate, drift, interactive, multisampling }: ContentsProps) {
  // The lake, mist and petals re-centre on a station only once the camera has
  // arrived there, so nothing jumps mid-glide.
  const [settled, setSettled] = useState<Station>(station)
  return (
    <>
      <FrameClockDriver />
      <CameraRig station={station} animate={animate} drift={drift} interactive={interactive} onSettled={setSettled} />
      <MoodDriver animate={animate} />
      <Sky animate={animate} />
      <Fuji />
      <Foothills />
      <Torii />
      <Garden animate={animate} />
      <Lake station={settled} animate={animate} interactive={interactive} />
      <Mist station={settled} animate={animate} />
      <Sakura station={settled} animate={animate} />
      <Post multisampling={multisampling} />
    </>
  )
}

interface LifecycleProps {
  readonly loop: Loop
  readonly animate: boolean
  readonly onReady: () => void
  readonly onDpr: (dpr: number) => void
}

function Lifecycle({ loop, animate, onReady, onDpr }: LifecycleProps) {
  const [showStats] = useState(wantsStats)
  // A resolution change mid-glide reallocates every render target: hold it until the camera rests.
  const onChange = useCallback(
    (api: PerformanceMonitorApi) => {
      if (!sceneBus.cameraMoving) onDpr(dprForFactor(api.factor))
    },
    [onDpr],
  )
  const onFallback = useCallback(() => onDpr(1), [onDpr])
  return (
    <>
      {loop === 'always' && <PerformanceMonitor factor={1} flipflops={3} onChange={onChange} onFallback={onFallback} />}
      <VisibilityPause loop={loop} />
      <DemandPump enabled={loop === 'demand'} />
      {loop === 'demand' && <WakeKeeper continuous={animate} />}
      <ReadySignal onReady={onReady} />
      {showStats && <StatsProbe />}
    </>
  )
}

/**
 * The Sakasa Fuji world. Fills its parent; put it in a fixed layer behind the
 * UI. Change `station` to ease the camera; call sceneEvents for moods.
 */
export function MeigiStage(props: MeigiStageProps) {
  const { station, reducedMotion, interactive = true, lowPower = false, onReady = noop, onLost = noop, className } = props
  const animate = !reducedMotion
  const loop: Loop = animate && !lowPower ? 'always' : 'demand'
  const [multisampling] = useState(() => (window.devicePixelRatio >= 1.5 ? 2 : 4))
  const [dpr, setDpr] = useState(deviceDpr)

  const handleCreated = useCallback(
    ({ gl }: RootState) => {
      gl.setClearColor(HEX.horizon)
      const lost = (event: Event) => {
        event.preventDefault()
        onLost()
      }
      gl.domElement.addEventListener('webglcontextlost', lost, { once: true })
    },
    [onLost],
  )

  const style: CSSProperties = interactive ? { touchAction: 'pinch-zoom' } : { pointerEvents: 'none' }
  return (
    <StageBoundary onError={onLost}>
      <Canvas
        className={className}
        style={style}
        aria-hidden="true"
        dpr={dpr}
        frameloop={loop}
        gl={{ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }}
        camera={{ fov: 34, near: 0.1, far: WORLD.cameraFar, position: [0, WORLD.eyeHeight, 0] }}
        onCreated={handleCreated}
      >
        <SceneContents
          station={station}
          animate={animate}
          drift={loop === 'always'}
          interactive={interactive}
          multisampling={multisampling}
        />
        <Lifecycle loop={loop} animate={animate} onReady={onReady} onDpr={setDpr} />
      </Canvas>
    </StageBoundary>
  )
}
