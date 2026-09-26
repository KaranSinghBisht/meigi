import type { ReactNode } from 'react'
import type { Explained } from '../../../lib/api/messages'
import { Button, LinkButton } from '../../../ui/components/Button'
import { ErrorNotice } from '../../../ui/components/Notice'
import type { Onboarding } from '../flow/useOnboarding'
import { StartOver } from './StartOver'

/** The verifier no longer has this draft: a fresh registration is the way on. */
const GONE = new Set(['registration_expired', 'registration_not_found'])
/** The registration already went through (or the number is claimed): look it up, never start over. */
const DONE = new Set(['already_submitted', 'already_disputed', 'already_registered'])

function RegistryLink({ tNumber }: { readonly tNumber: string }) {
  return (
    <LinkButton to={`/registry/${tNumber}`} variant="ghost" size="sm">
      View in the registry
    </LinkButton>
  )
}

/** Another open claim on this number by the same World ID: pick it up if this tab started it, or look it up. */
function OtherRegistration({ onboarding }: { readonly onboarding: Onboarding }) {
  const { company, registration } = onboarding.state
  const previous = onboarding.previous()
  const resumable =
    previous?.registration && previous.company?.tNumber === company?.tNumber && previous.registration.id !== registration?.id
  return (
    <>
      {resumable ? (
        <Button size="sm" onClick={onboarding.resume}>
          Continue that registration
        </Button>
      ) : null}
      {company ? <RegistryLink tNumber={company.tNumber} /> : null}
    </>
  )
}

function actionsFor(code: string | undefined, onboarding: Onboarding): ReactNode {
  const tNumber = onboarding.state.company?.tNumber
  if (!code) return null
  if (GONE.has(code)) return <StartOver onReset={onboarding.reset} />
  if (DONE.has(code) && tNumber) return <RegistryLink tNumber={tNumber} />
  if (code === 'duplicate_open_registration') return <OtherRegistration onboarding={onboarding} />
  return null
}

/** A verifier error on a step, and the one way on that fits it (below the notice, so a phone never squeezes it). */
export function StepError({ error, onboarding }: { readonly error: Explained; readonly onboarding: Onboarding }) {
  const actions = actionsFor(error.code, onboarding)
  return (
    <div className="step-error">
      <ErrorNotice error={error} />
      {actions ? <div className="step-error__actions">{actions}</div> : null}
    </div>
  )
}
