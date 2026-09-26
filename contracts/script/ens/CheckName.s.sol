// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Script, console} from "forge-std/Script.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";

interface IPayeeResolverView {
    function registry() external view returns (IPayeeRegistry);
}

/// @notice Read-only proof that `t<T_NUMBER>.<ENS_LABEL>.eth` resolves through the deployment's
///         UniversalResolver exactly as the PayeeRegistry says, and that other names fail closed.
///         Reverts on any mismatch.
/// @dev Env: optional ENS_LABEL (payee), T_NUMBER (2011001234567), EXPECT_ADDR (pins the answer, e.g. zero
///      once the payee is disputed), PAYEE_RESOLVER / PAYEE_REGISTRY (pin the name's resolver and its
///      registry) and UNKNOWN_T_NUMBER (9999999999999; must be unregistered, and on the live Sepolia
///      registry T8999900000001 is the x402 demo merchant).
contract CheckName is Script {
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant ADDR_COIN = 0xf1cb7e06; // addr(bytes32,uint256)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)

    function run() external view {
        EnsV2 memory ens = EnsV2Lib.load();
        string memory label = vm.envOr("ENS_LABEL", string("payee"));
        address resolver = ens.ethRegistry.getResolver(label);
        require(resolver != address(0), string.concat(label, ".eth has no resolver on this deployment"));
        // A subregistry could give `t<T>` its own resolver and override the wildcard, so a payee name has none.
        require(
            ens.ethRegistry.getSubregistry(label) == address(0),
            string.concat(label, ".eth has a subregistry")
        );
        if (vm.envExists("PAYEE_RESOLVER")) {
            require(resolver == vm.envAddress("PAYEE_RESOLVER"), "the name's resolver is not PAYEE_RESOLVER");
        }
        IPayeeRegistry registry = IPayeeResolverView(resolver).registry();
        if (vm.envExists("PAYEE_REGISTRY")) {
            require(
                address(registry) == vm.envAddress("PAYEE_REGISTRY"), "the resolver reads another registry"
            );
        }
        uint64 tNumber = SafeCast.toUint64(vm.envOr("T_NUMBER", uint256(2011001234567)));
        string memory parent = string.concat(label, ".eth");
        console.log("UniversalResolver %s, resolver %s", address(ens.universalResolver), resolver);
        _checkPayee(ens, resolver, registry, tNumber, parent);
        _checkFailsClosed(ens, registry, tNumber, parent);
    }

    function _checkPayee(
        EnsV2 memory ens,
        address resolver,
        IPayeeRegistry registry,
        uint64 tNumber,
        string memory parent
    ) private view {
        string memory name = string.concat("t", vm.toString(uint256(tNumber)), ".", parent);
        address expected = registry.payoutOf(tNumber); // zero unless the payee is active
        if (vm.envExists("EXPECT_ADDR")) {
            require(vm.envAddress("EXPECT_ADDR") == expected, "the registry does not hold EXPECT_ADDR");
        }

        (address resolved, address answeredBy) = _addr(ens, name);
        require(answeredBy == resolver, "the UniversalResolver used another resolver");
        require(resolved == expected, "addr(node) disagrees with the registry");

        bytes memory call = abi.encodeWithSelector(ADDR_COIN, vm.ensNamehash(name), 60);
        bytes memory coin60 = abi.decode(_resolve(ens, name, call), (bytes));
        bytes memory expected60 = expected == address(0) ? bytes("") : abi.encodePacked(expected);
        require(keccak256(coin60) == keccak256(expected60), "addr(node, 60) disagrees with the registry");

        console.log(name);
        console.log("  addr(60)      %s (registry payoutOf: %s)", resolved, expected);
        console.log("  text(name)    %s", _checkLegalName(ens, name, registry, tNumber));
        console.log("  meigi.status  %s", _text(ens, name, "meigi.status"));
    }

    /// @dev The resolver publishes the legal name of an active payee only; a disputed one shows just its status.
    function _checkLegalName(EnsV2 memory ens, string memory name, IPayeeRegistry registry, uint64 tNumber)
        private
        view
        returns (string memory legalName)
    {
        IPayeeRegistry.PayeeView memory payee = registry.payeeOf(tNumber);
        string memory published = payee.status == IPayeeRegistry.Status.Active ? payee.legalName : "";
        legalName = _text(ens, name, "name");
        require(
            keccak256(bytes(legalName)) == keccak256(bytes(published)),
            "text(name) disagrees with the registry"
        );
    }

    function _checkFailsClosed(
        EnsV2 memory ens,
        IPayeeRegistry registry,
        uint64 tNumber,
        string memory parent
    ) private view {
        uint64 unknown = SafeCast.toUint64(vm.envOr("UNKNOWN_T_NUMBER", uint256(9999999999999)));
        require(
            registry.payeeOf(unknown).status == IPayeeRegistry.Status.None, "UNKNOWN_T_NUMBER is registered"
        );
        string[4] memory names = [
            string.concat("t", vm.toString(uint256(unknown)), ".", parent), // unregistered T-number
            parent, // the parent name itself
            string.concat("not-a-t-number.", parent),
            string.concat("t", vm.toString(uint256(tNumber)), ".x.", parent) // two labels below the parent
        ];
        for (uint256 i; i < names.length; i++) {
            (address resolved,) = _addr(ens, names[i]);
            require(resolved == address(0), string.concat(names[i], " should resolve to zero"));
            console.log("%s -> %s", names[i], resolved);
        }
    }

    function _addr(EnsV2 memory ens, string memory name)
        private
        view
        returns (address resolved, address answeredBy)
    {
        bytes memory out;
        bytes memory call = abi.encodeWithSelector(ADDR, vm.ensNamehash(name));
        (out, answeredBy) = ens.universalResolver.resolve(EnsV2Lib.dnsEncode(name), call);
        resolved = abi.decode(out, (address));
    }

    function _text(EnsV2 memory ens, string memory name, string memory key)
        private
        view
        returns (string memory)
    {
        bytes memory call = abi.encodeWithSelector(TEXT, vm.ensNamehash(name), key);
        return abi.decode(_resolve(ens, name, call), (string));
    }

    function _resolve(EnsV2 memory ens, string memory name, bytes memory call)
        private
        view
        returns (bytes memory out)
    {
        (out,) = ens.universalResolver.resolve(EnsV2Lib.dnsEncode(name), call);
    }
}
