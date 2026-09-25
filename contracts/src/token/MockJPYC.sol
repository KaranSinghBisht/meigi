// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title MockJPYC
/// @notice Testnet-only stand-in for JPYC in case the official Sepolia faucet is dry. It has the same
///         shape as the real token: 18 decimals, EIP-2612 permit and EIP-3009 transfer authorizations
///         (the x402 "exact" scheme). Signatures can come from EOAs or EIP-1271 smart wallets. Anyone can mint.
contract MockJPYC is ERC20, ERC20Permit {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");
    uint256 public constant MINT_LIMIT = 10_000_000 ether; // per call

    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationAlreadyUsed();
    error InvalidAuthorizationSignature();
    error CallerMustBePayee();
    error MintLimitExceeded();

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) ERC20Permit(name_) {}

    function mint(address to, uint256 amount) external {
        if (amount > MINT_LIMIT) revert MintLimitExceeded();
        _mint(to, amount);
    }

    /// @notice EIP-712 domain version, readable by x402 clients that fetch it onchain.
    function version() external pure returns (string memory) {
        return "1";
    }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v));
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) public {
        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _useAuthorization(from, structHash, validAfter, validBefore, nonce, signature);
        _transfer(from, to, value);
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external {
        if (msg.sender != to) revert CallerMustBePayee();
        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _useAuthorization(from, structHash, validAfter, validBefore, nonce, signature);
        _transfer(from, to, value);
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, bytes memory signature) external {
        if (_authorizationStates[authorizer][nonce]) revert AuthorizationAlreadyUsed();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)));
        if (!SignatureChecker.isValidSignatureNow(authorizer, digest, signature)) {
            revert InvalidAuthorizationSignature();
        }
        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _useAuthorization(
        address from,
        bytes32 structHash,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) private {
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (_authorizationStates[from][nonce]) revert AuthorizationAlreadyUsed();
        if (!SignatureChecker.isValidSignatureNow(from, _hashTypedDataV4(structHash), signature)) {
            revert InvalidAuthorizationSignature();
        }
        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
    }
}
