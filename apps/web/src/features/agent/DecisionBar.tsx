import type { Analysis, PayMode } from '../../lib/api/agentTypes'
import { Button } from '../../ui/components/Button'
import type { Approval } from './approval/useApproval'
import type { PayState } from './useAgentConsole'
import './agent.css'

interface PayControls {
  readonly pay: PayState
  readonly approval: Approval
  readonly onPay: (mode: PayMode) => void
}

/**
 * Judgement holds (the agent's own, and what a person may approve). Forcing past only these would skip the
 * human, so the attack demo is offered only when some hold is enforced by the vault (it reverts) or is one the
 * agent never overrides (it refuses): both show a refusal, never a payment.
 */
const JUDGEMENT = new Set([
  'triage_hold',
  'triage_unavailable',
  'pressure_hold',
  'above_auto_clear_budget',
  'urgent_language',
  'prompt_injection_suspected',
])

function attackDemoFits(analysis: Analysis): boolean {
  if (analysis.verdict.decision !== 'hold') return false
  return analysis.verdict.reasons.some((reason) => reason.severity === 'block' && !JUDGEMENT.has(reason.code))
}

interface AttackDemoProps {
  readonly busy: boolean
  readonly disabled: boolean
  readonly onForce: () => void
}

/** Secondary on purpose: it plays the agent that was talked into paying, so the chain has to answer alone. */
function AttackDemo({ busy, disabled, onForce }: AttackDemoProps) {
  return (
    <div className="decision__attack">
      <p className="decision__attack-note" id="attack-demo-note">
        <span className="decision__attack-tag">Attack demo</span> Overrides the hold, as a talked-into agent would. The
        vault still pays only the registered company.
      </p>
      <Button variant="ghost" busy={busy} disabled={disabled} aria-describedby="attack-demo-note" onClick={onForce}>
        Let the agent pay anyway
      </Button>
    </div>
  )
}

/** While a human is being asked (and while their approval pays), the ask button shows progress instead. */
function asking({ approval, pay }: PayControls): boolean {
  const flow = approval.flow.kind
  return flow === 'starting' || flow === 'waiting' || (flow === 'approved' && pay.kind === 'paying')
}

function PayButtons({ analysis, ...controls }: PayControls & { readonly analysis: Analysis }) {
  const { pay, approval, onPay } = controls
  const paying = pay.kind === 'paying'
  const busyAsking = asking(controls)
  const locked = paying || busyAsking || (pay.kind === 'done' && pay.outcome.status === 'paid')
  const hold = analysis.verdict.decision === 'hold'
  const { enabled, approvable } = analysis.approval
  return (
    <div className="decision__actions">
      {hold && approvable && enabled ? (
        <Button size="lg" busy={busyAsking} disabled={locked && !busyAsking} onClick={() => void approval.ask()}>
          Ask a verified human to approve
        </Button>
      ) : (
        <Button
          size="lg"
          busy={paying && pay.mode.kind === 'pay'}
          disabled={locked}
          onClick={() => onPay({ kind: 'pay' })}
        >
          Pay
        </Button>
      )}
      {hold && approvable && !enabled ? (
        <p className="decision__note">
          A verified human could approve this hold, but this agent has no World ID for Agents client configured, so it
          stays held.
        </p>
      ) : null}
      {attackDemoFits(analysis) ? (
        <AttackDemo
          busy={paying && pay.mode.kind === 'force'}
          disabled={locked}
          onForce={() => onPay({ kind: 'force' })}
        />
      ) : null}
    </div>
  )
}

interface DecisionBarProps {
  readonly analysis: Analysis
  /** The ways to act on it; left out for a recorded run. */
  readonly controls?: PayControls
}

/** The kernel's decision, the explanation of it, and (live) what can be done about it. */
export function DecisionBar({ analysis, controls }: DecisionBarProps) {
  const hold = analysis.verdict.decision === 'hold'
  const blocking = analysis.verdict.reasons.length
  return (
    <section className={hold ? 'decision decision--hold' : 'decision decision--pay'} aria-label="Decision">
      <div className="decision__verdict">
        <p className="decision__word">{hold ? 'Hold' : 'Pay'}</p>
        <p className="decision__sub">
          {hold ? `${blocking} blocking reason${blocking === 1 ? '' : 's'}` : 'every check passed'}
          {analysis.totalMs !== null ? ` · ${(analysis.totalMs / 1000).toFixed(1)} s` : ''}
        </p>
      </div>
      <div className="decision__why">
        <p className="decision__text">{analysis.explanation.text}</p>
        {analysis.explanation.source === 'llm' ? (
          <p className="decision__source">
            Worded by {analysis.explanation.model ?? 'the LLM'} from the kernel's facts only.
          </p>
        ) : null}
      </div>
      {controls ? <PayButtons analysis={analysis} {...controls} /> : null}
    </section>
  )
}
