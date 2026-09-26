// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @dev The ERC-8004 IdentityRegistry: each agent is an ERC-721 token whose URI is its registration file.
interface IAgentIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function unsetAgentWallet(uint256 agentId) external;
    function ownerOf(uint256 agentId) external view returns (address);
    function tokenURI(uint256 agentId) external view returns (string memory);
}

/// @notice ENSIP-25: an ENS name confirms an agent's ERC-8004 registration with the text record
///         `agent-registration[<registry as an ERC-7930 address>][<agentId>]` = "1".
library Ensip25 {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    /// @dev The ERC-8004 IdentityRegistry v2.0.0 on Sepolia.
    address internal constant SEPOLIA_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    function registry() internal view returns (IAgentIdentityRegistry) {
        return IAgentIdentityRegistry(VM.envOr("ERC8004_IDENTITY_REGISTRY", SEPOLIA_REGISTRY));
    }

    function registrationKey(address agents, uint256 agentId) internal view returns (string memory) {
        return
            string.concat(
                "agent-registration[", VM.toString(erc7930(agents)), "][", VM.toString(agentId), "]"
            );
    }

    /// @notice ERC-7930 interoperable address: version 1, chain type 0 (eip155), then the chain id and the address,
    ///         each length-prefixed. On Sepolia: 0x0001 0000 03 aa36a7 14 <20 bytes>.
    function erc7930(address account) internal view returns (bytes memory) {
        bytes memory chain = abi.encodePacked(block.chainid);
        uint256 start;
        while (start < chain.length - 1 && chain[start] == 0) start++;
        bytes memory chainRef = new bytes(chain.length - start);
        for (uint256 i; i < chainRef.length; i++) {
            chainRef[i] = chain[start + i];
        }
        return abi.encodePacked(uint16(1), uint16(0), uint8(chainRef.length), chainRef, uint8(20), account);
    }
}
