// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ENSv2 Beta reverse-name contracts (ENSIP-19), as used by VaultName.s.sol and PayoutName.s.sol. Source verified on
// Blockscout for the Beta. On the Beta, `addr.reverse` still lives on v1, and ENSV1Resolver mirrors it into v2.

/// @dev v2 adapters that let an account name itself, or let a contract's Ownable owner (or its IContractNamer) name
///      the contract. See the reverse-resolution docs, "Contract Account Adapters".
interface IReverseRegistrarAdapter {
    function REVERSE_REGISTRAR() external view returns (IReverseRegistrar);
    function claim(address account, address resolver) external returns (bytes32 node);
}

interface IDefaultReverseRegistrarAdapter {
    function setName(address account, string calldata name) external;
}

interface IReverseRegistrar {
    function defaultResolver() external view returns (address);
}

interface INameSetter {
    function setName(bytes32 node, string calldata name) external;
}

interface IReverseUniversalResolver {
    function reverse(bytes calldata lookupAddress, uint256 coinType)
        external
        view
        returns (string memory name, address resolver, address reverseResolver);
}
