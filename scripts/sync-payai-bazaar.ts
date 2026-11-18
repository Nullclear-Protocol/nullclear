import { NullClearClient } from "../packages/x402-arbiter/src/client.js";

/**
 * Fires 1 settlement per Bazaar endpoint so PayAI Discovery or Coinbase CDP Bazaar
 * refreshes cached prices and indexes all NullClear routes.
 *
 * Usage:
 *   $env:SYNC_BUYER_PRIVATE_KEY="0x..."
 *   npx tsx scripts/sync-payai-bazaar.ts                      # 3 updated routes on PayAI ($0.035)
 *   npx tsx scripts/sync-payai-bazaar.ts --all --facilitator=cdp   # All 7 routes via CDP ($0.060)
 */
async function main() {
  const key = process.env.SYNC_BUYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error("Set SYNC_BUYER_PRIVATE_KEY=0x... (a Base Mainnet wallet holding >= $0.07 USDC) and re-run.");
    process.exit(1);
  }

  const args = new Set(process.argv.slice(2));
  const syncAll = args.has("--all");
  const facilitatorArg = process.argv.find((a) => a.startsWith("--facilitator="));
  const facilitator = facilitatorArg ? facilitatorArg.split("=")[1] : "payai";
  const qsJoin = (base: string) => (facilitator === "cdp" ? `${base}${base.includes("?") ? "&" : "?"}facilitator=cdp` : base);

  const baseUrl = (process.env.NULLCLEAR_API_URL || "https://api.nullclear.dev").replace(/\/$/, "");
  const client = new NullClearClient({
    arbiterUrl: baseUrl,
    signer: key as `0x${string}`
  });

  console.log(`Syncing Bazaar cache against ${baseUrl} (facilitator=${facilitator}, all=${syncAll})...`);

  const oracleRes = await (client as any).requestJsonWithAutoX402(qsJoin("/v1/bazaar/market-oracle?symbol=ETH"));
  console.log("1. market-oracle:", { symbol: oracleRes.symbol, priceUsd: oracleRes.priceUsd, tx: oracleRes.settlementTransaction });

  const auditRes = await (client as any).requestJsonWithAutoX402(qsJoin("/v1/bazaar/audit?agentId=124595"));
  console.log("2. audit:", { agentId: auditRes.agentId, score: auditRes.trustScore, tx: auditRes.settlementTransaction });

  const batchRes = await (client as any).requestJsonWithAutoX402(qsJoin("/v1/bazaar/scan-batch"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chain: "base",
      tokens: [
        { chain: "base", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
        { chain: "base", address: "0x4200000000000000000000000000000000000006" },
        { chain: "solana", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }
      ]
    })
  });
  console.log("3. scan-batch:", {
    recommendedAgentAction: batchRes.recommendedAgentAction,
    evaluated: batchRes.summary?.uniqueEvaluated,
    tx: batchRes.settlementTransaction
  });

  if (syncAll) {
    const tokenSecRes = await (client as any).requestJsonWithAutoX402(
      qsJoin("/v1/bazaar/token-security?address=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
    );
    console.log("4. token-security:", { symbol: tokenSecRes.symbol, tx: tokenSecRes.settlementTransaction });

    const walletRes = await (client as any).requestJsonWithAutoX402(
      qsJoin("/v1/bazaar/wallet-risk?address=0xfd74fF802EA0E735514C070AF04E0D6528deD145")
    );
    console.log("5. wallet-risk:", { score: walletRes.riskScore, tx: walletRes.settlementTransaction });

    const fetchRes = await (client as any).requestJsonWithAutoX402(
      qsJoin("/v1/bazaar/verified-fetch?url=https://api.coinbase.com/v2/prices/ETH-USD/spot")
    );
    console.log("6. verified-fetch:", { status: fetchRes.upstreamStatus, tx: fetchRes.settlementTransaction });

    const verifyRes = await (client as any).requestJsonWithAutoX402(qsJoin("/v1/bazaar/verify"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "124595", schema: { type: "object", required: ["price"] } })
    });
    console.log("7. verify:", { verified: verifyRes.verified, tx: verifyRes.settlementTransaction });
  }

  console.log("\nDone! Check discovery:");
  console.log("  PayAI: https://facilitator.payai.network/discovery/resources?q=nullclear");
  console.log("  CDP:   https://api.cdp.coinbase.com/platform/v2/x402/discovery/search?payTo=0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c");
}

main().catch((err) => {
  console.error("Bazaar sync failed:", err);
  process.exit(1);
});
