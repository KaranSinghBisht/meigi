// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";
import {EnsV2Grant, IEnsV2Factory, IEnsV2Registry, IEnsV2Resolver} from "./IEnsV2.sol";

/// @title CompanyNamespace
/// @notice Lets a verified company issue ENS names under its payee name, e.g. `ap.t2011001234567.payee.eth` for its AP
///         agent or `keiri.t2011001234567.payee.eth` for its accounts department. Issuing authority follows the
///         PayeeRegistry live: only the payee's current controller, while the payee is active, can open the namespace
///         or issue, renew, edit and revoke its names. A controller rotation moves that authority and a dispute
///         freezes it, with no ENS transaction. Each issued name:
///         - has its own ENSv2 PermissionedResolver, so no record role reaches another name;
///         - resolves `addr` to its holder, fixed at issue: no account ever holds the address role;
///         - can't carry a 13-digit number or be punycode, so it can't pose as another company's payee name;
///         - is non-transferable (issued with no token roles) and expires, at the latest with the company's claim;
///         - is an identity, never a payee: money goes only to the registry payout of `t<T-number>.<parent>`.
///         Meigi (`brake`) keeps two roles on every namespace, to unregister a name or clear its resolver, and can
///         detach a whole namespace from the company's claimed name.
contract CompanyNamespace {
    using Strings for uint256;

    /// @notice Names, holders and texts for one issued name.
    /// @param keys Initial text records (e.g. description, agent-context), set with `values`.
    /// @param holderKeys Text keys the holder may later set itself (e.g. agent-status); the company sets the rest.
    struct Name {
        string label;
        address holder;
        uint64 expiry;
        string[] keys;
        string[] values;
        string[] holderKeys;
    }

    /// @dev ENSv2 RegistryRolesLib roles on a company registry's root.
    uint256 private constant ROLE_REGISTRAR = 1 << 0;
    uint256 private constant ROLE_SET_PARENT = 1 << 8;
    uint256 private constant ROLE_UNREGISTER = 1 << 12;
    uint256 private constant ROLE_RENEW = 1 << 16;
    uint256 private constant ROLE_SET_RESOLVER = 1 << 24;
    /// @dev ENSv2 PermissionedResolverLib: text records and the admin role that grants them.
    uint256 private constant ROLE_SET_TEXT = 1 << 4;
    uint256 private constant ROLE_SET_TEXT_ADMIN = ROLE_SET_TEXT << 128;
    uint256 private constant COIN_TYPE_ETH = 60;
    uint256 private constant MAX_LABEL_LENGTH = 32;
    /// @dev A T-number has 13 digits, so no label may carry a run of 13.
    uint256 private constant T_NUMBER_DIGITS = 13;

    IPayeeRegistry public immutable registry;
    IEnsV2Factory public immutable factory;
    address public immutable registryImplementation;
    address public immutable resolverImplementation;
    /// @notice The parent's subregistry, where each company's claimed `t<T-number>` token lives.
    IEnsV2Registry public immutable claims;
    address public immutable brake;
    /// @notice The DNS-encoded parent of the payee names, e.g. "\x05payee\x03eth\x00".
    bytes public parentDnsName;

    mapping(uint64 tNumber => address) public namespaceOf;
    mapping(uint64 tNumber => string[]) private _labels;
    mapping(uint64 tNumber => mapping(bytes32 labelHash => bool)) private _listed;
    uint256 private _resolverCount;

    event NamespaceOpened(uint64 indexed tNumber, address namespace);
    event NameIssued(uint64 indexed tNumber, string label, address holder, address resolver, uint64 expiry);
    event NameRenewed(uint64 indexed tNumber, string label, uint64 expiry);
    event NameRevoked(uint64 indexed tNumber, string label);

    error ZeroAddress();
    error InvalidParentName();
    error PayeeNotActive(uint64 tNumber);
    error NotController(uint64 tNumber, address caller);
    error NoClaim(uint64 tNumber);
    error NamespaceExists(uint64 tNumber);
    error NoNamespace(uint64 tNumber);
    error UnknownName(uint64 tNumber, string label);
    error InvalidLabel(string label);
    error ReservedKey(string key);
    error InvalidHolder();
    error InvalidExpiry(uint64 expiry, uint64 latest);
    error TextsMismatch();

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
        parentDnsName = parentDnsName_;
    }

    /// @dev Only the payee's current controller, and only while the payee is active.
    modifier onlyController(uint64 tNumber) {
        _onlyController(tNumber);
        _;
    }

    /// @notice Creates the company's registry. Meigi then attaches it to the company's claimed name.
    function open(uint64 tNumber) external onlyController(tNumber) returns (address namespace) {
        if (namespaceOf[tNumber] != address(0)) revert NamespaceExists(tNumber);
        string memory claimLabel = _claimLabel(tNumber);
        if (_claimExpiry(claimLabel) <= block.timestamp) revert NoClaim(tNumber);

        EnsV2Grant[] memory grants = new EnsV2Grant[](2);
        grants[0] = EnsV2Grant({
            account: address(this),
            roleBitmap: ROLE_REGISTRAR | ROLE_RENEW | ROLE_UNREGISTER | ROLE_SET_PARENT
        });
        grants[1] = EnsV2Grant({account: brake, roleBitmap: ROLE_UNREGISTER | ROLE_SET_RESOLVER});
        bytes memory init = abi.encodeCall(IEnsV2Registry.initialize, (grants));
        namespace = factory.deployProxy(registryImplementation, uint256(tNumber), init);
        namespaceOf[tNumber] = namespace;
        IEnsV2Registry(namespace).setParent(address(claims), claimLabel);
        emit NamespaceOpened(tNumber, namespace);
    }

    /// @notice Issues `name.label` under the company's payee name, with its own resolver.
    function issue(uint64 tNumber, Name calldata name)
        external
        onlyController(tNumber)
        returns (address resolver)
    {
        IEnsV2Registry namespace = _namespace(tNumber);
        _checkLabel(name.label);
        if (name.holder == address(0)) revert InvalidHolder();
        _checkExpiry(tNumber, name.expiry);
        if (name.keys.length != name.values.length) revert TextsMismatch();

        bytes memory dnsName = _dnsName(tNumber, name.label);
        resolver = _deployResolver(dnsName, name);
        for (uint256 i; i < name.holderKeys.length; ++i) {
            _checkKey(name.holderKeys[i]);
            IEnsV2Resolver(resolver)
                .grantSetterRoles(
                    abi.encodeCall(IEnsV2Resolver.setText, (dnsName, name.holderKeys[i], "")), name.holder
                );
        }
        namespace.register(name.label, name.holder, address(0), resolver, 0, name.expiry);
        _list(tNumber, name.label);
        emit NameIssued(tNumber, name.label, name.holder, resolver, name.expiry);
    }

    /// @notice Sets a text record on an issued name, as the company. Its address can't be changed.
    function setText(uint64 tNumber, string calldata label, string calldata key, string calldata value)
        external
        onlyController(tNumber)
    {
        _checkKey(key);
        address resolver = _namespace(tNumber).getResolver(label);
        if (resolver == address(0)) revert UnknownName(tNumber, label);
        IEnsV2Resolver(resolver).setText(_dnsName(tNumber, label), key, value);
    }

    /// @notice Extends a live name, up to the company's claim expiry. An expired or revoked name is issued again
    ///         instead: the registry would revive a revoked name's old resolver without a holder.
    function renew(uint64 tNumber, string calldata label, uint64 expiry) external onlyController(tNumber) {
        IEnsV2Registry namespace = _namespace(tNumber);
        uint256 id = _labelId(label);
        if (namespace.getOwner(id) == address(0)) revert UnknownName(tNumber, label);
        _checkExpiry(tNumber, expiry);
        namespace.renew(id, expiry);
        emit NameRenewed(tNumber, label, expiry);
    }

    /// @notice Unregisters an issued name: it stops resolving and its label can be issued again.
    function revoke(uint64 tNumber, string calldata label) external onlyController(tNumber) {
        _namespace(tNumber).unregister(_labelId(label));
        emit NameRevoked(tNumber, label);
    }

    /// @notice Every label ever issued in the company's namespace, including revoked and expired ones.
    function labelsOf(uint64 tNumber) external view returns (string[] memory) {
        return _labels[tNumber];
    }

    /// @notice An issued name's holder, resolver and expiry. Holder and resolver are zero once it expired or was revoked.
    function nameOf(uint64 tNumber, string calldata label)
        external
        view
        returns (address holder, address resolver, uint64 expiry)
    {
        IEnsV2Registry namespace = IEnsV2Registry(namespaceOf[tNumber]);
        if (address(namespace) == address(0)) return (address(0), address(0), 0);
        uint256 id = _labelId(label);
        return (namespace.getOwner(id), namespace.getResolver(label), namespace.getExpiry(id));
    }

    /// @dev The name's own resolver: the address is set here, while initializing, and no account ever holds the
    ///      address role, so it stays the holder's. The gate keeps only the text role and its admin role.
    function _deployResolver(bytes memory dnsName, Name calldata name) private returns (address) {
        bytes[] memory calls = new bytes[](name.keys.length + 1);
        calls[0] = abi.encodeCall(
            IEnsV2Resolver.setAddress, (dnsName, COIN_TYPE_ETH, abi.encodePacked(name.holder))
        );
        for (uint256 i; i < name.keys.length; ++i) {
            _checkKey(name.keys[i]);
            calls[i + 1] = abi.encodeCall(IEnsV2Resolver.setText, (dnsName, name.keys[i], name.values[i]));
        }
        EnsV2Grant[] memory grants = new EnsV2Grant[](1);
        grants[0] = EnsV2Grant({account: address(this), roleBitmap: ROLE_SET_TEXT | ROLE_SET_TEXT_ADMIN});
        bytes memory init = abi.encodeCall(IEnsV2Resolver.initialize, (grants, calls));
        return factory.deployProxy(resolverImplementation, ++_resolverCount, init);
    }

    function _onlyController(uint64 tNumber) private view {
        IPayeeRegistry.PayeeView memory payee = registry.payeeOf(tNumber);
        if (payee.status != IPayeeRegistry.Status.Active) revert PayeeNotActive(tNumber);
        if (payee.controller != msg.sender) revert NotController(tNumber, msg.sender);
    }

    function _list(uint64 tNumber, string calldata label) private {
        bytes32 labelHash = keccak256(bytes(label));
        if (_listed[tNumber][labelHash]) return;
        _listed[tNumber][labelHash] = true;
        _labels[tNumber].push(label);
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

    /// @dev 1 to 32 of [a-z0-9-], no leading or trailing hyphen, not punycode (`xn--`), and no run of 13 digits.
    function _checkLabel(string calldata label) private pure {
        bytes calldata b = bytes(label);
        uint256 n = b.length;
        if (n == 0 || n > MAX_LABEL_LENGTH || b[0] == "-" || b[n - 1] == "-") revert InvalidLabel(label);
        if (n >= 4 && b[0] == "x" && b[1] == "n" && b[2] == "-" && b[3] == "-") revert InvalidLabel(label);
        uint256 run;
        for (uint256 i; i < n; ++i) {
            bytes1 c = b[i];
            bool digit = c >= "0" && c <= "9";
            if (!digit && !(c >= "a" && c <= "z") && c != "-") revert InvalidLabel(label);
            run = digit ? run + 1 : 0;
            if (run == T_NUMBER_DIGITS) revert InvalidLabel(label);
        }
    }

    /// @dev `meigi.*` keys, in any letter case, carry registry facts on payee names; a company can't publish them.
    function _checkKey(string calldata key) private pure {
        bytes calldata k = bytes(key);
        bytes memory prefix = "meigi.";
        if (k.length < prefix.length) return;
        for (uint256 i; i < prefix.length; ++i) {
            bytes1 c = k[i];
            if (c >= "A" && c <= "Z") c = bytes1(uint8(c) + 32);
            if (c != prefix[i]) return;
        }
        revert ReservedKey(key);
    }

    function _claimLabel(uint64 tNumber) private pure returns (string memory) {
        return string.concat("t", uint256(tNumber).toString());
    }

    /// @dev `<label>.t<T-number>.<parent>`, DNS-encoded.
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
