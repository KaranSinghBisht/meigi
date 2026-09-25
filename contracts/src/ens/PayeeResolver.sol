// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";
import {TNumber} from "../registry/TNumber.sol";

/// @title PayeeResolver
/// @notice ENSIP-10 wildcard resolver that answers for `t<13 digits>.<parent>` straight from the registry.
/// @dev Set it as the resolver of the parent name (e.g. payee.eth). It only answers names exactly one label
///      below that parent, so pointing another name at it resolves to nothing. Only an active payee resolves
///      to an address; disputed or unknown T-numbers resolve to zero, so ENS-aware wallets fail closed.
///      Text records: `name` (NTA-registered name), `meigi.tNumber`, `meigi.status`, `meigi.changePending`,
///      `meigi.effectiveAt`, `meigi.registry`. A queued (unconfirmed) payout address is never published, and a
///      disputed payee publishes only `meigi.tNumber`, `meigi.status` and `meigi.registry`: with competing
///      claimants, neither one's name or schedule is presented as the company's.
contract PayeeResolver is IERC165 {
    bytes4 private constant EXTENDED_RESOLVER = 0x9061b923; // resolve(bytes,bytes)
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant ADDR_COIN = 0xf1cb7e06; // addr(bytes32,uint256)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)
    bytes4 private constant MULTICALL = 0xac9650d8; // multicall(bytes[])
    uint256 private constant COIN_TYPE_ETH = 60;
    uint256 private constant EVM_COIN_TYPE_FLAG = 0x80000000; // ENSIP-11

    IPayeeRegistry public immutable registry;
    bytes32 public immutable parentNameHash; // keccak256 of the DNS-encoded parent, e.g. "\x05payee\x03eth\x00"

    error UnsupportedRecord(bytes4 selector);
    error InvalidParentName();

    constructor(IPayeeRegistry registry_, bytes memory parentDnsName) {
        uint256 n = parentDnsName.length;
        if (n < 2 || parentDnsName[n - 1] != 0x00) revert InvalidParentName();
        registry = registry_;
        parentNameHash = keccak256(parentDnsName);
    }

    /// @notice ENSIP-10 entry point. `name` is DNS-encoded.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        if (data.length < 4) revert UnsupportedRecord(bytes4(0));
        bytes4 selector = bytes4(data[:4]);
        if (selector == MULTICALL) return _multicall(name, data);
        uint64 tNumber = _tNumberOf(name); // zero unless `name` is t<13 digits>.<parent>
        if (selector == ADDR) return abi.encode(_activePayout(tNumber));
        if (selector == ADDR_COIN) return abi.encode(_addrForCoin(tNumber, data));
        if (selector == TEXT) return abi.encode(_textRecord(tNumber, data));
        revert UnsupportedRecord(selector);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == EXTENDED_RESOLVER;
    }

    /// @dev Each sub-call resolves independently; an unsupported record yields empty bytes instead of
    ///      sinking the whole batch (ENS multicall semantics).
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

    function _tNumberOf(bytes calldata name) private view returns (uint64) {
        if (name.length == 0) return 0;
        uint256 end = 1 + uint8(name[0]);
        if (name.length <= end || keccak256(name[end:]) != parentNameHash) return 0;
        (, uint64 tNumber) = TNumber.tryParse(name[1:end]);
        return tNumber;
    }

    function _activePayout(uint64 tNumber) private view returns (address) {
        if (tNumber == 0 || !registry.isActive(tNumber)) return address(0);
        return registry.payoutOf(tNumber);
    }

    function _addrForCoin(uint64 tNumber, bytes calldata data) private view returns (bytes memory) {
        (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
        if (coinType != COIN_TYPE_ETH && coinType != (EVM_COIN_TYPE_FLAG | block.chainid)) return "";
        address payout = _activePayout(tNumber);
        if (payout == address(0)) return "";
        return abi.encodePacked(payout);
    }

    function _textRecord(uint64 tNumber, bytes calldata data) private view returns (string memory) {
        (, string memory key) = abi.decode(data[4:], (bytes32, string));
        if (tNumber == 0) return "";
        IPayeeRegistry.PayeeView memory v = registry.payeeOf(tNumber);
        if (v.status == IPayeeRegistry.Status.None) return "";
        bytes32 k = keccak256(bytes(key));
        bool active = v.status == IPayeeRegistry.Status.Active;
        if (k == keccak256("meigi.tNumber")) return TNumber.toString(tNumber);
        if (k == keccak256("meigi.status")) return active ? "active" : "disputed";
        if (k == keccak256("meigi.registry")) return Strings.toChecksumHexString(address(registry));
        if (!active) return "";
        if (k == keccak256("name")) return v.legalName;
        if (k == keccak256("meigi.changePending")) return v.pending == address(0) ? "" : "true";
        if (k == keccak256("meigi.effectiveAt")) return v.effectiveAt == 0 ? "" : Strings.toString(v.effectiveAt);
        return "";
    }
}
