// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Japanese qualified-invoice registration numbers: "T" + 13 digits.
/// @dev Stored as the 13 digits in a uint64. The leading digit is a check digit (1-9), so every
///      valid number is in [1e12, 1e13). Check-digit validation happens in the verifier, because
///      sole-proprietor numbers are assigned separately from corporate numbers.
library TNumber {
    uint64 internal constant MIN = 1_000_000_000_000;
    uint64 internal constant MAX = 9_999_999_999_999;

    error InvalidTNumber();

    function isValid(uint64 digits) internal pure returns (bool) {
        return digits >= MIN && digits <= MAX;
    }

    /// @notice Parses an ENS label such as "t2011001234567". Returns (false, 0) instead of reverting.
    function tryParse(bytes memory label) internal pure returns (bool ok, uint64 digits) {
        if (label.length != 14) return (false, 0);
        if (label[0] != 0x74 && label[0] != 0x54) return (false, 0); // "t" or "T"
        for (uint256 i = 1; i < 14; i++) {
            uint8 c = uint8(label[i]);
            if (c < 48 || c > 57) return (false, 0);
            digits = digits * 10 + (c - 48);
        }
        if (!isValid(digits)) return (false, 0);
        return (true, digits);
    }

    /// @notice Formats the canonical form, e.g. "T2011001234567".
    function toString(uint64 digits) internal pure returns (string memory) {
        return string.concat("T", Strings.toString(digits));
    }
}
