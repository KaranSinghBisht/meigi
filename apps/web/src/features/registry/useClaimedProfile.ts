import { useEffect, useState } from 'react'
import { normalize } from 'viem/ens'
import { publicClient } from '../../lib/chain/client'

/**
 * The resolver a company switches its t<digits>.payee.eth name to when it claims it: it still answers the payout
 * from the registry, and adds the company's own profile texts.
 */
const CLAIMS_RESOLVER = '0xe4679507c08c61be0328edc72c91d62bd6f03ebd'

/** Long texts are the company's own words, so they are cut rather than trusted to fit. */
const MAX_TEXT = 280

export interface ClaimedProfile {
  /** Only an https: address is ever linked. */
  readonly url: string | null
  readonly description: string | null
}

function clip(text: string | null): string | null {
  if (!text) return null
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text
}

async function readProfile(ensName: string): Promise<ClaimedProfile | null> {
  const name = normalize(ensName)
  const [resolver, url, description] = await Promise.all([
    publicClient.getEnsResolver({ name }),
    publicClient.getEnsText({ name, key: 'url' }),
    publicClient.getEnsText({ name, key: 'description' }),
  ])
  if (resolver.toLowerCase() !== CLAIMS_RESOLVER) return null
  return { url: url && /^https:\/\/\S+$/.test(url) ? clip(url) : null, description: clip(description) }
}

/**
 * The company's own profile, read through ENS, when it has claimed its name. Only for an active payee: a disputed
 * or unknown T-number shows its status and nothing a claimant wrote. The payout never comes from here.
 */
export function useClaimedProfile(ensName: string, active: boolean): ClaimedProfile | null {
  const [profile, setProfile] = useState<ClaimedProfile | null>(null)
  useEffect(() => {
    setProfile(null)
    if (!active) return
    let live = true
    readProfile(ensName).then(
      (next) => live && setProfile(next),
      (error: unknown) => {
        // A failed profile read leaves the card as it was; the registry facts don't depend on it.
        reportError(error)
      },
    )
    return () => {
      live = false
    }
  }, [ensName, active])
  return profile
}
