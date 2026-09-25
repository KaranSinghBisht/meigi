// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayeeResolver} from "../../src/ens/PayeeResolver.sol";
import {MeigiFixture} from "../utils/MeigiFixture.sol";

contract PayeeResolverTest is MeigiFixture {
    bytes4 internal constant ADDR = 0x3b3b57de;
    bytes4 internal constant ADDR_COIN = 0xf1cb7e06;
    string internal constant LABEL = "t2011001234567";

    PayeeResolver internal resolver;

    function setUp() public override {
        super.setUp();
        resolver = new PayeeResolver(registry);
        _register(VENDOR, payout);
    }

    /// DNS wire format of `<label>.payee.eth`.
    function _name(string memory label) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(bytes(label).length), label, uint8(5), "payee", uint8(3), "eth", uint8(0));
    }

    function _addr(string memory label) internal view returns (address) {
        bytes memory out = resolver.resolve(_name(label), abi.encodeWithSelector(ADDR, bytes32(0)));
        return abi.decode(out, (address));
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

    function test_addr_followsTheTimelock() public {
        _queueChange(VENDOR, newPayout);
        assertEq(_addr(LABEL), payout, "pending changes do not resolve");
        assertEq(_text(LABEL, "meigi.pending"), vm.toString(newPayout));
        assertEq(_text(LABEL, "meigi.effectiveAt"), vm.toString(block.timestamp + CHANGE_DELAY));

        vm.warp(block.timestamp + CHANGE_DELAY);
        assertEq(_addr(LABEL), newPayout);
        assertEq(_text(LABEL, "meigi.pending"), "");
    }

    function test_addr_failsClosed() public {
        assertEq(_addr("t2010401000001"), address(0), "unregistered");
        assertEq(_addr("not-a-t-number"), address(0), "not a T-number");

        vm.prank(attester);
        registry.fileDispute(VENDOR, address(1), bytes32(0));
        assertEq(_addr(LABEL), address(0), "disputed");
        assertEq(_text(LABEL, "meigi.status"), "disputed");
    }

    function test_addr_parentNameResolvesToZero() public view {
        bytes memory parent = abi.encodePacked(uint8(5), "payee", uint8(3), "eth", uint8(0));
        bytes memory out = resolver.resolve(parent, abi.encodeWithSelector(ADDR, bytes32(0)));
        assertEq(abi.decode(out, (address)), address(0));
    }

    function test_addrForCoin_ethAndThisChainOnly() public view {
        assertEq(_addrForCoin(60), abi.encodePacked(payout));
        assertEq(_addrForCoin(0x80000000 | block.chainid), abi.encodePacked(payout));
        assertEq(_addrForCoin(0).length, 0, "bitcoin");
        assertEq(_addrForCoin(0x80000000 | 137).length, 0, "another EVM chain");
    }

    function test_text_exposesTheVerifiedRecord() public view {
        assertEq(_text(LABEL, "name"), VENDOR_NAME);
        assertEq(_text(LABEL, "meigi.tNumber"), "T2011001234567");
        assertEq(_text(LABEL, "meigi.status"), "active");
        assertEq(_text(LABEL, "meigi.pending"), "");
        assertEq(_text(LABEL, "meigi.registry"), vm.toString(address(registry)));
        assertEq(_text(LABEL, "avatar"), "");
        assertEq(_text("t2010401000001", "name"), "", "unregistered");
    }

    function test_multicall_batchesRecords() public view {
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeWithSelector(ADDR, bytes32(0));
        calls[1] = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "name");
        bytes memory out = resolver.resolve(_name(LABEL), abi.encodeWithSignature("multicall(bytes[])", calls));
        bytes[] memory results = abi.decode(out, (bytes[]));
        assertEq(abi.decode(results[0], (address)), payout);
        assertEq(abi.decode(results[1], (string)), VENDOR_NAME);
    }

    function test_supportsInterface_advertisesENSIP10() public view {
        assertTrue(resolver.supportsInterface(0x9061b923));
        assertTrue(resolver.supportsInterface(0x01ffc9a7));
        assertTrue(resolver.supportsInterface(ADDR));
        assertFalse(resolver.supportsInterface(0xffffffff));
    }

    function test_resolve_rejectsUnsupportedRecords() public {
        bytes4 contenthash = bytes4(keccak256("contenthash(bytes32)"));
        vm.expectRevert(abi.encodeWithSelector(PayeeResolver.UnsupportedRecord.selector, contenthash));
        resolver.resolve(_name(LABEL), abi.encodeWithSelector(contenthash, bytes32(0)));

        vm.expectRevert(abi.encodeWithSelector(PayeeResolver.UnsupportedRecord.selector, bytes4(0)));
        resolver.resolve(_name(LABEL), hex"3b3b");
    }
}
