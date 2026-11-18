import { NullClearClient } from "../packages/x402-arbiter/src/client.js";

/**
 * Fires 1 settlement per updated Bazaar endpoint so PayAI Discovery refreshes cached prices
 * and indexes new endpoints immediately ($0.035 USDC total on Base Mainnet):
 *   1. GET  /v1/bazaar/market-oracle ($0.005 USDC — refreshes from stale $0.01)
 *   2. GET  /v1/bazaar/audit         ($0.005 USDC — refreshes from stale $0.01)
 *   3. POST /v1/bazaar/scan-batch    ($0.025 USDC — registers 15-token batch route in PayAI Bazaar)
 *
 * Usage:
 *   $env:SYNC_BUYER_PRIVATE_KEY="0x..."
 *   npx tsx scripts/sync-payai-bazaar.ts
 */
async function main() {
  const key = process.env.SYNC_BUYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error("Set SYNC_BUYER_PRIVATE_KEY=0x... (a Base Mainnet wallet holding >= $0.04 USDC) and re-run.");
    process.exit(1);
  }

  const baseUrl = (process.env.NULLCLEAR_API_URL || "https://api.nullclear.dev").replace(/\/$/, "");
  const client = new NullClearClient({
    arbiterUrl: baseUrl,
    signer: key as `0x${string}`
  });

  console.log(`Syncing PayAI Bazaar cache against ${baseUrl} ($0.035 USDC total)...`);

  // 1. market-oracle ($0.005)
  const oracleRes = await (client as any).requestJsonWithAutoX402("/v1/bazaar/market-oracle?symbol=ETH");
  console.log("1. market-oracle:", { symbol: oracleRes.symbol, priceUsd: oracleRes.priceUsd, tx: oracleRes.settlementTransaction });

  // 2. audit ($0.005)
  const auditRes = await (client as any).requestJsonWithAutoX402("/v1/bazaar/audit?agentId=124595");
  console.log("2. audit:", { agentId: auditRes.agentId, score: auditRes.trustScore, tx: auditRes.settlementTransaction });

  // 3. scan-batch ($0.025)
  const batchRes = await client.scanBatch([
    { chain: "base", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    { chain: "base", address: "0x4200000000000000000000000000000000000006" },
    { chain: "solana", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }
  ]);
  console.log("3. scan-batch:", {
    recommendedAgentAction: batchRes.recommendedAgentAction,
    evaluated: batchRes.summary?.uniqueEvaluated,
    tx: batchRes.settlementTransaction
  });

  console.log("\nDone! Check https://facilitator.payai.network/discovery/resources?q=nullclear to confirm updated amounts.");
}

main().catch((err) => {
  console.error("PayAI Bazaar sync failed:", err);
  process.exit(1);
});
