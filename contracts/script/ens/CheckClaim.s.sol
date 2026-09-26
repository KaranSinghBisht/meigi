// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Script, console} from "forge-std/Script.sol";
import {ClaimedPayeeResolver} from "../../src/ens/ClaimedPayeeResolver.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {AgentNsLib, IPermissionedResolver, IUserRegistry, IVerifiableFactory} from "./AgentNs.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";

interface IPayeeResolverRegistry {
    function registry() external view returns (IPayeeRegistry);
}

/// @notice Read-only proof of claimed payee names, against live state. Nothing is sent.
///         - Wiring: payee.eth's subregistry is CLAIMS_REGISTRY (a VerifiableFactory UserRegistry). CLAIMS_RESOLVER
///           forwards to payee.eth's own PayeeResolver.
///         - The claim: the token is owned by the registry's controller and carries no roles. The profile is bound
///           to that controller, which holds only the text role there, and no account can set or grant an address.
///         - What the company cannot do, simulated from its address and rolled back: set an address, re-point its
///           name, or mask `name` or `meigi.status`.
///         - Every T-number in CHECK_T_NUMBERS resolves through the UniversalResolver exactly as the registry says.
/// @dev Env: CLAIMS_REGISTRY, CLAIMS_RESOLVER, deployments/beta.env. Optional: T_NUMBER (the claim, 2011001234567),
///      CHECK_T_NUMBERS (comma-separated), EXPECT_URL and EXPECT_DESCRIPTION.
contract CheckClaim is Script {
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)
    bytes4 private constant EAC_UNAUTHORIZED = 0x4b27a133; // EACUnauthorizedAccountRoles(uint256,uint256,address)

    function run() external {
        EnsV2 memory ens = EnsV2Lib.load();
        IUserRegistry claims = IUserRegistry(vm.envAddress("CLAIMS_REGISTRY"));
        ClaimedPayeeResolver resolver = ClaimedPayeeResolver(vm.envAddress("CLAIMS_RESOLVER"));
        IPayeeRegistry registry = IPayeeResolverRegistry(ens.ethRegistry.getResolver("payee")).registry();
        require(
            ens.ethRegistry.getSubregistry("payee") == address(claims),
            "payee.eth's subregistry is not CLAIMS_REGISTRY"
        );
        require(
            IVerifiableFactory(vm.envAddress("ENS_VERIFIABLE_FACTORY")).verifyContract(address(claims))
                == vm.envAddress("ENS_USER_REGISTRY_IMPL"),
            "CLAIMS_REGISTRY is not a VerifiableFactory UserRegistry"
        );
        require(
            address(resolver.payees()) == ens.ethRegistry.getResolver("payee"),
            "claims resolver forwards elsewhere"
        );
        require(resolver.registry() == registry, "claims resolver reads another registry");
        uint64 tNumber = SafeCast.toUint64(vm.envOr("T_NUMBER", uint256(2011001234567)));
        address company = registry.payeeOf(tNumber).controller;
        IPermissionedResolver profile = _checkClaim(claims, resolver, tNumber, company);
        _checkProfile(ens, tNumber);
        _checkCompanyLimits(ens, claims, profile, registry, tNumber, company);
        _checkResolution(ens, registry);
    }

    function _checkClaim(IUserRegistry claims, ClaimedPayeeResolver resolver, uint64 tNumber, address company)
        private
        view
        returns (IPermissionedResolver profile)
    {
        string memory label = _label(tNumber);
        uint256 id = EnsV2Lib.labelId(label);
        require(claims.getOwner(id) == company, "the token is not owned by the registry's controller");
        require(claims.getResolver(label) == address(resolver), "the claimed name uses another resolver");
        require(resolver.claimantOf(tNumber) == company, "the profile belongs to another claimant");
        // EAC hasRoles needs every bit, so each registry role the ETHRegistrar would give an owner is checked alone.
        uint256[5] memory bits =
            [uint256(1 << 20), (1 << 20) << 128, 1 << 24, (1 << 24) << 128, (1 << 28) << 128];
        for (uint256 i; i < bits.length; i++) {
            require(!claims.hasRoles(id, bits[i], company), "the company holds a role on its token");
        }
        profile = IPermissionedResolver(address(resolver.profileOf(tNumber)));
        require(address(profile) != address(0), "no profile resolver");
        require(!profile.hasAssignees(0, AgentNsLib.ROLE_SET_ADDRESS), "someone holds the address role");
        require(
            !profile.hasAssignees(0, AgentNsLib.ROLE_SET_ADDRESS_ADMIN), "someone can grant the address role"
        );
        require(
            profile.roles(0, company) == AgentNsLib.ROLE_SET_TEXT, "the company holds more than the text role"
        );
        console.log("%s.payee.eth: token owned by %s, profile %s", label, company, address(profile));
    }

    function _checkProfile(EnsV2 memory ens, uint64 tNumber) private view {
        string memory name = string.concat(_label(tNumber), ".payee.eth");
        string memory url = _text(ens, name, "url");
        string memory description = _text(ens, name, "description");
        require(_eq(url, vm.envOr("EXPECT_URL", url)), "url differs from EXPECT_URL");
        require(_eq(description, vm.envOr("EXPECT_DESCRIPTION", description)), "description differs");
        console.log("  url = %s | description = %s (set by the company)", url, description);
    }

    /// @dev Simulated from the company's address against live state, then rolled back.
    function _checkCompanyLimits(
        EnsV2 memory ens,
        IUserRegistry claims,
        IPermissionedResolver profile,
        IPayeeRegistry registry,
        uint64 tNumber,
        address company
    ) private {
        string memory name = string.concat(_label(tNumber), ".payee.eth");
        bytes memory dns = EnsV2Lib.dnsEncode(name);
        uint256 snapshot = vm.snapshotState();
        _expectDenied(
            address(profile),
            company,
            abi.encodeCall(IPermissionedResolver.setAddress, (dns, 60, abi.encodePacked(company)))
        );
        _expectDenied(
            address(claims),
            company,
            abi.encodeCall(IUserRegistry.setResolver, (EnsV2Lib.labelId(_label(tNumber)), company))
        );
        vm.startPrank(company);
        profile.setText(dns, "name", "Scam K.K.");
        profile.setText(dns, "meigi.status", "active");
        vm.stopPrank();
        require(
            _eq(_text(ens, name, "name"), _publishedName(registry, tNumber)), "the company renamed itself"
        );
        require(
            _eq(_text(ens, name, "meigi.status"), _status(registry, tNumber)), "the company masked its status"
        );
        vm.revertToState(snapshot);
        console.log("  the company cannot set an address, re-point its name, or override name / meigi.status");
    }

    /// @dev Stock resolution equals registry truth for every listed T-number, claimed or not.
    function _checkResolution(EnsV2 memory ens, IPayeeRegistry registry) private view {
        uint256[] memory list = new uint256[](4);
        (list[0], list[1], list[2], list[3]) = (2011001234567, 3999905000001, 2010401000001, 9999999999999);
        list = vm.envOr("CHECK_T_NUMBERS", ",", list);
        for (uint256 i; i < list.length; i++) {
            uint64 t = SafeCast.toUint64(list[i]);
            string memory name = string.concat(_label(t), ".payee.eth");
            (bytes memory out,) = ens.universalResolver
                .resolve(EnsV2Lib.dnsEncode(name), abi.encodeWithSelector(ADDR, vm.ensNamehash(name)));
            address resolved = abi.decode(out, (address));
            require(
                resolved == registry.payoutOf(t), string.concat(name, ": addr disagrees with the registry")
            );
            require(_eq(_text(ens, name, "name"), _publishedName(registry, t)), string.concat(name, ": name"));
            require(
                _eq(_text(ens, name, "meigi.status"), _status(registry, t)), string.concat(name, ": status")
            );
            console.log("  %s -> %s [%s]", name, resolved, _status(registry, t));
        }
    }

    function _expectDenied(address target, address account, bytes memory call) private {
        vm.prank(account);
        (bool ok, bytes memory err) = target.call(call);
        // forge-lint: disable-next-line(unsafe-typecast)
        require(
            !ok && err.length >= 4 && bytes4(err) == EAC_UNAUTHORIZED,
            "the company's call was not refused by EAC"
        );
    }

    function _publishedName(IPayeeRegistry registry, uint64 t) private view returns (string memory) {
        IPayeeRegistry.PayeeView memory payee = registry.payeeOf(t);
        return payee.status == IPayeeRegistry.Status.Active ? payee.legalName : "";
    }

    function _status(IPayeeRegistry registry, uint64 t) private view returns (string memory) {
        IPayeeRegistry.Status s = registry.payeeOf(t).status;
        if (s == IPayeeRegistry.Status.Active) return "active";
        return s == IPayeeRegistry.Status.Disputed ? "disputed" : "";
    }

    function _text(EnsV2 memory ens, string memory name, string memory key)
        private
        view
        returns (string memory)
    {
        bytes memory call = abi.encodeWithSelector(TEXT, vm.ensNamehash(name), key);
        (bytes memory out,) = ens.universalResolver.resolve(EnsV2Lib.dnsEncode(name), call);
        return abi.decode(out, (string));
    }

    function _label(uint64 t) private pure returns (string memory) {
        return string.concat("t", vm.toString(uint256(t)));
    }

    function _eq(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
