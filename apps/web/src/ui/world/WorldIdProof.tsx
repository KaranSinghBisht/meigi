import { IDKitSessionWidget, type IDKitResultSession } from '@worldcoin/idkit'
import type { RpContextWire } from '../../lib/api/verifier'
import { env } from '../../lib/env/env'
import { Button, type ButtonSize, type ButtonVariant } from '../components/Button'
import { useWorldIdFlow } from './useWorldIdFlow'
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
  /** Sends the proof to the verifier. Throw to fail the widget; the caller shows its own message. */
  readonly onProof: (result: IDKitResultSession) => Promise<void>
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly disabled?: boolean
}

/**
 * A button that opens World ID (IDKit session widget) asking for a proof-of-human credential bound to
 * `signal`. Sessions take constraints, not presets: `{ type: 'proof_of_human', signal }` is the session
 * form of `proofOfHuman({ signal })`.
 */
export function WorldIdProof(props: WorldIdProofProps) {
  const { label, signal, sessionId, initialContext, onProof, variant = 'primary', size = 'md', disabled } = props
  const flow = useWorldIdFlow(sessionId, initialContext)
  return (
    <div className="world-proof">
      <Button
        variant={variant}
        size={size}
        busy={flow.preparing || flow.open}
        disabled={disabled}
        onClick={() => void flow.start()}
      >
        {flow.open ? 'Waiting for World ID…' : label}
      </Button>
      {flow.problem ? (
        <p className="field__error" role="alert">
          {flow.problem}
        </p>
      ) : null}
      {flow.context ? (
        <IDKitSessionWidget
          open={flow.open}
          onOpenChange={flow.onOpenChange}
          app_id={env.worldAppId}
          rp_context={flow.context}
          environment={env.worldEnvironment}
          constraints={{ type: 'proof_of_human', signal }}
          existing_session_id={flow.existing}
          action_description={sessionId ? 'Approve a Meigi change' : 'Enroll as a company officer on Meigi'}
          handleVerify={onProof}
          onSuccess={() => undefined}
          onError={flow.onError}
        />
      ) : null}
    </div>
  )
}
