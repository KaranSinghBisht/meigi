// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Script, console} from "forge-std/Script.sol";
import {CompanyNamespace} from "../../src/ens/CompanyNamespace.sol";
import {IEnsV2Factory, IEnsV2Registry} from "../../src/ens/IEnsV2.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";
import {
    IDefaultReverseRegistrarAdapter,
    INameSetter,
    IReverseRegistrarAdapter,
    IReverseUniversalResolver
} from "./Reverse.sol";

interface IClaimsResolver {
    function registry() external view returns (IPayeeRegistry);
}

interface IClaimsRegistry {
    function setSubregistry(uint256 anyId, address registry) external;
    function getSubregistry(string calldata label) external view returns (address);
    function getResolver(string calldata label) external view returns (address);
}

/// @notice A company's own names under its payee name, issued through CompanyNamespace. For the demo company
///         株式会社メイギ商事 (T2011001234567, fictional):
///         - `deploy()`, deployer: deploys the gate, with Meigi's deployer as the brake.
///         - `fund()`, deployer: gas for the company's key (COMPANY_FUND_WEI) and the AP agent's (AGENT_FUND_WEI).
///         - `open()`, the company: creates its namespace registry.
///         - `attach()`, deployer: makes it the subregistry of the company's claimed name. `detach()` rolls back.
///         - `issue()`, the company: `ap` (its AP agent), `keiri` (経理, accounts) and `zeirishi` (税理士, its outside
///           tax accountant, for 30 days). Skips a label that is already live.
///         - `primary()`, the AP agent's key: `ap.t…` becomes its primary name (ENSIP-19).
///         - `check()`: read-only.
/// @dev Env: deployments/beta.env; COMPANY_NAMESPACE (the gate) after deploy; DEPLOYER_PRIVATE_KEY,
///      COMPANY_PRIVATE_KEY and NS_AP_PRIVATE_KEY, or on a fork the unlocked DEPLOYER_ADDRESS, COMPANY_ADDRESS and
///      NS_AP_ADDRESS; NS_KEIRI_ADDRESS and NS_ZEIRISHI_ADDRESS for issue(); optional T_NUMBER (2011001234567).
contract CompanyNames is Script {
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)
    uint256 private constant COIN_TYPE_ETH = 60;
    /// @dev The texts below describe this fictional demo company, so issue() runs for it only.
    uint64 private constant DEMO_T_NUMBER = 2011001234567;
    /// @dev Honest fixture labelling, in every text.
    string private constant FIXTURE =
        unicode"株式会社メイギ商事 (T2011001234567), a fictional demo company";

    function deploy() external {
        EnsV2 memory ens = EnsV2Lib.load();
        address deployer = EnsV2Lib.signer("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        address claimsResolver = vm.envAddress("CLAIMS_RESOLVER");
        IPayeeRegistry registry = IClaimsResolver(claimsResolver).registry();
        require(
            ens.ethRegistry.getSubregistry("payee") == vm.envAddress("CLAIMS_REGISTRY"),
            "CLAIMS_REGISTRY is not payee.eth's subregistry"
        );

        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        CompanyNamespace gate = new CompanyNamespace(
            registry,
            IEnsV2Factory(vm.envAddress("ENS_VERIFIABLE_FACTORY")),
            vm.envAddress("ENS_USER_REGISTRY_IMPL"),
            vm.envAddress("ENS_PERMISSIONED_RESOLVER_IMPL"),
            IEnsV2Registry(vm.envAddress("CLAIMS_REGISTRY")),
            deployer,
            EnsV2Lib.dnsEncode("payee.eth")
        );
        vm.stopBroadcast();
        console.log("COMPANY_NAMESPACE=%s", address(gate));
    }

    function fund() external {
        address company = _gate().registry().payeeOf(_tNumber()).controller;
        address agent = vm.envAddress("NS_AP_ADDRESS");
        uint256 companyWei = vm.envOr("COMPANY_FUND_WEI", uint256(0.01 ether));
        uint256 agentWei = vm.envOr("AGENT_FUND_WEI", uint256(0.002 ether));
        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        _send(company, companyWei);
        if (agent.balance < agentWei) _send(agent, agentWei - agent.balance);
        vm.stopBroadcast();
        console.log("company key %s: %s wei; AP agent %s", company, company.balance, agent);
    }

    function open() external {
        CompanyNamespace gate = _gate();
        uint64 tNumber = _tNumber();
        require(gate.namespaceOf(tNumber) == address(0), "the namespace is already open");
        EnsV2Lib.startBroadcast("COMPANY_PRIVATE_KEY", "COMPANY_ADDRESS");
        address namespace = gate.open(tNumber);
        vm.stopBroadcast();
        console.log("t%s namespace %s", uint256(tNumber), namespace);
    }

    function attach() external {
        address namespace = _gate().namespaceOf(_tNumber());
        require(namespace != address(0), "open the namespace first");
        _setSubregistry(namespace);
    }

    function detach() external {
        _setSubregistry(address(0));
    }

    function issue() external {
        CompanyNamespace gate = _gate();
        uint64 tNumber = _tNumber();
        require(
            tNumber == DEMO_T_NUMBER,
            unicode"the demo names describe 株式会社メイギ商事 (T2011001234567)"
        );
        uint64 claimExpiry =
            IEnsV2Registry(vm.envAddress("CLAIMS_REGISTRY")).getExpiry(_labelId(_claimLabel()));
        CompanyNamespace.Name[3] memory names = [
            _agent(vm.envAddress("NS_AP_ADDRESS"), claimExpiry),
            _department(
                "keiri",
                vm.envAddress("NS_KEIRI_ADDRESS"),
                claimExpiry,
                string.concat(unicode"Accounts department (経理部) of ", FIXTURE, ". Not a payee.")
            ),
            _department(
                "zeirishi",
                vm.envAddress("NS_ZEIRISHI_ADDRESS"),
                uint64(block.timestamp + 30 days),
                string.concat(
                    unicode"Outside tax accountant (税理士) engaged for 30 days by ",
                    FIXTURE,
                    ". Not a payee."
                )
            )
        ];
        EnsV2Lib.startBroadcast("COMPANY_PRIVATE_KEY", "COMPANY_ADDRESS");
        for (uint256 i; i < names.length; ++i) {
            (address holder,,) = gate.nameOf(tNumber, names[i].label);
            if (holder != address(0)) {
                console.log("%s is already live", names[i].label);
                continue;
            }
            address resolver = gate.issue(tNumber, names[i]);
            console.log("issued %s to %s, resolver %s", _full(names[i].label), names[i].holder, resolver);
        }
        vm.stopBroadcast();
    }

    /// @dev Signed by the AP agent's key: claims its reverse node, sets the name there and as the ENSIP-19 default.
    function primary() external {
        EnsV2 memory ens = EnsV2Lib.load();
        address agent = EnsV2Lib.signer("NS_AP_PRIVATE_KEY", "NS_AP_ADDRESS");
        string memory name = _full("ap");
        require(_addr(ens, name) == agent, "ap does not resolve to this key");
        IReverseRegistrarAdapter adapter = IReverseRegistrarAdapter(vm.envAddress("ENS_REVERSE_ADAPTER"));
        address resolver = adapter.REVERSE_REGISTRAR().defaultResolver();

        EnsV2Lib.startBroadcast("NS_AP_PRIVATE_KEY", "NS_AP_ADDRESS");
        bytes32 node = adapter.claim(agent, resolver);
        INameSetter(resolver).setName(node, name);
        IDefaultReverseRegistrarAdapter(vm.envAddress("ENS_DEFAULT_REVERSE_ADAPTER")).setName(agent, name);
        vm.stopBroadcast();

        (string memory reverse,,) = IReverseUniversalResolver(address(ens.universalResolver))
            .reverse(abi.encodePacked(agent), COIN_TYPE_ETH);
        require(
            keccak256(bytes(reverse)) == keccak256(bytes(name)), "reverse resolution does not return the name"
        );
        console.log("%s is now the primary name of %s", name, agent);
    }

    function check() external view {
        EnsV2 memory ens = EnsV2Lib.load();
        CompanyNamespace gate = _gate();
        uint64 tNumber = _tNumber();
        address namespace = gate.namespaceOf(tNumber);
        bool attached = namespace != address(0)
            && IClaimsRegistry(vm.envAddress("CLAIMS_REGISTRY")).getSubregistry(_claimLabel()) == namespace;
        console.log("gate %s, namespace %s, attached %s", address(gate), namespace, attached);
        string memory payeeName = string.concat(_claimLabel(), ".payee.eth");
        require(
            _addr(ens, payeeName) == gate.registry().payoutOf(tNumber),
            "the payee name left the registry payout"
        );
        console.log("%s -> %s (the registry payout)", payeeName, _addr(ens, payeeName));

        string[] memory labels = gate.labelsOf(tNumber);
        for (uint256 i; i < labels.length; ++i) {
            _checkName(ens, gate, labels[i], attached);
        }
    }

    function _checkName(EnsV2 memory ens, CompanyNamespace gate, string memory label, bool attached)
        private
        view
    {
        (address holder, address resolver, uint64 expiry) = gate.nameOf(_tNumber(), label);
        string memory name = _full(label);
        address resolved = attached ? _addr(ens, name) : address(0);
        require(resolved == holder, "a name resolves to someone other than its holder");
        console.log("%s -> %s, resolver %s", name, resolved, resolver);
        console.log("  expires %s: %s", expiry, _text(ens, name, "description"));
    }

    function _agent(address holder, uint64 expiry) private pure returns (CompanyNamespace.Name memory n) {
        n.label = "ap";
        n.holder = holder;
        n.expiry = expiry;
        n.keys = new string[](3);
        n.values = new string[](3);
        n.keys[0] = "description";
        n.values[0] = string.concat(
            "AP agent of ", FIXTURE, ". An identity, never a payee: pay t2011001234567.payee.eth."
        );
        n.keys[1] = "agent-context";
        n.values[1] = string.concat(
            unicode"# 株式会社メイギ商事 AP agent\n\nDemo fixture: ",
            FIXTURE,
            ". This name identifies the company's accounts-payable agent key. Only the company's registered",
            " controller in the Meigi registry could issue it, and it lasts no longer than the company's name.\n\n",
            "It is not a payment address: payments to the company go to t2011001234567.payee.eth, whose payout",
            " the Meigi registry decides."
        );
        n.keys[2] = "agent-status";
        n.values[2] = "online";
        n.holderKeys = new string[](1);
        n.holderKeys[0] = "agent-status";
    }

    function _department(string memory label, address holder, uint64 expiry, string memory description)
        private
        pure
        returns (CompanyNamespace.Name memory n)
    {
        n.label = label;
        n.holder = holder;
        n.expiry = expiry;
        n.keys = new string[](1);
        n.values = new string[](1);
        n.keys[0] = "description";
        n.values[0] = description;
        n.holderKeys = new string[](0);
    }

    function _setSubregistry(address namespace) private {
        IClaimsRegistry claims = IClaimsRegistry(vm.envAddress("CLAIMS_REGISTRY"));
        string memory label = _claimLabel();
        address resolver = claims.getResolver(label);
        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        claims.setSubregistry(_labelId(label), namespace);
        vm.stopBroadcast();
        require(claims.getSubregistry(label) == namespace, "subregistry not updated");
        require(claims.getResolver(label) == resolver, "the claim's resolver changed");
        console.log("%s.payee.eth subregistry = %s", label, namespace);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "funding failed");
    }

    function _addr(EnsV2 memory ens, string memory name) private view returns (address) {
        (bytes memory out,) = ens.universalResolver
            .resolve(EnsV2Lib.dnsEncode(name), abi.encodeWithSelector(ADDR, vm.ensNamehash(name)));
        return abi.decode(out, (address));
    }

    function _text(EnsV2 memory ens, string memory name, string memory key)
        private
        view
        returns (string memory)
    {
        (bytes memory out,) = ens.universalResolver
            .resolve(EnsV2Lib.dnsEncode(name), abi.encodeWithSelector(TEXT, vm.ensNamehash(name), key));
        return abi.decode(out, (string));
    }

    function _gate() private view returns (CompanyNamespace) {
        return CompanyNamespace(vm.envAddress("COMPANY_NAMESPACE"));
    }

    function _tNumber() private view returns (uint64) {
        return SafeCast.toUint64(vm.envOr("T_NUMBER", uint256(2011001234567)));
    }

    function _claimLabel() private view returns (string memory) {
        return string.concat("t", vm.toString(uint256(_tNumber())));
    }

    function _full(string memory label) private view returns (string memory) {
        return string.concat(label, ".", _claimLabel(), ".payee.eth");
    }

    function _labelId(string memory label) private pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }
}
