// Live figures and a live lookup for any page, read from Sepolia in the browser. They also work on the hosted site:
// nothing here needs the demo machine.
//
//   import { useVaultBalance, usePaidThisMonth, useRegisteredPayeeCount, useAgentStatus, PayeeLookup } from '../live'
//
// Each hook answers null (or leaves a field null) while loading or when the chain can't be read: hide the figure
// then, never show a guess. Wording: say "registered payees", never "verified payees".

export { useAgentStatus, useVaultBalance, type AgentStatus, type VaultBalance } from './figures'
export { PayeeLookup } from './PayeeLookup'
export { usePaidThisMonth, type PaidThisMonth } from './usePaidThisMonth'
/** Registered payees whose status is Active right now (a disputed payee is frozen and drops out). */
export { usePayeeCount as useRegisteredPayeeCount } from '../landing/status/usePayeeCount'
