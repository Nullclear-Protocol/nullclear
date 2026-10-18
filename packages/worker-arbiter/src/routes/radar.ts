import { Hono } from "hono";
import { getArbiterStore, type Env } from "../env.js";
import { validateTargetUrl } from "../services/ssrf-guard.js";
import {
  canaryProbeEndpoint,
  runEcosystemCrawlAndAudit
} from "../services/ecosystem-crawler.js";
import {
  INDEXER_STATE_KEY,
  syncBaseEip3009Logs
} from "../services/base-eip3009-indexer.js";
import { buildNullClearMetadata } from "../middleware/free-tier.js";

export const radarRouter = new Hono<Env>();

function formatAtomicUsdc(atomic: string | null | undefined): string {
  if (!atomic) return "0.00";
  try {
    const val = Number(atomic) / 1_000_000;
    return val.toFixed(val > 0 && val < 0.01 ? 4 : 2);
  } catch {
    return "0.00";
  }
}

/**
 * POST /v1/radar/crawl - Manually trigger the Ecosystem Canary Auditor & Crawler
 */
radarRouter.post("/crawl", async (c) => {
  const report = await runEcosystemCrawlAndAudit(c.env);
  return c.json({
    success: true,
    ...report,
    _nullclear: buildNullClearMetadata()
  });
});

/**
 * POST /v1/radar/submit-endpoint - Submit an x402 / ERC-8004 endpoint for immediate Canary Audit & Leaderboard listing
 */
radarRouter.post("/submit-endpoint", async (c) => {
  const store = getArbiterStore(c.env);
  let body: Record<string, any> = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON request body" }, 400);
  }

  const rawUrl =
    typeof body.endpointUrl === "string"
      ? body.endpointUrl.trim()
      : typeof body.url === "string"
        ? body.url.trim()
        : "";

  if (!rawUrl) {
    return c.json({ success: false, error: "endpointUrl (or url) is required" }, 400);
  }

  const ssrf = validateTargetUrl(rawUrl, c.env?.ENVIRONMENT);
  if (!ssrf.allowed) {
    return c.json(
      {
        success: false,
        stage: "SSRF_BLOCKED",
        error: ssrf.reason || "Forbidden target URL"
      },
      400
    );
  }

  const category =
    typeof body.category === "string" && body.category.trim() !== ""
      ? body.category.trim().toLowerCase()
      : "data";
  const description =
    typeof body.description === "string" && body.description.trim() !== ""
      ? body.description.trim().slice(0, 400)
      : undefined;
  const agentIdErc8004 =
    body.agentIdErc8004 !== undefined && body.agentIdErc8004 !== null
      ? String(body.agentIdErc8004).trim()
      : null;
  const sellerAddress =
    typeof body.sellerAddress === "string" && /^0x[a-fA-F0-9]{40}$/.test(body.sellerAddress.trim())
      ? body.sellerAddress.trim()
      : null;
  const priceAtomic =
    body.priceAtomic !== undefined && body.priceAtomic !== null && /^\d+$/.test(String(body.priceAtomic).trim())
      ? String(body.priceAtomic).trim()
      : null;

  try {
    const outcome = await canaryProbeEndpoint(
      {
        endpointUrl: rawUrl,
        source: "USER_SUBMITTED",
        agentIdErc8004,
        sellerAddress,
        priceAtomic,
        category,
        description
      },
      store,
      c.env?.ENVIRONMENT
    );

    return c.json(
      {
        success: true,
        probeSuccess: outcome.probeSuccess,
        reason: outcome.reason,
        endpoint: {
          ...outcome.record,
          endpointUrl: outcome.record.endpoint_url,
          originDomain: outcome.record.origin_domain,
          isValidX402: outcome.record.is_valid_x402 === 1,
          latencyMs: outcome.record.latency_ms,
          uptimeScore: outcome.record.uptime_score,
          hallucinationRate: outcome.record.hallucination_rate,
          nullclearProxyUrl: outcome.record.nullclear_proxy_url
        },
        nullclear_proxy_url: outcome.record.nullclear_proxy_url,
        _nullclear: buildNullClearMetadata()
      },
      201
    );
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: err?.message || "Failed to audit endpoint"
      },
      400
    );
  }
});

/**
 * GET /v1/radar/onchain-flows - Base Mainnet USDC EIP-3009 On-Chain Volume Radar
 */
radarRouter.get("/onchain-flows", async (c) => {
  const store = getArbiterStore(c.env);
  const [state, sellers, buyers, recentTransfers, gateways, endpoints] = await Promise.all([
    store.getIndexerState(INDEXER_STATE_KEY),
    store.listOnchainCounterpartyProfiles("SELLER", 50),
    store.listOnchainCounterpartyProfiles("BUYER", 50),
    store.listOnchainEip3009Transfers(50),
    store.listSellerGateways(),
    store.queryIndexedEndpoints({ limit: 200 })
  ]);

  const gatewayBySeller = new Map<string, (typeof gateways)[number]>();
  for (const gw of gateways) {
    gatewayBySeller.set(gw.sellerAddress.toLowerCase(), gw);
  }

  const endpointsBySeller = new Map<string, string[]>();
  for (const ep of endpoints) {
    if (!ep.seller_address) continue;
    const k = ep.seller_address.toLowerCase();
    const arr = endpointsBySeller.get(k) || [];
    arr.push(ep.endpoint_url);
    endpointsBySeller.set(k, arr);
  }

  const topSellers = sellers.map((s) => {
    const claimedGw = gatewayBySeller.get(s.address.toLowerCase());
    const linkedEps = endpointsBySeller.get(s.address.toLowerCase()) || [];
    return {
      ...s,
      total_volume_usdc: formatAtomicUsdc(s.total_volume_atomic),
      is_wash_traded: s.wash_trade_flag === 1,
      claimed_gateway_slug: claimedGw?.slug || null,
      claim_gateway_url: `https://nullclear.dev/leaderboard?claimSeller=${s.address}`,
      shadow_proxy_url: `https://api.nullclear.dev/g/${claimedGw?.slug || s.shadow_gateway_slug}`,
      linked_endpoints: linkedEps
    };
  });

  const activeBuyers = buyers.map((b) => ({
    ...b,
    total_volume_usdc: formatAtomicUsdc(b.total_volume_atomic),
    is_wash_traded: b.wash_trade_flag === 1
  }));

  const micropaymentSettlements = recentTransfers.filter((t) => t.is_micropayment === 1);

  return c.json({
    service: "NullClear Base Mainnet USDC EIP-3009 Volume Radar",
    contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    chainId: 8453,
    last_indexed_block: state?.last_indexed_block || 0,
    lastIndexedBlock: state?.last_indexed_block || 0,
    updatedAt: state?.updated_at || Date.now(),
    summary: {
      totalActiveSellers: topSellers.length,
      cleanVerifiedSellers: topSellers.filter((s) => s.wash_trade_flag === 0).length,
      washTradeFlaggedSellers: topSellers.filter((s) => s.wash_trade_flag === 1).length,
      totalActiveBuyers: activeBuyers.length,
      recentTransfersCount: recentTransfers.length,
      recentMicropaymentsCount: micropaymentSettlements.length
    },
    topSellers,
    activeBuyers,
    recentSettlements: recentTransfers.map((t) => ({
      ...t,
      amount_usdc: formatAtomicUsdc(t.amount_atomic)
    })),
    micropaymentSettlements: micropaymentSettlements.map((t) => ({
      ...t,
      amount_usdc: formatAtomicUsdc(t.amount_atomic)
    })),
    _nullclear: buildNullClearMetadata()
  });
});

/**
 * POST /v1/radar/sync - Trigger immediate incremental Base Mainnet EIP-3009 block sync
 */
radarRouter.post("/sync", async (c) => {
  let body: Record<string, any> = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const fromBlock = typeof body.fromBlock === "number" ? body.fromBlock : undefined;
  const toBlock = typeof body.toBlock === "number" ? body.toBlock : undefined;
  const mockLogs = Array.isArray(body.mockLogs) ? body.mockLogs : undefined;

  const syncResult = await syncBaseEip3009Logs(c.env, {
    fromBlock,
    toBlock,
    mockLogs
  });

  return c.json({
    success: true,
    ...syncResult,
    last_indexed_block: syncResult.lastIndexedBlock,
    _nullclear: buildNullClearMetadata()
  });
});
