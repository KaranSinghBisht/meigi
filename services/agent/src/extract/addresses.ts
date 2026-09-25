import { getAddress, isAddress, type Address } from "viem";

// 40 hex digits, not part of a longer hex string (so transaction hashes never match).
const ADDRESS = /(?<![0-9A-Za-z])0x[0-9a-fA-F]{40}(?![0-9A-Za-z])/gu;

export interface AddressScan {
  addresses: Address[]; // checksummed, distinct, in document order
  firstIndex: Map<Address, number>;
  badChecksum: string[]; // mixed-case spellings whose EIP-55 checksum is wrong (typo or tampering)
  lookalikes: [Address, Address][];
}

export function scanAddresses(text: string): AddressScan {
  const addresses: Address[] = [];
  const firstIndex = new Map<Address, number>();
  const badChecksum: string[] = [];
  for (const match of text.matchAll(ADDRESS)) {
    const spelled = match[0];
    if (!hasValidChecksum(spelled)) badChecksum.push(spelled);
    const address = getAddress(spelled.toLowerCase());
    if (!firstIndex.has(address)) {
      firstIndex.set(address, match.index ?? 0);
      addresses.push(address);
    }
  }
  return { addresses, firstIndex, badChecksum, lookalikes: lookalikePairs(addresses) };
}

/**
 * Address-poisoning lookalikes: two different addresses that agree on the characters people actually
 * compare (the first few and the last few hex digits).
 */
export function areLookalikes(a: Address, b: Address): boolean {
  const x = a.slice(2).toLowerCase();
  const y = b.slice(2).toLowerCase();
  if (x === y) return false;
  const prefix = commonPrefix(x, y);
  const suffix = commonPrefix([...x].reverse().join(""), [...y].reverse().join(""));
  return (prefix >= 4 && suffix >= 2) || (prefix >= 2 && suffix >= 4);
}

/** All-lowercase and all-uppercase spellings carry no checksum; mixed case must match EIP-55. */
function hasValidChecksum(spelled: string): boolean {
  const hex = spelled.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return true;
  return isAddress(spelled, { strict: true });
}

function lookalikePairs(addresses: Address[]): [Address, Address][] {
  const pairs: [Address, Address][] = [];
  for (let i = 0; i < addresses.length; i++) {
    for (let j = i + 1; j < addresses.length; j++) {
      if (areLookalikes(addresses[i]!, addresses[j]!)) pairs.push([addresses[i]!, addresses[j]!]);
    }
  }
  return pairs;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}
