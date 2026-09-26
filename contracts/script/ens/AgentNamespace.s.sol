// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {
    AgentConfig,
    AgentNsLib,
    Grant,
    IPermissionedResolver,
    IUserRegistry,
    IVerifiableFactory
} from "./AgentNs.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";

/// @dev The AgentVault's agent slot: the one key allowed to pay registered payees from it (owner-only setter).
interface IAgentVaultAgent {
    function agent() external view returns (address);
    function setAgent(address agent_) external;
}

/// @notice Gives the AP agent its own ENSv2 namespace: `<AGENT_LABEL>.<AGENT_PARENT>.eth` (ap.meigi.eth). The parent
///         is a pure namespace whose subregistry is a UserRegistry. The subname has its own PermissionedResolver
///         that holds the agent's address and ENSIP-26 records. The agent key holds one argument-scoped role:
///         ROLE_SET_TEXT on `agent-status` only. Every other role stays with the deployer.
/// @dev Order (ens.sh): agent-deploy → register (ENS_LABEL=meigi, ENS_SUBREGISTRY) → agent-setup → agent-status.
///      Env: DEPLOYER_PRIVATE_KEY, AGENT_ADDRESS, and the ENS_* factory and implementations from
///      deployments/beta.env. After agent-deploy, also AGENT_SUBREGISTRY and AGENT_RESOLVER. See AgentConfig for
///      the optional names and records, AGENT_STATUS for setStatus(), AGENT_PREVIOUS_ADDRESS to revoke a
///      rotated-out agent key in setup() or rotate(), and AGENT_ENDPOINT for setEndpoint().
contract AgentNamespace is Script {
    /// @notice Deploys the subregistry and the resolver as VerifiableFactory proxies. The resolver's records are
    ///         written by its initializer, which skips permission checks. Skips a proxy whose env var is set.
    function deploy() external {
        uint256 pk = _deployerKey();
        address deployer = vm.addr(pk);
        IVerifiableFactory factory = IVerifiableFactory(_code("ENS_VERIFIABLE_FACTORY"));
        address registryImpl = _code("ENS_USER_REGISTRY_IMPL");
        address resolverImpl = _code("ENS_PERMISSIONED_RESOLVER_IMPL");
        address subregistry = EnsV2Lib.envAddressOrZero("AGENT_SUBREGISTRY");
        address resolver = EnsV2Lib.envAddressOrZero("AGENT_RESOLVER");
        bytes32 seed = keccak256(abi.encode(deployer, block.number, block.timestamp, "meigi-agent-namespace"));
        bytes memory registryInit = abi.encodeCall(IUserRegistry.initialize, (_ownerGrant(deployer)));
        bytes memory resolverInit =
            abi.encodeCall(IPermissionedResolver.initialize, (_ownerGrant(deployer), AgentConfig.records()));

        vm.startBroadcast(pk);
        if (subregistry == address(0)) {
            subregistry =
                factory.deployProxy(registryImpl, uint256(keccak256(abi.encode(seed, 1))), registryInit);
        }
        if (resolver == address(0)) {
            resolver =
                factory.deployProxy(resolverImpl, uint256(keccak256(abi.encode(seed, 2))), resolverInit);
        }
        vm.stopBroadcast();

        require(factory.verifyContract(subregistry) == registryImpl, "subregistry is not a factory proxy");
        require(factory.verifyContract(resolver) == resolverImpl, "resolver is not a factory proxy");
        console.log("AGENT_SUBREGISTRY=%s", subregistry);
        console.log("AGENT_RESOLVER=%s", resolver);
    }

    /// @notice After `<AGENT_PARENT>.eth` is registered with AGENT_SUBREGISTRY: names the subregistry's canonical
    ///         parent, creates the subname and grants the agent its one scoped role. Safe to rerun.
    function setup() external {
        uint256 pk = _deployerKey();
        address deployer = vm.addr(pk);
        EnsV2 memory ens = EnsV2Lib.load();
        IUserRegistry subregistry = IUserRegistry(vm.envAddress("AGENT_SUBREGISTRY"));
        IPermissionedResolver resolver = IPermissionedResolver(vm.envAddress("AGENT_RESOLVER"));
        address agent = vm.envAddress("AGENT_ADDRESS");
        require(
            agent != address(0) && agent != deployer, "AGENT_ADDRESS must be set and differ from the deployer"
        );
        uint64 expiry = _requireParent(ens, subregistry, deployer);
        string memory label = AgentConfig.label();
        address previous = EnsV2Lib.envAddressOrZero("AGENT_PREVIOUS_ADDRESS");
        require(previous != agent, "AGENT_PREVIOUS_ADDRESS is the current agent");

        vm.startBroadcast(pk);
        if (!_parentIsSet(ens, subregistry)) {
            subregistry.setParent(address(ens.ethRegistry), AgentConfig.parent());
        }
        if (subregistry.getOwner(EnsV2Lib.labelId(label)) == address(0)) {
            subregistry.register(
                label, deployer, address(0), address(resolver), AgentNsLib.SUBNAME_ROLES, expiry
            );
        }
        if (!resolver.hasRoles(_statusResource(), AgentNsLib.ROLE_SET_TEXT, agent)) {
            resolver.grantSetterRoles(AgentNsLib.textSetter(AgentNsLib.STATUS_KEY), agent);
        }
        if (previous != address(0) && resolver.roles(_statusResource(), previous) != 0) {
            resolver.revokeRoles(_statusResource(), AgentNsLib.ROLE_SET_TEXT, previous); // a rotated-out agent key
        }
        vm.stopBroadcast();

        require(subregistry.getOwner(EnsV2Lib.labelId(label)) == deployer, "subname owner mismatch");
        require(subregistry.getResolver(label) == address(resolver), "subname resolver mismatch");
        require(
            resolver.roles(_statusResource(), agent) == AgentNsLib.ROLE_SET_TEXT, "agent scope is not exact"
        );
        require(resolver.roles(0, agent) == 0, "the agent must hold no root role");
        console.log("%s is set up; %s may set agent-status only", AgentConfig.name(), agent);
    }

    /// @notice Signed by the deployer: points `agent-endpoint[web]` at AgentConfig.endpoint() (AGENT_ENDPOINT).
    function setEndpoint() external {
        uint256 pk = _deployerKey();
        IPermissionedResolver resolver = _agentResolver();
        string memory endpoint = AgentConfig.endpoint();

        vm.startBroadcast(pk);
        resolver.setText(AgentConfig.dnsName(), "agent-endpoint[web]", endpoint);
        vm.stopBroadcast();
        console.log("%s agent-endpoint[web] = %s", AgentConfig.name(), endpoint);
    }

    /// @notice Signed by the deployer: the standard profile records (name, description, url, avatar) that wallets and
    ///         the ENS app show, next to the ENSIP-26 records they don't.
    function setProfile() external {
        uint256 pk = _deployerKey();
        IPermissionedResolver resolver = _agentResolver();
        (string[4] memory keys, string[4] memory values) = AgentConfig.profile();

        vm.startBroadcast(pk);
        for (uint256 i; i < keys.length; i++) {
            resolver.setText(AgentConfig.dnsName(), keys[i], values[i]);
        }
        vm.stopBroadcast();
        console.log("%s profile: %s | %s", AgentConfig.name(), values[0], values[3]);
    }

    /// @notice Signed by the deployer: gives the namespace root (meigi.eth) its own PermissionedResolver with a profile.
    ///         ap.meigi.eth keeps its own resolver, and the UniversalResolver uses the deepest one, so the agent's name
    ///         resolves exactly as before.
    function setParentProfile() external {
        EnsV2 memory ens = EnsV2Lib.load();
        string memory parent = AgentConfig.parent();
        require(
            ens.ethRegistry.getResolver(parent) == address(0), "the namespace root already has a resolver"
        );
        address deployer = EnsV2Lib.signer("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        bytes memory name = EnsV2Lib.dnsEncode(string.concat(parent, ".eth"));
        (string[4] memory keys, string[4] memory values) = AgentConfig.parentProfile();
        bytes[] memory calls = new bytes[](keys.length);
        for (uint256 i; i < keys.length; i++) {
            calls[i] = abi.encodeCall(IPermissionedResolver.setText, (name, keys[i], values[i]));
        }
        bytes memory init = abi.encodeCall(IPermissionedResolver.initialize, (_ownerGrant(deployer), calls));
        uint256 salt = uint256(keccak256(abi.encode(deployer, parent, "namespace-profile")));
        IVerifiableFactory factory = IVerifiableFactory(_code("ENS_VERIFIABLE_FACTORY"));

        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        address resolver = factory.deployProxy(vm.envAddress("ENS_PERMISSIONED_RESOLVER_IMPL"), salt, init);
        ens.ethRegistry.setResolver(EnsV2Lib.labelId(parent), resolver);
        vm.stopBroadcast();

        require(ens.ethRegistry.getResolver(parent) == resolver, "the namespace root's resolver was not set");
        console.log("%s.eth resolver %s, profile: %s", parent, resolver, values[0]);
    }

    /// @notice Key rotation, part 1, signed by the deployer: grants `agent-status` to the new key (AGENT_ADDRESS) and
    ///         revokes it from the old one (AGENT_PREVIOUS_ADDRESS). The name, its records and the vault's primary name
    ///         stay as they are: the identity survives the key. `rotateVault()` then moves the vault's agent slot.
    function rotate() external {
        IPermissionedResolver resolver = _agentResolver();
        (address agent, address previous) = _rotation();
        require(
            agent != EnsV2Lib.signer("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS"),
            "the agent can't be the deployer"
        );

        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        if (!resolver.hasRoles(_statusResource(), AgentNsLib.ROLE_SET_TEXT, agent)) {
            resolver.grantSetterRoles(AgentNsLib.textSetter(AgentNsLib.STATUS_KEY), agent);
        }
        if (resolver.roles(_statusResource(), previous) != 0) {
            resolver.revokeRoles(_statusResource(), AgentNsLib.ROLE_SET_TEXT, previous);
        }
        vm.stopBroadcast();

        require(
            resolver.roles(_statusResource(), agent) == AgentNsLib.ROLE_SET_TEXT,
            "new key's scope is not exact"
        );
        require(resolver.roles(0, agent) == 0, "the agent must hold no root role");
        require(resolver.roles(_statusResource(), previous) == 0, "the old key still holds agent-status");
        console.log("%s agent-status: granted to %s, revoked from %s", AgentConfig.name(), agent, previous);
    }

    /// @notice Key rotation, part 2, signed by the vault's owner: the AgentVault's agent slot moves to the new key.
    function rotateVault() external {
        (address agent, address previous) = _rotation();
        (address vault,) = AgentConfig.meigi();
        IAgentVaultAgent slot = IAgentVaultAgent(vault);
        address current = slot.agent();
        require(
            current == previous || current == agent, "the vault's agent is neither the old nor the new key"
        );

        EnsV2Lib.startBroadcast("VAULT_OWNER_PRIVATE_KEY", "VAULT_OWNER_ADDRESS");
        if (current != agent) slot.setAgent(agent);
        vm.stopBroadcast();

        require(slot.agent() == agent, "the vault's agent was not updated");
        console.log("AgentVault %s agent = %s", vault, agent);
    }

    /// @notice Signed by the agent key: writes the one record it is allowed to write.
    function setStatus() external {
        uint256 pk = vm.envUint("AGENT_PRIVATE_KEY");
        address agent = vm.addr(pk);
        require(vm.envOr("AGENT_ADDRESS", agent) == agent, "AGENT_ADDRESS does not match AGENT_PRIVATE_KEY");
        IPermissionedResolver resolver = _agentResolver();
        require(
            resolver.hasRoles(_statusResource(), AgentNsLib.ROLE_SET_TEXT, agent), "run agent-setup first"
        );
        string memory status = vm.envOr("AGENT_STATUS", string("online"));

        vm.startBroadcast(pk);
        resolver.setText(AgentConfig.dnsName(), AgentNsLib.STATUS_KEY, status);
        vm.stopBroadcast();
        console.log("%s agent-status = %s (signed by %s)", AgentConfig.name(), status, agent);
    }

    /// @dev `<AGENT_PARENT>.eth` must be the deployer's and delegate to the subregistry. Returns its expiry.
    function _requireParent(EnsV2 memory ens, IUserRegistry subregistry, address deployer)
        private
        view
        returns (uint64)
    {
        string memory parent = AgentConfig.parent();
        uint256 id = EnsV2Lib.labelId(parent);
        require(ens.ethRegistry.getOwner(id) == deployer, "register the parent first (ens.sh register)");
        require(
            ens.ethRegistry.getSubregistry(parent) == address(subregistry),
            "the parent's subregistry is not AGENT_SUBREGISTRY"
        );
        return ens.ethRegistry.getExpiry(id);
    }

    function _parentIsSet(EnsV2 memory ens, IUserRegistry subregistry) private view returns (bool) {
        (address parent, string memory label) = subregistry.getParent();
        return parent == address(ens.ethRegistry)
            && keccak256(bytes(label)) == keccak256(bytes(AgentConfig.parent()));
    }

    /// @dev The new key (AGENT_ADDRESS) and the one it replaces (AGENT_PREVIOUS_ADDRESS).
    function _rotation() private view returns (address agent, address previous) {
        agent = vm.envAddress("AGENT_ADDRESS");
        previous = vm.envAddress("AGENT_PREVIOUS_ADDRESS");
        require(
            agent != address(0) && agent != previous,
            "set AGENT_ADDRESS to the new key, distinct from the old"
        );
    }

    /// @dev AGENT_RESOLVER, checked to be the resolver of the live agent name.
    function _agentResolver() private view returns (IPermissionedResolver resolver) {
        resolver = IPermissionedResolver(vm.envAddress("AGENT_RESOLVER"));
        address subregistry = EnsV2Lib.load().ethRegistry.getSubregistry(AgentConfig.parent());
        require(
            subregistry != address(0)
                && IUserRegistry(subregistry).getResolver(AgentConfig.label()) == address(resolver),
            "AGENT_RESOLVER is not the resolver of the agent's name"
        );
    }

    function _ownerGrant(address owner) private pure returns (Grant[] memory grants) {
        grants = new Grant[](1);
        grants[0] = Grant(owner, AgentNsLib.ALL_ROLES);
    }

    function _deployerKey() private view returns (uint256 pk) {
        pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        require(
            vm.envOr("DEPLOYER_ADDRESS", vm.addr(pk)) == vm.addr(pk),
            "DEPLOYER_ADDRESS does not match the key"
        );
    }

    function _code(string memory envName) private view returns (address a) {
        a = vm.envOr(envName, address(0));
        require(
            a.code.length != 0,
            string.concat(envName, " is unset or has no code (agent commands are Beta-only)")
        );
    }

    function _statusResource() private pure returns (uint256) {
        return AgentNsLib.textResource(AgentNsLib.STATUS_KEY);
    }
}
