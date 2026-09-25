// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Script, console} from "forge-std/Script.sol";
import {PayeeResolver} from "../../src/ens/PayeeResolver.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";
import {EnsV2Lib} from "./EnsV2.sol";

/// @notice Deploys a PayeeRegistry (governance: the deployer) and a PayeeResolver bound to `<ENS_LABEL>.eth`.
///         With PAYEE_REGISTRY set, deploys only a resolver for that registry.
/// @dev Env: DEPLOYER_PRIVATE_KEY; optional ENS_LABEL (payee), PAYEE_REGISTRY, ATTESTER_ADDRESS (allow-listed
///      on a new registry) and CHANGE_DELAY (72 hours). The resolver is ENS-deployment agnostic: the same one
///      can serve payee.eth on both deployments in deployments/.
contract DeployPayeeStack is Script {
    function run() external returns (address registry, address resolver) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        bytes memory parent =
            EnsV2Lib.dnsEncode(string.concat(vm.envOr("ENS_LABEL", string("payee")), ".eth"));
        registry = vm.envOr("PAYEE_REGISTRY", address(0));
        address attester = vm.envOr("ATTESTER_ADDRESS", address(0));
        uint64 delay = SafeCast.toUint64(vm.envOr("CHANGE_DELAY", uint256(72 hours)));

        if (registry == address(0)) {
            // Fresh registries are for fork tests only (ens.sh refuses this on a real RPC); keep roles separate anyway.
            require(attester != address(0) && attester != vm.addr(pk), "ATTESTER_ADDRESS must be set and differ from the deployer");
        }

        vm.startBroadcast(pk);
        if (registry == address(0)) {
            PayeeRegistry fresh = new PayeeRegistry(vm.addr(pk), delay);
            fresh.setAttester(attester, true);
            registry = address(fresh);
        }
        resolver = address(new PayeeResolver(IPayeeRegistry(registry), parent));
        vm.stopBroadcast();

        console.log("PAYEE_REGISTRY=%s", registry);
        console.log("PAYEE_RESOLVER=%s", resolver);
    }
}
