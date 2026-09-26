import { useCallback, useEffect, useRef, useState } from 'react'
import type { Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { HexAddress } from '../../../lib/env/env'
import { saveBackup } from './backup'

/** A wallet made here whose backup isn't confirmed yet. `downloaded`: handed to the browser, awaiting the reader. */
export interface UnsavedWallet {
  readonly address: HexAddress
  readonly downloaded: boolean
}

/** Where the key lives while the screen is open; cleared when the screen goes. */
function useKeyRef() {
  const key = useRef<Hex | null>(null)
  useEffect(
    () => () => {
      key.current = null
    },
    [],
  )
  return key
}

/**
 * A payout wallet made in this browser. Its key lives only in a ref while the wallets screen is open: it is never
 * rendered, put in state or storage, sent or logged. Saving the backup is the one way out, and it happens once:
 * the key is dropped the moment the file is known to exist (the save dialog wrote it, or the reader confirms the
 * download), and only then does the address become usable as the payout.
 */
export function useNewPayoutWallet(onSaved: (address: HexAddress) => void) {
  const key = useKeyRef()
  const [unsaved, setUnsaved] = useState<UnsavedWallet | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useCallback(() => {
    const privateKey = generatePrivateKey()
    key.current = privateKey
    setUnsaved({ address: privateKeyToAccount(privateKey).address, downloaded: false })
    setError(null)
  }, [])

  const finish = useCallback(
    (address: HexAddress) => {
      key.current = null
      setUnsaved(null)
      onSaved(address)
    },
    [onSaved],
  )

  const save = useCallback(async () => {
    const privateKey = key.current
    if (!privateKey || !unsaved) return
    setSaving(true)
    setError(null)
    try {
      const result = await saveBackup(unsaved.address, privateKey)
      if (result === 'saved') finish(unsaved.address)
      else if (result === 'downloaded') setUnsaved({ ...unsaved, downloaded: true })
    } catch {
      setError("Your browser couldn't save the file. Allow downloads for this page and try again.")
    } finally {
      setSaving(false)
    }
  }, [unsaved, finish])

  const confirm = useCallback(() => {
    if (unsaved?.downloaded && key.current) finish(unsaved.address)
  }, [unsaved, finish])

  return { unsaved, saving, error, create, save, confirm }
}

export type NewPayoutWallet = ReturnType<typeof useNewPayoutWallet>
