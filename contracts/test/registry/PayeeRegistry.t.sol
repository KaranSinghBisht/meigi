// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {OfficerQuorum} from "../../src/registry/OfficerQuorum.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";
import {TNumber} from "../../src/registry/TNumber.sol";
import {MeigiFixture} from "../utils/MeigiFixture.sol";

/// Registration, payout changes, cancelling and views. Recovery and disputes live in PayeeRegistryRecovery.t.sol.
contract PayeeRegistryTest is MeigiFixture {
    function setUp() public override {
        super.setUp();
        _register(VENDOR, payout);
    }

    // ----------------------------------------------------------- registration

    function test_register_recordsAnActivePayee() public view {
        IPayeeRegistry.PayeeView memory v = registry.payeeOf(VENDOR);
        assertEq(v.legalName, VENDOR_NAME);
        assertEq(v.controller, controller);
        assertEq(v.payout, payout);
        assertEq(v.pending, address(0));
        assertEq(v.nextController, address(0));
        assertEq(v.threshold, 1);
        assertEq(uint8(v.status), uint8(IPayeeRegistry.Status.Active));
        assertTrue(registry.isActive(VENDOR));
        assertEq(registry.payoutOf(VENDOR), payout);
        assertEq(registry.officersOf(VENDOR).length, 2);
    }

    function test_register_onlyAttesters() public {
        PayeeRegistry.Registration memory r = _registration(OTHER_VENDOR, payout, 1);
        vm.expectRevert(abi.encodeWithSelector(OfficerQuorum.NotAttester.selector, address(this)));
        registry.register(r);
    }

    function test_register_secondClaimNeverOverwrites() public {
        PayeeRegistry.Registration memory r = _registration(VENDOR, makeAddr("squatter"), 1);
        vm.prank(attester);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.AlreadyRegistered.selector, VENDOR));
        registry.register(r);
        assertEq(registry.payoutOf(VENDOR), payout);
    }

    function test_register_rejectsMalformedInput() public {
        vm.startPrank(attester);

        PayeeRegistry.Registration memory r = _registration(123, payout, 1);
        vm.expectRevert(TNumber.InvalidTNumber.selector);
        registry.register(r);

        r = _registration(OTHER_VENDOR, payout, 3); // threshold above the officer count
        vm.expectRevert(OfficerQuorum.InvalidOfficers.selector);
        registry.register(r);

        r = _registration(OTHER_VENDOR, payout, 1);
        r.officers = _two(OFFICER_B, OFFICER_A); // unsorted
        vm.expectRevert(OfficerQuorum.InvalidOfficers.selector);
        registry.register(r);

        r = _registration(OTHER_VENDOR, address(0), 1);
        vm.expectRevert(OfficerQuorum.ZeroAddress.selector);
        registry.register(r);

        r = _registration(OTHER_VENDOR, payout, 1);
        r.legalName = "";
        vm.expectRevert(PayeeRegistry.EmptyName.selector);
        registry.register(r);

        vm.stopPrank();
    }

    // --------------------------------------------------------- payout changes

    function test_payoutChange_waitsOutTheTimelock() public {
        _queueChange(VENDOR, newPayout);
        IPayeeRegistry.PayeeView memory v = registry.payeeOf(VENDOR);
        assertEq(v.pending, newPayout);
        assertEq(v.effectiveAt, block.timestamp + CHANGE_DELAY);
        assertEq(registry.payoutOf(VENDOR), payout, "old address until the delay passes");

        vm.warp(block.timestamp + CHANGE_DELAY - 1);
        assertEq(registry.payoutOf(VENDOR), payout);

        vm.warp(block.timestamp + 1);
        assertEq(registry.payoutOf(VENDOR), newPayout);
        assertEq(registry.payeeOf(VENDOR).pending, address(0));
    }

    function test_payoutChange_announcesThePendingChange() public {
        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, newPayout, _one(OFFICER_A));
        vm.expectEmit(address(registry));
        emit IPayeeRegistry.PayoutChangeRequested(
            VENDOR, payout, newPayout, uint64(block.timestamp) + CHANGE_DELAY
        );
        vm.prank(controller);
        registry.requestPayoutChange(VENDOR, newPayout, a);
    }

    function test_payoutChange_replacingARequestAnnouncesTheCancel() public {
        _queueChange(VENDOR, newPayout);
        address other = makeAddr("other");
        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, other, _one(OFFICER_A));
        vm.expectEmit(address(registry));
        emit IPayeeRegistry.PayoutChangeCancelled(VENDOR, newPayout, controller);
        vm.prank(controller);
        registry.requestPayoutChange(VENDOR, other, a);
        assertEq(registry.payeeOf(VENDOR).pending, other);
    }

    /// The demo's denied path: a stolen business key plus a World ID proof from someone who never enrolled.
    function test_payoutChange_deniesADifferentHuman() public {
        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, newPayout, _one(STRANGER));
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(OfficerQuorum.NotAnOfficer.selector, VENDOR, STRANGER));
        registry.requestPayoutChange(VENDOR, newPayout, a);
    }

    function test_payoutChange_needsTheBusinessKey() public {
        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, newPayout, _one(OFFICER_A));
        address thief = makeAddr("thief");
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotController.selector, thief));
        registry.requestPayoutChange(VENDOR, newPayout, a);
    }

    function test_payoutChange_needsAnAttesterSignature() public {
        uint256 forgerPk = 0xF0463;
        OfficerQuorum.OfficerApproval memory a =
            _approval(VENDOR, OfficerQuorum.Action.PayoutChange, _target(newPayout), _one(OFFICER_A), forgerPk);
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(OfficerQuorum.NotAttester.selector, vm.addr(forgerPk)));
        registry.requestPayoutChange(VENDOR, newPayout, a);
    }

    function test_payoutChange_approvalIsBoundToOneAddress() public {
        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, newPayout, _one(OFFICER_A));
        address other = makeAddr("other");
        vm.prank(controller);
        vm.expectPartialRevert(OfficerQuorum.NotAttester.selector);
        registry.requestPayoutChange(VENDOR, other, a);
    }

    function test_payoutChange_approvalCannotBeReplayed() public {
        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, newPayout, _one(OFFICER_A));
        vm.startPrank(controller);
        registry.requestPayoutChange(VENDOR, newPayout, a);
        registry.cancelPayoutChange(VENDOR);
        vm.expectPartialRevert(OfficerQuorum.NotAttester.selector); // the nonce moved on
        registry.requestPayoutChange(VENDOR, newPayout, a);
        vm.stopPrank();
    }

    function test_payoutChange_approvalExpires() public {
        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, newPayout, _one(OFFICER_A));
        vm.warp(a.deadline + 1);
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(OfficerQuorum.ApprovalExpired.selector, a.deadline));
        registry.requestPayoutChange(VENDOR, newPayout, a);
    }

    function test_payoutChange_enforcesTheQuorum() public {
        PayeeRegistry.Registration memory r = _registration(OTHER_VENDOR, payout, 2); // 2-of-2
        vm.prank(attester);
        registry.register(r);

        OfficerQuorum.OfficerApproval memory one = _payoutApproval(OTHER_VENDOR, newPayout, _one(OFFICER_A));
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(OfficerQuorum.QuorumNotMet.selector, 1, 2));
        registry.requestPayoutChange(OTHER_VENDOR, newPayout, one);

        OfficerQuorum.OfficerApproval memory dup =
            _payoutApproval(OTHER_VENDOR, newPayout, _two(OFFICER_A, OFFICER_A));
        vm.prank(controller);
        vm.expectRevert(OfficerQuorum.InvalidOfficers.selector);
        registry.requestPayoutChange(OTHER_VENDOR, newPayout, dup);

        OfficerQuorum.OfficerApproval memory both =
            _payoutApproval(OTHER_VENDOR, newPayout, _two(OFFICER_A, OFFICER_B));
        vm.prank(controller);
        registry.requestPayoutChange(OTHER_VENDOR, newPayout, both);
        assertEq(registry.payeeOf(OTHER_VENDOR).pending, newPayout);
    }

    function testFuzz_payoutChange_neverLandsEarly(uint64 elapsed) public {
        elapsed = uint64(bound(elapsed, 0, CHANGE_DELAY - 1));
        _queueChange(VENDOR, newPayout);
        vm.warp(block.timestamp + elapsed);
        assertEq(registry.payoutOf(VENDOR), payout);
    }

    // ------------------------------------------------------------ cancelling

    function test_cancel_byControllerAttesterOrGovernance() public {
        address[3] memory cancellers = [controller, attester, governance];
        for (uint256 i; i < cancellers.length; i++) {
            _queueChange(VENDOR, newPayout);
            vm.prank(cancellers[i]);
            registry.cancelPayoutChange(VENDOR);
            assertEq(registry.payeeOf(VENDOR).pending, address(0));
        }
        vm.warp(block.timestamp + CHANGE_DELAY);
        assertEq(registry.payoutOf(VENDOR), payout, "cancelled changes never land");
    }

    function test_cancel_rejectsStrangers() public {
        _queueChange(VENDOR, newPayout);
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotAuthorized.selector, stranger));
        registry.cancelPayoutChange(VENDOR);
    }

    function test_cancel_tooLateOnceMatured() public {
        _queueChange(VENDOR, newPayout);
        vm.warp(block.timestamp + CHANGE_DELAY);
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NoPendingChange.selector, VENDOR));
        registry.cancelPayoutChange(VENDOR);
    }

    function test_settle_writesAMaturedChange() public {
        _queueChange(VENDOR, newPayout);
        vm.warp(block.timestamp + CHANGE_DELAY);
        vm.expectEmit(address(registry));
        emit IPayeeRegistry.PayoutChanged(VENDOR, payout, newPayout);
        registry.settle(VENDOR);
        assertEq(registry.payoutOf(VENDOR), newPayout);
    }

    // ------------------------------------------------------------------ views

    function test_payoutOf_failsClosedWhileDisputed() public {
        vm.prank(attester);
        registry.fileDispute(VENDOR, address(1), bytes32(0));
        assertEq(registry.payoutOf(VENDOR), address(0), "integrators calling only payoutOf never pay a frozen payee");
        assertEq(registry.payeeOf(VENDOR).payout, payout, "the frozen address stays visible for review");
        assertEq(registry.payoutOf(OTHER_VENDOR), address(0), "unregistered");
    }
}
