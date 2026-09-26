// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Script, console} from "forge-std/Script.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";
import {
    IDefaultReverseRegistrarAdapter,
    INameSetter,
    IReverseRegistrarAdapter,
    IReverseUniversalResolver
} from "./Reverse.sol";

interface IPayeeResolverRegistry {
    function registry() external view returns (IPayeeRegistry);
}

/// @notice Gives a payee's payout wallet the payee's name as its primary name (ENSIP-19), e.g.
///         0x9B4f…47e4 → t2011001234567.payee.eth, so a wallet shows the company's name next to the address.
///         - `fund()`, signed by the deployer, tops the wallet up to PAYOUT_FUND_WEI (default 0.003 ETH) for gas.
///         - `name()`, signed by the wallet itself, claims its `<addr>.addr.reverse` node, sets the name there, and
///           sets the ENSIP-19 default name for every EVM chain.
///         A primary name must round-trip, so this only runs while the name resolves to the wallet, which it does only
///         while the registry lists the wallet as the payee's active payout. After a payout change the old wallet's
///         reverse record no longer round-trips, and clients stop showing it.
/// @dev Env: T_NUMBER; for fund(), DEPLOYER_PRIVATE_KEY (or, on a fork, the unlocked DEPLOYER_ADDRESS); for name(),
///      PAYOUT_PRIVATE_KEY (or the unlocked PAYOUT_ADDRESS). Plus ENS_REVERSE_ADAPTER and ENS_DEFAULT_REVERSE_ADAPTER from
///      deployments/beta.env.
contract PayoutName is Script {
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    uint256 private constant COIN_TYPE_ETH = 60;

    function fund() external {
        (address payout,) = _payee();
        uint256 target = vm.envOr("PAYOUT_FUND_WEI", uint256(0.003 ether));
        if (payout.balance >= target) {
            console.log("%s already has gas", payout);
            return;
        }
        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        (bool ok,) = payout.call{value: target - payout.balance}("");
        vm.stopBroadcast();
        require(ok, "funding the payout wallet failed");
        console.log("Funded %s to %s wei", payout, target);
    }

    function name() external {
        (address payout, string memory ensName) = _payee();
        require(
            EnsV2Lib.signer("PAYOUT_PRIVATE_KEY", "PAYOUT_ADDRESS") == payout,
            "sign as the payee's payout wallet"
        );
        EnsV2 memory ens = EnsV2Lib.load();
        (bytes memory out,) = ens.universalResolver
            .resolve(EnsV2Lib.dnsEncode(ensName), abi.encodeWithSelector(ADDR, vm.ensNamehash(ensName)));
        require(abi.decode(out, (address)) == payout, "the name does not resolve to this wallet");
        IReverseRegistrarAdapter adapter = IReverseRegistrarAdapter(vm.envAddress("ENS_REVERSE_ADAPTER"));
        address resolver = adapter.REVERSE_REGISTRAR().defaultResolver();

        EnsV2Lib.startBroadcast("PAYOUT_PRIVATE_KEY", "PAYOUT_ADDRESS");
        bytes32 node = adapter.claim(payout, resolver);
        INameSetter(resolver).setName(node, ensName);
        IDefaultReverseRegistrarAdapter(vm.envAddress("ENS_DEFAULT_REVERSE_ADAPTER")).setName(payout, ensName);
        vm.stopBroadcast();

        (string memory primary,,) = IReverseUniversalResolver(address(ens.universalResolver))
            .reverse(abi.encodePacked(payout), COIN_TYPE_ETH);
        require(
            keccak256(bytes(primary)) == keccak256(bytes(ensName)),
            "reverse resolution does not return the name"
        );
        console.log("%s is now the primary name of %s", ensName, payout);
    }

    /// @dev The payee's active payout, from the registry, and its name `t<T>.payee.eth`.
    function _payee() private view returns (address payout, string memory ensName) {
        uint64 tNumber = SafeCast.toUint64(vm.envUint("T_NUMBER"));
        IPayeeRegistry registry =
            IPayeeResolverRegistry(EnsV2Lib.load().ethRegistry.getResolver("payee")).registry();
        payout = registry.payoutOf(tNumber);
        require(payout != address(0), "the payee is not active");
        ensName = string.concat("t", vm.toString(uint256(tNumber)), ".payee.eth");
    }
}
