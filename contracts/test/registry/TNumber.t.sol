// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TNumber} from "../../src/registry/TNumber.sol";

contract TNumberTest is Test {
    function test_tryParse_acceptsCanonicalLabels() public pure {
        (bool ok, uint64 digits) = TNumber.tryParse("t2011001234567");
        assertTrue(ok);
        assertEq(digits, 2011001234567);

        (ok, digits) = TNumber.tryParse("T2011001234567");
        assertTrue(ok);
        assertEq(digits, 2011001234567);
    }

    function test_tryParse_rejectsEverythingElse() public pure {
        string[7] memory bad = [
            "payee",
            "t201100123456", // 12 digits
            "t20110012345678", // 14 digits
            "x2011001234567", // wrong prefix
            "t0011001234567", // leading zero, so no check digit
            "t20110012345a7", // non-digit
            ""
        ];
        for (uint256 i; i < bad.length; i++) {
            (bool ok, uint64 digits) = TNumber.tryParse(bytes(bad[i]));
            assertFalse(ok, bad[i]);
            assertEq(digits, 0);
        }
    }

    function test_toString_isCanonical() public pure {
        assertEq(TNumber.toString(2011001234567), "T2011001234567");
    }

    function testFuzz_roundTrip(uint64 digits) public pure {
        digits = uint64(bound(digits, TNumber.MIN, TNumber.MAX));
        (bool ok, uint64 parsed) = TNumber.tryParse(bytes(TNumber.toString(digits)));
        assertTrue(ok);
        assertEq(parsed, digits);
    }
}
