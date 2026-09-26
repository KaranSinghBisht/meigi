# ENS in Meigi

Meigi uses two ENSv2 namespaces on Sepolia (the ENSv2 Beta, which viem and ethers resolve by default):

- **`payee.eth`** names companies: `t<T-number>.payee.eth`. The T-number is the public number a Japanese company
  prints on its invoices.
- **`meigi.eth`** names agents: `ap.meigi.eth` is our accounts-payable agent.

A name is how a company or an agent is identified. The keys and payout addresses behind it can change, and
anyone can check what it points to without trusting our app.

## Companies: `payee.eth`

**Names come from the registry.**
- Nobody registers `t2011001234567.payee.eth`.
- [`PayeeResolver`](../contracts/src/ens/PayeeResolver.sol) is an ENSIP-10 wildcard resolver on `payee.eth`, and it
  answers every `t<13 digits>.payee.eth` from [`PayeeRegistry`](../contracts/src/registry/PayeeRegistry.sol) at
  lookup time.
- Every registered company has a name from the moment it registers, and nothing is minted.

**The name can't be squatted in ENS.**
- The name resolves only to the payout the registry holds for that T-number.
- An unknown number resolves to nothing, and so does a number with a pending dispute.
- Registering the number is the only way to get an answer, and the registry decides who can.

**The name follows a payout change, after the timelock.**
- A payout change needs the company's business key and an officer quorum, then waits 72 hours in public.
- The name keeps resolving to the old payout until the change lands, and switches exactly when it does.
- A dispute cancels a queued change.

**A claim adds a profile, never an address.**
- A company can claim its name as an ENSv2 token, to publish a description, a url and an avatar.
- The token lives in a UserRegistry that is `payee.eth`'s subregistry, and it carries no roles.
- Its resolver, [`ClaimedPayeeResolver`](../contracts/src/ens/ClaimedPayeeResolver.sol), takes `addr` (every coin
  type), `name` and `meigi.*` from the registry.
- The company holds only `ROLE_SET_TEXT` on its own profile resolver, and no account holds the address role there.
- The profile shows only while the registry lists the company as active under the key that claimed it.

**Payout wallets carry their company's name.**
- A payout wallet can take its payee's name as its primary name (ENSIP-19), so a wallet shows the company's name
  next to the address.
- The name must round-trip, so it stops showing if the registry moves the payout elsewhere.

## Agents: `meigi.eth`

**`ap.meigi.eth` is the agent's identity.**
- It is a token in a UserRegistry under `meigi.eth`, with its own ENSv2 PermissionedResolver.
- It resolves to the [AgentVault](../contracts/src/payments/AgentVault.sol).
- It carries a profile (name, description, url, avatar) and the ENSIP-26 records `agent-context`,
  `agent-endpoint[web]` and `agent-status`.

**The agent's key is scoped with Enhanced Access Control.**
- The key holds one role: `ROLE_SET_TEXT` on `agent-status`.
- Writing any other record, or the address, reverts `EACUnauthorizedAccountRoles`.

**The key can rotate while the name stays the same.**
- `ens.sh agent-rotate` moves the agent's one role, and the vault's agent slot, to a new key.
- On a Sepolia fork of the live name and vault, stock viem resolves `ap.meigi.eth` and the vault's primary name the
  same before and after. The old key is refused.
- We haven't run the rotation on Sepolia, because the live agent keeps its key for the demo.

**The vault's primary name is `ap.meigi.eth`**, so wallets show the agent's name instead of `0x87A7…793B`.

## Payments check ENS

- The x402 guard resolves a merchant's declared `t….payee.eth` with stock viem before the buyer signs.
- It refuses unless ENS, the registry and the payment's `payTo` all agree
  ([`check.ts`](../packages/x402-guard/src/check.ts), [tests](../packages/x402-guard/test/ens.test.ts)).
- A compromised merchant server can change `payTo`. It can't change the company's registry entry or its name.

## Evidence

Live on Sepolia. ENS app: [app.ens.dev](https://app.ens.dev). Explorer: [explorer.ens.dev](https://explorer.ens.dev).

| Claim | Evidence |
|---|---|
| `payee.eth` uses our wildcard resolver, plus a subregistry for claimed names | [explorer: payee.eth](https://explorer.ens.dev/payee.eth) · [PayeeResolver `0x096e…4A1e`](https://repo.sourcify.dev/11155111/0x096ebC07eE87fbb19FF920a5c81b2Ad5c9104A1e) (Sourcify) · claims registry [`0xcA03…D0B6`](https://sepolia.etherscan.io/address/0xcA0317C97C0f915faaD6D8F354110eA98bDeD0B6), attached in [`0xa878…22cd`](https://sepolia.etherscan.io/tx/0xa878ef9d35324c42ded75c30a68a115fefaf17c610f9f4aa10f404e34f5a22cd) |
| Every registered number resolves with no configuration | `(cd apps/landing && RPC_URL=https://ethereum-sepolia-rpc.publicnode.com node --input-type=module) < contracts/script/ens/check-viem.mjs` (stock viem; ethers 6 `resolveName` agrees) |
| Unknown and disputed numbers resolve to nothing | [`test_addr_failsClosed`](../contracts/test/ens/PayeeResolver.t.sol), [`test_text_disputedPayeePublishesOnlyItsStatus`](../contracts/test/ens/PayeeResolver.t.sol) |
| A payout change resolves only after 72 hours, exactly when it lands | [`test_addr_switchesExactlyAtEffectiveAt`](../contracts/test/ens/PayeeResolver.t.sol), [`testFuzz_payoutChange_neverLandsEarly`](../contracts/test/registry/PayeeRegistry.t.sol); `changeDelay()` = 259200 on [PayeeRegistry](https://repo.sourcify.dev/11155111/0x205c977cF1f4Ed42e51a48759550eF40160A6396) |
| A claimed company publishes its own profile | [app: t2011001234567.payee.eth](https://app.ens.dev/t2011001234567.payee.eth) (claim [`0xb60e…77e1`](https://sepolia.etherscan.io/tx/0xb60e778bd1355c662f2fbe18cd13a34d7b013005c8c7bb85a3472e14a9e077e1), url [`0xcbe9…3ccf`](https://sepolia.etherscan.io/tx/0xcbe90c90e03e07b0f2c4f58b13596f0904b1038db140cf1be4099c4e38b43ccf), avatar [`0x877c…0baa`](https://sepolia.etherscan.io/tx/0x877cafe13cd902dc10d400a81f34c9a8196e9633e401b160b7d7441db8dd0baa)) · [app: t8999900000001.payee.eth](https://app.ens.dev/t8999900000001.payee.eth) (claim [`0xe03d…612b`](https://sepolia.etherscan.io/tx/0xe03d70436822a74b9b69ce9b086ed9d6419ed95d15f3a23881c17e591870612b), profile [`0xcc8d…330b`](https://sepolia.etherscan.io/tx/0xcc8d1aa24780bcf540e7f50b50d13b6cae24c0ad0b76f6802daaa47c58de330b)) |
| A claim without a profile still shows the registry's name and address | [app: t6999900000003.payee.eth](https://app.ens.dev/t6999900000003.payee.eth) (claim [`0xf24f…8878`](https://sepolia.etherscan.io/tx/0xf24fa19c056654fe07f7d93d43ad5ebfc44ce5d3ecdb6814335cdcd9708d5878)) |
| A claim never changes the address | [ClaimedPayeeResolver](https://sepolia.etherscan.io/address/0xe4679507c08c61BE0328EDC72c91D62Bd6f03ebd) and its [22 tests](../contracts/test/ens/ClaimedPayeeResolver.t.sol). `ens.sh claim-check` simulates the company setting an address (reverts), re-pointing its name (reverts) and overriding `name` or `meigi.status` (no effect). After each claim, stock viem resolved seven reference names byte for byte as before |
| Payout wallets carry their company's name | `getEnsName(0x9B4f…47e4)` = `t2011001234567.payee.eth` ([`0x98a1…8f1f`](https://sepolia.etherscan.io/tx/0x98a15959ee452dbd8b09d7c81e5d6ab0702d20dfb35787fed8ff512c222dfb1f)) · `getEnsName(0x0C1d…578D)` = `t8999900000001.payee.eth` ([`0x3b5e…cdc7`](https://sepolia.etherscan.io/tx/0x3b5e1fe3e08defb1ea434d40cd68f59212ef76482b04db4ee364552583afcdc7)) |
| The agent has an ENS profile and ENSIP-26 records | [app: ap.meigi.eth](https://app.ens.dev/ap.meigi.eth) (profile [`0x64de…65d0`](https://sepolia.etherscan.io/tx/0x64def3ea137ea182ef899983b0100b6ea63de862fe7e8a51c5ed55b9a2a965d0)) · resolver [`0x047A…5716`](https://sepolia.etherscan.io/address/0x047A1B0E18fc4092706F7696ffeCF61625865716) |
| The agent's key can write only `agent-status` | It set that record itself: [`0x91f4…f640`](https://sepolia.etherscan.io/tx/0x91f4a833075ca25b5728fae27788fa5009a6ff829b83207a9b53978e780cf640). `ens.sh agent-check` simulates its other writes, and each reverts `EACUnauthorizedAccountRoles` |
| The agent's key rotates without changing the name | [`agent-rotate-e2e.sh`](../contracts/script/ens/agent-rotate-e2e.sh), on a Sepolia fork of the live name and vault (not run live) |
| The vault's primary name is `ap.meigi.eth` | `getEnsName(0x87A7…793B)` · [`0xb4a6…963a`](https://sepolia.etherscan.io/tx/0xb4a6c4b8b2da4197da0354e9ff3387e58eb2ad01c525223975ecde69b3ff963a) |
| The x402 guard checks ENS before signing | [`check.ts`](../packages/x402-guard/src/check.ts), [`ens.test.ts`](../packages/x402-guard/test/ens.test.ts) |

## Limits, stated plainly

- **The ENS app lists only claimed names.** app.ens.dev and explorer.ens.dev show names that have a registry
  entry. An unclaimed `t….payee.eth` resolves in viem, ethers and wallets, but those UIs say it doesn't exist.
- **Meigi holds the root roles.** One key owns `payee.eth` and `meigi.eth` and administers the claims registry.
  In production, those roles move to a timelocked multisig with the same 72-hour delay as payouts.
- **Unclaimed names have no profile.** Records like description and avatar come only with a claim. Serving them for
  every name needs a new resolver behind `payee.eth`.
- **The demo companies are fictional.** Their names were checked against the NTA's nationwide data, and their
  domains use `.example`.

Scripts and fork proofs: [`contracts/script/ens`](../contracts/script/ens).
