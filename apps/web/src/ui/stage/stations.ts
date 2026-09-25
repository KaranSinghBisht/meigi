// Each flow looks at its own part of the Sakasa Fuji world; the camera eases there when the route changes.

import type { SceneMood, Station } from '@meigi/scene/lite'

export type { Station }
export type Mood = SceneMood

const STATIONS: Readonly<Record<string, Station>> = {
  '': 'gate', // where the landing's enter glide ends, just through the torii
  registry: 'fuji',
  register: 'shore',
  change: 'torii',
  agent: 'lake',
  x402: 'sky',
}

/** The camera station for a path; unknown routes stay at the gate. */
export function stationFor(pathname: string): Station {
  return STATIONS[pathname.split('/')[1] ?? ''] ?? 'gate'
}
