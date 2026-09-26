// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CompanyNameRules} from "../../src/ens/CompanyNameRules.sol";
import {CompanyNamespace} from "../../src/ens/CompanyNamespace.sol";
import {IEnsV2Factory, IEnsV2Registry} from "../../src/ens/IEnsV2.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {OfficerQuorum} from "../../src/registry/OfficerQuorum.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";

interface IClaimsRegistry {
    function setSubregistry(uint256 anyId, address registry) external;
}

interface IRegistryRoles {
    function getResolver(string calldata label) external view returns (address);
    function roles(uint256 anyId, address account) external view returns (uint256);
    function setResolver(uint256 anyId, address resolver) external;
}

interface ILiveResolver {
    function setText(bytes calldata name, string calldata key, string calldata value) external;
    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external;
}

interface ILivePayeeRegistry {
    function fileDispute(uint64 tNumber, address claimant, bytes32 evidence) external;
    function dismissDispute(uint64 tNumber) external;
}

interface IUniversalResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory, address);
}

/// @dev The gate against the real ENSv2 Beta contracts on a Sepolia fork, through the canonical UniversalResolver
///      (what viem and ethers call), for t2011001234567.payee.eth. It covers the two Beta behaviours contracts-review
///      confirmed (a root-node record answering deeper names; unregister then renew reviving a name) as the gate
///      handles them, plus text-only answers, a dispute and a reset. Needs SEPOLIA_RPC_URL; skipped without it.
contract CompanyNamespaceForkTest is Test {
    IPayeeRegistry internal constant PAYEES = IPayeeRegistry(0x205c977cF1f4Ed42e51a48759550eF40160A6396);
    IEnsV2Factory internal constant FACTORY = IEnsV2Factory(0x9e726Eb570beb6BCEb495AB8cdA7df517d4e841C);
    address internal constant USER_REGISTRY_IMPL = 0xA80338aAA8D23831cEa25E858D1774534aBb0263;
    address internal constant RESOLVER_IMPL = 0x14F09Fd05d4585759e54844DC9B00147131Cf243;
    address internal constant CLAIMS = 0xcA0317C97C0f915faaD6D8F354110eA98bDeD0B6;
    IUniversalResolver internal constant UR = IUniversalResolver(0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe);
    address internal constant MEIGI = 0x706C68adE875a8B9e755DC03836Ac0cEfA9cb02c; // payee.eth, claims and registry owner
    address internal constant ATTESTER = 0x3D5F314C30E77CC6f3677C5409FdC91e83510493;
    address internal constant CONTROLLER = 0xc33a9cD6662D39E190855c43a459CBcB938e4638;
    address internal constant PAYOUT = 0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4;
    uint64 internal constant T_NUMBER = 2011001234567;
    bytes internal constant PARENT = hex"0570617965650365746800"; // payee.eth
    string internal constant AP = "ap.t2011001234567.payee.eth";
    bytes4 internal constant ADDR = 0x3b3b57de;
    bytes4 internal constant TEXT = 0x59d1d43c;

    CompanyNamespace internal gate;
    address internal agent = makeAddr("ap-agent");
    address internal accounts = makeAddr("keiri");
    address internal taxAccountant = makeAddr("zeirishi");

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        gate = new CompanyNamespace(
            PAYEES, FACTORY, USER_REGISTRY_IMPL, RESOLVER_IMPL, IEnsV2Registry(CLAIMS), MEIGI, PARENT
        );
    }

    function test_ForkNamesAreTextOnlyExactAndScoped() public {
        _openAttachIssue();
        (, address records,,) = gate.nameOf(T_NUMBER, "ap");
        Text memory description = _text(AP, "description");
        assertEq(description.used, address(gate), "the UniversalResolver asks the gate");
        assertEq(description.v, unicode"AP agent of 株式会社メイギ商事 (fictional demo company)");
        assertEq(
            _text(AP, "agent-endpoint[web]").v,
            "https://meigi.karanbishttt.workers.dev/registry/T2011001234567"
        );
        assertEq(_addr(AP), address(0), "an issued name resolves no address");
        assertEq(_addr("t2011001234567.payee.eth"), PAYOUT, "the payee name is untouched");

        // The holder sets its status through the gate; it holds no role on its resolver, so it can't write another
        // key, an address, or the root node that the resolver would serve to every deeper name.
        vm.prank(agent);
        gate.setStatus(T_NUMBER, "ap", "busy");
        assertEq(_text(AP, "agent-status").v, "busy");
        vm.startPrank(agent);
        vm.expectRevert();
        ILiveResolver(records).setText(hex"00", "agent-status", "pwned");
        vm.expectRevert();
        ILiveResolver(records).setText(_dns(AP), "description", "rewritten");
        vm.expectRevert();
        ILiveResolver(records).setAddress(_dns(AP), 60, abi.encodePacked(agent));
        vm.stopPrank();

        // A deeper name reaches the gate through the ENSIP-10 wildcard, and gets nothing.
        Text memory deeper = _text("x.ap.t2011001234567.payee.eth", "agent-status");
        assertEq(deeper.used, address(gate));
        assertEq(deeper.v, "");
        assertEq(_addr("x.ap.t2011001234567.payee.eth"), address(0));
    }

    function test_ForkRevokeThenRenewCantReviveAName() public {
        _openAttachIssue();
        vm.startPrank(CONTROLLER);
        gate.revoke(T_NUMBER, "keiri");
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.UnknownName.selector, T_NUMBER, "keiri"));
        gate.renew(T_NUMBER, "keiri", uint64(block.timestamp + 30 days));
        vm.stopPrank();
        assertEq(_text("keiri.t2011001234567.payee.eth", "description").v, "");

        vm.warp(block.timestamp + 30 days);
        assertEq(_text("zeirishi.t2011001234567.payee.eth", "description").v, "", "expired after 30 days");
        assertEq(
            _text(AP, "description").v,
            unicode"AP agent of 株式会社メイギ商事 (fictional demo company)"
        );
    }

    function test_ForkADisputeDarkensAndAResetStartsOver() public {
        _openAttachIssue();
        vm.prank(ATTESTER);
        ILivePayeeRegistry(address(PAYEES)).fileDispute(T_NUMBER, makeAddr("claimant"), keccak256("evidence"));
        assertEq(_text(AP, "description").v, "", "dark while disputed");
        vm.prank(MEIGI);
        ILivePayeeRegistry(address(PAYEES)).dismissDispute(T_NUMBER);
        assertEq(
            _text(AP, "description").v,
            unicode"AP agent of 株式会社メイギ商事 (fictional demo company)"
        );

        // Meigi resets the namespace: the old names stop answering even while the old registry is still attached.
        vm.prank(MEIGI);
        gate.resetNamespace(T_NUMBER);
        assertEq(_text(AP, "description").v, "");
        vm.prank(CONTROLLER);
        address fresh = gate.open(T_NUMBER);
        vm.prank(MEIGI);
        IClaimsRegistry(CLAIMS).setSubregistry(uint256(keccak256("t2011001234567")), fresh);
        _issue("ap", taxAccountant, 0, "a new holder, in a new namespace");
        assertEq(_text(AP, "description").v, "a new holder, in a new namespace");
    }

    function test_ForkLookalikeLabelsAreRefused() public {
        _openAttachIssue();
        CompanyNamespace.Name memory n = _name("t8999900000001", agent, 0, "look-alike");
        vm.prank(CONTROLLER);
        vm.expectRevert(abi.encodeWithSelector(CompanyNameRules.InvalidLabel.selector, "t8999900000001"));
        gate.issue(T_NUMBER, n);
    }

    function test_ForkARotationDarkensTheOldKeysNames() public {
        _openAttachIssue();
        address freshKey = makeAddr("fresh-business-key");
        _queueRotation(freshKey);
        assertEq(
            _text(AP, "description").v,
            unicode"AP agent of 株式会社メイギ商事 (fictional demo company)"
        );
        vm.warp(block.timestamp + PayeeRegistry(address(PAYEES)).changeDelay());
        assertEq(PayeeRegistry(address(PAYEES)).controllerOf(T_NUMBER), freshKey);
        assertEq(_text(AP, "description").v, "", "issued by the old key: dark once the rotation lands");

        CompanyNamespace.Name memory n = _name("ap", agent, 0, "re-issued by the new key");
        vm.startPrank(freshKey);
        gate.revoke(T_NUMBER, "ap");
        gate.issue(T_NUMBER, n);
        vm.stopPrank();
        assertEq(_text(AP, "description").v, "re-issued by the new key");
    }

    function test_ForkMeigisBrakeSticksAndNothingBypassesTheGate() public {
        address ns = _openAttachIssue();
        assertEq(IRegistryRoles(ns).getResolver("ap"), address(gate), "the registry entry points at the gate");
        uint256 id = uint256(keccak256("ap"));
        address[4] memory everyone = [CONTROLLER, agent, address(gate), MEIGI];
        for (uint256 i; i < everyone.length; ++i) {
            assertEq(IRegistryRoles(ns).roles(0, everyone[i]) & (1 << 24), 0, "nobody may re-point a name");
            assertEq(IRegistryRoles(ns).roles(id, everyone[i]), 0, "and nobody holds token roles");
            vm.prank(everyone[i]);
            vm.expectRevert();
            IRegistryRoles(ns).setResolver(id, address(0xdead));
        }

        vm.prank(MEIGI);
        gate.setBlocked(T_NUMBER, "ap", true);
        assertEq(_text(AP, "description").v, "", "blocked: dark");
        vm.prank(CONTROLLER);
        vm.expectRevert(abi.encodeWithSelector(CompanyNamespace.Blocked.selector, T_NUMBER, "ap"));
        gate.setText(T_NUMBER, "ap", "description", "x");

        vm.prank(MEIGI);
        gate.setFrozen(T_NUMBER, true);
        assertEq(_text("keiri.t2011001234567.payee.eth", "description").v, "", "frozen: every name dark");
        vm.prank(MEIGI);
        gate.setFrozen(T_NUMBER, false);
        assertEq(
            _text("keiri.t2011001234567.payee.eth", "description").v,
            "Accounts department (fictional demo company)"
        );
    }

    function _openAttachIssue() internal returns (address ns) {
        vm.prank(CONTROLLER);
        ns = gate.open(T_NUMBER);
        vm.prank(MEIGI);
        IClaimsRegistry(CLAIMS).setSubregistry(uint256(keccak256("t2011001234567")), ns);
        _issue("ap", agent, 0, unicode"AP agent of 株式会社メイギ商事 (fictional demo company)");
        _issue("keiri", accounts, 0, "Accounts department (fictional demo company)");
        _issue(
            "zeirishi", taxAccountant, uint64(block.timestamp + 30 days), "Outside tax accountant (fictional)"
        );
    }

    function _issue(string memory label, address holder, uint64 expiry, string memory description)
        internal
        returns (address)
    {
        CompanyNamespace.Name memory n = _name(label, holder, expiry, description); // reads the claim: before the prank
        vm.prank(CONTROLLER);
        return gate.issue(T_NUMBER, n);
    }

    function _name(string memory label, address holder, uint64 expiry, string memory description)
        internal
        view
        returns (CompanyNamespace.Name memory n)
    {
        n.label = label;
        n.holder = holder;
        n.expiry =
            expiry == 0 ? IEnsV2Registry(CLAIMS).getExpiry(uint256(keccak256("t2011001234567"))) : expiry;
        n.keys = new string[](3);
        n.values = new string[](3);
        n.keys[0] = "description";
        n.values[0] = description;
        n.keys[1] = "agent-status";
        n.values[1] = "online";
        n.keys[2] = "agent-endpoint[web]";
        n.values[2] = "https://meigi.karanbishttt.workers.dev/registry/T2011001234567";
    }

    /// @dev Officers start a recovery rotation, as contracts-review's harness does: an attester added on the fork signs
    ///      over the payee's enrolled officers.
    function _queueRotation(address to) internal {
        PayeeRegistry registry = PayeeRegistry(address(PAYEES));
        uint256 attesterKey = 0xA77E57;
        vm.prank(MEIGI);
        registry.setAttester(vm.addr(attesterKey), true);
        bytes32[] memory ids = registry.officersOf(T_NUMBER);
        uint256 deadline = block.timestamp + 10 minutes;
        bytes32 digest = registry.approvalDigest(
            T_NUMBER, OfficerQuorum.Action.ControllerRotation, bytes32(uint256(uint160(to))), ids, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attesterKey, digest);
        registry.requestControllerRotation(
            T_NUMBER,
            to,
            OfficerQuorum.OfficerApproval({
                officerIds: ids, deadline: deadline, signature: abi.encodePacked(r, s, v)
            })
        );
    }

    struct Text {
        string v;
        address used;
    }

    function _text(string memory name, string memory key) internal view returns (Text memory t) {
        bytes memory out;
        (out, t.used) = UR.resolve(_dns(name), abi.encodeWithSelector(TEXT, vm.ensNamehash(name), key));
        t.v = abi.decode(out, (string));
    }

    function _addr(string memory name) internal view returns (address) {
        (bytes memory out,) = UR.resolve(_dns(name), abi.encodeWithSelector(ADDR, vm.ensNamehash(name)));
        return abi.decode(out, (address));
    }

    /// @dev DNS-encodes a dotted name.
    function _dns(string memory name) internal pure returns (bytes memory out) {
        bytes memory s = bytes(name);
        uint256 start;
        for (uint256 i; i <= s.length; ++i) {
            if (i == s.length || s[i] == ".") {
                bytes memory label = new bytes(i - start);
                for (uint256 j; j < label.length; ++j) {
                    label[j] = s[start + j];
                }
                out = bytes.concat(out, bytes1(uint8(label.length)), label);
                start = i + 1;
            }
        }
        out = bytes.concat(out, hex"00");
    }
}
