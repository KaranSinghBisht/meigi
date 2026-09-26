import { useCallback, useEffect, useRef, useState } from 'react'
import type { Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { HexAddress } from '../../../lib/env/env'
import { saveBackup } from './backup'

/**
 * A payout wallet made in this browser. Its key lives only in a ref while this screen is open: it is never
 * rendered, put in state or storage, sent or logged. Downloading the backup is the one way out, and it happens
 * once: the key is dropped from memory the moment the file is handed to the browser.
 */
export function useNewPayoutWallet(onSaved: (address: HexAddress) => void) {
  const key = useRef<Hex | null>(null)
  const [pending, setPending] = useState<HexAddress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => () => {
      key.current = null
    },
    [],
  )

  const create = useCallback(() => {
    const privateKey = generatePrivateKey()
    key.current = privateKey
    setPending(privateKeyToAccount(privateKey).address)
    setError(null)
  }, [])

  const download = useCallback(() => {
    const privateKey = key.current
    if (!privateKey || !pending) return
    try {
      saveBackup(pending, privateKey)
    } catch {
      setError("Your browser couldn't save the file. Allow downloads for this page and try again.")
      return
    }
    key.current = null
    setPending(null)
    onSaved(pending)
  }, [pending, onSaved])

  return { pending, error, create, download }
}
