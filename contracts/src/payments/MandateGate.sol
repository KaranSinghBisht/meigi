// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPayeeRegistry} from "../registry/IPayeeRegistry.sol";

/// @dev The AgentVault's one agent call, and the registry it checks payments against.
interface IAgentVault {
    function registry() external view returns (IPayeeRegistry);
    function payInvoice(uint64 tNumber, address expectedPayout, uint256 amount, bytes32 invoiceRef)
        external
        returns (address payout);
}

/// @dev The part of CompanyNamespace a mandate reads.
interface ICompanyNames {
    function registry() external view returns (IPayeeRegistry);
    function answers(uint64 tNumber, string calldata label) external view returns (bool);
    function nameOf(uint64 tNumber, string calldata label)
        external
        view
        returns (address holder, address records, address issuer, uint64 expiry);
}

/// @title MandateGate
/// @notice An AP agent's authority to pay, as an ENS name its company issued: a public, time-boxed and revocable
///         letter of authority (委任状). The gate is the AgentVault's agent, and passes `payInvoice` on only while
///         `<label>.t<principal>.payee.eth` answers (CompanyNamespace.answers: not revoked, expired, blocked, frozen
///         or reset; the company active; still vouched for by the key that issued it) and the caller is that name's
///         holder. The company revokes the name and the agent's next payment reverts; it issues the name to a new key
///         and payments continue under the same name. The vault still checks every payment (approved vendor,
///         registered payout, caps); the mandate only decides who may ask.
contract MandateGate {
    IAgentVault public immutable vault;
    ICompanyNames public immutable names;
    IPayeeRegistry public immutable registry;
    /// @notice The paying company's T-number: its namespace issues the mandate.
    uint64 public immutable principal;
    /// @notice The mandate's label, e.g. "ap" for `ap.t<principal>.payee.eth`.
    string public label;

    error ZeroAddress();
    error RegistryMismatch(address names, address vault);
    error PrincipalNotActive(uint64 principal);
    error MandateNotLive(uint64 principal, string label);
    error NotMandateHolder(address caller, address holder);

    constructor(IAgentVault vault_, ICompanyNames names_, uint64 principal_, string memory label_) {
        if (address(vault_) == address(0) || address(names_) == address(0)) revert ZeroAddress();
        // The mandate and the payments it allows must answer to the same registry.
        IPayeeRegistry namesRegistry = names_.registry();
        if (address(namesRegistry) != address(vault_.registry())) {
            revert RegistryMismatch(address(namesRegistry), address(vault_.registry()));
        }
        vault = vault_;
        names = names_;
        registry = namesRegistry;
        principal = principal_;
        label = label_;
    }

    /// @notice The vault's `payInvoice`, for the mandate's holder only, while the mandate answers.
    function payInvoice(uint64 tNumber, address expectedPayout, uint256 amount, bytes32 invoiceRef)
        external
        returns (address payout)
    {
        address mandateHolder = _liveHolder();
        if (msg.sender != mandateHolder) revert NotMandateHolder(msg.sender, mandateHolder);
        return vault.payInvoice(tNumber, expectedPayout, amount, invoiceRef);
    }

    /// @notice The key the mandate currently authorises, or zero while it doesn't answer.
    function holder() external view returns (address) {
        if (!registry.isActive(principal) || !names.answers(principal, label)) return address(0);
        (address mandateHolder,,,) = names.nameOf(principal, label);
        return mandateHolder;
    }

    function _liveHolder() private view returns (address mandateHolder) {
        if (!registry.isActive(principal)) revert PrincipalNotActive(principal);
        if (!names.answers(principal, label)) revert MandateNotLive(principal, label);
        (mandateHolder,,,) = names.nameOf(principal, label);
    }
}
