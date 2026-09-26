// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Script, console} from "forge-std/Script.sol";
import {AgentConfig, IPermissionedResolver, IUserRegistry} from "./AgentNs.sol";
import {EnsV2Lib} from "./EnsV2.sol";

/// @dev The ERC-8004 IdentityRegistry: each agent is an ERC-721 token whose URI is its registration file.
interface IAgentIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function unsetAgentWallet(uint256 agentId) external;
    function ownerOf(uint256 agentId) external view returns (address);
    function tokenURI(uint256 agentId) external view returns (string memory);
}

/// @notice Registers the AP agent in the ERC-8004 IdentityRegistry and links it to ap.meigi.eth, as ENSIP-25 describes.
///         The two sides point at each other:
///         - the agent's registration file (on-chain, a data: URI) lists `ap.meigi.eth` as its ENS service;
///         - ap.meigi.eth carries `agent-registration[<registry, ERC-7930>][<agentId>]` = "1".
///         - `register()`, signed by the deployer: mints the agent and clears the default agent wallet (the registry
///           sets it to whoever registers; the agent pays from the AgentVault, which ap.meigi.eth resolves to).
///         - `link()`, signed by the deployer: sets the ENSIP-25 record for AGENT_8004_ID.
/// @dev Env: DEPLOYER_PRIVATE_KEY (or, on a fork, the unlocked DEPLOYER_ADDRESS), AGENT_RESOLVER (for link()),
///      AGENT_8004_ID (for link()). Optional: ERC8004_IDENTITY_REGISTRY (the Sepolia v2.0.0 deployment).
contract AgentIdentity is Script {
    address private constant SEPOLIA_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    function register() external {
        IAgentIdentityRegistry agents = _registry();
        string memory uri = registrationUri();

        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        uint256 agentId = agents.register(uri);
        agents.unsetAgentWallet(agentId);
        vm.stopBroadcast();
        console.log(
            "Registered the AP agent in ERC-8004 %s as agent %s (simulated id)", address(agents), agentId
        );
    }

    function link() external {
        IAgentIdentityRegistry agents = _registry();
        uint256 agentId = vm.envUint("AGENT_8004_ID");
        address deployer = EnsV2Lib.signer("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        require(agents.ownerOf(agentId) == deployer, "AGENT_8004_ID is not our agent");
        require(
            keccak256(bytes(agents.tokenURI(agentId))) == keccak256(bytes(registrationUri())),
            "that agent's registration file does not name this ENS name"
        );
        IPermissionedResolver resolver = IPermissionedResolver(vm.envAddress("AGENT_RESOLVER"));
        address subregistry = EnsV2Lib.load().ethRegistry.getSubregistry(AgentConfig.parent());
        require(
            IUserRegistry(subregistry).getResolver(AgentConfig.label()) == address(resolver),
            "AGENT_RESOLVER is not the resolver of the agent's name"
        );
        string memory key = registrationKey(address(agents), agentId);

        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        resolver.setText(AgentConfig.dnsName(), key, "1");
        vm.stopBroadcast();
        console.log("%s: %s = 1", AgentConfig.name(), key);
    }

    /// @notice ENSIP-25's key: `agent-registration[<registry as an ERC-7930 address>][<agentId>]`.
    function registrationKey(address registry, uint256 agentId) public view returns (string memory) {
        return
            string.concat(
                "agent-registration[", vm.toString(erc7930(registry)), "][", vm.toString(agentId), "]"
            );
    }

    /// @notice ERC-7930 interoperable address: version 1, chain type 0 (eip155), then the chain id and the address,
    ///         each length-prefixed. On Sepolia: 0x0001 0000 03 aa36a7 14 <20 bytes>.
    function erc7930(address account) public view returns (bytes memory) {
        bytes memory chain = abi.encodePacked(block.chainid);
        uint256 start;
        while (start < chain.length - 1 && chain[start] == 0) start++;
        bytes memory chainRef = new bytes(chain.length - start);
        for (uint256 i; i < chainRef.length; i++) {
            chainRef[i] = chain[start + i];
        }
        return abi.encodePacked(uint16(1), uint16(0), uint8(chainRef.length), chainRef, uint8(20), account);
    }

    /// @notice The ERC-8004 registration file, fully on-chain as a data: URI. Its ENS service is the agent's name.
    function registrationUri() public view returns (string memory) {
        // name, description, url, avatar: the same values ap.meigi.eth publishes
        (, string[4] memory values) = AgentConfig.profile();
        string memory json = string.concat(
            '{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1","name":"',
            values[0],
            '","description":"',
            values[1],
            '","image":"',
            values[3],
            '","services":[{"name":"web","endpoint":"',
            values[2],
            '"},{"name":"ENS","endpoint":"',
            AgentConfig.name(),
            '","version":"v1"}],"supportedTrust":[]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _registry() private view returns (IAgentIdentityRegistry) {
        return IAgentIdentityRegistry(vm.envOr("ERC8004_IDENTITY_REGISTRY", SEPOLIA_REGISTRY));
    }
}
