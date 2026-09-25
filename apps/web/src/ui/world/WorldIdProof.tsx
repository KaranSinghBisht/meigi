import type { IDKitResultSession } from '@worldcoin/idkit'
import type { RpContextWire } from '../../lib/api/verifier'
import { Button, type ButtonSize, type ButtonVariant } from '../components/Button'
import { useWorldIdFlow } from './useWorldIdFlow'
import { WorldIdSession } from './WorldIdSession'
import '../components/field.css'
import './world.css'

interface WorldIdProofProps {
  readonly label: string
  /** Bound into the proof: the verifier rejects a proof made for any other signal. */
  readonly signal: string
  /** Prove this existing session (an enrolled officer); omit to create a new session. */
  readonly sessionId?: string
  /** A signed context the caller already has (e.g. from an intent). Used once while fresh. */
  readonly initialContext?: RpContextWire
  /** Sends the proof to the verifier. Throw to report failure; the caller shows its own message. */
  readonly onProof: (result: IDKitResultSession) => Promise<void>
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly disabled?: boolean
}

/**
 * A World ID 4.0 session proof bound to `signal`, shown inline with its QR code and link. Sessions take
 * constraints, not presets: `{ type: 'proof_of_human', signal }` is the session form of `proofOfHuman`.
 */
export function WorldIdProof(props: WorldIdProofProps) {
  const { label, signal, sessionId, initialContext, onProof, variant = 'primary', size = 'md', disabled } = props
  const flow = useWorldIdFlow(sessionId, initialContext)
  return (
    <div className={flow.context ? 'world-proof is-active' : 'world-proof'}>
      {flow.context ? (
        <WorldIdSession
          context={flow.context}
          signal={signal}
          sessionId={flow.existing}
          onProof={onProof}
          onFinish={flow.finish}
        />
      ) : (
        <Button
          variant={variant}
          size={size}
          busy={flow.preparing}
          disabled={disabled}
          onClick={() => void flow.start()}
        >
          {label}
        </Button>
      )}
      {flow.problem ? (
        <p className="field__error" role="alert">
          {flow.problem}
        </p>
      ) : null}
    </div>
  )
}
