// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";
import {TNumber} from "../registry/TNumber.sol";

/// @title PayeeResolver
/// @notice ENSIP-10 wildcard resolver that answers for `t<13 digits>.payee.eth` straight from the registry.
/// @dev Set it as the resolver of the parent name. Only an active payee resolves to an address. A disputed
///      or unknown T-number resolves to zero, so ENS-aware wallets fail closed. Text records:
///      `name` (NTA-registered name), `meigi.tNumber`, `meigi.status`, `meigi.pending`,
///      `meigi.effectiveAt` and `meigi.registry`.
contract PayeeResolver is IERC165 {
    bytes4 private constant EXTENDED_RESOLVER = 0x9061b923; // resolve(bytes,bytes)
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant ADDR_COIN = 0xf1cb7e06; // addr(bytes32,uint256)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)
    bytes4 private constant MULTICALL = 0xac9650d8; // multicall(bytes[])
    uint256 private constant COIN_TYPE_ETH = 60;
    uint256 private constant EVM_COIN_TYPE_FLAG = 0x80000000; // ENSIP-11

    IPayeeRegistry public immutable registry;

    error UnsupportedRecord(bytes4 selector);

    constructor(IPayeeRegistry registry_) {
        registry = registry_;
    }

    /// @notice ENSIP-10 entry point. `name` is DNS-encoded; only its first label is read.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        if (data.length < 4) revert UnsupportedRecord(bytes4(0));
        bytes4 selector = bytes4(data[:4]);
        if (selector == MULTICALL) return _multicall(name, data);
        (, uint64 tNumber) = TNumber.tryParse(_firstLabel(name)); // zero when the label is not a T-number
        if (selector == ADDR) return abi.encode(_activePayout(tNumber));
        if (selector == ADDR_COIN) return abi.encode(_addrForCoin(tNumber, data));
        if (selector == TEXT) return abi.encode(_textRecord(tNumber, data));
        revert UnsupportedRecord(selector);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == EXTENDED_RESOLVER
            || interfaceId == ADDR || interfaceId == ADDR_COIN || interfaceId == TEXT;
    }

    function _multicall(bytes calldata name, bytes calldata data) private view returns (bytes memory) {
        bytes[] memory calls = abi.decode(data[4:], (bytes[]));
        bytes[] memory results = new bytes[](calls.length);
        for (uint256 i; i < calls.length; i++) {
            results[i] = this.resolve(name, calls[i]);
        }
        return abi.encode(results);
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
        if (k == keccak256("name")) return v.legalName;
        if (k == keccak256("meigi.tNumber")) return TNumber.toString(tNumber);
        if (k == keccak256("meigi.status")) return v.status == IPayeeRegistry.Status.Active ? "active" : "disputed";
        if (k == keccak256("meigi.pending")) {
            return v.pending == address(0) ? "" : Strings.toChecksumHexString(v.pending);
        }
        if (k == keccak256("meigi.effectiveAt")) return v.effectiveAt == 0 ? "" : Strings.toString(v.effectiveAt);
        if (k == keccak256("meigi.registry")) return Strings.toChecksumHexString(address(registry));
        return "";
    }

    function _firstLabel(bytes calldata name) private pure returns (bytes memory) {
        if (name.length == 0) return "";
        uint256 len = uint8(name[0]);
        if (name.length < 1 + len) return "";
        return name[1:1 + len];
    }
}
