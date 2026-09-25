// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";
import {TNumber} from "../registry/TNumber.sol";
import {PayeeGuard} from "./PayeeGuard.sol";

/// @title AgentVault
/// @notice The wallet an AI accounts-payable agent spends from. The agent's key can do exactly one thing:
///         pay an approved vendor (by T-number), within that vendor's caps, to the registry's active address.
///         There is no call that sends to an arbitrary address, so a fully prompt-injected agent still can't
///         move money anywhere else. Vendors, caps and withdrawals belong to the human owner.
contract AgentVault is PayeeGuard, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Vendor {
        uint64 activeAt; // 0 = not approved
        uint64 periodStart;
        uint128 capPerPayment;
        uint128 capPerPeriod;
        uint128 spentInPeriod;
    }

    uint64 public constant PERIOD = 30 days;

    IERC20 public immutable token;
    uint64 public immutable vendorDelay;
    address public agent;

    mapping(uint64 => Vendor) public vendors;
    mapping(bytes32 => bool) private _invoicePaid;

    event AgentSet(address indexed agent);
    event VendorApproved(uint64 indexed tNumber, uint128 capPerPayment, uint128 capPerPeriod, uint64 activeAt);
    event VendorRemoved(uint64 indexed tNumber);
    event InvoicePaid(uint64 indexed tNumber, address indexed payout, uint256 amount, bytes32 indexed invoiceRef);
    event Withdrawn(address indexed to, uint256 amount);

    error NotAgent(address caller);
    error VendorNotApproved(uint64 tNumber);
    error VendorNotYetActive(uint64 tNumber, uint64 activeAt);
    error OverPaymentCap(uint64 tNumber, uint256 amount, uint256 cap);
    error OverPeriodCap(uint64 tNumber, uint256 amount, uint256 remaining);
    error InvoiceAlreadyPaid(uint64 tNumber, bytes32 invoiceRef);
    error InvalidInvoiceRef();
    error InvalidCaps();

    modifier onlyAgentOrOwner() {
        if (msg.sender != agent && msg.sender != owner()) revert NotAgent(msg.sender);
        _;
    }

    constructor(address owner_, address agent_, IERC20 token_, IPayeeRegistry registry_, uint64 vendorDelay_)
        PayeeGuard(registry_)
        Ownable(owner_)
    {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
        vendorDelay = vendorDelay_;
        _setAgent(agent_);
    }

    // ------------------------------------------------------------ agent path

    /// @notice Pays one invoice. Checks run in this order: vendor approved, payee active and address match,
    ///         caps, then not already paid.
    /// @param expectedPayout The address printed on the invoice. A mismatch with the registry reverts.
    /// @param invoiceRef The invoice's own id (e.g. keccak of its number); each is payable once per vendor.
    function payInvoice(uint64 tNumber, address expectedPayout, uint256 amount, bytes32 invoiceRef)
        external
        onlyAgentOrOwner
        whenNotPaused
        nonReentrant
        returns (address payout)
    {
        if (amount == 0) revert ZeroAmount();
        if (invoiceRef == bytes32(0)) revert InvalidInvoiceRef();
        _requireVendorActive(tNumber);
        payout = _checkedPayout(tNumber, expectedPayout);
        _spend(tNumber, amount);
        bytes32 key = keccak256(abi.encode(tNumber, invoiceRef));
        if (_invoicePaid[key]) revert InvoiceAlreadyPaid(tNumber, invoiceRef);
        _invoicePaid[key] = true;
        token.safeTransfer(payout, amount);
        emit InvoicePaid(tNumber, payout, amount, invoiceRef);
    }

    // ------------------------------------------------------------ owner path

    /// @notice Approves or updates a vendor. New vendors and raised caps only apply after `vendorDelay`;
    ///         lowered caps apply at once.
    function approveVendor(uint64 tNumber, uint128 capPerPayment, uint128 capPerPeriod) external onlyOwner {
        if (!TNumber.isValid(tNumber)) revert TNumber.InvalidTNumber();
        if (capPerPayment == 0 || capPerPayment > capPerPeriod) revert InvalidCaps();
        Vendor storage v = vendors[tNumber];
        bool raises = v.activeAt == 0 || capPerPayment > v.capPerPayment || capPerPeriod > v.capPerPeriod;
        if (raises) v.activeAt = uint64(block.timestamp) + vendorDelay;
        v.capPerPayment = capPerPayment;
        v.capPerPeriod = capPerPeriod;
        emit VendorApproved(tNumber, capPerPayment, capPerPeriod, v.activeAt);
    }

    function removeVendor(uint64 tNumber) external onlyOwner {
        if (vendors[tNumber].activeAt == 0) revert VendorNotApproved(tNumber);
        delete vendors[tNumber];
        emit VendorRemoved(tNumber);
    }

    function setAgent(address agent_) external onlyOwner {
        _setAgent(agent_);
    }

    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ------------------------------------------------------------------ views

    function isInvoicePaid(uint64 tNumber, bytes32 invoiceRef) external view returns (bool) {
        return _invoicePaid[keccak256(abi.encode(tNumber, invoiceRef))];
    }

    /// @return What the vendor can still receive in the current period (0 if not active).
    function remainingInPeriod(uint64 tNumber) external view returns (uint256) {
        Vendor storage v = vendors[tNumber];
        if (v.activeAt == 0 || block.timestamp < v.activeAt) return 0;
        if (block.timestamp >= uint256(v.periodStart) + PERIOD) return v.capPerPeriod;
        return v.capPerPeriod - v.spentInPeriod;
    }

    // --------------------------------------------------------------- internal

    function _requireVendorActive(uint64 tNumber) private view {
        Vendor storage v = vendors[tNumber];
        if (v.activeAt == 0) revert VendorNotApproved(tNumber);
        if (block.timestamp < v.activeAt) revert VendorNotYetActive(tNumber, v.activeAt);
    }

    function _spend(uint64 tNumber, uint256 amount) private {
        Vendor storage v = vendors[tNumber];
        if (amount > v.capPerPayment) revert OverPaymentCap(tNumber, amount, v.capPerPayment);
        if (block.timestamp >= uint256(v.periodStart) + PERIOD) {
            v.periodStart = uint64(block.timestamp);
            v.spentInPeriod = 0;
        }
        uint256 spent = uint256(v.spentInPeriod) + amount;
        if (spent > v.capPerPeriod) revert OverPeriodCap(tNumber, amount, v.capPerPeriod - v.spentInPeriod);
        // casting to 'uint128' is safe because spent <= capPerPeriod, which is a uint128
        // forge-lint: disable-next-line(unsafe-typecast)
        v.spentInPeriod = uint128(spent);
    }

    function _setAgent(address agent_) private {
        if (agent_ == address(0)) revert ZeroAddress();
        agent = agent_;
        emit AgentSet(agent_);
    }
}
