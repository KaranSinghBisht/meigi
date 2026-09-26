// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {EnsV2Lib} from "./EnsV2.sol";

// The ENSv2 contracts behind Meigi's namespaces (ap.meigi.eth, and claimed names under payee.eth). Signatures
// match the source verified on Sepolia Blockscout for the Beta (contracts-v2 deployments/sepolia at
// 71a3b733): lib/verifiable-factory VerifiableFactory.sol, src/registry/UserRegistry.sol and
// src/resolver/PermissionedResolver.sol.

/// @dev EAC grant used by both initializers: roles on the root resource for `account`.
struct Grant {
    address account;
    uint256 roleBitmap;
}

interface IVerifiableFactory {
    /// @dev CREATE2 salt is keccak256(abi.encode(msg.sender, salt)); then calls proxy.initialize(impl, data).
    function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address);
    function verifyContract(address proxy) external view returns (address implementation);
    function proxyLogic() external view returns (address);
}

/// @dev A PermissionedRegistry proxy (UserRegistry) used as a subregistry.
interface IUserRegistry {
    function initialize(Grant[] calldata grants) external;
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);
    function setParent(address parent, string calldata label) external;
    function getParent() external view returns (address parent, string memory label);
    function getResolver(string calldata label) external view returns (address);
    function getSubregistry(string calldata label) external view returns (address);
    function getOwner(uint256 anyId) external view returns (address);
    function getExpiry(uint256 anyId) external view returns (uint64);
    function hasRoles(uint256 anyId, uint256 roleBitmap, address account) external view returns (bool);
    function setResolver(uint256 anyId, address resolver) external;
    /// @dev Burns the token (needs ROLE_UNREGISTER): the label is free again and resolves through the parent.
    function unregister(uint256 anyId) external;
    function getTokenId(uint256 anyId) external view returns (uint256);
    /// @dev Reverts TransferDisallowed unless the owner holds ROLE_CAN_TRANSFER_ADMIN on the token.
    function unsafeTransfer(address to, uint256 tokenId, bytes calldata data) external;
}

/// @dev Setters take the DNS-encoded name; records are keyed by its namehash. A setter with an argument
///      (text key, coin type) checks its role on ROOT_RESOURCE or on the argument's resource.
interface IPermissionedResolver {
    function initialize(Grant[] calldata grants, bytes[] calldata calls) external;
    function setText(bytes calldata name, string calldata key, string calldata value) external;
    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external;
    function grantSetterRoles(bytes calldata setter, address account) external returns (bool);
    function revokeRoles(uint256 resource, uint256 roleBitmap, address account) external returns (bool);
    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool);
    function hasAssignees(uint256 resource, uint256 roleBitmap) external view returns (bool);
    function roles(uint256 resource, address account) external view returns (uint256);
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

library AgentNsLib {
    /// @dev EACBaseRolesLib.ALL_ROLES: every regular and admin role, as ensjs grants a proxy's owner.
    uint256 internal constant ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111;

    /// @dev PermissionedResolverLib roles.
    uint256 internal constant ROLE_SET_ADDRESS = 1 << 0;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    uint256 internal constant ROLE_SET_ADDRESS_ADMIN = ROLE_SET_ADDRESS << 128;
    /// @dev RegistryRolesLib.ROLE_SET_RESOLVER on a registry token.
    uint256 internal constant REGISTRY_ROLE_SET_RESOLVER = 1 << 24;

    /// @dev RegistryRolesLib token roles the subname owner receives, as the ETHRegistrar grants a .eth owner:
    ///      set subregistry and set resolver (each with its admin role) and can-transfer admin.
    uint256 internal constant SUBNAME_ROLES =
        (1 << 20) | ((1 << 20) << 128) | (1 << 24) | ((1 << 24) << 128) | ((1 << 28) << 128);

    uint256 internal constant COIN_TYPE_ETH = 60;
    string internal constant STATUS_KEY = "agent-status";

    /// @dev PermissionedResolverLib.resource(string): the EAC resource a text key's role is scoped to.
    function textResource(string memory key) internal pure returns (uint256) {
        return uint256(keccak256(bytes(key)));
    }

    /// @dev PermissionedResolverLib.resource(uint256): the resource for one coin type's address record.
    function addressResource(uint256 coinType) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(coinType)));
    }

    /// @dev The setter calldata grantSetterRoles decodes to (ROLE_SET_TEXT, textResource(key)). The name is
    ///      ignored, so ensjs passes the root name 0x00.
    function textSetter(string memory key) internal pure returns (bytes memory) {
        return abi.encodeCall(IPermissionedResolver.setText, (hex"00", key, ""));
    }
}

/// @notice The agent namespace's names and records, read from the environment and the live Meigi deployment.
/// @dev Env (all optional): AGENT_PARENT (meigi), AGENT_LABEL (ap), AGENT_ENDPOINT, AGENT_AVATAR, and AGENT_VAULT /
///      AGENT_PAYEE_REGISTRY (default: deployments/11155111.json, written by script/Deploy.s.sol).
library AgentConfig {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    string internal constant DEFAULT_ENDPOINT = "https://meigi.karanbishttt.workers.dev/agent";
    /// @dev Meigi's 名義 seal, served by the app.
    string internal constant DEFAULT_AVATAR = "https://meigi.karanbishttt.workers.dev/favicon.svg";
    string internal constant DISPLAY_NAME = "Meigi AP agent";
    string internal constant DESCRIPTION =
        "Accounts-payable agent for Meigi. It pays a supplier only to the payout registered for its T-number, within caps its owner sets.";

    function parent() internal view returns (string memory) {
        return VM.envOr("AGENT_PARENT", string("meigi"));
    }

    function label() internal view returns (string memory) {
        return VM.envOr("AGENT_LABEL", string("ap"));
    }

    function name() internal view returns (string memory) {
        return string.concat(label(), ".", parent(), ".eth");
    }

    function dnsName() internal view returns (bytes memory) {
        return EnsV2Lib.dnsEncode(name());
    }

    function endpoint() internal view returns (string memory) {
        return VM.envOr("AGENT_ENDPOINT", string(DEFAULT_ENDPOINT));
    }

    /// @dev The AgentVault the agent spends from and the PayeeRegistry it may pay into.
    function meigi() internal view returns (address vault, address payees) {
        string memory json = VM.readFile("deployments/11155111.json");
        vault = VM.envOr("AGENT_VAULT", VM.parseJsonAddress(json, ".vault"));
        payees = VM.envOr("AGENT_PAYEE_REGISTRY", VM.parseJsonAddress(json, ".registry"));
    }

    /// @dev ENSIP-26 agent-context: a short Markdown description of the agent and how far it can reach.
    function context(address vault, address payees) internal pure returns (string memory) {
        return string.concat(
            "# Meigi AP agent\n\nPays Japanese suppliers in JPYC from AgentVault ",
            VM.toString(vault),
            ". It can only pay payees registered in PayeeRegistry ",
            VM.toString(payees),
            " (`t<T-number>.payee.eth`), within caps; held payments need a World ID-verified human.\n\n",
            "Endpoint: `agent-endpoint[web]`. Liveness: `agent-status`, written by the agent's own key."
        );
    }

    /// @notice The standard profile records wallets and the ENS app show: name, description, url and avatar.
    function profile() internal view returns (string[4] memory keys, string[4] memory values) {
        keys = ["name", "description", "url", "avatar"];
        values = [DISPLAY_NAME, DESCRIPTION, endpoint(), VM.envOr("AGENT_AVATAR", string(DEFAULT_AVATAR))];
    }

    /// @notice The owner-set records, as setter calldata for the resolver's initializer.
    function records() internal view returns (bytes[] memory calls) {
        (address vault, address payees) = meigi();
        bytes memory n = dnsName();
        (string[4] memory keys, string[4] memory values) = profile();
        calls = new bytes[](10);
        for (uint256 i; i < 4; i++) {
            calls[6 + i] = abi.encodeCall(IPermissionedResolver.setText, (n, keys[i], values[i]));
        }
        calls[0] = abi.encodeCall(
            IPermissionedResolver.setAddress, (n, AgentNsLib.COIN_TYPE_ETH, abi.encodePacked(vault))
        );
        calls[1] = abi.encodeCall(IPermissionedResolver.setText, (n, "agent-context", context(vault, payees)));
        calls[2] = abi.encodeCall(IPermissionedResolver.setText, (n, "agent-endpoint[web]", endpoint()));
        calls[3] = abi.encodeCall(IPermissionedResolver.setText, (n, "meigi.vault", VM.toString(vault)));
        calls[4] = abi.encodeCall(IPermissionedResolver.setText, (n, "meigi.registry", VM.toString(payees)));
        calls[5] = abi.encodeCall(IPermissionedResolver.setText, (n, "meigi.payees", "payee.eth"));
    }
}
