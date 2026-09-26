// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {
    AgentConfig,
    AgentNsLib,
    IPermissionedResolver,
    IUserRegistry,
    IVerifiableFactory
} from "./AgentNs.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";

interface IPayeeResolverRegistry {
    function registry() external view returns (IPayeeRegistry);
}

/// @notice Read-only proof of the agent namespace. Through the UniversalResolver, ap.meigi.eth resolves to the vault
///         and its records. The agent holds ROLE_SET_TEXT on `agent-status` only: writing that record succeeds,
///         while writing `agent-context`, `agent-endpoint[web]` or `addr` reverts EACUnauthorizedAccountRoles. Both
///         outcomes are simulated from the agent address against live state and then rolled back. payee.eth
///         still resolves from the PayeeRegistry. Nothing is sent.
/// @dev Env: AGENT_SUBREGISTRY, AGENT_RESOLVER, AGENT_ADDRESS, deployments/beta.env; optional EXPECT_STATUS and
///      AGENT_PREVIOUS_ADDRESS (a rotated-out key, which must hold no role any more).
contract CheckAgent is Script {
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)
    bytes4 private constant EAC_UNAUTHORIZED = 0x4b27a133; // EACUnauthorizedAccountRoles(uint256,uint256,address)
    uint64 private constant DEMO_T_NUMBER = 2011001234567;

    function run() external {
        EnsV2 memory ens = EnsV2Lib.load();
        IUserRegistry subregistry = IUserRegistry(vm.envAddress("AGENT_SUBREGISTRY"));
        IPermissionedResolver resolver = IPermissionedResolver(vm.envAddress("AGENT_RESOLVER"));
        address agent = vm.envAddress("AGENT_ADDRESS");
        _checkWiring(ens, subregistry, address(resolver));
        _checkRecords(ens, address(resolver));
        _checkAgentScope(resolver, agent);
        _checkPayeeUnchanged(ens);
    }

    function _checkWiring(EnsV2 memory ens, IUserRegistry subregistry, address resolver) private view {
        string memory parent = AgentConfig.parent();
        string memory label = AgentConfig.label();
        IVerifiableFactory factory = IVerifiableFactory(vm.envAddress("ENS_VERIFIABLE_FACTORY"));
        require(
            ens.ethRegistry.getSubregistry(parent) == address(subregistry),
            "parent does not use the subregistry"
        );
        require(subregistry.getResolver(label) == resolver, "subname does not use AGENT_RESOLVER");
        require(subregistry.getSubregistry(label) == address(0), "subname has an unexpected subregistry");
        (address canonicalParent,) = subregistry.getParent();
        require(
            canonicalParent == address(ens.ethRegistry),
            "subregistry's canonical parent is not the .eth registry"
        );
        require(
            factory.verifyContract(address(subregistry)) == vm.envAddress("ENS_USER_REGISTRY_IMPL"),
            "subregistry is not a VerifiableFactory UserRegistry"
        );
        require(
            factory.verifyContract(resolver) == vm.envAddress("ENS_PERMISSIONED_RESOLVER_IMPL"),
            "resolver is not a VerifiableFactory PermissionedResolver"
        );
        console.log("%s.eth -> subregistry %s", parent, address(subregistry));
        console.log(
            "%s owned by %s, resolver %s",
            AgentConfig.name(),
            subregistry.getOwner(EnsV2Lib.labelId(label)),
            resolver
        );
    }

    function _checkRecords(EnsV2 memory ens, address resolver) private view {
        (address vault, address payees) = AgentConfig.meigi();
        string memory name = AgentConfig.name();
        (bytes memory out, address answeredBy) = ens.universalResolver
            .resolve(AgentConfig.dnsName(), abi.encodeWithSelector(ADDR, vm.ensNamehash(name)));
        require(answeredBy == resolver, "the UniversalResolver used another resolver");
        require(abi.decode(out, (address)) == vault, "addr(60) is not the AgentVault");
        console.log("%s addr(60) = %s (AgentVault)", name, vault);
        _expectText(ens, "agent-context", AgentConfig.context(vault, payees));
        _expectText(ens, "agent-endpoint[web]", AgentConfig.endpoint());
        _expectText(ens, "meigi.vault", vm.toString(vault));
        _expectText(ens, "meigi.registry", vm.toString(payees));
        _expectText(ens, "meigi.payees", "payee.eth");
        string memory status = _text(ens, AgentNsLib.STATUS_KEY);
        require(
            keccak256(bytes(vm.envOr("EXPECT_STATUS", status))) == keccak256(bytes(status)),
            "agent-status differs from EXPECT_STATUS"
        );
        console.log("  agent-status = %s", status);
    }

    /// @dev Positive and negative EAC proofs, simulated from the agent address and rolled back.
    function _checkAgentScope(IPermissionedResolver resolver, address agent) private {
        require(resolver.roles(0, agent) == 0, "the agent holds a root role");
        address previous = EnsV2Lib.envAddressOrZero("AGENT_PREVIOUS_ADDRESS");
        if (previous != address(0)) {
            uint256 status = AgentNsLib.textResource(AgentNsLib.STATUS_KEY);
            require(
                resolver.roles(status, previous) == 0 && resolver.roles(0, previous) == 0,
                "old key still has a role"
            );
            console.log("Rotated-out key %s holds no role", previous);
        }
        require(
            resolver.roles(AgentNsLib.textResource(AgentNsLib.STATUS_KEY), agent) == AgentNsLib.ROLE_SET_TEXT,
            "the agent's agent-status role is missing or not exact (no admin bit allowed)"
        );
        bytes memory name = AgentConfig.dnsName();
        uint256 snapshot = vm.snapshotState();
        vm.prank(agent);
        resolver.setText(name, AgentNsLib.STATUS_KEY, "probe");
        _expectDenied(
            address(resolver),
            agent,
            abi.encodeCall(IPermissionedResolver.setText, (name, "agent-context", "x")),
            AgentNsLib.textResource("agent-context"),
            AgentNsLib.ROLE_SET_TEXT
        );
        _expectDenied(
            address(resolver),
            agent,
            abi.encodeCall(IPermissionedResolver.setText, (name, "agent-endpoint[web]", "x")),
            AgentNsLib.textResource("agent-endpoint[web]"),
            AgentNsLib.ROLE_SET_TEXT
        );
        _expectDenied(
            address(resolver),
            agent,
            abi.encodeCall(IPermissionedResolver.setAddress, (name, 60, abi.encodePacked(agent))),
            AgentNsLib.addressResource(AgentNsLib.COIN_TYPE_ETH),
            AgentNsLib.ROLE_SET_ADDRESS
        );
        vm.revertToState(snapshot);
        console.log(
            "Agent %s: agent-status allowed; agent-context, agent-endpoint[web], addr(60) denied", agent
        );
    }

    function _expectDenied(address target, address agent, bytes memory call, uint256 resource, uint256 role)
        private
    {
        vm.prank(agent);
        (bool ok, bytes memory err) = target.call(call);
        require(!ok, "the agent's write should have reverted");
        require(
            keccak256(err) == keccak256(abi.encodeWithSelector(EAC_UNAUTHORIZED, resource, role, agent)),
            "reverted, but not with EACUnauthorizedAccountRoles for this resource"
        );
    }

    /// @dev payee.eth is untouched: t2011001234567.payee.eth still resolves to the registry's active payout, through
    ///      payee.eth's resolver or, once the company has claimed the name, a claims resolver that forwards to it.
    function _checkPayeeUnchanged(EnsV2 memory ens) private view {
        address payeeResolver = ens.ethRegistry.getResolver("payee");
        IPayeeRegistry registry = IPayeeResolverRegistry(payeeResolver).registry();
        string memory name = "t2011001234567.payee.eth";
        (bytes memory out, address answeredBy) = ens.universalResolver
            .resolve(EnsV2Lib.dnsEncode(name), abi.encodeWithSelector(ADDR, vm.ensNamehash(name)));
        address resolved = abi.decode(out, (address));
        require(
            answeredBy == EnsV2Lib.payeeResolverFor(ens.ethRegistry, "payee", "t2011001234567"),
            "payee.eth answered by another resolver"
        );
        require(
            resolved == registry.payoutOf(DEMO_T_NUMBER) && resolved != address(0),
            "payee.eth resolution changed"
        );
        console.log("%s -> %s (resolver %s, unchanged)", name, resolved, answeredBy);
    }

    function _expectText(EnsV2 memory ens, string memory key, string memory expected) private view {
        string memory value = _text(ens, key);
        require(
            keccak256(bytes(value)) == keccak256(bytes(expected)), string.concat("text(", key, ") mismatch")
        );
        console.log("  %s = %s", key, value);
    }

    function _text(EnsV2 memory ens, string memory key) private view returns (string memory) {
        bytes memory call = abi.encodeWithSelector(TEXT, vm.ensNamehash(AgentConfig.name()), key);
        (bytes memory out,) = ens.universalResolver.resolve(AgentConfig.dnsName(), call);
        return abi.decode(out, (string));
    }
}
