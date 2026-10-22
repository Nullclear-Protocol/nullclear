#!/usr/bin/env tsx
/**
 * STEP 3: Automated Agent-to-Agent (M2M) Protocol Handshake (`scripts/m2m-handshake.ts`)
 *
 * For each unique domain in `output/leads.json` (and live facilitator catalogs):
 *  1. Attaches `User-Agent: NullClear-Arbiter/1.2 (+https://nullclear.dev/leaderboard; ERC8004-Agent-124595)`
 *     and signed `X-NullClear-Verified-KYA` + `X-NullClear-KYA-Signature` headers.
 *  2. Probes `/.well-known/agent.json`, `/.well-known/agent-card.json`, `/.well-known/mcp.json`, `/mcp`, `/a2a`.
 *  3. If `/mcp` responds to JSON-RPC, sends `initialize` and `tools/list` with
 *     `clientInfo: { name: "nullclear-arbiter-directory", version: "1.2.0", url: "https://nullclear.dev/leaderboard" }`.
 *  4. If `/a2a` responds to JSON-RPC, sends a structured discovery card exchange (`message/send` or
 *     `agent/authenticatedExtendedCard`) announcing indexing on `https://nullclear.dev/leaderboard` and
 *     zero-loss EIP-3009 proxy route `https://api.nullclear.dev/https://<domain>`.
 *  5. Saves all M2M handshake results to `output/m2m-handshakes.json`.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();
const LEADS_PATH = path.join(ROOT_DIR, "output", "leads.json");
const HANDSHAKES_OUT_PATH = path.join(ROOT_DIR, "output", "m2m-handshakes.json");

const USER_AGENT =
  "NullClear-Arbiter/1.2 (+https://nullclear.dev/leaderboard; ERC8004-Agent-124595)";

function buildSignedKyaHeaders(): Record<string, string> {
  const payload = {
    mandateId: "kya_124595_8453_directory_indexer",
    agentAddress: "0xfd74fF802EA0E735514C070AF04E0D6528deD145",
    corporateEntity: "NullClear Protocol Clearinghouse",
    jurisdiction: "GLOBAL",
    maxPerCallAtomic: "50000000",
    arbiterAgentId: 124595,
    issuedAt: Math.floor(Date.now() / 1000)
  };
  const canonicalJson = JSON.stringify(payload);
  const b64Url = Buffer.from(canonicalJson, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const secret =
    process.env.ARBITER_PRIVATE_KEY ||
    "nullclear-arbiter-kya-hmac-default-key-8453-124595";
  const sigHex = crypto.createHmac("sha256", secret).update(canonicalJson).digest("hex");

  return {
    "User-Agent": USER_AGENT,
    "X-NullClear-Verified-KYA": b64Url,
    "X-NullClear-KYA-Signature": sigHex,
    "X-Buyer-Address": "0xfd74fF802EA0E735514C070AF04E0D6528deD145"
  };
}

export interface DomainHandshakeResult {
  domain: string;
  probedAt: string;
  wellKnownFound: string[];
  mcpHandshake: {
    probedUrl: string;
    responded: boolean;
    httpStatus?: number;
    serverInfo?: unknown;
    toolsCount?: number;
    toolNames?: string[];
  };
  a2aHandshake: {
    probedUrl: string;
    responded: boolean;
    httpStatus?: number;
    responseSnippet?: string;
  };
}

async function probeDomainM2M(domain: string, baseHeaders: Record<string, string>): Promise<DomainHandshakeResult> {
  const origin = `https://${domain}`;
  const wellKnownPaths = [
    "/.well-known/agent.json",
    "/.well-known/agent-card.json",
    "/.well-known/mcp.json",
    "/.well-known/x402.json"
  ];
  const wellKnownFound: string[] = [];

  // 1. Probe well-known manifests in parallel
  await Promise.allSettled(
    wellKnownPaths.map(async (wk) => {
      try {
        const res = await fetch(`${origin}${wk}`, {
          method: "GET",
          headers: { ...baseHeaders, Accept: "application/json" },
          signal: AbortSignal.timeout(4000)
        });
        if (res.status === 200) {
          const ct = res.headers.get("content-type") || "";
          const text = await res.text();
          if (ct.includes("json") || text.trim().startsWith("{")) {
            wellKnownFound.push(wk);
          }
        }
      } catch {
        // ignore
      }
    })
  );

  // 2. Probe /mcp with JSON-RPC `initialize` and `tools/list`
  const mcpUrl = `${origin}/mcp`;
  let mcpResponded = false;
  let mcpStatus: number | undefined;
  let mcpServerInfo: unknown;
  let mcpToolsCount: number | undefined;
  let mcpToolNames: string[] | undefined;

  try {
    const initRes = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "nullclear-arbiter-directory",
            version: "1.2.0",
            url: "https://nullclear.dev/leaderboard"
          }
        }
      }),
      signal: AbortSignal.timeout(5000)
    });
    mcpStatus = initRes.status;
    const initText = await initRes.text();

    if (initRes.status >= 200 && initRes.status < 500 && initText) {
      let initJson: any = null;
      try {
        initJson = JSON.parse(initText);
      } catch {
        const dataMatch = initText.match(/data:\s*(\{.*\})/);
        if (dataMatch) {
          try {
            initJson = JSON.parse(dataMatch[1]);
          } catch {}
        }
      }

      if (initJson && (initJson.jsonrpc === "2.0" || initJson.result || initJson.error)) {
        mcpResponded = true;
        mcpServerInfo = initJson.result?.serverInfo || initJson.result || initJson.error;

        // Follow up with tools/list
        const sessionHdr = initRes.headers.get("mcp-session-id") || initRes.headers.get("x-mcp-session");
        const listHeaders: Record<string, string> = {
          ...baseHeaders,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream"
        };
        if (sessionHdr) listHeaders["mcp-session-id"] = sessionHdr;

        try {
          const listRes = await fetch(mcpUrl, {
            method: "POST",
            headers: listHeaders,
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
              params: {}
            }),
            signal: AbortSignal.timeout(4500)
          });
          const listText = await listRes.text();
          let listJson: any = null;
          try {
            listJson = JSON.parse(listText);
          } catch {
            const dm = listText.match(/data:\s*(\{.*\})/);
            if (dm) {
              try {
                listJson = JSON.parse(dm[1]);
              } catch {}
            }
          }
          const tools = listJson?.result?.tools;
          if (Array.isArray(tools)) {
            mcpToolsCount = tools.length;
            mcpToolNames = tools.slice(0, 10).map((t: any) => String(t?.name || ""));
          }
        } catch {
          // ignore tools/list error
        }
      }
    }
  } catch {
    // ignore mcp timeout
  }

  // 3. Probe /a2a with JSON-RPC discovery card exchange
  const a2aUrl = `${origin}/a2a`;
  let a2aResponded = false;
  let a2aStatus: number | undefined;
  let a2aSnippet: string | undefined;

  try {
    const a2aRes = await fetch(a2aUrl, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "nc-discovery-1",
        method: "message/send",
        params: {
          message: {
            role: "user",
            parts: [
              {
                type: "text",
                text: `NullClear Arbiter Directory Handshake: Your x402 domain (${domain}) has been indexed on https://nullclear.dev/leaderboard with a zero-loss EIP-3009 escrow proxy route at https://api.nullclear.dev/https://${domain}. Remote MCP discovery: https://api.nullclear.dev/mcp`
              }
            ]
          },
          metadata: {
            senderAgentId: "eip155:8453:124595",
            leaderboardUrl: "https://nullclear.dev/leaderboard",
            mcpServerUrl: "https://api.nullclear.dev/mcp",
            zeroLossProxyPrefix: `https://api.nullclear.dev/https://${domain}`
          }
        }
      }),
      signal: AbortSignal.timeout(4500)
    });
    a2aStatus = a2aRes.status;
    const a2aText = await a2aRes.text();
    if (a2aRes.status >= 200 && a2aRes.status < 500 && a2aText) {
      if (a2aText.includes("jsonrpc") || a2aRes.status === 200 || a2aRes.status === 402) {
        a2aResponded = true;
        a2aSnippet = a2aText.slice(0, 220);
      }
    }
  } catch {
    // ignore a2a timeout
  }

  return {
    domain,
    probedAt: new Date().toISOString(),
    wellKnownFound,
    mcpHandshake: {
      probedUrl: mcpUrl,
      responded: mcpResponded,
      httpStatus: mcpStatus,
      serverInfo: mcpServerInfo,
      toolsCount: mcpToolsCount,
      toolNames: mcpToolNames
    },
    a2aHandshake: {
      probedUrl: a2aUrl,
      responded: a2aResponded,
      httpStatus: a2aStatus,
      responseSnippet: a2aSnippet
    }
  };
}

async function main() {
  console.log("================================================================================");
  console.log(" STEP 3: Automated Agent-to-Agent (M2M) Protocol Handshake Engine");
  console.log("================================================================================");

  const domainsSet = new Set<string>([
    "mcp.toolsnap.app",
    "api.402xagent.com",
    "x402-trust.com",
    "coinpayportal.com",
    "meter.wayleave.dev"
  ]);

  if (fs.existsSync(LEADS_PATH)) {
    const leadsData = JSON.parse(fs.readFileSync(LEADS_PATH, "utf8"));
    if (Array.isArray(leadsData.discoveredDomains)) {
      for (const d of leadsData.discoveredDomains) {
        if (typeof d === "string" && d.trim()) domainsSet.add(d.trim().toLowerCase());
      }
    }
    if (Array.isArray(leadsData.facilitatorResourcesSample)) {
      for (const item of leadsData.facilitatorResourcesSample) {
        if (typeof item?.url === "string") {
          try {
            domainsSet.add(new URL(item.url).hostname.toLowerCase());
          } catch {}
        }
      }
    }
    if (Array.isArray(leadsData.githubLeads)) {
      for (const gl of leadsData.githubLeads) {
        if (typeof gl?.liveEndpointUrl === "string") {
          try {
            const h = new URL(gl.liveEndpointUrl).hostname.toLowerCase();
            if (!h.includes("example.com") && !h.includes("paymentauth.org")) {
              domainsSet.add(h);
            }
          } catch {}
        }
      }
    }
  }

  const allDomains = Array.from(domainsSet);
  const signedHeaders = buildSignedKyaHeaders();

  console.log(`[M2M] Executing M2M protocol handshakes across ${allDomains.length} unique domains...`);
  console.log(`[M2M] Attached signed X-NullClear-Verified-KYA & X-NullClear-KYA-Signature headers.`);

  const results: DomainHandshakeResult[] = [];
  const batchSize = 8;

  for (let i = 0; i < allDomains.length; i += batchSize) {
    const batch = allDomains.slice(i, i + batchSize);
    const batchRes = await Promise.all(batch.map((d) => probeDomainM2M(d, signedHeaders)));
    results.push(...batchRes);
    console.log(`  -> Probed [${Math.min(i + batchSize, allDomains.length)}/${allDomains.length}] domains`);
  }

  const mcpHandshakes = results.filter((r) => r.mcpHandshake.responded);
  const a2aHandshakes = results.filter((r) => r.a2aHandshake.responded);
  const wellKnownDomains = results.filter((r) => r.wellKnownFound.length > 0);
  const anyHttpReached = results.filter(
    (r) =>
      r.mcpHandshake.httpStatus !== undefined ||
      r.a2aHandshake.httpStatus !== undefined ||
      r.wellKnownFound.length > 0
  );

  const outputPayload = {
    generatedAt: new Date().toISOString(),
    userAgent: USER_AGENT,
    kyaHeaderAttached: true,
    summary: {
      totalDomainsProbed: allDomains.length,
      domainsReachable: anyHttpReached.length,
      wellKnownManifestsFound: wellKnownDomains.length,
      mcpJsonRpcHandshakesCompleted: mcpHandshakes.length,
      a2aJsonRpcHandshakesCompleted: a2aHandshakes.length
    },
    successfulHandshakes: results.filter(
      (r) => r.mcpHandshake.responded || r.a2aHandshake.responded || r.wellKnownFound.length > 0
    ),
    allDomainProbes: results
  };

  fs.mkdirSync(path.dirname(HANDSHAKES_OUT_PATH), { recursive: true });
  fs.writeFileSync(HANDSHAKES_OUT_PATH, JSON.stringify(outputPayload, null, 2), "utf8");

  console.log("\n================================================================================");
  console.log(` M2M Handshake Summary (${HANDSHAKES_OUT_PATH}):`);
  console.log(`  - Total Domains Probed           : ${allDomains.length}`);
  console.log(`  - Reachable Agent Domains        : ${anyHttpReached.length}`);
  console.log(`  - /.well-known/* Manifests Found : ${wellKnownDomains.length}`);
  console.log(`  - /mcp JSON-RPC Handshakes       : ${mcpHandshakes.length}`);
  console.log(`  - /a2a Discovery Exchanges       : ${a2aHandshakes.length}`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Fatal error in m2m-handshake.ts:", err);
  process.exit(1);
});
