import type { Kernel } from '../../../lib/api/agentTypes'
import { formatJst, shortAddress } from '../../../lib/chain/format'
import { Badge } from '../../../ui/components/Badge'
import { Column } from './Column'
import { FlagList } from './FlagList'

function Registered({ kernel }: { readonly kernel: Kernel }) {
  const payee = kernel.payee
  if (!payee) return null
  return (
    <p className="col__registered">
      <span className="mono">{payee.tNumber}</span>
      {payee.legalName ? (
        <>
          {' = '}
          <span className="jp" lang="ja">
            {payee.legalName}
          </span>
        </>
      ) : null}
      {payee.registeredPayout ? (
        <>
          {' pays '}
          <span className="mono" title={payee.registeredPayout}>
            {shortAddress(payee.registeredPayout)}
          </span>
        </>
      ) : (
        <span> is not an active payee</span>
      )}
      {payee.changePending ? (
        <span className="col__pending">
          A payout change is queued
          {payee.pendingEffectiveAt ? ` until ${formatJst(new Date(payee.pendingEffectiveAt * 1000))}` : ''}; its
          address isn't shown until it lands.
        </span>
      ) : null}
    </p>
  )
}

export function KernelColumn({ kernel }: { readonly kernel: Kernel }) {
  const checked = kernel.status === 'checked'
  const status = <Badge tone={kernel.ok ? 'active' : 'disputed'}>{kernel.ok ? 'Pay' : 'Hold'}</Badge>
  return (
    <Column
      step={3}
      title="Kernel verdict"
      tag="deterministic, reads the chain"
      tone={kernel.ok ? 'ok' : 'hold'}
      status={status}
    >
      <Registered kernel={kernel} />
      {checked && kernel.checks.length > 0 ? (
        <ul className="checks">
          {kernel.checks.map((check, index) => (
            <li
              key={`${check.code}-${index}`}
              className={check.ok ? 'checks__item is-ok' : `checks__item is-${check.severity}`}
            >
              <span className="checks__mark" aria-hidden="true">
                {check.ok ? '✓' : check.severity === 'warn' ? '!' : '✗'}
              </span>
              <span className="sr-only">{check.ok ? 'Passed: ' : 'Failed: '}</span>
              <span className="checks__msg">
                {check.message}
                {!check.ok && check.revert ? (
                  <span className="checks__revert"> chain reverts {check.revert}</span>
                ) : null}
                {!check.ok && check.evidence ? <q className="flags__evidence">{check.evidence}</q> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <FlagList items={kernel.reasons} />
      )}
    </Column>
  )
}
