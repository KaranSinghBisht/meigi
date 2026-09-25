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
///         pay an approved vendor (by T-number), within that vendor's caps, to the address the owner approved
///         for it, which must also be the registry's active address. No call sends to an arbitrary address,
///         so a fully prompt-injected agent still can't move money anywhere else.
/// @dev Approving a vendor pins its current registry payout. If the registry payout later changes (even
///      through the registry's own timelock), payments stop until the owner re-approves, which restarts
///      `vendorDelay`. Caps use fixed 30-day windows, so up to 2x `capPerPeriod` can move around a window
///      boundary.
contract AgentVault is PayeeGuard, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Vendor {
        address payout; // pinned registry payout; zero = not approved
        uint64 activeAt;
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
    mapping(bytes32 => uint256) private _invoicePaid;

    event AgentSet(address indexed agent);
    event VendorApproved(
        uint64 indexed tNumber, address payout, uint128 capPerPayment, uint128 capPerPeriod, uint64 activeAt
    );
    event VendorRemoved(uint64 indexed tNumber);
    event InvoicePaid(uint64 indexed tNumber, address indexed payout, uint256 amount, bytes32 indexed invoiceRef);
    event Withdrawn(address indexed to, uint256 amount);

    error NotAgent(address caller);
    error VendorNotApproved(uint64 tNumber);
    error VendorNotYetActive(uint64 tNumber, uint64 activeAt);
    error VendorPayoutChanged(uint64 tNumber, address approved, address registered);
    error OverPaymentCap(uint64 tNumber, uint256 amount, uint256 cap);
    error OverPeriodCap(uint64 tNumber, uint256 amount, uint256 remaining);
    error InvoiceAlreadyPaid(uint64 tNumber, bytes32 invoiceRef, uint256 paid);
    error InvalidInvoiceRef();
    error InvalidCaps();
    error RenounceDisabled();

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

    /// @notice Pays one invoice. Checks, in order: vendor approved and active, payee active and matching the
    ///         invoice's address, still the pinned address, caps, and the invoice not paid before.
    /// @param expectedPayout The address printed on the invoice. A mismatch with the registry reverts.
    /// @param invoiceRef The invoice's own id (e.g. keccak of its number). The agent can pay each once per
    ///        vendor; only the owner can add to an invoice that already has a payment.
    function payInvoice(uint64 tNumber, address expectedPayout, uint256 amount, bytes32 invoiceRef)
        external
        onlyAgentOrOwner
        whenNotPaused
        nonReentrant
        returns (address payout)
    {
        if (amount == 0) revert ZeroAmount();
        if (invoiceRef == bytes32(0)) revert InvalidInvoiceRef();
        Vendor storage v = _activeVendor(tNumber);
        payout = _checkedPayout(tNumber, expectedPayout);
        if (payout != v.payout) revert VendorPayoutChanged(tNumber, v.payout, payout);
        _spend(v, tNumber, amount);
        _recordInvoice(tNumber, invoiceRef, amount);
        token.safeTransfer(payout, amount);
        emit InvoicePaid(tNumber, payout, amount, invoiceRef);
    }

    // ------------------------------------------------------------ owner path

    /// @notice Approves or updates a vendor and pins `expectedPayout`, the address the owner reviewed, which must
    ///         be the registry's current payout. New vendors, a new payout and raised caps only apply after
    ///         `vendorDelay`; lowered caps apply at once.
    function approveVendor(uint64 tNumber, address expectedPayout, uint128 capPerPayment, uint128 capPerPeriod)
        external
        onlyOwner
    {
        if (!TNumber.isValid(tNumber)) revert TNumber.InvalidTNumber();
        if (expectedPayout == address(0)) revert ZeroAddress();
        if (capPerPayment == 0 || capPerPayment > capPerPeriod) revert InvalidCaps();
        address current = _checkedPayout(tNumber, expectedPayout);
        Vendor storage v = vendors[tNumber];
        bool raises = v.payout != current || capPerPayment > v.capPerPayment || capPerPeriod > v.capPerPeriod;
        if (raises) v.activeAt = uint64(block.timestamp) + vendorDelay;
        v.payout = current;
        v.capPerPayment = capPerPayment;
        v.capPerPeriod = capPerPeriod;
        emit VendorApproved(tNumber, current, capPerPayment, capPerPeriod, v.activeAt);
    }

    function removeVendor(uint64 tNumber) external onlyOwner {
        if (vendors[tNumber].payout == address(0)) revert VendorNotApproved(tNumber);
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

    /// @notice Disabled: an ownerless vault could never re-approve vendors or recover funds.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ------------------------------------------------------------------ views

    /// @return The total already paid against this invoice reference. Compare it with the invoice total; a
    ///         non-zero amount alone doesn't mean the invoice is settled.
    function invoicePaidAmount(uint64 tNumber, bytes32 invoiceRef) external view returns (uint256) {
        return _invoicePaid[_invoiceKey(tNumber, invoiceRef)];
    }

    /// @return What the vendor can still receive right now (0 if not payable: not active, frozen, or redirected).
    function remainingInPeriod(uint64 tNumber) external view returns (uint256) {
        Vendor storage v = vendors[tNumber];
        if (v.payout == address(0) || block.timestamp < v.activeAt) return 0;
        if (!registry.isActive(tNumber) || registry.payoutOf(tNumber) != v.payout) return 0;
        if (block.timestamp >= uint256(v.periodStart) + PERIOD) return v.capPerPeriod;
        return _remaining(v);
    }

    // --------------------------------------------------------------- internal

    function _activeVendor(uint64 tNumber) private view returns (Vendor storage v) {
        v = vendors[tNumber];
        if (v.payout == address(0)) revert VendorNotApproved(tNumber);
        if (block.timestamp < v.activeAt) revert VendorNotYetActive(tNumber, v.activeAt);
    }

    function _spend(Vendor storage v, uint64 tNumber, uint256 amount) private {
        if (amount > v.capPerPayment) revert OverPaymentCap(tNumber, amount, v.capPerPayment);
        if (block.timestamp >= uint256(v.periodStart) + PERIOD) {
            v.periodStart = uint64(block.timestamp);
            v.spentInPeriod = 0;
        }
        uint256 spent = uint256(v.spentInPeriod) + amount;
        if (spent > v.capPerPeriod) revert OverPeriodCap(tNumber, amount, _remaining(v));
        // casting to 'uint128' is safe because spent <= capPerPeriod, which is a uint128
        // forge-lint: disable-next-line(unsafe-typecast)
        v.spentInPeriod = uint128(spent);
    }

    function _recordInvoice(uint64 tNumber, bytes32 invoiceRef, uint256 amount) private {
        bytes32 key = _invoiceKey(tNumber, invoiceRef);
        uint256 paid = _invoicePaid[key];
        if (paid > 0 && msg.sender != owner()) revert InvoiceAlreadyPaid(tNumber, invoiceRef, paid);
        _invoicePaid[key] = paid + amount;
    }

    /// @dev Saturating: the owner may lower `capPerPeriod` below what was already spent.
    function _remaining(Vendor storage v) private view returns (uint256) {
        return v.capPerPeriod > v.spentInPeriod ? v.capPerPeriod - v.spentInPeriod : 0;
    }

    function _invoiceKey(uint64 tNumber, bytes32 invoiceRef) private pure returns (bytes32) {
        return keccak256(abi.encode(tNumber, invoiceRef));
    }

    function _setAgent(address agent_) private {
        if (agent_ == address(0)) revert ZeroAddress();
        agent = agent_;
        emit AgentSet(agent_);
    }
}
