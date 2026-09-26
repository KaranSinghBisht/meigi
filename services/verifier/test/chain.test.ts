import { describe, expect, it } from "vitest";
import { sepolia } from "viem/chains";
import { readTransportFor } from "../src/registry/chain.js";

// sendKnown's own tests moved to broadcast.test.ts, which covers the same decision logic through the real
// broadcast() function chain.ts now uses instead.

describe("readTransportFor", () => {
  it("uses a plain http transport, with viem's normal retry behaviour, when no fallback URL is configured", () => {
    const transport = readTransportFor("https://rpc.example/primary", undefined);
    const config = transport({ chain: sepolia }).config;
    expect(config.type).toBe("http");
    expect(config.retryCount).toBeGreaterThan(0); // viem's own default, untouched
  });

  it("wraps both RPCs in a fallback transport when a fallback URL is configured", () => {
    const transport = readTransportFor("https://rpc.example/primary", "https://rpc.example/fallback");
    expect(transport({ chain: sepolia }).config.type).toBe("fallback");
  });

  it("gives each RPC a short timeout and no built-in retries in fallback mode, so a hang fails over in seconds", () => {
    const transport = readTransportFor("https://rpc.example/primary", "https://rpc.example/fallback");
    const inner = (transport({ chain: sepolia }) as unknown as { value: { transports: { config: { timeout: number; retryCount: number } }[] } })
      .value.transports;
    expect(inner).toHaveLength(2);
    for (const t of inner) {
      expect(t.config.timeout).toBeLessThanOrEqual(5_000);
      expect(t.config.retryCount).toBe(0);
    }
  });
});
