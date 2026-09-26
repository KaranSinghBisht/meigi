// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ClaimedPayeeResolver, IExtendedResolver} from "../../src/ens/ClaimedPayeeResolver.sol";
import {PayeeResolver} from "../../src/ens/PayeeResolver.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";
import {TNumber} from "../../src/registry/TNumber.sol";
import {MeigiFixture} from "../utils/MeigiFixture.sol";

/// @dev Stands in for a company's ENSv2 PermissionedResolver: it answers whatever its owner set, including an
///      address, so the tests can show that the claimed name never takes money records from it.
contract MockProfileResolver is IExtendedResolver {
    mapping(string => string) private _texts;
    address private _addr;
    bool private _broken;

    function setText(string calldata key, string calldata value) external {
        _texts[key] = value;
    }

    function setAddr(address a) external {
        _addr = a;
    }

    function breakIt() external {
        _broken = true;
    }

    function resolve(bytes calldata, bytes calldata data) external view returns (bytes memory) {
        require(!_broken, "profile down");
        if (bytes4(data[:4]) == 0x3b3b57de) return abi.encode(_addr);
        (, string memory key) = abi.decode(data[4:], (bytes32, string));
        return abi.encode(_texts[key]);
    }
}

/// @dev A PayeeResolver that is down (or was pointed at a broken registry).
contract RevertingResolver is IExtendedResolver {
    function resolve(bytes calldata, bytes calldata) external pure returns (bytes memory) {
        revert("payee resolver down");
    }
}

contract ClaimedPayeeResolverTest is MeigiFixture {
    bytes4 internal constant ADDR = 0x3b3b57de;
    bytes4 internal constant ADDR_COIN = 0xf1cb7e06;
    bytes internal constant PARENT = hex"0570617965650365746800"; // payee.eth
    string internal constant LABEL = "t2011001234567";
    string internal constant URL = "https://shoji.example";

    PayeeResolver internal payees;
    ClaimedPayeeResolver internal claimed;
    MockProfileResolver internal profile;
    address internal attacker = makeAddr("attacker");

    function setUp() public override {
        super.setUp();
        payees = new PayeeResolver(IPayeeRegistry(address(registry)), PARENT);
        claimed = new ClaimedPayeeResolver(
            IExtendedResolver(address(payees)), IPayeeRegistry(address(registry)), PARENT, governance
        );
        profile = new MockProfileResolver();
        _register(VENDOR, payout);
        vm.prank(governance);
        claimed.setProfile(VENDOR, IExtendedResolver(address(profile)), controller);
        profile.setText("url", URL);
    }

    /// DNS wire format of `<label>.payee.eth`.
    function _name(string memory label) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(bytes(label).length), label, PARENT);
    }

    function _addr(string memory label) internal view returns (address) {
        return abi.decode(claimed.resolve(_name(label), abi.encodeWithSelector(ADDR, bytes32(0))), (address));
    }

    function _text(string memory label, string memory key) internal view returns (string memory) {
        bytes memory call = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), key);
        return abi.decode(claimed.resolve(_name(label), call), (string));
    }

    function _dispute() internal {
        vm.prank(attester);
        registry.fileDispute(VENDOR, address(1), bytes32(0));
    }

    function test_addr_comesFromTheRegistryNotTheProfile() public {
        profile.setAddr(attacker);
        assertEq(_addr(LABEL), payout);
        bytes memory call = abi.encodeWithSelector(ADDR_COIN, bytes32(0), 60);
        assertEq(abi.decode(claimed.resolve(_name(LABEL), call), (bytes)), abi.encodePacked(payout));
    }

    function test_addr_everyCoinTypeComesFromTheRegistry() public {
        profile.setAddr(attacker);
        bytes memory bitcoin = abi.encodeWithSelector(ADDR_COIN, bytes32(0), 0);
        assertEq(
            abi.decode(claimed.resolve(_name(LABEL), bitcoin), (bytes)).length, 0, "no BTC address, ever"
        );
        bytes memory thisChain = abi.encodeWithSelector(ADDR_COIN, bytes32(0), 0x80000000 | block.chainid);
        assertEq(abi.decode(claimed.resolve(_name(LABEL), thisChain), (bytes)), abi.encodePacked(payout));
    }

    function test_failsClosedWhenThePayeeResolverReverts() public {
        ClaimedPayeeResolver broken = new ClaimedPayeeResolver(
            IExtendedResolver(address(new RevertingResolver())),
            IPayeeRegistry(address(registry)),
            PARENT,
            governance
        );
        vm.prank(governance);
        broken.setProfile(VENDOR, IExtendedResolver(address(profile)), controller);
        profile.setAddr(attacker);
        profile.setText("name", "Scam K.K.");
        bytes memory name = _name(LABEL);
        bytes memory coin60 = abi.encodeWithSelector(ADDR_COIN, bytes32(0), 60);
        bytes memory legalName = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "name");
        bytes memory url = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "url");
        assertEq(
            abi.decode(broken.resolve(name, abi.encodeWithSelector(ADDR, bytes32(0))), (address)), address(0)
        );
        assertEq(abi.decode(broken.resolve(name, coin60), (bytes)).length, 0);
        assertEq(abi.decode(broken.resolve(name, legalName), (string)), "", "never the profile's claim");
        assertEq(abi.decode(broken.resolve(name, url), (string)), URL, "the profile is not a money record");
    }

    function test_text_aFailingRegistryHidesTheProfile() public {
        ClaimedPayeeResolver blind = new ClaimedPayeeResolver(
            IExtendedResolver(address(payees)),
            IPayeeRegistry(address(new RevertingResolver())),
            PARENT,
            governance
        );
        vm.prank(governance);
        blind.setProfile(VENDOR, IExtendedResolver(address(profile)), controller);
        bytes memory url = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "url");
        assertEq(abi.decode(blind.resolve(_name(LABEL), url), (string)), "");
        bytes memory addrCall = abi.encodeWithSelector(ADDR, bytes32(0));
        assertEq(
            abi.decode(blind.resolve(_name(LABEL), addrCall), (address)), payout, "money records unaffected"
        );
    }

    function testFuzz_addr_neverFollowsTheProfile(address evil) public {
        profile.setAddr(evil);
        assertEq(_addr(LABEL), payout);
    }

    function test_addr_followsTheTimelock() public {
        _queueChange(VENDOR, newPayout);
        assertEq(_addr(LABEL), payout, "a queued change does not resolve");
        vm.warp(block.timestamp + CHANGE_DELAY);
        assertEq(_addr(LABEL), newPayout);
    }

    function test_addr_failsClosedWhenDisputed() public {
        _dispute();
        assertEq(_addr(LABEL), address(0));
        assertEq(_text(LABEL, "meigi.status"), "disputed");
        assertEq(_text(LABEL, "name"), "", "a disputed payee publishes only its status");
        assertEq(_text(LABEL, "url"), "", "nor its profile: there are competing claimants");
    }

    function test_text_profileReturnsOnceTheDisputeIsResolved() public {
        _dispute();
        vm.prank(governance);
        registry.resolveDispute(_registration(VENDOR, payout, 1));
        vm.warp(block.timestamp + CHANGE_DELAY);
        registry.finalizeDispute(VENDOR);
        assertEq(_text(LABEL, "url"), URL);
        assertEq(_addr(LABEL), payout);
    }

    function test_text_aNewControllerDoesNotInheritTheProfile() public {
        _dispute();
        PayeeRegistry.Registration memory winner = _registration(VENDOR, newPayout, 1);
        winner.controller = makeAddr("winner");
        vm.prank(governance);
        registry.resolveDispute(winner);
        vm.warp(block.timestamp + CHANGE_DELAY);
        registry.finalizeDispute(VENDOR);
        assertEq(_addr(LABEL), newPayout, "the winner's payout resolves");
        assertEq(_text(LABEL, "name"), VENDOR_NAME);
        assertEq(_text(LABEL, "url"), "", "the losing claimant's profile stays hidden");
    }

    function test_text_profileShowsOnlyForItsClaimant() public {
        vm.prank(governance);
        claimed.setProfile(VENDOR, IExtendedResolver(address(profile)), attacker);
        assertEq(_text(LABEL, "url"), "", "claimed by someone other than the controller");
    }

    function test_text_profileKeysComeFromTheCompany() public view {
        assertEq(_text(LABEL, "url"), URL);
        assertEq(_text(LABEL, "avatar"), "", "unset profile key");
    }

    function test_text_registryKeysCannotBeOverriddenByTheProfile() public {
        profile.setText("name", "Scam K.K.");
        profile.setText("meigi.tNumber", "T0000000000000");
        profile.setText("meigi.status", "active");
        assertEq(_text(LABEL, "name"), VENDOR_NAME);
        assertEq(_text(LABEL, "meigi.tNumber"), "T2011001234567");
        _dispute();
        assertEq(_text(LABEL, "meigi.status"), "disputed", "a profile cannot mask a dispute");
    }

    function test_text_lookAlikeRegistryKeysNeverComeFromTheProfile() public {
        profile.setText("Name", "Scam K.K.");
        profile.setText("MEIGI.status", "active");
        assertEq(_text(LABEL, "Name"), "");
        assertEq(_text(LABEL, "MEIGI.status"), "");
    }

    function test_text_unclaimedAndForeignNamesReadNoProfile() public {
        vm.prank(governance);
        claimed.setProfile(OTHER_VENDOR, IExtendedResolver(address(profile)), controller);
        bytes memory foreign = abi.encodePacked(uint8(14), LABEL, uint8(3), "eth", uint8(0)); // t...eth
        bytes memory call = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "url");
        assertEq(abi.decode(claimed.resolve(foreign, call), (string)), "", "wrong parent");
        assertEq(_text("t8999900000001", "url"), "", "a profile for an unregistered T-number never shows");
        vm.prank(governance);
        claimed.setProfile(VENDOR, IExtendedResolver(address(0)), address(0));
        assertEq(_text(LABEL, "url"), "", "cleared profile");
        assertEq(_addr(LABEL), payout, "clearing the profile leaves the payout");
    }

    function test_subnamesOfAClaimedNameResolveToNothing() public {
        profile.setAddr(attacker);
        bytes memory sub = abi.encodePacked(uint8(3), "pay", uint8(14), LABEL, PARENT); // pay.t....payee.eth
        bytes memory url = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "url");
        bytes memory addrCall = abi.encodeWithSelector(ADDR, bytes32(0));
        assertEq(abi.decode(claimed.resolve(sub, addrCall), (address)), address(0));
        assertEq(abi.decode(claimed.resolve(sub, url), (string)), "");
    }

    function test_text_aBrokenProfileReadsEmpty() public {
        profile.breakIt();
        assertEq(_text(LABEL, "url"), "");
        assertEq(_addr(LABEL), payout);
    }

    function test_multicall_mixesRegistryAndProfile() public {
        profile.setAddr(attacker);
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeWithSelector(ADDR, bytes32(0));
        calls[1] = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "name");
        calls[2] = abi.encodeWithSignature("text(bytes32,string)", bytes32(0), "url");
        bytes memory out = claimed.resolve(_name(LABEL), abi.encodeWithSignature("multicall(bytes[])", calls));
        bytes[] memory results = abi.decode(out, (bytes[]));
        assertEq(abi.decode(results[0], (address)), payout);
        assertEq(abi.decode(results[1], (string)), VENDOR_NAME);
        assertEq(abi.decode(results[2], (string)), URL);
    }

    function test_setProfile_onlyOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        claimed.setProfile(VENDOR, IExtendedResolver(attacker), attacker);
    }

    function test_setProfile_rejectsInvalidTNumbers() public {
        vm.prank(governance);
        vm.expectRevert(TNumber.InvalidTNumber.selector);
        claimed.setProfile(123, IExtendedResolver(address(profile)), controller);
    }

    function test_resolve_rejectsUnsupportedRecords() public {
        bytes4 contenthash = bytes4(keccak256("contenthash(bytes32)"));
        vm.expectRevert(abi.encodeWithSelector(ClaimedPayeeResolver.UnsupportedRecord.selector, contenthash));
        claimed.resolve(_name(LABEL), abi.encodeWithSelector(contenthash, bytes32(0)));
    }

    function test_supportsInterface_advertisesENSIP10() public view {
        assertTrue(claimed.supportsInterface(0x9061b923));
        assertTrue(claimed.supportsInterface(0x01ffc9a7));
        assertFalse(claimed.supportsInterface(0xffffffff));
    }

    function test_constructor_rejectsAnInvalidParent() public {
        vm.expectRevert(ClaimedPayeeResolver.InvalidParentName.selector);
        new ClaimedPayeeResolver(
            IExtendedResolver(address(payees)),
            IPayeeRegistry(address(registry)),
            hex"0570617965650365746801",
            governance
        );
    }
}
