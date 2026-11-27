import { describe, it, expect } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { app as arbiterApp } from "@nullclear/worker-arbiter";
import {
  NullClearActionProvider,
  nullclearActionProvider,
  assertSafeSwap,
  createNullClearWalletGuard,
  NullClearSecurityBlockError,
  type AgentKitWalletProviderLike
} from "../src/index.js";

describe("@nullclear/agentkit ActionProvider Test Suite", () => {
  const arbiterKey = generatePrivateKey();
  const walletKey = generatePrivateKey();
  const walletAccount = privateKeyToAccount(walletKey);

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
      { ARBITER_PRIVATE_KEY: arbiterKey, ENVIRONMENT: "development" }
    );
  };

  function createMockWallet(protocolFamily = "evm", networkId = "base-mainnet"): AgentKitWalletProviderLike {
    return {
      getAddress: () => walletAccount.address,
      getNetwork: () => ({ protocolFamily, networkId, chainId: protocolFamily === "svm" ? "solana" : "8453" }),
      signTypedData: (typedData: any) => walletAccount.signTypedData(typedData)
    };
  }

  it("satisfies AgentKit ActionProvider contract and supports EVM and Solana networks", () => {
    const provider = nullclearActionProvider({ fetch: mockArbiterFetch });
    expect(provider).toBeInstanceOf(NullClearActionProvider);
    expect(provider.name).toBe("nullclear");
    expect(provider.supportsNetwork({ protocolFamily: "evm", networkId: "base-mainnet" })).toBe(true);
    expect(provider.supportsNetwork({ protocolFamily: "svm", networkId: "solana-mainnet" })).toBe(true);

    const actions = provider.getActions(createMockWallet());
    const actionNames = actions.map((a) => a.name);
    expect(actionNames).toEqual([
      "nullclear_preflight_guard",
      "nullclear_scan_token",
      "nullclear_scan_batch",
      "nullclear_decode_calldata",
      "nullclear_simulate_tx"
    ]);
  });

  it("scans Base and Solana USDC tokens via nullclear_scan_token with wallet chain inference", async () => {
    const baseProvider = nullclearActionProvider({ fetch: mockArbiterFetch });
    const baseActions = baseProvider.getActions(createMockWallet("evm", "base-mainnet"));
    const scanAction = baseActions.find((a) => a.name === "nullclear_scan_token")!;

    const baseRaw = await scanAction.invoke({
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    });
    const baseJson = JSON.parse(baseRaw);
    expect(baseJson.recommendedAgentAction).toBe("EXECUTE_SAFE");
    expect(baseJson.chain).toBe("base");
    expect(baseJson.score).toBeGreaterThanOrEqual(95);
    expect(baseJson.summary).toContain("[NullClear]");

    const solActions = baseProvider.getActions(createMockWallet("svm", "solana-mainnet"));
    const solScan = solActions.find((a) => a.name === "nullclear_scan_token")!;
    const solRaw = await solScan.invoke({
      address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    });
    const solJson = JSON.parse(solRaw);
    expect(solJson.recommendedAgentAction).toBe("EXECUTE_SAFE");
    expect(solJson.chain).toBe("solana");
    expect(solJson.address).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  });

  it("executes nullclear_scan_batch cleanly via x402 auto-payment with AgentKit wallet signer", async () => {
    const provider = nullclearActionProvider({ fetch: mockArbiterFetch });
    const actions = provider.getActions(createMockWallet("evm", "base-mainnet"));
    const batchAction = actions.find((a) => a.name === "nullclear_scan_batch")!;

    const raw = await batchAction.invoke({
      chain: "base",
      tokens: [
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      ]
    });
    const parsed = JSON.parse(raw);
    expect(parsed.recommendedAgentAction).toBe("EXECUTE_SAFE");
    expect(parsed.batchVerdict).toBe("ALL_CLEAR");
    expect(parsed.summaryText).toContain("[NullClear Batch]");
    expect(parsed.results).toHaveLength(2);
  });

  it("blocks unlimited approval drainers before sendTransaction via createNullClearWalletGuard and assertSafeSwap", async () => {
    let forwarded = false;
    const underlyingWallet: AgentKitWalletProviderLike = {
      ...createMockWallet(),
      sendTransaction: async () => {
        forwarded = true;
        return "0xtxhash";
      }
    };

    const guarded = createNullClearWalletGuard(underlyingWallet, {
      fetch: mockArbiterFetch,
      simulateBeforeSend: false
    });

    const unlimitedApproveCalldata =
      "0x095ea7b3000000000000000000000000b586efcca41df27ad3873beca54da0c30bf04d5cffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as `0x${string}`;

    await expect(
      guarded.sendTransaction!({
        to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        data: unlimitedApproveCalldata
      })
    ).rejects.toThrowError(NullClearSecurityBlockError);
    expect(forwarded).toBe(false);

    // Pre-swap helper passes on clean Base USDC
    const safeScan = await assertSafeSwap("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", {
      chain: "base",
      fetch: mockArbiterFetch
    });
    expect(safeScan.recommendedAgentAction).toBe("EXECUTE_SAFE");
  });
});
