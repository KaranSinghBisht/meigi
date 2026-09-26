import { Link } from 'react-router'
import { FIXTURE_T_NUMBER } from '../../lib/chain/tNumber'
import { DemoMachine } from '../../ui/demo/DemoMachine'
import { ServiceGate } from '../../ui/demo/ServiceGate'
import { OnboardingWizard } from './wizard/OnboardingWizard'
import { ProgressRail } from './wizard/ProgressRail'
import './register.css'

/** The public site: registering needs the verifier, which signs as the attester on the demo machine. */
function RegisterHosted() {
  return (
    <div className="onboard onboard--preview window cells">
      <ProgressRail current={-1} />
      <div className="onboard__stage">
        <DemoMachine
          service="verifier"
          what="Registering a company"
          why="it checks the NTA registry, the DNS proof and each officer's World ID, then writes the payee as the attester"
        >
          <p>
            The result is public:{' '}
            <Link to={`/registry/${FIXTURE_T_NUMBER}`}>see a registered payee live in the registry →</Link>
          </p>
        </DemoMachine>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <div className="register">
      <h1 className="sr-only">Register your company on Meigi</h1>
      <ServiceGate service="verifier" fallback={<RegisterHosted />}>
        <OnboardingWizard />
      </ServiceGate>
    </div>
  )
}
