// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CompanyNamespace} from "../../src/ens/CompanyNamespace.sol";
import {IEnsV2Factory, IEnsV2Registry} from "../../src/ens/IEnsV2.sol";
import {AgentVault} from "../../src/payments/AgentVault.sol";
import {IAgentVault, ICompanyNames, MandateGate} from "../../src/payments/MandateGate.sol";
import {PayeeGuard} from "../../src/payments/PayeeGuard.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";
import {MockJPYC} from "../../src/token/MockJPYC.sol";
import {MockClaims, MockEnsFactory} from "../ens/EnsV2Mocks.sol";
import {MeigiFixture} from "../utils/MeigiFixture.sol";

/// @dev The buyer company (株式会社ハルカ製作所, fictional) mandates its AP agent through a name it issues; the vault's
///      agent is the gate, so the name decides whether the agent may pay. Real PayeeRegistry, AgentVault and
///      CompanyNamespace; ENSv2 stand-ins from EnsV2Mocks.
contract MandateGateTest is MeigiFixture {
    uint64 internal constant PRINCIPAL = 4999900000005; // registry office 9999 does not exist; valid check digit
    string internal constant PRINCIPAL_CLAIM = "t4999900000005";
    bytes internal constant PARENT = hex"0570617965650365746800"; // payee.eth
    uint64 internal constant VENDOR_DELAY = 1 hours;
    bytes32 internal constant INVOICE = keccak256("INV-2026-0926");

    address internal haruka = makeAddr("haruka-business-key");
    address internal harukaPayout = makeAddr("haruka-payout");
    address internal human = makeAddr("vault-owner");
    address internal agentKey = makeAddr("ap-agent-key");
    address internal brake = makeAddr("meigi-brake");
    address internal stranger = makeAddr("stranger");
    MockClaims internal claims;
    CompanyNamespace internal names;
    MockJPYC internal jpyc;
    AgentVault internal vault;
    MandateGate internal gate;
    uint64 internal claimExpiry;

    function setUp() public override {
        super.setUp();
        _register(VENDOR, payout); // the supplier being paid
        PayeeRegistry.Registration memory r = _registration(PRINCIPAL, harukaPayout, 1);
        r.legalName = unicode"株式会社ハルカ製作所";
        r.controller = haruka;
        vm.prank(attester);
        registry.register(r);

        MockEnsFactory factory = new MockEnsFactory();
        claims = new MockClaims();
        claimExpiry = uint64(block.timestamp + 365 days);
        claims.setExpiry(PRINCIPAL_CLAIM, claimExpiry);
        names = new CompanyNamespace(
            IPayeeRegistry(address(registry)),
            IEnsV2Factory(address(factory)),
            factory.registryImplementation(),
            factory.resolverImplementation(),
            IEnsV2Registry(address(claims)),
            brake,
            PARENT
        );
        vm.prank(haruka);
        address namespace = names.open(PRINCIPAL);
        claims.setSubregistry(PRINCIPAL_CLAIM, namespace); // Meigi attaches it
        _mandate(agentKey, claimExpiry);

        jpyc = new MockJPYC("JPY Coin", "JPYC");
        vault = new AgentVault(human, makeAddr("placeholder"), jpyc, registry, VENDOR_DELAY);
        gate = new MandateGate(IAgentVault(address(vault)), ICompanyNames(address(names)), PRINCIPAL, "ap");
        jpyc.mint(address(vault), 1_000_000 ether);
        vm.startPrank(human);
        vault.setAgent(address(gate));
        vault.approveVendor(VENDOR, payout, 500_000 ether, 1_000_000 ether);
        vm.stopPrank();
        vm.warp(block.timestamp + VENDOR_DELAY);
    }

    function test_ALiveMandatePays() public {
        vm.expectEmit(address(vault));
        emit AgentVault.InvoicePaid(VENDOR, payout, 120_000 ether, INVOICE);
        _pay(agentKey, INVOICE);
        assertEq(jpyc.balanceOf(payout), 120_000 ether);
        assertEq(gate.holder(), agentKey);
    }

    function test_RevokeStopsTheAgentAndReissueRestoresIt() public {
        vm.prank(haruka);
        names.revoke(PRINCIPAL, "ap");
        assertEq(gate.holder(), address(0));
        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(MandateGate.MandateNotLive.selector, PRINCIPAL, "ap"));
        gate.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);

        _mandate(agentKey, claimExpiry);
        _pay(agentKey, INVOICE);
        assertEq(jpyc.balanceOf(payout), 120_000 ether);
    }

    function test_TheNameSurvivesAKeyChange() public {
        address newKey = makeAddr("new-agent-key");
        vm.prank(haruka);
        names.revoke(PRINCIPAL, "ap");
        _mandate(newKey, claimExpiry);

        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(MandateGate.NotMandateHolder.selector, agentKey, newKey));
        gate.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);
        _pay(newKey, INVOICE);
    }

    function test_AnExpiredMandateStops() public {
        vm.prank(haruka);
        names.revoke(PRINCIPAL, "ap");
        _mandate(agentKey, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 1 days);
        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(MandateGate.MandateNotLive.selector, PRINCIPAL, "ap"));
        gate.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);
    }

    function test_ADisputedCompanyCantPay() public {
        vm.prank(attester);
        registry.fileDispute(PRINCIPAL, stranger, keccak256("second claimant"));
        assertEq(gate.holder(), address(0));
        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(MandateGate.PrincipalNotActive.selector, PRINCIPAL));
        gate.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);
    }

    function test_MeigisBrakeStopsTheMandate() public {
        bytes memory notLive = abi.encodeWithSelector(MandateGate.MandateNotLive.selector, PRINCIPAL, "ap");
        vm.prank(brake);
        names.setFrozen(PRINCIPAL, true);
        vm.prank(agentKey);
        vm.expectRevert(notLive);
        gate.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);

        vm.startPrank(brake);
        names.setFrozen(PRINCIPAL, false);
        names.setBlocked(PRINCIPAL, "ap", true);
        vm.stopPrank();
        vm.prank(agentKey);
        vm.expectRevert(notLive);
        gate.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);

        vm.startPrank(brake);
        names.setBlocked(PRINCIPAL, "ap", false);
        names.resetNamespace(PRINCIPAL);
        vm.stopPrank();
        vm.prank(agentKey);
        vm.expectRevert(notLive);
        gate.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);
    }

    function test_AControllerRotationStopsTheOldKeysMandate() public {
        address successor = makeAddr("haruka-new-business-key");
        _queueRotation(PRINCIPAL, successor, OFFICER_A);
        vm.warp(block.timestamp + CHANGE_DELAY + 1);
        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(MandateGate.MandateNotLive.selector, PRINCIPAL, "ap"));
        gate.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);

        vm.prank(successor);
        names.revoke(PRINCIPAL, "ap");
        CompanyNamespace.Name memory n = _mandateName(agentKey, claimExpiry);
        vm.prank(successor);
        names.issue(PRINCIPAL, n);
        _pay(agentKey, INVOICE);
    }

    function test_OnlyTheHolderMayAskAndTheVaultStillChecksEveryPayment() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateGate.NotMandateHolder.selector, stranger, agentKey));
        gate.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);

        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(PayeeGuard.PayeeMismatch.selector, VENDOR, stranger, payout));
        gate.payInvoice(VENDOR, stranger, 120_000 ether, INVOICE);

        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(AgentVault.NotAgent.selector, agentKey));
        vault.payInvoice(VENDOR, payout, 120_000 ether, INVOICE); // the key alone is no longer the vault's agent
    }

    function test_TheOwnerPathIsUnaffected() public {
        vm.prank(human);
        vault.payInvoice(VENDOR, payout, 120_000 ether, INVOICE);
        assertEq(jpyc.balanceOf(payout), 120_000 ether);
    }

    function test_ConstructorChecksItsInputs() public {
        vm.expectRevert(MandateGate.ZeroAddress.selector);
        new MandateGate(IAgentVault(address(0)), ICompanyNames(address(names)), PRINCIPAL, "ap");

        // A vault that checks payments against another registry is refused.
        PayeeRegistry otherRegistry = new PayeeRegistry(governance, CHANGE_DELAY);
        AgentVault otherVault =
            new AgentVault(human, makeAddr("placeholder"), jpyc, otherRegistry, VENDOR_DELAY);
        vm.expectRevert(
            abi.encodeWithSelector(
                MandateGate.RegistryMismatch.selector, address(registry), address(otherRegistry)
            )
        );
        new MandateGate(IAgentVault(address(otherVault)), ICompanyNames(address(names)), PRINCIPAL, "ap");
        assertEq(address(gate.registry()), address(registry));
        assertEq(gate.label(), "ap");
    }

    function _pay(address caller, bytes32 ref) internal {
        vm.prank(caller);
        gate.payInvoice(VENDOR, payout, 120_000 ether, ref);
    }

    function _mandate(address holderKey, uint64 expiry) internal {
        CompanyNamespace.Name memory n = _mandateName(holderKey, expiry);
        vm.prank(haruka);
        names.issue(PRINCIPAL, n);
    }

    function _mandateName(address holderKey, uint64 expiry)
        internal
        pure
        returns (CompanyNamespace.Name memory n)
    {
        n.label = "ap";
        n.holder = holderKey;
        n.expiry = expiry;
        n.keys = new string[](1);
        n.values = new string[](1);
        n.keys[0] = "description";
        n.values[0] =
            unicode"AP agent of 株式会社ハルカ製作所 (fictional demo company): may pay approved suppliers";
    }
}
