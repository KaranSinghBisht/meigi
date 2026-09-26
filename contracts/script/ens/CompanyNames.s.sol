// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Script, console} from "forge-std/Script.sol";
import {CompanyNamespace} from "../../src/ens/CompanyNamespace.sol";
import {IEnsV2Factory, IEnsV2Registry} from "../../src/ens/IEnsV2.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";
import {Ensip25, IAgentIdentityRegistry} from "./Ensip25.sol";

interface IClaimsResolver {
    function registry() external view returns (IPayeeRegistry);
}

interface IClaimsRegistry {
    function setSubregistry(uint256 anyId, address registry) external;
    function getSubregistry(string calldata label) external view returns (address);
    function getResolver(string calldata label) external view returns (address);
}

/// @notice Text-only names a company issues under its payee name, through CompanyNamespace. For the demo company
///         株式会社メイギ商事 (T2011001234567, fictional):
///         - `deploy()`, deployer: deploys the gate, with Meigi's deployer as the brake.
///         - `fund()`, deployer: gas for the company's key (COMPANY_FUND_WEI) and the AP agent's (AGENT_FUND_WEI).
///         - `agentId()`, the company: registers its AP agent in ERC-8004, with `ap.t…` as its ENS service.
///         - `open()`, the company: creates its namespace registry.
///         - `attach()`, deployer: makes it the subregistry of the company's claimed name. `detach()` rolls back.
///         - `issue()`, the company: `ap` (its AP agent; ENSIP-26 records and, with NS_AP_8004_ID, the ENSIP-25 link),
///           `keiri` (経理, accounts) and `zeirishi` (税理士, its outside tax accountant, for 30 days). Skips a live label.
///         - `status()`, the AP agent's key: sets its own agent-status (NS_AP_STATUS, default "online").
///         - `check()`: read-only.
/// @dev Env: deployments/beta.env; COMPANY_NAMESPACE (the gate) after deploy; DEPLOYER_PRIVATE_KEY,
///      COMPANY_PRIVATE_KEY and NS_AP_PRIVATE_KEY, or on a fork the unlocked DEPLOYER_ADDRESS, COMPANY_ADDRESS and
///      NS_AP_ADDRESS; NS_KEIRI_ADDRESS and NS_ZEIRISHI_ADDRESS for issue(); NS_AP_8004_ID once agentId() ran.
contract CompanyNames is Script {
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)
    /// @dev The texts below describe this fictional demo company, so its steps run for it only.
    uint64 private constant T_NUMBER = 2011001234567;
    string private constant CLAIM = "t2011001234567";
    string private constant FIXTURE =
        unicode"株式会社メイギ商事 (T2011001234567), a fictional demo company";
    string private constant REGISTRY_PAGE = "https://meigi.karanbishttt.workers.dev/registry/T2011001234567";

    function deploy() external {
        EnsV2 memory ens = EnsV2Lib.load();
        address deployer = EnsV2Lib.signer("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        IPayeeRegistry registry = IClaimsResolver(vm.envAddress("CLAIMS_RESOLVER")).registry();
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
        address company = _gate().registry().payeeOf(T_NUMBER).controller;
        address agent = vm.envAddress("NS_AP_ADDRESS");
        uint256 companyWei = vm.envOr("COMPANY_FUND_WEI", uint256(0.01 ether));
        uint256 agentWei = vm.envOr("AGENT_FUND_WEI", uint256(0.001 ether));
        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        _send(company, companyWei);
        if (agent.balance < agentWei) _send(agent, agentWei - agent.balance);
        vm.stopBroadcast();
        console.log("company key %s: %s wei; AP agent %s", company, company.balance, agent);
    }

    /// @dev Signed by the company, which owns its agent's ERC-8004 identity. The agent wallet the registry sets by
    ///      default is cleared: an issued name is never payable, and neither is its agent.
    function agentId() external {
        IAgentIdentityRegistry agents = Ensip25.registry();
        EnsV2Lib.startBroadcast("COMPANY_PRIVATE_KEY", "COMPANY_ADDRESS");
        uint256 id = agents.register(registrationUri());
        agents.unsetAgentWallet(id);
        vm.stopBroadcast();
        console.log(
            "registered %s in ERC-8004 %s as agent %s (simulated id)", _full("ap"), address(agents), id
        );
    }

    function open() external {
        CompanyNamespace gate = _gate();
        require(gate.namespaceOf(T_NUMBER) == address(0), "the namespace is already open");
        EnsV2Lib.startBroadcast("COMPANY_PRIVATE_KEY", "COMPANY_ADDRESS");
        address namespace = gate.open(T_NUMBER);
        vm.stopBroadcast();
        console.log("%s namespace %s", CLAIM, namespace);
    }

    function attach() external {
        address namespace = _gate().namespaceOf(T_NUMBER);
        require(namespace != address(0), "open the namespace first");
        _setSubregistry(namespace);
    }

    function detach() external {
        _setSubregistry(address(0));
    }

    function issue() external {
        CompanyNamespace gate = _gate();
        uint64 claimExpiry = IEnsV2Registry(vm.envAddress("CLAIMS_REGISTRY")).getExpiry(_labelId(CLAIM));
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
            (address holder,,,) = gate.nameOf(T_NUMBER, names[i].label);
            if (holder != address(0)) {
                console.log("%s is already live", names[i].label);
                continue;
            }
            address records = gate.issue(T_NUMBER, names[i]);
            console.log("issued %s to %s, records %s", _full(names[i].label), names[i].holder, records);
        }
        vm.stopBroadcast();
    }

    function status() external {
        string memory value = vm.envOr("NS_AP_STATUS", string("online"));
        EnsV2Lib.startBroadcast("NS_AP_PRIVATE_KEY", "NS_AP_ADDRESS");
        _gate().setStatus(T_NUMBER, "ap", value);
        vm.stopBroadcast();
        console.log("%s agent-status = %s (set by its holder)", _full("ap"), value);
    }

    function check() external view {
        EnsV2 memory ens = EnsV2Lib.load();
        CompanyNamespace gate = _gate();
        address namespace = gate.namespaceOf(T_NUMBER);
        bool attached = namespace != address(0)
            && IClaimsRegistry(vm.envAddress("CLAIMS_REGISTRY")).getSubregistry(CLAIM) == namespace;
        console.log("gate %s, namespace %s, attached %s", address(gate), namespace, attached);
        string memory payeeName = string.concat(CLAIM, ".payee.eth");
        require(
            _addr(ens, payeeName) == gate.registry().payoutOf(T_NUMBER),
            "the payee name left the registry payout"
        );
        console.log("%s -> %s (the registry payout, the only name to pay)", payeeName, _addr(ens, payeeName));

        string[] memory labels = gate.labelsOf(T_NUMBER);
        for (uint256 i; i < labels.length; ++i) {
            _checkName(ens, gate, labels[i], attached);
        }
        if (vm.envExists("NS_AP_8004_ID")) _checkAgentLink(ens);
    }

    /// @notice The ERC-8004 registration file, on-chain as a data: URI. Its ENS service is `ap.t…`.
    function registrationUri() public pure returns (string memory) {
        string memory json = string.concat(
            '{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1","name":"',
            unicode"株式会社メイギ商事 AP agent (demo)",
            '","description":"Accounts-payable agent of ',
            FIXTURE,
            ". An identity, not a payee: pay t2011001234567.payee.eth.",
            '","image":"https://meigi.karanbishttt.workers.dev/favicon.svg","services":[{"name":"web","endpoint":"',
            REGISTRY_PAGE,
            '"},{"name":"ENS","endpoint":"ap.t2011001234567.payee.eth","version":"v1"}],"supportedTrust":[]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _checkName(EnsV2 memory ens, CompanyNamespace gate, string memory label, bool attached)
        private
        view
    {
        (address holder, address records,, uint64 expiry) = gate.nameOf(T_NUMBER, label);
        string memory name = _full(label);
        require(_addr(ens, name) == address(0), "an issued name resolves an address");
        string memory description = attached ? _text(ens, name, "description") : "";
        require(
            !attached || gate.answers(T_NUMBER, label) == (bytes(description).length > 0),
            "the name answers differently than the gate says"
        );
        console.log("%s: holder %s, records %s", name, holder, records);
        console.log("  expires %s: %s", expiry, description);
    }

    function _checkAgentLink(EnsV2 memory ens) private view {
        IAgentIdentityRegistry agents = Ensip25.registry();
        uint256 id = vm.envUint("NS_AP_8004_ID");
        require(
            agents.ownerOf(id) == _gate().registry().payeeOf(T_NUMBER).controller,
            "the agent isn't the company's"
        );
        require(
            keccak256(bytes(agents.tokenURI(id))) == keccak256(bytes(registrationUri())),
            "the registration file doesn't name ap"
        );
        string memory key = Ensip25.registrationKey(address(agents), id);
        require(
            keccak256(bytes(_text(ens, _full("ap"), key))) == keccak256("1"), "ap doesn't confirm the agent"
        );
        console.log("ENSIP-25: %s = 1, and ERC-8004 agent %s names it", key, id);
    }

    function _agent(address holder, uint64 expiry) private view returns (CompanyNamespace.Name memory n) {
        bool linked = vm.envExists("NS_AP_8004_ID");
        n.label = "ap";
        n.holder = holder;
        n.expiry = expiry;
        n.keys = new string[](linked ? 5 : 4);
        n.values = new string[](n.keys.length);
        n.keys[0] = "description";
        n.values[0] = string.concat(
            "AP agent of ", FIXTURE, ". An identity, never a payee: pay t2011001234567.payee.eth."
        );
        n.keys[1] = "agent-context";
        n.values[1] = string.concat(
            unicode"# 株式会社メイギ商事 AP agent\n\nDemo fixture: ",
            FIXTURE,
            ". This name identifies the company's accounts-payable agent. Only the company's registered controller in",
            " the Meigi registry could issue it; it answers only while the registry lists the company as active, and",
            " it lasts no longer than the company's own name.\n\nIt is not a payment address and resolves none: payments",
            " to the company go to t2011001234567.payee.eth, whose payout the Meigi registry decides."
        );
        n.keys[2] = "agent-endpoint[web]";
        n.values[2] = REGISTRY_PAGE;
        n.keys[3] = "agent-status";
        n.values[3] = "online";
        if (linked) {
            n.keys[4] = Ensip25.registrationKey(address(Ensip25.registry()), vm.envUint("NS_AP_8004_ID"));
            n.values[4] = "1";
        }
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
    }

    function _setSubregistry(address namespace) private {
        IClaimsRegistry claims = IClaimsRegistry(vm.envAddress("CLAIMS_REGISTRY"));
        address resolver = claims.getResolver(CLAIM);
        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        claims.setSubregistry(_labelId(CLAIM), namespace);
        vm.stopBroadcast();
        require(claims.getSubregistry(CLAIM) == namespace, "subregistry not updated");
        require(claims.getResolver(CLAIM) == resolver, "the claim's resolver changed");
        console.log("%s.payee.eth subregistry = %s", CLAIM, namespace);
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

    function _full(string memory label) private pure returns (string memory) {
        return string.concat(label, ".", CLAIM, ".payee.eth");
    }

    function _labelId(string memory label) private pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }
}
