// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Vm} from "forge-std/Vm.sol";

// The part of ENSv2 these scripts call. Signatures match the source verified on Sepolia Blockscout for both
// deployments in deployments/ (src/registrar/ETHRegistrar.sol, src/registry/PermissionedRegistry.sol,
// src/universalResolver/UniversalResolverV2.sol). IRegistry and IERC20 parameters are addresses in the ABI.

interface IETHRegistrar {
    function ETH_REGISTRY() external view returns (IPermissionedRegistry);
    function MIN_COMMITMENT_AGE() external view returns (uint64);
    function MAX_COMMITMENT_AGE() external view returns (uint64);
    function MIN_REGISTER_DURATION() external view returns (uint64);
    function commitmentAt(bytes32 commitment) external view returns (uint64);
    function isAvailable(string calldata label) external view returns (bool);
    function getRegisterPrice(string calldata label, uint64 duration, address paymentToken)
        external
        view
        returns (uint256 base, uint256 premium);
    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) external pure returns (bytes32);
    function commit(bytes32 commitment) external;
    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        address paymentToken,
        bytes32 referrer
    ) external returns (uint256 tokenId);
}

interface IPermissionedRegistry {
    function getSubregistry(string calldata label) external view returns (address);
    function getResolver(string calldata label) external view returns (address);
    function getOwner(uint256 anyId) external view returns (address);
    function getExpiry(uint256 anyId) external view returns (uint64);
    function hasRoles(uint256 anyId, uint256 roleBitmap, address account) external view returns (bool);
    function setResolver(uint256 anyId, address resolver) external;
}

interface IUniversalResolver {
    function ROOT_REGISTRY() external view returns (address);
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory, address);
}

/// @dev The registration fee token on both deployments: a MockERC20 with an open `mint`.
interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @dev Implemented by PayeeResolver, which only answers names directly under the parent it was built for.
interface IParentBoundResolver {
    function parentNameHash() external view returns (bytes32);
}

/// @notice One ENSv2 deployment, as loaded from the environment (see deployments/*.env).
struct EnsV2 {
    IETHRegistrar registrar;
    IPermissionedRegistry ethRegistry;
    IUniversalResolver universalResolver;
    IMintableERC20 paymentToken;
}

library EnsV2Lib {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @dev RegistryRolesLib.ROLE_SET_RESOLVER. The ETHRegistrar grants it (and its admin role) to the owner.
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;

    /// @dev ERC-165 id of IExtendedResolver.resolve(bytes,bytes). The UniversalResolver requires it from any
    ///      resolver it finds on a parent name (ENSIP-10 wildcard), and then passes it the full DNS-encoded name.
    bytes4 internal constant EXTENDED_RESOLVER = 0x9061b923;

    /// @dev ERC-165 id of IRegistry: getSubregistry(string) ^ getResolver(string) ^ getParent().
    bytes4 internal constant REGISTRY = 0x51f67f40;

    /// @notice Loads the deployment and checks its wiring, so a wrong address table fails before any transaction.
    function load() internal view returns (EnsV2 memory d) {
        d.registrar = IETHRegistrar(VM.envAddress("ENS_REGISTRAR"));
        d.universalResolver = IUniversalResolver(VM.envAddress("ENS_UNIVERSAL_RESOLVER"));
        d.paymentToken = IMintableERC20(VM.envAddress("ENS_PAYMENT_TOKEN"));
        d.ethRegistry = d.registrar.ETH_REGISTRY();
        address root = VM.envAddress("ENS_ROOT_REGISTRY");
        require(
            d.universalResolver.ROOT_REGISTRY() == root, "ENS_UNIVERSAL_RESOLVER serves another root registry"
        );
        require(
            IPermissionedRegistry(root).getSubregistry("eth") == address(d.ethRegistry),
            "ENS_REGISTRAR does not register under this root's .eth"
        );
    }

    /// @notice An optional address from the environment: zero when unset, and a revert (never a silent zero,
    ///         which `vm.envOr` gives for a malformed value) when set but invalid.
    function envAddressOrZero(string memory name) internal view returns (address) {
        return VM.envExists(name) ? VM.envAddress(name) : address(0);
    }

    function labelId(string memory label) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }

    /// @notice DNS wire format of a dotted name, e.g. "payee.eth" -> hex"0570617965650365746800".
    function dnsEncode(string memory name) internal pure returns (bytes memory out) {
        bytes memory s = bytes(name);
        uint256 start;
        for (uint256 i; i <= s.length; i++) {
            if (i < s.length && s[i] != ".") continue;
            uint256 len = i - start;
            require(len > 0 && len < 256, "invalid label length");
            // casting to 'uint8' is safe because len < 256 is checked above
            // forge-lint: disable-next-line(unsafe-typecast)
            out = abi.encodePacked(out, uint8(len), _slice(s, start, i));
            start = i + 1;
        }
        out = abi.encodePacked(out, uint8(0));
    }

    function supportsExtendedResolver(address resolver) internal view returns (bool) {
        if (resolver.code.length == 0) return false;
        try IERC165(resolver).supportsInterface(EXTENDED_RESOLVER) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    function isRegistry(address registry) internal view returns (bool) {
        if (registry.code.length == 0) return false;
        try IERC165(registry).supportsInterface(REGISTRY) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    /// @notice False when `resolver` is a PayeeResolver built for a parent other than `<label>.eth`.
    ///         Other ENSIP-10 resolvers do not expose a parent and pass.
    function servesParent(address resolver, string memory label) internal view returns (bool) {
        try IParentBoundResolver(resolver).parentNameHash() returns (bytes32 h) {
            return h == keccak256(dnsEncode(string.concat(label, ".eth")));
        } catch {
            return true;
        }
    }

    function _slice(bytes memory s, uint256 from, uint256 to) private pure returns (bytes memory out) {
        out = new bytes(to - from);
        for (uint256 i; i < out.length; i++) {
            out[i] = s[from + i];
        }
    }
}
