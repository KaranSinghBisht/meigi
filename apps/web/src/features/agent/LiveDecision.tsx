import type { Analysis, PayMode, Reason } from '../../lib/api/agentTypes'
import { ErrorNotice } from '../../ui/components/Notice'
import { ApprovalPanel } from './approval/ApprovalPanel'
import { useApproval } from './approval/useApproval'
import { DecisionBar } from './DecisionBar'
import { PayOutcomeView } from './PayOutcomeView'
import { TokenForm } from './TokenForm'
import type { AgentConsole, PayState } from './useAgentConsole'
import './agent.css'

/**
 * "Check again" only settles a payment that was already sent. An approval is single-use, so it asks with a
 * plain pay; the agent answers with the stored payment before looking at anything else.
 */
function checkAgainMode(pay: PayState): PayMode {
  return pay.kind === 'idle' || pay.mode.kind === 'approved' ? { kind: 'pay' } : pay.mode
}

const isBlock = (reason: Reason) => reason.severity === 'block'

interface LiveDecisionProps {
  readonly agent: AgentConsole
  readonly analysis: Analysis
}

/** The decision and every way to act on it. Keyed by the analysis, so a new document starts a clean approval. */
export function LiveDecision({ agent, analysis }: LiveDecisionProps) {
  const { pay, submitPayment } = agent
  // A used approval pays once: a plain pay then only returns what that payment did.
  const approval = useApproval(analysis.id, (approvalId, used) => {
    void submitPayment(used ? { kind: 'pay' } : { kind: 'approved', approvalId })
  })
  return (
    <>
      <DecisionBar analysis={analysis} controls={{ pay, approval, onPay: (mode) => void submitPayment(mode) }} />
      <ApprovalPanel approval={approval} holds={analysis.verdict.reasons.filter(isBlock)} />
      {pay.kind === 'done' ? (
        <PayOutcomeView
          outcome={pay.outcome}
          analysis={analysis}
          approved={pay.mode.kind === 'approved'}
          onCheckAgain={() => void submitPayment(checkAgainMode(pay))}
        />
      ) : null}
      {pay.kind === 'failed' ? <ErrorNotice error={pay.error} /> : null}
      {pay.kind === 'failed' && pay.error.code === 'unauthorized' ? (
        <TokenForm onSaved={() => void submitPayment(pay.mode)} />
      ) : null}
    </>
  )
}
