#!/usr/bin/env tsx
/**
 * STEP 2: Seed All Discovered Live Endpoints into Production Leaderboard
 *
 * 1. Reads discovered live x402 endpoints from `output/leads.json` + live PayAI & Coinbase facilitator catalogs
 *    + explicit discovered ecosystem endpoints (`mcp.toolsnap.app`, `api.402xagent.com`, `x402-trust.com`,
 *      `coinpayportal.com`, `meter.wayleave.dev`).
 * 2. Submits each unique URL to production `POST https://api.nullclear.dev/v1/radar/submit-endpoint`
 *    and triggers `POST https://api.nullclear.dev/v1/radar/crawl` and `POST https://api.nullclear.dev/v1/radar/sync`.
 * 3. Verifies `https://nullclear.dev/leaderboard` and `GET https://api.nullclear.dev/v1/bazaar/directory`.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const LEADS_PATH = path.join(ROOT_DIR, "output", "leads.json");
const PROD_API_BASE = "https://api.nullclear.dev";

interface EndpointCandidate {
  url: string;
  sellerAddress?: string;
  priceAtomic?: string;
  description?: string;
  category?: string;
}

const EXPLICIT_ECOSYSTEM_ENDPOINTS: EndpointCandidate[] = [
  {
    url: "https://mcp.toolsnap.app/mcp",
    description: "ToolSnap MCP Server — Web fetch, extraction, screenshots, PDF & SEO over x402 on Base ($0.02/call)",
    priceAtomic: "20000",
    category: "ai"
  },
  {
    url: "https://api.402xagent.com/v1/products/endpoint-spot-check",
    description: "402xAgent Endpoint Spot-Check — Pre-payment verification oracle for x402 clients",
    priceAtomic: "10000",
    category: "security"
  },
  {
    url: "https://x402-trust.com",
    description: "x402 Trust MCP Discovery & Endpoint Reputation Feed",
    priceAtomic: "10000",
    category: "security"
  },
  {
    url: "https://coinpayportal.com",
    description: "CoinPay x402 AI Crawler Gateway & Metered Pay-Per-Crawl Middleware",
    priceAtomic: "10000",
    category: "web"
  },
  {
    url: "https://meter.wayleave.dev",
    description: "Wayleave Ed25519 RFC 9421 Web Bot Auth & HTTP 402 Agent Traffic Metering Gateway",
    priceAtomic: "10000",
    category: "security"
  }
];

async function fetchFullFacilitatorCatalogs(): Promise<EndpointCandidate[]> {
  const catalogUrls = [
    "https://facilitator.payai.network/discovery/resources",
    "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources"
  ];
  const results: EndpointCandidate[] = [];

  for (const catalogUrl of catalogUrls) {
    try {
      const res = await fetch(catalogUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "NullClear-Arbiter/1.2 (+https://nullclear.dev/leaderboard)"
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const items: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.resources)
          ? data.resources
          : Array.isArray(data?.items)
            ? data.items
            : [];

      for (const item of items.slice(0, 60)) {
        const resUrl =
          typeof item?.resource === "string"
            ? item.resource
            : item?.resource?.url || item?.url || item?.endpoint;
        const firstAccept = Array.isArray(item?.accepts) ? item.accepts[0] : null;
        const payTo = firstAccept?.payTo || item?.payTo || item?.sellerAddress;
        const rawAmount = firstAccept?.amount || firstAccept?.maxAmountRequired || item?.amount;
        const desc =
          item?.resource?.description ||
          firstAccept?.description ||
          item?.description ||
          item?.metadata?.description;

        if (typeof resUrl === "string" && resUrl.startsWith("http")) {
          try {
            const u = new URL(resUrl);
            if (
              !u.hostname.includes("nullclear") &&
              !u.hostname.includes("localhost") &&
              !u.hostname.includes("example.com")
            ) {
              results.push({
                url: resUrl,
                sellerAddress:
                  typeof payTo === "string" && /^0x[a-fA-F0-9]{40}$/.test(payTo)
                    ? payTo
                    : undefined,
                priceAtomic:
                  rawAmount !== undefined && /^\d+$/.test(String(rawAmount))
                    ? String(rawAmount)
                    : "10000",
                description: typeof desc === "string" ? desc.slice(0, 350) : `Live x402 resource on ${u.hostname}`,
                category: "data"
              });
            }
          } catch {
            // ignore invalid URL
          }
        }
      }
    } catch {
      // ignore timeout
    }
  }

  return results;
}

async function main() {
  console.log("================================================================================");
  console.log(" STEP 2: Seeding Discovered Live x402 Endpoints into Production Leaderboard");
  console.log("================================================================================");

  let leadsData: any = {};
  if (fs.existsSync(LEADS_PATH)) {
    leadsData = JSON.parse(fs.readFileSync(LEADS_PATH, "utf8"));
  }

  const catalogResources = await fetchFullFacilitatorCatalogs();
  const byUrl = new Map<string, EndpointCandidate>();

  // 1. Add explicit ecosystem endpoints
  for (const ep of EXPLICIT_ECOSYSTEM_ENDPOINTS) {
    byUrl.set(ep.url, ep);
  }

  // 2. Add GitHub leads liveEndpointUrls from output/leads.json
  const githubLeads: any[] = Array.isArray(leadsData.githubLeads) ? leadsData.githubLeads : [];
  for (const gl of githubLeads) {
    if (typeof gl.liveEndpointUrl === "string" && gl.liveEndpointUrl.startsWith("http")) {
      if (
        !gl.liveEndpointUrl.includes("facilitator.payai.network") &&
        !gl.liveEndpointUrl.includes("paymentauth.org") &&
        !gl.liveEndpointUrl.includes("example.com")
      ) {
        if (!byUrl.has(gl.liveEndpointUrl)) {
          byUrl.set(gl.liveEndpointUrl, {
            url: gl.liveEndpointUrl,
            description: gl.description || `x402 endpoint from ${gl.repoFullName}`,
            priceAtomic: "10000",
            category: gl.role === "seller" ? "data" : "ai"
          });
        }
      }
    }
  }

  // 3. Add facilitator catalog resources from output/leads.json & live fetch
  const sampleFromFile: any[] = Array.isArray(leadsData.facilitatorResourcesSample)
    ? leadsData.facilitatorResourcesSample
    : [];
  for (const item of [...sampleFromFile, ...catalogResources]) {
    if (typeof item?.url === "string" && item.url.startsWith("http") && !byUrl.has(item.url)) {
      byUrl.set(item.url, {
        url: item.url,
        sellerAddress:
          typeof item.payTo === "string" && /^0x[a-fA-F0-9]{40}$/.test(item.payTo)
            ? item.payTo
            : item.sellerAddress,
        priceAtomic: item.priceAtomic || "10000",
        description: item.description,
        category: item.category || "data"
      });
    }
  }

  // Persist the full discovered catalog & domains into output/leads.json for Step 3 M2M handshakes
  const uniqueDomains = Array.from(
    new Set(
      Array.from(byUrl.keys())
        .map((u) => {
          try {
            return new URL(u).hostname.toLowerCase();
          } catch {
            return "";
          }
        })
        .filter(Boolean)
    )
  );
  leadsData.discoveredDomains = uniqueDomains;
  leadsData.facilitatorResourcesSample = Array.from(byUrl.values()).slice(0, 100);
  if (fs.existsSync(LEADS_PATH)) {
    fs.writeFileSync(LEADS_PATH, JSON.stringify(leadsData, null, 2), "utf8");
  }

  const allEndpoints = Array.from(byUrl.values());
  console.log(
    `[Seed] Prepared ${allEndpoints.length} unique live x402 endpoints across ${uniqueDomains.length} domains.`
  );

  // Trigger POST /v1/radar/crawl and POST /v1/radar/sync first
  console.log("[Seed] Triggering POST /v1/radar/crawl and POST /v1/radar/sync on production...");
  await Promise.allSettled([
    fetch(`${PROD_API_BASE}/v1/radar/crawl`, { method: "POST", signal: AbortSignal.timeout(25000) }),
    fetch(`${PROD_API_BASE}/v1/radar/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(25000)
    })
  ]);

  // Submit all unique endpoints to POST https://api.nullclear.dev/v1/radar/submit-endpoint in batches of 8
  let submittedCount = 0;
  let probeSuccessCount = 0;
  const batchSize = 8;

  for (let i = 0; i < allEndpoints.length; i += batchSize) {
    const batch = allEndpoints.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (ep) => {
        const res = await fetch(`${PROD_API_BASE}/v1/radar/submit-endpoint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpointUrl: ep.url,
            sellerAddress: ep.sellerAddress,
            priceAtomic: ep.priceAtomic || "10000",
            category: ep.category || "data",
            description: ep.description
          }),
          signal: AbortSignal.timeout(12000)
        });
        if (!res.ok) return { ok: false, probeSuccess: false };
        const json: any = await res.json();
        return { ok: Boolean(json.success), probeSuccess: Boolean(json.probeSuccess), endpoint: json.endpoint };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) {
        submittedCount++;
        if (r.value.probeSuccess) probeSuccessCount++;
      }
    }
    console.log(
      `  -> Batch [${Math.min(i + batchSize, allEndpoints.length)}/${allEndpoints.length}] submitted (${submittedCount} indexed, ${probeSuccessCount} live 200/402 verified)`
    );
  }

  // Verify GET https://api.nullclear.dev/v1/bazaar/directory and https://nullclear.dev/leaderboard
  const dirRes = await fetch(`${PROD_API_BASE}/v1/bazaar/directory?limit=200`);
  const dirJson: any = await dirRes.json();
  const totalInDirectory =
    dirJson?.totalEndpoints ??
    dirJson?.count ??
    (Array.isArray(dirJson?.endpoints) ? dirJson.endpoints.length : 0);

  const lbRes = await fetch("https://nullclear.dev/leaderboard");
  const lbText = await lbRes.text();

  console.log("\n================================================================================");
  console.log(` Production Seeding Complete!`);
  console.log(`  - Endpoints Submitted : ${submittedCount} / ${allEndpoints.length}`);
  console.log(`  - Directory Count     : ${totalInDirectory} live endpoints in /v1/bazaar/directory`);
  console.log(`  - Leaderboard Status  : HTTP ${lbRes.status} (${lbText.length} bytes HTML)`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Fatal error in seed-live-ecosystem.ts:", err);
  process.exit(1);
});
