import { Bloom, ChromaticAberration, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useMemo } from 'react'
import { HalfFloatType, Vector2 } from 'three'
import { FRAME } from '../shared/sceneBus'

interface PostProps {
  /** MSAA samples for the HDR buffer; fewer on dense displays where DPR helps. */
  readonly multisampling: number
}

/**
 * Print-like finish: bloom only on true highlights (the sun glow and lacquer
 * glints), a faint lens fringe at the edges, ACES, a soft vignette and grain.
 */
export function Post({ multisampling }: PostProps) {
  const fringe = useMemo(() => new Vector2(0.0011, 0.0007), [])
  return (
    <EffectComposer
      multisampling={multisampling}
      frameBufferType={HalfFloatType}
      renderPriority={FRAME.composer}
      enableNormalPass={false}
    >
      <Bloom mipmapBlur intensity={0.5} luminanceThreshold={1.0} luminanceSmoothing={0.25} radius={0.72} />
      <ChromaticAberration offset={fringe} radialModulation modulationOffset={0.42} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.36} darkness={0.22} />
      <Noise blendFunction={BlendFunction.OVERLAY} opacity={0.05} />
    </EffectComposer>
  )
}
