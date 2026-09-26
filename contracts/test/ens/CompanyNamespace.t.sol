// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CompanyNameRules} from "../../src/ens/CompanyNameRules.sol";
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
///      ENSv2 stand-ins. CompanyNamespaceFork.t.sol covers the real ENSv2 contracts and the UniversalResolver.
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
    bytes4 internal constant ADDR = 0x3b3b57de;
    bytes4 internal constant ADDR_COIN = 0xf1cb7e06;
    bytes4 internal constant TEXT = 0x59d1d43c;

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
        MockNamespaceRegistry ns = _open();
        assertEq(gate.namespaceOf(VENDOR), address(ns));
        assertEq(ns.rootRoles(address(gate)), ROLE_REGISTRAR | ROLE_RENEW | ROLE_UNREGISTER | ROLE_SET_PARENT);
        assertEq(ns.rootRoles(brake), ROLE_UNREGISTER, "Meigi can take a name down, never redirect it");
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

    // ---- issued names: text only ----

    function test_AnIssuedNameIsTextOnlyAndTheGateResolvesIt() public {
        MockNamespaceRegistry ns = _open();
        MockProfileResolver records = _issue("ap", agent);

        assertEq(ns.getOwner(_id("ap")), agent);
        assertEq(ns.getResolver("ap"), address(gate), "the gate answers for every issued name");
        assertEq(ns.getExpiry(_id("ap")), claimExpiry);
        assertEq(ns.tokenRoles("ap"), 0, "non-transferable: the holder gets no token roles");
        assertEq(_textOf("ap", "description"), "AP agent of a fictional demo company");
        assertEq(_textOf("ap", "agent-status"), "online");

        // No address, whatever is asked.
        assertEq(
            abi.decode(gate.resolve(_dns("ap"), abi.encodeWithSelector(ADDR, bytes32(0))), (address)),
            address(0)
        );
        assertEq(
            abi.decode(gate.resolve(_dns("ap"), abi.encodeWithSelector(ADDR_COIN, bytes32(0), 60)), (bytes)),
            ""
        );
        vm.expectRevert(
            abi.encodeWithSelector(CompanyNamespace.UnsupportedRecord.selector, bytes4(0xbc1c58d1))
        );
        gate.resolve(_dns("ap"), abi.encodeWithSelector(bytes4(0xbc1c58d1), bytes32(0)));

        // The gate is the records' only role holder, with the text role alone: no address can ever be written.
        assertEq(records.roles(0, address(gate)), ROLE_SET_TEXT);
        assertFalse(records.hasRoles(_coin(60), ROLE_SET_ADDRESS, address(gate)));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, _coin(60), ROLE_SET_ADDRESS, agent));
        records.setAddress(_dns("ap"), 60, abi.encodePacked(agent));
    }

    function test_TheHolderSetsItsStatusAndNothingElse() public {
        _open();
        MockProfileResolver records = _issue("ap", agent);

        vm.prank(agent);
        gate.setStatus(VENDOR, "ap", "paused");
        assertEq(_textOf("ap", "agent-status"), "paused");

        // No role on its resolver: not another key, not the root node that would answer deeper names.
        vm.startPrank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(Unauthorized.selector, _key("description"), ROLE_SET_TEXT, agent)
        );
        records.setText(_dns("ap"), "description", "rewritten");
        vm.expectRevert(
            abi.encodeWithSelector(Unauthorized.selector, _key("agent-status"), ROLE_SET_TEXT, agent)
        );
        records.setText(hex"00", "agent-status", "answers every deeper name");
        vm.stopPrank();

        // Only the holder, and only for its own name.
        _issue("keiri", accounts);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NotHolder.selector, VENDOR, "keiri", agent));
        gate.setStatus(VENDOR, "keiri", "hijacked");
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NotHolder.selector, VENDOR, "ap", controller));
        gate.setStatus(VENDOR, "ap", "x");
    }

    function test_TheGateAnswersOnlyExactIssuedNames() public {
        _open();
        _issue("ap", agent);
        bytes memory q = abi.encodeWithSelector(TEXT, bytes32(0), "description");
        bytes memory deeper = bytes.concat(hex"0178", _dns("ap")); // x.ap.t2011001234567.payee.eth
        bytes memory otherParent = bytes.concat(hex"0261700e", bytes(CLAIM), hex"056f746865720365746800"); // .other.eth
        bytes memory otherPayee = bytes.concat(hex"0261700e", "t8999900000001", PARENT);
        bytes memory notIssued = _dns("keiri");
        bytes[4] memory names = [deeper, otherParent, otherPayee, notIssued];
        for (uint256 i; i < names.length; ++i) {
            assertEq(abi.decode(gate.resolve(names[i], q), (string)), "");
        }
        assertEq(abi.decode(gate.resolve(hex"00", q), (string)), "");
        assertEq(abi.decode(gate.resolve("", q), (string)), "");
    }

    function test_TheCompanyEditsTextsButNeverMeigiKeys() public {
        _open();
        _issue("ap", agent);
        vm.prank(controller);
        gate.setText(VENDOR, "ap", "description", "AP agent, updated by the company");
        assertEq(_textOf("ap", "description"), "AP agent, updated by the company");

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNameRules.ReservedKey.selector, "Meigi.Registry"));
        gate.setText(VENDOR, "ap", "Meigi.Registry", "0x0");
        // Who the company is comes from the parent payee name: no profile keys on an issued name, in any case.
        string[4] memory profile = [string("NAME"), "Display", "url", "AvAtAr"];
        for (uint256 i; i < profile.length; ++i) {
            vm.prank(controller);
            vm.expectRevert(abi.encodeWithSelector(CompanyNameRules.ReservedKey.selector, profile[i]));
            gate.setText(VENDOR, "ap", profile[i], "x");
        }
        CompanyNamespace.Name memory n = _name("keiri", accounts, claimExpiry);
        n.keys[0] = "MEIGI.status";
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNameRules.ReservedKey.selector, "MEIGI.status"));
        gate.issue(VENDOR, n);

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.UnknownName.selector, VENDOR, "keiri"));
        gate.setText(VENDOR, "keiri", "description", "never issued");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NotController.selector, VENDOR, stranger));
        gate.setText(VENDOR, "ap", "description", "x");
    }

    function test_LabelsAreStrictAndCantPoseAsAPayee() public {
        _open();
        string[14] memory bad = [
            string(""),
            "AP",
            "a.b",
            "a_b",
            "-ap",
            "ap-",
            "a--b",
            "xn--ecki4eoz",
            unicode"経理",
            "t8999900000001",
            "8999900000001",
            "pay-t8999900000001",
            "a2011001234567b",
            "abcdefghijklmnopqrstuvwxyz0123456"
        ];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(controller);
            vm.expectRevert(abi.encodeWithSelector(CompanyNameRules.InvalidLabel.selector, bad[i]));
            gate.issue(VENDOR, _name(bad[i], agent, claimExpiry));
        }
        string[5] memory good = [string("keiri"), "zeirishi", "t2011", "audit-2026-09", "a-b-c"];
        for (uint256 i; i < good.length; ++i) {
            _issue(good[i], agent);
        }
    }

    function test_HoldersMustBeExternallyOwnedAccounts() public {
        _open();
        vm.startPrank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.InvalidHolder.selector, address(0)));
        gate.issue(VENDOR, _name("ap", address(0), claimExpiry));
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.InvalidHolder.selector, address(gate)));
        gate.issue(VENDOR, _name("ap", address(gate), claimExpiry));
        vm.stopPrank();
    }

    function test_IssueRejectsBadRequests() public {
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NoNamespace.selector, VENDOR));
        gate.issue(VENDOR, _name("ap", agent, claimExpiry));

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
        CompanyNamespace.Name memory n = _name("ap", agent, claimExpiry);
        n.values = new string[](0);
        vm.expectRevert(CompanyNamespace.TextsMismatch.selector);
        gate.issue(VENDOR, n);
        vm.stopPrank();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NotController.selector, VENDOR, stranger));
        gate.issue(VENDOR, _name("ap", agent, claimExpiry));
    }

    // ---- the registry decides ----

    function test_ARotationMovesAuthorityAndDarkensTheOldKeysNames() public {
        _open();
        _issue("ap", agent);
        address successor = makeAddr("new-business-key");
        _queueRotation(VENDOR, successor, OFFICER_A);
        _issue("keiri", accounts); // queued, not matured: the current controller still issues, and names answer
        assertEq(_textOf("keiri", "description"), "AP agent of a fictional demo company");

        vm.warp(block.timestamp + CHANGE_DELAY + 1);
        assertEq(registry.payeeOf(VENDOR).controller, successor);
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NotController.selector, VENDOR, controller));
        gate.issue(VENDOR, _name("zeirishi", stranger, claimExpiry));
        // Every name the old key issued (e.g. a thief's, during the recovery window) goes dark once the rotation lands.
        assertEq(_textOf("ap", "description"), "");
        assertEq(_textOf("keiri", "description"), "");

        // The successor has the authority without any ENS transaction, and re-issues what it vouches for.
        vm.startPrank(successor);
        gate.revoke(VENDOR, "ap");
        gate.issue(VENDOR, _name("ap", agent, claimExpiry));
        vm.stopPrank();
        assertEq(_textOf("ap", "description"), "AP agent of a fictional demo company");
        assertEq(_textOf("keiri", "description"), "", "still dark: the old key issued it");
    }

    function test_ADisputeDarkensTheNamesAndFreezesTheNamespace() public {
        _open();
        _issue("ap", agent);
        vm.prank(attester);
        registry.fileDispute(VENDOR, stranger, keccak256("second claimant"));
        assertEq(_textOf("ap", "description"), "", "dark while disputed");

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
        assertEq(_textOf("ap", "description"), "AP agent of a fictional demo company", "back once dismissed");
    }

    function test_MeigiResetsANamespaceSoNoOldNameCarriesOver() public {
        MockNamespaceRegistry first = _open();
        _issue("ap", agent);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.NotBrake.selector, stranger));
        gate.resetNamespace(VENDOR);

        vm.expectEmit(true, false, false, true, address(gate));
        emit CompanyNamespace.NamespaceReset(VENDOR, 1);
        vm.prank(brake);
        gate.resetNamespace(VENDOR);
        assertEq(gate.namespaceOf(VENDOR), address(0));
        assertEq(first.getOwner(_id("ap")), agent, "still registered in the old registry");
        assertEq(_textOf("ap", "description"), "", "but it no longer answers");
        assertEq(gate.labelsOf(VENDOR).length, 0);

        // The controller re-opens and re-issues, but the old registry is still the one attached: nothing answers
        // until Meigi attaches the fresh one.
        vm.prank(controller);
        MockNamespaceRegistry second = MockNamespaceRegistry(gate.open(VENDOR));
        assertTrue(address(second) != address(first));
        vm.prank(controller);
        gate.issue(VENDOR, _name("ap", agent, claimExpiry));
        assertEq(_textOf("ap", "description"), "", "not attached yet: dark");
        vm.prank(controller);
        gate.revoke(VENDOR, "ap");
        claims.setSubregistry(CLAIM, address(second));
        MockProfileResolver records = _issue("ap", stranger);
        (address holder, address resolver, address issuer,) = gate.nameOf(VENDOR, "ap");
        assertEq(holder, stranger);
        assertEq(resolver, address(records));
        assertEq(issuer, controller);
        assertEq(_textOf("ap", "description"), "AP agent of a fictional demo company");
    }

    // ---- lifecycle ----

    function test_RevokedNamesGoDarkAndCantBeRevivedByRenew() public {
        MockNamespaceRegistry ns = _open();
        MockProfileResolver first = _issue("keiri", accounts);
        vm.expectEmit(true, false, false, true, address(gate));
        emit CompanyNamespace.NameRevoked(VENDOR, "keiri");
        vm.prank(controller);
        gate.revoke(VENDOR, "keiri");
        assertEq(ns.getOwner(_id("keiri")), address(0));
        assertEq(_textOf("keiri", "description"), "");

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.UnknownName.selector, VENDOR, "keiri"));
        gate.renew(VENDOR, "keiri", claimExpiry);
        vm.prank(accounts);
        vm.expectRevert(
            abi.encodeWithSelector(CompanyNamespace.NotHolder.selector, VENDOR, "keiri", accounts)
        );
        gate.setStatus(VENDOR, "keiri", "still here");

        MockProfileResolver second = _issue("keiri", stranger);
        assertTrue(address(second) != address(first), "a fresh resolver, never the revoked one");
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
        assertEq(ns.getResolver("zeirishi"), address(0), "expired: the registry drops it");
        assertEq(_textOf("zeirishi", "description"), "", "and the gate answers nothing");
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.UnknownName.selector, VENDOR, "zeirishi"));
        gate.renew(VENDOR, "zeirishi", claimExpiry);
        _issue("zeirishi", accounts);
    }

    function test_MeigiBrakeCanUnregisterButNeverRedirect() public {
        MockNamespaceRegistry ns = _open();
        _issue("ap", agent);
        _issue("keiri", accounts);
        vm.prank(brake);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, 0, ROLE_SET_RESOLVER, brake));
        ns.setResolver(_id("ap"), stranger);
        vm.prank(brake);
        ns.unregister(_id("keiri"));
        assertEq(_textOf("keiri", "description"), "");
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, 0, ROLE_UNREGISTER, controller));
        ns.unregister(_id("ap"));
    }

    function test_ABlockedLabelStaysDownThroughReissue() public {
        MockNamespaceRegistry ns = _open();
        _issue("pay", agent);
        vm.startPrank(brake);
        gate.setBlocked(VENDOR, "pay", true);
        ns.unregister(_id("pay"));
        vm.stopPrank();
        assertEq(_textOf("pay", "description"), "");

        vm.startPrank(controller);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.Blocked.selector, VENDOR, "pay"));
        gate.issue(VENDOR, _name("pay", agent, claimExpiry));
        vm.stopPrank();

        // Blocking a live name darkens it and stops every change to it.
        _issue("ap", agent);
        vm.prank(brake);
        gate.setBlocked(VENDOR, "ap", true);
        assertEq(_textOf("ap", "description"), "");
        bytes memory stopped = abi.encodeWithSelector(CompanyNamespace.Blocked.selector, VENDOR, "ap");
        vm.prank(controller);
        vm.expectRevert(stopped);
        gate.setText(VENDOR, "ap", "description", "x");
        vm.prank(controller);
        vm.expectRevert(stopped);
        gate.renew(VENDOR, "ap", claimExpiry);
        vm.prank(agent);
        vm.expectRevert(stopped);
        gate.setStatus(VENDOR, "ap", "x");

        vm.prank(brake);
        gate.setBlocked(VENDOR, "ap", false);
        assertEq(_textOf("ap", "description"), "AP agent of a fictional demo company");
    }

    function test_AFrozenNamespaceNeitherChangesNorAnswers() public {
        _open();
        _issue("ap", agent);
        vm.prank(brake);
        gate.setFrozen(VENDOR, true);
        assertEq(_textOf("ap", "description"), "");
        assertFalse(gate.answers(VENDOR, "ap"));

        bytes memory stopped = abi.encodeWithSelector(CompanyNamespace.Frozen.selector, VENDOR);
        vm.startPrank(controller);
        vm.expectRevert(stopped);
        gate.issue(VENDOR, _name("keiri", accounts, claimExpiry));
        vm.expectRevert(stopped);
        gate.setText(VENDOR, "ap", "description", "x");
        vm.expectRevert(stopped);
        gate.renew(VENDOR, "ap", claimExpiry);
        gate.revoke(VENDOR, "ap"); // taking a name down stays possible
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(stopped);
        gate.setStatus(VENDOR, "ap", "x");

        vm.prank(brake);
        gate.setFrozen(VENDOR, false);
        _issue("keiri", accounts);
        assertTrue(gate.answers(VENDOR, "keiri"));
    }

    function test_OnlyMeigiHoldsTheBrake() public {
        _open();
        address[2] memory others = [controller, stranger];
        for (uint256 i; i < others.length; ++i) {
            vm.startPrank(others[i]);
            bytes memory denied = abi.encodeWithSelector(CompanyNamespace.NotBrake.selector, others[i]);
            vm.expectRevert(denied);
            gate.setBlocked(VENDOR, "ap", true);
            vm.expectRevert(denied);
            gate.setFrozen(VENDOR, true);
            vm.expectRevert(denied);
            gate.resetNamespace(VENDOR);
            vm.stopPrank();
        }
    }

    function test_NoIssuedNameCanBypassTheGate() public {
        MockNamespaceRegistry ns = _open();
        _issue("ap", agent);
        assertEq(ns.getResolver("ap"), address(gate));
        // Nobody holds the role that could point the name's registry entry past the gate.
        address[4] memory everyone = [controller, agent, address(gate), brake];
        for (uint256 i; i < everyone.length; ++i) {
            assertEq(ns.rootRoles(everyone[i]) & ROLE_SET_RESOLVER, 0);
            vm.prank(everyone[i]);
            vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, 0, ROLE_SET_RESOLVER, everyone[i]));
            ns.setResolver(_id("ap"), stranger);
        }
        assertEq(ns.tokenRoles("ap"), 0);
    }

    function test_AnUnattachedNamespaceNeverAnswers() public {
        vm.prank(controller);
        gate.open(VENDOR);
        vm.prank(controller);
        gate.issue(VENDOR, _name("ap", agent, claimExpiry));
        assertEq(_textOf("ap", "description"), "", "Meigi hasn't attached it");
        assertFalse(gate.answers(VENDOR, "ap"));
    }

    function test_AMaximalLabelLengthByteFailsClosedWithoutPanicking() public {
        _open();
        _issue("ap", agent);
        bytes memory label = new bytes(255);
        for (uint256 i; i < label.length; ++i) {
            label[i] = "a";
        }
        bytes memory name = bytes.concat(hex"ff", label, hex"0e", bytes(CLAIM), PARENT);
        bytes memory q = abi.encodeWithSelector(TEXT, bytes32(0), "description");
        assertEq(abi.decode(gate.resolve(name, q), (string)), "");
        assertEq(abi.decode(gate.resolve(hex"ff61", q), (string)), "", "a length byte past the end");
    }

    // ---- resolver plumbing and views ----

    function test_MulticallAndInterfaces() public {
        _open();
        _issue("ap", agent);
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeWithSelector(TEXT, bytes32(0), "agent-status");
        calls[1] = abi.encodeWithSelector(ADDR, bytes32(0));
        bytes[] memory results = abi.decode(
            gate.resolve(_dns("ap"), abi.encodeWithSelector(bytes4(0xac9650d8), calls)), (bytes[])
        );
        assertEq(abi.decode(results[0], (string)), "online");
        assertEq(abi.decode(results[1], (address)), address(0));
        assertTrue(gate.supportsInterface(0x9061b923));
        assertTrue(gate.supportsInterface(0x01ffc9a7));
        assertFalse(gate.supportsInterface(0x3b3b57de));
    }

    function test_ViewsListNamesForTheUi() public {
        _open();
        MockProfileResolver records = _issue("ap", agent);
        _issue("keiri", accounts);
        string[] memory labels = gate.labelsOf(VENDOR);
        assertEq(labels.length, 2);
        assertEq(labels[0], "ap");
        assertEq(labels[1], "keiri");
        (address holder, address resolver, address issuer, uint64 expiry) = gate.nameOf(VENDOR, "ap");
        assertEq(holder, agent);
        assertEq(resolver, address(records));
        assertEq(issuer, controller);
        assertEq(expiry, claimExpiry);
        assertTrue(gate.answers(VENDOR, "ap"));
        assertFalse(gate.answers(VENDOR, "keiri-x"));
        (holder,,,) = gate.nameOf(OTHER_VENDOR, "ap");
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

    /// @dev Opens the namespace and attaches it to the claimed name, as Meigi does.
    function _open() internal returns (MockNamespaceRegistry ns) {
        vm.prank(controller);
        ns = MockNamespaceRegistry(gate.open(VENDOR));
        claims.setSubregistry(CLAIM, address(ns));
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
        n.keys = new string[](2);
        n.values = new string[](2);
        n.keys[0] = "description";
        n.values[0] = "AP agent of a fictional demo company";
        n.keys[1] = "agent-status";
        n.values[1] = "online";
    }

    function _textOf(string memory label, string memory key) internal view returns (string memory) {
        return abi.decode(gate.resolve(_dns(label), abi.encodeWithSelector(TEXT, bytes32(0), key)), (string));
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
