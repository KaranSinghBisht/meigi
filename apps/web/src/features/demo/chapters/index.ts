import { buildScript } from '../engine/script'
import { chapter1 } from './ch1Arrive'
import { chapter2 } from './ch2Believe'
import { chapter3 } from './ch3Refuse'
import { chapter4 } from './ch4Human'
import { chapter5 } from './ch5Agents'
import { chapter6 } from './ch6End'

/** The whole demo, about 110 s: each chapter is one stretch of the master timeline. */
export const SCRIPT = buildScript([chapter1, chapter2, chapter3, chapter4, chapter5, chapter6])
