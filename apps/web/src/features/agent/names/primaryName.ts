import { normalize } from 'viem/ens'
import { publicClient } from '../../../lib/chain/client'

/** The ENS name the registry itself answers for a T-number's payout: always this payee's active payout. */
export function payeeName(tNumber: string): string {
  return `t${tNumber.replace(/^T/i, '')}.payee.eth`
}

const REGISTRY_NAME = /^t\d{13}\.payee\.eth$/

/**
 * A name any address could set as its primary name, shown only when it can't pass for a registered payee: a
 * `…payee.eth` name that isn't exactly t<13 digits>.payee.eth (say, t2011001234567.payee.eth.attacker.eth) is
 * dropped. A registry name is shown only where the registry vouches for it (see `payeeName`), never from a lookup.
 */
function displayable(name: string): boolean {
  return !/payee\.eth/i.test(name) || REGISTRY_NAME.test(name)
}

/**
 * The address's primary ENS name, but only if that name forward-resolves back to the same address and is already
 * in normal form (ENSIP-15 rejects mixed-script look-alikes). Anything else is null: show the hex instead.
 */
async function verifiedName(address: string): Promise<string | null> {
  const name = await publicClient.getEnsName({ address: address as `0x${string}` })
  if (!name) return null
  let normal: string
  try {
    normal = normalize(name)
  } catch {
    return null
  }
  if (normal !== name || !displayable(name)) return null
  const back = await publicClient.getEnsAddress({ name })
  return back && back.toLowerCase() === address.toLowerCase() ? name : null
}

const cache = new Map<string, Promise<string | null>>()

/** Cached per address for the session; a failed lookup is retried next time instead of being remembered. */
export function primaryName(address: string): Promise<string | null> {
  const key = address.toLowerCase()
  const cached = cache.get(key)
  if (cached) return cached
  const lookup = verifiedName(address).catch((error: unknown) => {
    cache.delete(key)
    reportError(error)
    return null
  })
  cache.set(key, lookup)
  return lookup
}
