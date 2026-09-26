import { useSearchParams } from 'react-router'
import { useServiceStatus } from '../../lib/hooks/useServiceStatus'
import { Spinner } from '../../ui/components/Spinner'
import { RegisterReplay } from './replay/RegisterReplay'
import { OnboardingWizard } from './wizard/OnboardingWizard'
import './register.css'

/**
 * The live wizard when the verifier can be reached (localhost, the booth); otherwise a replay of a real registration
 * in the same window. The same check ServiceGate makes, with no wording of its own. `?replay` shows the replay anyway.
 */
function RegisterGate() {
  const status = useServiceStatus('verifier')
  const [params] = useSearchParams()
  if (params.has('replay')) return <RegisterReplay />
  if (status === 'checking') {
    return (
      <div className="register__checking">
        <Spinner label="Loading" />
      </div>
    )
  }
  return status === 'up' ? <OnboardingWizard /> : <RegisterReplay />
}

export default function RegisterPage() {
  return (
    <div className="register">
      <h1 className="sr-only">Register your company on Meigi</h1>
      <RegisterGate />
    </div>
  )
}
