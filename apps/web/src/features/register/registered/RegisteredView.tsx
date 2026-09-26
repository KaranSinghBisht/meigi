import { TxLink } from '../../../ui/components/Address'
import { Button } from '../../../ui/components/Button'
import { Notice } from '../../../ui/components/Notice'
import { Spinner } from '../../../ui/components/Spinner'
import type { HexAddress } from '../../../lib/env/env'
import { PayeeCard } from './PayeeCard'
import { useEnsResolves } from './useEnsResolves'
import './registered.css'

function EnsCheck({ ens, payout }: { readonly ens: string; readonly payout: HexAddress }) {
  const { state, retry } = useEnsResolves(ens, payout)
  if (state.status === 'match') {
    return (
      <p className="ens-check" role="status">
        <span className="ens-check__ok">
          <span aria-hidden="true">✓</span> Resolves in any ENS client
        </span>
        <span className="ens-check__detail">Checked live on Sepolia with a stock ENS lookup.</span>
      </p>
    )
  }
  if (state.status === 'checking' || state.status === 'pending') {
    return (
      <p className="ens-check" role="status">
        <Spinner /> {state.status === 'checking' ? 'Resolving it through ENS…' : 'Waiting for the next block to resolve…'}
      </p>
    )
  }
  const title =
    state.status === 'other'
      ? 'ENS answers with a different address.'
      : state.status === 'timeout'
        ? "ENS doesn't answer for this name yet."
        : "Couldn't reach Sepolia to check."
  return (
    <Notice tone="warn" title={title} action={<Button size="sm" variant="ghost" onClick={retry}>Check again</Button>} />
  )
}

interface RegisteredViewProps {
  readonly legalName: string
  readonly tNumber: string
  readonly ens: string
  readonly payout: HexAddress
  readonly fixture: boolean
  readonly txHash: `0x${string}`
}

/**
 * The registered payee as payers will meet it: the card, the live ENS check (a real chain read, in the live wizard
 * and in the hosted replay alike) and the registration's transaction.
 */
export function RegisteredView({ legalName, tNumber, ens, payout, fixture, txHash }: RegisteredViewProps) {
  return (
    <>
      <PayeeCard legalName={legalName} tNumber={tNumber} ens={ens} payout={payout} fixture={fixture} />
      <EnsCheck ens={ens} payout={payout} />
      <p className="registered-tx">
        Registered on Sepolia in <TxLink hash={txHash} />
      </p>
    </>
  )
}
