/**
 * How Meigi's Sepolia contracts are named inside MultiBaas, shared by the setup script and the agent. Labels are
 * MultiBaas identifiers: lowercase, digits and underscores.
 */

/** The v2 deployment's first block: event indexing starts here. */
export const V2_START_BLOCK = 11781105;

export const CONTRACTS = {
  registry: { label: "meigi_payee_registry", contractName: "PayeeRegistry", alias: "meigi_registry" },
  vault: { label: "meigi_agent_vault", contractName: "AgentVault", alias: "meigi_vault" },
  token: { label: "meigi_mock_jpyc", contractName: "MockJPYC", alias: "meigi_mjpyc" },
} as const;

export const CONTRACT_VERSION = "2";

export const EVENTS = {
  invoicePaid: "InvoicePaid(uint64,address,uint256,bytes32)",
  transfer: "Transfer(address,address,uint256)",
} as const;

const onContract = (alias: string) => ({ fieldType: "contract_address_alias", operator: "equal", value: alias });

/**
 * Event queries, in the format of Curvegrid's own Matsuri sample app. The setup script saves them (so they show in
 * MultiBaas's Event Queries view); the agent runs the same definitions through `POST /queries`.
 */
export const QUERIES = {
  // Every payment the vault made, newest first: InvoicePaid(tNumber, payout, amount, invoiceRef).
  meigi_invoices_paid: {
    events: [
      {
        eventName: "InvoicePaid",
        select: [
          { type: "input", inputIndex: 0, alias: "tnumber" },
          { type: "input", inputIndex: 1, alias: "payout" },
          { type: "input", inputIndex: 2, alias: "amount" },
          { type: "input", inputIndex: 3, alias: "invoiceref" },
          { type: "block_number", alias: "block" },
          { type: "triggered_at", alias: "at" },
          { type: "tx_hash", alias: "txhash" },
        ],
        filter: onContract(CONTRACTS.vault.alias),
      },
    ],
    orderBy: "block",
    order: "DESC",
  },
  // What the vault paid each payee, by T-number.
  meigi_invoices_by_payee: {
    events: [
      {
        eventName: "InvoicePaid",
        select: [
          { type: "input", inputIndex: 0, alias: "tnumber" },
          { type: "input", inputIndex: 2, alias: "total", aggregator: "add" },
        ],
        filter: onContract(CONTRACTS.vault.alias),
      },
    ],
    groupBy: "tnumber",
    orderBy: "total",
    order: "DESC",
  },
  // mJPYC each address has received (vault payments and x402 sales alike): the seller-side view.
  meigi_mjpyc_received: {
    events: [
      {
        eventName: "Transfer",
        select: [
          { type: "input", inputIndex: 1, alias: "payout" },
          { type: "input", inputIndex: 2, alias: "total", aggregator: "add" },
        ],
        filter: onContract(CONTRACTS.token.alias),
      },
    ],
    groupBy: "payout",
    orderBy: "total",
    order: "DESC",
  },
} as const;
