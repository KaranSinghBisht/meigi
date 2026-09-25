// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OfficerQuorum} from "../../src/registry/OfficerQuorum.sol";
import {PayeeRegistry} from "../../src/registry/PayeeRegistry.sol";

/// Cross-language test vector: services/verifier/test/approvals.test.ts computes the same digest with viem.
/// If either side changes the EIP-712 encoding, one of the two tests fails.
contract ApprovalDigestVectorTest is Test {
    address internal constant REGISTRY_AT = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    uint64 internal constant T_NUMBER = 2011001234567;
    uint256 internal constant DEADLINE = 1_790_000_000;
    bytes32 internal constant EXPECTED = 0xe49b7b2644639abe74faa9cdf0723a96d06b4d1b31ac7638cd572a0e86391586;

    function test_approvalDigestMatchesTheTypeScriptVector() public {
        vm.chainId(11155111);
        deployCodeTo("PayeeRegistry.sol:PayeeRegistry", abi.encode(address(this), uint64(72 hours)), REGISTRY_AT);
        PayeeRegistry registry = PayeeRegistry(REGISTRY_AT);

        bytes32[] memory officers = new bytes32[](2);
        officers[0] = bytes32(uint256(0xA1));
        officers[1] = bytes32(uint256(0xB2));
        bytes32 target = bytes32(uint256(uint160(0x000000000000000000000000000000000000bEEF)));

        bytes32 digest =
            registry.approvalDigest(T_NUMBER, OfficerQuorum.Action.PayoutChange, target, officers, DEADLINE);
        emit log_named_bytes32("digest", digest);
        assertEq(digest, EXPECTED);
    }
}
