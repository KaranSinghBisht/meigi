import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import type { Station } from '../types'
import { stationPose, type StationPose } from './stations'

export function useAspect(): number {
  const size = useThree((state) => state.size)
  return size.width / Math.max(size.height, 1)
}

/** The resting pose of a station for the current viewport. */
export function useStationPose(station: Station): StationPose {
  const aspect = useAspect()
  return useMemo(() => stationPose(station, aspect), [station, aspect])
}
