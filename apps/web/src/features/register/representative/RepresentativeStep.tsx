import { Badge } from '../../../ui/components/Badge'
import { Button } from '../../../ui/components/Button'
import { Notice } from '../../../ui/components/Notice'
import { STEP } from '../flow/steps'
import type { Onboarding } from '../flow/useOnboarding'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import './representative.css'

/** How a registrant will prove they act for the company. Neither exists yet, so both are shown, and disabled. */
const METHODS = [
  {
    id: 'certificate',
    title: (
      <>
        Sign with <span lang="ja">商業登記電子証明書</span>
      </>
    ),
    body: "The Legal Affairs Bureau's corporate e-certificate for the registered representative, signed remotely through gBizID.",
  },
  {
    id: 'mail',
    title: 'Mail a code to the registered head office',
    body: 'A one-time code by registered mail to the head office the NTA lists, entered here on arrival.',
  },
] as const

function Methods() {
  return (
    <div className="rep-methods" role="group" aria-label="Ways to prove you represent the company">
      {METHODS.map((method) => (
        <button key={method.id} type="button" className="rep-method" disabled aria-describedby={`rep-${method.id}`}>
          <span className="rep-method__title">{method.title}</span>
          <span id={`rep-${method.id}`} className="rep-method__body">
            {method.body}
          </span>
          <span className="rep-method__chip">
            <Badge tone="neutral">Coming in production</Badge>
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Proof that the registrant represents the company. It isn't built: nothing here signs or pretends to. The step says
 * so plainly, and what registration proves today, then moves on.
 */
export function RepresentativeStep({ onboarding }: { readonly onboarding: Onboarding }) {
  const fixture = onboarding.state.company?.fixture === true
  return (
    <StepFrame
      step={STEP.representative}
      title="Prove you represent the company"
      lede="Controlling a domain doesn't make someone the company. Its registered representative will sign for it."
      actions={
        <StepActions onBack={() => onboarding.goTo(STEP.domain)}>
          <Button size="lg" onClick={() => onboarding.goTo(STEP.officers)}>
            Continue
          </Button>
        </StepActions>
      }
    >
      {fixture ? (
        <p className="rep-skip">
          <Badge tone="info">Demo companies skip this step</Badge>
        </p>
      ) : null}
      <Methods />
      <Notice
        tone="info"
        title={
          <span>
            Today, registration proves an exact NTA name match, domain control and <span className="nowrap">World ID</span>{' '}
            officers.
          </span>
        }
      >
        <p>In production it also proves the signer represents the company.</p>
      </Notice>
    </StepFrame>
  )
}
