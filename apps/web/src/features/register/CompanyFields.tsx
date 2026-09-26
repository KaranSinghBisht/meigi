import { TextField } from '../../ui/components/Field'
import { ControllerField } from './ControllerField'
import { NtaHint } from './NtaHint'
import type { NtaPreview } from './useNtaPreview'
import type { CompanyForm } from './useRegistrationFlow'
import './register.css'

export type FieldErrors = Partial<Record<keyof CompanyForm, string>>

interface CompanyFieldsProps {
  readonly form: CompanyForm
  readonly errors: FieldErrors
  readonly preview: NtaPreview
  readonly onChange: (form: CompanyForm) => void
}

interface IdentityProps {
  readonly form: CompanyForm
  readonly errors: FieldErrors
  readonly preview: NtaPreview
  readonly set: Setter
}

type Setter = (key: keyof CompanyForm) => (value: string) => void

const PLAIN = { autoComplete: 'off', spellCheck: false } as const

/** Who the company is: T-number and the exact NTA name, with the live NTA record between them. */
function IdentityFields({ form, errors, preview, set }: IdentityProps) {
  const fixture = preview.status === 'fixture'
  return (
    <>
      <TextField
        label="T-number"
        mono
        value={form.tNumber}
        onChange={(event) => set('tNumber')(event.target.value)}
        placeholder="T2011001234567"
        error={errors.tNumber}
        {...PLAIN}
      />
      <TextField
        label={fixture ? 'Legal name (fictional company)' : 'Legal name (as registered with the NTA)'}
        lang="ja"
        className="input--jp"
        value={form.legalName}
        onChange={(event) => set('legalName')(event.target.value)}
        placeholder="株式会社メイギ商事"
        error={errors.legalName}
      />
      <div className="span-2">
        <NtaHint preview={preview} legalName={form.legalName} onUseName={set('legalName')} />
      </div>
    </>
  )
}

export function CompanyFields({ form, errors, preview, onChange }: CompanyFieldsProps) {
  const set: Setter = (key) => (value) => onChange({ ...form, [key]: value })
  return (
    <div className="form-grid">
      <IdentityFields form={form} errors={errors} preview={preview} set={set} />
      <TextField
        label="Company domain"
        value={form.domain}
        onChange={(event) => set('domain')(event.target.value)}
        placeholder="meigi-shoji.co.jp"
        hint={
          preview.status === 'fixture'
            ? 'Recorded as given: a fictional company skips the domain proof.'
            : "You'll prove control with a DNS TXT record signed by the controller wallet."
        }
        error={errors.domain}
        {...PLAIN}
      />
      <TextField
        label="Payout address"
        mono
        value={form.payout}
        onChange={(event) => set('payout')(event.target.value)}
        placeholder="0x…"
        hint="The only address payers will be able to pay. Keep it separate from the controller key."
        error={errors.payout}
        {...PLAIN}
      />
      <div className="span-2">
        <ControllerField />
      </div>
    </div>
  )
}
