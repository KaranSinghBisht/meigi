// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IPayeeRegistry} from "./IPayeeRegistry.sol";
import {TNumber} from "./TNumber.sol";

/// @title PayeeRegistry
/// @notice One payout address per Japanese invoice registration number (T-number).
/// @dev Attesters (the Meigi verifier) write registrations after the NTA, domain and World ID checks.
///      Redirecting money needs the business key plus a quorum of the company's enrolled World ID
///      officers, then waits out a public timelock that the controller, an attester or the owner
///      can cancel. Officers are identified by their World ID nullifier hash for the officer action:
///      the same human always produces the same nullifier, a different human never does.
contract PayeeRegistry is IPayeeRegistry, EIP712, Ownable2Step {
    enum Action {
        PayoutChange,
        ControllerRotation,
        OfficerUpdate
    }

    struct Registration {
        uint64 tNumber;
        string legalName;
        address controller;
        address payout;
        bytes32[] officers; // World ID nullifier hashes, sorted ascending
        uint8 threshold;
        bytes32 evidence;
    }

    /// @notice An attester's statement that `nullifiers` just passed World ID for this exact action.
    struct OfficerApproval {
        bytes32[] nullifiers; // sorted ascending; each must be an enrolled officer
        uint256 deadline;
        bytes signature; // attester's EIP-712 signature
    }

    struct Payee {
        address controller;
        address payout;
        address pending;
        uint64 effectiveAt;
        uint64 nonce;
        uint8 threshold;
        Status status;
        bytes32 evidence;
        string legalName;
    }

    bytes32 public constant APPROVAL_TYPEHASH = keccak256(
        "OfficerApproval(uint64 tNumber,uint8 action,bytes32 target,bytes32[] nullifiers,uint64 nonce,uint256 deadline)"
    );
    uint256 public constant MAX_OFFICERS = 8;

    uint64 public immutable changeDelay;

    mapping(uint64 => Payee) private _payees;
    mapping(uint64 => bytes32[]) private _officers;
    mapping(address => bool) public isAttester;

    error NotAttester(address account);
    error NotController(address caller);
    error NotAuthorized(address caller);
    error AlreadyRegistered(uint64 tNumber);
    error NotRegistered(uint64 tNumber);
    error PayeeNotActive(uint64 tNumber);
    error NotDisputed(uint64 tNumber);
    error NoPendingChange(uint64 tNumber);
    error InvalidPayout(address payout);
    error ZeroAddress();
    error EmptyName();
    error InvalidOfficers();
    error ApprovalExpired(uint256 deadline);
    error QuorumNotMet(uint256 given, uint256 required);
    error NotAnOfficer(uint64 tNumber, bytes32 nullifier);

    modifier onlyAttester() {
        if (!isAttester[msg.sender]) revert NotAttester(msg.sender);
        _;
    }

    constructor(address owner_, uint64 changeDelay_) EIP712("MeigiPayeeRegistry", "1") Ownable(owner_) {
        changeDelay = changeDelay_;
    }

    // ------------------------------------------------------------------ admin

    function setAttester(address attester, bool allowed) external onlyOwner {
        if (attester == address(0)) revert ZeroAddress();
        isAttester[attester] = allowed;
        emit AttesterSet(attester, allowed);
    }

    // ----------------------------------------------------------- registration

    /// @notice Records a verified business. Each T-number is claimed once; a later claim goes to `fileDispute`.
    function register(Registration calldata r) external onlyAttester {
        if (!TNumber.isValid(r.tNumber)) revert TNumber.InvalidTNumber();
        if (_payees[r.tNumber].status != Status.None) revert AlreadyRegistered(r.tNumber);
        _write(r);
        emit PayeeRegistered(r.tNumber, r.controller, r.payout, r.legalName, r.evidence);
    }

    /// @notice Freezes a payee when a second verified claimant appears. Payments stop until governance resolves it.
    function fileDispute(uint64 tNumber, address claimant, bytes32 evidence) external onlyAttester {
        Payee storage p = _payees[tNumber];
        if (p.status == Status.None) revert NotRegistered(tNumber);
        _settle(tNumber);
        _clearPending(tNumber);
        p.status = Status.Disputed;
        emit ClaimDisputed(tNumber, claimant, evidence);
    }

    /// @notice Writes the winning claim (possibly the incumbent's) and unfreezes the payee.
    function resolveDispute(Registration calldata winner) external onlyOwner {
        if (_payees[winner.tNumber].status != Status.Disputed) revert NotDisputed(winner.tNumber);
        _write(winner);
        emit DisputeResolved(winner.tNumber, winner.controller, winner.payout);
    }

    // --------------------------------------------------------- payout changes

    /// @notice Queues a new payout address. Needs the business key and an officer quorum, then waits `changeDelay`.
    function requestPayoutChange(uint64 tNumber, address newPayout, OfficerApproval calldata approval) external {
        Payee storage p = _activePayee(tNumber);
        if (msg.sender != p.controller) revert NotController(msg.sender);
        if (newPayout == address(0) || newPayout == p.payout) revert InvalidPayout(newPayout);
        _consumeApproval(tNumber, Action.PayoutChange, _addressTarget(newPayout), approval);
        uint64 effectiveAt = uint64(block.timestamp) + changeDelay;
        p.pending = newPayout;
        p.effectiveAt = effectiveAt;
        emit PayoutChangeRequested(tNumber, p.payout, newPayout, effectiveAt);
    }

    /// @notice Drops a queued change before it takes effect.
    function cancelPayoutChange(uint64 tNumber) external {
        _settle(tNumber);
        Payee storage p = _payees[tNumber];
        if (p.pending == address(0)) revert NoPendingChange(tNumber);
        bool allowed = msg.sender == p.controller || isAttester[msg.sender] || msg.sender == owner();
        if (!allowed) revert NotAuthorized(msg.sender);
        _clearPending(tNumber);
    }

    /// @notice Writes a change whose timelock has passed. Views already treat it as active; this syncs storage.
    function settle(uint64 tNumber) external {
        _settle(tNumber);
    }

    // --------------------------------------------------------------- recovery

    /// @notice Replaces a lost or stolen business key using the officer quorum alone. Drops any queued change.
    function rotateController(uint64 tNumber, address newController, OfficerApproval calldata approval) external {
        Payee storage p = _activePayee(tNumber);
        if (newController == address(0)) revert ZeroAddress();
        _consumeApproval(tNumber, Action.ControllerRotation, _addressTarget(newController), approval);
        _clearPending(tNumber);
        emit ControllerRotated(tNumber, p.controller, newController);
        p.controller = newController;
    }

    /// @notice Replaces the officer set (N-of-M recovery). Needs the business key and the current quorum.
    function updateOfficers(
        uint64 tNumber,
        bytes32[] calldata officers,
        uint8 threshold,
        OfficerApproval calldata approval
    ) external {
        Payee storage p = _activePayee(tNumber);
        if (msg.sender != p.controller) revert NotController(msg.sender);
        _consumeApproval(tNumber, Action.OfficerUpdate, officerUpdateTarget(officers, threshold), approval);
        _setOfficers(tNumber, officers, threshold);
    }

    // ------------------------------------------------------------------ views

    function payoutOf(uint64 tNumber) public view returns (address) {
        Payee storage p = _payees[tNumber];
        return _matured(p) ? p.pending : p.payout;
    }

    function isActive(uint64 tNumber) external view returns (bool) {
        return _payees[tNumber].status == Status.Active;
    }

    function payeeOf(uint64 tNumber) external view returns (PayeeView memory v) {
        Payee storage p = _payees[tNumber];
        bool matured = _matured(p);
        v.legalName = p.legalName;
        v.controller = p.controller;
        v.payout = matured ? p.pending : p.payout;
        v.pending = matured ? address(0) : p.pending;
        v.effectiveAt = matured ? 0 : p.effectiveAt;
        v.nonce = p.nonce;
        v.threshold = p.threshold;
        v.status = p.status;
        v.evidence = p.evidence;
    }

    function officersOf(uint64 tNumber) external view returns (bytes32[] memory) {
        return _officers[tNumber];
    }

    /// @notice The EIP-712 digest an attester signs to approve `action` for the payee's current nonce.
    function approvalDigest(
        uint64 tNumber,
        Action action,
        bytes32 target,
        bytes32[] calldata nullifiers,
        uint256 deadline
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                APPROVAL_TYPEHASH,
                tNumber,
                uint8(action),
                target,
                keccak256(abi.encodePacked(nullifiers)),
                _payees[tNumber].nonce,
                deadline
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice The approval target for `updateOfficers`.
    function officerUpdateTarget(bytes32[] calldata officers, uint8 threshold) public pure returns (bytes32) {
        return keccak256(abi.encode(officers, threshold));
    }

    // --------------------------------------------------------------- internal

    function _activePayee(uint64 tNumber) private returns (Payee storage p) {
        _settle(tNumber);
        p = _payees[tNumber];
        if (p.status != Status.Active) revert PayeeNotActive(tNumber);
    }

    function _consumeApproval(uint64 tNumber, Action action, bytes32 target, OfficerApproval calldata a) private {
        if (block.timestamp > a.deadline) revert ApprovalExpired(a.deadline);
        _requireOfficerQuorum(tNumber, a.nullifiers);
        bytes32 digest = approvalDigest(tNumber, action, target, a.nullifiers, a.deadline);
        address signer = ECDSA.recover(digest, a.signature);
        if (!isAttester[signer]) revert NotAttester(signer);
        _payees[tNumber].nonce++;
    }

    function _requireOfficerQuorum(uint64 tNumber, bytes32[] calldata nullifiers) private view {
        uint256 required = _payees[tNumber].threshold;
        if (nullifiers.length < required) revert QuorumNotMet(nullifiers.length, required);
        bytes32 prev;
        for (uint256 i; i < nullifiers.length; i++) {
            if (nullifiers[i] <= prev) revert InvalidOfficers(); // sorted, so distinct and non-zero
            if (!_isOfficer(tNumber, nullifiers[i])) revert NotAnOfficer(tNumber, nullifiers[i]);
            prev = nullifiers[i];
        }
    }

    function _isOfficer(uint64 tNumber, bytes32 nullifier) private view returns (bool) {
        bytes32[] storage list = _officers[tNumber];
        for (uint256 i; i < list.length; i++) {
            if (list[i] == nullifier) return true;
        }
        return false;
    }

    function _write(Registration calldata r) private {
        if (r.controller == address(0) || r.payout == address(0)) revert ZeroAddress();
        if (bytes(r.legalName).length == 0) revert EmptyName();
        Payee storage p = _payees[r.tNumber];
        p.controller = r.controller;
        p.payout = r.payout;
        p.pending = address(0);
        p.effectiveAt = 0;
        p.status = Status.Active;
        p.evidence = r.evidence;
        p.legalName = r.legalName;
        _setOfficers(r.tNumber, r.officers, r.threshold);
    }

    function _setOfficers(uint64 tNumber, bytes32[] calldata officers, uint8 threshold) private {
        if (officers.length == 0 || officers.length > MAX_OFFICERS) revert InvalidOfficers();
        if (threshold == 0 || threshold > officers.length) revert InvalidOfficers();
        delete _officers[tNumber];
        bytes32 prev;
        for (uint256 i; i < officers.length; i++) {
            if (officers[i] <= prev) revert InvalidOfficers();
            _officers[tNumber].push(officers[i]);
            prev = officers[i];
        }
        _payees[tNumber].threshold = threshold;
        emit OfficersUpdated(tNumber, officers.length, threshold);
    }

    function _settle(uint64 tNumber) private {
        Payee storage p = _payees[tNumber];
        if (!_matured(p)) return;
        emit PayoutChanged(tNumber, p.payout, p.pending);
        p.payout = p.pending;
        p.pending = address(0);
        p.effectiveAt = 0;
    }

    function _clearPending(uint64 tNumber) private {
        Payee storage p = _payees[tNumber];
        if (p.pending == address(0)) return;
        emit PayoutChangeCancelled(tNumber, p.pending, msg.sender);
        p.pending = address(0);
        p.effectiveAt = 0;
    }

    function _matured(Payee storage p) private view returns (bool) {
        return p.pending != address(0) && block.timestamp >= p.effectiveAt;
    }

    function _addressTarget(address account) private pure returns (bytes32) {
        return bytes32(uint256(uint160(account)));
    }
}
