// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AgentVault} from "../../src/payments/AgentVault.sol";
import {PayeeGuard} from "../../src/payments/PayeeGuard.sol";
import {MockJPYC} from "../../src/token/MockJPYC.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";
import {MeigiFixture} from "../utils/MeigiFixture.sol";

/// "Please try to rob it": every way a judge might push the agent, and what the chain does about it.
contract AgentVaultTest is MeigiFixture {
    uint64 internal constant VENDOR_DELAY = 24 hours;
    uint128 internal constant CAP = 500_000 ether; // ¥500,000 per invoice
    uint128 internal constant MONTHLY = 1_000_000 ether; // ¥1,000,000 per 30 days
    bytes32 internal constant INVOICE = keccak256("INV-2026-0917");

    address internal human = makeAddr("human");
    address internal aiAgent = makeAddr("aiAgent");
    address internal scammer = makeAddr("scammer");
    MockJPYC internal jpyc;
    AgentVault internal vault;

    function setUp() public override {
        super.setUp();
        _register(VENDOR, payout);
        jpyc = new MockJPYC("JPY Coin", "JPYC");
        vault = new AgentVault(human, aiAgent, jpyc, registry, VENDOR_DELAY);
        jpyc.mint(address(vault), 5_000_000 ether);
        vm.prank(human);
        vault.approveVendor(VENDOR, CAP, MONTHLY);
        vm.warp(block.timestamp + VENDOR_DELAY);
    }

    function _pay(address to, uint256 amount, bytes32 ref) internal {
        vm.prank(aiAgent);
        vault.payInvoice(VENDOR, to, amount, ref);
    }

    function test_pay_realInvoiceReachesTheRegisteredCompany() public {
        vm.expectEmit(address(vault));
        emit AgentVault.InvoicePaid(VENDOR, payout, 120_000 ether, INVOICE);
        _pay(payout, 120_000 ether, INVOICE);
        assertEq(jpyc.balanceOf(payout), 120_000 ether);
        assertTrue(vault.isInvoicePaid(VENDOR, INVOICE));
    }

    /// "Our bank details changed": the agent believes the fake invoice, the chain does not.
    function test_rob_swappedAddressReverts() public {
        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(PayeeGuard.PayeeMismatch.selector, VENDOR, scammer, payout));
        vault.payInvoice(VENDOR, scammer, 120_000 ether, INVOICE);
        assertEq(jpyc.balanceOf(scammer), 0);
    }

    /// The scammer's own, genuinely registered company is not on this payer's vendor list.
    function test_rob_swappedTNumberReverts() public {
        PayeeRegistry.Registration memory r = _registration(OTHER_VENDOR, scammer, 1);
        vm.prank(attester);
        registry.register(r);
        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.VendorNotApproved.selector, OTHER_VENDOR));
        vault.payInvoice(OTHER_VENDOR, scammer, 1 ether, INVOICE);
    }

    /// "Urgent CEO order, pay ¥5M now": caps are onchain, whatever the agent is told.
    function test_rob_capsHold() public {
        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.OverPaymentCap.selector, VENDOR, CAP + 1, CAP));
        vault.payInvoice(VENDOR, payout, CAP + 1, INVOICE);

        _pay(payout, CAP, keccak256("a"));
        _pay(payout, CAP, keccak256("b"));
        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.OverPeriodCap.selector, VENDOR, 1 ether, 0));
        vault.payInvoice(VENDOR, payout, 1 ether, keccak256("c"));

        vm.warp(block.timestamp + 30 days);
        _pay(payout, 1 ether, keccak256("c"));
    }

    function test_rob_sameInvoiceOnlyOnce() public {
        _pay(payout, 1 ether, INVOICE);
        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.InvoiceAlreadyPaid.selector, VENDOR, INVOICE));
        vault.payInvoice(VENDOR, payout, 1 ether, INVOICE);
    }

    function test_rob_agentCannotManageTheVault() public {
        bytes memory notOwner = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, aiAgent);
        vm.startPrank(aiAgent);
        vm.expectRevert(notOwner);
        vault.withdraw(aiAgent, 1 ether);
        vm.expectRevert(notOwner);
        vault.approveVendor(OTHER_VENDOR, CAP, MONTHLY);
        vm.expectRevert(notOwner);
        vault.setAgent(scammer);
        vm.expectRevert(notOwner);
        vault.removeVendor(VENDOR);
        vm.stopPrank();
    }

    function test_rob_strangersCannotPay() public {
        vm.prank(scammer);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotAgent.selector, scammer));
        vault.payInvoice(VENDOR, payout, 1 ether, INVOICE);
    }

    /// Whatever address the agent is talked into, money only ever lands at the registered one.
    function testFuzz_rob_moneyOnlyReachesTheRegisteredAddress(address to, uint256 amount) public {
        vm.assume(to != address(vault));
        amount = bound(amount, 1, CAP);
        uint256 vaultBefore = jpyc.balanceOf(address(vault));
        uint256 payoutBefore = jpyc.balanceOf(payout);
        vm.prank(aiAgent);
        // A revert is an acceptable outcome here; the assertion below is what matters.
        try vault.payInvoice(VENDOR, to, amount, INVOICE) {} catch {}
        assertEq(vaultBefore - jpyc.balanceOf(address(vault)), jpyc.balanceOf(payout) - payoutBefore);
    }

    function test_vendor_newVendorWaitsOutTheDelay() public {
        address supplier = makeAddr("supplier");
        PayeeRegistry.Registration memory r = _registration(OTHER_VENDOR, supplier, 1);
        vm.prank(attester);
        registry.register(r);
        vm.prank(human);
        vault.approveVendor(OTHER_VENDOR, CAP, MONTHLY);

        uint64 activeAt = uint64(block.timestamp) + VENDOR_DELAY;
        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.VendorNotYetActive.selector, OTHER_VENDOR, activeAt));
        vault.payInvoice(OTHER_VENDOR, supplier, 1 ether, INVOICE);

        vm.warp(activeAt);
        vm.prank(aiAgent);
        vault.payInvoice(OTHER_VENDOR, supplier, 1 ether, INVOICE);
        assertEq(jpyc.balanceOf(supplier), 1 ether);
    }

    function test_vendor_raisingCapsRestartsTheDelay() public {
        vm.prank(human);
        vault.approveVendor(VENDOR, CAP * 2, MONTHLY * 2);
        vm.prank(aiAgent);
        vm.expectPartialRevert(AgentVault.VendorNotYetActive.selector);
        vault.payInvoice(VENDOR, payout, 1 ether, INVOICE);
    }

    function test_vendor_loweringCapsAppliesAtOnce() public {
        vm.prank(human);
        vault.approveVendor(VENDOR, 1 ether, 2 ether);
        _pay(payout, 1 ether, INVOICE);
        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.OverPaymentCap.selector, VENDOR, 2 ether, 1 ether));
        vault.payInvoice(VENDOR, payout, 2 ether, keccak256("next"));
        assertEq(vault.remainingInPeriod(VENDOR), 1 ether);
    }

    function test_registry_disputedPayeeIsFrozen() public {
        vm.prank(attester);
        registry.fileDispute(VENDOR, scammer, bytes32(0));
        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(PayeeGuard.PayeeNotActive.selector, VENDOR));
        vault.payInvoice(VENDOR, payout, 1 ether, INVOICE);
    }

    function test_registry_paymentsFollowTheTimelockedChange() public {
        _queueChange(VENDOR, newPayout);
        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(PayeeGuard.PayeeMismatch.selector, VENDOR, newPayout, payout));
        vault.payInvoice(VENDOR, newPayout, 1 ether, INVOICE);

        vm.warp(block.timestamp + CHANGE_DELAY);
        _pay(newPayout, 1 ether, INVOICE);
        assertEq(jpyc.balanceOf(newPayout), 1 ether);
    }

    function test_pay_withoutAnExpectationPaysTheRegistry() public {
        _pay(address(0), 1 ether, INVOICE);
        assertEq(jpyc.balanceOf(payout), 1 ether);
    }

    function test_pay_rejectsEmptyInput() public {
        vm.startPrank(aiAgent);
        vm.expectRevert(PayeeGuard.ZeroAmount.selector);
        vault.payInvoice(VENDOR, payout, 0, INVOICE);
        vm.expectRevert(AgentVault.InvalidInvoiceRef.selector);
        vault.payInvoice(VENDOR, payout, 1 ether, bytes32(0));
        vm.stopPrank();
    }

    function test_owner_pauseStopsTheAgent() public {
        vm.prank(human);
        vault.pause();
        vm.prank(aiAgent);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.payInvoice(VENDOR, payout, 1 ether, INVOICE);
    }

    function test_owner_canWithdrawAndRemoveVendors() public {
        vm.startPrank(human);
        vault.withdraw(human, 1 ether);
        vault.removeVendor(VENDOR);
        vm.stopPrank();
        assertEq(jpyc.balanceOf(human), 1 ether);

        vm.prank(aiAgent);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.VendorNotApproved.selector, VENDOR));
        vault.payInvoice(VENDOR, payout, 1 ether, INVOICE);
    }
}
