import type { Analysis } from '../../lib/api/agentTypes'
import { Button } from '../../ui/components/Button'
import type { PayState } from './useAgentConsole'
import './agent.css'

interface PayControls {
  readonly pay: PayState
  readonly onPay: (force: boolean) => void
}

function PayButtons({ pay, onPay }: PayControls) {
  const paying = pay.kind === 'paying'
  return (
    <div className="decision__actions">
      <Button size="lg" busy={paying && pay.force === false} disabled={paying} onClick={() => onPay(false)}>
        Pay
      </Button>
      <Button size="lg" variant="accent" busy={paying && pay.force} disabled={paying} onClick={() => onPay(true)}>
        Let the agent pay anyway
      </Button>
    </div>
  )
}

interface DecisionBarProps {
  readonly analysis: Analysis
  /** The two ways to try paying; left out for a recorded run. */
  readonly controls?: PayControls
}

/** The kernel's decision, the explanation of it, and (live) the two ways to try paying. */
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
      {controls ? <PayButtons {...controls} /> : null}
    </section>
  )
}
