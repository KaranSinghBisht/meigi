# payee.eth on ENSv2 (Sepolia)

These scripts register `payee.eth` on ENSv2 with our `PayeeResolver` as its resolver and **no subregistry**, which
ENS calls the "pure data" setup. The UniversalResolver walks root → `eth` → `payee`, finds no deeper registry, and
hands every `t<13 digits>.payee.eth` lookup to that one resolver. It calls `resolve(dnsName, data)` with the full
DNS-encoded name (ENSIP-10), and the resolver answers from `PayeeRegistry`. A verified company can also claim its
name as a token in a claims registry under `payee.eth` (see [Claimed payee names](#claimed-payee-names-beta-only)).
Its money records still come only from `PayeeResolver`.

| File | Purpose |
|---|---|
| `ens.sh` | Entry point: `deploy`, `seed`, `register`, `set-resolver`, `check`, plus the `agent-*`, `vault-name` and `claim-*` commands below. It only simulates unless `BROADCAST=1`. |
| `fork-e2e.sh` | Full proof on an anvil fork of Sepolia, against both ENSv2 deployments. Sends nothing to a real network. |
| `RegisterName.s.sol` | `commit()`, `register()`, `dryRun()` (full flow with pranks and a time warp), `setResolver()` |
| `CheckName.s.sol` | Read-only. Resolves through the UniversalResolver, compares with the registry, and checks that other names fail closed |
| `DeployPayeeStack.s.sol` | Registry and resolver for fork runs, or only a resolver when `PAYEE_REGISTRY` is set (resolver redeploys) |
| `SeedDemoPayee.s.sol` | Attester registers the demo payee `T2011001234567` (test-fixture data) |
| `EnsV2.sol` | ENSv2 interfaces (from the verified source), DNS encoding, and deployment wiring checks |
| `deployments/*.env` | ENSv2 address tables: `beta` (default) and `hackathon`. `beta.env` also records Meigi's claims registry and `ClaimedPayeeResolver` |
| `check-viem.mjs` | viem `getEnsAddress` / `getEnsText`, called the way a wallet calls them |
| `AgentNamespace.s.sol`, `AgentNs.sol` | The AP agent's namespace `ap.meigi.eth`: `deploy()`, `setup()`, `setStatus()` (see below) |
| `CheckAgent.s.sol` | Read-only proof of the namespace, the agent's one scoped role (simulated allowed and denied writes) and an unchanged `payee.eth` |
| `agent-e2e.sh`, `check-agent-viem.mjs` | The namespace flow on an anvil fork, and stock viem resolving `ap.meigi.eth` |
| `VaultName.s.sol`, `vault-e2e.sh`, `check-primary-viem.mjs` | The AgentVault's primary name `ap.meigi.eth` (ENSIP-19), its fork proof, and stock viem `getEnsName` |
| `ClaimName.s.sol`, `CheckClaim.s.sol`, `claim-e2e.sh` | Claimed payee names: `deploy()`, `attach()`, `claim()`, `profile()`, `detach()`, the read-only proof, and the fork proof |

## Which ENSv2 deployment

| `ENS_DEPLOYMENT` | What | Resolves in default clients? |
|---|---|---|
| `hackathon` | The isolated hackathon testnet deployed 2026-09-03: root `0xe7f0…`, UR proxy `0xd26f…` | No. Clients must pass `universalResolverAddress: 0xd26f2040d083af1cd2962ba303f4bea0c4faf142` |
| `beta` (default) | The official "Sepolia ENSv2 Beta" redeployed 2026-09-15: root `0x9703…` | Yes. The canonical Sepolia UR `0xeeee…eeee` is viem's default |

The registrar ABI, commit window, minimum duration and fee are identical on both. One `PayeeResolver` can serve
`payee.eth` on both deployments at the same time.

## Real Sepolia run

Run from `contracts/`.

- **Environment.**
  - `ens.sh` reads only `SEPOLIA_RPC_URL` and the `DEPLOYER_*`, `ATTESTER_*`, `PAYEE_*` and `ENS_*` variables
    from `meigi/.env`. Variables you have already exported win.
  - `RPC_URL` overrides `SEPOLIA_RPC_URL`. `.env` is ignored when the RPC is local.
  - The `ENS_*` addresses always come from `deployments/<ENS_DEPLOYMENT>.env`.
- **Guards.** `ens.sh` refuses any chain other than 11155111. Each command receives only the key it signs with.
- **Secrets.** Keys and the RPC URL are passed through the environment (`FOUNDRY_ETH_RPC_URL` for forge,
  `ETH_RPC_URL` for cast), never on a command line. Output is redacted: the URL, its path and query, and
  private keys.

```sh
# 1. Contracts. The canonical script/Deploy.s.sol deploys a resolver bound to payee.eth (ENS_PARENT_DNS).
#    Already done on Sepolia: see deployments/11155111.json.
export PAYEE_REGISTRY=$(jq -r .registry deployments/11155111.json)
export PAYEE_RESOLVER=$(jq -r .resolver deployments/11155111.json)

# 2. Payees. Already registered on Sepolia: T2011001234567 (demo vendor) and T8999900000001 (x402 merchant).
#    To seed through this script instead (the attester needs Sepolia ETH):
# export PAYEE_CONTROLLER=0x… PAYEE_PAYOUT=0x…; BROADCAST=1 script/ens/ens.sh seed

# 3. payee.eth
script/ens/ens.sh register                                   # dry run: commit, warp, register, all simulated
BROADCAST=1 script/ens/ens.sh register                       # commit → wait ≥60 s → register → check
ENS_DEPLOYMENT=beta BROADCAST=1 script/ens/ens.sh register   # optional: also on the official Beta
script/ens/ens.sh check                                      # anytime; read-only
```

**Reruns.** A rerun of `register` skips a commitment that is already recorded and a name we already own. It
stops with a hint if the name uses a different resolver. If it stops after `commit`, rerun it with
`ENS_SECRET=<the printed salt>`.

**Resolver redeploy.** Run `BROADCAST=1 ens.sh deploy` with `PAYEE_REGISTRY` set. Then
`export PAYEE_RESOLVER=<new address>` and run `BROADCAST=1 ens.sh set-resolver` for each deployment.

**Optional variables.** `ENS_LABEL` (default `payee`), `ENS_OWNER` (the signer), `ENS_DURATION` (31536000),
`ENS_SUBREGISTRY` (registers a namespace with that subregistry instead of a resolver; set it or `PAYEE_RESOLVER`, never both), `T_NUMBER`
and `EXPECT_ADDR`.

## Fork proof

```sh
script/ens/fork-e2e.sh    # FORK_URL, ANVIL_PORT (8546) and ENS_DEPLOYMENTS ("hackathon beta") are optional
```

- It covers `deploy`, `seed`, `register`, `set-resolver` and `check`, plus viem, on both deployments.
- It never reads `.env`. Its signers come from anvil's `--mnemonic-random`.
- The fork keeps chain id 11155111, so broadcast files go to a temp dir. anvil takes `FORK_URL` as a command-line
  argument, so use a keyless endpoint.

## AP agent namespace: `ap.meigi.eth` (Beta only)

This gives the AI agent its own ENSv2 name and permissions, isolated from `payee.eth` and its resolver.

| Piece | Setup |
|---|---|
| `meigi.eth` | A pure namespace. Its subregistry is a `UserRegistry` proxy, and it has no resolver. |
| `ap.meigi.eth` | A token in that registry, owned by the deployer. It has its own `PermissionedResolver`. Both proxies come from `VerifiableFactory.deployProxy`. |
| Records | `addr(60)` is the AgentVault. It also has ENSIP-26 `agent-context` (Markdown) and `agent-endpoint[web]`, plus `meigi.vault`, `meigi.registry` and `meigi.payees` = `payee.eth`. The resolver's initializer writes them. |
| Agent key | Holds `ROLE_SET_TEXT` (`1<<4`) on the resource `keccak256("agent-status")` only, granted with `grantSetterRoles(setText(0x00, "agent-status", ""), agent)`. It can set `agent-status`. Setting `agent-context`, `agent-endpoint[web]` or `addr` reverts `EACUnauthorizedAccountRoles`. |

```sh
BROADCAST=1 script/ens/ens.sh agent-deploy          # prints AGENT_SUBREGISTRY=… and AGENT_RESOLVER=…
export AGENT_SUBREGISTRY=0x… AGENT_RESOLVER=0x…    # AGENT_ADDRESS comes from .env
ENS_LABEL=meigi ENS_SUBREGISTRY=$AGENT_SUBREGISTRY BROADCAST=1 script/ens/ens.sh register   # PAYEE_RESOLVER unset
BROADCAST=1 script/ens/ens.sh agent-setup           # canonical parent, then ap.meigi.eth, then the agent's scoped role
AGENT_STATUS=online BROADCAST=1 script/ens/ens.sh agent-status   # signed by AGENT_PRIVATE_KEY
script/ens/ens.sh agent-check                       # read-only
script/ens/agent-e2e.sh                             # the whole flow on a fork, plus eth_call denials and stock viem
```

- `agent-e2e.sh` uses a fresh parent label (`meigifork<random>`, or `AGENT_PARENT`) because meigi.eth is live on
  Sepolia. It clears any leftover `AGENT_*` or `ENS_*` exports first.
- To rotate the agent key, set the new `AGENT_ADDRESS` and `AGENT_PREVIOUS_ADDRESS=<old>`, then run
  `agent-setup`. It grants the new key and revokes the old one.

- The addresses of the factory and the two implementations are in `deployments/beta.env`. They come from
  `ensdomains/contracts-v2` `deployments/sepolia` at commit `71a3b733`, the 2026-09-15 redeploy. The main branch
  still lists the June set (root `0x11b5…`), which the canonical UniversalResolver no longer serves.
- The resolver's setters take the DNS-encoded name, and records are keyed by its namehash.
  `initialize(Grant[], bytes[] calls)` runs `calls` without permission checks. `grantRoles` is disabled, so
  scoped roles go through `grantSetterRoles`.
- A text key's scope is `keccak256(key)`. It holds on every name the resolver serves, and this one serves only
  `ap.meigi.eth`.
- ENSIP-25 and ENSIP-26 are drafts. `agent-status` is our own key.

## AgentVault primary name (ENSIP-19, Beta only)

Wallets and explorers show the AgentVault as `ap.meigi.eth` instead of `0x87A7…793B`.

- On the Beta, `addr.reverse` still lives on v1, and `ENSV1Resolver` mirrors it into v2.
- The vault is a contract, so it can't claim its own reverse record. The v2 `ReverseRegistrarAdapter` accepts the
  contract's `Ownable` owner instead. It checks that the caller is the account itself, its owner, or approved by its
  `IContractNamer`.
- `VaultName.s.sol`, signed by the vault owner:
  1. claims `<vault>.addr.reverse` with the v1 default resolver;
  2. sets the name there;
  3. sets the ENSIP-19 default name through `DefaultReverseRegistrarAdapter`.
- The script checks that the forward name resolves to the vault first, because a primary name must round-trip.

```sh
script/ens/ens.sh vault-name                  # simulate; only this command gets VAULT_OWNER_PRIVATE_KEY
BROADCAST=1 script/ens/ens.sh vault-name
script/ens/vault-e2e.sh                       # fork proof: impersonates the vault owner, so no key is read
```

## Claimed payee names (Beta only)

A verified company can hold `t<T-number>.payee.eth` as a real ENSv2 token and publish its own profile (url,
description, avatar), while every record a payment depends on stays bound to `PayeeRegistry`. This follows ENS's
subname guidance: tokenize when owners differ, and a pure-data name can move to tokens later without breaking its
records.

| Piece | Setup |
|---|---|
| Claims registry | A `UserRegistry` proxy from `VerifiableFactory`, managed by Meigi: the deployer holds the root roles. `claim-attach` makes it `payee.eth`'s subregistry, and its canonical parent is `payee.eth`. |
| `ClaimedPayeeResolver` | In `src/ens/`; the resolver of every claimed name. `addr` (every coin type), `name` and `meigi.*` (in any letter case) come from `payee.eth`'s `PayeeResolver`, and read as zero or empty if it reverts. Other text keys come from the company's profile, and only while the registry lists the payee as active under the controller that claimed the name. A dispute, or a new controller, hides the profile. |
| A claim | `t<T>` is minted in the claims registry to the payee's registry controller, with no roles, so the company can't re-point the name or give it a subregistry. Only an active payee can claim. |
| Profile resolver | One `PermissionedResolver` per company, since a resolver's scoped grants cover every name it serves. The company holds `ROLE_SET_TEXT`. The deployer holds the other roles except `ROLE_SET_ADDRESS` and its admin, which no account holds. |
| Unclaimed names | They are not in the claims registry, so the UniversalResolver falls back to `payee.eth`'s resolver as before. |

```sh
BROADCAST=1 script/ens/ens.sh claim-deploy     # prints CLAIMS_REGISTRY=… and CLAIMS_RESOLVER=…
export CLAIMS_REGISTRY=0x… CLAIMS_RESOLVER=0x…
BROADCAST=1 script/ens/ens.sh claim-attach     # payee.eth's subregistry = CLAIMS_REGISTRY
COMPANY_FUND_WEI=5000000000000000 BROADCAST=1 script/ens/ens.sh claim    # T_NUMBER defaults to 2011001234567
PROFILE_URL=https://shoji.example PROFILE_DESCRIPTION="…" BROADCAST=1 script/ens/ens.sh claim-profile
script/ens/ens.sh claim-check                  # read-only
BROADCAST=1 script/ens/ens.sh claim-detach     # rollback: payee.eth back to no subregistry, in one transaction
script/ens/claim-e2e.sh                        # fork proof: impersonates payee.eth's owner and the company
```

- `claim-profile` is signed by the company: `COMPANY_PRIVATE_KEY`, or the demo vendor's controller key
  (`DEMO_VENDOR_CONTROLLER_PRIVATE_KEY` in `.env`). No other command sees either key.
- `claim-check` simulates, from the company's address, setting an address, re-pointing the name and overriding
  `name` or `meigi.status`. Each is refused or has no effect. It then compares every reference name with the
  registry through the UniversalResolver.
- `check` accepts no subregistry on `payee.eth`, or exactly `CLAIMS_REGISTRY`. A claimed name must be answered by a
  `ClaimedPayeeResolver` that forwards to `payee.eth`'s resolver.
- The fork proof resolves four reference names with stock viem after every step (two active payees, a disputed
  one and an unknown T-number), and the output must stay byte-identical to the baseline.
- `claim-detach` leaves the registry, tokens and profiles deployed but unreachable, and `claim-attach` restores
  them. Meigi, not the company, can re-point or revoke a claim, and `setProfile(t, 0, 0)` hides a profile.
- `ClaimedPayeeResolver` pins `payee.eth`'s resolver and its registry when it is deployed. If `payee.eth` ever gets
  a new resolver, run `claim-detach` (or redeploy and re-point the claims); `check` fails until then.
- A claim expires with `payee.eth`'s expiry at claim time. An expired claim falls back to the wildcard: the money
  records stay the same and only the profile disappears.

## Verified ENSv2 facts

The source was verified on Blockscout for both deployments.

- `ETHRegistrar.makeCommitment(string label, address owner, bytes32 secret, IRegistry subregistry, address resolver, uint64 duration, bytes32 referrer)`
  returns `keccak256(abi.encode(...))` of the same fields. The payment token is not part of the commitment.
- `commit(bytes32)`. Then `register(string label, address owner, bytes32 secret, IRegistry subregistry, address resolver, uint64 duration, IERC20 paymentToken, bytes32 referrer)`,
  which pulls `base + premium` from `msg.sender` using `transferFrom`.
- The commitment must be 60 s to 24 h old (`MIN/MAX_COMMITMENT_AGE`). `MIN_REGISTER_DURATION` is 28 days. The
  fee is 8.000021 mUSDC per year for `payee`. The token is a MockERC20 with an open `mint`; the script mints the
  shortfall and approves exactly the price.
- The owner receives `ROLE_SET_RESOLVER`, `ROLE_SET_SUBREGISTRY` (each with its admin role) and `ROLE_CAN_TRANSFER_ADMIN`.
  `PermissionedRegistry.setResolver(uint256 labelhash, address)` needs `ROLE_SET_RESOLVER`; otherwise it reverts
  `EACUnauthorizedAccountRoles`. Renewals go through the registrar.
- The UniversalResolver requires only ERC-165 `IExtendedResolver` (`0x9061b923`) from a resolver it finds on a
  parent name. It does not use `resolveWithContext`. Without IERC7996 (`0x582de3e7`) it calls the resolver through
  its onchain batch path. A gateway is only involved if a resolver reverts `OffchainLookup`.

## Gotchas

- The name is minted as an ERC-1155 token to `ENS_OWNER`. An owner with code must implement
  `onERC1155Received`. That includes EIP-7702-delegated EOAs: anvil's well-known default accounts are delegated
  to sweeper contracts on Sepolia, so they fail as owners on a fork.
- `PayeeResolver` is bound to its parent at construction. A different label (e.g. `meigi.eth`) needs a resolver
  deployed with a matching `ENS_PARENT_DNS`, and `register` refuses a resolver built for another parent.
- The commitment binds the resolver, so deploy the resolver first. Re-pointing later costs one `setResolver`.
- Mint, approve and register are separate transactions. MockUSDC has an open `nuke(address)` that anyone can use
  to burn a balance; if it lands in between, `register` reverts. Rerun with `ENS_SECRET`.
- forge's cache (`contracts/cache/`, git-ignored) holds the RPC URL, and fork runs and real runs share it.
- A real run leaves `broadcast/*/11155111/` untracked (including `dry-run/`). Those files contain calldata, including
  the commit salt, which `register()` publishes anyway, but no keys.
