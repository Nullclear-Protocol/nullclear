import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  BASE_MAINNET,
  EIP3009_TYPES,
  encodeBase64Json,
  type EIP3009Authorization,
  type X402PaymentOption,
  type X402PaymentSignaturePayload
} from "@nullclear/shared";
import app from "../src/index.js";
import { getArbiterStore } from "../src/env.js";

describe("NullClear Worker Arbiter Test Suite", () => {
  let mockServer: http.Server;
  let mockServerPort: number;

  const arbiterKey = generatePrivateKey();
  const arbiterAccount = privateKeyToAccount(arbiterKey);

  const buyerKey = generatePrivateKey();
  const buyerAccount = privateKeyToAccount(buyerKey);

  const sellerKey = generatePrivateKey();
  const sellerAccount = privateKeyToAccount(sellerKey);

  const testEnv = {
    ARBITER_PRIVATE_KEY: arbiterKey
  };

  beforeAll(async () => {
    // Spin up local mock upstream server
    mockServer = http.createServer((req, res) => {
      const url = req.url || "/";
      if (url === "/honest") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ticker: "BTC-USDC", price: 68500, active: true }));
      } else if (url === "/corrupted") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ticker: 99999, price: "malformed-string" }));
      } else if (url === "/crash") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server 500 Explosion" }));
      } else if (url === "/refusal") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ticker: "BTC-USDC", price: 68500, summary: "As an AI language model, I cannot provide guarantees." }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address() as { port: number };
        mockServerPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  beforeEach(() => {
    const store = getArbiterStore();
    store.reset();
  });

  async function createValidPaymentSignature(
    payTo: Address,
    amount = "10000"
  ): Promise<string> {
    const nonce = ("0x" +
      Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`;

    const validAfter = "0";
    const validBefore = String(Math.floor(Date.now() / 1000) + 600);

    const authorization: EIP3009Authorization = {
      from: buyerAccount.address,
      to: payTo,
      value: amount,
      validAfter,
      validBefore,
      nonce
    };

    const signature = await buyerAccount.signTypedData({
      domain: {
        name: BASE_MAINNET.usdcDomain.name,
        version: BASE_MAINNET.usdcDomain.version,
        chainId: BASE_MAINNET.chainId,
        verifyingContract: BASE_MAINNET.usdc
      },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce
      }
    });

    const accepted: X402PaymentOption = {
      scheme: "exact",
      network: "eip155:8453",
      amount,
      asset: BASE_MAINNET.usdc,
      payTo,
      maxTimeoutSeconds: 600
    };

    const payload: X402PaymentSignaturePayload = {
      x402Version: 2,
      resource: { url: `http://127.0.0.1:${mockServerPort}/honest` },
      accepted,
      payload: {
        signature,
        authorization
      }
    };

    return encodeBase64Json(payload);
  }

  // 1. Discovery & Docs
  it("GET / returns 200 and dark-mode technical documentation", async () => {
    const res = await app.fetch(new Request("http://localhost/"), testEnv);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("NullClear Arbiter");
    expect(html).toContain("Deferred Non-Custodial Escrow");
  });

  // 2. Machine Discovery Endpoints
  it("GET /llms.txt and /llms-full.txt return clean markdown instructions", async () => {
    const res1 = await app.fetch(new Request("http://localhost/llms.txt"), testEnv);
    expect(res1.status).toBe(200);
    const txt1 = await res1.text();
    expect(txt1).toContain("NullClear Protocol for Autonomous AI Agents");

    const res2 = await app.fetch(new Request("http://localhost/llms-full.txt"), testEnv);
    expect(res2.status).toBe(200);
    const txt2 = await res2.text();
    expect(txt2).toContain("Comprehensive Technical Specification");
  });

  it("GET /.well-known/x402.json and /.well-known/agent.json return valid manifests", async () => {
    const res1 = await app.fetch(new Request("http://localhost/.well-known/x402.json"), testEnv);
    expect(res1.status).toBe(200);
    const data1 = (await res1.json()) as any;
    expect(data1.x402Version).toBe(2);
    expect(typeof data1.endpoints.clear === "object" ? data1.endpoints.clear.path : data1.endpoints.clear).toBe("/v1/clear");
    expect(data1.treasuryAddress).toBe("0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c");
    expect(data1.arbiterAddress).toBe("0xfd74fF802EA0E735514C070AF04E0D6528deD145");
    expect(data1.feeBps).toBe(50);

    const res2 = await app.fetch(new Request("http://localhost/.well-known/agent.json"), testEnv);
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as any;
    expect(data2.name).toContain("NullClear Arbiter");
    expect(data2.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
    expect(data2.agentWallet).toBe("0xfd74fF802EA0E735514C070AF04E0D6528deD145");
    expect(data2.treasuryWallet).toBe("0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c");
    expect(data2.supportedTrust).toContain("crypto-economic");
    expect(data2.registrations[0].agentRegistry).toBe("eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
  });

  it("GET /openapi.json returns valid OpenAPI 3.1.0 schema", async () => {
    const res = await app.fetch(new Request("http://localhost/openapi.json"), testEnv);
    expect(res.status).toBe(200);
    const spec = (await res.json()) as any;
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/v1/clear"]).toBeDefined();
    expect(spec.paths["/v1/score/{chainId}/{agentId}"]).toBeDefined();
  });

  // 3. Score & Reputation
  it("GET /v1/score/:chainId/:agentId returns baseline score and signs result", async () => {
    const res = await app.fetch(new Request("http://localhost/v1/score/8453/agent-alpha"), testEnv);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.agentId).toBe("agent-alpha");
    expect(json.data.score).toBeGreaterThan(0);
    expect(json.data.arbiterSignature).toMatch(/^0x[a-fA-F0-9]+/);
    expect(json.data.arbiterAddress.toLowerCase()).toBe(arbiterAccount.address.toLowerCase());
  });

  // 4. KYA Mandates
  it("POST /v1/kya/attest registers corporate mandate and GET retrieves it", async () => {
    const postRes = await app.fetch(
      new Request("http://localhost/v1/kya/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: 8453,
          mandate: {
            corporateEntity: "Autonomous Capital Corp",
            entityRegistrationNumber: "DE-12345678",
            agentId: "agent-kya-1",
            agentWallet: sellerAccount.address,
            maxTxLimitUsd: 5000,
            liabilityCoverageUsd: 100000,
            validUntil: Math.floor(Date.now() / 1000) + 86400,
            jurisdiction: "Delaware, USA"
          }
        })
      }),
      testEnv
    );
    expect(postRes.status).toBe(200);
    const postJson = (await postRes.json()) as any;
    expect(postJson.success).toBe(true);

    const getRes = await app.fetch(new Request("http://localhost/v1/kya/8453/agent-kya-1"), testEnv);
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as any;
    expect(getJson.success).toBe(true);
    expect(getJson.active).toBe(true);
    expect(getJson.data.corporateEntity).toBe("Autonomous Capital Corp");
  });

  // 5. Escrow Clearing: Parameter and Signature Validation
  it("POST /v1/clear fails 400 when missing targetUrl or payment signature", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: "" })
      }),
      testEnv
    );
    expect(res.status).toBe(400);
  });

  it("POST /v1/clear fails 400 when EIP-3009 signature is invalid or tampered", async () => {
    const validHeader = await createValidPaymentSignature(sellerAccount.address);
    const decoded = JSON.parse(Buffer.from(validHeader, "base64").toString("utf-8"));
    // Tamper with recipient to invalidate signature
    decoded.payload.authorization.to = "0x0000000000000000000000000000000000000001";
    const tamperedHeader = Buffer.from(JSON.stringify(decoded)).toString("base64");

    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: tamperedHeader
        })
      }),
      testEnv
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.stage).toBe("INVALID_PAYMENT_SIGNATURE");
  });

  // 6. Escrow Clearing: Reputation Gate
  it("POST /v1/clear returns 403 when seller score < minTrustScore", async () => {
    const sigHeader = await createValidPaymentSignature(sellerAccount.address);
    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: sigHeader,
          sellerAgentId: "unknown-untrusted-agent",
          minTrustScore: 99 // Artificially high threshold
        })
      }),
      testEnv
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.stage).toBe("REPUTATION_GATE");
  });

  // 7. Escrow Clearing: Honest Seller Success
  it("POST /v1/clear settles and attests when upstream satisfies schema", async () => {
    const sigHeader = await createValidPaymentSignature(sellerAccount.address, "50000");
    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: sigHeader,
          sellerAgentId: "honest-agent-1",
          validation: {
            expectedStatus: [200],
            jsonSchema: {
              type: "object",
              required: ["ticker", "price", "active"],
              properties: {
                ticker: { type: "string" },
                price: { type: "number" },
                active: { type: "boolean" }
              }
            }
          }
        })
      }),
      testEnv
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.cleared).toBe(true);
    expect(json.settled).toBe(true);
    expect(json.buyerCharged).toBe("50000");
    expect(json.clearingFee).toBe("250"); // 0.50% of 50000
    expect(json.attestation.signature).toBeDefined();
    expect(res.headers.get("PAYMENT-RESPONSE")).toBeDefined();
    expect(res.headers.get("X-NullClear-Attestation")).toBeDefined();
    expect(json.data.ticker).toBe("BTC-USDC");
  });

  // 8. Escrow Clearing: Hallucination Corrupted Output -> 422 ($0 lost)
  it("POST /v1/clear voids settlement (422) when upstream hallucinates bad types", async () => {
    const sigHeader = await createValidPaymentSignature(sellerAccount.address);
    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/corrupted`,
          paymentSignatureHeader: sigHeader,
          sellerAgentId: "hallucinating-agent-2",
          validation: {
            expectedStatus: [200],
            jsonSchema: {
              type: "object",
              required: ["ticker", "price"],
              properties: {
                ticker: { type: "string" },
                price: { type: "number" }
              }
            }
          }
        })
      }),
      testEnv
    );

    expect(res.status).toBe(422);
    const json = (await res.json()) as any;
    expect(json.cleared).toBe(false);
    expect(json.settled).toBe(false);
    expect(json.buyerCharged).toBe("0");
    expect(json.stage).toBe("SCHEMA_VALIDATION_FAILED");
    expect(json.validationErrors.length).toBeGreaterThan(0);
  });

  // 9. Escrow Clearing: Upstream 500 Server Crash -> 422 ($0 lost)
  it("POST /v1/clear voids settlement (422) when upstream returns HTTP 500 crash", async () => {
    const sigHeader = await createValidPaymentSignature(sellerAccount.address);
    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/crash`,
          paymentSignatureHeader: sigHeader,
          sellerAgentId: "crashing-agent-3",
          validation: {
            expectedStatus: [200]
          }
        })
      }),
      testEnv
    );

    expect(res.status).toBe(422);
    const json = (await res.json()) as any;
    expect(json.cleared).toBe(false);
    expect(json.buyerCharged).toBe("0");
    expect(json.validationErrors[0]).toContain("HTTP status 500");
  });

  // 10. Sybil & Wash-Trade Detection Engine
  it("Applies Wash-Trade penalty (-25 pts) and raises risk flag when single buyer share > 60%", async () => {
    const washAgentId = "wash-trader-99";

    // Simulate 4 transactions from the exact same buyer
    for (let i = 0; i < 4; i++) {
      const sigHeader = await createValidPaymentSignature(sellerAccount.address);
      const res = await app.fetch(
        new Request("http://localhost/v1/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
            paymentSignatureHeader: sigHeader,
            sellerAgentId: washAgentId,
            minTrustScore: 0,
            validation: { expectedStatus: [200] }
          })
        }),
        testEnv
      );
      expect(res.status).toBe(200);
    }

    const scoreRes = await app.fetch(
      new Request(`http://localhost/v1/score/8453/${washAgentId}`),
      testEnv
    );
    expect(scoreRes.status).toBe(200);
    const scoreJson = (await scoreRes.json()) as any;

    expect(scoreJson.data.sybilFlags).toContain("HIGH_COUNTERPARTY_CONCENTRATION_WASH_RISK");
    expect(scoreJson.data.metrics.maxSingleBuyerShare).toBe(1.0); // 100% single buyer
    expect(scoreJson.data.metrics.totalClearedTx).toBe(4);
  });

  // 11. Security: Nonce Replay Attack Protection
  it("Nonce replay attack returns 409 Conflict with PAYMENT_NONCE_ALREADY_USED", async () => {
    const sigHeader = await createValidPaymentSignature(sellerAccount.address);

    // First attempt: should succeed and record the nonce
    const firstRes = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: sigHeader,
          sellerAgentId: "replay-target-agent",
          validation: { expectedStatus: [200] }
        })
      }),
      testEnv
    );
    expect(firstRes.status).toBe(200);

    // Second attempt with the exact same nonce: MUST fail with 409 Conflict
    const replayRes = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: sigHeader,
          sellerAgentId: "replay-target-agent",
          validation: { expectedStatus: [200] }
        })
      }),
      testEnv
    );
    expect(replayRes.status).toBe(409);
    const json = (await replayRes.json()) as any;
    expect(json.stage).toBe("NONCE_REPLAY_DETECTED");
    expect(json.error).toBe("PAYMENT_NONCE_ALREADY_USED");
  });

  // 12. Security: SSRF Guard in Production Mode
  it("SSRF guard blocks private/metadata IPs in production mode", async () => {
    const sigHeader = await createValidPaymentSignature(sellerAccount.address);

    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: "http://169.254.169.254/latest/meta-data",
          paymentSignatureHeader: sigHeader,
          sellerAgentId: "ssrf-test-agent"
        })
      }),
      {
        ...testEnv,
        ENVIRONMENT: "production"
      }
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.stage).toBe("SSRF_BLOCKED");
    expect(json.error).toContain("SSRF_GUARD");
  });

  // 13. Domain Consolidation: Canonical 301 Redirect
  it("nullclear.com/llms.txt 301-redirects to https://nullclear.dev/llms.txt", async () => {
    const res1 = await app.fetch(
      new Request("http://nullclear.com/llms.txt"),
      testEnv
    );
    expect(res1.status).toBe(301);
    expect(res1.headers.get("Location")).toBe("https://nullclear.dev/llms.txt");

    const res2 = await app.fetch(
      new Request("http://www.nullclear.com/openapi.json?v=2"),
      testEnv
    );
    expect(res2.status).toBe(301);
    expect(res2.headers.get("Location")).toBe("https://nullclear.dev/openapi.json?v=2");
  });

  // 14. Remote HTTP MCP Server
  it("GET /mcp and POST /mcp handle Model Context Protocol remote requests", async () => {
    const getRes = await app.fetch(new Request("http://localhost/mcp"), testEnv);
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as any;
    expect(getData.name).toBe("nullclear-mcp");
    expect(getData.tools.length).toBe(3);

    const postRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      }),
      testEnv
    );
    expect(postRes.status).toBe(200);
    const postData = (await postRes.json()) as any;
    expect(postData.result.tools.length).toBe(3);
    expect(postData.result.tools[0].name).toBe("nullclear_check_reputation");
  });

  // 15. Anti-Abuse Guard A: Self-Clearing Prohibited (from === to)
  it("blocks self-clearing wash loops with 400 SELF_CLEARING_PROHIBITED", async () => {
    // Generate signature where from === to (buyer pays buyer)
    const selfSignatureHeader = await createValidPaymentSignature(buyerAccount.address, "10000");

    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: selfSignatureHeader
        })
      }),
      testEnv
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error).toBe("SELF_CLEARING_PROHIBITED");
    expect(json.message).toContain("wash-trading guard");
  });

  // 16. Anti-Abuse Guard B: Micro-Tier Floor Fallback (< 5000 atomic units)
  it("routes micro-transactions below 5000 atomic units to facilitator fallback", async () => {
    // 1000 atomic units ($0.001 USDC) is below MIN_ONCHAIN_ATOMIC (5000)
    const microSigHeader = await createValidPaymentSignature(sellerAccount.address, "1000");

    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: microSigHeader,
          validation: { expectedStatus: [200] }
        })
      }),
      {
        ...testEnv,
        SETTLEMENT_MODE: "onchain",
        MIN_ONCHAIN_ATOMIC: "5000"
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.cleared).toBe(true);
    expect(json.settled).toBe(true);
    expect(json.settlementRouting).toBe("micro_tier_offchain_guarded");
  });

  // 17. Anti-Abuse Guard C: On-chain Sponsored vs Daily Cap Fallback
  it("routes transactions >= 5000 atomic units via onchain_sponsored or daily cap fallback", async () => {
    const normalSigHeader = await createValidPaymentSignature(sellerAccount.address, "10000");

    // Standard call without KV cap exceeded
    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: normalSigHeader,
          validation: { expectedStatus: [200] }
        })
      }),
      {
        ...testEnv,
        SETTLEMENT_MODE: "onchain",
        MIN_ONCHAIN_ATOMIC: "5000"
      }
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.cleared).toBe(true);
    expect(json.settlementRouting).toBe("onchain_sponsored");

    // Test with mock KV indicating daily cap exceeded
    const cappedSigHeader = await createValidPaymentSignature(sellerAccount.address, "10000");
    const mockKv = {
      get: async () => "50", // already at 50 limit
      put: async () => {}
    };

    const cappedRes = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: cappedSigHeader,
          validation: { expectedStatus: [200] }
        })
      }),
      {
        ...testEnv,
        SETTLEMENT_MODE: "onchain",
        MIN_ONCHAIN_ATOMIC: "5000",
        MAX_DAILY_ONCHAIN_PER_WALLET: "50",
        KV: mockKv as any
      }
    );

    expect(cappedRes.status).toBe(200);
    const cappedJson = (await cappedRes.json()) as any;
    expect(cappedJson.cleared).toBe(true);
    expect(cappedJson.settlementRouting).toBe("facilitator_daily_cap_fallback");
  });

  // 18. Deep Deterministic Invariants & LLM Refusal Guard
  it("rejects response when value invariants or LLM refusal guard fail", async () => {
    // 18A: Numeric invariant gt fails
    const sig1 = await createValidPaymentSignature(sellerAccount.address, "10000");
    const res1 = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: sig1,
          validation: {
            expectedStatus: [200],
            invariants: [{ path: "price", gt: 100000 }] // price is 68500, fails gt 100000
          }
        })
      }),
      testEnv
    );
    expect(res1.status).toBe(422);
    const json1 = (await res1.json()) as any;
    expect(json1.cleared).toBe(false);
    expect(json1.validationErrors.some((e: string) => e.includes("expected > 100000"))).toBe(true);

    // 18B: notContains invariant fails
    const sig2 = await createValidPaymentSignature(sellerAccount.address, "10000");
    const res2 = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: sig2,
          validation: {
            expectedStatus: [200],
            invariants: [{ path: "ticker", notContains: ["btc"] }]
          }
        })
      }),
      testEnv
    );
    expect(res2.status).toBe(422);
    const json2 = (await res2.json()) as any;
    expect(json2.cleared).toBe(false);
    expect(json2.validationErrors.some((e: string) => e.includes("forbidden substring 'btc'"))).toBe(true);

    // 18C: LLM Refusal pattern detected
    const sig3 = await createValidPaymentSignature(sellerAccount.address, "10000");
    const res3 = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/refusal`,
          paymentSignatureHeader: sig3,
          validation: {
            expectedStatus: [200],
            rejectRefusals: true
          }
        })
      }),
      testEnv
    );
    expect(res3.status).toBe(422);
    const json3 = (await res3.json()) as any;
    expect(json3.cleared).toBe(false);
    expect(json3.validationErrors.some((e: string) => e.includes("LLM refusal pattern detected"))).toBe(true);
  });

  // 19. Autonomous Multi-Seller Failover Routing
  it("autonomously fails over from failing primary seller to valid fallback candidate in single request", async () => {
    const primarySig = await createValidPaymentSignature(sellerAccount.address, "10000");
    const backupSig = await createValidPaymentSignature(sellerAccount.address, "10000");

    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/corrupted`, // primary seller returns malformed types
          sellerAgentId: "flaky-primary-seller",
          paymentSignatureHeader: primarySig,
          validation: {
            expectedStatus: [200],
            jsonSchema: {
              type: "object",
              required: ["ticker", "price", "active"]
            }
          },
          fallbacks: [
            {
              targetUrl: `http://127.0.0.1:${mockServerPort}/honest`, // fallback seller returns valid schema
              sellerAgentId: "reliable-backup-seller",
              paymentSignatureHeader: backupSig
            }
          ]
        })
      }),
      testEnv
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.cleared).toBe(true);
    expect(json.settled).toBe(true);
    expect(json.failoverAttempts).toBe(1);
    expect(json.winningSellerAgentId).toBe("reliable-backup-seller");
    expect(json.failedCandidates.length).toBe(1);
    expect(json.failedCandidates[0].targetUrl).toContain("/corrupted");
    expect(json.data.ticker).toBe("BTC-USDC");
  });

  // 20. Outbound Spend Firewall
  it("enforces spend policy caps: 403 SPEND_LIMIT_EXCEEDED and DAILY_SPEND_CAP_EXCEEDED", async () => {
    // 20A: Per-call limit exceeded
    const sigHeader = await createValidPaymentSignature(sellerAccount.address, "50000");
    const resPerCall = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: sigHeader,
          spendPolicy: {
            maxPerCallAtomic: "10000" // 50000 > 10000 limit
          }
        })
      }),
      testEnv
    );
    expect(resPerCall.status).toBe(403);
    const jsonPerCall = (await resPerCall.json()) as any;
    expect(jsonPerCall.error).toBe("SPEND_LIMIT_EXCEEDED");

    // 20B: Daily wallet cap exceeded
    const mockDailyKv = {
      get: async () => "9000",
      put: async () => {}
    };
    const resDaily = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: `http://127.0.0.1:${mockServerPort}/honest`,
          paymentSignatureHeader: sigHeader, // 50000 + 9000 > 55000 cap
          spendPolicy: {
            maxDailyWalletAtomic: "55000"
          }
        })
      }),
      {
        ...testEnv,
        KV: mockDailyKv as any
      }
    );
    expect(resDaily.status).toBe(403);
    const jsonDaily = (await resDaily.json()) as any;
    expect(jsonDaily.error).toBe("DAILY_SPEND_CAP_EXCEEDED");
  });

  // 21. Health Check Endpoint
  it("GET /health returns 200 with status ok and version 1.1.2", async () => {
    const res = await app.fetch(new Request("http://localhost/health"), testEnv);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.status).toBe("ok");
    expect(json.protocol).toBe("NullClear");
    expect(json.version).toBe("1.1.2");
  });

  // 22. Live Sandbox 402 Seller Endpoints & Public Stats
  it("GET /v1/sandbox/market-feed returns 402 without payment and 200 with payment", async () => {
    // Without payment header
    const res402 = await app.fetch(new Request("http://localhost/v1/sandbox/market-feed"), testEnv);
    expect(res402.status).toBe(402);
    expect(res402.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    const json402 = (await res402.json()) as any;
    expect(json402.error).toBe("Payment Required");
    expect(json402.amount).toBe("1000");

    // With payment signature
    const sigHeader = await createValidPaymentSignature(sellerAccount.address, "1000");
    const res200 = await app.fetch(
      new Request("http://localhost/v1/sandbox/market-feed", {
        headers: { "PAYMENT-SIGNATURE": sigHeader }
      }),
      testEnv
    );
    expect(res200.status).toBe(200);
    const json200 = (await res200.json()) as any;
    expect(json200.asset).toBe("ETH/USDC");
    expect(json200.price).toBe(2645.50);
    expect(json200.source).toBe("NullClear Verified Feed");
  });

  it("GET /v1/sandbox/hallucinating-seller returns 402 without payment, and refusal data with payment", async () => {
    const res402 = await app.fetch(new Request("http://localhost/v1/sandbox/hallucinating-seller"), testEnv);
    expect(res402.status).toBe(402);

    const sigHeader = await createValidPaymentSignature(sellerAccount.address, "1000");
    const res200 = await app.fetch(
      new Request("http://localhost/v1/sandbox/hallucinating-seller", {
        headers: { "PAYMENT-SIGNATURE": sigHeader }
      }),
      testEnv
    );
    expect(res200.status).toBe(200);
    const json200 = (await res200.json()) as any;
    expect(json200.price).toBe(-9999);
    expect(json200.summary).toContain("As an AI language model");
  });

  it("POST /v1/clear against sandbox endpoints validates, settles, and reports in /v1/stats", async () => {
    const sigHeader = await createValidPaymentSignature(sellerAccount.address, "1000");
    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: "http://localhost/v1/sandbox/market-feed",
          paymentSignatureHeader: sigHeader,
          sellerAgentId: "124595",
          validation: {
            expectedStatus: [200],
            invariants: [{ path: "price", gt: 0 }]
          }
        })
      }),
      testEnv
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.cleared).toBe(true);
    expect(json.settled).toBe(true);
    expect(json.settlementRouting).toBe("sandbox_simulated");
    expect(json.data.price).toBe(2645.50);
    expect(json.attestation).toBeDefined();

    // Verify /v1/stats records this clearing
    const statsRes = await app.fetch(new Request("http://localhost/v1/stats"), testEnv);
    expect(statsRes.status).toBe(200);
    const stats = (await statsRes.json()) as any;
    expect(stats.totalClearings).toBeGreaterThanOrEqual(1);
    expect(stats.validSettlements).toBeGreaterThanOrEqual(1);
    expect(stats.recentClearings.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /v1/clear voids hallucinating seller and successfully fails over to market feed", async () => {
    const primarySig = await createValidPaymentSignature(sellerAccount.address, "1000");
    const fallbackSig = await createValidPaymentSignature(sellerAccount.address, "1000");

    const res = await app.fetch(
      new Request("http://localhost/v1/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: "http://localhost/v1/sandbox/hallucinating-seller",
          paymentSignatureHeader: primarySig,
          sellerAgentId: "124550",
          validation: {
            expectedStatus: [200],
            rejectRefusals: true,
            invariants: [{ path: "price", gt: 0 }]
          },
          fallbacks: [
            {
              targetUrl: "http://localhost/v1/sandbox/market-feed",
              paymentSignatureHeader: fallbackSig,
              sellerAgentId: "124595"
            }
          ]
        })
      }),
      testEnv
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.cleared).toBe(true);
    expect(json.settled).toBe(true);
    expect(json.failoverAttempts).toBe(1);
    expect(json.failedCandidates.length).toBe(1);
    expect(json.failedCandidates[0].sellerAgentId).toBe("124550");
    expect(json.winningSellerAgentId).toBe("124595");
    expect(json.data.price).toBe(2645.50);
  });

  // 12. Bazaar Endpoints
  it("GET /v1/bazaar/audit returns 402 without payment and 200 with simulated test payment", async () => {
    const res402 = await app.fetch(new Request("http://localhost/v1/bazaar/audit?agentId=124595"), testEnv);
    expect(res402.status).toBe(402);
    expect(res402.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    const json402 = (await res402.json()) as any;
    expect(json402.amount).toBe("10000");

    const testSig = await createValidPaymentSignature(sellerAccount.address, "10000");
    const res200 = await app.fetch(
      new Request("http://localhost/v1/bazaar/audit?agentId=124595", {
        headers: { "PAYMENT-SIGNATURE": testSig }
      }),
      testEnv
    );
    expect(res200.status).toBe(200);
    expect(res200.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
    expect(res200.headers.get("X-PAYMENT-RESPONSE")).toBeTruthy();
    const json200 = (await res200.json()) as any;
    expect(json200.agentId).toBe("124595");
    expect(json200.trustScore).toBeDefined();
    expect(json200.settlementTransaction).toBeDefined();
  });

  it("GET /v1/bazaar/token-security returns 402 without payment and 200 with payment", async () => {
    const res402 = await app.fetch(new Request("http://localhost/v1/bazaar/token-security"), testEnv);
    expect(res402.status).toBe(402);
    expect(res402.headers.get("PAYMENT-REQUIRED")).toBeTruthy();

    const testSig = await createValidPaymentSignature(sellerAccount.address, "10000");
    const res200 = await app.fetch(
      new Request("http://localhost/v1/bazaar/token-security", {
        headers: { "PAYMENT-SIGNATURE": testSig }
      }),
      testEnv
    );
    expect(res200.status).toBe(200);
    expect(res200.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
    const json200 = (await res200.json()) as any;
    expect(json200.symbol).toBe("USDC");
    expect(json200.x402Compatible).toBe(true);
  });

  it("GET /v1/bazaar/market-oracle, /wallet-risk, /verified-fetch, and POST /verify enforce 402 Before 400 and settle with test payment", async () => {
    // 1. Unauthenticated probes (empty query/body) MUST return 402 Before 400 with full bazaar schema
    for (const [method, path] of [
      ["GET", "/v1/bazaar/market-oracle"],
      ["GET", "/v1/bazaar/wallet-risk"],
      ["GET", "/v1/bazaar/verified-fetch"],
      ["POST", "/v1/bazaar/verified-fetch"],
      ["POST", "/v1/bazaar/audit"],
      ["POST", "/v1/bazaar/verify"]
    ] as const) {
      const probeRes = await app.fetch(new Request(`http://localhost${path}`, { method }), testEnv);
      expect(probeRes.status).toBe(402);
      expect(probeRes.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
      const probeJson = (await probeRes.json()) as any;
      expect(probeJson.x402Version).toBe(2);
      expect(probeJson.extensions?.bazaar?.schema?.properties?.input).toBeDefined();
      expect(probeJson.extensions?.bazaar?.schema?.properties?.output?.properties?.example).toBeDefined();
    }

    // 2. Paid GET /v1/bazaar/market-oracle
    const sigOracle = await createValidPaymentSignature(sellerAccount.address, "10000");
    const resOracle = await app.fetch(
      new Request("http://localhost/v1/bazaar/market-oracle?symbol=ETH", {
        headers: { "PAYMENT-SIGNATURE": sigOracle }
      }),
      testEnv
    );
    expect(resOracle.status).toBe(200);
    const jsonOracle = (await resOracle.json()) as any;
    expect(jsonOracle.symbol).toBe("ETH");
    expect(jsonOracle.priceUsd).toBeGreaterThan(0);
    expect(jsonOracle.verified).toBe(true);

    // 3. Paid GET /v1/bazaar/wallet-risk
    const sigWallet = await createValidPaymentSignature(sellerAccount.address, "10000");
    const resWallet = await app.fetch(
      new Request("http://localhost/v1/bazaar/wallet-risk?address=0xfd74fF802EA0E735514C070AF04E0D6528deD145", {
        headers: { "PAYMENT-SIGNATURE": sigWallet }
      }),
      testEnv
    );
    expect(resWallet.status).toBe(200);
    const jsonWallet = (await resWallet.json()) as any;
    expect(jsonWallet.address.toLowerCase()).toBe("0xfd74ff802ea0e735514c070af04e0d6528ded145");
    expect(jsonWallet.erc8004Registered).toBe(true);
    expect(jsonWallet.riskScore).toBeGreaterThanOrEqual(80);

    // 4. Paid GET /v1/bazaar/verified-fetch against local mock server
    const sigFetch = await createValidPaymentSignature(sellerAccount.address, "10000");
    const resFetch = await app.fetch(
      new Request(`http://localhost/v1/bazaar/verified-fetch?url=${encodeURIComponent(`http://127.0.0.1:${mockServerPort}/honest`)}`, {
        headers: { "PAYMENT-SIGNATURE": sigFetch }
      }),
      testEnv
    );
    expect(resFetch.status).toBe(200);
    const jsonFetch = (await resFetch.json()) as any;
    expect(jsonFetch.verified).toBe(true);
    expect(jsonFetch.refusalDetected).toBe(false);
    expect(jsonFetch.invariantsPassed).toBe(true);

    // 5. Paid POST /v1/bazaar/verify
    const sigVerify = await createValidPaymentSignature(sellerAccount.address, "10000");
    const resVerify = await app.fetch(
      new Request("http://localhost/v1/bazaar/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-SIGNATURE": sigVerify
        },
        body: JSON.stringify({
          payload: { asset: "ETH", price: 2645.5 },
          invariants: [{ path: "price", gt: 0 }]
        })
      }),
      testEnv
    );
    expect(resVerify.status).toBe(200);
    const jsonVerify = (await resVerify.json()) as any;
    expect(jsonVerify.verified).toBe(true);
    expect(jsonVerify.escrowSupported).toBe(true);
  });

  // 23. AgentCash OpenAPI 3.1.0, /.well-known/x402, /agents.md, and POST /a2a
  it("serves AgentCash-compliant /openapi.json, /agents.md, /.well-known/x402, and JSON-RPC 2.0 /a2a", async () => {
    for (const openApiPath of ["/openapi.json", "/api/v1/openapi.json", "/.well-known/openapi.json"]) {
      const resOpenApi = await app.fetch(new Request(`http://localhost${openApiPath}`), testEnv);
      expect(resOpenApi.status).toBe(200);
      const spec = (await resOpenApi.json()) as any;
      expect(spec.openapi).toBe("3.1.0");
      expect(typeof spec.info["x-guidance"]).toBe("string");
      expect(spec["x-discovery"]?.ownershipProofs).toEqual([]);
      expect(spec.components?.securitySchemes?.x402).toBeDefined();

      const oracleGet = spec.paths["/v1/bazaar/market-oracle"]?.get;
      expect(oracleGet?.["x-payment-info"]).toEqual({
        price: { mode: "fixed", currency: "USD", amount: "0.01" },
        protocols: [{ x402: {} }]
      });
    }

    const resAgentsMd = await app.fetch(new Request("http://localhost/agents.md"), testEnv);
    expect(resAgentsMd.status).toBe(200);
    const mdText = await resAgentsMd.text();
    expect(mdText).toContain("NullClear Protocol");
    expect(mdText).toContain("124595");

    const resX402 = await app.fetch(new Request("http://localhost/.well-known/x402"), testEnv);
    expect(resX402.status).toBe(200);
    const x402Json = (await resX402.json()) as any;
    expect(x402Json.x402Version).toBe(2);

    // Test POST /a2a JSON-RPC 2.0
    const resA2aMsg = await app.fetch(
      new Request("http://localhost/a2a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "req-1",
          method: "message/send",
          params: {
            message: {
              parts: [{ type: "text", text: "audit agent 124595" }]
            }
          }
        })
      }),
      testEnv
    );
    expect(resA2aMsg.status).toBe(200);
    const a2aJson = (await resA2aMsg.json()) as any;
    expect(a2aJson.jsonrpc).toBe("2.0");
    expect(a2aJson.id).toBe("req-1");
    expect(a2aJson.result?.status?.state).toBe("completed");
    expect(a2aJson.result?.data?.agentId).toBe("124595");
  });
});

