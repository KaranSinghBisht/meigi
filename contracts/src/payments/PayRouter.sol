// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";
import {PayeeGuard} from "./PayeeGuard.sol";

/// @title PayRouter
/// @notice Pay a company by T-number. Any wallet can use it; it holds no funds and no state.
/// @dev `Paid` reports what the payee actually received (fee-on-transfer safe). Anyone can call this with
///      any token, so indexers must allowlist the token addresses they count.
contract PayRouter is PayeeGuard {
    using SafeERC20 for IERC20;

    event Paid(
        uint64 indexed tNumber,
        address indexed payer,
        address indexed payout,
        address token,
        uint256 amount,
        bytes32 ref
    );

    constructor(IPayeeRegistry registry_) PayeeGuard(registry_) {}

    /// @notice Pulls `amount` of `token` from the caller and sends it to the payee's registered address.
    /// @param expectedPayout The address the invoice asked for, or zero to pay whatever the registry says.
    function pay(IERC20 token, uint64 tNumber, address expectedPayout, uint256 amount, bytes32 ref)
        external
        returns (address payout)
    {
        if (amount == 0) revert ZeroAmount();
        payout = _checkedPayout(tNumber, expectedPayout);
        uint256 before = token.balanceOf(payout);
        token.safeTransferFrom(msg.sender, payout, amount);
        emit Paid(tNumber, msg.sender, payout, address(token), token.balanceOf(payout) - before, ref);
    }
}
