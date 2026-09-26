// The one copy of a payout key made in this browser: a JSON file the reader saves. The key goes from memory
// straight into the file; it is never stored, sent or logged.

import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
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
  abort(): Promise<void>
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

/** Writes the file the reader picked; a failed write is aborted and thrown, so the key is kept and it can be retried. */
async function writeFile(handle: { createWritable(): Promise<Writable> }, body: string): Promise<void> {
  const writable = await handle.createWritable()
  try {
    await writable.write(body)
    await writable.close()
  } catch (error) {
    // Discard the half-written file. If aborting fails too, the write error is still the one to report.
    await writable.abort().catch(() => undefined)
    throw error
  }
}

/** Throws when the file couldn't be written; the caller keeps the key and says so. */
export async function saveBackup(address: HexAddress, privateKey: Hex): Promise<BackupResult> {
  const name = backupFileName(address)
  const body = backupJson(address, privateKey)
  const picker = savePicker()
  if (!picker) {
    downloadWithLink(name, body)
    return 'downloaded'
  }
  let handle: { createWritable(): Promise<Writable> }
  try {
    handle = await picker({
      suggestedName: name,
      types: [{ description: 'Wallet backup', accept: { 'application/json': ['.json'] } }],
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    // The dialog can't open here (an embedded page, a policy): hand the file over as a download instead.
    downloadWithLink(name, body)
    return 'downloaded'
  }
  await writeFile(handle, body)
  return 'saved'
}

/** A backup is a few hundred bytes; anything much bigger isn't one, and isn't read. */
const MAX_BACKUP_BYTES = 16_384

/**
 * True when `file` is the backup of `address`: the key inside derives that address. It confirms a plain download
 * landed, which the page itself can't see. The key read here goes out of scope at once and is never kept.
 */
export async function backupMatches(file: File, address: HexAddress): Promise<boolean> {
  if (file.size > MAX_BACKUP_BYTES) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return false // Not JSON: not a backup.
  }
  const privateKey = typeof parsed === 'object' && parsed !== null ? (parsed as { privateKey?: unknown }).privateKey : null
  if (typeof privateKey !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) return false
  return privateKeyToAccount(privateKey as Hex).address === address
}
