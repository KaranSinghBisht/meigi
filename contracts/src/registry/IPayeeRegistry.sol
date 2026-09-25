// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Read side of the Meigi payee registry: invoice registration numbers (T-numbers, stored as
///         their 13 digits) mapped to one verified payout address each.
interface IPayeeRegistry {
    enum Status {
        None,
        Active,
        Disputed
    }

    struct PayeeView {
        string legalName; // exact NTA-registered name
        address controller; // business key (a matured rotation is already applied)
        address payout; // registered payout (a matured change is already applied); frozen while disputed
        address pending; // queued payout change still inside its timelock, or zero
        uint64 effectiveAt; // when `pending` takes over
        address nextController; // queued controller rotation still inside its timelock, or zero
        uint64 controllerEffectiveAt; // when `nextController` takes over
        uint64 nonce; // next officer-approval nonce
        uint8 threshold; // officer approvals needed for changes
        Status status;
        bytes32 evidence; // hash of the off-chain verification bundle
    }

    event PayeeRegistered(
        uint64 indexed tNumber, address indexed controller, address payout, string legalName, bytes32 evidence
    );
    event PayoutChangeRequested(
        uint64 indexed tNumber, address indexed from, address indexed to, uint64 effectiveAt
    );
    event PayoutChangeCancelled(uint64 indexed tNumber, address indexed cancelled, address by);
    event PayoutChanged(uint64 indexed tNumber, address indexed from, address indexed to);
    event ControllerRotationRequested(
        uint64 indexed tNumber, address indexed from, address indexed to, uint64 effectiveAt
    );
    event ControllerRotationCancelled(uint64 indexed tNumber, address indexed cancelled, address by);
    event ControllerRotated(uint64 indexed tNumber, address indexed from, address indexed to);
    event ClaimDisputed(uint64 indexed tNumber, address indexed claimant, bytes32 evidence);
    event DisputeResolutionQueued(
        uint64 indexed tNumber, address indexed controller, address payout, uint64 resolvesAt
    );
    event DisputeResolved(uint64 indexed tNumber, address indexed controller, address payout);
    event DisputeDismissed(uint64 indexed tNumber);

    /// @return Where payments for `tNumber` go right now, or zero unless the payee is active (fails closed).
    function payoutOf(uint64 tNumber) external view returns (address);

    /// @return True when the payee is registered and not frozen by a dispute.
    function isActive(uint64 tNumber) external view returns (bool);

    function payeeOf(uint64 tNumber) external view returns (PayeeView memory);
}
