# ens: ENSv2 payee.eth registration scripts

Agent type `oh-my-claudecode:executor`, started Sat 02:36 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

Goal: make `t2011001234567.payee.eth` resolve, through the ETHGlobal Tokyo 2026 ENSv2 hackathon deployment on Sepolia, to the payout address stored in our PayeeRegistry. Use our custom ENSIP-10 wildcard resolver. Write the scripts and prove them on an anvil fork of Sepolia. Do NOT broadcast to real Sepolia; I'll do that after a security review.

Repo: <workspace>/meigi.
- Foundry project in contracts/. Read contracts/README.md, contracts/src/ens/PayeeResolver.sol and contracts/src/registry/PayeeRegistry.sol first.
- The tests in contracts/test/ show how to register a payee (see test/utils/MeigiFixture.sol).
- Do not modify anything in contracts/src/. If a contract change is needed, report it instead.
- Do not git commit. Put new files under contracts/script/ens/, plus a short contracts/script/ens/README.md.

Known facts about the ENSv2 hackathon deployment (Sepolia, all confirmed to have bytecode):

| Contract | Address |
|---|---|
| ETHRegistrar | 0x7d1b7f586a62ac3f54b9a396849757814283270b |
| RootRegistry | 0xe7f0d5724f8337e3aa9a9910540341ff4273fed9 |
| UserRegistryImpl | 0x47b442d0cf617c41cabaff5f02f44dd1e5f72546 |
| PermissionedResolverImpl | 0xa9d3814ab151bf6e37a427432795371a8361614e |
| VerifiableFactory | 0x894bc9cc8ff1ad96b8a288c86a8c71d662c07780 |
| UniversalResolverV2 | 0xfea8d4b7fcce0b8765c793d6695eac384aaa458f (proxy 0xd26f2040d083af1cd2962ba303f4bea0c4faf142) |
| MockUSDC (registration fee token, 6 decimals, open mint) | 0xcbfd80f74375c54e545af34788ff465f96f66f05 |

- Registration flow: mint MockUSDC → approve ETHRegistrar (fee about 8 mockUSDC/yr) → `commit(makeCommitment(...))` → wait at least 60s → `register(...)`.
- Use a fresh salt for any VerifiableFactory.deployProxy.
- ENS guidance for this hackathon: the "pure data" setup (one resolver, no subregistry) is right when all subnames share one owner, which is our case. The docs are the ENSv2 overview at docs.ens.domains; the hackathon docs branch is linked from a note at the top. There is also the blog post ens.domains/blog/post/exploring-subnames-ensv2.
- ENSv2 uses EAC roles, and unauthorized calls revert `EACUnauthorizedAccountRoles`.

What to do:
1. Get the exact ABIs and flows. Try, in order: verified source on Sepolia Etherscan or Blockscout; the ens-contracts v2 source on GitHub (the branch or tag matching the deployment); `cast interface` / `cast 4byte` against the deployed bytecode. Establish:
   - the commit/register signatures and the makeCommitment parameters (owner, duration, secret, subregistry?, resolver?, roles?, referrer?)
   - how to set, or register with, a custom resolver for a .eth 2LD in ENSv2
   - how UniversalResolverV2 resolves `t2011001234567.payee.eth` when payee.eth has no subregistry. Confirm that it calls our resolver's `resolve(bytes name, bytes data)` with the full DNS-encoded name (ENSIP-10 wildcard).
2. Check whether `payee.eth` is available on this deployment. If it is taken, check `meigi.eth` and report which one to use.
3. Write the scripts. Commit-reveal needs real time between txs, so a single `forge script` broadcast won't work. A bash script using `cast send` with a sleep is fine, or two forge scripts. Read secrets only from environment variables:
   - DEPLOYER_PRIVATE_KEY and SEPOLIA_RPC_URL live in meigi/.env. Never print them.
   - Don't hardcode keys.
4. Prove it end-to-end on an anvil fork of Sepolia (`anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com`, impersonation or anvil's default accounts, `evm_increaseTime` for the 60s):
   - deploy PayeeRegistry + PayeeResolver on the fork
   - set an attester and register payee T2011001234567 with some payout address (see the fixture for the struct)
   - register payee.eth and point its resolver at PayeeResolver
   - call UniversalResolverV2 to resolve `t2011001234567.payee.eth` for addr(60) and text("name"), and show both results match the registry
   - show a disputed or unknown T-number resolves to zero
   - also test with viem's getEnsAddress if easy (optional).
5. Report back:
   - the exact commands for the real Sepolia run
   - the ABI fragments and function signatures you verified, and where they came from
   - name availability
   - the fork-test output
   - any gotchas (fees, durations, roles, resolver interface requirements such as whether UniversalResolverV2 needs an extra interface, e.g. IExtendedResolver or resolveWithContext)

Constraints:
- No secrets in output or files.
- No real-chain broadcasts.
- Keep files under 400 lines.

## Follow-up instructions

### Sat 02:40 JST: Resolver constructor change heads-up

Heads-up: PayeeResolver's constructor is changing, from a security-review fix I'm applying now. It becomes `constructor(IPayeeRegistry registry_, bytes memory parentDnsName)`, and resolve() only answers names whose parent equals that DNS-encoded parent. For payee.eth that's hex"057061796565036574680" + "0", i.e. 0x0570617965650365746800; if we end up on meigi.eth, 0x056d65696769036574680 + "0".

Two more changes:
- The OfficerApproval struct field is renamed `nullifiers` → `officerIds`.
- The registry's payeeOf view gains `nextController` and `controllerEffectiveAt` fields.

Build your fork test against the new constructor; I'll tell you when src/ has landed (about 20 min). Until then, keep working on the ENS side: ABIs, name availability, commit/register and setResolver.

### Sat 02:48 JST: New resolver source has landed

The src changes have landed, commit 07b7d4f.
- PayeeResolver constructor: `(IPayeeRegistry registry_, bytes parentDnsName)`. For payee.eth the parent is 0x0570617965650365746800. For meigi.eth it's 0x056d656967690365746800.
- The registry's OfficerApproval field is now `officerIds`. PayeeView adds `nextController` and `controllerEffectiveAt`.
- Typed ABIs are in packages/abi/src (`payeeRegistryAbi`, `payeeResolverAbi`, …), regenerated by contracts/script/export-abi.sh. Use them if you write anything in TS.

For your fork test, register a payee exactly like test/utils/MeigiFixture.sol `_register` does: the attester calls `register(Registration)`, with officers sorted ascending. Then resolve through UniversalResolverV2.

### Sat 03:24 JST: Real Sepolia resolver deployed

The Meigi contracts are live on Sepolia and verified on Sourcify. For the real payee.eth run, point the name's resolver at the deployed PayeeResolver `0xEC8C23682Df12A0422d8a656F80c51858E6fEd92`. Its parent is payee.eth, registry `0xB2D61a2d1EF2C340F8b4cf9ec90E1eDCB08a6e84`.

A fixture payee is already registered: `T2011001234567` → payout `0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4`, name 株式会社メイギ商事. Once payee.eth is set, `t2011001234567.payee.eth` should resolve to that address.

Addresses are also in meigi/.env: RESOLVER_ADDRESS, REGISTRY_ADDRESS.

You're cleared to broadcast the real ENS registration once your fork test passes:
- from DEPLOYER_PRIVATE_KEY (it holds about 0.8 Sepolia ETH)
- register payee.eth for 1 year
- set the resolver to the address above
Report the tx hashes and a final UniversalResolverV2 resolution of t2011001234567.payee.eth.

### Sat 03:43 JST: Hold broadcast; register on both ENS deployments

Good catch on the two deployments. Decisions:

1. **HOLD the real broadcast.** I'm fixing a Medium finding in PayeeRegistry and will redeploy the registry, resolver, router and vault within about 30 min. The current Sepolia addresses will be replaced; I'll send the new ones.
2. **Register payee.eth on BOTH deployments.**
   - Beta (0xabe7…) makes default viem/ensjs/ENS app resolution work, which is the "any ENS client" pitch.
   - The hackathon one (0x7d1b…) is what ENS told hackers to use.
   - Point both at the same PayeeResolver. Script both via ENS_DEPLOYMENT=beta|hackathon, with beta as the default.
3. **Never deploy a second registry.** DeployPayeeStack must take PAYEE_REGISTRY / PAYEE_RESOLVER from our Deploy.s.sol output (contracts/deployments/11155111.json). If it keeps a deploy path for fork tests, require attester != governance there too.
4. Fixture officer ids 0xA1/0xB2 are fine for fork tests; the real seeding is done by contracts/script/seed-demo.sh.

Keep going on the fork tests for both deployments. When I send the new resolver address, you're cleared to broadcast on both.

### Sat 03:50 JST: v2 deployed: cleared to broadcast on both

v2 is deployed on Sepolia and Sourcify-verified. Use ONLY these (v1 is retired):
- PAYEE_REGISTRY=0x205c977cF1f4Ed42e51a48759550eF40160A6396
- PAYEE_RESOLVER=0xe3Fa4DC8C2920CC0a682781d8a51E4bbCaF025dA (parent payee.eth, 0x0570617965650365746800)

The fixtures are registered on v2:
- T2011001234567 → 0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4 (株式会社メイギ商事)
- T2010401000001 → 0x0C1d13e3CC82f3a6e0694D3EDe031595Ce32578D (株式会社フジデータ)

You're cleared to broadcast: register payee.eth on BOTH the Beta and the hackathon deployments from DEPLOYER_PRIVATE_KEY, 1 year, resolver = the v2 PayeeResolver.

Then verify:
1. Default viem getEnsAddress("t2011001234567.payee.eth") on sepolia with no overrides (Beta via 0xeEeE…).
2. The same via the hackathon UR proxy 0xd26f….
3. getEnsText name → 株式会社メイギ商事.

Report the tx hashes and the resolution outputs. Don't commit; I'll commit your scripts after reviewing.

### Sat 03:52 JST: Stand down: I'll run the real broadcasts

Great work. Stand down on broadcasting: I'll run `ens.sh register` for beta and hackathon myself now, so we don't race. Please make no further changes under contracts/script/ens/ while I run it. Your task is complete; thanks.
