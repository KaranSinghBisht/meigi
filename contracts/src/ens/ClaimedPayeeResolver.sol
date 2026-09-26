// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";
import {TNumber} from "../registry/TNumber.sol";

/// @notice ENSIP-10 `resolve(bytes,bytes)`: implemented by PayeeResolver and by ENSv2's PermissionedResolver.
interface IExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

/// @title ClaimedPayeeResolver
/// @notice Resolver for a payee name that a verified company has claimed as an ENSv2 token, e.g.
///         `t2011001234567.payee.eth` in payee.eth's subregistry. The company edits its own profile, and the money
///         records stay bound to the registry:
///         - `addr`, `addr(coinType)`, `name` and every `meigi.*` text are answered by the PayeeResolver, which reads
///           the PayeeRegistry (timelocked changes; disputed or unknown payees fail closed);
///         - every other text key (url, avatar, description, ...) comes from the company's own ENSv2
///           PermissionedResolver, where the company holds ROLE_SET_TEXT. It shows only while the registry lists the
///           payee as active under the controller that claimed the name.
///         No claim, profile or company key can change where a payment goes.
contract ClaimedPayeeResolver is IERC165, Ownable2Step {
    bytes4 private constant EXTENDED_RESOLVER = 0x9061b923; // resolve(bytes,bytes)
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant ADDR_COIN = 0xf1cb7e06; // addr(bytes32,uint256)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)
    bytes4 private constant MULTICALL = 0xac9650d8; // multicall(bytes[])

    /// @notice The PayeeResolver that serves payee.eth; the single source for money records.
    IExtendedResolver public immutable payees;
    /// @notice The registry that PayeeResolver reads; it decides whether a profile shows.
    IPayeeRegistry public immutable registry;
    /// @notice keccak256 of the DNS-encoded parent, e.g. "\x05payee\x03eth\x00".
    bytes32 public immutable parentNameHash;
    /// @notice The company's own profile resolver for each claimed T-number (set by Meigi at claim time).
    mapping(uint64 tNumber => IExtendedResolver) public profileOf;
    /// @notice The registry controller that claimed each T-number, and so wrote its profile.
    mapping(uint64 tNumber => address) public claimantOf;

    event ProfileSet(uint64 indexed tNumber, address profile, address claimant);

    error UnsupportedRecord(bytes4 selector);
    error InvalidParentName();

    constructor(
        IExtendedResolver payees_,
        IPayeeRegistry registry_,
        bytes memory parentDnsName,
        address owner_
    ) Ownable(owner_) {
        uint256 n = parentDnsName.length;
        if (n < 2 || parentDnsName[n - 1] != 0x00) revert InvalidParentName();
        payees = payees_;
        registry = registry_;
        parentNameHash = keccak256(parentDnsName);
    }

    /// @notice Points a claimed T-number at the profile resolver of the controller that claimed it (zero clears it).
    function setProfile(uint64 tNumber, IExtendedResolver profile, address claimant) external onlyOwner {
        if (!TNumber.isValid(tNumber)) revert TNumber.InvalidTNumber();
        profileOf[tNumber] = profile;
        claimantOf[tNumber] = claimant;
        emit ProfileSet(tNumber, address(profile), claimant);
    }

    /// @notice ENSIP-10 entry point. `name` is DNS-encoded.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        if (data.length < 4) revert UnsupportedRecord(bytes4(0));
        bytes4 selector = bytes4(data[:4]);
        if (selector == MULTICALL) return _multicall(name, data);
        if (selector == ADDR || selector == ADDR_COIN) return _fromRegistry(name, data, selector);
        if (selector != TEXT) revert UnsupportedRecord(selector);
        (, string memory key) = abi.decode(data[4:], (bytes32, string));
        if (_isRegistryKey(bytes(key))) return _fromRegistry(name, data, selector);
        return _profileText(name, data);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == EXTENDED_RESOLVER;
    }

    /// @dev Money records and registry keys come only from the PayeeResolver. If it reverts, the answer is empty, so a
    ///      payment fails closed instead of falling back to anything else.
    function _fromRegistry(bytes calldata name, bytes calldata data, bytes4 selector)
        private
        view
        returns (bytes memory)
    {
        try payees.resolve(name, data) returns (bytes memory result) {
            return result;
        } catch {
            if (selector == ADDR) return abi.encode(address(0));
            if (selector == ADDR_COIN) return abi.encode(bytes(""));
            return abi.encode("");
        }
    }

    /// @dev A company profile never answers for the registry's keys, and a failing profile reads as empty.
    function _profileText(bytes calldata name, bytes calldata data) private view returns (bytes memory) {
        uint64 tNumber = _tNumberOf(name);
        IExtendedResolver profile = profileOf[tNumber];
        if (address(profile) == address(0) || !_claimantIsActive(tNumber)) return abi.encode("");
        try profile.resolve(name, data) returns (bytes memory result) {
            return result;
        } catch {
            return abi.encode("");
        }
    }

    /// @dev A profile shows only while the registry lists the payee as active under the controller that claimed the
    ///      name. A dispute means competing claimants, and a new controller (after a dispute or a key rotation) did
    ///      not write this profile. So, as with the legal name, it is withheld. Any failure reads as inactive.
    function _claimantIsActive(uint64 tNumber) private view returns (bool) {
        try registry.payeeOf(tNumber) returns (IPayeeRegistry.PayeeView memory payee) {
            return payee.status == IPayeeRegistry.Status.Active && payee.controller == claimantOf[tNumber];
        } catch {
            return false;
        }
    }

    function _multicall(bytes calldata name, bytes calldata data) private view returns (bytes memory) {
        bytes[] memory calls = abi.decode(data[4:], (bytes[]));
        bytes[] memory results = new bytes[](calls.length);
        for (uint256 i; i < calls.length; i++) {
            try this.resolve(name, calls[i]) returns (bytes memory result) {
                results[i] = result;
            } catch {
                results[i] = "";
            }
        }
        return abi.encode(results);
    }

    /// @dev `name` (the NTA-registered legal name) and every `meigi.*` key belong to the registry, in any letter case,
    ///      so a profile can't publish a look-alike such as `Name` or `Meigi.status` either.
    function _isRegistryKey(bytes memory key) private pure returns (bool) {
        return (key.length == 4 && _startsWithLower(key, "name")) || _startsWithLower(key, "meigi.");
    }

    /// @dev Whether `key`, with ASCII letters lowercased, starts with the lowercase `prefix`.
    function _startsWithLower(bytes memory key, bytes memory prefix) private pure returns (bool) {
        if (key.length < prefix.length) return false;
        for (uint256 i; i < prefix.length; i++) {
            bytes1 c = key[i];
            if (c >= "A" && c <= "Z") c = bytes1(uint8(c) + 32);
            if (c != prefix[i]) return false;
        }
        return true;
    }

    /// @dev The T-number of `t<13 digits>.<parent>`, or zero for any other name.
    function _tNumberOf(bytes calldata name) private view returns (uint64) {
        if (name.length == 0) return 0;
        uint256 end = 1 + uint8(name[0]);
        if (name.length <= end || keccak256(name[end:]) != parentNameHash) return 0;
        (, uint64 tNumber) = TNumber.tryParse(name[1:end]);
        return tNumber;
    }
}
