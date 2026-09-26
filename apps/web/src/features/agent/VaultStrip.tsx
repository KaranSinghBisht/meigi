import { useEffect, useState } from 'react'
import { describeChainError } from '../../lib/chain/errors'
import { formatJst, shortAddress } from '../../lib/chain/format'
import { FIXTURE_T_NUMBER, parseTNumber } from '../../lib/chain/tNumber'
import { readVault, type VaultState } from '../../lib/chain/vault'
import { env } from '../../lib/env/env'
import { Address } from '../../ui/components/Address'
import { useEnsCheck, usePayee, type EnsCheck } from '../registry/usePayee'
import './agent.css'

type Load = { kind: 'loading' } | { kind: 'ready'; vault: VaultState } | { kind: 'error'; message: string }

const FIXTURE = parseTNumber(FIXTURE_T_NUMBER)

/** The agent's own ENS name (ENSv2, under meigi.eth); it should resolve to this vault in any ENS client. */
const AGENT_ENS_NAME = 'ap.meigi.eth'

const ENS_NOTES: Record<EnsCheck, { text: string; tone: 'ok' | 'muted' | 'bad' }> = {
  checking: { text: 'checking…', tone: 'muted' },
  match: { text: '✓ resolves to this vault', tone: 'ok' },
  none: { text: 'not resolving yet', tone: 'muted' },
  other: { text: 'resolves to a different address', tone: 'bad' },
  error: { text: 'lookup failed', tone: 'muted' },
}

/** "ENS: ap.meigi.eth ✓ resolves to this vault", read live through ENS (viem getEnsAddress), like the payee check. */
function VaultEns() {
  const note = ENS_NOTES[useEnsCheck(AGENT_ENS_NAME, env.vault)]
  return (
    <span className="vault__item">
      <span className="vault__label">ENS</span> <span className="mono">{AGENT_ENS_NAME}</span>{' '}
      <span className={`vault__ens vault__ens--${note.tone}`}>{note.text}</span>
    </span>
  )
}

/** What the agent can spend and whom it may pay, read live from the vault on Sepolia. */
/** `version` changes after each payment attempt, so the balance and caps are read again. */
export function VaultStrip({ version }: { readonly version: number }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const { state: payee } = usePayee(FIXTURE_T_NUMBER)
  // Empty unless the vendor is active: a disputed payee's name is withheld, so the T-number is shown instead.
  const vendorName = payee.status === 'ready' ? payee.payee.legalName || null : null
  useEffect(() => {
    if (!FIXTURE) return
    let live = true
    readVault(FIXTURE.value).then(
      (vault) => live && setLoad({ kind: 'ready', vault }),
      (error: unknown) => live && setLoad({ kind: 'error', message: describeChainError(error).message }),
    )
    return () => {
      live = false
    }
  }, [version])

  return (
    <div className="vault" aria-live="polite">
      <span className="vault__item">
        <span className="vault__label">AgentVault</span> <Address value={env.vault} short />
      </span>
      <VaultEns />
      {load.kind === 'loading' ? <span className="vault__item muted">reading Sepolia…</span> : null}
      {load.kind === 'error' ? <span className="vault__item muted">{load.message}</span> : null}
      {load.kind === 'ready' ? <VaultFacts vault={load.vault} vendorName={vendorName} /> : null}
    </div>
  )
}

function VaultFacts({ vault, vendorName }: { readonly vault: VaultState; readonly vendorName: string | null }) {
  const vendor = vault.vendor
  return (
    <>
      <span className="vault__item">
        <span className="vault__label">holds</span>{' '}
        <strong>
          {vault.balance} {vault.symbol}
        </strong>
      </span>
      {vault.paused ? <span className="vault__item vault__paused">paused by the owner</span> : null}
      <span className="vault__item">
        <span className="vault__label">approved vendor</span>{' '}
        {vendor.approved && vendor.payout ? (
          <>
            <span className="jp" lang="ja">
              {vendorName ?? FIXTURE_T_NUMBER}
            </span>{' '}
            → <span className="mono">{shortAddress(vendor.payout)}</span>, up to {vendor.capPerPayment} {vault.symbol} a
            payment
            {!vendor.active && vendor.activeAt ? (
              <span className="vault__pending"> · payments open {formatJst(vendor.activeAt)}</span>
            ) : null}
          </>
        ) : (
          <span className="muted">{FIXTURE_T_NUMBER} is not approved in this vault</span>
        )}
      </span>
    </>
  )
}
