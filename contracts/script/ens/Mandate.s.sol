// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CompanyNamespace} from "../../src/ens/CompanyNamespace.sol";
import {AgentVault} from "../../src/payments/AgentVault.sol";
import {IAgentVault, ICompanyNames, MandateGate} from "../../src/payments/MandateGate.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";
import {EnsV2Lib} from "./EnsV2.sol";

interface IMandateClaims {
    function setSubregistry(uint256 anyId, address registry) external;
    function getSubregistry(string calldata label) external view returns (address);
}

/// @notice The AP agent's mandate: the buyer company 株式会社ハルカ製作所 (T4999900000005, a fictional fixture) issues
///         `ap.t4999900000005.payee.eth` to the agent's key, and the AgentVault's agent becomes a MandateGate that pays
///         only while that name answers.
///         - `register()`, attester: records the fixture (office 9999; its evidence says it isn't an NTA company).
///           Then `ens.sh claim` with T_NUMBER=4999900000005 claims its name.
///         - `open()`, the company: creates its namespace; `attach()`, deployer: attaches it to the claimed name.
///         - `issue()`, the company: issues (or re-issues) `ap` to MANDATE_HOLDER (default AGENT_ADDRESS) until
///           MANDATE_EXPIRY (default 2026-12-31T23:59:59Z). `revoke()`, the company: revokes it.
///         - `deploy()`, deployer: the gate. `wire()` / `unwire()`, the vault's owner: makes the gate, or the agent key
///           again, the vault's agent.
///         - `check()`: read-only.
/// @dev Env: deployments/beta.env; COMPANY_NAMESPACE; MANDATE_GATE after deploy(); ATTESTER_PRIVATE_KEY,
///      NS_HARUKA_PRIVATE_KEY, DEPLOYER_PRIVATE_KEY and VAULT_OWNER_PRIVATE_KEY, or on a fork the unlocked *_ADDRESS;
///      NS_HARUKA_PAYOUT_ADDRESS for register(); AGENT_ADDRESS; AGENT_VAULT (default deployments/11155111.json).
contract Mandate is Script {
    uint64 private constant HARUKA = 4999900000005;
    string private constant CLAIM = "t4999900000005";
    string private constant LABEL = "ap";
    string private constant FIXTURE =
        unicode"株式会社ハルカ製作所 (T4999900000005), a fictional demo company";
    uint64 private constant DEFAULT_EXPIRY = 1798761599; // 2026-12-31T23:59:59Z

    function register() external {
        PayeeRegistry registry = PayeeRegistry(address(_names().registry()));
        require(registry.payeeOf(HARUKA).status == IPayeeRegistry.Status.None, "already registered");
        bytes32[] memory officers = new bytes32[](1);
        officers[0] = keccak256("meigi-demo-fixture-officer"); // no one can prove this session: the fixture can't move
        PayeeRegistry.Registration memory r;
        r.tNumber = HARUKA;
        r.legalName = unicode"株式会社ハルカ製作所";
        r.controller = vm.envAddress("NS_HARUKA_ADDRESS");
        r.payout = vm.envAddress("NS_HARUKA_PAYOUT_ADDRESS");
        r.officers = officers;
        r.threshold = 1;
        r.evidence = keccak256("demo-fixture:fictional-vendor:not-an-NTA-company");
        EnsV2Lib.startBroadcast("ATTESTER_PRIVATE_KEY", "ATTESTER_ADDRESS");
        registry.register(r);
        vm.stopBroadcast();
        console.log("registered %s: controller %s", FIXTURE, r.controller);
    }

    function open() external {
        CompanyNamespace names = _names();
        require(names.namespaceOf(HARUKA) == address(0), "the namespace is already open");
        EnsV2Lib.startBroadcast("NS_HARUKA_PRIVATE_KEY", "NS_HARUKA_ADDRESS");
        address namespace = names.open(HARUKA);
        vm.stopBroadcast();
        console.log("%s namespace %s", CLAIM, namespace);
    }

    function attach() external {
        address namespace = _names().namespaceOf(HARUKA);
        require(namespace != address(0), "open the namespace first");
        IMandateClaims claims = IMandateClaims(vm.envAddress("CLAIMS_REGISTRY"));
        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        claims.setSubregistry(uint256(keccak256(bytes(CLAIM))), namespace);
        vm.stopBroadcast();
        require(claims.getSubregistry(CLAIM) == namespace, "subregistry not updated");
        console.log("%s.payee.eth subregistry = %s", CLAIM, namespace);
    }

    function issue() external {
        CompanyNamespace names = _names();
        address holder = vm.envOr("MANDATE_HOLDER", vm.envAddress("AGENT_ADDRESS"));
        uint64 expiry = uint64(vm.envOr("MANDATE_EXPIRY", uint256(DEFAULT_EXPIRY)));
        EnsV2Lib.startBroadcast("NS_HARUKA_PRIVATE_KEY", "NS_HARUKA_ADDRESS");
        names.issue(HARUKA, _mandate(holder, expiry));
        vm.stopBroadcast();
        console.log("issued %s to %s, until %s", _full(), holder, expiry);
    }

    function revoke() external {
        EnsV2Lib.startBroadcast("NS_HARUKA_PRIVATE_KEY", "NS_HARUKA_ADDRESS");
        _names().revoke(HARUKA, LABEL);
        vm.stopBroadcast();
        console.log("revoked %s", _full());
    }

    function deploy() external {
        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        MandateGate gate =
            new MandateGate(IAgentVault(address(_vault())), ICompanyNames(address(_names())), HARUKA, LABEL);
        vm.stopBroadcast();
        console.log("MANDATE_GATE=%s", address(gate));
    }

    function wire() external {
        MandateGate gate = MandateGate(vm.envAddress("MANDATE_GATE"));
        require(address(gate.vault()) == address(_vault()), "MANDATE_GATE serves another vault");
        require(
            gate.holder() == vm.envAddress("AGENT_ADDRESS"), "the mandate doesn't authorise the agent key"
        );
        _setAgent(address(gate));
    }

    function unwire() external {
        _setAgent(vm.envAddress("AGENT_ADDRESS"));
    }

    function check() external view {
        CompanyNamespace names = _names();
        AgentVault vault = _vault();
        (address holder,, address issuer, uint64 expiry) = names.nameOf(HARUKA, LABEL);
        console.log("vault %s agent %s", address(vault), vault.agent());
        console.log("%s: answers %s, holder %s", _full(), names.answers(HARUKA, LABEL), holder);
        console.log("  issued by %s, expires %s", issuer, expiry);
        if (vm.envExists("MANDATE_GATE")) {
            console.log(
                "gate %s authorises %s",
                vm.envAddress("MANDATE_GATE"),
                MandateGate(vm.envAddress("MANDATE_GATE")).holder()
            );
        }
    }

    function _mandate(address holder, uint64 expiry) private pure returns (CompanyNamespace.Name memory n) {
        n.label = LABEL;
        n.holder = holder;
        n.expiry = expiry;
        n.keys = new string[](3);
        n.values = new string[](3);
        n.keys[0] = "description";
        n.values[0] = string.concat(
            "Mandate: the AP agent of ",
            FIXTURE,
            ". While this name answers, its holder may pay the company's approved",
            " suppliers from its AgentVault; revoked or expired, the vault refuses. An identity, never a payee."
        );
        n.keys[1] = "agent-context";
        n.values[1] = string.concat(
            unicode"# 株式会社ハルカ製作所 AP agent (委任状)\n\nDemo fixture: ",
            FIXTURE,
            ". The company's AgentVault pays only through a gate that checks this name on every payment: it must",
            " answer (issued by the company's current registered controller, not revoked, expired or disputed) and",
            " the caller must be its holder."
        );
        n.keys[2] = "class"; // ENSIP-27
        n.values[2] = "Agent";
    }

    function _setAgent(address agent) private {
        AgentVault vault = _vault();
        EnsV2Lib.startBroadcast("VAULT_OWNER_PRIVATE_KEY", "VAULT_OWNER_ADDRESS");
        vault.setAgent(agent);
        vm.stopBroadcast();
        require(vault.agent() == agent, "agent not updated");
        console.log("vault %s agent = %s", address(vault), agent);
    }

    function _names() private view returns (CompanyNamespace) {
        return CompanyNamespace(vm.envAddress("COMPANY_NAMESPACE"));
    }

    function _vault() private view returns (AgentVault) {
        if (vm.envExists("AGENT_VAULT")) return AgentVault(vm.envAddress("AGENT_VAULT"));
        return AgentVault(vm.parseJsonAddress(vm.readFile("deployments/11155111.json"), ".vault"));
    }

    function _full() private pure returns (string memory) {
        return string.concat(LABEL, ".", CLAIM, ".payee.eth");
    }
}
