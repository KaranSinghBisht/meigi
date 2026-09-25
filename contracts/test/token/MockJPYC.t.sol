// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MockJPYC} from "../../src/token/MockJPYC.sol";

/// Minimal smart wallet: accepts signatures from one owner key.
contract OwnerWallet is IERC1271 {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        bool ok = err == ECDSA.RecoverError.NoError && signer == owner;
        return ok ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

contract MockJPYCTest is Test {
    uint256 internal constant BUYER_PK = 0xB0B;
    uint256 internal constant VALUE = 10 ether; // ¥10, an x402 API call

    MockJPYC internal jpyc;
    address internal buyer;
    address internal merchant = makeAddr("merchant");
    address internal facilitator = makeAddr("facilitator");

    function setUp() public {
        vm.warp(1_790_000_000);
        jpyc = new MockJPYC("JPY Coin", "JPYC");
        buyer = vm.addr(BUYER_PK);
        jpyc.mint(buyer, 1_000 ether);
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", jpyc.DOMAIN_SEPARATOR(), structHash));
    }

    function _signTransfer(address from, address to, bytes32 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                jpyc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                from,
                to,
                VALUE,
                block.timestamp - 60,
                block.timestamp + 300,
                nonce
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BUYER_PK, _digest(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _settle(address from, address to, bytes32 nonce, bytes memory sig) internal {
        jpyc.transferWithAuthorization(from, to, VALUE, block.timestamp - 60, block.timestamp + 300, nonce, sig);
    }

    function test_transferWithAuthorization_settlesAnX402Payment() public {
        bytes32 nonce = keccak256("x402-1");
        bytes memory sig = _signTransfer(buyer, merchant, nonce);
        vm.prank(facilitator);
        _settle(buyer, merchant, nonce, sig);
        assertEq(jpyc.balanceOf(merchant), VALUE);
        assertTrue(jpyc.authorizationState(buyer, nonce));
    }

    function test_transferWithAuthorization_acceptsSplitSignatures() public {
        bytes32 nonce = keccak256("x402-vrs");
        bytes memory sig = _signTransfer(buyer, merchant, nonce);
        (bytes32 r, bytes32 s) = abi.decode(sig, (bytes32, bytes32));
        uint8 v = uint8(sig[64]);
        jpyc.transferWithAuthorization(
            buyer, merchant, VALUE, block.timestamp - 60, block.timestamp + 300, nonce, v, r, s
        );
        assertEq(jpyc.balanceOf(merchant), VALUE);
    }

    function test_transferWithAuthorization_rejectsReplay() public {
        bytes32 nonce = keccak256("x402-2");
        bytes memory sig = _signTransfer(buyer, merchant, nonce);
        _settle(buyer, merchant, nonce, sig);
        vm.expectRevert(MockJPYC.AuthorizationAlreadyUsed.selector);
        _settle(buyer, merchant, nonce, sig);
    }

    /// A compromised server swapping `payTo` after the buyer signed gets nothing.
    function test_transferWithAuthorization_rejectsASwappedRecipient() public {
        bytes32 nonce = keccak256("x402-3");
        bytes memory sig = _signTransfer(buyer, merchant, nonce);
        vm.expectRevert(MockJPYC.InvalidAuthorizationSignature.selector);
        _settle(buyer, makeAddr("attacker"), nonce, sig);
    }

    function test_transferWithAuthorization_enforcesTheWindow() public {
        bytes32 nonce = keccak256("x402-4");
        bytes memory sig = _signTransfer(buyer, merchant, nonce);
        uint256 validAfter = block.timestamp - 60;
        uint256 validBefore = block.timestamp + 300;

        vm.warp(validBefore);
        vm.expectRevert(MockJPYC.AuthorizationExpired.selector);
        jpyc.transferWithAuthorization(buyer, merchant, VALUE, validAfter, validBefore, nonce, sig);

        vm.warp(validAfter);
        vm.expectRevert(MockJPYC.AuthorizationNotYetValid.selector);
        jpyc.transferWithAuthorization(buyer, merchant, VALUE, validAfter, validBefore, nonce, sig);
    }

    function test_receiveWithAuthorization_onlyThePayeeSubmits() public {
        bytes32 nonce = keccak256("x402-5");
        uint256 validAfter = block.timestamp - 60;
        uint256 validBefore = block.timestamp + 300;
        bytes32 structHash = keccak256(
            abi.encode(
                jpyc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), buyer, merchant, VALUE, validAfter, validBefore, nonce
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BUYER_PK, _digest(structHash));
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(facilitator);
        vm.expectRevert(MockJPYC.CallerMustBePayee.selector);
        jpyc.receiveWithAuthorization(buyer, merchant, VALUE, validAfter, validBefore, nonce, sig);

        vm.prank(merchant);
        jpyc.receiveWithAuthorization(buyer, merchant, VALUE, validAfter, validBefore, nonce, sig);
        assertEq(jpyc.balanceOf(merchant), VALUE);
    }

    function test_cancelAuthorization_blocksLaterUse() public {
        bytes32 nonce = keccak256("x402-6");
        bytes memory transferSig = _signTransfer(buyer, merchant, nonce);
        bytes32 cancelHash = keccak256(abi.encode(jpyc.CANCEL_AUTHORIZATION_TYPEHASH(), buyer, nonce));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(BUYER_PK, _digest(cancelHash));

        jpyc.cancelAuthorization(buyer, nonce, abi.encodePacked(r, s, v));
        vm.expectRevert(MockJPYC.AuthorizationAlreadyUsed.selector);
        _settle(buyer, merchant, nonce, transferSig);
    }

    function test_smartWalletsCanAuthorize() public {
        OwnerWallet wallet = new OwnerWallet(buyer);
        jpyc.mint(address(wallet), 100 ether);
        bytes32 nonce = keccak256("x402-1271");
        bytes memory sig = _signTransfer(address(wallet), merchant, nonce);
        _settle(address(wallet), merchant, nonce, sig);
        assertEq(jpyc.balanceOf(merchant), VALUE);
    }

    function test_mint_isCapped() public {
        uint256 limit = jpyc.MINT_LIMIT();
        vm.expectRevert(MockJPYC.MintLimitExceeded.selector);
        jpyc.mint(merchant, limit + 1);
    }
}
