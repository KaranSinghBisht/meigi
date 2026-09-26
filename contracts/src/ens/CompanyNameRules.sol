// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CompanyNameRules
/// @notice The shape rules for names a company issues under its payee name (see CompanyNamespace): which labels and text
///         keys it may use, and how an issued name's DNS encoding splits into its T-number and label.
library CompanyNameRules {
    uint256 internal constant MAX_LABEL_LENGTH = 32;
    /// @dev A T-number has 13 digits, so no label may carry a run of 13.
    uint256 internal constant T_NUMBER_DIGITS = 13;

    error InvalidLabel(string label);
    error ReservedKey(string key);

    /// @dev 1 to 32 of [a-z0-9] with single inner hyphens: ENSIP-15-normal as is (no `--` anywhere, so no `xn--`
    ///      punycode and nothing a client would refuse to normalize), and no run of 13 digits, so a label can't pose
    ///      as a T-number (e.g. `t8999900000001.t2011001234567.payee.eth`).
    function checkLabel(string calldata label) internal pure {
        bytes calldata b = bytes(label);
        uint256 n = b.length;
        if (n == 0 || n > MAX_LABEL_LENGTH || b[0] == "-" || b[n - 1] == "-") revert InvalidLabel(label);
        uint256 run;
        for (uint256 i; i < n; ++i) {
            bytes1 c = b[i];
            bool digit = c >= "0" && c <= "9";
            if (c == "-") {
                if (b[i - 1] == "-") revert InvalidLabel(label);
            } else if (!digit && !(c >= "a" && c <= "z")) {
                revert InvalidLabel(label);
            }
            run = digit ? run + 1 : 0;
            if (run == T_NUMBER_DIGITS) revert InvalidLabel(label);
        }
    }

    /// @dev Keys a company can't publish on an issued name, in any letter case: `meigi.*` (registry facts on payee
    ///      names) and the profile keys `name`, `display`, `url` and `avatar`, because who the company is comes from
    ///      the parent payee name, which the registry answers.
    function checkKey(string calldata key) internal pure {
        bytes calldata k = bytes(key);
        if (
            _startsWithLower(k, "meigi.") || _isLower(k, "name") || _isLower(k, "display")
                || _isLower(k, "url") || _isLower(k, "avatar")
        ) revert ReservedKey(key);
    }

    /// @dev Splits a DNS-encoded `<label>.t<13 digits>.<parent>`, where keccak256(parent) is `parentNameHash`. `exact`
    ///      is false for any other shape, a deeper name included.
    function parse(bytes calldata name, bytes32 parentNameHash)
        internal
        pure
        returns (uint64 tNumber, bytes calldata label, bool exact)
    {
        label = name[0:0];
        if (name.length == 0) return (0, label, false);
        uint256 end = 1 + uint8(name[0]);
        // the label, then a 14-byte label `t<13 digits>`, then the parent
        if (end == 1 || name.length < end + 15 || uint8(name[end]) != 14 || name[end + 1] != "t") {
            return (0, label, false);
        }
        if (keccak256(name[end + 15:]) != parentNameHash) return (0, label, false);
        for (uint256 i = end + 2; i < end + 15; ++i) {
            bytes1 c = name[i];
            if (c < "0" || c > "9") return (0, label, false);
            tNumber = tNumber * 10 + uint64(uint8(c) - 48);
        }
        return (tNumber, name[1:end], true);
    }

    function _isLower(bytes calldata key, bytes memory word) private pure returns (bool) {
        return key.length == word.length && _startsWithLower(key, word);
    }

    /// @dev Whether `key`, with ASCII letters lowercased, starts with the lowercase `prefix`.
    function _startsWithLower(bytes calldata key, bytes memory prefix) private pure returns (bool) {
        if (key.length < prefix.length) return false;
        for (uint256 i; i < prefix.length; ++i) {
            bytes1 c = key[i];
            if (c >= "A" && c <= "Z") c = bytes1(uint8(c) + 32);
            if (c != prefix[i]) return false;
        }
        return true;
    }
}
