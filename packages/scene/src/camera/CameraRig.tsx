import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { FRAME, sceneBus } from '../shared/sceneBus'
import { WORLD, toriiPlacement } from '../shared/world'
import type { Station } from '../types'
import { copyPose, createBasePose, poseAt, startMove, stepMove, type BasePose, type CameraMove } from './cameraMoves'
import { stationPose, type StationPose } from './stations'
import { useAspect, useStationPose } from './useStationPose'
import { frameClock } from '../shared/frameClock'

const DEG = Math.PI / 180
const PARALLAX_YAW = 1.5 * DEG
const PARALLAX_PITCH = 0.7 * DEG
const PARALLAX_SHIFT = 0.35
const FOLLOW_RATE = 2.4
/** After a move, drift and parallax fade back in over this long. */
const OFFSET_RETURN_SECONDS = 2.5
const Y_AXIS = new Vector3(0, 1, 0)
const X_AXIS = new Vector3(1, 0, 0)
const yawTurn = new Quaternion()
const pitchTurn = new Quaternion()

interface RigState {
  yaw: number
  pitch: number
  /**
   * Fade of the drift/parallax layer (its weight is the smoothstep of this):
   * 0 from the start of a move, which folds the offsets into its start pose,
   * back to 1 over OFFSET_RETURN_SECONDS once the camera rests with drift on.
   */
  offsets: number
  /** Own clock: R3F's elapsed time restarts whenever the frameloop resumes. */
  time: number
  station: Station | null
  readonly base: BasePose
  move: CameraMove | null
  /** Debug replay of the hero → gate glide from the bare hero pose (?stats → __meigiDebug.glideTo). */
  pinned: CameraMove | null
}

/**
 * The pose on screen: idle drift and ±1.5° parallax layered on the base pose,
 * scaled by the offset weight (identical to the landing's rest pose at time 0,
 * weight 1).
 */
function composePose(rig: RigState, out: BasePose): void {
  const { base } = rig
  const w = rig.offsets * rig.offsets * (3 - 2 * rig.offsets)
  const driftX = (Math.sin(rig.time * 0.07) * 0.22 + rig.yaw * (PARALLAX_SHIFT / PARALLAX_YAW)) * w
  const driftY = Math.sin(rig.time * 0.11 + 1.2) * 0.04 * w
  out.position.set(base.position.x + driftX, base.position.y + driftY, base.position.z)
  const sway = Math.sin(rig.time * 0.05 + 0.4) * 0.12 * DEG
  yawTurn.setFromAxisAngle(Y_AXIS, (-rig.yaw + sway) * w)
  pitchTurn.setFromAxisAngle(X_AXIS, rig.pitch * w)
  out.quaternion.copy(yawTurn).multiply(base.quaternion).multiply(pitchTurn)
  out.fov = base.fov
}

const onScreen = createBasePose()

function applyPose(camera: PerspectiveCamera, rig: RigState): void {
  composePose(rig, onScreen)
  camera.position.copy(onScreen.position)
  camera.quaternion.copy(onScreen.quaternion)
  if (camera.fov !== onScreen.fov) {
    camera.fov = onScreen.fov
    camera.updateProjectionMatrix()
  }
  camera.updateMatrixWorld()
}

/** Rest-only motion (drift on): idle drift, parallax and the offsets fading back in after a move. */
function followPointer(rig: RigState, dt: number, interactive: boolean): void {
  if (rig.move || rig.pinned) return
  const k = 1 - Math.exp(-FOLLOW_RATE * dt)
  rig.offsets = Math.min(1, rig.offsets + dt / OFFSET_RETURN_SECONDS)
  rig.time += dt
  rig.yaw += ((interactive ? sceneBus.pointer.x * PARALLAX_YAW : 0) - rig.yaw) * k
  rig.pitch += ((interactive ? -sceneBus.pointer.y * PARALLAX_PITCH : 0) - rig.pitch) * k
}

interface GlidePoses {
  readonly hero: StationPose
  readonly gate: StationPose
  readonly aspect: number
}

/**
 * Advances the base pose: a pinned debug glide, a station move, or rest at
 * `target`. Returns true on the frame a move arrives.
 */
function advanceBase(rig: RigState, dt: number, glide: GlidePoses, target: StationPose): boolean {
  const pin = sceneBus.pinnedGlide
  if (pin !== null) {
    rig.pinned ??= startMove('hero', 'gate', glide.hero, glide.gate, toriiPlacement(glide.aspect))
    rig.offsets = 0
    poseAt(rig.pinned, pin, rig.base)
    return false
  }
  if (rig.pinned) {
    rig.pinned = null
    copyPose(target, rig.base)
  }
  if (!rig.move) return false
  if (stepMove(rig.move, dt, rig.base)) {
    sceneBus.keepAwake(250)
    return false
  }
  rig.move = null
  return true
}

/** Mouse position in NDC for the parallax; touch never steers the camera. */
function usePointerParallax(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      sceneBus.pointer.x = (event.clientX / window.innerWidth) * 2 - 1
      sceneBus.pointer.y = (event.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [enabled])
}

interface StationChange {
  readonly station: Station
  readonly target: StationPose
  readonly aspect: number
  readonly animate: boolean
  readonly onSettled: (station: Station) => void
}

/** Starts a move from the pose on screen (offsets included); from then on it alone drives the camera. */
function beginMove(rig: RigState, from: Station, change: StationChange): void {
  const start = createBasePose()
  composePose(rig, start)
  rig.move = startMove(from, change.station, start, change.target, toriiPlacement(change.aspect))
  copyPose(start, rig.base)
  rig.offsets = 0
  rig.yaw = 0
  rig.pitch = 0
  sceneBus.cameraMoving = true
  sceneBus.keepAwake(rig.move.duration * 1000 + 400)
}

/**
 * A new station starts a move from wherever the camera is; a resize (same
 * station, new pose) or reduced motion jumps straight there. A layout effect,
 * so no frame renders with the new props before the move exists.
 */
function useStationChange(rig: RigState, change: StationChange): void {
  const invalidate = useThree((state) => state.invalidate)
  const { station, target, aspect, animate, onSettled } = change
  useLayoutEffect(() => {
    const from = rig.station
    if (animate && from !== null && from !== station) {
      beginMove(rig, from, { station, target, aspect, animate, onSettled })
    } else {
      copyPose(target, rig.base)
      rig.move = null
      sceneBus.cameraMoving = false
      onSettled(station)
    }
    rig.station = station
    invalidate()
  }, [rig, station, target, aspect, animate, invalidate, onSettled])
}

interface CameraRigProps {
  readonly station: Station
  readonly animate: boolean
  /**
   * Idle drift and pointer parallax at rest. Off in low power, where frames
   * only render now and then: the camera then rests exactly on each station.
   */
  readonly drift: boolean
  readonly interactive: boolean
  /** The camera has come to rest at this station (after a move, or at once). */
  readonly onSettled: (station: Station) => void
}

export function CameraRig({ station, animate, drift, interactive, onSettled }: CameraRigProps) {
  const camera = useThree((state) => state.camera)
  const aspect = useAspect()
  const target = useStationPose(station)
  const glide = useMemo(() => ({ hero: stationPose('hero', aspect), gate: stationPose('gate', aspect), aspect }), [aspect])
  const rig = useRef<RigState>({
    yaw: 0,
    pitch: 0,
    offsets: 1,
    time: 0,
    station: null,
    base: createBasePose(),
    move: null,
    pinned: null,
  })
  usePointerParallax(drift && interactive)

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.near = 0.1
    camera.far = WORLD.cameraFar
  }, [camera])

  useStationChange(rig.current, { station, target, aspect, animate, onSettled })

  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const state = rig.current
    const dt = frameClock.dt
    // The arrival frame shows the station pose exactly; drift and parallax fade back in from the next one.
    if (advanceBase(state, dt, glide, target)) {
      sceneBus.cameraMoving = false
      onSettled(station)
    } else if (drift) followPointer(state, dt, interactive)
    applyPose(camera, state)
  }, FRAME.camera)

  return null
}
