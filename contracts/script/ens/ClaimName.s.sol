// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Script, console} from "forge-std/Script.sol";
import {ClaimedPayeeResolver, IExtendedResolver} from "../../src/ens/ClaimedPayeeResolver.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {AgentNsLib, Grant, IPermissionedResolver, IUserRegistry, IVerifiableFactory} from "./AgentNs.sol";
import {EnsV2, EnsV2Lib} from "./EnsV2.sol";

interface IPayeeResolverRegistry {
    function registry() external view returns (IPayeeRegistry);
}

/// @notice Lets a verified company claim `t<T-number>.payee.eth` as an ENSv2 token and edit its own profile, while its
///         money records stay bound to the PayeeRegistry.
///         - `deploy()`: deploys the claims registry S (a UserRegistry that Meigi manages) and ClaimedPayeeResolver.
///         - `attach()`: makes S payee.eth's subregistry. Unclaimed names still resolve through the wildcard.
///         - `claim()`: gives the company its own PermissionedResolver (ROLE_SET_TEXT for the company; no account
///           ever holds ROLE_SET_ADDRESS) and mints `t<T>` in S to the company's registry controller. The token
///           has no roles, so the company can't redirect its name.
///         - `profile()`: signed by the company, sets its url, description and/or avatar.
///         - `detach()`: rolls back to the pure-data setup in one transaction.
/// @dev Env: DEPLOYER_PRIVATE_KEY (or, on a fork, the unlocked DEPLOYER_ADDRESS), plus deployments/beta.env. After
///      deploy: CLAIMS_REGISTRY and CLAIMS_RESOLVER. Optional: T_NUMBER (2011001234567), COMPANY_FUND_WEI (tops up the
///      company key), COMPANY_PRIVATE_KEY or COMPANY_ADDRESS, and PROFILE_URL, PROFILE_DESCRIPTION and PROFILE_AVATAR
///      (each optional; at least one).
contract ClaimName is Script {
    string private constant PARENT = "payee";

    function deploy() external {
        EnsV2 memory ens = EnsV2Lib.load();
        address deployer = EnsV2Lib.signer("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        address payees = ens.ethRegistry.getResolver(PARENT);
        require(EnsV2Lib.supportsExtendedResolver(payees), "payee.eth has no ENSIP-10 resolver");
        require(EnsV2Lib.servesParent(payees, PARENT), "payee.eth's resolver is bound to another parent");
        IPayeeRegistry registry = IPayeeResolverRegistry(payees).registry();
        address claims = EnsV2Lib.envAddressOrZero("CLAIMS_REGISTRY");
        address resolver = EnsV2Lib.envAddressOrZero("CLAIMS_RESOLVER");
        bytes memory init = abi.encodeCall(IUserRegistry.initialize, (_grant(deployer, AgentNsLib.ALL_ROLES)));
        uint256 salt = uint256(keccak256(abi.encode(deployer, block.number, block.timestamp, "payee-claims")));

        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        if (claims == address(0)) {
            claims = _factory().deployProxy(vm.envAddress("ENS_USER_REGISTRY_IMPL"), salt, init);
        }
        if (resolver == address(0)) {
            bytes memory parentDns = EnsV2Lib.dnsEncode(string.concat(PARENT, ".eth"));
            resolver =
                address(new ClaimedPayeeResolver(IExtendedResolver(payees), registry, parentDns, deployer));
        }
        (address canonicalParent,) = IUserRegistry(claims).getParent();
        if (canonicalParent != address(ens.ethRegistry)) {
            IUserRegistry(claims).setParent(address(ens.ethRegistry), PARENT);
        }
        vm.stopBroadcast();

        require(
            _factory().verifyContract(claims) == vm.envAddress("ENS_USER_REGISTRY_IMPL"), "claims registry"
        );
        require(address(ClaimedPayeeResolver(resolver).payees()) == payees, "resolver forwards elsewhere");
        require(ClaimedPayeeResolver(resolver).registry() == registry, "resolver reads another registry");
        console.log("CLAIMS_REGISTRY=%s", claims);
        console.log("CLAIMS_RESOLVER=%s", resolver);
    }

    /// @notice Points payee.eth's subregistry at the claims registry. Unclaimed names still hit the wildcard.
    function attach() external {
        _setSubregistry(vm.envAddress("CLAIMS_REGISTRY"));
    }

    /// @notice Rollback: payee.eth goes back to the pure-data setup (no subregistry).
    function detach() external {
        _setSubregistry(address(0));
    }

    function claim() external {
        EnsV2 memory ens = EnsV2Lib.load();
        IUserRegistry claims = IUserRegistry(vm.envAddress("CLAIMS_REGISTRY"));
        ClaimedPayeeResolver resolver = ClaimedPayeeResolver(vm.envAddress("CLAIMS_RESOLVER"));
        require(ens.ethRegistry.getSubregistry(PARENT) == address(claims), "run attach first");
        uint64 tNumber = SafeCast.toUint64(vm.envOr("T_NUMBER", uint256(2011001234567)));
        address company = _activeController(ens, tNumber);
        address deployer = EnsV2Lib.signer("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        string memory label = string.concat("t", vm.toString(uint256(tNumber)));
        uint256 fund = vm.envOr("COMPANY_FUND_WEI", uint256(0));

        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        if (company.balance < fund) _send(company, fund - company.balance);
        if (address(resolver.profileOf(tNumber)) == address(0)) {
            resolver.setProfile(
                tNumber, IExtendedResolver(_deployProfile(deployer, company, tNumber)), company
            );
        }
        if (claims.getOwner(EnsV2Lib.labelId(label)) == address(0)) {
            claims.register(
                label,
                company,
                address(0),
                address(resolver),
                0,
                ens.ethRegistry.getExpiry(EnsV2Lib.labelId(PARENT))
            );
        }
        vm.stopBroadcast();

        require(claims.getOwner(EnsV2Lib.labelId(label)) == company, "token owner is not the company");
        require(claims.getResolver(label) == address(resolver), "claimed name uses another resolver");
        console.log("%s.payee.eth claimed by %s", label, company);
        console.log("PROFILE_RESOLVER=%s", address(resolver.profileOf(tNumber)));
    }

    /// @notice Signed by the company: its own profile records.
    function profile() external {
        ClaimedPayeeResolver resolver = ClaimedPayeeResolver(vm.envAddress("CLAIMS_RESOLVER"));
        uint64 tNumber = SafeCast.toUint64(vm.envOr("T_NUMBER", uint256(2011001234567)));
        IPermissionedResolver own = IPermissionedResolver(address(resolver.profileOf(tNumber)));
        require(address(own) != address(0), "run claim first");
        bytes memory name =
            EnsV2Lib.dnsEncode(string.concat("t", vm.toString(uint256(tNumber)), ".payee.eth"));

        string[3] memory keys = ["url", "description", "avatar"];
        string[3] memory vars = ["PROFILE_URL", "PROFILE_DESCRIPTION", "PROFILE_AVATAR"];
        uint256 set;
        EnsV2Lib.startBroadcast("COMPANY_PRIVATE_KEY", "COMPANY_ADDRESS");
        for (uint256 i; i < keys.length; i++) {
            if (!vm.envExists(vars[i])) continue;
            own.setText(name, keys[i], vm.envString(vars[i]));
            set++;
        }
        vm.stopBroadcast();
        require(set > 0, "set PROFILE_URL, PROFILE_DESCRIPTION and/or PROFILE_AVATAR");
        console.log("Profile set by the company on %s (%s records)", address(own), set);
    }

    /// @dev The company's own PermissionedResolver: the company may set text; the deployer keeps every other role
    ///      except the address role, which no account ever holds.
    function _deployProfile(address deployer, address company, uint64 tNumber) private returns (address) {
        Grant[] memory grants = new Grant[](2);
        uint256 noAddress = AgentNsLib.ROLE_SET_ADDRESS | AgentNsLib.ROLE_SET_ADDRESS_ADMIN;
        grants[0] = Grant(deployer, AgentNsLib.ALL_ROLES & ~noAddress);
        grants[1] = Grant(company, AgentNsLib.ROLE_SET_TEXT);
        bytes memory init = abi.encodeCall(IPermissionedResolver.initialize, (grants, new bytes[](0)));
        uint256 salt = uint256(keccak256(abi.encode(deployer, tNumber, block.number, "payee-profile")));
        return _factory().deployProxy(vm.envAddress("ENS_PERMISSIONED_RESOLVER_IMPL"), salt, init);
    }

    function _setSubregistry(address claims) private {
        EnsV2 memory ens = EnsV2Lib.load();
        if (claims != address(0)) {
            require(
                _factory().verifyContract(claims) == vm.envAddress("ENS_USER_REGISTRY_IMPL"),
                "CLAIMS_REGISTRY is not a VerifiableFactory UserRegistry"
            );
            (address parent, string memory label) = IUserRegistry(claims).getParent();
            require(
                parent == address(ens.ethRegistry) && keccak256(bytes(label)) == keccak256(bytes(PARENT)),
                "CLAIMS_REGISTRY's canonical parent is not payee.eth"
            );
        }
        EnsV2Lib.startBroadcast("DEPLOYER_PRIVATE_KEY", "DEPLOYER_ADDRESS");
        ens.ethRegistry.setSubregistry(EnsV2Lib.labelId(PARENT), claims);
        vm.stopBroadcast();
        require(ens.ethRegistry.getSubregistry(PARENT) == claims, "subregistry not updated");
        console.log("payee.eth subregistry = %s", claims);
    }

    function _activeController(EnsV2 memory ens, uint64 tNumber) private view returns (address) {
        IPayeeRegistry registry = IPayeeResolverRegistry(ens.ethRegistry.getResolver(PARENT)).registry();
        IPayeeRegistry.PayeeView memory payee = registry.payeeOf(tNumber);
        require(
            payee.status == IPayeeRegistry.Status.Active, "only an active, verified payee can claim its name"
        );
        return payee.controller;
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "funding the company failed");
    }

    function _grant(address account, uint256 roles) private pure returns (Grant[] memory grants) {
        grants = new Grant[](1);
        grants[0] = Grant(account, roles);
    }

    function _factory() private view returns (IVerifiableFactory) {
        return IVerifiableFactory(vm.envAddress("ENS_VERIFIABLE_FACTORY"));
    }
}
