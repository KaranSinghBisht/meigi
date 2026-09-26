import { useEffect, useState } from 'react'
import { readPayee } from '../../lib/chain/registry'
import { parseTNumber } from '../../lib/chain/tNumber'
import type { WithdrawalInput } from './useWithdrawalCheck'

/**
 * The payee whose live onboarding (a real World ID run) ends by queuing a 72-hour payout change and leaving it
 * pending. Change this one constant to point the example somewhere else.
 */
export const PENDING_EXAMPLE = 'T7999900000002'

/**
 * The "change pending" example, only while the registry actually reports a queued change for PENDING_EXAMPLE: the
 * destination is its current registered payout, which the check then holds. Null otherwise, so the chip stays away
 * until the chain says so, and a failed read hides it too.
 */
export function usePendingExample(): WithdrawalInput | null {
  const [example, setExample] = useState<WithdrawalInput | null>(null)
  useEffect(() => {
    const target = parseTNumber(PENDING_EXAMPLE)
    if (!target) return
    let cancelled = false
    readPayee(target)
      .then(({ status, payout, payoutChangeLandsAt }) => {
        if (cancelled || status !== 'active' || !payout || !payoutChangeLandsAt) return
        setExample({ destination: payout, tNumber: target.display })
      })
      .catch((error: unknown) => reportError(error))
    return () => {
      cancelled = true
    }
  }, [])
  return example
}
