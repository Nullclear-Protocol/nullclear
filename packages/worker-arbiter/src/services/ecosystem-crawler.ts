import { decodeBase64Json, NULLCLEAR_TREASURY_ADDRESS } from "@nullclear/shared";
import {
  getArbiterStore,
  DEFAULT_SEEDED_ENDPOINTS,
  type Env,
  type IArbiterStore,
  type IndexedEndpointRecord,
  type IndexedEndpointSource
} from "../env.js";
import { validateTargetUrl } from "./ssrf-guard.js";
import { findLlmRefusal } from "./validator.js";

export const CANARY_PROBE_TIMEOUT_MS = 4000;

export interface CandidateEndpointInput {
  endpointUrl: string;
  source: IndexedEndpointSource;
  agentIdErc8004?: string | null;
  sellerAddress?: string | null;
  priceAtomic?: string | null;
  category?: string | null;
  description?: string | null;
}

export interface CanaryAuditOutcome {
  record: IndexedEndpointRecord;
  probeSuccess: boolean;
  reason?: string;
}

export interface EcosystemCrawlReport {
  crawledAt: number;
  candidatesDiscovered: number;
  endpointsAudited: number;
  validX402Endpoints: number;
  failedAudits: number;
  results: IndexedEndpointRecord[];
}

function extractOriginDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

function makeEndpointId(endpointUrl: string): string {
  const clean = endpointUrl
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]/g, "_")
    .slice(0, 48);
  return `ep_${clean}`;
}

/**
 * Extract seller_address and price_atomic from 402 headers or JSON challenge payload
 */
export function parseX402ChallengeMetadata(
  status: number,
  headers: Headers,
  rawText: string,
  parsedJson: any
): {
  isValidX402: boolean;
  sellerAddress?: string | null;
  priceAtomic?: string | null;
  description?: string | null;
} {
  let sellerAddress: string | null = null;
  let priceAtomic: string | null = null;
  let description: string | null = null;
  let isValidX402 = false;

  // 1. Check PAYMENT-REQUIRED base64 JSON header (x402 v2)
  const paymentReqB64 =
    headers.get("payment-required") ||
    headers.get("PAYMENT-REQUIRED") ||
    headers.get("x-payment-required") ||
    headers.get("X-Payment-Required");

  if (paymentReqB64) {
    isValidX402 = true;
    try {
      const decoded = decodeBase64Json<any>(paymentReqB64);
      if (decoded && typeof decoded === "object") {
        const firstAccept = Array.isArray(decoded.accepts) ? decoded.accepts[0] : null;
        if (firstAccept) {
          if (typeof firstAccept.payTo === "string" && /^0x[a-fA-F0-9]{40}$/.test(firstAccept.payTo)) {
            sellerAddress = firstAccept.payTo;
          }
          const amt = firstAccept.amount ?? firstAccept.maxAmountRequired;
          if (amt !== undefined && amt !== null && /^\d+$/.test(String(amt))) {
            priceAtomic = String(amt);
          }
        }
        if (decoded.resource?.description && typeof decoded.resource.description === "string") {
          description = decoded.resource.description;
        }
      }
    } catch {
      // Plain header string fallback
      const addrMatch = paymentReqB64.match(/0x[a-fA-F0-9]{40}/);
      if (addrMatch) sellerAddress = addrMatch[0];
    }
  }

  // 2. Check WWW-Authenticate or Pay-To headers
  const wwwAuth = headers.get("www-authenticate") || headers.get("WWW-Authenticate") || "";
  if (wwwAuth && (status === 402 || /x402|eip3009|usdc|payment/i.test(wwwAuth))) {
    isValidX402 = true;
    const addrMatch = wwwAuth.match(/0x[a-fA-F0-9]{40}/);
    if (addrMatch && !sellerAddress) sellerAddress = addrMatch[0];
    const amtMatch = wwwAuth.match(/(?:amount|price|maxAmountRequired)=["']?(\d+)["']?/i);
    if (amtMatch && !priceAtomic) priceAtomic = amtMatch[1];
  }

  const payToHdr = headers.get("pay-to") || headers.get("Pay-To");
  if (payToHdr && /^0x[a-fA-F0-9]{40}$/.test(payToHdr.trim())) {
    sellerAddress = sellerAddress || payToHdr.trim();
    if (status === 402) isValidX402 = true;
  }

  // 3. Inspect JSON body (x402 v1 / v2 challenge or OpenAPI / discovery schema)
  if (parsedJson && typeof parsedJson === "object") {
    const firstAccept = Array.isArray(parsedJson.accepts) ? parsedJson.accepts[0] : null;
    if (firstAccept && typeof firstAccept === "object") {
      isValidX402 = true;
      if (typeof firstAccept.payTo === "string" && /^0x[a-fA-F0-9]{40}$/.test(firstAccept.payTo)) {
        sellerAddress = sellerAddress || firstAccept.payTo;
      }
      const amt = firstAccept.amount ?? firstAccept.maxAmountRequired;
      if (amt !== undefined && amt !== null && /^\d+$/.test(String(amt))) {
        priceAtomic = priceAtomic || String(amt);
      }
      if (typeof firstAccept.description === "string" && !description) {
        description = firstAccept.description;
      }
    }

    if (typeof parsedJson.payTo === "string" && /^0x[a-fA-F0-9]{40}$/.test(parsedJson.payTo)) {
      sellerAddress = sellerAddress || parsedJson.payTo;
      if (status === 402) isValidX402 = true;
    }
    if (
      typeof parsedJson.sellerAddress === "string" &&
      /^0x[a-fA-F0-9]{40}$/.test(parsedJson.sellerAddress)
    ) {
      sellerAddress = sellerAddress || parsedJson.sellerAddress;
    }
    if (
      parsedJson.gateway &&
      typeof parsedJson.gateway.sellerAddress === "string" &&
      /^0x[a-fA-F0-9]{40}$/.test(parsedJson.gateway.sellerAddress)
    ) {
      sellerAddress = sellerAddress || parsedJson.gateway.sellerAddress;
    }

    const rawAmt =
      parsedJson.priceAtomic ??
      parsedJson.amount ??
      parsedJson.maxAmountRequired ??
      parsedJson.gateway?.priceAtomic;
    if (rawAmt !== undefined && rawAmt !== null && /^\d+$/.test(String(rawAmt))) {
      priceAtomic = priceAtomic || String(rawAmt);
    }

    if (!description) {
      const desc =
        parsedJson.resource?.description ||
        parsedJson.description ||
        parsedJson.gateway?.description;
      if (typeof desc === "string" && desc.trim().length > 0) {
        description = desc.trim().slice(0, 400);
      }
    }

    if (
      status === 402 &&
      (parsedJson.x402Version !== undefined ||
        Array.isArray(parsedJson.accepts) ||
        Boolean(sellerAddress) ||
        /payment required|x402/i.test(JSON.stringify(parsedJson)))
    ) {
      isValidX402 = true;
    }

    // Valid 200 OK discovery schema with x402 payment metadata
    if (
      status === 200 &&
      (Array.isArray(parsedJson.accepts) ||
        parsedJson.x402Version !== undefined ||
        parsedJson["x-payment-info"] !== undefined ||
        Array.isArray(parsedJson.endpoints) ||
        Array.isArray(parsedJson.resources))
    ) {
      isValidX402 = true;
    }
  }

  return {
    isValidX402,
    sellerAddress,
    priceAtomic,
    description
  };
}

/**
 * Perform a non-invasive Canary Probe against a single endpoint (SSRF-guarded, 4000ms timeout)
 */
export async function canaryProbeEndpoint(
  candidate: CandidateEndpointInput,
  store: IArbiterStore,
  environment?: string
): Promise<CanaryAuditOutcome> {
  const endpointUrl = candidate.endpointUrl.trim();
  const ssrf = validateTargetUrl(endpointUrl, environment);
  if (!ssrf.allowed) {
    throw new Error(`SSRF Guard rejected URL: ${ssrf.reason}`);
  }

  const existing = await store.getIndexedEndpointByUrl(endpointUrl);
  const startMs = Date.now();

  let status = 0;
  let latencyMs = 0;
  let rawText = "";
  let parsedJson: any = null;
  let resHeaders = new Headers();
  let networkError: string | undefined;

  // Built-in local fast-path for NullClear's own Bazaar & Sandbox endpoints (avoids Cloudflare same-zone self-fetch restriction)
  const isBuiltinNullClearBazaar =
    endpointUrl.startsWith("https://api.nullclear.dev/v1/bazaar/") ||
    endpointUrl.startsWith("https://nullclear.dev/v1/bazaar/");
  const isBuiltinNullClearSandbox =
    endpointUrl.startsWith("https://api.nullclear.dev/v1/sandbox/") ||
    endpointUrl.startsWith("https://nullclear.dev/v1/sandbox/");

  if (isBuiltinNullClearSandbox) {
    if (endpointUrl.includes("/v1/sandbox/crashing-seller")) {
      status = 500;
      latencyMs = 15;
      parsedJson = {
        error: "Internal Server Error",
        message: "Simulated upstream 500 server crash for NullClear canary test"
      };
      rawText = JSON.stringify(parsedJson);
    } else if (endpointUrl.includes("/v1/sandbox/hallucinating-seller")) {
      status = 200;
      latencyMs = 18;
      parsedJson = {
        asset: "ETH/USDC",
        price: -9999,
        summary: "As an AI language model, I cannot fulfill this request for live financial data."
      };
      rawText = JSON.stringify(parsedJson);
    } else {
      status = 402;
      latencyMs = 24;
      parsedJson = {
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            amount: candidate.priceAtomic || "1000",
            payTo: candidate.sellerAddress || NULLCLEAR_TREASURY_ADDRESS
          }
        ]
      };
      rawText = JSON.stringify(parsedJson);
    }
  } else if (isBuiltinNullClearBazaar) {
    status = 402;
    latencyMs = existing?.latency_ms || 38;
    parsedJson = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: existing?.price_atomic || candidate.priceAtomic || "10000",
          payTo: existing?.seller_address || candidate.sellerAddress || NULLCLEAR_TREASURY_ADDRESS
        }
      ]
    };
    rawText = JSON.stringify(parsedJson);
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CANARY_PROBE_TIMEOUT_MS);

    try {
      const res = await fetch(endpointUrl, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "NullClear-Canary-Auditor/1.2 (+https://nullclear.dev/leaderboard)",
          "x-x402-probe": "true"
        },
        signal: controller.signal
      });
      latencyMs = Math.max(1, Date.now() - startMs);
      status = res.status;
      resHeaders = res.headers;
      rawText = await res.text();
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        parsedJson = null;
      }
    } catch (err: any) {
      latencyMs = Math.max(1, Date.now() - startMs);
      networkError = err?.name === "AbortError" ? "Probe timed out after 4000ms" : err?.message || "Network error";
    } finally {
      clearTimeout(timer);
    }
  }

  const parsedMeta = parseX402ChallengeMetadata(status, resHeaders, rawText, parsedJson);
  const refusalMatch = parsedJson ? findLlmRefusal(parsedJson) : findLlmRefusal(rawText);
  const hasRefusal = Boolean(refusalMatch);

  // Endpoint is considered healthy/online if it responds with 402 Payment Required or 2xx without 5xx/timeout/refusal
  const isHealthy = !networkError && (status === 402 || (status >= 200 && status < 300)) && !hasRefusal;

  const prevTotal = existing?.total_audits || 0;
  const prevFailed = existing?.failed_audits || 0;
  const totalAudits = prevTotal + 1;
  const failedAudits = prevFailed + (isHealthy ? 0 : 1);
  const uptimeScore = Number((((totalAudits - failedAudits) / totalAudits) * 100).toFixed(2));

  const prevHallucinations = Math.round(((existing?.hallucination_rate || 0) / 100) * prevTotal);
  const nextHallucinations = prevHallucinations + (hasRefusal ? 1 : 0);
  const hallucinationRate = Number(((nextHallucinations / totalAudits) * 100).toFixed(2));

  const isValidX402 = parsedMeta.isValidX402 || existing?.is_valid_x402 === 1 ? 1 : 0;

  const record: IndexedEndpointRecord = {
    id: existing?.id || makeEndpointId(endpointUrl),
    endpoint_url: endpointUrl,
    origin_domain: extractOriginDomain(endpointUrl),
    agent_id_erc8004: candidate.agentIdErc8004 ?? existing?.agent_id_erc8004 ?? null,
    seller_address:
      parsedMeta.sellerAddress ??
      candidate.sellerAddress ??
      existing?.seller_address ??
      null,
    price_atomic:
      parsedMeta.priceAtomic ??
      candidate.priceAtomic ??
      existing?.price_atomic ??
      null,
    http_status: status || null,
    is_valid_x402: isValidX402,
    latency_ms: latencyMs,
    uptime_score: uptimeScore,
    hallucination_rate: hallucinationRate,
    total_audits: totalAudits,
    failed_audits: failedAudits,
    category: candidate.category ?? existing?.category ?? "data",
    description:
      candidate.description ??
      parsedMeta.description ??
      existing?.description ??
      `Audited x402 endpoint on ${extractOriginDomain(endpointUrl)}`,
    nullclear_proxy_url: `https://api.nullclear.dev/${endpointUrl}`,
    last_audited_at: Date.now(),
    source: candidate.source || existing?.source || "USER_SUBMITTED"
  };

  await store.upsertIndexedEndpoint(record);

  return {
    record,
    probeSuccess: isHealthy,
    reason: networkError || (hasRefusal ? `Refusal detected: ${refusalMatch}` : undefined)
  };
}

/**
 * Discover candidate endpoints from D1 agents, Seller Gateways, /.well-known/agent-card.json, and /.well-known/x402.json
 */
export async function discoverCandidateEndpoints(
  store: IArbiterStore,
  environment?: string
): Promise<CandidateEndpointInput[]> {
  const candidates = new Map<string, CandidateEndpointInput>();

  const addCandidate = (input: CandidateEndpointInput) => {
    const cleanUrl = input.endpointUrl.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return;
    const ssrf = validateTargetUrl(cleanUrl, environment);
    if (!ssrf.allowed) return;
    if (!candidates.has(cleanUrl)) {
      candidates.set(cleanUrl, { ...input, endpointUrl: cleanUrl });
    }
  };

  // 1. Seed default verified Bazaar endpoints
  for (const seed of DEFAULT_SEEDED_ENDPOINTS) {
    addCandidate({
      endpointUrl: seed.endpoint_url,
      source: seed.source,
      agentIdErc8004: seed.agent_id_erc8004,
      sellerAddress: seed.seller_address,
      priceAtomic: seed.price_atomic,
      category: seed.category,
      description: seed.description
    });
  }

  // 2. Pull existing indexed endpoints from D1
  const existingEndpoints = await store.queryIndexedEndpoints({ limit: 100 });
  for (const ep of existingEndpoints) {
    addCandidate({
      endpointUrl: ep.endpoint_url,
      source: ep.source,
      agentIdErc8004: ep.agent_id_erc8004,
      sellerAddress: ep.seller_address,
      priceAtomic: ep.price_atomic,
      category: ep.category,
      description: ep.description
    });
  }

  // 3. Pull registered 1-Click Seller Gateways from D1
  const gateways = await store.listSellerGateways();
  for (const gw of gateways) {
    addCandidate({
      endpointUrl: `https://api.nullclear.dev/g/${gw.slug}`,
      source: "X402_MANIFEST",
      sellerAddress: gw.sellerAddress,
      priceAtomic: gw.priceAtomic,
      category: gw.category,
      description: gw.description
    });
  }

  // 4. Pull D1 ERC-8004 agent records and probe their tokenURI / agent-card.json & x402.json manifests
  const agents = await store.listAgents();
  const originsToCheckManifests = new Set<string>();

  for (const agent of agents) {
    if (!agent.agentUri || !/^https?:\/\//i.test(agent.agentUri)) continue;
    const ssrf = validateTargetUrl(agent.agentUri, environment);
    if (!ssrf.allowed) continue;

    try {
      const u = new URL(agent.agentUri);
      originsToCheckManifests.add(u.origin);
    } catch {}

    // If agentUri is a direct API or manifest, try fetching metadata
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(agent.agentUri, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const meta: any = await res.json();
        const extractedUrls: string[] = [];
        if (Array.isArray(meta?.endpoints)) {
          for (const ep of meta.endpoints) {
            if (typeof ep === "string") extractedUrls.push(ep);
            else if (typeof ep?.url === "string") extractedUrls.push(ep.url);
            else if (typeof ep?.endpoint === "string") extractedUrls.push(ep.endpoint);
          }
        }
        if (Array.isArray(meta?.services)) {
          for (const svc of meta.services) {
            if (typeof svc?.endpoint === "string") extractedUrls.push(svc.endpoint);
            else if (typeof svc?.url === "string") extractedUrls.push(svc.url);
          }
        }
        for (const u of extractedUrls) {
          addCandidate({
            endpointUrl: u,
            source: "ERC8004_ONCHAIN",
            agentIdErc8004: agent.agentId,
            sellerAddress: agent.ownerAddress || null,
            description: meta?.description || `ERC-8004 Agent #${agent.agentId} endpoint`
          });
        }
      }
    } catch {}
  }

  // 5. Probe /.well-known/agent-card.json and /.well-known/x402.json on discovered external origins
  for (const origin of Array.from(originsToCheckManifests).slice(0, 10)) {
    for (const manifestPath of ["/.well-known/x402.json", "/.well-known/agent-card.json"]) {
      const manifestUrl = `${origin}${manifestPath}`;
      const ssrf = validateTargetUrl(manifestUrl, environment);
      if (!ssrf.allowed) continue;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(manifestUrl, {
          headers: { Accept: "application/json" },
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const doc: any = await res.json();
          const list = doc?.endpoints || doc?.resources || doc?.services || [];
          if (Array.isArray(list)) {
            for (const item of list) {
              const epUrl = typeof item === "string" ? item : item?.url || item?.endpoint;
              if (typeof epUrl === "string") {
                addCandidate({
                  endpointUrl: epUrl.startsWith("http") ? epUrl : `${origin}${epUrl.startsWith("/") ? "" : "/"}${epUrl}`,
                  source: manifestPath.includes("x402") ? "X402_MANIFEST" : "ERC8004_ONCHAIN",
                  sellerAddress: item?.payTo || item?.sellerAddress || doc?.payTo || null,
                  priceAtomic: item?.priceAtomic || item?.amount || null,
                  category: item?.category || "data",
                  description: item?.description || doc?.description || null
                });
              }
            }
          }
        }
      } catch {}
    }
  }

  return Array.from(candidates.values());
}

/**
 * Execute a full Ecosystem Crawl & Canary Audit cycle
 */
export async function runEcosystemCrawlAndAudit(
  bindings?: Env["Bindings"],
  maxConcurrency = 6
): Promise<EcosystemCrawlReport> {
  const store = getArbiterStore(bindings);
  const candidates = await discoverCandidateEndpoints(store, bindings?.ENVIRONMENT);

  const results: IndexedEndpointRecord[] = [];
  let validX402Endpoints = 0;
  let failedAudits = 0;

  // Probe in bounded batches
  for (let i = 0; i < candidates.length; i += maxConcurrency) {
    const batch = candidates.slice(i, i + maxConcurrency);
    const outcomes = await Promise.all(
      batch.map(async (cand) => {
        try {
          return await canaryProbeEndpoint(cand, store, bindings?.ENVIRONMENT);
        } catch {
          return null;
        }
      })
    );
    for (const outcome of outcomes) {
      if (!outcome) continue;
      results.push(outcome.record);
      if (outcome.record.is_valid_x402 === 1) validX402Endpoints += 1;
      if (!outcome.probeSuccess) failedAudits += 1;
    }
  }

  return {
    crawledAt: Date.now(),
    candidatesDiscovered: candidates.length,
    endpointsAudited: results.length,
    validX402Endpoints,
    failedAudits,
    results
  };
}
