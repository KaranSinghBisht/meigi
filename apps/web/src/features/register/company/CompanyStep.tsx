import { useState } from 'react'
import { Button } from '../../../ui/components/Button'
import { TextField } from '../../../ui/components/Field'
import { STEP } from '../flow/steps'
import type { Company, Onboarding } from '../flow/useOnboarding'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import { CompanyRecord } from './CompanyRecord'
import { EnsPreview } from './EnsPreview'
import { useCompanyLookup, type CompanyLookup } from './useCompanyLookup'
import './company.css'

/** The company to register, once the lookup answered for the T-number on screen (never a stale answer). */
function resolveCompany(lookup: CompanyLookup, fictionalName: string): Company | null {
  const { nta, tNumber } = lookup
  if (!tNumber || nta.status === 'idle' || nta.tNumber !== tNumber) return null
  const lei = lookup.lei.kind === 'done' ? lookup.lei.lei : null
  if (nta.status === 'fixture') {
    const legalName = fictionalName.trim()
    return legalName ? { tNumber, legalName, address: '', fixture: true, lei } : null
  }
  if (nta.status !== 'found' || nta.record.closed) return null
  return { tNumber, legalName: nta.record.name, address: nta.record.address, fixture: false, lei }
}

export function CompanyStep({ onboarding }: { readonly onboarding: Onboarding }) {
  const { query, fictionalName } = onboarding.state.drafts
  const [picked, setPicked] = useState<string | null>(null)
  const lookup = useCompanyLookup(query, picked)
  const company = resolveCompany(lookup, fictionalName)
  const submit = () => {
    if (company) onboarding.confirmCompany(company)
  }
  return (
    <StepFrame
      step={STEP.company}
      title="Which company is joining?"
      lede="Enter its T-number, the qualified invoice number, or paste its LEI. Meigi fills in the rest from the National Tax Agency registry."
      onSubmit={submit}
      actions={
        <StepActions>
          <Button type="submit" size="lg" disabled={!company}>
            Continue
          </Button>
        </StepActions>
      }
    >
      <TextField
        label="T-number or LEI"
        className="input--hero"
        mono
        value={query}
        onChange={(event) => onboarding.setDrafts({ query: event.target.value })}
        placeholder="T8999900000001"
        autoComplete="off"
        spellCheck={false}
        autoFocus={query === ''}
      />
      <EnsPreview digits={lookup.digits} />
      <CompanyRecord
        lookup={lookup}
        fictionalName={fictionalName}
        onFictionalName={(name) => onboarding.setDrafts({ fictionalName: name })}
        onPick={setPicked}
      />
    </StepFrame>
  )
}
