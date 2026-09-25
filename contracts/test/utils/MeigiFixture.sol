// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OfficerQuorum} from "../../src/registry/OfficerQuorum.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";

/// @notice Shared setup: a registry with one trusted attester (the verifier service) and helpers that sign
///         officer approvals the way the verifier does after a World ID session proof.
abstract contract MeigiFixture is Test {
    uint256 internal constant ATTESTER_PK = 0xA77E57;
    uint64 internal constant CHANGE_DELAY = 72 hours;

    // Fictional suppliers. Both numbers carry a valid 法人番号 check digit.
    uint64 internal constant VENDOR = 2011001234567;
    uint64 internal constant OTHER_VENDOR = 2010401000001;
    string internal constant VENDOR_NAME = unicode"株式会社メイギ商事";

    // Officer ids: hashes of each officer's World ID session id. Same human => same id.
    bytes32 internal constant OFFICER_A = bytes32(uint256(0xA1));
    bytes32 internal constant OFFICER_B = bytes32(uint256(0xB2));
    bytes32 internal constant STRANGER = bytes32(uint256(0xBAD));

    address internal governance = makeAddr("governance");
    address internal controller = makeAddr("controller");
    address internal payout = makeAddr("payout");
    address internal newPayout = makeAddr("newPayout");
    address internal attester;
    PayeeRegistry internal registry;

    function setUp() public virtual {
        attester = vm.addr(ATTESTER_PK);
        registry = new PayeeRegistry(governance, CHANGE_DELAY);
        vm.prank(governance);
        registry.setAttester(attester, true);
    }

    function _one(bytes32 a) internal pure returns (bytes32[] memory list) {
        list = new bytes32[](1);
        list[0] = a;
    }

    function _two(bytes32 a, bytes32 b) internal pure returns (bytes32[] memory list) {
        list = new bytes32[](2);
        list[0] = a;
        list[1] = b;
    }

    function _target(address account) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(account)));
    }

    function _registration(uint64 tNumber, address payoutAddr, uint8 threshold)
        internal
        view
        returns (PayeeRegistry.Registration memory r)
    {
        r.tNumber = tNumber;
        r.legalName = VENDOR_NAME;
        r.controller = controller;
        r.payout = payoutAddr;
        r.officers = _two(OFFICER_A, OFFICER_B);
        r.threshold = threshold;
        r.evidence = keccak256("nta-exact-match|dns-txt|world-id");
    }

    function _register(uint64 tNumber, address payoutAddr) internal {
        PayeeRegistry.Registration memory r = _registration(tNumber, payoutAddr, 1);
        vm.prank(attester);
        registry.register(r);
    }

    function _approval(
        uint64 tNumber,
        OfficerQuorum.Action action,
        bytes32 target,
        bytes32[] memory officerIds,
        uint256 signerPk
    ) internal view returns (OfficerQuorum.OfficerApproval memory) {
        return _approvalUntil(tNumber, action, target, officerIds, signerPk, block.timestamp + 10 minutes);
    }

    function _approvalUntil(
        uint64 tNumber,
        OfficerQuorum.Action action,
        bytes32 target,
        bytes32[] memory officerIds,
        uint256 signerPk,
        uint256 deadline
    ) internal view returns (OfficerQuorum.OfficerApproval memory a) {
        a.officerIds = officerIds;
        a.deadline = deadline;
        bytes32 digest = registry.approvalDigest(tNumber, action, target, officerIds, a.deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        a.signature = abi.encodePacked(r, s, v);
    }

    function _payoutApproval(uint64 tNumber, address to, bytes32[] memory officerIds)
        internal
        view
        returns (OfficerQuorum.OfficerApproval memory)
    {
        return _approval(tNumber, OfficerQuorum.Action.PayoutChange, _target(to), officerIds, ATTESTER_PK);
    }

    function _rotationApproval(uint64 tNumber, address to, bytes32[] memory officerIds)
        internal
        view
        returns (OfficerQuorum.OfficerApproval memory)
    {
        return _approval(tNumber, OfficerQuorum.Action.ControllerRotation, _target(to), officerIds, ATTESTER_PK);
    }

    /// @dev The legitimate flow: business key + one enrolled officer's fresh World ID session proof.
    function _queueChange(uint64 tNumber, address to) internal {
        OfficerQuorum.OfficerApproval memory a = _payoutApproval(tNumber, to, _one(OFFICER_A));
        vm.prank(controller);
        registry.requestPayoutChange(tNumber, to, a);
    }

    /// @dev Recovery flow: officers ask for a new business key; anyone may relay the approval.
    function _queueRotation(uint64 tNumber, address to, bytes32 officer) internal {
        OfficerQuorum.OfficerApproval memory a = _rotationApproval(tNumber, to, _one(officer));
        registry.requestControllerRotation(tNumber, to, a);
    }
}
