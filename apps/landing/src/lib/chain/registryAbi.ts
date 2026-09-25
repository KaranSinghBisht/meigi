import { parseAbi } from 'viem'

// Subset of the Meigi PayeeRegistry ABI that the landing page reads. The
// struct mirrors IPayeeRegistry.PayeeView field for field; decoding depends
// on the order, so keep it in sync with contracts/src/registry.
export const registryAbi = parseAbi([
  'struct PayeeView { string legalName; address controller; address payout; address pending; uint64 effectiveAt; address nextController; uint64 controllerEffectiveAt; uint64 nonce; uint8 threshold; uint8 status; bytes32 evidence; }',
  'function payeeOf(uint64 tNumber) view returns (PayeeView)',
  'event PayeeRegistered(uint64 indexed tNumber, address indexed controller, address payout, string legalName, bytes32 evidence)',
])

export const PAYEE_STATUS = {
  none: 0,
  active: 1,
  disputed: 2,
} as const
