import { NullClearClient } from "../packages/x402-arbiter/src/client.js";

async function main() {
  const key = (process.env.CANARY_KEY || process.env.SYNC_BUYER_PRIVATE_KEY || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error("Set $env:CANARY_KEY=\"0x...\" (Base Mainnet wallet with >= $0.01 USDC) and re-run.");
    process.exit(1);
  }

  const baseUrl = (process.env.NULLCLEAR_API_URL || "https://api.nullclear.dev").replace(/\/$/, "");
  const client = new NullClearClient({
    arbiterUrl: baseUrl,
    signer: key as `0x${string}`
  });

  console.log(`Running live $0.01 USDC x402 canary against ${baseUrl}...`);

  const vf = await (client as any).requestJsonWithAutoX402(
    "/v1/bazaar/verified-fetch?url=https://api.coinbase.com/v2/prices/ETH-USD/spot"
  );
  console.log("1. verified-fetch:", {
    verified: vf.verified,
    tx: vf.settlementTransaction,
    data: vf.data
  });

  const audit = await (client as any).requestJsonWithAutoX402("/v1/bazaar/audit?agentId=124595");
  console.log("2. audit:", {
    agentId: audit.agentId,
    trustScore: audit.trustScore,
    tx: audit.settlementTransaction
  });
}

main().catch((err) => {
  console.error("Canary failed:", err);
  process.exit(1);
});
