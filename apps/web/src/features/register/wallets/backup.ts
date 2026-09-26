// The one copy of a payout key made in this browser: a JSON file the reader downloads. The key goes from memory
// straight into the file; it is never stored, sent or logged.

import type { Hex } from 'viem'
import type { HexAddress } from '../../../lib/env/env'

export function backupFileName(address: HexAddress): string {
  return `meigi-payout-wallet-${address.slice(2, 8).toLowerCase()}.json`
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

/** Downloads the backup file. Throws if the browser can't make the file at all. */
export function saveBackup(address: HexAddress, privateKey: Hex): void {
  const url = URL.createObjectURL(new Blob([backupJson(address, privateKey)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = backupFileName(address)
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // The download has started by now; the object URL (the only other reference to the key) goes shortly after.
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
}
