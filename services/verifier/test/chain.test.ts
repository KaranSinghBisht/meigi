import { describe, expect, it, vi } from "vitest";
import { sepolia } from "viem/chains";
import { readTransportFor, sendKnown } from "../src/registry/chain.js";

const HASH = "0xaa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa" as const;

describe("sendKnown", () => {
  it("returns the hash without checking isKnown when the send itself succeeds", async () => {
    const send = vi.fn().mockResolvedValue(HASH);
    const isKnown = vi.fn();
    await expect(sendKnown(HASH, send, isKnown)).resolves.toBe(HASH);
    expect(isKnown).not.toHaveBeenCalled();
  });

  it("still returns the hash when send fails but the RPC(s) already know it - no re-send", async () => {
    const send = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const isKnown = vi.fn().mockResolvedValue(true);
    await expect(sendKnown(HASH, send, isKnown)).resolves.toBe(HASH);
    expect(send).toHaveBeenCalledTimes(1); // never re-sent
    expect(isKnown).toHaveBeenCalledWith(HASH);
  });

  it("re-throws the original transport error when neither RPC knows the hash", async () => {
    const error = new Error("HTTP 403");
    const send = vi.fn().mockRejectedValue(error);
    const isKnown = vi.fn().mockResolvedValue(false);
    await expect(sendKnown(HASH, send, isKnown)).rejects.toBe(error);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("readTransportFor", () => {
  it("uses a plain http transport when no fallback URL is configured", () => {
    const transport = readTransportFor("https://rpc.example/primary", undefined);
    expect(transport({ chain: sepolia }).config.type).toBe("http");
  });

  it("wraps both RPCs in a fallback transport when a fallback URL is configured", () => {
    const transport = readTransportFor("https://rpc.example/primary", "https://rpc.example/fallback");
    expect(transport({ chain: sepolia }).config.type).toBe("fallback");
  });
});
