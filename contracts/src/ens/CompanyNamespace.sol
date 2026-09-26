// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";
import {EnsV2Grant, IEnsV2Factory, IEnsV2Registry, IEnsV2Resolver} from "./IEnsV2.sol";

/// @title CompanyNamespace
/// @notice Lets a verified company issue ENS names under its payee name, e.g. `ap.t2011001234567.payee.eth` for its AP
///         agent or `keiri.t2011001234567.payee.eth` for its accounts department. An issued name is an identity, never
///         a payee: it carries text records only (a description, ENSIP-26 agent records, an ENSIP-25 link to an
///         ERC-8004 registration) and resolves no address. The only name anyone pays is `t<T-number>.<parent>`, whose
///         payout the registry decides.
///
///         Authority follows the PayeeRegistry live:
///         - only the payee's current controller, while the payee is active, opens the namespace and issues, edits,
///           renews or revokes names. A controller rotation moves that authority; a dispute freezes it;
///         - the names answer only while the payee is active, so a dispute darkens them at once.
///
///         This contract is the issued names' resolver (ENSIP-10). It answers only exact, live names of the current
///         namespace, and only text, read from each name's own ENSv2 PermissionedResolver. It is the only role holder
///         on those resolvers and writes only the exact name, never the root node that a PermissionedResolver would
///         serve as every deeper name's default. A holder updates its `agent-status` through `setStatus`, and nothing
///         else.
///
///         Meigi (`brake`) can unregister any issued name, and `reset` a T-number's namespace: after a dispute moves
///         the number to another company, none of the old names carry over.
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
    uint256 private constant MAX_LABEL_LENGTH = 32;
    /// @dev A T-number has 13 digits, so no label may carry a run of 13.
    uint256 private constant T_NUMBER_DIGITS = 13;
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

    /// @notice Bumped by `reset`: the current namespace generation of each T-number.
    mapping(uint64 tNumber => uint256) public epochOf;
    /// @notice The current namespace registry of each T-number (zero until opened, and after a reset).
    mapping(uint64 tNumber => address) public namespaceOf;
    mapping(uint64 tNumber => mapping(uint256 epoch => mapping(bytes32 labelHash => address))) private
        _resolverOf;
    mapping(uint64 tNumber => mapping(uint256 epoch => string[])) private _labels;
    mapping(uint64 tNumber => mapping(uint256 epoch => mapping(bytes32 labelHash => bool))) private _listed;
    uint256 private _resolverCount;

    event NamespaceOpened(uint64 indexed tNumber, uint256 epoch, address namespace);
    event NamespaceReset(uint64 indexed tNumber, uint256 epoch);
    event NameIssued(uint64 indexed tNumber, string label, address holder, address resolver, uint64 expiry);
    event NameRenewed(uint64 indexed tNumber, string label, uint64 expiry);
    event NameRevoked(uint64 indexed tNumber, string label);

    error ZeroAddress();
    error InvalidParentName();
    error PayeeNotActive(uint64 tNumber);
    error NotController(uint64 tNumber, address caller);
    error NotHolder(uint64 tNumber, string label, address caller);
    error NotBrake(address caller);
    error NoClaim(uint64 tNumber);
    error NamespaceExists(uint64 tNumber);
    error NoNamespace(uint64 tNumber);
    error UnknownName(uint64 tNumber, string label);
    error InvalidLabel(string label);
    error ReservedKey(string key);
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

    /// @dev Only the payee's current controller, and only while the payee is active.
    modifier onlyController(uint64 tNumber) {
        _onlyController(tNumber);
        _;
    }

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

    /// @notice Issues `name.label` under the company's payee name: text records only, in its own resolver.
    function issue(uint64 tNumber, Name calldata name)
        external
        onlyController(tNumber)
        returns (address resolver)
    {
        IEnsV2Registry namespace = _namespace(tNumber);
        _checkLabel(name.label);
        if (name.holder == address(0) || name.holder.code.length != 0) revert InvalidHolder(name.holder);
        _checkExpiry(tNumber, name.expiry);
        if (name.keys.length != name.values.length) revert TextsMismatch();

        uint256 epoch = epochOf[tNumber];
        bytes32 labelHash = keccak256(bytes(name.label));
        if (!_listed[tNumber][epoch][labelHash]) {
            _listed[tNumber][epoch][labelHash] = true;
            _labels[tNumber][epoch].push(name.label);
        }
        resolver = _deployResolver(_dnsName(tNumber, name.label), name);
        _resolverOf[tNumber][epoch][labelHash] = resolver;
        namespace.register(name.label, name.holder, address(0), address(this), 0, name.expiry);
        emit NameIssued(tNumber, name.label, name.holder, resolver, name.expiry);
    }

    /// @notice Sets a text record on a live issued name, as the company.
    function setText(uint64 tNumber, string calldata label, string calldata key, string calldata value)
        external
        onlyController(tNumber)
    {
        _checkKey(key);
        if (_namespace(tNumber).getOwner(_labelId(label)) == address(0)) revert UnknownName(tNumber, label);
        _write(tNumber, label, key, value);
    }

    /// @notice Sets `agent-status` on a live issued name, as its holder. The holder can write nothing else.
    function setStatus(uint64 tNumber, string calldata label, string calldata value) external {
        if (_namespace(tNumber).getOwner(_labelId(label)) != msg.sender) {
            revert NotHolder(tNumber, label, msg.sender);
        }
        _write(tNumber, label, STATUS_KEY, value);
    }

    /// @notice Extends a live name, up to the company's claim expiry. An expired or revoked name is issued again
    ///         instead: the registry would revive a revoked name without its holder.
    function renew(uint64 tNumber, string calldata label, uint64 expiry) external onlyController(tNumber) {
        IEnsV2Registry namespace = _namespace(tNumber);
        uint256 id = _labelId(label);
        if (namespace.getOwner(id) == address(0)) revert UnknownName(tNumber, label);
        _checkExpiry(tNumber, expiry);
        namespace.renew(id, expiry);
        emit NameRenewed(tNumber, label, expiry);
    }

    /// @notice Unregisters an issued name: it stops resolving, and its label can be issued again.
    function revoke(uint64 tNumber, string calldata label) external onlyController(tNumber) {
        _namespace(tNumber).unregister(_labelId(label));
        emit NameRevoked(tNumber, label);
    }

    /// @notice Meigi's reset of a T-number's namespace, e.g. after a dispute moved the number to another company:
    ///         every name of the old epoch stops answering at once, and `open` starts a fresh registry.
    function reset(uint64 tNumber) external {
        if (msg.sender != brake) revert NotBrake(msg.sender);
        uint256 epoch = ++epochOf[tNumber];
        delete namespaceOf[tNumber];
        emit NamespaceReset(tNumber, epoch);
    }

    /// @notice ENSIP-10. Text records of exact, live issued names while the payee is active; no address, ever.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        if (data.length < 4) revert UnsupportedRecord(bytes4(0));
        bytes4 selector = bytes4(data[:4]);
        if (selector == MULTICALL) return _multicall(name, data);
        if (selector == ADDR) return abi.encode(address(0));
        if (selector == ADDR_COIN) return abi.encode(bytes(""));
        if (selector != TEXT) revert UnsupportedRecord(selector);
        address resolver = _answering(name);
        if (resolver == address(0)) return abi.encode("");
        try IEnsV2Resolver(resolver).resolve(name, data) returns (bytes memory result) {
            return result;
        } catch {
            return abi.encode("");
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == EXTENDED_RESOLVER;
    }

    /// @notice Every label issued in the current namespace, including revoked and expired ones.
    function labelsOf(uint64 tNumber) external view returns (string[] memory) {
        return _labels[tNumber][epochOf[tNumber]];
    }

    /// @notice An issued name's holder, record resolver and expiry in the current namespace. The holder is zero once it
    ///         expired or was revoked.
    function nameOf(uint64 tNumber, string calldata label)
        external
        view
        returns (address holder, address resolver, uint64 expiry)
    {
        IEnsV2Registry namespace = IEnsV2Registry(namespaceOf[tNumber]);
        if (address(namespace) == address(0)) return (address(0), address(0), 0);
        uint256 id = _labelId(label);
        resolver = _resolverOf[tNumber][epochOf[tNumber]][keccak256(bytes(label))];
        return (namespace.getOwner(id), resolver, namespace.getExpiry(id));
    }

    /// @dev The name's own resolver, with its texts set while initializing. This contract is its only role holder,
    ///      with the text role alone, so no address record can ever exist there.
    function _deployResolver(bytes memory dnsName, Name calldata name) private returns (address) {
        bytes[] memory calls = new bytes[](name.keys.length);
        for (uint256 i; i < name.keys.length; ++i) {
            _checkKey(name.keys[i]);
            calls[i] = abi.encodeCall(IEnsV2Resolver.setText, (dnsName, name.keys[i], name.values[i]));
        }
        EnsV2Grant[] memory grants = new EnsV2Grant[](1);
        grants[0] = EnsV2Grant({account: address(this), roleBitmap: ROLE_SET_TEXT});
        bytes memory init = abi.encodeCall(IEnsV2Resolver.initialize, (grants, calls));
        return factory.deployProxy(resolverImplementation, ++_resolverCount, init);
    }

    /// @dev Writes one text on the exact name (never the root node), in its current resolver.
    function _write(uint64 tNumber, string calldata label, string memory key, string calldata value) private {
        address resolver = _resolverOf[tNumber][epochOf[tNumber]][keccak256(bytes(label))];
        IEnsV2Resolver(resolver).setText(_dnsName(tNumber, label), key, value);
    }

    /// @dev The record resolver answering `name`, or zero: `name` must be exactly `<label>.t<13 digits>.<parent>`, the
    ///      payee active, and the label live in the current namespace.
    function _answering(bytes calldata name) private view returns (address) {
        (uint64 tNumber, bytes calldata label, bool exact) = _parse(name);
        if (!exact || !registry.isActive(tNumber)) return address(0);
        address namespace = namespaceOf[tNumber];
        if (namespace == address(0)) return address(0);
        if (IEnsV2Registry(namespace).getOwner(uint256(keccak256(label))) == address(0)) return address(0);
        return _resolverOf[tNumber][epochOf[tNumber]][keccak256(label)];
    }

    /// @dev Splits `<label>.t<13 digits>.<parent>` (DNS-encoded). `exact` is false for any other shape.
    function _parse(bytes calldata name)
        private
        view
        returns (uint64 tNumber, bytes calldata label, bool exact)
    {
        label = name[0:0];
        if (name.length == 0) return (0, label, false);
        uint256 end = 1 + uint8(name[0]);
        // label, then a 14-byte label "t<13 digits>", then the parent
        if (end == 1 || name.length < end + 15 || uint8(name[end]) != 14 || name[end + 1] != "t") {
            return (0, label, false);
        }
        if (keccak256(name[end + 15:]) != parentNameHash) return (0, label, false);
        for (uint256 i = end + 2; i < end + 15; ++i) {
            bytes1 c = name[i];
            if (c < "0" || c > "9") return (0, label, false);
            tNumber = tNumber * 10 + uint64(uint8(c) - 48);
        }
        return (tNumber, name[1:end], true);
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
        IPayeeRegistry.PayeeView memory payee = registry.payeeOf(tNumber);
        if (payee.status != IPayeeRegistry.Status.Active) revert PayeeNotActive(tNumber);
        if (payee.controller != msg.sender) revert NotController(tNumber, msg.sender);
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

    /// @dev ENSIP-15-normal and strict: 1 to 32 of [a-z0-9] with single inner hyphens (so never `xn--` punycode),
    ///      and no run of 13 digits, so a label can't pose as a T-number.
    function _checkLabel(string calldata label) private pure {
        bytes calldata b = bytes(label);
        uint256 n = b.length;
        if (n == 0 || n > MAX_LABEL_LENGTH || b[0] == "-" || b[n - 1] == "-") revert InvalidLabel(label);
        uint256 run;
        for (uint256 i; i < n; ++i) {
            bytes1 c = b[i];
            bool digit = c >= "0" && c <= "9";
            if (c == "-") {
                if (b[i - 1] == "-") revert InvalidLabel(label);
            } else if (!digit && !(c >= "a" && c <= "z")) {
                revert InvalidLabel(label);
            }
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
