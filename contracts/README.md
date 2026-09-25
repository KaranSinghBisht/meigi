# Meigi contracts

Payee verification onchain. Each Japanese company's invoice registration number (T-number) is bound to one
payout address. Anything that pays through Meigi can only reach that address.

| Contract | What it does |
|---|---|
| `registry/PayeeRegistry.sol` | T-number → payout address. An attester (the Meigi verifier) registers companies after NTA, domain and World ID checks. A payout change needs the business key **and** a quorum of the company's enrolled World ID officers (same human ⇒ same nullifier). It then waits out a public timelock (72h in production). The controller, an attester or governance can cancel it. A second claim freezes the payee as *disputed*; it is never overwritten. |
| `ens/PayeeResolver.sol` | ENSIP-10 wildcard resolver: `t2011001234567.payee.eth` resolves to the active payout. Disputed or unknown payees resolve to zero (fail closed). Text records: `name`, `meigi.tNumber`, `meigi.status`, `meigi.pending`, `meigi.effectiveAt`, `meigi.registry`. |
| `payments/AgentVault.sol` | The wallet an AI accounts-payable agent spends from. The agent's key can only `payInvoice` an owner-approved vendor, after a vendor delay, within per-payment and 30-day caps, to the registry's active address. A swapped address reverts with `PayeeMismatch`. |
| `payments/PayRouter.sol` | A stateless "pay by T-number" for any wallet. |
| `token/MockJPYC.sol` | A testnet stand-in for JPYC (18 decimals, EIP-2612, EIP-3009 incl. EIP-1271). Used only if the official Sepolia faucet is dry. |

## Trust model (hackathon build)

- **Attesters** are trusted to verify World ID proofs off-chain (IDKit v4 cloud verification) and to sign officer approvals. They can't move money on their own: a payout change also needs the controller's key and the timelock.
- **Governance** (the owner) manages attesters and resolves disputes. In production this would be a multisig behind a timelock.
- **The AI agent** is untrusted by design. The vault gives it no call that can reach an unregistered address.

## Develop

```sh
forge build
forge test          # 67 tests, including fuzzing the core guarantee
```

Dependencies are git submodules: OpenZeppelin v5.4.0 and forge-std v1.16.2 (see `foundry.lock`).
