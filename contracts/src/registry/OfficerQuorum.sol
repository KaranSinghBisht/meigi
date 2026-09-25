// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title OfficerQuorum
/// @notice Attesters, per-payee officer sets, and the officer approvals that gate every sensitive change.
/// @dev An officer id is a bytes32 World ID identifier: the hash of the officer's World ID 4.0 session id,
///      created once at enrollment. Every later approval proves that same session, so the same human always
///      maps to the same officer id and a different human never does. Attesters (the Meigi verifier) check the
///      World ID proof off-chain and sign an EIP-712 approval naming the officers who proved it. An approval
///      is bound to one payee, one action, one target, and the payee's current nonce.
///      Trust assumption: attesters are trusted to have verified the proofs. Production would verify World ID
///      on-chain with the EIP-712 struct hash as the signal, and require k-of-n attesters.
abstract contract OfficerQuorum is EIP712, Ownable2Step {
    enum Action {
        PayoutChange,
        ControllerRotation,
        OfficerUpdate
    }

    struct OfficerApproval {
        bytes32[] officerIds; // sorted ascending; each must be enrolled for the payee
        uint256 deadline;
        bytes signature; // an attester's EIP-712 signature
    }

    bytes32 public constant APPROVAL_TYPEHASH = keccak256(
        "OfficerApproval(uint64 tNumber,uint8 action,bytes32 target,bytes32[] officerIds,uint64 nonce,uint256 deadline)"
    );
    uint256 public constant MAX_OFFICERS = 8;

    mapping(address => bool) public isAttester;
    mapping(uint64 => bytes32[]) private _officers;
    mapping(uint64 => uint8) private _thresholds;
    mapping(uint64 => uint64) private _nonces;

    event AttesterSet(address indexed attester, bool allowed);
    event OfficersUpdated(uint64 indexed tNumber, uint256 count, uint8 threshold);

    error NotAttester(address account);
    error ZeroAddress();
    error InvalidOfficers();
    error ApprovalExpired(uint256 deadline);
    error QuorumNotMet(uint256 given, uint256 required);
    error NotAnOfficer(uint64 tNumber, bytes32 officerId);
    error RenounceDisabled();

    modifier onlyAttester() {
        if (!isAttester[msg.sender]) revert NotAttester(msg.sender);
        _;
    }

    /// @notice Revoking an attester also voids every change it approved that has not taken effect yet.
    function setAttester(address attester, bool allowed) external onlyOwner {
        if (attester == address(0)) revert ZeroAddress();
        isAttester[attester] = allowed;
        emit AttesterSet(attester, allowed);
    }

    /// @notice Disabled: a registry without governance would leave disputed payees frozen forever.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    function officersOf(uint64 tNumber) external view returns (bytes32[] memory) {
        return _officers[tNumber];
    }

    function thresholdOf(uint64 tNumber) public view returns (uint8) {
        return _thresholds[tNumber];
    }

    /// @notice The nonce the next approval for this payee must be signed over.
    function nonceOf(uint64 tNumber) public view returns (uint64) {
        return _nonces[tNumber];
    }

    /// @notice The EIP-712 digest an attester signs to approve `action` on `target` for this payee.
    function approvalDigest(
        uint64 tNumber,
        Action action,
        bytes32 target,
        bytes32[] calldata officerIds,
        uint256 deadline
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                APPROVAL_TYPEHASH,
                tNumber,
                uint8(action),
                target,
                keccak256(abi.encodePacked(officerIds)),
                _nonces[tNumber],
                deadline
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice The approval target for `updateOfficers`.
    function officerUpdateTarget(bytes32[] calldata officers, uint8 threshold) public pure returns (bytes32) {
        return keccak256(abi.encode(officers, threshold));
    }

    /// @dev Checks the quorum and the attester signature, then burns the nonce. Returns the attester so the
    ///      caller can tie a queued change to it (see `setAttester`).
    function _consumeApproval(uint64 tNumber, Action action, bytes32 target, OfficerApproval calldata a)
        internal
        returns (address attester)
    {
        if (block.timestamp > a.deadline) revert ApprovalExpired(a.deadline);
        _requireQuorum(tNumber, a.officerIds);
        attester = ECDSA.recover(approvalDigest(tNumber, action, target, a.officerIds, a.deadline), a.signature);
        if (!isAttester[attester]) revert NotAttester(attester);
        _nonces[tNumber]++;
    }

    /// @dev Invalidates every outstanding approval for the payee.
    function _bumpNonce(uint64 tNumber) internal {
        _nonces[tNumber]++;
    }

    function _setOfficers(uint64 tNumber, bytes32[] memory officers, uint8 threshold) internal {
        _validateOfficers(officers, threshold);
        delete _officers[tNumber];
        for (uint256 i; i < officers.length; i++) {
            _officers[tNumber].push(officers[i]);
        }
        _thresholds[tNumber] = threshold;
        emit OfficersUpdated(tNumber, officers.length, threshold);
    }

    /// @dev Officers must be sorted ascending, which also makes them distinct and non-zero.
    function _validateOfficers(bytes32[] memory officers, uint8 threshold) internal pure {
        if (officers.length == 0 || officers.length > MAX_OFFICERS) revert InvalidOfficers();
        if (threshold == 0 || threshold > officers.length) revert InvalidOfficers();
        bytes32 prev;
        for (uint256 i; i < officers.length; i++) {
            if (officers[i] <= prev) revert InvalidOfficers();
            prev = officers[i];
        }
    }

    function _requireQuorum(uint64 tNumber, bytes32[] calldata officerIds) private view {
        uint256 required = _thresholds[tNumber];
        if (officerIds.length < required) revert QuorumNotMet(officerIds.length, required);
        bytes32 prev;
        for (uint256 i; i < officerIds.length; i++) {
            if (officerIds[i] <= prev) revert InvalidOfficers();
            if (!_isOfficer(tNumber, officerIds[i])) revert NotAnOfficer(tNumber, officerIds[i]);
            prev = officerIds[i];
        }
    }

    function _isOfficer(uint64 tNumber, bytes32 officerId) private view returns (bool) {
        bytes32[] storage list = _officers[tNumber];
        for (uint256 i; i < list.length; i++) {
            if (list[i] == officerId) return true;
        }
        return false;
    }
}
