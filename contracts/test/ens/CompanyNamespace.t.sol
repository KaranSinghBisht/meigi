// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CompanyNamespace} from "../../src/ens/CompanyNamespace.sol";
import {IEnsV2Factory, IEnsV2Registry} from "../../src/ens/IEnsV2.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {MeigiFixture} from "../utils/MeigiFixture.sol";
import {
    MockClaims,
    MockEnsFactory,
    MockNamespaceRegistry,
    MockProfileResolver,
    Unauthorized
} from "./EnsV2Mocks.sol";

/// @dev The gate's logic against the real PayeeRegistry (so rotation and dispute are the registry's own flows) and
///      ENSv2 stand-ins. CompanyNamespaceFork.t.sol covers the real ENSv2 contracts.
contract CompanyNamespaceTest is MeigiFixture {
    bytes internal constant PARENT = hex"0570617965650365746800"; // payee.eth
    string internal constant CLAIM = "t2011001234567";
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_SET_PARENT = 1 << 8;
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 internal constant ROLE_SET_ADDRESS = 1 << 0;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    uint256 internal constant ROLE_SET_TEXT_ADMIN = ROLE_SET_TEXT << 128;

    MockEnsFactory internal factory;
    MockClaims internal claims;
    CompanyNamespace internal gate;
    address internal brake = makeAddr("meigi-brake");
    address internal agent = makeAddr("ap-agent");
    address internal accounts = makeAddr("keiri");
    address internal stranger = makeAddr("stranger");
    uint64 internal claimExpiry;

    function setUp() public override {
        super.setUp();
        _register(VENDOR, payout);
        factory = new MockEnsFactory();
        claims = new MockClaims();
        claimExpiry = uint64(block.timestamp + 365 days);
        claims.setExpiry(CLAIM, claimExpiry);
        gate = new CompanyNamespace(
            IPayeeRegistry(address(registry)),
            IEnsV2Factory(address(factory)),
            factory.registryImplementation(),
            factory.resolverImplementation(),
            IEnsV2Registry(address(claims)),
            brake,
            PARENT
        );
    }

    // ---- open ----

    function test_OpenCreatesTheCompanyRegistryWithScopedRootRoles() public {
        vm.expectEmit(true, false, false, false, address(gate));
        emit CompanyNamespace.NamespaceOpened(VENDOR, address(0));
        MockNamespaceRegistry ns = _open();

        assertEq(gate.namespaceOf(VENDOR), address(ns));
        assertEq(ns.rootRoles(address(gate)), ROLE_REGISTRAR | ROLE_RENEW | ROLE_UNREGISTER | ROLE_SET_PARENT);
        assertEq(ns.rootRoles(brake), ROLE_UNREGISTER | ROLE_SET_RESOLVER);
        assertEq(ns.rootRoles(controller), 0, "the company acts only through the gate");
        assertEq(ns.parent(), address(claims));
        assertEq(ns.parentLabel(), CLAIM);
    }

    function test_OpenOnlyOnceAndOnlyWithALiveClaim() public {
        _open();
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NamespaceExists.selector, VENDOR));
        gate.open(VENDOR);

        _register(OTHER_VENDOR, newPayout); // registered, but never claimed its name
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NoClaim.selector, OTHER_VENDOR));
        gate.open(OTHER_VENDOR);
    }

    function test_OnlyTheActiveControllerOpens() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NotController.selector, VENDOR, stranger));
        gate.open(VENDOR);

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.PayeeNotActive.selector, OTHER_VENDOR));
        gate.open(OTHER_VENDOR);
    }

    // ---- issue ----

    function test_IssueGivesTheNameItsOwnResolverAndPinnedAddress() public {
        MockNamespaceRegistry ns = _open();
        MockProfileResolver resolver = _issue("ap", agent);
        bytes memory name = _dns("ap");

        assertEq(ns.getOwner(_id("ap")), agent);
        assertEq(ns.getResolver("ap"), address(resolver));
        assertEq(ns.getExpiry(_id("ap")), claimExpiry);
        assertEq(ns.tokenRoles("ap"), 0, "non-transferable: the holder gets no token roles");
        assertEq(resolver.addr(name), agent);
        assertEq(resolver.text(name, "description"), "AP agent of a fictional demo company");

        // Nobody holds the address role, so the address stays the holder's.
        assertFalse(resolver.hasRoles(_coin(60), ROLE_SET_ADDRESS, address(gate)));
        assertFalse(resolver.hasRoles(_coin(60), ROLE_SET_ADDRESS, agent));
        assertFalse(resolver.hasRoles(_coin(60), ROLE_SET_ADDRESS, controller));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, _coin(60), ROLE_SET_ADDRESS, agent));
        resolver.setAddress(name, 60, abi.encodePacked(stranger));

        // The gate keeps only the text role and its admin role.
        assertEq(resolver.roles(0, address(gate)), ROLE_SET_TEXT | ROLE_SET_TEXT_ADMIN);
    }

    function test_TheHolderSetsOnlyItsScopedKeys() public {
        _open();
        MockProfileResolver resolver = _issue("ap", agent);
        bytes memory name = _dns("ap");

        vm.prank(agent);
        resolver.setText(name, "agent-status", "paused");
        assertEq(resolver.text(name, "agent-status"), "paused");

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(Unauthorized.selector, _key("description"), ROLE_SET_TEXT, agent)
        );
        resolver.setText(name, "description", "not the company's words");

        // The company edits through the gate; its key has no role on the resolver itself.
        vm.prank(controller);
        vm.expectRevert(
            abi.encodeWithSelector(Unauthorized.selector, _key("description"), ROLE_SET_TEXT, controller)
        );
        resolver.setText(name, "description", "direct");
        vm.prank(controller);
        gate.setText(VENDOR, "ap", "description", "AP agent, updated by the company");
        assertEq(resolver.text(name, "description"), "AP agent, updated by the company");
    }

    function test_EachNameHasItsOwnResolverSoNoRoleCrossesNames() public {
        _open();
        MockProfileResolver apResolver = _issue("ap", agent);
        MockProfileResolver keiriResolver = _issue("keiri", accounts);
        assertTrue(address(apResolver) != address(keiriResolver));

        // The agent's agent-status role exists only on its own instance.
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(Unauthorized.selector, _key("agent-status"), ROLE_SET_TEXT, agent)
        );
        keiriResolver.setText(_dns("keiri"), "agent-status", "hijacked");
    }

    function test_LabelsThatCouldPoseAsAPayeeAreRefused() public {
        _open();
        string[12] memory bad = [
            string(""),
            "AP",
            "a.b",
            "-ap",
            "ap-",
            unicode"経理",
            "xn--ecki4eoz",
            "t8999900000001",
            "8999900000001",
            "pay-t8999900000001",
            "a2011001234567b",
            "abcdefghijklmnopqrstuvwxyz0123456"
        ];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(controller);
            vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.InvalidLabel.selector, bad[i]));
            gate.issue(VENDOR, _name(bad[i], agent, claimExpiry));
        }
        string[4] memory good = [string("keiri"), "zeirishi", "t2011", "audit-2026-09"];
        for (uint256 i; i < good.length; ++i) {
            _issue(good[i], agent);
        }
    }

    function test_MeigiKeysAreReservedInEveryPath() public {
        _open();
        CompanyNamespace.Name memory n = _name("ap", agent, claimExpiry);
        n.keys[0] = "MEIGI.status";
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.ReservedKey.selector, "MEIGI.status"));
        gate.issue(VENDOR, n);

        n = _name("ap", agent, claimExpiry);
        n.holderKeys[0] = "meigi.payout";
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.ReservedKey.selector, "meigi.payout"));
        gate.issue(VENDOR, n);

        _issue("ap", agent);
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.ReservedKey.selector, "Meigi.Registry"));
        gate.setText(VENDOR, "ap", "Meigi.Registry", "0x0");
    }

    function test_ExpiryStaysWithinTheClaim() public {
        _open();
        vm.startPrank(controller);
        vm.expectRevert(
            abi.encodeWithSelector(
                CompanyNamespace.InvalidExpiry.selector, uint64(block.timestamp), claimExpiry
            )
        );
        gate.issue(VENDOR, _name("ap", agent, uint64(block.timestamp)));
        vm.expectRevert(
            abi.encodeWithSelector(CompanyNamespace.InvalidExpiry.selector, claimExpiry + 1, claimExpiry)
        );
        gate.issue(VENDOR, _name("ap", agent, claimExpiry + 1));
        vm.stopPrank();
    }

    function test_IssueRejectsBadRequests() public {
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NoNamespace.selector, VENDOR));
        gate.issue(VENDOR, _name("ap", agent, claimExpiry));

        _open();
        vm.startPrank(controller);
        vm.expectRevert(CompanyNamespace.InvalidHolder.selector);
        gate.issue(VENDOR, _name("ap", address(0), claimExpiry));
        CompanyNamespace.Name memory n = _name("ap", agent, claimExpiry);
        n.values = new string[](0);
        vm.expectRevert(CompanyNamespace.TextsMismatch.selector);
        gate.issue(VENDOR, n);
        vm.stopPrank();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NotController.selector, VENDOR, stranger));
        gate.issue(VENDOR, _name("ap", agent, claimExpiry));
    }

    // ---- authority follows the registry ----

    function test_AuthorityFollowsAControllerRotation() public {
        _open();
        _issue("ap", agent);
        address successor = makeAddr("new-business-key");
        _queueRotation(VENDOR, successor, OFFICER_A);

        // Queued, not matured: the current controller still issues.
        _issue("keiri", accounts);

        vm.warp(block.timestamp + CHANGE_DELAY + 1);
        assertEq(registry.payeeOf(VENDOR).controller, successor);
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NotController.selector, VENDOR, controller));
        gate.issue(VENDOR, _name("zeirishi", stranger, claimExpiry));

        // The successor has the authority without any ENS transaction.
        vm.startPrank(successor);
        gate.issue(VENDOR, _name("zeirishi", stranger, claimExpiry));
        gate.setText(VENDOR, "ap", "description", "set by the new business key");
        gate.revoke(VENDOR, "keiri");
        vm.stopPrank();
    }

    function test_ADisputeFreezesTheNamespace() public {
        _open();
        _issue("ap", agent);
        vm.prank(attester);
        registry.fileDispute(VENDOR, stranger, keccak256("second claimant"));

        vm.startPrank(controller);
        bytes memory frozen = abi.encodeWithSelector(CompanyNamespace.PayeeNotActive.selector, VENDOR);
        vm.expectRevert(frozen);
        gate.issue(VENDOR, _name("keiri", accounts, claimExpiry));
        vm.expectRevert(frozen);
        gate.setText(VENDOR, "ap", "description", "x");
        vm.expectRevert(frozen);
        gate.renew(VENDOR, "ap", claimExpiry);
        vm.expectRevert(frozen);
        gate.revoke(VENDOR, "ap");
        vm.stopPrank();

        vm.prank(governance);
        registry.dismissDispute(VENDOR);
        _issue("keiri", accounts);
    }

    // ---- lifecycle ----

    function test_RevokeStopsTheNameAndTheLabelCanBeIssuedAgain() public {
        MockNamespaceRegistry ns = _open();
        MockProfileResolver first = _issue("keiri", accounts);
        vm.expectEmit(true, false, false, true, address(gate));
        emit CompanyNamespace.NameRevoked(VENDOR, "keiri");
        vm.prank(controller);
        gate.revoke(VENDOR, "keiri");
        assertEq(ns.getResolver("keiri"), address(0));
        assertEq(ns.getOwner(_id("keiri")), address(0));

        MockProfileResolver second = _issue("keiri", stranger);
        assertTrue(address(second) != address(first), "a fresh resolver, never the revoked one");
        assertEq(second.addr(_dns("keiri")), stranger);
        assertEq(gate.labelsOf(VENDOR).length, 1);
    }

    function test_RenewExtendsOnlyALiveName() public {
        MockNamespaceRegistry ns = _open();
        uint64 thirtyDays = uint64(block.timestamp + 30 days);
        vm.prank(controller);
        gate.issue(VENDOR, _name("zeirishi", stranger, thirtyDays));

        vm.prank(controller);
        gate.renew(VENDOR, "zeirishi", thirtyDays + 30 days);
        assertEq(ns.getExpiry(_id("zeirishi")), thirtyDays + 30 days);

        vm.warp(thirtyDays + 30 days);
        assertEq(ns.getResolver("zeirishi"), address(0), "expired: resolves to nothing");
        (address holder,,) = gate.nameOf(VENDOR, "zeirishi");
        assertEq(holder, address(0));
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.UnknownName.selector, VENDOR, "zeirishi"));
        gate.renew(VENDOR, "zeirishi", claimExpiry);

        // An expired name is past revoking too; issuing the label again replaces it.
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(MockNamespaceRegistry.LabelExpired.selector, _id("zeirishi")));
        gate.revoke(VENDOR, "zeirishi");
        _issue("zeirishi", accounts);
    }

    function test_MeigiBrakeCanUnregisterOrClearAName() public {
        MockNamespaceRegistry ns = _open();
        _issue("ap", agent);
        _issue("keiri", accounts);

        vm.startPrank(brake);
        ns.setResolver(_id("ap"), address(0));
        ns.unregister(_id("keiri"));
        vm.stopPrank();
        assertEq(ns.getResolver("ap"), address(0));
        assertEq(ns.getOwner(_id("keiri")), address(0));

        // The company's key can't touch the registry directly.
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, 0, ROLE_UNREGISTER, controller));
        ns.unregister(_id("ap"));
    }

    function test_ViewsListNamesForTheUi() public {
        _open();
        MockProfileResolver resolver = _issue("ap", agent);
        _issue("keiri", accounts);
        string[] memory labels = gate.labelsOf(VENDOR);
        assertEq(labels.length, 2);
        assertEq(labels[0], "ap");
        assertEq(labels[1], "keiri");
        (address holder, address r, uint64 expiry) = gate.nameOf(VENDOR, "ap");
        assertEq(holder, agent);
        assertEq(r, address(resolver));
        assertEq(expiry, claimExpiry);
        (holder, r, expiry) = gate.nameOf(OTHER_VENDOR, "ap");
        assertEq(holder, address(0));
    }

    function test_ConstructorChecksItsInputs() public {
        IPayeeRegistry payees = IPayeeRegistry(address(registry));
        IEnsV2Factory ensFactory = IEnsV2Factory(address(factory));
        address registryImpl = factory.registryImplementation();
        address resolverImpl = factory.resolverImplementation();
        IEnsV2Registry claimsRegistry = IEnsV2Registry(address(claims));

        vm.expectRevert(CompanyNamespace.ZeroAddress.selector);
        new CompanyNamespace(
            payees, ensFactory, registryImpl, resolverImpl, claimsRegistry, address(0), PARENT
        );
        vm.expectRevert(CompanyNamespace.InvalidParentName.selector);
        new CompanyNamespace(
            payees, ensFactory, registryImpl, resolverImpl, claimsRegistry, brake, hex"0570617965650365746878"
        );
    }

    // ---- helpers ----

    function _open() internal returns (MockNamespaceRegistry) {
        vm.prank(controller);
        return MockNamespaceRegistry(gate.open(VENDOR));
    }

    function _issue(string memory label, address holder) internal returns (MockProfileResolver) {
        vm.prank(controller);
        return MockProfileResolver(gate.issue(VENDOR, _name(label, holder, claimExpiry)));
    }

    function _name(string memory label, address holder, uint64 expiry)
        internal
        pure
        returns (CompanyNamespace.Name memory n)
    {
        n.label = label;
        n.holder = holder;
        n.expiry = expiry;
        n.keys = new string[](1);
        n.values = new string[](1);
        n.keys[0] = "description";
        n.values[0] = "AP agent of a fictional demo company";
        n.holderKeys = new string[](1);
        n.holderKeys[0] = "agent-status";
    }

    function _dns(string memory label) internal pure returns (bytes memory) {
        return bytes.concat(bytes1(uint8(bytes(label).length)), bytes(label), hex"0e", bytes(CLAIM), PARENT);
    }

    function _id(string memory label) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    function _key(string memory key) internal pure returns (uint256) {
        return uint256(keccak256(bytes(key)));
    }

    function _coin(uint256 coinType) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(coinType)));
    }
}
