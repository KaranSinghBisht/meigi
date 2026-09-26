// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {PayRouter} from "../src/payments/PayRouter.sol";
import {IPayeeRegistry} from "../src/registry/IPayeeRegistry.sol";
import {PayeeRegistry} from "../src/registry/PayeeRegistry.sol";

/// A minimal deploy for Mizuhiki's Awaji testnet, where gas is scarce: only the registry and the
/// token-agnostic router. No PayeeResolver (ENS lives on Sepolia, not Awaji), no AgentVault or MockJPYC
/// (the agent demo runs on Sepolia; Awaji pays in Mizuhiki's own predeployed MJPY and MUSD instead).
/// One key does everything, to keep the funded-key count at one: it is governance (Ownable owner, same
/// as Deploy.s.sol's `governance = vm.addr(deployerKey)`) and is also granted attester rights directly,
/// rather than Deploy.s.sol's separate ATTESTER_ADDRESS.
/// Env: DEPLOYER_PRIVATE_KEY. Optional: CHANGE_DELAY (default 72h, same default as Deploy.s.sol),
///      MJPY_ADDRESS (default: Awaji's predeployed MJPY, recorded as this deployment's "token" for
///      apagent's MultiBaas linker even though this script does not deploy it).
contract DeployAwaji is Script {
    struct Deployment {
        address registry;
        address router;
        address token;
    }

    function run() external returns (Deployment memory d) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        PayeeRegistry registry = new PayeeRegistry(deployer, uint64(vm.envOr("CHANGE_DELAY", uint256(72 hours))));
        registry.setAttester(deployer, true);
        d.registry = address(registry);
        d.router = address(new PayRouter(IPayeeRegistry(d.registry)));
        vm.stopBroadcast();

        d.token = vm.envOr("MJPY_ADDRESS", 0x78f5f0Ac4EF201618b97638ded959b155c4f4B04);
        _record(d);
    }

    function _record(Deployment memory d) private {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "registry", d.registry);
        vm.serializeAddress(key, "router", d.router);
        string memory json = vm.serializeAddress(key, "token", d.token);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
