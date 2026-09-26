// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// The ENSv2 contracts CompanyNamespace drives. Signatures match the source verified on Sepolia Blockscout for the
// ENSv2 Beta (contracts-v2 deployments/sepolia at 71a3b733): lib/verifiable-factory VerifiableFactory.sol,
// src/registry/UserRegistry.sol (a PermissionedRegistry) and src/resolver/PermissionedResolver.sol.

/// @dev An EAC grant, as both initializers take it: `roleBitmap` on the root resource for `account`.
struct EnsV2Grant {
    address account;
    uint256 roleBitmap;
}

/// @dev Deploys a proxy at CREATE2 salt keccak256(abi.encode(msg.sender, salt)), then initializes it with `data`.
interface IEnsV2Factory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address);
}

/// @dev A UserRegistry proxy: a PermissionedRegistry whose names expire and whose roles are EAC roles.
interface IEnsV2Registry {
    function initialize(EnsV2Grant[] calldata grants) external;
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);
    function unregister(uint256 anyId) external;
    function renew(uint256 anyId, uint64 newExpiry) external;
    function setParent(address parent, string calldata label) external;
    /// @dev Zero once the name has expired or was unregistered.
    function getResolver(string calldata label) external view returns (address);
    /// @dev Zero once the name has expired or was unregistered.
    function getOwner(uint256 anyId) external view returns (address);
    function getExpiry(uint256 anyId) external view returns (uint64);
    /// @dev Zero once the name has expired or was unregistered.
    function getSubregistry(string calldata label) external view returns (address);
}

/// @dev A PermissionedResolver proxy. Setters take the DNS-encoded name. A setter role is scoped by its argument
///      (e.g. one text key), never by name, and a record written under the root node answers every name that has no
///      record of its own; so one instance per name, written only for that exact name, is what keeps names apart.
interface IEnsV2Resolver {
    /// @dev Grants root roles, then runs `calls` on itself without permission checks.
    function initialize(EnsV2Grant[] calldata grants, bytes[] calldata calls) external;
    function setText(bytes calldata name, string calldata key, string calldata value) external;
    /// @dev ENSIP-10: answers `data` (e.g. text(node, key)) for the DNS-encoded `name`.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}
