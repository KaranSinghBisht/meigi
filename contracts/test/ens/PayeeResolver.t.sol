// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {PayeeResolver} from "../../src/ens/PayeeResolver.sol";
import {MeigiFixture} from "../utils/MeigiFixture.sol";

contract PayeeResolverTest is MeigiFixture {
    bytes4 internal constant ADDR = 0x3b3b57de;
    bytes4 internal constant ADDR_COIN = 0xf1cb7e06;
    bytes internal constant PARENT = hex"0570617965650365746800"; // payee.eth
    string internal constant LABEL = "t2011001234567";

    PayeeResolver internal resolver;

    function setUp() public override {
        super.setUp();
        resolver = new PayeeResolver(IPayeeRegistry(address(registry)), PARENT);
        _register(VENDOR, payout);
    }

    /// DNS wire format of `<label>.payee.eth`.
    function _name(string memory label) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(bytes(label).length), label, PARENT);
    }

    function _addrOf(bytes memory name) internal view returns (address) {
        return abi.decode(resolver.resolve(name, abi.encodeWithSelector(ADDR, bytes32(0))), (address));
    }

    function _addr(string memory label) internal view returns (address) {
        return _addrOf(_name(label));
    }

    function _addrForCoin(uint256 coinType) internal view returns (bytes memory) {
        bytes memory call = abi.encodeWithSelector(ADDR_COIN, bytes32(0), coinType);
        return abi.decode(resolver.resolve(_name(LABEL), call), (bytes));
    }

    function _text(string memory label, string memory key) internal view returns (string memory) {
        bytes memory call = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), key);
        return abi.decode(resolver.resolve(_name(label), call), (string));
    }

    function test_addr_resolvesTheActivePayout() public view {
        assertEq(_addr(LABEL), payout);
    }

    function test_addr_followsTheTimelockWithoutLeakingThePendingAddress() public {
        _queueChange(VENDOR, newPayout);
        assertEq(_addr(LABEL), payout, "pending changes do not resolve");
        assertEq(_text(LABEL, "meigi.changePending"), "true");
        assertEq(_text(LABEL, "meigi.effectiveAt"), vm.toString(block.timestamp + CHANGE_DELAY));
        assertEq(_text(LABEL, "meigi.pending"), "", "the unconfirmed address is never published");

        vm.warp(block.timestamp + CHANGE_DELAY);
        assertEq(_addr(LABEL), newPayout);
        assertEq(_text(LABEL, "meigi.changePending"), "");
    }

    /// A queued payout resolves exactly at effectiveAt; one second earlier the current payout still does.
    function test_addr_switchesExactlyAtEffectiveAt() public {
        _queueChange(VENDOR, newPayout);
        uint256 effectiveAt = block.timestamp + CHANGE_DELAY;
        vm.warp(effectiveAt - 1);
        assertEq(_addr(LABEL), payout, "one second before effectiveAt");
        vm.warp(effectiveAt);
        assertEq(_addr(LABEL), newPayout, "at effectiveAt");
    }

    /// A dispute drops a queued change: it never lands, not even after the incumbent wins the dispute.
    function test_addr_aDisputeCancelsAQueuedChange() public {
        _queueChange(VENDOR, newPayout);
        vm.prank(attester);
        registry.fileDispute(VENDOR, address(1), bytes32(0));
        vm.prank(governance);
        registry.resolveDispute(_registration(VENDOR, payout, 1));
        vm.warp(block.timestamp + CHANGE_DELAY);
        registry.finalizeDispute(VENDOR);
        assertEq(_addr(LABEL), payout, "the incumbent's payout, not the dropped change");
        assertEq(_text(LABEL, "meigi.changePending"), "");
    }

    /// TNumber accepts an uppercase "T", so `T2011001234567.payee.eth` resolves too. That is harmless: it gives the
    /// same registry answer as the lowercase name, and normalizing clients (ENSIP-15) never send it.
    function test_addr_uppercaseLabelGivesTheSameAnswer() public view {
        assertEq(_addr("T2011001234567"), payout);
        assertEq(_text("T2011001234567", "name"), VENDOR_NAME);
    }

    function test_addr_failsClosed() public {
        assertEq(_addr("t8999900000001"), address(0), "unregistered");
        assertEq(_addr("not-a-t-number"), address(0), "not a T-number");

        vm.prank(attester);
        registry.fileDispute(VENDOR, address(1), bytes32(0));
        assertEq(_addr(LABEL), address(0), "disputed");
        assertEq(_text(LABEL, "meigi.status"), "disputed");
    }

    /// A disputed number has competing claimants, so no claimant's name or schedule is published.
    function test_text_disputedPayeePublishesOnlyItsStatus() public {
        _queueChange(VENDOR, newPayout);
        vm.prank(attester);
        registry.fileDispute(VENDOR, address(1), bytes32(0));
        assertEq(_text(LABEL, "meigi.status"), "disputed");
        assertEq(_text(LABEL, "meigi.tNumber"), "T2011001234567");
        assertEq(_text(LABEL, "meigi.registry"), vm.toString(address(registry)));
        assertEq(_text(LABEL, "name"), "", "no claimant's name");
        assertEq(_text(LABEL, "meigi.changePending"), "");
        assertEq(_text(LABEL, "meigi.effectiveAt"), "");
    }

    /// Review finding 7: only names exactly one label below the configured parent resolve.
    function test_addr_onlyAnswersForItsParent() public view {
        bytes memory otherParent = abi.encodePacked(uint8(14), LABEL, hex"086d656967692d6a700365746800"); // meigi-jp.eth
        assertEq(_addrOf(otherParent), address(0), "someone else's name pointed at this resolver");

        bytes memory deeper = abi.encodePacked(uint8(14), LABEL, uint8(3), "pay", PARENT);
        assertEq(_addrOf(deeper), address(0), "t....pay.payee.eth");

        bytes memory noTerminator = abi.encodePacked(uint8(14), LABEL);
        assertEq(_addrOf(noTerminator), address(0), "truncated name");

        assertEq(_addrOf(PARENT), address(0), "payee.eth itself");
    }

    function test_addrForCoin_ethAndThisChainOnly() public view {
        assertEq(_addrForCoin(60), abi.encodePacked(payout));
        assertEq(_addrForCoin(0x80000000 | block.chainid), abi.encodePacked(payout));
        assertEq(_addrForCoin(0).length, 0, "bitcoin");
        assertEq(_addrForCoin(0x80000000 | 137).length, 0, "another EVM chain");
    }

    /// ENSIP-19's default EVM coin type (chain id 0) is not served either: an address is only published per chain.
    function test_addrForCoin_defaultEvmCoinTypeIsEmpty() public view {
        assertEq(_addrForCoin(0x80000000).length, 0);
    }

    function test_text_exposesTheVerifiedRecord() public view {
        assertEq(_text(LABEL, "name"), VENDOR_NAME);
        assertEq(_text(LABEL, "meigi.tNumber"), "T2011001234567");
        assertEq(_text(LABEL, "meigi.status"), "active");
        assertEq(_text(LABEL, "meigi.changePending"), "");
        assertEq(_text(LABEL, "meigi.registry"), vm.toString(address(registry)));
        assertEq(_text(LABEL, "avatar"), "");
        assertEq(_text("t8999900000001", "name"), "", "unregistered");
    }

    function test_multicall_batchesRecordsAndIsolatesFailures() public view {
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeWithSelector(ADDR, bytes32(0));
        calls[1] = abi.encodeWithSignature("contenthash(bytes32)", bytes32(0)); // unsupported
        calls[2] = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "name");
        bytes memory out =
            resolver.resolve(_name(LABEL), abi.encodeWithSignature("multicall(bytes[])", calls));
        bytes[] memory results = abi.decode(out, (bytes[]));
        assertEq(abi.decode(results[0], (address)), payout);
        assertEq(results[1].length, 0, "one unsupported record doesn't sink the batch");
        assertEq(abi.decode(results[2], (string)), VENDOR_NAME);
    }

    function test_supportsInterface_advertisesOnlyENSIP10() public view {
        assertTrue(resolver.supportsInterface(0x9061b923));
        assertTrue(resolver.supportsInterface(0x01ffc9a7));
        assertFalse(resolver.supportsInterface(ADDR), "addr() is only reachable through resolve()");
        assertFalse(resolver.supportsInterface(0xffffffff));
    }

    function test_resolve_rejectsUnsupportedRecords() public {
        bytes4 contenthash = bytes4(keccak256("contenthash(bytes32)"));
        vm.expectRevert(abi.encodeWithSelector(PayeeResolver.UnsupportedRecord.selector, contenthash));
        resolver.resolve(_name(LABEL), abi.encodeWithSelector(contenthash, bytes32(0)));

        vm.expectRevert(abi.encodeWithSelector(PayeeResolver.UnsupportedRecord.selector, bytes4(0)));
        resolver.resolve(_name(LABEL), hex"3b3b");
    }

    function test_constructor_rejectsAMalformedParent() public {
        vm.expectRevert(PayeeResolver.InvalidParentName.selector);
        new PayeeResolver(IPayeeRegistry(address(registry)), hex"05706179656503657468");
    }
}
