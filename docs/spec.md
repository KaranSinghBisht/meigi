# Meigi (名義): spec

**Payee verification for stablecoin and x402 payments. Pay companies, not addresses.**

Built at ETHGlobal Tokyo 2026 (From Scratch) by Karan Singh Bisht and Adithya Prasanna Suriya Prakash.

## Problem

Stablecoin payments, especially ones made by AI agents, go to an address. Nothing checks that the address
belongs to the company the payer thinks it's paying.
- A fake "our bank details changed" invoice (business email compromise, BEC) redirects the payment.
- So does a prompt injection hidden in an invoice, or a swapped `payTo` in an x402 402-response.

Banks solved this for wires with Confirmation of Payee (UK since 2020; mandatory Verification of Payee in the
EU since 2025-10-09). Stablecoins have nothing like it.

## Idea

Every Japanese business that issues qualified invoices already has a public, government-issued identifier:
its **T-number** ("T" + 13-digit corporate number). Meigi binds each T-number to **one payout address**:
- registered only after verification;
- changed only by the company's same verified humans, after a public timelock;
- enforced on-chain at payment time.

An AI agent can be fooled into wanting to pay the wrong address. It still can't: the chain refuses.

## Components

| Layer | What | Where |
|---|---|---|
| Registry | T-number → payout. Registration by an attester. Changes need the business key + a World ID officer quorum, then 72h in public, cancellable. A second claim → dispute (frozen), never overwrite. | `contracts/src/registry` |
| ENS | `t<13 digits>.payee.eth` resolves through an ENSIP-10 wildcard resolver to the active payout only; disputed/unknown resolve to zero. | `contracts/src/ens` |
| Enforcement | `AgentVault`: the agent key can only pay approved vendors, within caps, to the pinned registered payout. `PayRouter`: pay-by-T-number for any wallet. | `contracts/src/payments` |
| Verifier | NTA exact-match (1.34M Tokyo corporations from the public bulk data), Keybase-style DNS proof, World ID 4.0 officer sessions, EIP-712 approvals whose World ID signal pins the exact change. | `services/verifier` |
| AP agent | Invoice → deterministic extraction → System-1 triage (Jev / our fine-tuned Kev) → deterministic kernel → Intercepta screening → pay or hold, with an LLM-written explanation. Only the kernel can move money. | `services/agent` |
| x402 guard | Before an agent signs an x402 payment, compare `payTo` to the registry and screen it. | `packages/x402-guard` |
| Benchmark | PayeeBench-JA: calibrated System-1 triage for payment-redirection attempts; fine-tuned on a MacBook (MPS). | `bench/` |

## Security model

See `contracts/README.md` ("Who can change what" and "Trust model"). In short:
- the agent is untrusted by design;
- attesters are trusted to verify World ID off-chain, but can't move money on their own;
- governance acts behind the same timelock;
- every money-moving change is public for 72h and cancellable.

An independent security review found 11 issues. All were fixed, with regression tests
(`contracts/test/registry/PayeeRegistryRecovery.t.sol`).

## Demo

1. "This is our AI accountant. It holds JPYC and pays our suppliers. Please try to rob it."
2. A judge writes a fake invoice or a bank-change email, or hides a prompt injection. The agent's LLM agrees
   to pay; the vault reverts `PayeeMismatch` and names the real company.
3. Redirecting money properly: the business key + the same World ID human + 72h public timelock. A different
   human is denied.
4. x402: a merchant whose server was compromised to swap `payTo` gets refused before signing.
