import { Hono } from "hono";
import { formatTokenYen, registeredName } from "../chain/format.js";
import type { ChainPort } from "../chain/types.js";
import type { AppDeps } from "../deps.js";

/** The agent's wallet: balance, whether this key is its agent, and the configured vendors' limits. */
export function vaultRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get("/", async (c) => {
    const info = await deps.chain.vaultInfo();
    const { decimals } = info.token;
    const vendors = await Promise.all(deps.vendorTNumbers.map((digits) => vendorEntry(deps.chain, digits, decimals)));
    return c.json({
      chainId: info.chainId,
      vault: info.vault,
      registry: info.registry,
      owner: info.owner,
      agent: info.agent,
      vaultAgent: info.vaultAgent,
      agentAuthorized: info.agent.toLowerCase() === info.vaultAgent.toLowerCase(),
      token: info.token,
      balance: { units: info.balance.toString(), display: formatTokenYen(info.balance, decimals) },
      paused: info.paused,
      vendorDelaySeconds: info.vendorDelay,
      blockNumber: info.blockNumber.toString(),
      vendors,
    });
  });

  return app;
}

async function vendorEntry(chain: ChainPort, digits: string, decimals: number) {
  const { payee, vendor, timestamp } = await chain.vendor(BigInt(digits));
  const yen = (units: bigint) => formatTokenYen(units, decimals);
  const registered = payee.status === "active"; // a disputed payee shows no claimant name and no frozen payout
  return {
    tNumber: `T${digits}`,
    legalName: registeredName(payee),
    status: payee.status,
    registeredPayout: registered ? payee.payout : null,
    changePending: payee.pending !== null, // the queued address is never shown before it lands
    pendingEffectiveAt: payee.effectiveAt,
    approved: vendor.approved,
    approvedPayout: vendor.payout,
    payoutChanged: vendor.approved && registered && vendor.payout?.toLowerCase() !== payee.payout.toLowerCase(),
    activeAt: vendor.approved ? vendor.activeAt : null,
    active: vendor.approved && timestamp >= vendor.activeAt,
    capPerPayment: yen(vendor.capPerPayment),
    capPerPeriod: yen(vendor.capPerPeriod),
    spentInPeriod: yen(vendor.spentInPeriod),
    remainingInPeriod: yen(vendor.remainingInPeriod),
  };
}
