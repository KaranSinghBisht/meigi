import { useState, type FormEvent } from 'react'
import { Button } from '../../ui/components/Button'
import { TextField } from '../../ui/components/Field'
import { useWithdrawalCheck, type CheckState, type WithdrawalInput } from './useWithdrawalCheck'
import { VerdictView } from './VerdictView'
import './withdrawal-check.css'

/** One tap fills both fields and runs the check. Each answer is read live from Sepolia, never canned. */
const EXAMPLES: readonly { readonly label: string; readonly input: WithdrawalInput }[] = [
  {
    label: "Meigi Shoji's payout",
    input: { destination: '0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4', tNumber: 'T2011001234567' },
  },
  {
    label: 'Bank-change scam address',
    input: { destination: '0xdCa52b5FA181a3307eCa852935BD40e3E0096d5b', tNumber: 'T2011001234567' },
  },
  {
    label: 'Unregistered T-number',
    input: { destination: '0xdCa52b5FA181a3307eCa852935BD40e3E0096d5b', tNumber: 'T7999900000002' },
  },
  {
    label: 'Disputed payee',
    input: { destination: '0x0C1d13e3CC82f3a6e0694D3EDe031595Ce32578D', tNumber: 'T2010401000001' },
  },
]

function Result({ state }: { readonly state: CheckState }) {
  switch (state.status) {
    case 'idle':
    case 'invalid':
      return null
    case 'checking':
      return <p className="withdrawal__note">Reading the registry and ENS on Sepolia…</p>
    case 'error':
      return <p className="withdrawal__note withdrawal__note--error">Couldn&apos;t read Sepolia just now. Try again in a moment.</p>
    case 'done':
      return <VerdictView verdict={state.verdict} destination={state.destination} />
  }
}

/**
 * A live withdrawal check for exchanges and wallets: the destination the customer gave, the T-number they say they
 * are paying, and a release-or-hold verdict from the registry and ENS on Sepolia, decided by the x402 guard's check.
 */
export function WithdrawalCheck() {
  const { state, check } = useWithdrawalCheck()
  const [input, setInput] = useState<WithdrawalInput>({ destination: '', tNumber: '' })
  const invalid = state.status === 'invalid' ? state : null
  const run = (next: WithdrawalInput) => {
    setInput(next)
    void check(next)
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void check(input)
  }
  return (
    <form className="withdrawal" onSubmit={submit} noValidate aria-labelledby="withdrawal-title">
      <div className="withdrawal__head">
        <h3 id="withdrawal-title" className="withdrawal__title">
          Check a withdrawal
        </h3>
        <p className="withdrawal__lede">Live on Sepolia, through the same check the x402 guard runs before an agent signs.</p>
      </div>
      <div className="withdrawal__fields">
        <TextField
          label="Withdrawal destination"
          hint="An address, or a name like t2011001234567.payee.eth"
          mono
          value={input.destination}
          onChange={(event) => setInput({ ...input, destination: event.target.value })}
          error={invalid?.destination ? 'Use a 0x address or an ENS name.' : null}
          autoComplete="off"
          spellCheck={false}
        />
        <TextField
          label="T-number the customer is paying"
          hint="T + 13 digits"
          mono
          value={input.tNumber}
          onChange={(event) => setInput({ ...input, tNumber: event.target.value })}
          error={invalid?.tNumber ? 'Use T followed by 13 digits.' : null}
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
        />
        <Button type="submit" busy={state.status === 'checking'}>
          Check
        </Button>
      </div>
      <div className="withdrawal__examples" role="group" aria-label="Examples">
        <span className="withdrawal__examples-label">Try</span>
        {EXAMPLES.map((example) => (
          <button key={example.label} type="button" className="withdrawal__example" onClick={() => run(example.input)}>
            {example.label}
          </button>
        ))}
      </div>
      <div className="withdrawal__result" aria-live="polite">
        <Result state={state} />
      </div>
    </form>
  )
}
