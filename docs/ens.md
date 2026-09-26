# ENS in Meigi

Meigi uses two ENSv2 namespaces on Sepolia (the ENSv2 Beta, which viem and ethers resolve by default):

- **`payee.eth`** names companies: `t<T-number>.payee.eth`. The T-number is the public number a Japanese company
  prints on its invoices.
- **`meigi.eth`** names agents: `ap.meigi.eth` is our accounts-payable agent.

A name is how a company or an agent is identified. The keys and payout addresses behind it can change, and
anyone can check what it points to without trusting our app.

Sepolia has two ENSv2 deployments. One is the isolated hackathon testnet of 2026-09-03, which resolves only when a
client names its UniversalResolver. The other is the official Beta of 2026-09-15, which viem's and ethers' defaults
reach.[^deployments]

[^deployments]: `payee.eth` is registered on both, and its hackathon copy resolves through the same PayeeResolver.
    Everything else here lives on the Beta only: `meigi.eth`, the claims, the company-issued names and the mandate.
    The addresses are in [`contracts/script/ens/deployments`](../contracts/script/ens/deployments).

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
- A payout changes only through a 72-hour public window: either the company's business key together with its World
  ID officers (each proof checked by our verifier, whose co-signature the registry verifies on-chain), or a
  governance ruling on a dispute. Nothing changes it instantly.
- The name keeps resolving to the old payout until the change lands, and switches exactly when it does.
- A dispute cancels a queued change.

**A claim adds a profile, never an address.**
- A company can claim its name as an ENSv2 token, to publish a description, a url and an avatar.
- The token lives in a UserRegistry that is `payee.eth`'s subregistry, and it carries no roles.
- Its resolver, [`ClaimedPayeeResolver`](../contracts/src/ens/ClaimedPayeeResolver.sol), takes `addr` (every coin
  type), `name` and `meigi.*` from the registry.
- The company holds only `ROLE_SET_TEXT` on its own profile resolver, and no account holds the address role there.
- The profile shows only while the registry lists the company as active under the key that claimed it.

**A claimed name is non-transferable, expiring and revocable.** These are ENSv2 registry properties, not our code:
- Transfers need `ROLE_CAN_TRANSFER_ADMIN` on the token, and a claim is minted with no roles, so a company can't sell or
  move its name.
- A claim expires with `payee.eth`'s registration. Meigi can renew it.
- Meigi can revoke a claim (`unregister`), for a disputed or retired company or a listing the company never accepted.
  The name keeps resolving through the wildcard, to the same payout.
- `t6999900000003.payee.eth` went through this. Meigi listed it, the company never accepted it, and Meigi revoked it.
  It still resolves through the wildcard in every client. The ENS app no longer lists it, because a revoked label
  has no registry entry and the app lists only names that do.

**No aliases.** An alias would be a second name for the same payout, and look-alike names are the attack Meigi exists
to stop. The T-number name stays the only one.

**Payout wallets carry their company's name.**
- A payout wallet can take its payee's name as its primary name (ENSIP-19), so a wallet shows the company's name
  next to the address.
- The name must round-trip, so it stops showing if the registry moves the payout elsewhere.

## Agents: `meigi.eth`

**`meigi.eth` has its own profile.** It has its own PermissionedResolver with a name, description, url and avatar
([`0xd877…597b`](https://sepolia.etherscan.io/tx/0xd87729c4ccdf7d415473476d66462a4b664cd0e2b38125b59d4521d2cc0c597b)), so the namespace root isn't a blank page.
`ap.meigi.eth` keeps its own resolver.

**`ap.meigi.eth` is the agent's identity.**
- It is a token in a UserRegistry under `meigi.eth`, with its own ENSv2 PermissionedResolver.
- It resolves to the [AgentVault](../contracts/src/payments/AgentVault.sol).
- It carries a profile (name, description, url, avatar) and the ENSIP-26 records `agent-context`,
  `agent-endpoint[web]` and `agent-status`.

**It follows the agent ENSIPs.**
- ENSIP-26: `agent-context` (Markdown) and `agent-endpoint[web]`, a URL, follow the spec. `agent-status` is our own key.
- ENSIP-25: the agent is registered in the ERC-8004 IdentityRegistry on Sepolia as agent 10525. Its registration file,
  stored on-chain, names `ap.meigi.eth` as its ENS service. `ap.meigi.eth` confirms it with
  `agent-registration[0x0001000003aa36a7148004a818bfb912233c491871b3d84c89a494bd9e][10525]` = `1`, where the bracketed
  value is the registry as an ERC-7930 address. Each side points at the other, so either can be checked.

**The agent's key is scoped with Enhanced Access Control.**
- The key holds one role: `ROLE_SET_TEXT` on `agent-status`.
- Writing any other record, or the address, reverts `EACUnauthorizedAccountRoles`.

**The key can rotate while the name stays the same.**
- `ens.sh agent-rotate` moves the agent's one role, and the vault's agent slot, to a new key.
- On a Sepolia fork of the live name and vault, stock viem resolves `ap.meigi.eth` and the vault's primary name the
  same before and after. The old key is refused.
- We haven't run the rotation on Sepolia, because the live agent keeps its key for the demo.

**The vault's primary name is `ap.meigi.eth`**, so wallets show the agent's name instead of `0x87A7…793B`.

## Companies issue names to their own agents (live on the Beta since 2026-09-26)

A company that claimed `t<T-number>.payee.eth` can issue names under it, through
[`CompanyNamespace`](../contracts/src/ens/CompanyNamespace.sol) at
[`0x7ECa…660A`](https://sepolia.etherscan.io/address/0x7ECaD5Fd6892270F09D91aB296786186C5bC660A). Both companies here
are fictional fixtures, and their texts say so. Live now:

| Name | Holder | Class (ENSIP-27) | What it says |
|---|---|---|---|
| `ap.t2011001234567.payee.eth` | `0xaBd2…6ac1` | Agent | 株式会社メイギ商事's AP agent: ENSIP-26 records, `agent-status` set by its holder, and an ENSIP-25 link to ERC-8004 agent 10526, which the company owns |
| `keiri.t2011001234567.payee.eth` | `0x81CA…1ee9` | Workgroup | its accounts department (経理部) |
| `zeirishi.t2011001234567.payee.eth` | `0x8A7b…9150` | Person | an outside tax accountant (税理士), for 30 days (expires 2026-10-26) |
| `ap.t4999900000005.payee.eth` | `0xa73b…BA68` | Agent | the AP agent of the buyer 株式会社ハルカ製作所 (T4999900000005): its mandate, until 2026-12-31 (see below) |

Stock viem resolves every one of them to their texts and to no address. The AP agent's key `0xaBd2…6ac1` has no
primary name.

**An issued name is an identity, never a payee.**
- It resolves no address. It has only text records:
  - a description;
  - ENSIP-26's `agent-context`, `agent-endpoint[web]` and `agent-status`;
  - for an agent, an ENSIP-25 link to its ERC-8004 registration.
- The only name anyone pays is `t2011001234567.payee.eth`. So a stolen company key can't mint
  `pay.t2011001234567.payee.eth` pointing at a thief, because an issued name carries no address at all.
- Who the company is comes from the parent name, which the registry answers. So `name`, `display`, `url` and `avatar`
  are reserved on issued names.

**The registry decides, live.**
- Only the payee's current controller, while the payee is active, can open the namespace and issue, edit, renew or
  revoke names.
- A name answers only while the payee is active and its controller is still the key that issued it:
  - **a disputed number's issued names resolve to nothing**;
  - a controller rotation (recovery from a stolen key, say) darkens every name the old key issued.
- Only the namespace Meigi has attached to the claimed name answers, so a reset stays dark until Meigi attaches the
  fresh one.

**How it's built, and why.**
- **Every issued name's resolver is the gate** (ENSIP-10). It answers only the exact `<label>.t<13 digits>.payee.eth` of
  a live name in the current namespace, and only text.
- **Each name keeps its records in its own PermissionedResolver**, where the gate is the only role holder and writes
  only that exact name. The holder gets no role there; it sets its own `agent-status` through the gate, and nothing
  else. contracts-review confirmed two Beta behaviours on a fork that make this necessary:
  - a record under the root node answers every deeper name through the wildcard;
  - setter roles are scoped by key, not by name.
- **Lifetime.**
  - Names are non-transferable (issued with no token roles).
  - They expire no later than the company's claim.
  - `renew` extends live names only, because a registry unregister followed by renew would revive the old resolver.
- **Labels** are ENSIP-15-normal `[a-z0-9]` with single inner hyphens. A label can't contain 13 digits in a row, so
  `t8999900000001.t2011001234567.payee.eth` can't pose as another company. Holders are plain accounts.
- **Meigi's brake** can block a label or freeze a whole namespace (both stay dark and unchangeable until lifted), and
  reset a T-number's namespace after a dispute moves the number, so none of the old names carry over.
  **To take a name down, Meigi uses `setBlocked` or `setFrozen`, never a plain unregister:** the company could
  simply issue an unregistered label again.

**Evidence** (Sepolia, 2026-09-26; every transaction status 1):

| Step | Signer | Tx |
|---|---|---|
| Deploy CompanyNamespace | Meigi | [`0x89d5…068c`](https://sepolia.etherscan.io/tx/0x89d53412d130bd42038413757a1683e037fa1aa4043e0f1434142dded351068c) |
| Gas for the company key and the AP agent's key | Meigi | [`0xd62c…c682`](https://sepolia.etherscan.io/tx/0xd62cdacc76066844eff122626275ec838eda1ad23d1ff3a5258d0577c799c682), [`0x1309…067b`](https://sepolia.etherscan.io/tx/0x13094e2482d7dd86b319db9feb1217c2d36c242a67df8644cbeab553ab2b067b) |
| Register the AP agent in ERC-8004 (agent 10526), then clear its agent wallet | 株式会社メイギ商事 | [`0x7ea4…0c0e`](https://sepolia.etherscan.io/tx/0x7ea43205a01b9d0c62196578e7103285df7c55139bf2352e03effbaae4330c0e), [`0x4115…86d1`](https://sepolia.etherscan.io/tx/0x4115e329d322ed078f81b5f295d6495429c8b288f401a890de459463d25686d1) |
| Open its namespace ([`0x5063…9f95`](https://sepolia.etherscan.io/address/0x50639a98B1a09de1E795a4D42D5bbb9758DF9f95)) | 株式会社メイギ商事 | [`0x5969…5447`](https://sepolia.etherscan.io/tx/0x5969af88e01a462a2a549d10fbf5a3a3f40b8423b66b5706e4e37c1aed3d5447) |
| Attach it to `t2011001234567.payee.eth` | Meigi | [`0xc8be…60de`](https://sepolia.etherscan.io/tx/0xc8beabf8c7dd596fbda605fa2acbe7b279eaa9106707fe6796cfd8ce859560de) |
| Issue `ap`, `keiri`, `zeirishi` | 株式会社メイギ商事 | [`0xa071…abde`](https://sepolia.etherscan.io/tx/0xa071b7e0aa148163cacfe5c82319435a1aac5a61ea7f712491139f5ad7a9abde), [`0x663c…6c01`](https://sepolia.etherscan.io/tx/0x663ca68eec1669726a5b91c3110bf09e286d7de7729072cb2e1ce6eada176c01), [`0x319f…8a41`](https://sepolia.etherscan.io/tx/0x319fe91436d0ca16d4b5e2d027ede0d967ab96c0d4d55405f48e9362b95f8a41) |
| The AP agent sets its own `agent-status` | `0xaBd2…6ac1` | [`0x89eb…ecd0`](https://sepolia.etherscan.io/tx/0x89eb2ead79c346c85a22ba8b460b3af2afe81833376273d44c070e45c233ecd0) |
| Register the buyer fixture 株式会社ハルカ製作所 (payout `0x0F4a…0D39`, a key we hold) | Meigi's attester | [`0x1c93…3bc29`](https://sepolia.etherscan.io/tx/0x1c93547147046083e3304803d5274a61e8cf1bcb6f6f5d18a857d7344303bc29) |
| Claim `t4999900000005.payee.eth`: gas, its profile resolver, the profile link, the claim | Meigi | [`0xa343…b952`](https://sepolia.etherscan.io/tx/0xa343a2b2589c16056de7a73c28398f00862e291f090f1a107b752cb3faa2b952), [`0xa041…1f02`](https://sepolia.etherscan.io/tx/0xa041f5eff16a44b5952fd93c831192f33399e241e17d8905e1ad0f22dc951f02), [`0xf8e3…8a6d`](https://sepolia.etherscan.io/tx/0xf8e3f5b3bd27e174cc943ef7bf9ee993e440e7f3aefd2edad40b04bf36ea8a6d), [`0xda99…04b1`](https://sepolia.etherscan.io/tx/0xda9969f10dc3cdf6d91bb8556450caa337f77904bd38f43ff3715d9fb90904b1) |
| Open its namespace ([`0x0f58…E434`](https://sepolia.etherscan.io/address/0x0f58aC107C5CbFfcFB2b9a02C036C187589CE434)) | 株式会社ハルカ製作所 | [`0x353c…0236`](https://sepolia.etherscan.io/tx/0x353ca1dd0b46deea3584d73273c1c0acc0e23a18db42fff48ad11065a7f90236) |
| Attach it | Meigi | [`0x140b…baa0`](https://sepolia.etherscan.io/tx/0x140b8682d7b088ada7bfd7e110d85c145159b02c64e818d36a949db19440baa0) |
| Issue the mandate `ap` to the AP agent's key, until 2026-12-31 | 株式会社ハルカ製作所 | [`0x68c1…0d4b`](https://sepolia.etherscan.io/tx/0x68c11a16c380fb8742f7573adde269b85760189980e92a033e0b9a0b643c0d4b) |

Before the first transaction and after the last, a stock-viem snapshot
([`snapshot-viem.mjs`](../contracts/script/ens/snapshot-viem.mjs)) of the seven reference names (each resolver, address
and text record of t2011001234567, t8999900000001, t6999900000003, t3999905000001 and t2010401000001.payee.eth,
ap.meigi.eth and meigi.eth) was byte-identical. The vault, the router and the registry's existing entries weren't
touched; the only registry write was the buyer's new registration. Gas: 0.0098 Sepolia ETH, plus 0.021 of top-ups.

Tests behind it:
- 25 unit tests against the real PayeeRegistry, so rotations and disputes are the registry's own flows.
- 6 fork tests on the live Beta through the canonical UniversalResolver.
- [`names-e2e.sh`](../contracts/script/ens/names-e2e.sh) on an anvil fork with stock viem.
- contracts-review passed it (48/48 on a Sepolia fork, no open findings) after two rounds whose findings shaped this
  design.

**The mandate: an ENS name the vault obeys** (built and fork-proven; wired after review).
[`MandateGate`](../contracts/src/payments/MandateGate.sol) becomes the AgentVault's agent and passes `payInvoice` on
only while `ap.t4999900000005.payee.eth` answers and the caller is its holder. The buyer revokes the name, and the
agent's next payment reverts `MandateNotLive`; it issues the name again, and payments continue. The vault still checks
every payment itself. [`mandate-e2e.sh`](../contracts/script/ens/mandate-e2e.sh) proves the whole flow against the
live vault on a fork. contracts-review passed MandateGate: 27 of 27 on a fork in front of the live vault.
- **Who decides.** Once the gate is the vault's agent, 株式会社ハルカ製作所's registered controller decides who may pay,
  by issuing or revoking `ap`. What gets paid stays bounded by the vault: approved vendors, their registered payouts,
  and caps.
- **Kill switches.** The vault's owner can call `setAgent` back to the key, or `pause`. Meigi can `setBlocked` the
  name or `setFrozen` the company's namespace.
- **Rotations.** Any controller rotation, even a legitimate one, darkens `ap` until the new key issues it again. The
  gate refuses payments meanwhile.

**Limits.**
- Until the rotation lands, or Meigi blocks or freezes it, a stolen controller key can still issue a text-only name.
  It can never make one payable.
- Issued names' texts are the company's own words. Only the parent's legal name comes from the registry.
- Gating covers ENS resolution. Each name's record store, and its events, stay directly readable on-chain.

**Next step: owned accounts (ENSIP-28).** Each issued name would list the accounts that act for it, as ENSIP-24 data
records, and accept a listing only if the account's EIP-712 consent verifies on-chain. It isn't in the live contract:
- the record stores grant the gate `ROLE_SET_TEXT` only, with no admin roles, so a data role can never be added;
- the gate's resolver answers text only.

So it needs a CompanyNamespace v4, a review round and a migration of the live names. Two uses:
- **Confirmation of Payer:** an x402 merchant checks that the paying address is an owned account of a company's agent
  name. Its receipt then names the buyer, as a qualified invoice must.
- **Confirmation of Sender:** the AP agent checks an invoice's signature against a key that `keiri.t….payee.eth` lists.

## Resolver partitioning: no role crosses names

A PermissionedResolver scopes a setter role by record key, not by name: the role's resource is `keccak256(key)`. So a
role reaches every name that one instance serves. ENS's answer (Example 5 in "Exploring subnames in ENSv2") is that
the resolver instance is the trust boundary. Meigi deploys one instance per name through the VerifiableFactory.

We checked each instance on-chain on 2026-09-26, reading its `Linked` events and role grants. Each instance links
at most one name:

| Name | Its records live on | Who can write there |
|---|---|---|
| `meigi.eth` | [`0xE4B2…D406`](https://sepolia.etherscan.io/address/0xE4B229dD0e5119043Aa3c897Ae11Cc765DbFD406) | Meigi only |
| `ap.meigi.eth` | [`0x047A…5716`](https://sepolia.etherscan.io/address/0x047A1B0E18fc4092706F7696ffeCF61625865716) | Meigi; the agent key, `agent-status` only |
| `t2011001234567.payee.eth` | [`0xb698…EAf2`](https://sepolia.etherscan.io/address/0xb69807CdeD29d8F11b9E4dB83d7B5EfE7158EAf2) (profile text) | Meigi; the company, text only |
| `t8999900000001.payee.eth` | [`0xb241…AeAe`](https://sepolia.etherscan.io/address/0xb24114377D3F7424316ff0dAE032C728C505AeAe) (profile text) | Meigi; the company, text only |
| `t4999900000005.payee.eth` | [`0xF7B5…539a`](https://sepolia.etherscan.io/address/0xF7B5A7b765d46Ff4945b5292D500AEe89340539a) (profile text) | Meigi; the company, text only |
| each company-issued name | its own record store, e.g. `ap.t2011001234567…` on [`0x8230…f0b1`](https://sepolia.etherscan.io/address/0x823082d8859e0ce4139D7cbE9FafE2C55E8aF0b1) | CompanyNamespace only, for that exact name |

- **The agent's `agent-status` role reaches no other name,** because `ap.meigi.eth` is the only name its instance
  serves.
- **A company's text role reaches no other company.** `ClaimedPayeeResolver` reads a claimed name's profile only from
  that company's own instance (`profileOf(tNumber)`).
- **Money records live on none of these instances.** PayeeResolver computes them from the registry on every lookup.
- **Revoked `t6999900000003` left an instance (`0x6277…27f4`) that links no name,** and nothing reads it.

One fixture detail: two of our fictional companies (株式会社メイギ商事 and 株式会社フジデータ) share one demo key as
their registered controller. That key edits both profiles because it controls each company, not because a resolver
is shared. The buyer 株式会社ハルカ製作所 has its own key.

## Payments check ENS

- The x402 guard resolves a merchant's declared `t….payee.eth` with stock viem before the buyer signs.
- It refuses unless ENS, the registry and the payment's `payTo` all agree
  ([`check.ts`](../packages/x402-guard/src/check.ts), [tests](../packages/x402-guard/test/ens.test.ts)).
- A compromised merchant server can change `payTo`. It can't change the company's registry entry or its name.

## Questions a judge might ask

**Why does a claimed name forward to PayeeResolver instead of linking records?** ENSv2 record links
(`linkToNode`, `linkToRecord`) work only inside one PermissionedResolver. The money records live in PayeeResolver,
which is a view of the registry. So `ClaimedPayeeResolver` forwards `addr`, `name` and `meigi.*` to it on every lookup,
and it never stores an address.

**ENS's own example gives an agent a role on an address record. Why does ours hold only `agent-status`?** An agent that
can swap an address is exactly the attack Meigi stops. A payout changes only through a 72-hour public window: the
company's business key with its World ID officers, or a governance ruling on a dispute. The agent's key only reports
the agent's status.

**Token IDs change when roles change. Does that break anything?** No. Everything we do looks a name up by its label
(`getOwner(labelId)`, `getResolver(label)`), and ENS clients resolve by name. Nothing stores a token ID.

**Why not aliases, or "forever" names?** An alias is a second name for the same payout, which is the look-alike attack.
A claim expires with `payee.eth`, which Meigi renews, so a claimed name can't outlive the namespace that vouches for
it.

## Evidence

Live on Sepolia. ENS app: [app.ens.dev](https://app.ens.dev). Explorer: [explorer.ens.dev](https://explorer.ens.dev).

| Claim | Evidence |
|---|---|
| `payee.eth` uses our wildcard resolver, plus a subregistry for claimed names | [explorer: payee.eth](https://explorer.ens.dev/payee.eth) · [PayeeResolver `0x096e…4A1e`](https://repo.sourcify.dev/11155111/0x096ebC07eE87fbb19FF920a5c81b2Ad5c9104A1e) (Sourcify) · claims registry [`0xcA03…D0B6`](https://sepolia.etherscan.io/address/0xcA0317C97C0f915faaD6D8F354110eA98bDeD0B6), attached in [`0xa878…22cd`](https://sepolia.etherscan.io/tx/0xa878ef9d35324c42ded75c30a68a115fefaf17c610f9f4aa10f404e34f5a22cd) |
| Every registered number resolves with no configuration | `(cd apps/landing && RPC_URL=https://ethereum-sepolia-rpc.publicnode.com node --input-type=module) < contracts/script/ens/check-viem.mjs` (stock viem; ethers 6 `resolveName` agrees) |
| Unknown and disputed numbers resolve to nothing | [`test_addr_failsClosed`](../contracts/test/ens/PayeeResolver.t.sol), [`test_text_disputedPayeePublishesOnlyItsStatus`](../contracts/test/ens/PayeeResolver.t.sol) |
| A payout change resolves only after 72 hours, exactly when it lands | [`test_addr_switchesExactlyAtEffectiveAt`](../contracts/test/ens/PayeeResolver.t.sol), [`testFuzz_payoutChange_neverLandsEarly`](../contracts/test/registry/PayeeRegistry.t.sol); `changeDelay()` = 259200 on [PayeeRegistry](https://repo.sourcify.dev/11155111/0x205c977cF1f4Ed42e51a48759550eF40160A6396) |
| A claimed company publishes its own profile | [app: t2011001234567.payee.eth](https://app.ens.dev/t2011001234567.payee.eth) (claim [`0xb60e…77e1`](https://sepolia.etherscan.io/tx/0xb60e778bd1355c662f2fbe18cd13a34d7b013005c8c7bb85a3472e14a9e077e1), url [`0xcbe9…3ccf`](https://sepolia.etherscan.io/tx/0xcbe90c90e03e07b0f2c4f58b13596f0904b1038db140cf1be4099c4e38b43ccf), avatar [`0x877c…0baa`](https://sepolia.etherscan.io/tx/0x877cafe13cd902dc10d400a81f34c9a8196e9633e401b160b7d7441db8dd0baa)) · [app: t8999900000001.payee.eth](https://app.ens.dev/t8999900000001.payee.eth) (claim [`0xe03d…612b`](https://sepolia.etherscan.io/tx/0xe03d70436822a74b9b69ce9b086ed9d6419ed95d15f3a23881c17e591870612b), profile [`0xcc8d…330b`](https://sepolia.etherscan.io/tx/0xcc8d1aa24780bcf540e7f50b50d13b6cae24c0ad0b76f6802daaa47c58de330b)) |
| A claim can be revoked, and the name still resolves | `t6999900000003.payee.eth`: listed in [`0xf24f…5878`](https://sepolia.etherscan.io/tx/0xf24fa19c056654fe07f7d93d43ad5ebfc44ce5d3ecdb6814335cdcd9708d5878), revoked in [`0x0f3c…64bd`](https://sepolia.etherscan.io/tx/0x0f3c5d72bda2b2a894c97e779570eae8cfa44b11516465532754f4ea914364bd). Stock viem still returns 株式会社ミナトGPUクラウド and `0x4d6D…FD30`, through payee.eth's resolver |
| A claim inherits `payee.eth`'s expiry | `ens.sh claim-check` prints and asserts it: both live claims expire at 1821898512, the same second as `payee.eth` |
| A claimed name can't be transferred | `ens.sh claim-check`: the company's `unsafeTransfer` reverts `TransferDisallowed`, and its `safeTransferFrom` reverts too (ENSv2 requires `ROLE_CAN_TRANSFER_ADMIN`, and claims carry no roles) |
| A claim never changes the address | [ClaimedPayeeResolver](https://sepolia.etherscan.io/address/0xe4679507c08c61BE0328EDC72c91D62Bd6f03ebd) and its [22 tests](../contracts/test/ens/ClaimedPayeeResolver.t.sol). `ens.sh claim-check` simulates the company setting an address (reverts), re-pointing its name (reverts) and overriding `name` or `meigi.status` (no effect). After each claim, stock viem resolved seven reference names byte for byte as before |
| Payout wallets carry their company's name | `getEnsName(0x9B4f…47e4)` = `t2011001234567.payee.eth` ([`0x98a1…8f1f`](https://sepolia.etherscan.io/tx/0x98a15959ee452dbd8b09d7c81e5d6ab0702d20dfb35787fed8ff512c222dfb1f)) · `getEnsName(0x0C1d…578D)` = `t8999900000001.payee.eth` ([`0x3b5e…cdc7`](https://sepolia.etherscan.io/tx/0x3b5e1fe3e08defb1ea434d40cd68f59212ef76482b04db4ee364552583afcdc7)) |
| The agent has an ENS profile and ENSIP-26 records | [app: ap.meigi.eth](https://app.ens.dev/ap.meigi.eth) (profile [`0x64de…65d0`](https://sepolia.etherscan.io/tx/0x64def3ea137ea182ef899983b0100b6ea63de862fe7e8a51c5ed55b9a2a965d0)) · resolver [`0x047A…5716`](https://sepolia.etherscan.io/address/0x047A1B0E18fc4092706F7696ffeCF61625865716) |
| ENSIP-25: the agent's ERC-8004 registration and its ENS name point at each other | ERC-8004 agent 10525 on [`0x8004A818…BD9e`](https://sepolia.etherscan.io/address/0x8004A818BFB912233c491871b3d84c89A494BD9e), registered in [`0x7abf…88f3`](https://sepolia.etherscan.io/tx/0x7abf01a79e3f740ebf19538bff3b6d896d05e2607253e61ba1062779860188f3) · the record on ap.meigi.eth set in [`0x0f12…c107`](https://sepolia.etherscan.io/tx/0x0f12e323e39f5256ab3b6360320eec96d48e811747717f11f552ebb97b03c107) · check: `(cd apps/landing && RPC_URL=… AGENT_ID=10525 node --input-type=module) < contracts/script/ens/check-agent-8004-viem.mjs` |
| The agent's key can write only `agent-status` | It set that record itself: [`0x91f4…f640`](https://sepolia.etherscan.io/tx/0x91f4a833075ca25b5728fae27788fa5009a6ff829b83207a9b53978e780cf640). `ens.sh agent-check` simulates its other writes, and each reverts `EACUnauthorizedAccountRoles` |
| The agent's key rotates without changing the name | [`agent-rotate-e2e.sh`](../contracts/script/ens/agent-rotate-e2e.sh), on a Sepolia fork of the live name and vault (not run live) |
| The vault's primary name is `ap.meigi.eth` | `getEnsName(0x87A7…793B)` · [`0xb4a6…963a`](https://sepolia.etherscan.io/tx/0xb4a6c4b8b2da4197da0354e9ff3387e58eb2ad01c525223975ecde69b3ff963a) |
| The namespace root has a profile | [app: meigi.eth](https://app.ens.dev/meigi.eth), resolver set in [`0xd877…597b`](https://sepolia.etherscan.io/tx/0xd87729c4ccdf7d415473476d66462a4b664cd0e2b38125b59d4521d2cc0c597b) |
| ENS's agent CLI would see the same answers | `ens get address t2011001234567.payee.eth --chain sepolia` calls viem's `getEnsAddress` with the default Sepolia Universal Resolver ([source](https://github.com/ensdomains/ens-cli/blob/main/src/commands/get.ts)), the same call as the check above. We haven't run it ourselves: it ships only as an unpinned preview build |
| The x402 guard checks ENS before signing | [`check.ts`](../packages/x402-guard/src/check.ts), [`ens.test.ts`](../packages/x402-guard/test/ens.test.ts) |

## Limits, stated plainly

- **The ENS app lists only claimed names.** app.ens.dev and explorer.ens.dev show names that have a registry
  entry. An unclaimed `t….payee.eth` resolves in viem, ethers and wallets, but those UIs say it doesn't exist. To
  check one yourself:
  `(cd apps/landing && RPC_URL=https://ethereum-sepolia-rpc.publicnode.com ENS_NAME=t6999900000003.payee.eth node --input-type=module) < contracts/script/ens/check-viem.mjs`
- **Meigi holds the root roles.** One key owns `payee.eth` and `meigi.eth` and administers the claims registry.
  In production, those roles move to a timelocked multisig with the same 72-hour delay as payouts.
- **Unclaimed names have no profile.** Records like description and avatar come only with a claim. Serving them for
  every name needs a new resolver behind `payee.eth`.
- **The demo companies are fictional.** Their names were checked against the NTA's nationwide data, and their
  domains use `.example`.

Scripts and fork proofs: [`contracts/script/ens`](../contracts/script/ens).
