// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CompanyNamespace} from "../../src/ens/CompanyNamespace.sol";
import {IEnsV2Factory, IEnsV2Registry, IEnsV2Resolver} from "../../src/ens/IEnsV2.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";

interface IClaimsRegistry {
    function setSubregistry(uint256 anyId, address registry) external;
    function getSubregistry(string calldata label) external view returns (address);
}

interface IUserRegistryToken {
    function getTokenId(uint256 anyId) external view returns (uint256);
    function unsafeTransfer(address to, uint256 tokenId, bytes calldata data) external;
}

interface IUniversalResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory, address);
}

/// @dev The gate against the real ENSv2 Beta contracts on a Sepolia fork, for t2011001234567.payee.eth: roles, pinned
///      addresses, expiry, revocation and Meigi's brake as stock ENS resolution sees them. Needs SEPOLIA_RPC_URL (the
///      suite is skipped without it) and state from 2026-09-26 on (the claim, and Meigi's deployer as claims admin).
contract CompanyNamespaceForkTest is Test {
    IPayeeRegistry internal constant PAYEES = IPayeeRegistry(0x205c977cF1f4Ed42e51a48759550eF40160A6396);
    IEnsV2Factory internal constant FACTORY = IEnsV2Factory(0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C);
    address internal constant USER_REGISTRY_IMPL = 0xA80338aAA8D23831cEa25E858D1774534aBb0263;
    address internal constant RESOLVER_IMPL = 0x14F09Fd05d4585759e54844DC9B00147131Cf243;
    address internal constant CLAIMS = 0xcA0317C97C0f915faaD6D8F354110eA98bDeD0B6;
    IUniversalResolver internal constant UR = IUniversalResolver(0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe);
    address internal constant DEPLOYER = 0x706C68adE875a8B9e755DC03836Ac0cEfA9cb02c;
    address internal constant CONTROLLER = 0xc33a9cD6662D39E190855c43a459CBcB938e4638;
    address internal constant PAYOUT = 0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4;
    uint64 internal constant T_NUMBER = 2011001234567;
    bytes internal constant PARENT = hex"0570617965650365746800"; // payee.eth
    bytes4 internal constant ADDR = 0x3b3b57de;
    bytes4 internal constant TEXT = 0x59d1d43c;

    CompanyNamespace internal gate;
    address internal agent = makeAddr("ap-agent");
    address internal accounts = makeAddr("keiri");
    address internal taxAccountant = makeAddr("zeirishi");

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        gate = new CompanyNamespace(
            PAYEES, FACTORY, USER_REGISTRY_IMPL, RESOLVER_IMPL, IEnsV2Registry(CLAIMS), DEPLOYER, PARENT
        );
    }

    function test_ForkNamesResolveScopedPinnedAndExpiring() public {
        assertEq(_addr("t2011001234567.payee.eth"), PAYOUT, "before: the registry payout");
        address ns = _openAndAttach();
        address apResolver =
            _issue("ap", agent, 0, unicode"AP agent of 株式会社メイギ商事 (fictional demo company)");
        _issue("keiri", accounts, 0, "Accounts department (fictional demo company)");
        _issue(
            "zeirishi",
            taxAccountant,
            uint64(block.timestamp + 30 days),
            "External tax accountant (fictional)"
        );

        assertEq(_addr("ap.t2011001234567.payee.eth"), agent);
        assertEq(_addr("keiri.t2011001234567.payee.eth"), accounts);
        assertEq(_addr("zeirishi.t2011001234567.payee.eth"), taxAccountant);
        assertEq(
            _text("ap.t2011001234567.payee.eth", "description"),
            unicode"AP agent of 株式会社メイギ商事 (fictional demo company)"
        );
        assertEq(_addr("t2011001234567.payee.eth"), PAYOUT, "the payee name is untouched");

        // The agent sets its one key; everything else, and the address, is out of its reach.
        bytes memory apName = _dns("ap");
        vm.prank(agent);
        IEnsV2Resolver(apResolver).setText(apName, "agent-status", "online");
        assertEq(_text("ap.t2011001234567.payee.eth", "agent-status"), "online");
        vm.prank(agent);
        vm.expectRevert();
        IEnsV2Resolver(apResolver).setText(apName, "description", "rewritten");
        vm.prank(agent);
        vm.expectRevert();
        IEnsV2Resolver(apResolver).setAddress(apName, 60, abi.encodePacked(agent));
        vm.prank(CONTROLLER);
        vm.expectRevert();
        IEnsV2Resolver(apResolver).setAddress(apName, 60, abi.encodePacked(CONTROLLER));

        // Non-transferable: issued with no token roles.
        uint256 tokenId = IUserRegistryToken(ns).getTokenId(uint256(keccak256("ap")));
        vm.prank(agent);
        vm.expectRevert();
        IUserRegistryToken(ns).unsafeTransfer(makeAddr("buyer"), tokenId, "");

        // Revoked and expired names stop resolving; the payee name never moves.
        vm.prank(CONTROLLER);
        gate.revoke(T_NUMBER, "keiri");
        assertEq(_addr("keiri.t2011001234567.payee.eth"), address(0));
        vm.warp(block.timestamp + 30 days);
        assertEq(_addr("zeirishi.t2011001234567.payee.eth"), address(0));
        assertEq(_addr("ap.t2011001234567.payee.eth"), agent);

        // Meigi's brake: detach the namespace from the claim, and every name under it goes dark at once.
        vm.prank(DEPLOYER);
        IClaimsRegistry(CLAIMS).setSubregistry(uint256(keccak256("t2011001234567")), address(0));
        assertEq(_addr("ap.t2011001234567.payee.eth"), address(0));
        assertEq(_addr("t2011001234567.payee.eth"), PAYOUT);
    }

    function test_ForkLabelsCantPoseAsAnotherPayee() public {
        _openAndAttach();
        CompanyNamespace.Name memory n = _name("t8999900000001", agent, 0, "look-alike");
        vm.prank(CONTROLLER);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.InvalidLabel.selector, "t8999900000001"));
        gate.issue(T_NUMBER, n);
    }

    function _openAndAttach() internal returns (address ns) {
        vm.prank(CONTROLLER);
        ns = gate.open(T_NUMBER);
        vm.prank(DEPLOYER);
        IClaimsRegistry(CLAIMS).setSubregistry(uint256(keccak256("t2011001234567")), ns);
        assertEq(IClaimsRegistry(CLAIMS).getSubregistry("t2011001234567"), ns);
    }

    function _issue(string memory label, address holder, uint64 expiry, string memory description)
        internal
        returns (address)
    {
        CompanyNamespace.Name memory n = _name(label, holder, expiry, description); // reads the claim: before the prank
        vm.prank(CONTROLLER);
        return gate.issue(T_NUMBER, n);
    }

    function _name(string memory label, address holder, uint64 expiry, string memory description)
        internal
        view
        returns (CompanyNamespace.Name memory n)
    {
        n.label = label;
        n.holder = holder;
        n.expiry =
            expiry == 0 ? IEnsV2Registry(CLAIMS).getExpiry(uint256(keccak256("t2011001234567"))) : expiry;
        n.keys = new string[](1);
        n.values = new string[](1);
        n.keys[0] = "description";
        n.values[0] = description;
        n.holderKeys = new string[](1);
        n.holderKeys[0] = "agent-status";
    }

    function _addr(string memory name) internal view returns (address) {
        (bytes memory out,) = UR.resolve(_encode(name), abi.encodeWithSelector(ADDR, vm.ensNamehash(name)));
        return abi.decode(out, (address));
    }

    function _text(string memory name, string memory key) internal view returns (string memory) {
        (bytes memory out,) =
            UR.resolve(_encode(name), abi.encodeWithSelector(TEXT, vm.ensNamehash(name), key));
        return abi.decode(out, (string));
    }

    function _dns(string memory label) internal pure returns (bytes memory) {
        return
            bytes.concat(bytes1(uint8(bytes(label).length)), bytes(label), hex"0e", "t2011001234567", PARENT);
    }

    /// @dev DNS-encodes a dotted name.
    function _encode(string memory name) internal pure returns (bytes memory out) {
        bytes memory s = bytes(name);
        uint256 start;
        for (uint256 i; i <= s.length; ++i) {
            if (i == s.length || s[i] == ".") {
                bytes memory label = new bytes(i - start);
                for (uint256 j; j < label.length; ++j) {
                    label[j] = s[start + j];
                }
                out = bytes.concat(out, bytes1(uint8(label.length)), label);
                start = i + 1;
            }
        }
        out = bytes.concat(out, hex"00");
    }
}
