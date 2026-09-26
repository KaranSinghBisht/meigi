import { useCallback, useRef, useState } from 'react'
import { parseTNumber } from '../../lib/chain/tNumber'
import { checkWithdrawal, parseDestination, type Destination, type Verdict } from './checkWithdrawal'

export interface WithdrawalInput {
  readonly destination: string
  readonly tNumber: string
}

export type CheckState =
  | { readonly status: 'idle' }
  | { readonly status: 'invalid'; readonly destination: boolean; readonly tNumber: boolean }
  | { readonly status: 'checking' }
  | { readonly status: 'done'; readonly verdict: Verdict; readonly destination: Destination }
  | { readonly status: 'error' }

/** Runs one withdrawal check at a time; a newer check always supersedes one still in flight. */
export function useWithdrawalCheck() {
  const [state, setState] = useState<CheckState>({ status: 'idle' })
  const latest = useRef(0)

  const check = useCallback(async (input: WithdrawalInput) => {
    const request = ++latest.current
    const target = parseTNumber(input.tNumber)
    const destination = parseDestination(input.destination)
    if (!target || !destination) {
      setState({ status: 'invalid', destination: !destination, tNumber: !target })
      return
    }
    setState({ status: 'checking' })
    try {
      const verdict = await checkWithdrawal(target, destination)
      if (request === latest.current) setState({ status: 'done', verdict, destination })
    } catch (error) {
      // Kept out of the page: an RPC error can carry the endpoint's URL. The page says Sepolia wasn't reachable.
      reportError(error)
      if (request === latest.current) setState({ status: 'error' })
    }
  }, [])

  return { state, check }
}
