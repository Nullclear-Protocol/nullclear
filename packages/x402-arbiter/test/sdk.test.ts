import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import { z } from "zod";
import {
  BASE_MAINNET,
  EIP3009_TYPES,
  decodeBase64Json,
  encodeBase64Json,
  type X402PaymentOption,
  type X402PaymentRequired,
  type X402PaymentSignaturePayload
} from "@nullclear/shared";
import { app as arbiterApp } from "@nullclear/worker-arbiter";
import {
  signX402Payment,
  createNullClearFetch,
  NullClearEscrowAbortedError,
  zodToJsonSchema,
  NullClearClient
} from "../src/index.js";

describe("@nullclear/x402-arbiter SDK Test Suite", () => {
  let mockServer: http.Server;
  let mockServerPort: number;

  const buyerKey = generatePrivateKey();
  const buyerAccount = privateKeyToAccount(buyerKey);

  const sellerKey = generatePrivateKey();
  const sellerAccount = privateKeyToAccount(sellerKey);

  const arbiterKey = generatePrivateKey();

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      const url = req.url || "/";
      const paymentSigHeader = req.headers["payment-signature"];

      const paymentRequired: X402PaymentRequired = {
        x402Version: 2,
        resource: { url: `http://127.0.0.1:${mockServerPort}${url}` },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            amount: "25000",
            asset: BASE_MAINNET.usdc,
            payTo: sellerAccount.address,
            maxTimeoutSeconds: 300
          }
        ]
      };

      if (url === "/unprotected") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ free: true }));
      }

      if (url === "/protected-valid") {
        if (!paymentSigHeader) {
          res.writeHead(402, {
            "Content-Type": "application/json",
            "PAYMENT-REQUIRED": encodeBase64Json(paymentRequired)
          });
          return res.end(JSON.stringify({ error: "Payment required" }));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ticker: "USDC", price: 1.0, count: 100 }));
      }

      if (url === "/protected-corrupted") {
        if (!paymentSigHeader) {
          res.writeHead(402, {
            "Content-Type": "application/json",
            "PAYMENT-REQUIRED": encodeBase64Json(paymentRequired)
          });
          return res.end(JSON.stringify({ error: "Payment required" }));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ticker: "USDC", price: "string-instead-of-number", count: false }));
      }

      if (url === "/protected-crash") {
        if (!paymentSigHeader) {
          res.writeHead(402, {
            "Content-Type": "application/json",
            "PAYMENT-REQUIRED": encodeBase64Json(paymentRequired)
          });
          return res.end(JSON.stringify({ error: "Payment required" }));
        }
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Upstream crashed" }));
      }

      res.writeHead(404);
      res.end();
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

  // 1. Signature generation
  it("signX402Payment produces valid cryptographically verifiable EIP-3009 signature", async () => {
    const option: X402PaymentOption = {
      scheme: "exact",
      network: "eip155:8453",
      amount: "25000",
      asset: BASE_MAINNET.usdc,
      payTo: sellerAccount.address,
      maxTimeoutSeconds: 300
    };

    const base64Payload = await signX402Payment(buyerKey, option, "https://agent.test/api");
    expect(base64Payload).toBeDefined();

    const decoded = decodeBase64Json<X402PaymentSignaturePayload>(base64Payload);
    expect(decoded.x402Version).toBe(2);
    expect(decoded.payload.authorization.from.toLowerCase()).toBe(buyerAccount.address.toLowerCase());
    expect(decoded.payload.authorization.to.toLowerCase()).toBe(sellerAccount.address.toLowerCase());
    expect(decoded.payload.authorization.value).toBe("25000");

    // Cryptographic verification via viem verifyTypedData
    const isValid = await verifyTypedData({
      address: buyerAccount.address,
      domain: {
        name: BASE_MAINNET.usdcDomain.name,
        version: BASE_MAINNET.usdcDomain.version,
        chainId: BASE_MAINNET.chainId,
        verifyingContract: BASE_MAINNET.usdc
      },
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: decoded.payload.authorization.from,
        to: decoded.payload.authorization.to,
        value: BigInt(decoded.payload.authorization.value),
        validAfter: BigInt(decoded.payload.authorization.validAfter),
        validBefore: BigInt(decoded.payload.authorization.validBefore),
        nonce: decoded.payload.authorization.nonce
      },
      signature: decoded.payload.signature
    });

    expect(isValid).toBe(true);
  });

  // 2. Zod-to-JSON-Schema converter
  it("zodToJsonSchema converts Zod object into valid draft-07 JSON Schema", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
      tags: z.array(z.string()),
      optionalNote: z.string().optional()
    });

    const jsonSchema = zodToJsonSchema(schema);
    expect(jsonSchema.type).toBe("object");
    expect((jsonSchema.properties as any).name.type).toBe("string");
    expect((jsonSchema.properties as any).age.type).toBe("number");
    expect((jsonSchema.properties as any).active.type).toBe("boolean");
    expect((jsonSchema.properties as any).tags.type).toBe("array");
    expect(jsonSchema.required).toContain("name");
    expect(jsonSchema.required).toContain("age");
    expect(jsonSchema.required).not.toContain("optionalNote");
  });

  // 3. createNullClearFetch test with in-process arbiter dispatcher
  it("createNullClearFetch leaves non-402 requests unmodified", async () => {
    const nullclearFetch = createNullClearFetch({
      accountOrPrivateKey: buyerKey,
      chainId: 8453
    });

    const res = await nullclearFetch(`http://127.0.0.1:${mockServerPort}/unprotected`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(true);
  });

  it("createNullClearFetch intercepts 402, signs EIP-3009 and settles valid output", async () => {
    const customFetch: typeof fetch = async (input, init) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.startsWith("https://mock-arbiter/")) {
        const path = urlStr.replace("https://mock-arbiter", "");
        return arbiterApp.fetch(
          new Request(`http://localhost${path}`, {
            method: init?.method,
            headers: init?.headers,
            body: init?.body as any
          }),
          { ARBITER_PRIVATE_KEY: arbiterKey }
        );
      }
      return fetch(input, init);
    };

    const nullclearFetch = createNullClearFetch({
      accountOrPrivateKey: buyerKey,
      chainId: 8453,
      arbiterUrl: "https://mock-arbiter",
      customFetch
    });

    const res = await nullclearFetch(`http://127.0.0.1:${mockServerPort}/protected-valid`, {
      nullclear: {
        sellerAgentId: "seller-test-1",
        schema: z.object({
          ticker: z.string(),
          price: z.number(),
          count: z.number()
        })
      }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ticker).toBe("USDC");
    expect(data.price).toBe(1.0);
    expect(res.headers.get("X-NullClear-Attestation")).toBeDefined();
    expect(res.headers.get("PAYMENT-RESPONSE")).toBeDefined();
  });

  it("createNullClearFetch throws NullClearEscrowAbortedError ($0 lost) on schema mismatch", async () => {
    const customFetch: typeof fetch = async (input, init) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.startsWith("https://mock-arbiter/")) {
        const path = urlStr.replace("https://mock-arbiter", "");
        return arbiterApp.fetch(
          new Request(`http://localhost${path}`, {
            method: init?.method,
            headers: init?.headers,
            body: init?.body as any
          }),
          { ARBITER_PRIVATE_KEY: arbiterKey }
        );
      }
      return fetch(input, init);
    };

    const nullclearFetch = createNullClearFetch({
      accountOrPrivateKey: buyerKey,
      chainId: 8453,
      arbiterUrl: "https://mock-arbiter",
      customFetch
    });

    try {
      await nullclearFetch(`http://127.0.0.1:${mockServerPort}/protected-corrupted`, {
        nullclear: {
          sellerAgentId: "seller-corrupt",
          schema: z.object({
            ticker: z.string(),
            price: z.number(),
            count: z.number()
          })
        }
      });
      expect.fail("Expected fetch to throw NullClearEscrowAbortedError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(NullClearEscrowAbortedError);
      expect(err.buyerCharged).toBe("0");
      expect(err.stage).toBe("SCHEMA_VALIDATION_FAILED");
      expect(err.validationErrors.length).toBeGreaterThan(0);
    }
  });

  it("createNullClearFetch throws NullClearEscrowAbortedError ($0 lost) on upstream 500 crash", async () => {
    const customFetch: typeof fetch = async (input, init) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.startsWith("https://mock-arbiter/")) {
        const path = urlStr.replace("https://mock-arbiter", "");
        return arbiterApp.fetch(
          new Request(`http://localhost${path}`, {
            method: init?.method,
            headers: init?.headers,
            body: init?.body as any
          }),
          { ARBITER_PRIVATE_KEY: arbiterKey }
        );
      }
      return fetch(input, init);
    };

    const nullclearFetch = createNullClearFetch({
      accountOrPrivateKey: buyerKey,
      chainId: 8453,
      arbiterUrl: "https://mock-arbiter",
      customFetch
    });

    try {
      await nullclearFetch(`http://127.0.0.1:${mockServerPort}/protected-crash`, {
        nullclear: {
          sellerAgentId: "seller-crashed"
        }
      });
      expect.fail("Expected fetch to throw NullClearEscrowAbortedError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(NullClearEscrowAbortedError);
      expect(err.buyerCharged).toBe("0");
    }
  });
});
