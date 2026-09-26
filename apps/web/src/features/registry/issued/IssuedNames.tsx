import { useMemo } from 'react'
import { isAddressEqual } from 'viem'
import { formatJst } from '../../../lib/chain/format'
import type { IssuedName, VaultAgent } from '../../../lib/chain/names'
import { parseTNumber, type ParsedTNumber } from '../../../lib/chain/tNumber'
import { Address } from '../../../ui/components/Address'
import { Badge } from '../../../ui/components/Badge'
import { Panel } from '../../../ui/components/Panel'
import { useIssuedNames } from './useIssuedNames'
import './issued.css'

const WITHHELD =
  'Withheld: it answers nothing while the payee is disputed, after the key that issued it is rotated, or while Meigi blocks or freezes it.'

/** The vault pays through this name only when its agent is a MandateGate for exactly this company and label. */
function isMandate(agent: VaultAgent | null, tNumber: ParsedTNumber, name: IssuedName): boolean {
  return agent?.kind === 'mandate' && agent.principal === tNumber.value && agent.label === name.label
}

function State({ name }: { readonly name: IssuedName }) {
  if (name.answers) return <Badge tone="info">{name.nameClass ?? 'No class'}</Badge>
  return name.holder ? <Badge tone="pending">Withheld</Badge> : <Badge>Revoked or expired</Badge>
}

function Row({
  name,
  agent,
  tNumber,
}: {
  readonly name: IssuedName
  readonly agent: VaultAgent | null
  readonly tNumber: ParsedTNumber
}) {
  const agentKey = agent?.kind === 'key' && name.holder !== null && isAddressEqual(agent.address, name.holder)
  return (
    <li className="issued__row">
      <p className="issued__name mono">{name.name}</p>
      <p className="issued__facts">
        <State name={name} />
        {name.holder ? (
          <span>
            held by <Address value={name.holder} short />
            {agentKey ? ", the vault's agent key" : null}
          </span>
        ) : null}
        {name.holder && name.expiry ? <span>until {formatJst(name.expiry)}</span> : null}
        {name.agentStatus ? <span>status: {name.agentStatus}</span> : null}
      </p>
      {name.answers && name.description ? <p className="issued__text">{name.description}</p> : null}
      {!name.answers && name.holder ? <p className="issued__text">{WITHHELD}</p> : null}
      {isMandate(agent, tNumber, name) ? (
        <p className="issued__mandate">
          The vault pays only while this name answers. Revoke it and the agent can't pay.
        </p>
      ) : null}
    </li>
  )
}

/**
 * Names issued by this company under its payee name (ENS, through CompanyNamespace), read live. Hidden when it has
 * issued none, and while they load. Each is text-only: it has no address, so it can never be paid.
 */
export function IssuedNames({ tNumber }: { readonly tNumber: string }) {
  const parsed = useMemo(() => parseTNumber(tNumber), [tNumber]) // one object per T-number, so the read runs once
  if (!parsed) return null
  return <IssuedNamesOf tNumber={parsed} />
}

function IssuedNamesOf({ tNumber }: { readonly tNumber: ParsedTNumber }) {
  const state = useIssuedNames(tNumber)
  if (state.kind !== 'ready' || state.names.length === 0) return null
  return (
    <Panel title="Names issued by this company" eyebrow="ENS · text only" className="issued">
      <p className="issued__lede">
        Text-only: an issued name has no address, so it can never be paid. Who the company is comes from its payee name,{' '}
        <span className="mono">{tNumber.ens}</span>. The descriptions are the company's own words.
      </p>
      <ul className="issued__list cells">
        {state.names.map((name) => (
          <Row key={name.label} name={name} agent={state.agent} tNumber={tNumber} />
        ))}
      </ul>
    </Panel>
  )
}
