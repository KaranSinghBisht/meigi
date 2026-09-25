import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../../lib/hooks/motion'
import { Button } from '../../ui/components/Button'
import { Panel } from '../../ui/components/Panel'
import { Steps } from '../../ui/components/Steps'
import { Checklist } from './Checklist'
import { CompanyStep } from './CompanyStep'
import { DomainStep } from './DomainStep'
import { OfficersStep } from './OfficersStep'
import { SubmitStep } from './SubmitStep'
import { STEPS, useRegistrationFlow, type RegistrationFlow } from './useRegistrationFlow'
import '../../ui/layout/layout.css'
import './register.css'

const TITLES = [
  'Who is the company?',
  'Prove you control its domain',
  'Enroll the officers',
  'Write it on-chain',
] as const

function CurrentStep({ wizard }: { readonly wizard: ReturnType<typeof useRegistrationFlow> }) {
  const { flow } = wizard
  const registration = flow.registration
  if (flow.step === 0 || !registration || !flow.controller) {
    return <CompanyStep form={flow.form} onFormChange={wizard.setForm} onCreated={wizard.created} />
  }
  if (flow.step === 1) {
    return (
      <DomainStep
        registration={registration}
        controller={flow.controller}
        signature={flow.signature}
        onSigned={wizard.signed}
        onVerified={wizard.domainVerified}
      />
    )
  }
  if (flow.step === 2) {
    return (
      <OfficersStep
        registration={registration}
        officers={flow.officers}
        onEnrolled={wizard.officerAdded}
        onContinue={() => wizard.goTo(3)}
      />
    )
  }
  return (
    <SubmitStep
      registration={registration}
      officerCount={flow.officers.length}
      submission={flow.submission}
      onSubmitted={wizard.submitted}
    />
  )
}

/** Each new step starts at the top of the wizard, not wherever the previous step's button was. */
function useScrollOnStep(step: number) {
  const ref = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    ref.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [step])
  return ref
}

function Confirmed({ flow }: { readonly flow: RegistrationFlow }) {
  if (!flow.registration) return null
  return (
    <p className="register__who">
      <span className="mono">{flow.tNumber}</span>{' '}
      <span className="jp" lang="ja">
        {flow.registration.legalName}
      </span>{' '}
      <span className="register__match">✓ NTA exact match</span>
    </p>
  )
}

export default function RegisterPage() {
  const wizard = useRegistrationFlow()
  const { flow } = wizard
  const step = flow.registration ? flow.step : 0
  const layout = useScrollOnStep(step)
  const startOver = flow.registration ? (
    <Button variant="quiet" size="sm" onClick={wizard.reset}>
      Start over
    </Button>
  ) : null

  return (
    <div className="register">
      <header className="page-head">
        <p className="eyebrow">Register a business</p>
        <h1 className="page-head__title">Bind your T-number to one payout address.</h1>
        <p className="page-head__lede">
          Four checks, then the Meigi attester writes it on-chain: the exact NTA-registered name, a domain proof signed
          by your business key, and a World ID for every officer who will approve changes.
        </p>
      </header>
      <Steps steps={STEPS} current={step} label="Registration progress" />
      <div ref={layout} className="register__layout">
        <Panel
          title={TITLES[step] ?? TITLES[0]}
          eyebrow={`Step ${step + 1} of ${STEPS.length}`}
          className="register__panel"
          actions={startOver}
        >
          <Confirmed flow={flow} />
          <CurrentStep wizard={wizard} />
        </Panel>
        <Checklist current={step} />
      </div>
    </div>
  )
}
