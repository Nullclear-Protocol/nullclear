import { describe, it, expect } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import { app as arbiterApp } from "@nullclear/worker-arbiter";
import {
  nullclearPlugin,
  createNullClearPlugin,
  assertSafeElizaSwap,
  NullClearSecurityBlockError,
  extractTokenTargets,
  type ElizaRuntimeLike
} from "../src/index.js";

describe("@nullclear/plugin-eliza Test Suite", () => {
  const arbiterKey = generatePrivateKey();
  const payerKey = generatePrivateKey();

  const mockArbiterFetch: typeof fetch = async (input, init) => {
    const urlStr =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = urlStr.replace("https://api.nullclear.dev", "");
    return arbiterApp.fetch(
      new Request(`https://api.nullclear.dev${path}`, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body as any
      }),
      { ARBITER_PRIVATE_KEY: arbiterKey }
    );
  };

  const runtime: ElizaRuntimeLike = {
    getSetting: (k) => (k === "NULLCLEAR_PRIVATE_KEY" ? payerKey : undefined)
  };

  it("exports standard ElizaOS Plugin shape with 3 actions and 1 provider", () => {
    expect(nullclearPlugin.name).toBe("@nullclear/plugin-eliza");
    expect(nullclearPlugin.actions.map((a) => a.name)).toEqual([
      "NULLCLEAR_SCAN_TOKEN",
      "NULLCLEAR_SCAN_BATCH",
      "NULLCLEAR_GUARD_CALLDATA"
    ]);
    expect(nullclearPlugin.providers.map((p) => p.name)).toEqual(["nullclear-firewall-context"]);
  });

  it("scans Solana and Base tokens cleanly via NULLCLEAR_SCAN_TOKEN and provider context", async () => {
    const plugin = createNullClearPlugin({ fetch: mockArbiterFetch, defaultChain: "solana" });
    const scanAction = plugin.actions.find((a) => a.name === "NULLCLEAR_SCAN_TOKEN")!;

    const msg = {
      content: {
        text: "Please check Solana token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v before I swap"
      }
    };

    expect(await scanAction.validate(runtime, msg)).toBe(true);
    let callbackText = "";
    const result = await scanAction.handler(runtime, msg, undefined, undefined, async (res) => {
      callbackText = res.text;
    });

    expect(result.success).toBe(true);
    expect(result.values?.recommendedAgentAction).toBe("EXECUTE_SAFE");
    expect(result.values?.chain).toBe("solana");
    expect(result.values?.address).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(callbackText).toContain("[NullClear]");

    const providerOut = await plugin.providers[0].get(runtime, msg);
    expect(providerOut.text).toContain("NullClear Pre-Flight Firewall Advisory");
    expect(providerOut.values?.recommendedAgentAction).toBe("EXECUTE_SAFE");
  });

  it("executes NULLCLEAR_SCAN_BATCH across multiple chains and catches drainer calldata", async () => {
    const plugin = createNullClearPlugin({ fetch: mockArbiterFetch });
    const batchAction = plugin.actions.find((a) => a.name === "NULLCLEAR_SCAN_BATCH")!;
    const calldataAction = plugin.actions.find((a) => a.name === "NULLCLEAR_GUARD_CALLDATA")!;

    const batchMsg = {
      content: {
        text: "Scan tokens 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 and EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v for safety"
      }
    };
    expect(await batchAction.validate(runtime, batchMsg)).toBe(true);
    const batchRes = await batchAction.handler(runtime, batchMsg);
    expect(batchRes.success).toBe(true);
    expect(batchRes.values?.recommendedAgentAction).toBe("EXECUTE_SAFE");

    const calldataMsg = {
      content: {
        text: "Decode calldata 0x095ea7b3000000000000000000000000b586efcca41df27ad3873beca54da0c30bf04d5cffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff before signing"
      }
    };
    expect(await calldataAction.validate(runtime, calldataMsg)).toBe(true);
    const calldataRes = await calldataAction.handler(runtime, calldataMsg);
    expect(calldataRes.success).toBe(true);
    expect(calldataRes.values?.recommendedAgentAction).toBe("ABORT_DRAINER_APPROVAL");
  });

  it("assertSafeElizaSwap blocks ABORT_CRITICAL_TRAP honeypots cleanly and avoids false-positive English word extraction", async () => {
    const targets = extractTokenTargets("Check how safely this normal sentence behaves on Base today");
    expect(targets).toHaveLength(0);

    const trapAddr = "0xdead00000000000000000000000000000000cafe";
    const trapFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          address: trapAddr,
          chain: "base",
          symbol: "RUG",
          name: "Rug Pull",
          llmDigest: "99% sell tax honeypot.",
          recommendedAgentAction: "ABORT_CRITICAL_TRAP",
          score: 4,
          verdict: "CRITICAL TRAP",
          evidence: { isHoneypot: true }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    await expect(
      assertSafeElizaSwap(trapAddr, {
        chain: "base",
        fetch: trapFetch
      })
    ).rejects.toThrowError(NullClearSecurityBlockError);
  });
});
