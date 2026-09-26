// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";
import {CompanyNameRules} from "./CompanyNameRules.sol";
import {EnsV2Grant, IEnsV2Factory, IEnsV2Registry, IEnsV2Resolver} from "./IEnsV2.sol";

/// @title CompanyNamespace
/// @notice Lets a verified company issue ENS names under its payee name, e.g. `ap.t2011001234567.payee.eth` for its AP
///         agent or `keiri.t2011001234567.payee.eth` for its accounts department. An issued name is an identity, never
///         a payee: it carries text records only (a description, ENSIP-26 agent records, an ENSIP-25 link to an
///         ERC-8004 registration) and resolves no address. The only name anyone pays is `t<T-number>.<parent>`, whose
///         payout the registry decides.
///
///         The registry decides, live:
///         - only the payee's current controller, while the payee is active, opens the namespace and issues, edits,
///           renews or revokes names;
///         - a name answers only while the payee is active and its controller is still the key that issued it, so a
///           dispute darkens every issued name at once, and a controller rotation (e.g. recovery from a stolen key)
///           darkens every name the old key issued.
///
///         This contract is the issued names' resolver (ENSIP-10), and every issued name's registry entry points at it.
///         It answers only the exact `<label>.t<13 digits>.<parent>` of a live name in the current namespace, once
///         Meigi has attached that namespace to the claimed name, and only text, read from that name's own ENSv2
///         PermissionedResolver. It is the only role holder there and writes only
///         the exact name, never the root node a PermissionedResolver would serve as every deeper name's default. A
///         holder updates its `agent-status` through `setStatus`, and nothing else.
///
///         Meigi (`brake`) can block a label or freeze a whole namespace (both stick: issuing, editing and answering
///         stop until Meigi lifts them), unregister any issued name, and reset a T-number's namespace so that, after a
///         dispute moves the number to another company, none of the old names carry over.
contract CompanyNamespace is IERC165 {
    using Strings for uint256;

    /// @notice One name to issue: its label, its holder (an externally owned account) and expiry, and its texts.
    struct Name {
        string label;
        address holder;
        uint64 expiry;
        string[] keys;
        string[] values;
    }

    /// @dev An issued name's record resolver, and the controller that issued it.
    struct Issued {
        address records;
        address issuer;
    }

    /// @dev ENSv2 RegistryRolesLib roles on a company registry's root.
    uint256 private constant ROLE_REGISTRAR = 1 << 0;
    uint256 private constant ROLE_SET_PARENT = 1 << 8;
    uint256 private constant ROLE_UNREGISTER = 1 << 12;
    uint256 private constant ROLE_RENEW = 1 << 16;
    /// @dev ENSv2 PermissionedResolverLib: text records.
    uint256 private constant ROLE_SET_TEXT = 1 << 4;
    bytes4 private constant EXTENDED_RESOLVER = 0x9061b923; // resolve(bytes,bytes)
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant ADDR_COIN = 0xf1cb7e06; // addr(bytes32,uint256)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)
    bytes4 private constant MULTICALL = 0xac9650d8; // multicall(bytes[])
    string private constant STATUS_KEY = "agent-status";

    IPayeeRegistry public immutable registry;
    IEnsV2Factory public immutable factory;
    address public immutable registryImplementation;
    address public immutable resolverImplementation;
    /// @notice The parent's subregistry, where each company's claimed `t<T-number>` token lives.
    IEnsV2Registry public immutable claims;
    address public immutable brake;
    /// @notice keccak256 of the DNS-encoded parent, e.g. "\x05payee\x03eth\x00".
    bytes32 public immutable parentNameHash;
    bytes public parentDnsName;

    /// @notice Bumped by `resetNamespace`: the current namespace generation of each T-number.
    mapping(uint64 tNumber => uint256) public epochOf;
    /// @notice The current namespace registry of each T-number (zero until opened, and after a reset).
    mapping(uint64 tNumber => address) public namespaceOf;
    /// @notice Set by Meigi: the whole namespace neither changes nor answers.
    mapping(uint64 tNumber => bool) public frozen;
    /// @notice Set by Meigi, by keccak256(label): the label can't be issued, changed or answered, in any epoch.
    mapping(uint64 tNumber => mapping(bytes32 labelHash => bool)) public blocked;
    mapping(uint64 tNumber => mapping(uint256 epoch => mapping(bytes32 labelHash => Issued))) private _issued;
    mapping(uint64 tNumber => mapping(uint256 epoch => string[])) private _labels;
    uint256 private _resolverCount;

    event NamespaceOpened(uint64 indexed tNumber, uint256 epoch, address namespace);
    event NamespaceReset(uint64 indexed tNumber, uint256 epoch);
    event NamespaceFrozen(uint64 indexed tNumber, bool frozen);
    event NameBlocked(uint64 indexed tNumber, string label, bool blocked);
    event NameIssued(uint64 indexed tNumber, string label, address holder, address resolver, uint64 expiry);
    event NameRenewed(uint64 indexed tNumber, string label, uint64 expiry);
    event NameRevoked(uint64 indexed tNumber, string label);

    error ZeroAddress();
    error InvalidParentName();
    error PayeeNotActive(uint64 tNumber);
    error NotController(uint64 tNumber, address caller);
    error NotHolder(uint64 tNumber, string label, address caller);
    error NotBrake(address caller);
    error Frozen(uint64 tNumber);
    error Blocked(uint64 tNumber, string label);
    error NoClaim(uint64 tNumber);
    error NamespaceExists(uint64 tNumber);
    error NoNamespace(uint64 tNumber);
    error UnknownName(uint64 tNumber, string label);
    error InvalidHolder(address holder);
    error InvalidExpiry(uint64 expiry, uint64 latest);
    error TextsMismatch();
    error UnsupportedRecord(bytes4 selector);

    constructor(
        IPayeeRegistry registry_,
        IEnsV2Factory factory_,
        address registryImplementation_,
        address resolverImplementation_,
        IEnsV2Registry claims_,
        address brake_,
        bytes memory parentDnsName_
    ) {
        if (
            address(registry_) == address(0) || address(factory_) == address(0)
                || registryImplementation_ == address(0) || resolverImplementation_ == address(0)
                || address(claims_) == address(0) || brake_ == address(0)
        ) revert ZeroAddress();
        uint256 n = parentDnsName_.length;
        if (n < 2 || parentDnsName_[n - 1] != 0x00) revert InvalidParentName();
        registry = registry_;
        factory = factory_;
        registryImplementation = registryImplementation_;
        resolverImplementation = resolverImplementation_;
        claims = claims_;
        brake = brake_;
        parentNameHash = keccak256(parentDnsName_);
        parentDnsName = parentDnsName_;
    }

    /// @dev Only the payee's current controller, only while the payee is active, and only while Meigi hasn't frozen
    ///      the namespace.
    modifier onlyController(uint64 tNumber) {
        _onlyController(tNumber);
        _;
    }

    modifier onlyBrake() {
        if (msg.sender != brake) revert NotBrake(msg.sender);
        _;
    }

    // ---- the company ----

    /// @notice Creates the company's registry for the current epoch. Meigi then attaches it to the claimed name.
    function open(uint64 tNumber) external onlyController(tNumber) returns (address namespace) {
        if (namespaceOf[tNumber] != address(0)) revert NamespaceExists(tNumber);
        string memory claimLabel = _claimLabel(tNumber);
        if (_claimExpiry(claimLabel) <= block.timestamp) revert NoClaim(tNumber);
        uint256 epoch = epochOf[tNumber];

        EnsV2Grant[] memory grants = new EnsV2Grant[](2);
        grants[0] = EnsV2Grant({
            account: address(this),
            roleBitmap: ROLE_REGISTRAR | ROLE_RENEW | ROLE_UNREGISTER | ROLE_SET_PARENT
        });
        grants[1] = EnsV2Grant({account: brake, roleBitmap: ROLE_UNREGISTER});
        bytes memory init = abi.encodeCall(IEnsV2Registry.initialize, (grants));
        uint256 salt = uint256(keccak256(abi.encode(tNumber, epoch)));
        namespace = factory.deployProxy(registryImplementation, salt, init);
        namespaceOf[tNumber] = namespace;
        IEnsV2Registry(namespace).setParent(address(claims), claimLabel);
        emit NamespaceOpened(tNumber, epoch, namespace);
    }

    /// @notice Issues `name.label` under the company's payee name: text records only, in its own resolver, with this
    ///         contract as the resolver of its registry entry.
    function issue(uint64 tNumber, Name calldata name)
        external
        onlyController(tNumber)
        returns (address resolver)
    {
        IEnsV2Registry namespace = _namespace(tNumber);
        CompanyNameRules.checkLabel(name.label);
        bytes32 labelHash = keccak256(bytes(name.label));
        if (blocked[tNumber][labelHash]) revert Blocked(tNumber, name.label);
        if (name.holder == address(0) || name.holder.code.length != 0) revert InvalidHolder(name.holder);
        _checkExpiry(tNumber, name.expiry);
        if (name.keys.length != name.values.length) revert TextsMismatch();

        uint256 epoch = epochOf[tNumber];
        if (_issued[tNumber][epoch][labelHash].records == address(0)) {
            _labels[tNumber][epoch].push(name.label);
        }
        resolver = _deployResolver(_dnsName(tNumber, name.label), name);
        _issued[tNumber][epoch][labelHash] = Issued({records: resolver, issuer: msg.sender});
        namespace.register(name.label, name.holder, address(0), address(this), 0, name.expiry);
        emit NameIssued(tNumber, name.label, name.holder, resolver, name.expiry);
    }

    /// @notice Sets a text record on a live issued name, as the company.
    function setText(uint64 tNumber, string calldata label, string calldata key, string calldata value)
        external
        onlyController(tNumber)
    {
        CompanyNameRules.checkKey(key);
        _checkNotBlocked(tNumber, label);
        if (_namespace(tNumber).getOwner(_labelId(label)) == address(0)) revert UnknownName(tNumber, label);
        _write(tNumber, label, key, value);
    }

    /// @notice Sets `agent-status` on a live issued name, as its holder. The holder can write nothing else.
    function setStatus(uint64 tNumber, string calldata label, string calldata value) external {
        if (frozen[tNumber]) revert Frozen(tNumber);
        _checkNotBlocked(tNumber, label);
        if (_namespace(tNumber).getOwner(_labelId(label)) != msg.sender) {
            revert NotHolder(tNumber, label, msg.sender);
        }
        _write(tNumber, label, STATUS_KEY, value);
    }

    /// @notice Extends a live name, up to the company's claim expiry. An expired or revoked name is issued again
    ///         instead: the registry would revive a revoked name without its holder.
    function renew(uint64 tNumber, string calldata label, uint64 expiry) external onlyController(tNumber) {
        _checkNotBlocked(tNumber, label);
        IEnsV2Registry namespace = _namespace(tNumber);
        uint256 id = _labelId(label);
        if (namespace.getOwner(id) == address(0)) revert UnknownName(tNumber, label);
        _checkExpiry(tNumber, expiry);
        namespace.renew(id, expiry);
        emit NameRenewed(tNumber, label, expiry);
    }

    /// @notice Unregisters an issued name: it stops resolving, and its label can be issued again.
    function revoke(uint64 tNumber, string calldata label) external {
        _onlyController(tNumber, false);
        _namespace(tNumber).unregister(_labelId(label));
        emit NameRevoked(tNumber, label);
    }

    // ---- Meigi's brake ----

    /// @notice Stops a label: it can't be issued, edited, renewed or answered until Meigi lifts it.
    function setBlocked(uint64 tNumber, string calldata label, bool isBlocked) external onlyBrake {
        blocked[tNumber][keccak256(bytes(label))] = isBlocked;
        emit NameBlocked(tNumber, label, isBlocked);
    }

    /// @notice Stops a whole namespace: nothing is opened, issued, edited, renewed or answered until Meigi lifts it.
    function setFrozen(uint64 tNumber, bool isFrozen) external onlyBrake {
        frozen[tNumber] = isFrozen;
        emit NamespaceFrozen(tNumber, isFrozen);
    }

    /// @notice Starts a T-number over, e.g. after a dispute moved it to another company: every name of the old epoch
    ///         stops answering at once, and `open` makes a fresh registry (Meigi then attaches it instead of the old one).
    function resetNamespace(uint64 tNumber) external onlyBrake {
        uint256 epoch = ++epochOf[tNumber];
        delete namespaceOf[tNumber];
        emit NamespaceReset(tNumber, epoch);
    }

    // ---- resolution ----

    /// @notice ENSIP-10. Text of an issued name while the registry vouches for it (see `answers`); no address, ever.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        if (data.length < 4) revert UnsupportedRecord(bytes4(0));
        bytes4 selector = bytes4(data[:4]);
        if (selector == MULTICALL) return _multicall(name, data);
        if (selector == ADDR) return abi.encode(address(0));
        if (selector == ADDR_COIN) return abi.encode(bytes(""));
        if (selector != TEXT) revert UnsupportedRecord(selector);
        (uint64 tNumber, bytes calldata label, bool exact) = CompanyNameRules.parse(name, parentNameHash);
        address records = exact ? _answering(tNumber, keccak256(label)) : address(0);
        if (records == address(0)) return abi.encode("");
        try IEnsV2Resolver(records).resolve(name, data) returns (bytes memory result) {
            return result;
        } catch {
            return abi.encode("");
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == EXTENDED_RESOLVER;
    }

    /// @notice Whether `<label>.t<T-number>.<parent>` answers now: not frozen or blocked, live in the current namespace,
    ///         the payee active, and its controller still the key that issued the name.
    function answers(uint64 tNumber, string calldata label) external view returns (bool) {
        return _answering(tNumber, keccak256(bytes(label))) != address(0);
    }

    /// @notice Every label issued in the current namespace, including revoked and expired ones.
    function labelsOf(uint64 tNumber) external view returns (string[] memory) {
        return _labels[tNumber][epochOf[tNumber]];
    }

    /// @notice An issued name in the current namespace: its holder (zero once it expired or was revoked), record
    ///         resolver, issuing controller and expiry.
    function nameOf(uint64 tNumber, string calldata label)
        external
        view
        returns (address holder, address records, address issuer, uint64 expiry)
    {
        IEnsV2Registry namespace = IEnsV2Registry(namespaceOf[tNumber]);
        if (address(namespace) == address(0)) return (address(0), address(0), address(0), 0);
        uint256 id = _labelId(label);
        Issued memory issued = _issued[tNumber][epochOf[tNumber]][bytes32(id)];
        return (namespace.getOwner(id), issued.records, issued.issuer, namespace.getExpiry(id));
    }

    // ---- internals ----

    /// @dev The name's own resolver, with its texts set while initializing. This contract is its only role holder,
    ///      with the text role alone, so no address record can ever exist there.
    function _deployResolver(bytes memory dnsName, Name calldata name) private returns (address) {
        bytes[] memory calls = new bytes[](name.keys.length);
        for (uint256 i; i < name.keys.length; ++i) {
            CompanyNameRules.checkKey(name.keys[i]);
            calls[i] = abi.encodeCall(IEnsV2Resolver.setText, (dnsName, name.keys[i], name.values[i]));
        }
        EnsV2Grant[] memory grants = new EnsV2Grant[](1);
        grants[0] = EnsV2Grant({account: address(this), roleBitmap: ROLE_SET_TEXT});
        bytes memory init = abi.encodeCall(IEnsV2Resolver.initialize, (grants, calls));
        return factory.deployProxy(resolverImplementation, ++_resolverCount, init);
    }

    /// @dev Writes one text on the exact name (never the root node), in its current record resolver.
    function _write(uint64 tNumber, string calldata label, string memory key, string calldata value) private {
        address records = _issued[tNumber][epochOf[tNumber]][keccak256(bytes(label))].records;
        IEnsV2Resolver(records).setText(_dnsName(tNumber, label), key, value);
    }

    /// @dev The record resolver that answers for a label now, or zero. Only the namespace Meigi has attached to the
    ///      claimed name answers: a reset stays dark until Meigi attaches the fresh registry, however the lookup
    ///      arrived (e.g. through the old registry, which stays attached until then).
    function _answering(uint64 tNumber, bytes32 labelHash) private view returns (address) {
        if (frozen[tNumber] || blocked[tNumber][labelHash]) return address(0);
        address namespace = namespaceOf[tNumber];
        if (namespace == address(0) || claims.getSubregistry(_claimLabel(tNumber)) != namespace) {
            return address(0);
        }
        if (IEnsV2Registry(namespace).getOwner(uint256(labelHash)) == address(0)) return address(0);
        Issued memory issued = _issued[tNumber][epochOf[tNumber]][labelHash];
        if (issued.records == address(0)) return address(0);
        IPayeeRegistry.PayeeView memory payee = registry.payeeOf(tNumber);
        if (payee.status != IPayeeRegistry.Status.Active || payee.controller != issued.issuer) {
            return address(0);
        }
        return issued.records;
    }

    function _multicall(bytes calldata name, bytes calldata data) private view returns (bytes memory) {
        bytes[] memory calls = abi.decode(data[4:], (bytes[]));
        bytes[] memory results = new bytes[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            try this.resolve(name, calls[i]) returns (bytes memory result) {
                results[i] = result;
            } catch {
                results[i] = "";
            }
        }
        return abi.encode(results);
    }

    function _onlyController(uint64 tNumber) private view {
        _onlyController(tNumber, true);
    }

    /// @dev `checkFrozen` is false only for revoke: taking a name down stays possible while Meigi's freeze holds.
    function _onlyController(uint64 tNumber, bool checkFrozen) private view {
        if (checkFrozen && frozen[tNumber]) revert Frozen(tNumber);
        IPayeeRegistry.PayeeView memory payee = registry.payeeOf(tNumber);
        if (payee.status != IPayeeRegistry.Status.Active) revert PayeeNotActive(tNumber);
        if (payee.controller != msg.sender) revert NotController(tNumber, msg.sender);
    }

    function _checkNotBlocked(uint64 tNumber, string calldata label) private view {
        if (blocked[tNumber][keccak256(bytes(label))]) revert Blocked(tNumber, label);
    }

    function _namespace(uint64 tNumber) private view returns (IEnsV2Registry namespace) {
        namespace = IEnsV2Registry(namespaceOf[tNumber]);
        if (address(namespace) == address(0)) revert NoNamespace(tNumber);
    }

    /// @dev A name lives no longer than the company's claim, which expires with the parent name.
    function _checkExpiry(uint64 tNumber, uint64 expiry) private view {
        uint64 latest = _claimExpiry(_claimLabel(tNumber));
        if (expiry <= block.timestamp || expiry > latest) revert InvalidExpiry(expiry, latest);
    }

    function _claimExpiry(string memory claimLabel) private view returns (uint64) {
        return claims.getExpiry(uint256(keccak256(bytes(claimLabel))));
    }

    function _claimLabel(uint64 tNumber) private pure returns (string memory) {
        return string.concat("t", uint256(tNumber).toString());
    }

    /// @dev `<label>.t<T-number>.<parent>`, DNS-encoded. Labels are at most 32 bytes and `t<T-number>` 14.
    function _dnsName(uint64 tNumber, string calldata label) private view returns (bytes memory) {
        bytes memory claimLabel = bytes(_claimLabel(tNumber));
        return bytes.concat(
            bytes1(uint8(bytes(label).length)),
            bytes(label),
            bytes1(uint8(claimLabel.length)),
            claimLabel,
            parentDnsName
        );
    }

    function _labelId(string calldata label) private pure returns (uint256) {
        return uint256(keccak256(bytes(label)));
    }
}
