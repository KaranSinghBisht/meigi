import { useState, type FormEvent } from 'react'
import { isAddress } from 'viem'
import { ApiError } from '../../lib/api/http'
import { explainError, type Explained } from '../../lib/api/messages'
import { createRegistration, type Registration } from '../../lib/api/verifier'
import { parseTNumber } from '../../lib/chain/tNumber'
import { useWallet } from '../../lib/chain/WalletContext'
import type { HexAddress } from '../../lib/env/env'
import { Button } from '../../ui/components/Button'
import { ErrorNotice, Notice } from '../../ui/components/Notice'
import { CompanyFields, type FieldErrors } from './CompanyFields'
import type { CompanyForm } from './useRegistrationFlow'
import './register.css'

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

function validate(form: CompanyForm): FieldErrors {
  const errors: FieldErrors = {}
  if (!parseTNumber(form.tNumber)) errors.tNumber = 'Use "T" followed by 13 digits.'
  if (!form.legalName.trim()) errors.legalName = 'Enter the legal name exactly as the NTA lists it.'
  if (!DOMAIN_RE.test(form.domain.trim().toLowerCase())) errors.domain = 'Enter a public domain, like example.co.jp.'
  if (!isAddress(form.payout.trim())) errors.payout = 'Enter a 0x address (42 characters).'
  return errors
}

interface Failure {
  readonly explained: Explained
  /** On a name mismatch the verifier returns the exact NTA-registered name. */
  readonly registered: string | null
}

type Created = (registration: Registration, tNumber: string, controller: HexAddress) => void

function useCreateRegistration(form: CompanyForm, onCreated: Created) {
  const wallet = useWallet()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = validate(form)
    setErrors(found)
    const tNumber = parseTNumber(form.tNumber)
    if (Object.keys(found).length > 0 || !tNumber) return
    const controller = wallet.account ?? (await wallet.connect())
    if (!controller) return
    setBusy(true)
    setFailure(null)
    try {
      const legalName = form.legalName.trim()
      const domain = form.domain.trim().toLowerCase()
      const payout = form.payout.trim() as HexAddress
      const registration = await createRegistration({ tNumber: tNumber.display, legalName, domain, controller, payout })
      onCreated(registration, tNumber.display, controller)
    } catch (error) {
      const registered = error instanceof ApiError ? error.details.registered : null
      setFailure({
        explained: explainError(error, 'verifier'),
        registered: typeof registered === 'string' ? registered : null,
      })
    } finally {
      setBusy(false)
    }
  }
  return { errors, busy, failure, submit }
}

interface CompanyStepProps {
  readonly form: CompanyForm
  readonly onFormChange: (form: CompanyForm) => void
  readonly onCreated: Created
}

export function CompanyStep({ form, onFormChange, onCreated }: CompanyStepProps) {
  const { errors, busy, failure, submit } = useCreateRegistration(form, onCreated)
  const applyName = (name: string) => onFormChange({ ...form, legalName: name })
  const registered = failure?.registered ?? null
  return (
    <form className="step" onSubmit={(event) => void submit(event)} noValidate>
      <CompanyFields form={form} errors={errors} onChange={onFormChange} />
      {failure ? <ErrorNotice error={failure.explained} /> : null}
      {registered ? (
        <Notice
          tone="info"
          title="Did you mean:"
          action={
            <Button size="sm" variant="ghost" onClick={() => applyName(registered)}>
              Use this name
            </Button>
          }
        >
          <p className="jp register__nta-name" lang="ja">
            {registered}
          </p>
        </Notice>
      ) : null}
      <div className="form-actions">
        <Button type="submit" size="lg" busy={busy}>
          Check with the NTA
        </Button>
      </div>
    </form>
  )
}
