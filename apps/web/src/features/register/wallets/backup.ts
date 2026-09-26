// The one copy of a payout key made in this browser: a JSON file the reader saves. The key goes from memory
// straight into the file; it is never stored, sent or logged.

import type { Hex } from 'viem'
import type { HexAddress } from '../../../lib/env/env'

/** Short enough to read whole on a phone: it is named on screen as one token. */
export function backupFileName(address: HexAddress): string {
  return `meigi-payout-${address.slice(2, 8).toLowerCase()}.json`
}

function backupJson(address: HexAddress, privateKey: Hex): string {
  const backup = {
    kind: 'Meigi payout wallet (testnet demo wallet)',
    warning: 'Anyone with this file controls this address. Testnet only: never send real funds to it.',
    network: 'Ethereum Sepolia testnet (chain id 11155111)',
    address,
    privateKey,
    createdAt: new Date().toISOString(),
  }
  return `${JSON.stringify(backup, null, 2)}\n`
}

interface Writable {
  write(data: string): Promise<void>
  close(): Promise<void>
}

type SavePicker = (options: {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<{ createWritable(): Promise<Writable> }>

/** Chromium's save dialog (File System Access): the one way a page learns that a file was really written. */
function savePicker(): SavePicker | null {
  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker
  return typeof picker === 'function' ? picker.bind(window) : null
}

function downloadWithLink(name: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // The download has started by now; the object URL (the only other reference to the key) goes shortly after.
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

/**
 * `saved`: the save dialog wrote the file. `cancelled`: the reader closed the dialog. `downloaded`: the browser was
 * handed a download, which a page can't confirm (it may be blocked or cancelled), so the reader confirms it.
 */
export type BackupResult = 'saved' | 'cancelled' | 'downloaded'

export async function saveBackup(address: HexAddress, privateKey: Hex): Promise<BackupResult> {
  const name = backupFileName(address)
  const body = backupJson(address, privateKey)
  const picker = savePicker()
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description: 'Wallet backup', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(body)
      await writable.close()
      return 'saved'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // The dialog isn't allowed here (an embedded page, a policy): hand the file over as a download instead.
    }
  }
  downloadWithLink(name, body)
  return 'downloaded'
}
