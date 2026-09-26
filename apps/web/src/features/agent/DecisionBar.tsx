import type { Analysis, PayMode } from '../../lib/api/agentTypes'
import { Button } from '../../ui/components/Button'
import { AgentProse } from './AgentProse'
import type { Approval } from './approval/useApproval'
import { attackDemoFits } from './holds'
import type { PayState } from './useAgentConsole'
import './agent.css'

interface PayControls {
  readonly pay: PayState
  readonly approval: Approval
  readonly onPay: (mode: PayMode) => void
}

interface AttackDemoProps {
  readonly busy: boolean
  readonly disabled: boolean
  readonly onForce: () => void
}

/** A quiet text button under a small label: it plays the agent that was talked into paying, so the vault answers. */
function AttackDemo({ busy, disabled, onForce }: AttackDemoProps) {
  return (
    <div className="decision__attack">
      <p className="decision__attack-label" aria-hidden="true">
        Attack demo
      </p>
      <p id="attack-demo-note" className="sr-only">
        Attack demo: pushes past the hold, as a talked-into agent would, and asks the vault directly. Forcing only
        simulates; it never sends.
      </p>
      <Button
        variant="quiet"
        size="sm"
        busy={busy}
        disabled={disabled}
        aria-describedby="attack-demo-note"
        title="Pushes past the hold and asks the vault directly. Forcing only simulates; it never sends."
        onClick={onForce}
      >
        Let the agent pay anyway (simulation)
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
          Ask a human to approve with World ID
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
          A human could approve this hold through World ID for Agents, but this agent has no World ID for Agents client
          configured, so it stays held.
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

/**
 * What the decision is about: the amount and the registered company it would go to. The name is the registry's,
 * never the document's claim, and a payee that isn't active shows only its T-number.
 */
function Subject({ analysis }: { readonly analysis: Analysis }) {
  const amount = analysis.extracted.amount?.display ?? null
  const payee = analysis.kernel.payee
  const tNumber = payee?.tNumber || analysis.extracted.tNumber
  const name = payee?.legalName ?? null
  if (!amount && !tNumber) return null
  return (
    <p className="decision__subject">
      {amount ? <span className="num">{amount}</span> : null}
      {amount && tNumber ? ' to ' : null}
      {name ? (
        <span className="jp" lang="ja">
          {name}
        </span>
      ) : tNumber ? (
        <span className="mono">{tNumber}</span>
      ) : null}
    </p>
  )
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
        <Subject analysis={analysis} />
        <p className="decision__text">
          <AgentProse text={analysis.explanation.text} />
        </p>
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
