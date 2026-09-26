/**
 * How Meigi's contracts are named inside MultiBaas, shared by the setup script and the agent. Labels are MultiBaas
 * identifiers: lowercase, digits and underscores. A MultiBaas deployment serves one chain (ours: Mizuhiki Awaji).
 */

/** The Sepolia v2 deployment's first block: RPC history and a Sepolia MultiBaas start here. */
export const V2_START_BLOCK = 11781105;

export const CONTRACTS = {
  registry: { label: "meigi_payee_registry", contractName: "PayeeRegistry", alias: "meigi_registry" },
  vault: { label: "meigi_agent_vault", contractName: "AgentVault", alias: "meigi_vault" },
  router: { label: "meigi_pay_router", contractName: "PayRouter", alias: "meigi_router" },
  token: { label: "meigi_jpy_token", contractName: "MockJPYC", alias: "meigi_mjpy" }, // MockJPYC's ABI: a plain ERC-20 to index
} as const;

/** The free MultiBaas plan returns at most 50 rows per event query. */
export const MAX_QUERY_ROWS = 50;

export const CONTRACT_VERSION = "2";

export const EVENTS = {
  invoicePaid: "InvoicePaid(uint64,address,uint256,bytes32)",
  paid: "Paid(uint64,address,address,address,uint256,bytes32)",
  payeeRegistered: "PayeeRegistered(uint64,address,address,string,bytes32)",
  transfer: "Transfer(address,address,uint256)",
} as const;

/** The events each contract's ABI must carry for the queries to decode them. */
export const REQUIRED_EVENTS = { registry: ["PayeeRegistered"], vault: ["InvoicePaid"], router: ["Paid"], token: ["Transfer"] } as const;

const onContract = (alias: string) => ({ fieldType: "contract_address_alias", operator: "equal", value: alias });
/** MultiBaas compares addresses as stored: lowercase. */
const inputIs = (inputIndex: number, value: string) => ({ fieldType: "input", inputIndex, operator: "equal", value: value.toLowerCase() });
const both = (...filters: object[]) => ({ rule: "and", children: filters });

/** The x402 demo's research-agent wallet (public, the same on both chains): its tokens pay for every x402 purchase. */
export const X402_BUYERS: Readonly<Record<number, string>> = {
  11155111: "0x708106dcdee19be75ffcd5df20cbb1b6b3089882", // Sepolia, in mJPYC
  6497: "0x708106dcdee19be75ffcd5df20cbb1b6b3089882", // Mizuhiki Awaji, in MJPY
};

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
  // Every company the registry recorded: T-number, payout and the exact registered name.
  meigi_payees_registered: {
    events: [
      {
        eventName: "PayeeRegistered",
        select: [
          { type: "input", inputIndex: 0, alias: "tnumber" },
          { type: "input", inputIndex: 2, alias: "payout" },
          { type: "input", inputIndex: 3, alias: "legalname" },
          { type: "block_number", alias: "block" },
          { type: "triggered_at", alias: "at" },
          { type: "tx_hash", alias: "txhash" },
        ],
        filter: onContract(CONTRACTS.registry.alias),
      },
    ],
    orderBy: "block",
    order: "DESC",
  },
  // Net MJPY per account, as in Curvegrid's Matsuri sample: each Transfer adds to `to` and subtracts from `from`.
  // Counted from where indexing starts, so it is a balance only for a token deployed after that block.
  meigi_mjpy_balances: {
    events: [
      {
        eventName: "Transfer",
        select: [
          { type: "input", inputIndex: 1, alias: "account" },
          { type: "input", inputIndex: 2, alias: "balance", aggregator: "add" },
        ],
        filter: onContract(CONTRACTS.token.alias),
      },
      {
        eventName: "Transfer",
        select: [
          { type: "input", inputIndex: 0, alias: "account" },
          { type: "input", inputIndex: 2, alias: "balance", aggregator: "subtract" },
        ],
        filter: onContract(CONTRACTS.token.alias),
      },
    ],
    groupBy: "account",
    orderBy: "balance",
    order: "DESC",
  },
  // MJPY each address has received (vault payments and x402 sales alike): the seller-side view.
  meigi_mjpy_received: {
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

/**
 * The queries that depend on one deployment's addresses, filtered inside MultiBaas so its 50-row cap applies after
 * the filter. PayRouter.pay accepts any token, so only mJPYC payments count; and mJPYC is publicly mintable, so
 * only transfers from the x402 buyer count (no buyer on this chain: no transfers query).
 */
export function scopedQueries(scope: { token: string; x402Buyer?: string }) {
  const rows = { orderBy: "block", order: "DESC" } as const;
  return {
    // Pay-by-T-number payments through the PayRouter, in mJPYC: Paid(tNumber, payer, payout, token, amount, ref).
    meigi_router_paid: {
      events: [
        {
          eventName: "Paid",
          select: [
            { type: "input", inputIndex: 0, alias: "tnumber" },
            { type: "input", inputIndex: 2, alias: "payout" },
            { type: "input", inputIndex: 3, alias: "token" },
            { type: "input", inputIndex: 4, alias: "amount" },
            { type: "input", inputIndex: 5, alias: "invoiceref" },
            { type: "block_number", alias: "block" },
            { type: "triggered_at", alias: "at" },
            { type: "tx_hash", alias: "txhash" },
          ],
          filter: both(onContract(CONTRACTS.router.alias), inputIs(3, scope.token)),
        },
      ],
      ...rows,
    },
    // The x402 buyer's mJPYC transfers, newest first: the site's settlements feed keeps those to registered payouts.
    ...(scope.x402Buyer
      ? {
          meigi_mjpy_transfers: {
            events: [
              {
                eventName: "Transfer",
                select: [
                  { type: "input", inputIndex: 0, alias: "sender" },
                  { type: "input", inputIndex: 1, alias: "recipient" },
                  { type: "input", inputIndex: 2, alias: "amount" },
                  { type: "block_number", alias: "block" },
                  { type: "triggered_at", alias: "at" },
                  { type: "tx_hash", alias: "txhash" },
                ],
                filter: both(onContract(CONTRACTS.token.alias), inputIs(0, scope.x402Buyer)),
              },
            ],
            ...rows,
          },
        }
      : {}),
  };
}
