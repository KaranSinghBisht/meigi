# payee.eth on ENSv2 (Sepolia)

These scripts register `payee.eth` on ENSv2 with our `PayeeResolver` as its resolver and **no subregistry**, which
ENS calls the "pure data" setup. The UniversalResolver walks root → `eth` → `payee`, finds no deeper registry, and
hands every `t<13 digits>.payee.eth` lookup to that one resolver. It calls `resolve(dnsName, data)` with the full
DNS-encoded name (ENSIP-10), and the resolver answers from `PayeeRegistry`.

| File | Purpose |
|---|---|
| `ens.sh` | Entry point: `deploy`, `seed`, `register`, `set-resolver`, `check`. It only simulates unless `BROADCAST=1`. |
| `fork-e2e.sh` | Full proof on an anvil fork of Sepolia, against both ENSv2 deployments. Sends nothing to a real network. |
| `RegisterName.s.sol` | `commit()`, `register()`, `dryRun()` (full flow with pranks and a time warp), `setResolver()` |
| `CheckName.s.sol` | Read-only. Resolves through the UniversalResolver, compares with the registry, and checks that other names fail closed |
| `DeployPayeeStack.s.sol` | Registry and resolver for fork runs, or only a resolver when `PAYEE_REGISTRY` is set (resolver redeploys) |
| `SeedDemoPayee.s.sol` | Attester registers the demo payee `T2011001234567` (test-fixture data) |
| `EnsV2.sol` | ENSv2 interfaces (from the verified source), DNS encoding, and deployment wiring checks |
| `deployments/*.env` | ENSv2 address tables: `beta` (default) and `hackathon` |
| `check-viem.mjs` | viem `getEnsAddress` / `getEnsText`, called the way a wallet calls them |

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
`T_NUMBER` and `EXPECT_ADDR`.

## Fork proof

```sh
script/ens/fork-e2e.sh    # FORK_URL, ANVIL_PORT (8546) and ENS_DEPLOYMENTS ("hackathon beta") are optional
```

- It covers `deploy`, `seed`, `register`, `set-resolver` and `check`, plus viem, on both deployments.
- It never reads `.env`. Its signers come from anvil's `--mnemonic-random`.
- The fork keeps chain id 11155111, so broadcast files go to a temp dir. anvil takes `FORK_URL` as a command-line
  argument, so use a keyless endpoint.

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
