// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PayeeResolver} from "../src/ens/PayeeResolver.sol";
import {AgentVault} from "../src/payments/AgentVault.sol";
import {PayRouter} from "../src/payments/PayRouter.sol";
import {IPayeeRegistry} from "../src/registry/IPayeeRegistry.sol";
import {PayeeRegistry} from "../src/registry/PayeeRegistry.sol";
import {MockJPYC} from "../src/token/MockJPYC.sol";

/// Deploys the Meigi contracts with separate keys for governance, attester, vault owner and agent.
/// Env: DEPLOYER_PRIVATE_KEY, ATTESTER_ADDRESS, AGENT_ADDRESS, VAULT_OWNER_ADDRESS
/// Optional: CHANGE_DELAY (default 72h), VENDOR_DELAY (default 1h), ENS_PARENT_DNS (default payee.eth),
///           TOKEN_ADDRESS (default: deploy MockJPYC)
contract Deploy is Script {
    struct Deployment {
        address registry;
        address resolver;
        address router;
        address token;
        address vault;
    }

    function run() external returns (Deployment memory d) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address attester = vm.envAddress("ATTESTER_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address vaultOwner = vm.envAddress("VAULT_OWNER_ADDRESS");
        address governance = vm.addr(deployerKey);
        require(attester != governance && vaultOwner != governance && agent != governance, "keys must differ");
        require(agent != vaultOwner && agent != attester, "the agent key must hold no other role");

        vm.startBroadcast(deployerKey);
        PayeeRegistry registry = new PayeeRegistry(governance, uint64(vm.envOr("CHANGE_DELAY", uint256(72 hours))));
        registry.setAttester(attester, true);
        d.registry = address(registry);
        d.resolver = address(new PayeeResolver(IPayeeRegistry(d.registry), _parentName()));
        d.router = address(new PayRouter(IPayeeRegistry(d.registry)));
        d.token = vm.envOr("TOKEN_ADDRESS", address(0));
        if (d.token == address(0)) d.token = address(new MockJPYC("Mock JPY Coin", "mJPYC"));
        uint64 vendorDelay = uint64(vm.envOr("VENDOR_DELAY", uint256(1 hours)));
        d.vault = address(new AgentVault(vaultOwner, agent, IERC20(d.token), IPayeeRegistry(d.registry), vendorDelay));
        vm.stopBroadcast();

        _record(d);
    }

    function _parentName() private view returns (bytes memory) {
        return vm.envOr("ENS_PARENT_DNS", bytes(hex"0570617965650365746800")); // payee.eth
    }

    function _record(Deployment memory d) private {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "registry", d.registry);
        vm.serializeAddress(key, "resolver", d.resolver);
        vm.serializeAddress(key, "router", d.router);
        vm.serializeAddress(key, "token", d.token);
        string memory json = vm.serializeAddress(key, "vault", d.vault);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
