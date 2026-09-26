// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CompanyNamespace} from "../../src/ens/CompanyNamespace.sol";
import {IEnsV2Factory, IEnsV2Registry} from "../../src/ens/IEnsV2.sol";
import {AgentVault} from "../../src/payments/AgentVault.sol";
import {IAgentVault, ICompanyNames, MandateGate} from "../../src/payments/MandateGate.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";

interface IClaims {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256);
    function setSubregistry(uint256 anyId, address registry) external;
}

/// @dev The mandate on a Sepolia fork of the live stack: the live AgentVault (its owner makes the gate its agent), the
///      live PayeeRegistry, the ENSv2 Beta and Meigi's claims registry. The buyer company 株式会社ハルカ製作所
///      (T4999900000005, a labelled fixture) is registered and claimed on the fork, issues `ap` to the live agent key,
///      and the agent pays 株式会社メイギ商事 through the gate; revoke stops it, re-issue restores it. Needs
///      SEPOLIA_RPC_URL; skipped without it.
contract MandateGateForkTest is Test {
    PayeeRegistry internal constant PAYEES = PayeeRegistry(0x205c977cF1f4Ed42e51a48759550eF40160A6396);
    AgentVault internal constant VAULT = AgentVault(0x87A798CD92dE1340B1b761dd45196AC82bEF793B);
    address internal constant VAULT_OWNER = 0x936bF2352A859aB33B263FBc3d6f5F98A497D334;
    address internal constant AGENT_KEY = 0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68;
    address internal constant FACTORY = 0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C;
    address internal constant USER_REGISTRY_IMPL = 0xA80338aAA8D23831cEa25E858D1774534aBb0263;
    address internal constant RESOLVER_IMPL = 0x14F09Fd05d4585759e54844DC9B00147131Cf243;
    address internal constant CLAIMS = 0xcA0317C97C0f915faaD6D8F354110eA98bDeD0B6;
    address internal constant CLAIMS_RESOLVER = 0xe4679507c08c61BE0328EDC72c91D62Bd6f03ebd;
    address internal constant MEIGI = 0x706C68adE875a8B9e755DC03836Ac0cEfA9cb02c;
    address internal constant ATTESTER = 0x3D5F314C30E77CC6f3677C5409FdC91e83510493;
    uint64 internal constant SHOJI = 2011001234567;
    address internal constant SHOJI_PAYOUT = 0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4;
    uint64 internal constant HARUKA = 4999900000005;
    CompanyNamespace internal constant LIVE_NAMES =
        CompanyNamespace(0x7ECaD5Fd6892270F09D91aB296786186C5bC660A);

    address internal haruka = makeAddr("haruka-business-key");
    CompanyNamespace internal names;
    MandateGate internal gate;

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        if (PAYEES.isActive(HARUKA)) {
            // Since 2026-09-26 the fixture, its namespace and its mandate are live: use them as they are.
            names = LIVE_NAMES;
            haruka = PAYEES.payeeOf(HARUKA).controller;
        } else {
            _setUpBeforeTheLiveRun();
        }
        gate = new MandateGate(IAgentVault(address(VAULT)), ICompanyNames(address(names)), HARUKA, "ap");
        vm.prank(VAULT_OWNER);
        VAULT.setAgent(address(gate));
    }

    /// @dev At a fork block before the live run: record the fixture, open, attach and issue the mandate here.
    function _setUpBeforeTheLiveRun() internal {
        _registerAndClaimHaruka();
        names = new CompanyNamespace(
            IPayeeRegistry(address(PAYEES)),
            IEnsV2Factory(FACTORY),
            USER_REGISTRY_IMPL,
            RESOLVER_IMPL,
            IEnsV2Registry(CLAIMS),
            MEIGI,
            hex"0570617965650365746800"
        );
        vm.prank(haruka);
        address namespace = names.open(HARUKA);
        vm.prank(MEIGI);
        IClaims(CLAIMS).setSubregistry(uint256(keccak256("t4999900000005")), namespace);
        _mandate();
    }

    function test_ForkTheLiveVaultPaysOnlyWhileTheMandateAnswers() public {
        assertEq(gate.holder(), AGENT_KEY);
        uint256 before = VAULT.token().balanceOf(SHOJI_PAYOUT);
        vm.prank(AGENT_KEY);
        gate.payInvoice(SHOJI, SHOJI_PAYOUT, 1_000 ether, keccak256("fork:mandate:first"));
        assertEq(VAULT.token().balanceOf(SHOJI_PAYOUT) - before, 1_000 ether);

        vm.prank(haruka);
        names.revoke(HARUKA, "ap");
        vm.prank(AGENT_KEY);
        vm.expectRevert(abi.encodeWithSelector(MandateGate.MandateNotLive.selector, HARUKA, "ap"));
        gate.payInvoice(SHOJI, SHOJI_PAYOUT, 1_000 ether, keccak256("fork:mandate:second"));

        _mandate();
        vm.prank(AGENT_KEY);
        gate.payInvoice(SHOJI, SHOJI_PAYOUT, 1_000 ether, keccak256("fork:mandate:second"));
        assertEq(VAULT.token().balanceOf(SHOJI_PAYOUT) - before, 2_000 ether);

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateGate.NotMandateHolder.selector, stranger, AGENT_KEY));
        gate.payInvoice(SHOJI, SHOJI_PAYOUT, 1_000 ether, keccak256("fork:mandate:third"));

        // Rollback: the owner gives the vault its key back.
        vm.prank(VAULT_OWNER);
        VAULT.setAgent(AGENT_KEY);
        vm.prank(AGENT_KEY);
        VAULT.payInvoice(SHOJI, SHOJI_PAYOUT, 1_000 ether, keccak256("fork:mandate:direct"));
    }

    /// @dev The fixture, as Meigi's attester and claims admin would record it on the live stack.
    function _registerAndClaimHaruka() internal {
        bytes32[] memory officers = new bytes32[](1);
        officers[0] = keccak256("meigi-demo-fixture-officer");
        PayeeRegistry.Registration memory r;
        r.tNumber = HARUKA;
        r.legalName = unicode"株式会社ハルカ製作所";
        r.controller = haruka;
        r.payout = makeAddr("haruka-payout");
        r.officers = officers;
        r.threshold = 1;
        r.evidence = keccak256("demo-fixture:fictional-vendor:not-an-NTA-company");
        vm.prank(ATTESTER);
        PAYEES.register(r);
        uint64 expiry = IEnsV2Registry(CLAIMS).getExpiry(uint256(keccak256("t2011001234567")));
        vm.prank(MEIGI);
        IClaims(CLAIMS).register("t4999900000005", haruka, address(0), CLAIMS_RESOLVER, 0, expiry);
    }

    function _mandate() internal {
        CompanyNamespace.Name memory n;
        n.label = "ap";
        n.holder = AGENT_KEY;
        n.expiry = uint64(block.timestamp + 90 days);
        n.keys = new string[](1);
        n.values = new string[](1);
        n.keys[0] = "description";
        n.values[0] =
            unicode"AP agent of 株式会社ハルカ製作所 (fictional demo company): may pay approved suppliers";
        vm.prank(haruka);
        names.issue(HARUKA, n);
    }
}
