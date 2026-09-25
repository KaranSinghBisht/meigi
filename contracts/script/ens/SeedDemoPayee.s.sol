// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Script, console} from "forge-std/Script.sol";
import {IPayeeRegistry} from "../../src/registry/IPayeeRegistry.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";

/// @notice Registers the demo payee (the test fixture's T2011001234567, 株式会社メイギ商事) the way the attester
///         does after its NTA, domain and World ID checks. Skips a T-number that is already registered.
/// @dev Env: ATTESTER_PRIVATE_KEY, PAYEE_REGISTRY, PAYEE_CONTROLLER, PAYEE_PAYOUT; optional T_NUMBER,
///      PAYEE_LEGAL_NAME, PAYEE_OFFICERS (comma-separated bytes32, ascending), PAYEE_THRESHOLD (1) and
///      PAYEE_EVIDENCE.
contract SeedDemoPayee is Script {
    function run() external {
        uint256 pk = vm.envUint("ATTESTER_PRIVATE_KEY");
        PayeeRegistry registry = PayeeRegistry(vm.envAddress("PAYEE_REGISTRY"));
        PayeeRegistry.Registration memory r = _registration();
        if (registry.payeeOf(r.tNumber).status != IPayeeRegistry.Status.None) {
            console.log("T%s is already registered; skipping.", r.tNumber);
            return;
        }
        vm.startBroadcast(pk);
        registry.register(r);
        vm.stopBroadcast();
        console.log("Registered T%s with payout %s", r.tNumber, r.payout);
    }

    function _registration() private view returns (PayeeRegistry.Registration memory r) {
        r.tNumber = SafeCast.toUint64(vm.envOr("T_NUMBER", uint256(2011001234567)));
        r.legalName = vm.envOr("PAYEE_LEGAL_NAME", string(unicode"株式会社メイギ商事"));
        r.controller = vm.envAddress("PAYEE_CONTROLLER");
        r.payout = vm.envAddress("PAYEE_PAYOUT");
        r.officers = vm.envOr("PAYEE_OFFICERS", ",", _demoOfficers());
        r.threshold = SafeCast.toUint8(vm.envOr("PAYEE_THRESHOLD", uint256(1)));
        r.evidence = vm.envOr("PAYEE_EVIDENCE", keccak256("nta-exact-match|dns-txt|world-id"));
    }

    /// @dev The test fixture's officer ids. Real ones are hashed World ID session ids from the verifier.
    function _demoOfficers() private pure returns (bytes32[] memory ids) {
        ids = new bytes32[](2);
        ids[0] = bytes32(uint256(0xA1));
        ids[1] = bytes32(uint256(0xB2));
    }
}
