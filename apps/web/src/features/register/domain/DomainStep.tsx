import { Button } from '../../../ui/components/Button'
import { TextField } from '../../../ui/components/Field'
import { ErrorNotice, Notice } from '../../../ui/components/Notice'
import type { Onboarding } from '../flow/useOnboarding'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import { ProofRecords } from './ProofRecords'
import { SignChallenge } from './SignChallenge'
import { fictionalDomain, useRegistrationCalls } from './useRegistrationCalls'
import './domain.css'

type Calls = ReturnType<typeof useRegistrationCalls>

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** "https://www.Sony.co.jp/" → "www.sony.co.jp": people paste URLs. */
function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '')
}

function StartOver({ onboarding }: { readonly onboarding: Onboarding }) {
  return (
    <Button size="sm" variant="ghost" onClick={onboarding.reset}>
      Start over
    </Button>
  )
}

/** The question: which domain. Continuing creates the registration, so the verifier can issue the challenge. */
function DomainEntry({ onboarding, calls }: { readonly onboarding: Onboarding; readonly calls: Calls }) {
  const value = onboarding.state.drafts.domain
  const domain = cleanDomain(value)
  const valid = DOMAIN_RE.test(domain)
  return (
    <StepFrame
      step={2}
      title="Which domain does the company use?"
      lede="The one on its website and email. You'll add one DNS record to prove it's yours."
      onSubmit={() => void (valid && calls.create(domain))}
      actions={
        <StepActions onBack={() => onboarding.goTo(1)}>
          <Button type="submit" size="lg" busy={calls.busy} disabled={!valid}>
            Continue
          </Button>
        </StepActions>
      }
    >
      <TextField
        label="Company domain"
        className="input--hero"
        value={value}
        onChange={(event) => onboarding.setDrafts({ domain: event.target.value })}
        placeholder="example.co.jp"
        autoComplete="off"
        spellCheck={false}
        error={value.trim() !== '' && !valid && value.includes('.') ? 'Enter a public domain, like example.co.jp.' : null}
      />
      {calls.error ? <ErrorNotice error={calls.error} action={<StartOver onboarding={onboarding} />} /> : null}
    </StepFrame>
  )
}

/** A fictional company has no domain to prove: one tap creates the registration and the verifier skips the proof. */
function FictionalDomain({ onboarding, calls }: { readonly onboarding: Onboarding; readonly calls: Calls }) {
  const { company, registration } = onboarding.state
  const proceed = async () => {
    if (!company) return
    const id = registration?.id ?? (await calls.create(fictionalDomain(company.tNumber)))?.id
    if (id) await calls.check(id)
  }
  return (
    <StepFrame
      step={2}
      title="No domain to prove"
      lede="A fictional company has no real domain, so Meigi skips this step and records it as fictional."
      actions={
        <StepActions onBack={registration ? undefined : () => onboarding.goTo(1)}>
          <Button size="lg" busy={calls.busy} onClick={() => void proceed()}>
            Continue
          </Button>
        </StepActions>
      }
    >
      <Notice tone="info" title="Fictional demo company">
        <p>Registry office 9999 is never issued, so there's nothing to sign and no DNS record to add.</p>
      </Notice>
      {calls.error ? <ErrorNotice error={calls.error} /> : null}
    </StepFrame>
  )
}

function PublishRecord({ onboarding, calls }: { readonly onboarding: Onboarding; readonly calls: Calls }) {
  const { registration, signature } = onboarding.state
  if (!registration || !signature) return null
  return (
    <StepFrame
      step={2}
      title="Add this record to your DNS"
      lede="Add it at your DNS provider, then check. New records can take a few minutes to appear."
      actions={
        <StepActions>
          <Button variant="quiet" size="lg" onClick={() => onboarding.signed(null)}>
            Sign again
          </Button>
          <Button size="lg" busy={calls.busy} onClick={() => void calls.check(registration.id)}>
            Check now
          </Button>
        </StepActions>
      }
    >
      <ProofRecords challenge={registration.domainProof} signature={signature} />
      {calls.error ? <ErrorNotice error={calls.error} /> : null}
    </StepFrame>
  )
}

function Proven({ onboarding }: { readonly onboarding: Onboarding }) {
  const fixture = onboarding.state.company?.fixture === true
  return (
    <StepFrame
      step={2}
      title={fixture ? 'No domain to prove' : 'Your domain is proven'}
      actions={
        <StepActions>
          <Button size="lg" onClick={() => onboarding.goTo(3)}>
            Continue
          </Button>
        </StepActions>
      }
    >
      <Notice tone="success" title={fixture ? 'Skipped for a fictional company.' : 'The verifier found your signed record.'} />
    </StepFrame>
  )
}

export function DomainStep({ onboarding }: { readonly onboarding: Onboarding }) {
  const calls = useRegistrationCalls(onboarding)
  const { company, controller, registration, signature, domainMethod } = onboarding.state
  if (!company || !controller) return null
  if (domainMethod) return <Proven onboarding={onboarding} />
  if (company.fixture) return <FictionalDomain onboarding={onboarding} calls={calls} />
  if (!registration) return <DomainEntry onboarding={onboarding} calls={calls} />
  if (!signature) {
    const domain = registration.domainProof.txtName.replace(/^_meigi\./, '')
    return <SignChallenge onboarding={onboarding} registration={registration} controller={controller} domain={domain} />
  }
  return <PublishRecord onboarding={onboarding} calls={calls} />
}
