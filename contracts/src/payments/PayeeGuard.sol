// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";

/// @notice The one check every Meigi payment path shares: money only goes to the registry's active address.
abstract contract PayeeGuard {
    IPayeeRegistry public immutable registry;

    error PayeeNotActive(uint64 tNumber);
    error PayeeMismatch(uint64 tNumber, address expected, address registered);
    error ZeroAmount();
    error ZeroAddress();

    constructor(IPayeeRegistry registry_) {
        if (address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
    }

    /// @return payout The registered address for `tNumber`.
    /// @dev Reverts when the payee is not active, or when `expected` (the address the invoice asked for) is
    ///      non-zero and differs from the registered one. That revert is how a swapped address gets caught.
    function _checkedPayout(uint64 tNumber, address expected) internal view returns (address payout) {
        if (!registry.isActive(tNumber)) revert PayeeNotActive(tNumber);
        payout = registry.payoutOf(tNumber);
        if (expected != address(0) && expected != payout) revert PayeeMismatch(tNumber, expected, payout);
    }
}
