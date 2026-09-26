// Why a typed or pasted address can't be used. viem's strict isAddress also checks the EIP-55 checksum of a
// mixed-case address, so a 42-character address with one wrong character fails it. Say that, instead of asking for
// "42 characters" it already has. Advising lowercase would switch the checksum off, so the fix offered is to paste it
// again from its source.

import { isAddress } from 'viem'

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/

export const CHECKSUM_MISMATCH =
  "That address's capitalisation doesn't match its checksum, so it may have a typo. Paste it again from its source."
export const NOT_AN_ADDRESS = 'Enter a 0x address (42 characters).'

/** Null when `input` (trimmed) is a valid address; otherwise the problem to show beside the field. */
export function addressProblem(input: string): string | null {
  const value = input.trim()
  if (isAddress(value)) return null
  return HEX_ADDRESS.test(value) ? CHECKSUM_MISMATCH : NOT_AN_ADDRESS
}
