import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { HexAddress } from '../../../lib/env/env'
import { backupFileName, backupMatches, saveBackup } from './backup'

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

interface Backup {
  readonly key: RefObject<Hex | null>
  readonly unsaved: UnsavedWallet | null
  readonly setUnsaved: (wallet: UnsavedWallet) => void
  readonly setError: (error: string | null) => void
  readonly finish: (address: HexAddress) => void
}

/**
 * Saving the backup, and confirming a plain download by choosing the file back. The key is dropped (`finish`) only
 * once the file is known to exist: the save dialog wrote it, or the chosen file's key derives this address.
 */
function useBackup({ key, unsaved, setUnsaved, setError, finish }: Backup) {
  const [saving, setSaving] = useState(false)
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
      setError("The backup couldn't be written. The key is still here: try again, or pick another folder.")
    } finally {
      setSaving(false)
    }
  }, [key, unsaved, setUnsaved, setError, finish])

  const confirm = useCallback(
    async (file: File) => {
      if (!unsaved?.downloaded || !key.current) return
      setError(null)
      if (await backupMatches(file, unsaved.address)) finish(unsaved.address)
      else setError(`That file isn't this wallet's backup. Choose ${backupFileName(unsaved.address)}.`)
    },
    [key, unsaved, setError, finish],
  )
  return { saving, save, confirm }
}

/**
 * A payout wallet made in this browser. Its key lives only in a ref while the wallets screen is open: it is never
 * rendered, put in state or storage, sent or logged. Saving the backup is the one way out, and it happens once:
 * only when the file is known to exist is the key dropped and the address usable as the payout.
 */
export function useNewPayoutWallet(onSaved: (address: HexAddress) => void) {
  const key = useKeyRef()
  const [unsaved, setUnsaved] = useState<UnsavedWallet | null>(null)
  const [error, setError] = useState<string | null>(null)

  const create = useCallback(() => {
    const privateKey = generatePrivateKey()
    key.current = privateKey
    setUnsaved({ address: privateKeyToAccount(privateKey).address, downloaded: false })
    setError(null)
  }, [key])

  const finish = useCallback(
    (address: HexAddress) => {
      key.current = null
      setUnsaved(null)
      onSaved(address)
    },
    [key, onSaved],
  )

  const backup = useBackup({ key, unsaved, setUnsaved, setError, finish })
  return { unsaved, error, create, ...backup }
}

export type NewPayoutWallet = ReturnType<typeof useNewPayoutWallet>
