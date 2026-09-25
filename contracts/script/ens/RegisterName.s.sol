// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Script, console} from "forge-std/Script.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";

/// @notice Registers `<ENS_LABEL>.eth` (payee.eth) on ENSv2 with PAYEE_RESOLVER as its resolver and no
///         subregistry: one wildcard resolver answers every `t<13 digits>.payee.eth`.
/// @dev Commit-reveal needs real time between two transactions, so `ens.sh register` runs `commit()`, waits
///      MIN_COMMITMENT_AGE (60s), then runs `register()`. `dryRun()` simulates the whole flow with a time warp
///      and sends nothing. Env: DEPLOYER_PRIVATE_KEY, PAYEE_RESOLVER, ENS_SECRET (commit and register),
///      optional ENS_LABEL, ENS_OWNER (the signer), ENS_DURATION (365 days), and deployments/<name>.env.
contract RegisterName is Script {
    struct Request {
        string label;
        address owner;
        bytes32 secret;
        address resolver;
        uint64 duration;
    }

    function commit() external {
        (EnsV2 memory ens, uint256 pk, Request memory r) = _setup(true);
        if (_alreadyOwned(ens, r)) return;
        bytes32 commitment = _commitment(ens, r);
        uint64 at = ens.registrar.commitmentAt(commitment);
        if (at != 0 && block.timestamp < uint256(at) + ens.registrar.MAX_COMMITMENT_AGE()) {
            console.log("Commitment already recorded at %s; not committing again.", at);
            return;
        }
        vm.startBroadcast(pk);
        ens.registrar.commit(commitment);
        vm.stopBroadcast();
        console.log("Committed %s.eth: %s", r.label, vm.toString(commitment));
    }

    function register() external {
        (EnsV2 memory ens, uint256 pk, Request memory r) = _setup(true);
        if (_alreadyOwned(ens, r)) return;
        _requireMatureCommitment(ens, _commitment(ens, r));
        uint256 price = _price(ens, r);
        vm.startBroadcast(pk);
        _payAndRegister(ens, r, vm.addr(pk), price);
        vm.stopBroadcast();
        _requireRegistered(ens, r, price);
    }

    /// @notice Simulates commit, the wait and register against live state. Uses pranks, so even
    ///         `--broadcast` has nothing to send.
    function dryRun() external {
        (EnsV2 memory ens, uint256 pk, Request memory r) = _setup(false);
        if (r.secret == bytes32(0)) r.secret = keccak256("meigi-ens-dry-run");
        if (_alreadyOwned(ens, r)) return;
        address payer = vm.addr(pk);
        bytes32 commitment = _commitment(ens, r); // outside the prank, which only covers the next call
        vm.prank(payer);
        ens.registrar.commit(commitment);
        vm.warp(block.timestamp + ens.registrar.MIN_COMMITMENT_AGE());
        uint256 price = _price(ens, r);
        vm.startPrank(payer);
        _payAndRegister(ens, r, payer, price);
        vm.stopPrank();
        _requireRegistered(ens, r, price);
        console.log("Dry run passed. Nothing was sent.");
    }

    /// @notice Points an already registered name at PAYEE_RESOLVER, e.g. after redeploying the resolver.
    ///         The signer needs ROLE_SET_RESOLVER on the name; the owner receives it at registration.
    function setResolver() external {
        (EnsV2 memory ens, uint256 pk, Request memory r) = _setup(false);
        if (ens.ethRegistry.getResolver(r.label) == r.resolver) {
            console.log("%s.eth already uses %s", r.label, r.resolver);
            return;
        }
        uint256 id = EnsV2Lib.labelId(r.label);
        require(
            ens.ethRegistry.hasRoles(id, EnsV2Lib.ROLE_SET_RESOLVER, vm.addr(pk)),
            "Signer lacks ROLE_SET_RESOLVER on the name; setResolver would revert EACUnauthorizedAccountRoles"
        );
        vm.startBroadcast(pk);
        ens.ethRegistry.setResolver(id, r.resolver);
        vm.stopBroadcast();
        require(ens.ethRegistry.getResolver(r.label) == r.resolver, "resolver not updated");
        console.log("%s.eth now resolves through %s", r.label, r.resolver);
    }

    function _setup(bool needSecret) private view returns (EnsV2 memory ens, uint256 pk, Request memory r) {
        ens = EnsV2Lib.load();
        pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address signer = vm.addr(pk);
        require(
            vm.envOr("DEPLOYER_ADDRESS", signer) == signer,
            "DEPLOYER_ADDRESS does not match DEPLOYER_PRIVATE_KEY"
        );
        r.label = vm.envOr("ENS_LABEL", string("payee"));
        r.owner = vm.envOr("ENS_OWNER", signer);
        r.secret = vm.envOr("ENS_SECRET", bytes32(0));
        r.resolver = vm.envAddress("PAYEE_RESOLVER");
        r.duration = SafeCast.toUint64(vm.envOr("ENS_DURATION", uint256(365 days)));
        require(
            !needSecret || r.secret != bytes32(0),
            "Set ENS_SECRET to the same 32-byte salt for commit and register"
        );
        require(r.owner != address(0), "ENS_OWNER is zero");
        if (r.owner.code.length != 0) {
            console.log(
                "Note: ENS_OWNER has code (a contract or an EIP-7702 delegation), so it must accept ERC-1155."
            );
        }
        require(
            r.duration >= ens.registrar.MIN_REGISTER_DURATION(), "ENS_DURATION is below the registrar minimum"
        );
        require(
            EnsV2Lib.supportsExtendedResolver(r.resolver), "PAYEE_RESOLVER does not support IExtendedResolver"
        );
        require(
            EnsV2Lib.servesParent(r.resolver, r.label), "PAYEE_RESOLVER was deployed for another parent name"
        );
    }

    /// @dev Makes reruns safe: a name we already own needs neither commit nor register.
    function _alreadyOwned(EnsV2 memory ens, Request memory r) private view returns (bool) {
        if (ens.registrar.isAvailable(r.label)) return false;
        address owner = ens.ethRegistry.getOwner(EnsV2Lib.labelId(r.label));
        require(owner == r.owner, string.concat(r.label, ".eth is taken on this deployment"));
        require(
            ens.ethRegistry.getResolver(r.label) == r.resolver,
            "Already registered with another resolver: run `ens.sh set-resolver`"
        );
        console.log("%s.eth is already registered to %s; nothing to do.", r.label, owner);
        return true;
    }

    /// @dev The registrar's own encoding: keccak256(abi.encode(label, owner, secret, subregistry, resolver,
    ///      duration, referrer)). The payment token is not part of the commitment.
    function _commitment(EnsV2 memory ens, Request memory r) private pure returns (bytes32) {
        return ens.registrar.makeCommitment(r.label, r.owner, r.secret, address(0), r.resolver, r.duration, 0);
    }

    function _requireMatureCommitment(EnsV2 memory ens, bytes32 commitment) private view {
        uint256 at = ens.registrar.commitmentAt(commitment);
        require(at != 0, "No commitment for these parameters: run commit() first with the same ENS_SECRET");
        uint256 readyAt = at + ens.registrar.MIN_COMMITMENT_AGE();
        require(
            block.timestamp >= readyAt,
            string.concat("Commitment too new; register at ", vm.toString(readyAt))
        );
        require(block.timestamp < at + ens.registrar.MAX_COMMITMENT_AGE(), "Commitment expired: commit again");
    }

    function _price(EnsV2 memory ens, Request memory r) private view returns (uint256) {
        (uint256 base, uint256 premium) =
            ens.registrar.getRegisterPrice(r.label, r.duration, address(ens.paymentToken));
        return base + premium;
    }

    /// @dev Mints only the shortfall of the mock fee token and approves exactly the price.
    function _payAndRegister(EnsV2 memory ens, Request memory r, address payer, uint256 price) private {
        uint256 balance = ens.paymentToken.balanceOf(payer);
        if (balance < price) ens.paymentToken.mint(payer, price - balance);
        if (ens.paymentToken.allowance(payer, address(ens.registrar)) < price) {
            ens.paymentToken.approve(address(ens.registrar), price);
        }
        ens.registrar
            .register(
                r.label, r.owner, r.secret, address(0), r.resolver, r.duration, address(ens.paymentToken), 0
            );
    }

    function _requireRegistered(EnsV2 memory ens, Request memory r, uint256 price) private view {
        uint256 id = EnsV2Lib.labelId(r.label);
        require(ens.ethRegistry.getOwner(id) == r.owner, "owner mismatch after register");
        require(ens.ethRegistry.getResolver(r.label) == r.resolver, "resolver mismatch after register");
        require(ens.ethRegistry.getSubregistry(r.label) == address(0), "unexpected subregistry");
        require(
            ens.ethRegistry.hasRoles(id, EnsV2Lib.ROLE_SET_RESOLVER, r.owner), "owner lacks ROLE_SET_RESOLVER"
        );
        console.log("Registered %s.eth to %s with resolver %s", r.label, r.owner, r.resolver);
        console.log("Fee %s token units; expires at %s", price, ens.ethRegistry.getExpiry(id));
    }
}
