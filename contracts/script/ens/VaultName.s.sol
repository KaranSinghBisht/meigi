// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";

interface IOwnable {
    function owner() external view returns (address);
}

/// @dev v2 adapters that let a contract's Ownable owner (or its IContractNamer) name the contract. See the
///      reverse-resolution docs, "Contract Account Adapters". Source verified on Blockscout for the Beta.
interface IReverseRegistrarAdapter {
    function REVERSE_REGISTRAR() external view returns (IReverseRegistrar);
    function claim(address account, address resolver) external returns (bytes32 node);
}

interface IDefaultReverseRegistrarAdapter {
    function setName(address account, string calldata name) external;
}

interface IReverseRegistrar {
    function defaultResolver() external view returns (address);
}

interface INameSetter {
    function setName(bytes32 node, string calldata name) external;
}

interface IReverseUniversalResolver {
    function reverse(bytes calldata lookupAddress, uint256 coinType)
        external
        view
        returns (string memory name, address resolver, address reverseResolver);
}

/// @notice Gives the AgentVault the primary name `ap.meigi.eth` (ENSIP-19), signed by the vault's Ownable owner, so
///         wallets and explorers show the name instead of the address.
/// @dev On the Beta, `addr.reverse` still lives on v1, and ENSV1Resolver mirrors it into v2. The owner claims the
///      vault's `<addr>.addr.reverse` node through the v2 ReverseRegistrarAdapter, then sets the name on the v1
///      default resolver. DefaultReverseRegistrarAdapter also sets the ENSIP-19 default name for every EVM chain.
///      Env: VAULT_OWNER_PRIVATE_KEY (or, on a fork, the unlocked VAULT_OWNER_ADDRESS), plus ENS_REVERSE_ADAPTER and
///      ENS_DEFAULT_REVERSE_ADAPTER from deployments/beta.env. Optional: AGENT_VAULT (default:
///      deployments/11155111.json) and VAULT_NAME (ap.meigi.eth).
contract VaultName is Script {
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    uint256 private constant COIN_TYPE_ETH = 60;

    function run() external {
        address vault = EnsV2Lib.envAddressOrZero("AGENT_VAULT");
        if (vault == address(0)) {
            vault = vm.parseJsonAddress(vm.readFile("deployments/11155111.json"), ".vault");
        }
        string memory name = vm.envOr("VAULT_NAME", string("ap.meigi.eth"));
        address owner = EnsV2Lib.signer("VAULT_OWNER_PRIVATE_KEY", "VAULT_OWNER_ADDRESS");
        require(IOwnable(vault).owner() == owner, "the signer is not the vault's owner");
        EnsV2 memory ens = EnsV2Lib.load();
        _requireForward(ens, name, vault);
        IReverseRegistrarAdapter adapter = IReverseRegistrarAdapter(vm.envAddress("ENS_REVERSE_ADAPTER"));
        address resolver = adapter.REVERSE_REGISTRAR().defaultResolver();

        EnsV2Lib.startBroadcast("VAULT_OWNER_PRIVATE_KEY", "VAULT_OWNER_ADDRESS");
        bytes32 node = adapter.claim(vault, resolver);
        INameSetter(resolver).setName(node, name);
        IDefaultReverseRegistrarAdapter(vm.envAddress("ENS_DEFAULT_REVERSE_ADAPTER")).setName(vault, name);
        vm.stopBroadcast();

        (string memory primary,,) = IReverseUniversalResolver(address(ens.universalResolver))
            .reverse(abi.encodePacked(vault), COIN_TYPE_ETH);
        require(
            keccak256(bytes(primary)) == keccak256(bytes(name)), "reverse resolution does not return the name"
        );
        console.log("%s is now the primary name of %s", name, vault);
    }

    /// @dev ENSIP-19 primary names must round-trip: the name has to resolve to the vault first.
    function _requireForward(EnsV2 memory ens, string memory name, address vault) private view {
        (bytes memory out,) = ens.universalResolver
            .resolve(EnsV2Lib.dnsEncode(name), abi.encodeWithSelector(ADDR, vm.ensNamehash(name)));
        require(abi.decode(out, (address)) == vault, "the name does not resolve to the vault");
    }
}
