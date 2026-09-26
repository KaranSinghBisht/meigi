import { blockUrl, formatJst, formatTokenAmount, shortAddress } from '../../../lib/chain/format'
import { SWAPPED_INVOICE } from '../../../lib/chain/refusal'
import { Badge } from '../../../ui/components/Badge'
import { Button } from '../../../ui/components/Button'
import { Panel } from '../../../ui/components/Panel'
import { RECORDED_BEC } from '../recorded'
import { useLiveRefusal, type RefusalRun } from './useLiveRefusal'
import './live-refusal.css'

/** "Refused by the vault on Sepolia at block N: 株式会社メイギ商事 is paid only at 0x9B4f…47e4", or the recorded run. */
function Result({ run }: { readonly run: RefusalRun }) {
  if (run.kind === 'refused') {
    const { block, legalName, registered } = run.refusal
    return (
      <p className="live-refusal__result" role="status">
        <Badge tone="active">Live</Badge>
        <span>
          Refused by the vault on Sepolia at block{' '}
          <a href={blockUrl(block)} target="_blank" rel="noreferrer">
            {block.toLocaleString('en-US')}
          </a>
          :{' '}
          {legalName ? (
            <span className="nowrap" lang="ja">
              {legalName}
            </span>
          ) : (
            'T2011001234567'
          )}{' '}
          is paid only at <span className="mono">{shortAddress(registered)}</span>
        </span>
      </p>
    )
  }
  if (run.kind === 'recorded') {
    return (
      <p className="live-refusal__result" role="status">
        <Badge tone="neutral">Recorded run</Badge>
        <span>
          Sepolia didn't answer as expected, so this is the run recorded on {formatJst(RECORDED_BEC.recordedAt)}: the
          vault reverted <span className="mono">{RECORDED_BEC.outcome.error.name}</span>, and nothing moved.
        </span>
      </p>
    )
  }
  return null
}

/** For /try: the button and its answer, in the check's status line. */
export function LiveRefusalInline() {
  const { run, start } = useLiveRefusal()
  return (
    <>
      <Button size="sm" variant="ghost" busy={run.kind === 'running'} onClick={() => void start()}>
        {run.kind === 'idle' ? 'Run it live' : 'Run it again'}
      </Button>
      {run.kind === 'idle' ? (
        <span className="try-check__fact">an eth_call on Sepolia: read-only, nothing is sent</span>
      ) : (
        <Result run={run} />
      )}
    </>
  )
}

/** For the public /agent: the scam's address sent to the real vault, live, by anyone. */
export function LiveRefusalPanel() {
  const { run, start } = useLiveRefusal()
  return (
    <Panel title="Ask the vault to pay the scam's address" eyebrow="Live on Sepolia" className="live-refusal">
      <p className="live-refusal__lede">
        Your browser asks the AgentVault to pay ¥{formatTokenAmount(SWAPPED_INVOICE.units)} to the address in the
        bank-change email, <span className="mono">{shortAddress(SWAPPED_INVOICE.payTo)}</span>, as the vault's own
        agent. It is an eth_call with a fresh invoice reference: read-only, with no wallet and no key, so nothing is
        sent.
      </p>
      <div className="live-refusal__run">
        <Button variant="primary" busy={run.kind === 'running'} onClick={() => void start()}>
          {run.kind === 'idle' ? 'Run it live' : 'Run it again'}
        </Button>
        <Result run={run} />
      </div>
    </Panel>
  )
}
