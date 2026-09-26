import { buildScript } from '../engine/script'
import { chapter0 } from './ch0Join'
import { chapter1 } from './ch1Arrive'
import { chapter2 } from './ch2Believe'
import { chapter3 } from './ch3Refuse'
import { chapter4 } from './ch4Human'
import { chapter5 } from './ch5Agents'
import { chapter6 } from './ch6End'

/** The whole demo, a little over two minutes: each chapter is one stretch of the master timeline. */
export const SCRIPT = buildScript([chapter0, chapter1, chapter2, chapter3, chapter4, chapter5, chapter6])
