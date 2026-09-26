// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EnsV2Grant} from "../../src/ens/IEnsV2.sol";

// Stand-ins for the ENSv2 Beta contracts CompanyNamespace drives, with the semantics it relies on: root EAC roles on a
// registry, names that stop resolving at expiry, and a resolver whose setter roles are scoped by argument (the text
// key), never by name. CompanyNamespaceFork.t.sol runs the same flow against the real contracts on a Sepolia fork.

/// @dev The EAC check both mocks share: a role on the root resource or on the argument's resource.
error Unauthorized(uint256 resource, uint256 roles, address account);

/// @dev The UserRegistry's root roles, expiry and unregister semantics (unregister keeps the resolver, like the real one).
contract MockNamespaceRegistry {
    uint256 internal constant ROLE_REGISTRAR = 1 << 0;
    uint256 internal constant ROLE_SET_PARENT = 1 << 8;
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;

    struct Entry {
        address owner;
        address resolver;
        uint64 expiry;
        uint256 tokenRoles;
    }

    mapping(address account => uint256) public rootRoles;
    mapping(uint256 labelId => Entry) internal _entries;
    address public parent;
    string public parentLabel;
    bool private _initialized;

    error LabelExpired(uint256 labelId);
    error LabelAlreadyRegistered(string label);
    error CannotSetPastExpiry(uint64 expiry);
    error CannotReduceExpiry(uint64 expiry, uint64 newExpiry);

    function initialize(EnsV2Grant[] calldata grants) external {
        require(!_initialized, "initialized");
        _initialized = true;
        for (uint256 i; i < grants.length; ++i) {
            rootRoles[grants[i].account] |= grants[i].roleBitmap;
        }
    }

    function setParent(address parent_, string calldata label) external {
        _check(ROLE_SET_PARENT);
        parent = parent_;
        parentLabel = label;
    }

    function register(
        string calldata label,
        address owner,
        address,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 labelId) {
        _check(ROLE_REGISTRAR);
        labelId = uint256(keccak256(bytes(label)));
        if (!_expired(_entries[labelId].expiry)) revert LabelAlreadyRegistered(label);
        if (_expired(expiry)) revert CannotSetPastExpiry(expiry);
        _entries[labelId] = Entry(owner, resolver, expiry, roleBitmap);
    }

    function unregister(uint256 labelId) external {
        Entry storage entry = _live(labelId);
        _check(ROLE_UNREGISTER);
        entry.owner = address(0);
        entry.expiry = uint64(block.timestamp);
    }

    function renew(uint256 labelId, uint64 newExpiry) external {
        Entry storage entry = _entries[labelId];
        if (_expired(entry.expiry) && entry.expiry == 0) revert LabelExpired(labelId);
        _check(ROLE_RENEW);
        if (newExpiry < entry.expiry) revert CannotReduceExpiry(entry.expiry, newExpiry);
        entry.expiry = newExpiry;
    }

    function setResolver(uint256 labelId, address resolver) external {
        Entry storage entry = _live(labelId);
        _check(ROLE_SET_RESOLVER);
        entry.resolver = resolver;
    }

    function getResolver(string calldata label) external view returns (address) {
        Entry storage entry = _entries[uint256(keccak256(bytes(label)))];
        return _expired(entry.expiry) ? address(0) : entry.resolver;
    }

    function getOwner(uint256 labelId) external view returns (address) {
        Entry storage entry = _entries[labelId];
        return _expired(entry.expiry) ? address(0) : entry.owner;
    }

    function getExpiry(uint256 labelId) external view returns (uint64) {
        return _entries[labelId].expiry;
    }

    function tokenRoles(string calldata label) external view returns (uint256) {
        return _entries[uint256(keccak256(bytes(label)))].tokenRoles;
    }

    function _live(uint256 labelId) private view returns (Entry storage entry) {
        entry = _entries[labelId];
        if (_expired(entry.expiry)) revert LabelExpired(labelId);
    }

    function _check(uint256 roles) private view {
        if (rootRoles[msg.sender] & roles != roles) revert Unauthorized(0, roles, msg.sender);
    }

    function _expired(uint64 expiry) private view returns (bool) {
        return block.timestamp >= expiry;
    }
}

/// @dev The PermissionedResolver's role model: root roles from initialize, setter roles scoped by argument, and
///      initializer calls that skip permission checks. `resolve` answers text by the queried name, as the real one does.
contract MockProfileResolver {
    uint256 internal constant ROOT = 0;
    uint256 internal constant ROLE_SET_ADDRESS = 1 << 0;
    uint256 internal constant ROLE_SET_TEXT = 1 << 4;
    bytes4 internal constant TEXT = 0x59d1d43c;

    mapping(uint256 resource => mapping(address account => uint256)) public roles;
    mapping(bytes32 nameHash => mapping(string key => string)) internal _texts;
    mapping(bytes32 nameHash => mapping(uint256 coinType => bytes)) internal _addresses;
    bool private _initialized;
    bool private _initializing;

    function initialize(EnsV2Grant[] calldata grants, bytes[] calldata calls) external {
        require(!_initialized, "initialized");
        _initialized = true;
        _initializing = true;
        for (uint256 i; i < grants.length; ++i) {
            roles[ROOT][grants[i].account] |= grants[i].roleBitmap;
        }
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory err) = address(this).delegatecall(calls[i]);
            if (!ok) {
                assembly {
                    revert(add(err, 32), mload(err))
                }
            }
        }
        _initializing = false;
    }

    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external {
        _check(uint256(keccak256(abi.encodePacked(coinType))), ROLE_SET_ADDRESS);
        _addresses[keccak256(name)][coinType] = addressBytes;
    }

    function setText(bytes calldata name, string calldata key, string calldata value) external {
        _check(uint256(keccak256(bytes(key))), ROLE_SET_TEXT);
        _texts[keccak256(name)][key] = value;
    }

    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        require(bytes4(data[:4]) == TEXT, "text only");
        (, string memory key) = abi.decode(data[4:], (bytes32, string));
        return abi.encode(_texts[keccak256(name)][key]);
    }

    function hasRoles(uint256 resource, uint256 roleBitmap, address account) external view returns (bool) {
        return (roles[ROOT][account] | roles[resource][account]) & roleBitmap == roleBitmap;
    }

    function text(bytes calldata name, string calldata key) external view returns (string memory) {
        return _texts[keccak256(name)][key];
    }

    function _check(uint256 resource, uint256 roleBitmap) private view {
        if (_initializing) return;
        if ((roles[ROOT][msg.sender] | roles[resource][msg.sender]) & roleBitmap != roleBitmap) {
            revert Unauthorized(resource, roleBitmap, msg.sender);
        }
    }
}

/// @dev Deploys a fresh mock per call for the matching implementation, then initializes it with `data`.
contract MockEnsFactory {
    address public immutable registryImplementation = address(new MockNamespaceRegistry());
    address public immutable resolverImplementation = address(new MockProfileResolver());

    function deployProxy(address implementation, uint256, bytes calldata data)
        external
        returns (address proxy)
    {
        if (implementation == registryImplementation) proxy = address(new MockNamespaceRegistry());
        else if (implementation == resolverImplementation) proxy = address(new MockProfileResolver());
        else revert("unknown implementation");
        (bool ok, bytes memory err) = proxy.call(data);
        if (!ok) {
            assembly {
                revert(add(err, 32), mload(err))
            }
        }
    }
}

/// @dev The parent's claims registry: only the claimed names' expiry matters to the gate.
contract MockClaims {
    mapping(uint256 labelId => uint64) public getExpiry;

    function setExpiry(string calldata label, uint64 expiry) external {
        getExpiry[uint256(keccak256(bytes(label)))] = expiry;
    }
}
