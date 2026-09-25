// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {OfficerQuorum} from "../../src/registry/OfficerQuorum.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";
import {MeigiFixture} from "../utils/MeigiFixture.sol";

/// Recovery, disputes and governance, including regression tests for the security review's findings.
contract PayeeRegistryRecoveryTest is MeigiFixture {
    address internal freshKey = makeAddr("freshKey");
    address internal rogue = makeAddr("rogue");

    function setUp() public override {
        super.setUp();
        _register(VENDOR, payout);
    }

    // ------------------------------------------------------ controller rotation

    function test_rotation_waitsOutTheTimelock() public {
        _queueRotation(VENDOR, freshKey, OFFICER_B);
        IPayeeRegistry.PayeeView memory v = registry.payeeOf(VENDOR);
        assertEq(v.controller, controller);
        assertEq(v.nextController, freshKey);
        assertEq(v.controllerEffectiveAt, block.timestamp + CHANGE_DELAY);

        vm.warp(block.timestamp + CHANGE_DELAY);
        assertEq(registry.controllerOf(VENDOR), freshKey);
        assertEq(registry.payeeOf(VENDOR).nextController, address(0));
    }

    /// Review finding 1: an officer alone can no longer take a payee over; the business key cancels it.
    function test_rotation_officerAloneCannotTakeOver() public {
        _queueRotation(VENDOR, rogue, OFFICER_A);

        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, rogue, _one(OFFICER_A));
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotController.selector, rogue));
        registry.requestPayoutChange(VENDOR, rogue, a);

        vm.prank(controller);
        registry.cancelControllerRotation(VENDOR);
        vm.warp(block.timestamp + CHANGE_DELAY);
        assertEq(registry.controllerOf(VENDOR), controller);
        assertEq(registry.payoutOf(VENDOR), payout);
    }

    function test_rotation_blocksPayoutChanges() public {
        _queueRotation(VENDOR, freshKey, OFFICER_B);
        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, newPayout, _one(OFFICER_A));
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.RotationPending.selector, VENDOR));
        registry.requestPayoutChange(VENDOR, newPayout, a);
    }

    /// Review NEW-2: a rogue officer's queued rotation can't block its own eviction.
    function test_updateOfficers_evictsARogueOfficerAndDropsItsRotation() public {
        _queueRotation(VENDOR, rogue, OFFICER_B); // OFFICER_B goes rogue; threshold is 1-of-2
        bytes32[] memory next = _one(OFFICER_A);
        bytes32 target = registry.officerUpdateTarget(next, 1);
        OfficerQuorum.OfficerApproval memory u =
            _approval(VENDOR, OfficerQuorum.Action.OfficerUpdate, target, _one(OFFICER_A), ATTESTER_PK);
        vm.prank(controller);
        registry.updateOfficers(VENDOR, next, 1, u);

        assertEq(registry.payeeOf(VENDOR).nextController, address(0));
        assertEq(registry.officersOf(VENDOR).length, 1);
        vm.warp(block.timestamp + CHANGE_DELAY);
        assertEq(registry.controllerOf(VENDOR), controller);
    }

    function test_rotation_cancelRules() public {
        _queueRotation(VENDOR, freshKey, OFFICER_B);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotAuthorized.selector, rogue));
        registry.cancelControllerRotation(VENDOR);

        vm.prank(attester);
        registry.cancelControllerRotation(VENDOR);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NoPendingRotation.selector, VENDOR));
        registry.cancelControllerRotation(VENDOR);
    }

    function test_rotation_rejectsZeroOrSameController() public {
        OfficerQuorum.OfficerApproval memory same = _rotationApproval(VENDOR, controller, _one(OFFICER_A));
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.InvalidController.selector, controller));
        registry.requestControllerRotation(VENDOR, controller, same);
    }

    // ---------------------------------------------------- attester revocation

    /// Review finding 2: revoking an attester voids every change it approved that has not landed.
    function test_revokedAttester_queuedChangesNeverLand() public {
        _queueChange(VENDOR, newPayout);
        _queueRotation(VENDOR, freshKey, OFFICER_B);
        vm.prank(governance);
        registry.setAttester(attester, false);

        vm.warp(block.timestamp + CHANGE_DELAY);
        registry.settle(VENDOR);
        assertEq(registry.payoutOf(VENDOR), payout);
        assertEq(registry.controllerOf(VENDOR), controller);
        IPayeeRegistry.PayeeView memory v = registry.payeeOf(VENDOR);
        assertEq(v.pending, address(0));
        assertEq(v.nextController, address(0));
    }

    /// Review NEW-1: revocation never reaches back to changes that already took effect.
    function test_revocation_keepsChangesThatAlreadyTookEffect() public {
        _queueChange(VENDOR, newPayout);
        vm.warp(block.timestamp + CHANGE_DELAY); // matured, never settled
        vm.prank(governance);
        registry.setAttester(attester, false);
        assertEq(registry.payoutOf(VENDOR), newPayout);
        registry.settle(VENDOR);
        assertEq(registry.payoutOf(VENDOR), newPayout);
    }

    /// Review NEW-1: a revoked attester can't be re-enabled, so voided changes never come back; the business can
    /// still clear the inert entry.
    function test_revocation_isPermanent() public {
        _queueChange(VENDOR, newPayout);
        vm.startPrank(governance);
        registry.setAttester(attester, false);
        vm.expectRevert(abi.encodeWithSelector(OfficerQuorum.AttesterRevoked.selector, attester));
        registry.setAttester(attester, true);
        vm.expectRevert(abi.encodeWithSelector(OfficerQuorum.NotAttester.selector, attester));
        registry.setAttester(attester, false);
        vm.stopPrank();

        vm.warp(block.timestamp + CHANGE_DELAY);
        assertEq(registry.payoutOf(VENDOR), payout);
        vm.prank(controller);
        registry.cancelPayoutChange(VENDOR);
        assertEq(registry.payeeOf(VENDOR).pending, address(0));
    }

    // -------------------------------------------------------------- disputes

    function test_dispute_freezesThePayeeAndDropsQueuedChanges() public {
        _queueChange(VENDOR, newPayout);
        _queueRotation(VENDOR, freshKey, OFFICER_B);
        vm.prank(attester);
        registry.fileDispute(VENDOR, rogue, keccak256("lookalike-domain"));

        IPayeeRegistry.PayeeView memory v = registry.payeeOf(VENDOR);
        assertEq(uint8(v.status), uint8(IPayeeRegistry.Status.Disputed));
        assertEq(v.pending, address(0));
        assertEq(v.nextController, address(0));
        assertFalse(registry.isActive(VENDOR));

        OfficerQuorum.OfficerApproval memory a = _payoutApproval(VENDOR, newPayout, _one(OFFICER_A));
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.PayeeNotActive.selector, VENDOR));
        registry.requestPayoutChange(VENDOR, newPayout, a);
    }

    function test_dispute_onlyAttestersFile() public {
        vm.expectRevert(abi.encodeWithSelector(OfficerQuorum.NotAttester.selector, address(this)));
        registry.fileDispute(VENDOR, address(this), bytes32(0));

        vm.prank(attester);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotRegistered.selector, OTHER_VENDOR));
        registry.fileDispute(OTHER_VENDOR, address(this), bytes32(0));
    }

    /// Review finding 3: governance can't rewrite a payee instantly; the winner waits out the delay, frozen.
    function test_resolveDispute_waitsOutTheTimelock() public {
        vm.prank(attester);
        registry.fileDispute(VENDOR, rogue, bytes32(0));
        PayeeRegistry.Registration memory winner = _registration(VENDOR, newPayout, 1);
        vm.prank(governance);
        registry.resolveDispute(winner);
        assertEq(registry.payoutOf(VENDOR), address(0), "still frozen");

        uint64 at = uint64(block.timestamp) + CHANGE_DELAY;
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.ResolutionNotReady.selector, VENDOR, at));
        registry.finalizeDispute(VENDOR);

        vm.warp(at);
        registry.finalizeDispute(VENDOR);
        assertTrue(registry.isActive(VENDOR));
        assertEq(registry.payoutOf(VENDOR), newPayout);
    }

    /// Review NEW-4: governance restores the untouched incumbent at once; nothing moves anywhere new.
    function test_dismissDispute_restoresTheIncumbentAtOnce() public {
        uint64 nonceBefore = registry.nonceOf(VENDOR);
        vm.prank(attester);
        registry.fileDispute(VENDOR, rogue, bytes32(0));
        vm.prank(governance);
        registry.dismissDispute(VENDOR);
        assertTrue(registry.isActive(VENDOR));
        assertEq(registry.payoutOf(VENDOR), payout);
        assertEq(registry.nonceOf(VENDOR), nonceBefore + 2, "dispute and dismissal both burn approvals");

        vm.prank(governance);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotDisputed.selector, VENDOR));
        registry.dismissDispute(VENDOR);
    }

    function test_resolveDispute_onlyGovernanceAndOnlyWhenDisputed() public {
        PayeeRegistry.Registration memory r = _registration(VENDOR, payout, 1);
        vm.prank(governance);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NotDisputed.selector, VENDOR));
        registry.resolveDispute(r);

        vm.prank(attester);
        registry.fileDispute(VENDOR, rogue, bytes32(0));
        vm.prank(attester);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attester));
        registry.resolveDispute(r);
    }

    function test_resolveDispute_aNewClaimRestartsIt() public {
        vm.prank(attester);
        registry.fileDispute(VENDOR, rogue, bytes32(0));
        PayeeRegistry.Registration memory r = _registration(VENDOR, payout, 1);
        vm.prank(governance);
        registry.resolveDispute(r);

        vm.prank(attester);
        registry.fileDispute(VENDOR, makeAddr("secondClaimant"), bytes32(0));
        assertEq(registry.resolvesAt(VENDOR), 0);
        vm.warp(block.timestamp + CHANGE_DELAY);
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.NoQueuedResolution.selector, VENDOR));
        registry.finalizeDispute(VENDOR);
    }

    // ------------------------------------------------------------------ nonces

    /// Review finding 4: an approval phished before a dispute is dead after the payee is restored,
    /// even when the attester issued it with a lax 30-day deadline.
    function test_nonce_staleApprovalDiesAcrossADispute() public {
        OfficerQuorum.OfficerApproval memory phished = _approvalUntil(
            VENDOR,
            OfficerQuorum.Action.ControllerRotation,
            _target(rogue),
            _one(OFFICER_A),
            ATTESTER_PK,
            block.timestamp + 30 days
        );
        vm.prank(attester);
        registry.fileDispute(VENDOR, rogue, bytes32(0));
        PayeeRegistry.Registration memory r = _registration(VENDOR, payout, 1);
        vm.prank(governance);
        registry.resolveDispute(r);
        vm.warp(block.timestamp + CHANGE_DELAY);
        registry.finalizeDispute(VENDOR);

        vm.expectPartialRevert(OfficerQuorum.NotAttester.selector);
        registry.requestControllerRotation(VENDOR, rogue, phished);
    }

    function test_nonce_cancelBurnsOutstandingApprovals() public {
        _queueChange(VENDOR, newPayout);
        OfficerQuorum.OfficerApproval memory spare = _rotationApproval(VENDOR, rogue, _one(OFFICER_A));
        vm.prank(controller);
        registry.cancelPayoutChange(VENDOR);

        vm.expectPartialRevert(OfficerQuorum.NotAttester.selector);
        registry.requestControllerRotation(VENDOR, rogue, spare);
    }

    // ------------------------------------------------------ officers & owner

    function test_updateOfficers_replacesTheSet() public {
        bytes32 officerC = bytes32(uint256(0xC3));
        bytes32[] memory next = _two(OFFICER_B, officerC);
        bytes32 target = registry.officerUpdateTarget(next, 2);
        OfficerQuorum.OfficerApproval memory a =
            _approval(VENDOR, OfficerQuorum.Action.OfficerUpdate, target, _one(OFFICER_A), ATTESTER_PK);
        vm.prank(controller);
        registry.updateOfficers(VENDOR, next, 2, a);
        assertEq(registry.payeeOf(VENDOR).threshold, 2);

        OfficerQuorum.OfficerApproval memory stale =
            _payoutApproval(VENDOR, newPayout, _two(OFFICER_A, OFFICER_B));
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(OfficerQuorum.NotAnOfficer.selector, VENDOR, OFFICER_A));
        registry.requestPayoutChange(VENDOR, newPayout, stale);
    }

    function test_constructor_requiresAMinimumDelay() public {
        vm.expectRevert(abi.encodeWithSelector(PayeeRegistry.DelayTooShort.selector, uint64(0), uint64(1 hours)));
        new PayeeRegistry(governance, 0);
    }

    function test_owner_cannotRenounce() public {
        vm.prank(governance);
        vm.expectRevert(OfficerQuorum.RenounceDisabled.selector);
        registry.renounceOwnership();
    }
}
