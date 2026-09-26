// Live figures and a live lookup for any page, read from Sepolia in the browser. They also work on the hosted site:
// nothing here needs a service that holds keys.
//
//   import { useVaultBalance, usePaidThisMonth, usePayeeCounts, payeeCountsLabel, useAgentStatus } from '../live'
//
// Each hook answers null (or leaves a field null) while loading or when the chain can't be read: hide the figure
// then, never show a guess. Wording: say "registered payees", never "verified payees".

export { useAgentStatus, useVaultBalance, type AgentStatus, type VaultBalance } from './figures'
export { PayeeLookup } from './PayeeLookup'
export { usePaidThisMonth, type PaidThisMonth } from './usePaidThisMonth'
/** Registered payees by status right now, and the one label every page shows for them. */
export { payeeCountsLabel, usePayeeCounts, type PayeeCounts } from '../landing/status/usePayeeCounts'
