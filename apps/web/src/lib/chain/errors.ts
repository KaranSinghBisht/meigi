// Turns viem errors (wallet rejections, decoded contract reverts, RPC failures) into short, human messages.
// Raw error text never reaches the UI: it can be long and may echo request data.

import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  TimeoutError,
  UserRejectedRequestError,
} from 'viem'
import { shortAddress } from './format'

export type ChainFailureKind = 'rejected' | 'revert' | 'network' | 'unknown'

export interface ChainFailure {
  readonly kind: ChainFailureKind
  readonly message: string
  readonly errorName?: string
  readonly args?: readonly unknown[]
}

const REVERT_MESSAGES: Record<string, string> = {
  NotController: "Only the payee's controller wallet can submit this change.",
  RotationPending: 'A controller rotation is pending, so payout changes are blocked until it lands or is cancelled.',
  InvalidPayout: 'The new payout must be a non-zero address that differs from the current one.',
  InvalidController: 'The new controller must be a non-zero address that differs from the current one.',
  ApprovalExpired: "The officers' approval has expired. Open a new request.",
  QuorumNotMet: 'Not enough officer approvals for this change.',
  NotAnOfficer: 'An approval came from someone who is not an enrolled officer.',
  NotAttester: 'The approval was not signed by a trusted attester.',
  PayeeNotActive: 'This payee is not active (it is unregistered or disputed).',
  NoPendingChange: 'There is no pending payout change to cancel.',
  NoPendingRotation: 'There is no pending controller rotation to cancel.',
  ECDSAInvalidSignature: 'The approval signature is invalid.',
  ECDSAInvalidSignatureLength: 'The approval signature is malformed.',
  VendorNotApproved: 'The vault owner has not approved this vendor.',
  VendorPayoutChanged: "The registry's payout changed since the vault owner approved this vendor.",
  OverPaymentCap: "The amount exceeds this vendor's per-payment cap.",
  OverPeriodCap: "The amount exceeds this vendor's remaining 30-day cap.",
  InvoiceAlreadyPaid: 'This invoice was already paid.',
}

function revertMessage(errorName: string, args: readonly unknown[]): string {
  if (errorName === 'PayeeMismatch') {
    const [tNumber, expected, registered] = args
    return `The chain refused: T${String(tNumber)} pays ${shortAddress(String(registered))}, not ${shortAddress(String(expected))}.`
  }
  return REVERT_MESSAGES[errorName] ?? `The contract reverted with ${errorName}.`
}

export function describeChainError(error: unknown): ChainFailure {
  if (!(error instanceof BaseError)) {
    return { kind: 'unknown', message: 'Something went wrong talking to the chain.' }
  }
  if (error.walk((e) => e instanceof UserRejectedRequestError)) {
    return { kind: 'rejected', message: 'You declined the request in your wallet.' }
  }
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
  if (revert instanceof ContractFunctionRevertedError) {
    const errorName = revert.data?.errorName ?? revert.reason ?? 'an unknown error'
    const args = revert.data?.args ?? []
    return { kind: 'revert', message: revertMessage(errorName, args), errorName, args }
  }
  if (error.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError)) {
    return { kind: 'network', message: "Couldn't reach the Sepolia RPC. Check the connection and try again." }
  }
  return { kind: 'unknown', message: error.shortMessage || 'The chain request failed.' }
}
