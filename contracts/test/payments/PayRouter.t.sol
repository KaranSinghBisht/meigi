// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayeeGuard} from "../../src/payments/PayeeGuard.sol";
import {PayRouter} from "../../src/payments/PayRouter.sol";
import {MockJPYC} from "../../src/token/MockJPYC.sol";
import {MeigiFixture} from "../utils/MeigiFixture.sol";

contract PayRouterTest is MeigiFixture {
    PayRouter internal router;
    MockJPYC internal jpyc;
    address internal payer = makeAddr("payer");

    function setUp() public override {
        super.setUp();
        _register(VENDOR, payout);
        router = new PayRouter(registry);
        jpyc = new MockJPYC("JPY Coin", "JPYC");
        jpyc.mint(payer, 1_000 ether);
        vm.prank(payer);
        jpyc.approve(address(router), type(uint256).max);
    }

    function test_pay_byTNumber() public {
        vm.expectEmit(address(router));
        emit PayRouter.Paid(VENDOR, payer, payout, address(jpyc), 100 ether, "INV-1");
        vm.prank(payer);
        router.pay(jpyc, VENDOR, payout, 100 ether, "INV-1");
        assertEq(jpyc.balanceOf(payout), 100 ether);
    }

    function test_pay_swappedAddressReverts() public {
        address scammer = makeAddr("scammer");
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PayeeGuard.PayeeMismatch.selector, VENDOR, scammer, payout));
        router.pay(jpyc, VENDOR, scammer, 100 ether, "INV-1");
    }

    function test_pay_unregisteredPayeeReverts() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(PayeeGuard.PayeeNotActive.selector, OTHER_VENDOR));
        router.pay(jpyc, OTHER_VENDOR, address(0), 100 ether, "INV-1");
    }

    function test_pay_zeroAmountReverts() public {
        vm.prank(payer);
        vm.expectRevert(PayeeGuard.ZeroAmount.selector);
        router.pay(jpyc, VENDOR, payout, 0, "INV-1");
    }
}
