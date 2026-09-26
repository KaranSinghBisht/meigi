import { Link } from 'react-router'
import { FIXTURE_T_NUMBER } from '../../lib/chain/tNumber'
import { DemoMachine } from '../../ui/demo/DemoMachine'
import { ServiceGate } from '../../ui/demo/ServiceGate'
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
      {flow.registration.fixture ? (
        <span className="register__match register__match--fixture">Fictional demo company (no NTA record)</span>
      ) : (
        <span className="register__match">✓ NTA exact match</span>
      )}
    </p>
  )
}

function RegisterWizard() {
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
    <>
      <Steps steps={STEPS} current={step} label="Registration progress" />
      <div ref={layout} className="register__layout">
        <Panel
          title={
            step === 1 && flow.registration?.fixture
              ? 'No domain proof for a fictional company'
              : (TITLES[step] ?? TITLES[0])
          }
          eyebrow={`Step ${step + 1} of ${STEPS.length}`}
          className="register__panel"
          actions={startOver}
        >
          <Confirmed flow={flow} />
          <CurrentStep wizard={wizard} />
        </Panel>
        <Checklist current={step} />
      </div>
    </>
  )
}

/** The public site: registration needs the verifier, which signs as the attester on the demo machine. */
function RegisterHosted() {
  return (
    <div className="register__layout">
      <DemoMachine
        service="verifier"
        what="Registering a business"
        why="it checks the NTA data, the DNS proof and each officer's World ID, then writes the payee as the attester"
      >
        <p>
          The result is public:{' '}
          <Link to={`/registry/${FIXTURE_T_NUMBER}`}>see a registered payee live in the registry →</Link>
        </p>
      </DemoMachine>
      <Checklist current={-1} />
    </div>
  )
}

export default function RegisterPage() {
  return (
    <div className="register">
      <header className="page-head">
        <p className="eyebrow">Register a business</p>
        <h1 className="page-head__title">
          Bind your <span className="nowrap">T-number</span> to one payout address.
        </h1>
        <p className="page-head__lede">
          Four checks, then the Meigi attester writes it on-chain: the exact NTA-registered name, a domain proof signed
          by your business key, and a World ID for every officer who will approve changes.
        </p>
      </header>
      <ServiceGate service="verifier" fallback={<RegisterHosted />}>
        <RegisterWizard />
      </ServiceGate>
    </div>
  )
}
