import { useNavigate, useParams } from 'react-router'
import type { PayeeSnapshot } from '../../lib/chain/registry'
import { parseTNumber } from '../../lib/chain/tNumber'
import { TxLink } from '../../ui/components/Address'
import { Button } from '../../ui/components/Button'
import { ErrorNotice, Notice } from '../../ui/components/Notice'
import { Panel } from '../../ui/components/Panel'
import { Spinner } from '../../ui/components/Spinner'
import { PayeeCard } from '../registry/PayeeCard'
import { StaleNote } from '../registry/StaleNote'
import { TNumberSearch } from '../registry/TNumberSearch'
import { usePayee } from '../registry/usePayee'
import { DemoMachine } from '../../ui/demo/DemoMachine'
import { ServiceGate } from '../../ui/demo/ServiceGate'
import { ActionPicker } from './ActionPicker'
import { Approvals } from './Approvals'
import { approvedPayout, Finalize } from './Finalize'
import { useIntent } from './useIntent'
import '../../ui/layout/layout.css'
import './change.css'

function Flow({ payee, refresh }: { readonly payee: PayeeSnapshot; readonly refresh: () => void }) {
  const flow = useIntent()
  const phase = flow.phase
  const restart = (
    <Button variant="quiet" size="sm" onClick={flow.reset}>
      New request
    </Button>
  )
  if (payee.status !== 'active') {
    return <Notice tone="warn" title="Only active payees can request changes." />
  }
  if (phase.kind === 'none') {
    return (
      <>
        {flow.error ? <ErrorNotice error={flow.error} /> : null}
        <ActionPicker payee={payee} busy={flow.opening} onOpen={(request) => void flow.open(request)} />
      </>
    )
  }
  if (phase.kind === 'executed') {
    return (
      <Notice tone="success" title="Done. The attester executed it on-chain." action={restart}>
        <p>
          Transaction <TxLink hash={phase.txHash} />
        </p>
      </Notice>
    )
  }
  if (phase.kind === 'approved') {
    const newPayout = approvedPayout(phase.payload, flow.request?.newAddress)
    if (!newPayout)
      return <Notice tone="danger" title="The approval doesn't say which address it covers." action={restart} />
    return <Finalize payee={payee} approval={phase.approval} newPayout={newPayout} onQueued={refresh} />
  }
  return (
    <>
      <Approvals flow={flow} />
      <div className="form-actions">{restart}</div>
    </>
  )
}

/** The public site: approvals need the verifier, which checks World ID and signs as the attester. */
function ChangeHosted() {
  return (
    <DemoMachine
      service="verifier"
      what="Approving a change"
      why="it checks each officer's World ID session and signs the approval as the attester"
    >
      <p>
        The registry side is live on the left: a queued change would show its countdown there, and its new address stays
        hidden until it lands.
      </p>
    </DemoMachine>
  )
}

function PayeeAndFlow({ tNumber }: { readonly tNumber: string }) {
  const { state, refresh } = usePayee(tNumber)
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <p className="payee-slot__loading">
        <Spinner /> Reading the registry on Sepolia…
      </p>
    )
  }
  if (state.status === 'error') return <Notice tone="danger" title={state.message} />
  return (
    <div className="change__grid">
      <Panel className="change__payee" aria-label="Current registry state">
        <StaleNote message={state.staleError} readAt={state.payee.readAt} />
        <PayeeCard payee={state.payee} onElapsed={refresh} showChangeLink={false} />
      </Panel>
      <Panel title="Request a change" eyebrow="Business key + the same verified humans" className="change__flow">
        <ServiceGate service="verifier" fallback={<ChangeHosted />}>
          <Flow payee={state.payee} refresh={refresh} />
        </ServiceGate>
      </Panel>
    </div>
  )
}

export default function ChangePage() {
  const params = useParams()
  const navigate = useNavigate()
  const parsed = params.tNumber ? parseTNumber(params.tNumber) : null
  return (
    <div className="change">
      <header className="page-head">
        <p className="eyebrow">Company changes</p>
        <h1 className="page-head__title">Changes need the same humans, in public.</h1>
        <p className="page-head__lede">
          A new payout address needs the business key and a quorum of the officers who enrolled with World ID, then
          waits 72 hours where everyone can see it. A different human is refused.
        </p>
      </header>
      <Panel className="change__search" aria-label="Choose a company">
        <TNumberSearch
          initial={parsed?.display ?? ''}
          submitLabel="Open"
          label="Company T-number"
          onSubmit={(t) => navigate(`/change/${t.display}`)}
        />
      </Panel>
      {parsed ? <PayeeAndFlow key={parsed.display} tNumber={parsed.display} /> : null}
    </div>
  )
}
