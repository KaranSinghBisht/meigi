// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IPayeeRegistry} from "./IPayeeRegistry.sol";
import {OfficerQuorum} from "./OfficerQuorum.sol";
import {TNumber} from "./TNumber.sol";

/// @title PayeeRegistry
/// @notice One payout address per Japanese invoice registration number (T-number).
/// @dev Every change that could move money waits out `changeDelay` in public and can be cancelled:
///      - payout changes need the business key (controller) plus an officer quorum;
///      - controller rotations (lost or stolen key) need the officer quorum and can be cancelled by the
///        current controller, so officers alone can never take a payee over;
///      - dispute resolutions by governance keep the payee frozen until the delay passes.
///      A queued change only lands while the attester that approved it is still an attester.
contract PayeeRegistry is IPayeeRegistry, OfficerQuorum {
    struct Registration {
        uint64 tNumber;
        string legalName;
        address controller;
        address payout;
        bytes32[] officers; // World ID officer ids, sorted ascending
        uint8 threshold;
        bytes32 evidence;
    }

    struct Payee {
        address controller;
        Status status;
        address payout;
        address pending;
        address pendingBy; // attester that approved `pending`
        uint64 effectiveAt;
        address nextController;
        address nextControllerBy; // attester that approved `nextController`
        uint64 controllerAt;
        bytes32 evidence;
        string legalName;
    }

    uint64 public immutable changeDelay;

    mapping(uint64 => Payee) private _payees;
    mapping(uint64 => Registration) private _staged;
    mapping(uint64 => uint64) public resolvesAt;

    error NotController(address caller);
    error NotAuthorized(address caller);
    error AlreadyRegistered(uint64 tNumber);
    error NotRegistered(uint64 tNumber);
    error PayeeNotActive(uint64 tNumber);
    error NotDisputed(uint64 tNumber);
    error NoPendingChange(uint64 tNumber);
    error NoPendingRotation(uint64 tNumber);
    error RotationPending(uint64 tNumber);
    error NoQueuedResolution(uint64 tNumber);
    error ResolutionNotReady(uint64 tNumber, uint64 resolvesAt);
    error InvalidPayout(address payout);
    error InvalidController(address controller);
    error EmptyName();

    constructor(address owner_, uint64 changeDelay_) EIP712("MeigiPayeeRegistry", "1") Ownable(owner_) {
        changeDelay = changeDelay_;
    }

    // ----------------------------------------------------------- registration

    /// @notice Records a verified business. Each T-number is claimed once; a later claim goes to `fileDispute`.
    function register(Registration calldata r) external onlyAttester {
        if (!TNumber.isValid(r.tNumber)) revert TNumber.InvalidTNumber();
        if (_payees[r.tNumber].status != Status.None) revert AlreadyRegistered(r.tNumber);
        _write(r);
        emit PayeeRegistered(r.tNumber, r.controller, r.payout, r.legalName, r.evidence);
    }

    /// @notice Freezes a payee when a second verified claimant appears. Queued changes are dropped.
    function fileDispute(uint64 tNumber, address claimant, bytes32 evidence) external onlyAttester {
        Payee storage p = _payees[tNumber];
        if (p.status == Status.None) revert NotRegistered(tNumber);
        _settle(tNumber);
        _dropPayoutChange(tNumber);
        _dropRotation(tNumber);
        _dropResolution(tNumber);
        p.status = Status.Disputed;
        _bumpNonce(tNumber);
        emit ClaimDisputed(tNumber, claimant, evidence);
    }

    /// @notice Queues the winning claim (possibly the incumbent's). The payee stays frozen for `changeDelay`.
    function resolveDispute(Registration calldata winner) external onlyOwner {
        if (_payees[winner.tNumber].status != Status.Disputed) revert NotDisputed(winner.tNumber);
        _validate(winner);
        _staged[winner.tNumber] = winner;
        uint64 at = uint64(block.timestamp) + changeDelay;
        resolvesAt[winner.tNumber] = at;
        emit DisputeResolutionQueued(winner.tNumber, winner.controller, winner.payout, at);
    }

    /// @notice Applies a queued resolution once its delay has passed. Anyone can call it.
    function finalizeDispute(uint64 tNumber) external {
        uint64 at = resolvesAt[tNumber];
        if (at == 0 || _payees[tNumber].status != Status.Disputed) revert NoQueuedResolution(tNumber);
        if (block.timestamp < at) revert ResolutionNotReady(tNumber, at);
        Registration memory winner = _staged[tNumber];
        _dropResolution(tNumber);
        _write(winner);
        emit DisputeResolved(tNumber, winner.controller, winner.payout);
    }

    // --------------------------------------------------------- payout changes

    /// @notice Queues a new payout address: business key + officer quorum, then `changeDelay` in public.
    function requestPayoutChange(uint64 tNumber, address newPayout, OfficerApproval calldata approval) external {
        Payee storage p = _activePayee(tNumber);
        if (msg.sender != p.controller) revert NotController(msg.sender);
        if (_rotationPending(p)) revert RotationPending(tNumber);
        if (newPayout == address(0) || newPayout == p.payout) revert InvalidPayout(newPayout);
        address attester = _consumeApproval(tNumber, Action.PayoutChange, _addressTarget(newPayout), approval);
        _dropPayoutChange(tNumber); // a replaced request is announced as cancelled
        uint64 at = uint64(block.timestamp) + changeDelay;
        p.pending = newPayout;
        p.pendingBy = attester;
        p.effectiveAt = at;
        emit PayoutChangeRequested(tNumber, p.payout, newPayout, at);
    }

    /// @notice Drops a queued payout change. The controller, an attester or governance may cancel.
    function cancelPayoutChange(uint64 tNumber) external {
        _settle(tNumber);
        Payee storage p = _payees[tNumber];
        if (!_payoutPending(p)) revert NoPendingChange(tNumber);
        _requireCanceller(p);
        _dropPayoutChange(tNumber);
        _bumpNonce(tNumber);
    }

    /// @notice Writes matured changes to storage. Views already treat them as applied.
    function settle(uint64 tNumber) external {
        _settle(tNumber);
    }

    // --------------------------------------------------------------- recovery

    /// @notice Queues a replacement for a lost or stolen business key. Needs the officer quorum; the current
    ///         controller can cancel within `changeDelay`, so officers alone cannot take a payee over.
    function requestControllerRotation(uint64 tNumber, address newController, OfficerApproval calldata approval)
        external
    {
        Payee storage p = _activePayee(tNumber);
        if (newController == address(0) || newController == p.controller) revert InvalidController(newController);
        address attester =
            _consumeApproval(tNumber, Action.ControllerRotation, _addressTarget(newController), approval);
        _dropRotation(tNumber);
        uint64 at = uint64(block.timestamp) + changeDelay;
        p.nextController = newController;
        p.nextControllerBy = attester;
        p.controllerAt = at;
        emit ControllerRotationRequested(tNumber, p.controller, newController, at);
    }

    /// @notice Drops a queued rotation. The controller, an attester or governance may cancel.
    function cancelControllerRotation(uint64 tNumber) external {
        _settle(tNumber);
        Payee storage p = _payees[tNumber];
        if (!_rotationPending(p)) revert NoPendingRotation(tNumber);
        _requireCanceller(p);
        _dropRotation(tNumber);
        _bumpNonce(tNumber);
    }

    /// @notice Replaces the officer set (N-of-M). Needs the business key and the current quorum, and is
    ///         blocked while a controller rotation is pending.
    function updateOfficers(
        uint64 tNumber,
        bytes32[] calldata officers,
        uint8 threshold,
        OfficerApproval calldata approval
    ) external {
        Payee storage p = _activePayee(tNumber);
        if (msg.sender != p.controller) revert NotController(msg.sender);
        if (_rotationPending(p)) revert RotationPending(tNumber);
        _consumeApproval(tNumber, Action.OfficerUpdate, officerUpdateTarget(officers, threshold), approval);
        _setOfficers(tNumber, officers, threshold);
    }

    // ------------------------------------------------------------------ views

    function payoutOf(uint64 tNumber) public view returns (address) {
        Payee storage p = _payees[tNumber];
        if (p.status != Status.Active) return address(0);
        return _payoutMatured(p) ? p.pending : p.payout;
    }

    function isActive(uint64 tNumber) external view returns (bool) {
        return _payees[tNumber].status == Status.Active;
    }

    function controllerOf(uint64 tNumber) public view returns (address) {
        Payee storage p = _payees[tNumber];
        return _rotationMatured(p) ? p.nextController : p.controller;
    }

    function payeeOf(uint64 tNumber) external view returns (PayeeView memory v) {
        Payee storage p = _payees[tNumber];
        bool payoutQueued = _payoutPending(p) && !_payoutMatured(p);
        bool rotationQueued = _rotationPending(p) && !_rotationMatured(p);
        v.legalName = p.legalName;
        v.controller = controllerOf(tNumber);
        v.payout = _payoutMatured(p) ? p.pending : p.payout;
        v.pending = payoutQueued ? p.pending : address(0);
        v.effectiveAt = payoutQueued ? p.effectiveAt : 0;
        v.nextController = rotationQueued ? p.nextController : address(0);
        v.controllerEffectiveAt = rotationQueued ? p.controllerAt : 0;
        v.nonce = nonceOf(tNumber);
        v.threshold = thresholdOf(tNumber);
        v.status = p.status;
        v.evidence = p.evidence;
    }

    // --------------------------------------------------------------- internal

    function _activePayee(uint64 tNumber) private returns (Payee storage p) {
        _settle(tNumber);
        p = _payees[tNumber];
        if (p.status != Status.Active) revert PayeeNotActive(tNumber);
    }

    function _requireCanceller(Payee storage p) private view {
        bool allowed = msg.sender == p.controller || isAttester[msg.sender] || msg.sender == owner();
        if (!allowed) revert NotAuthorized(msg.sender);
    }

    function _validate(Registration memory r) private pure {
        if (r.controller == address(0) || r.payout == address(0)) revert ZeroAddress();
        if (bytes(r.legalName).length == 0) revert EmptyName();
        _validateOfficers(r.officers, r.threshold);
    }

    function _write(Registration memory r) private {
        _validate(r);
        Payee storage p = _payees[r.tNumber];
        p.controller = r.controller;
        p.payout = r.payout;
        (p.pending, p.pendingBy, p.effectiveAt) = (address(0), address(0), 0);
        (p.nextController, p.nextControllerBy, p.controllerAt) = (address(0), address(0), 0);
        p.status = Status.Active;
        p.evidence = r.evidence;
        p.legalName = r.legalName;
        _setOfficers(r.tNumber, r.officers, r.threshold);
        _bumpNonce(r.tNumber);
    }

    function _settle(uint64 tNumber) private {
        Payee storage p = _payees[tNumber];
        if (_payoutMatured(p)) {
            emit PayoutChanged(tNumber, p.payout, p.pending);
            p.payout = p.pending;
            (p.pending, p.pendingBy, p.effectiveAt) = (address(0), address(0), 0);
        }
        if (_rotationMatured(p)) {
            emit ControllerRotated(tNumber, p.controller, p.nextController);
            p.controller = p.nextController;
            (p.nextController, p.nextControllerBy, p.controllerAt) = (address(0), address(0), 0);
        }
    }

    function _dropPayoutChange(uint64 tNumber) private {
        Payee storage p = _payees[tNumber];
        if (p.pending == address(0)) return;
        emit PayoutChangeCancelled(tNumber, p.pending, msg.sender);
        (p.pending, p.pendingBy, p.effectiveAt) = (address(0), address(0), 0);
    }

    function _dropRotation(uint64 tNumber) private {
        Payee storage p = _payees[tNumber];
        if (p.nextController == address(0)) return;
        emit ControllerRotationCancelled(tNumber, p.nextController, msg.sender);
        (p.nextController, p.nextControllerBy, p.controllerAt) = (address(0), address(0), 0);
    }

    function _dropResolution(uint64 tNumber) private {
        if (resolvesAt[tNumber] == 0) return;
        delete _staged[tNumber];
        resolvesAt[tNumber] = 0;
    }

    /// @dev A queued change only counts while the attester that approved it is still trusted.
    function _payoutPending(Payee storage p) private view returns (bool) {
        return p.pending != address(0) && isAttester[p.pendingBy];
    }

    function _payoutMatured(Payee storage p) private view returns (bool) {
        return _payoutPending(p) && block.timestamp >= p.effectiveAt;
    }

    function _rotationPending(Payee storage p) private view returns (bool) {
        return p.nextController != address(0) && isAttester[p.nextControllerBy];
    }

    function _rotationMatured(Payee storage p) private view returns (bool) {
        return _rotationPending(p) && block.timestamp >= p.controllerAt;
    }

    function _addressTarget(address account) private pure returns (bytes32) {
        return bytes32(uint256(uint160(account)));
    }
}
