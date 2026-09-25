# Meigi contracts

Payee verification onchain. Each Japanese company's invoice registration number (T-number) is bound to one
payout address. Anything that pays through Meigi can only reach that address.

| Contract | What it does |
|---|---|
| `registry/PayeeRegistry.sol` | T-number → payout address. An attester (the Meigi verifier) registers a company after NTA, domain and World ID checks. Every change that could move money waits out a public timelock (`changeDelay`, 72h in production) and can be cancelled. A second claim freezes the payee as *disputed*; it is never overwritten. |
| `registry/OfficerQuorum.sol` | Attesters, per-company officer sets (World ID 4.0 session ids, hashed) and EIP-712 officer approvals bound to payee + action + target + nonce. |
| `ens/PayeeResolver.sol` | ENSIP-10 wildcard resolver: `t2011001234567.payee.eth` resolves to the active payout. It only answers names directly under its configured parent. Disputed or unknown payees resolve to zero (fail closed), and a disputed payee publishes only its status, never a claimant's name. Text records: `name`, `meigi.tNumber`, `meigi.status`, `meigi.changePending`, `meigi.effectiveAt`, `meigi.registry`. |
| `payments/AgentVault.sol` | The wallet an AI accounts-payable agent spends from. The agent's key can only `payInvoice` an owner-approved vendor, after a vendor delay, within caps, to the payout the owner approved (`approveVendor` takes the reviewed address explicitly), which must also be the registry's current payout. A swapped address reverts `PayeeMismatch`. A registry change reverts `VendorPayoutChanged` until the owner re-approves. |
| `payments/PayRouter.sol` | A stateless "pay by T-number" for any wallet. |
| `token/MockJPYC.sol` | A testnet stand-in for JPYC: 18 decimals, EIP-2612, EIP-3009 with `bytes` and `v,r,s` forms, EOA/7702/1271 signers. Used only if the official Sepolia faucet is dry. |

## Who can change what

| Change | Needs | Waits | Who can cancel |
|---|---|---|---|
| Register a company | attester | — | (a later claim → dispute) |
| Change the payout address | business key **and** officer quorum | `changeDelay` | controller, attester, governance |
| Rotate a lost/stolen business key | officer quorum | `changeDelay` | controller, attester, governance |
| Replace the officer set | business key **and** officer quorum | — (also drops a queued rotation) | — |
| Resolve a dispute with a new winner | governance | `changeDelay`, payee stays frozen | a new claim restarts it |
| Dismiss a dispute (incumbent untouched) | governance | — (nothing moves anywhere new) | — |

- A queued change counts while its attester is trusted, or if it took effect before that attester was revoked. Revocation is permanent: a revoked address can never be re-enabled, so voided changes never come back, and changes that already took effect never flip back.
- Nonces advance on every approval, cancel, dispute and rewrite, so a stale or phished approval can't be replayed later.
- `renounceOwnership` is disabled on the registry and the vault.

## Trust model (hackathon build)

- **Attesters** are trusted to verify World ID proofs off-chain (IDKit v4 session proofs, cloud verification) and to sign officer approvals. On their own they can't change a payout: that also needs the business key, and every change waits out the public timelock. Production would verify World ID on-chain, with the approval's struct hash as the signal, and require k-of-n attesters.
- **Governance** (the owner) manages attesters and resolves disputes, behind the same delay. Production: a multisig behind a timelock. Owner, attester, vault owner, agent and every controller use separate keys.
- **The AI agent** is untrusted by design. Worst case: it overpays approved vendors up to their caps.
- Caps use fixed 30-day windows, so up to 2× `capPerPeriod` can move around a window boundary.

## Develop

```sh
forge build
forge test          # 95 tests, including fuzzing the core guarantee and regression tests for two review rounds
```

Dependencies are git submodules: OpenZeppelin v5.4.0 and forge-std v1.16.2 (see `foundry.lock`).
ABIs for TypeScript consumers are exported to `packages/abi` by `script/export-abi.sh`.
