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
    expect(data1.endpoints.clear).toBe("/v1/clear");
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
});
