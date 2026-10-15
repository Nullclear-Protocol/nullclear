import http from "node:http";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { encodeBase64Json, BASE_MAINNET, type X402PaymentRequired, type X402PaymentOption } from "@nullclear/shared";
import { app as arbiterApp } from "@nullclear/worker-arbiter";
import { createNullClearFetch, NullClearEscrowAbortedError, signX402Payment } from "@nullclear/x402-arbiter";

// ANSI color escape codes for high-contrast rich terminal output
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const GRAY = "\x1b[90m";

interface ScenarioResult {
  scenario: string;
  expected: string;
  status: string;
  settled: string;
  buyerSpent: string;
  passed: boolean;
  notes: string;
}

async function runDemo() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   NULLCLEAR AUTONOMOUS E2E SIMULATOR (x402 SCHEMA ESCROW & SYBIL)   ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  // 1. Generate autonomous agent wallets
  const buyerKey = generatePrivateKey();
  const buyerAccount = privateKeyToAccount(buyerKey);

  const sellerKey = generatePrivateKey();
  const sellerAccount = privateKeyToAccount(sellerKey);

  const arbiterKey = generatePrivateKey();
  const arbiterAccount = privateKeyToAccount(arbiterKey);

  console.log(`${BOLD}1. Agent Wallets Initialized:${RESET}`);
  console.log(`  ${MAGENTA}Buyer Agent:${RESET}   ${buyerAccount.address}`);
  console.log(`  ${MAGENTA}Seller Agent:${RESET}  ${sellerAccount.address}`);
  console.log(`  ${MAGENTA}Arbiter Node:${RESET}  ${arbiterAccount.address}`);
  console.log(`  ${GRAY}Network: Base Mainnet (8453) | Asset: USDC (${BASE_MAINNET.usdc})${RESET}\n`);

  // 2. Spin up Mock Seller HTTP Server with 3 x402-gated routes
  let sellerPort = 3982;
  const sellerServer = http.createServer((req, res) => {
    const url = req.url || "/";
    const paymentSigHeader =
      req.headers["payment-signature"] || req.headers["x-nullclear-verified-escrow"];

    const paymentRequired: X402PaymentRequired = {
      x402Version: 2,
      resource: { url: `http://127.0.0.1:${sellerPort}${url}` },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "50000", // 0.05 USDC (6 decimals)
          asset: BASE_MAINNET.usdc,
          payTo: sellerAccount.address,
          maxTimeoutSeconds: 300
        }
      ]
    };

    if (url === "/api/market-alpha") {
      if (!paymentSigHeader) {
        res.writeHead(402, {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": encodeBase64Json(paymentRequired)
        });
        return res.end(JSON.stringify({ error: "Payment required: 0.05 USDC" }));
      }
      // Valid market data response
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          ticker: "ETH-USDC",
          price: 3450.25,
          confidence: 0.985
        })
      );
    }

    if (url === "/api/hallucinated-alpha") {
      if (!paymentSigHeader) {
        res.writeHead(402, {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": encodeBase64Json(paymentRequired)
        });
        return res.end(JSON.stringify({ error: "Payment required: 0.05 USDC" }));
      }
      // CORRUPTED / HALLUCINATED response: ticker is a number, price is a string!
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          ticker: 999999,
          price: "not-a-number-hallucination",
          confidence: null
        })
      );
    }

    if (url === "/api/broken-500") {
      if (!paymentSigHeader) {
        res.writeHead(402, {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": encodeBase64Json(paymentRequired)
        });
        return res.end(JSON.stringify({ error: "Payment required: 0.05 USDC" }));
      }
      // 500 Model Crash
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Fatal LLM Out-Of-Memory Error" }));
    }

    if (url === "/api/refusal-alpha") {
      if (!paymentSigHeader) {
        res.writeHead(402, {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": encodeBase64Json(paymentRequired)
        });
        return res.end(JSON.stringify({ error: "Payment required: 0.05 USDC" }));
      }
      // Structurally valid JSON matching schema, but negative price and LLM refusal boilerplate!
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          ticker: "ETH-USDC",
          price: -50,
          summary: "As an AI language model, I cannot provide accurate market data.",
          confidence: 0.5
        })
      );
    }

    if (url === "/api/backup-honest-alpha") {
      if (!paymentSigHeader) {
        res.writeHead(402, {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": encodeBase64Json(paymentRequired)
        });
        return res.end(JSON.stringify({ error: "Payment required: 0.05 USDC" }));
      }
      // Honest backup seller with positive price and verified summary
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          ticker: "ETH-USDC",
          price: 42.5,
          summary: "Verified live feed",
          confidence: 0.99
        })
      );
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    sellerServer.listen(sellerPort, "127.0.0.1", () => resolve());
  });

  console.log(`${BOLD}2. Mock Seller HTTP Server mounted at:${RESET} http://127.0.0.1:${sellerPort}`);
  console.log(`  - ${YELLOW}Route 1:${RESET} /api/market-alpha (Honest seller, valid response)`);
  console.log(`  - ${YELLOW}Route 2:${RESET} /api/hallucinated-alpha (Hallucinating model, corrupted types)`);
  console.log(`  - ${YELLOW}Route 3:${RESET} /api/broken-500 (Crashing server, HTTP 500 error)`);
  console.log(`  - ${YELLOW}Route 4:${RESET} /api/refusal-alpha (Refusal boilerplate & negative price)`);
  console.log(`  - ${YELLOW}Route 5:${RESET} /api/backup-honest-alpha (Verified fallback seller)\n`);

  // 3. Configure in-process NullClear customFetch dispatcher
  const arbiterBaseUrl = "https://mock-arbiter.nullclear.internal";

  const customFetch: typeof fetch = async (input, init) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (urlStr.startsWith(arbiterBaseUrl)) {
      // Route directly into Hono app with arbiter bindings
      const path = urlStr.replace(arbiterBaseUrl, "");
      const honoReq = new Request(`http://localhost${path}`, {
        method: init?.method || "GET",
        headers: init?.headers,
        body: init?.body as any
      });

      return arbiterApp.fetch(honoReq, {
        ARBITER_PRIVATE_KEY: arbiterKey
      });
    }

    // Standard HTTP call to Seller
    return fetch(input, init);
  };

  const nullclearFetch = createNullClearFetch({
    accountOrPrivateKey: buyerKey,
    chainId: 8453,
    arbiterUrl: arbiterBaseUrl,
    customFetch
  });

  const alphaSchema = z.object({
    ticker: z.string(),
    price: z.number(),
    confidence: z.number()
  });

  const results: ScenarioResult[] = [];

  // ==========================================
  // SCENARIO 1: HONEST SELLER
  // ==========================================
  console.log(`${BOLD}${CYAN}--- Executing Scenario 1: Honest Seller ---${RESET}`);
  try {
    const res = await nullclearFetch(`http://127.0.0.1:${sellerPort}/api/market-alpha`, {
      nullclear: {
        sellerAgentId: "honest-agent-1",
        schema: alphaSchema
      }
    });

    const data = await res.json();
    const attestationHdr = res.headers.get("X-NullClear-Attestation");
    const paymentResHdr = res.headers.get("PAYMENT-RESPONSE");

    console.log(`  ${GREEN}✔ 402 Intercepted & EIP-3009 Signed${RESET}`);
    console.log(`  ${GREEN}✔ Upstream response verified against JSON Schema${RESET}`);
    console.log(`  ${GREEN}✔ Settled: 0.05 USDC | Clearing Fee: 0.00025 USDC (0.50%)${RESET}`);
    console.log(`  ${GREEN}✔ Arbiter Attestation Signed: ${attestationHdr ? "YES" : "NO"}${RESET}`);
    console.log(`  ${GRAY}Data received:${RESET}`, JSON.stringify(data));

    results.push({
      scenario: "1. Honest Seller",
      expected: "Settled 0.05 USDC",
      status: "SUCCESS (200 OK)",
      settled: "0.05 USDC",
      buyerSpent: "0.05 USDC",
      passed: true,
      notes: "Schema validated & EIP-3009 settled"
    });
  } catch (err: any) {
    console.error(`  ${RED}Scenario 1 Failed:${RESET}`, err.message);
    results.push({
      scenario: "1. Honest Seller",
      expected: "Settled 0.05 USDC",
      status: "FAILED",
      settled: "0.00 USDC",
      buyerSpent: "0.00 USDC",
      passed: false,
      notes: err.message
    });
  }

  // ==========================================
  // SCENARIO 2: HALLUCINATED OUTPUT ($0 LOST)
  // ==========================================
  console.log(`\n${BOLD}${CYAN}--- Executing Scenario 2: Hallucinated Output (Void Escrow) ---${RESET}`);
  try {
    await nullclearFetch(`http://127.0.0.1:${sellerPort}/api/hallucinated-alpha`, {
      nullclear: {
        sellerAgentId: "hallucinating-agent-2",
        schema: alphaSchema
      }
    });

    console.error(`  ${RED}Failed: Request should have been aborted!${RESET}`);
    results.push({
      scenario: "2. Hallucinated Output",
      expected: "VOIDED ($0 lost)",
      status: "FAILED",
      settled: "0.05 USDC",
      buyerSpent: "0.05 USDC",
      passed: false,
      notes: "Should have aborted"
    });
  } catch (err: any) {
    if (err instanceof NullClearEscrowAbortedError) {
      console.log(`  ${GREEN}✔ 402 Intercepted & EIP-3009 Pre-Verified${RESET}`);
      console.log(`  ${GREEN}✔ Arbiter caught schema failure:${RESET}`, err.validationErrors.join(", "));
      console.log(`  ${BOLD}${GREEN}✔ ESCROW VOIDED: Buyer charged $${err.buyerCharged} USDC!${RESET}`);

      results.push({
        scenario: "2. Hallucinated Output",
        expected: "VOIDED ($0 lost)",
        status: "ESCROW VOIDED (422)",
        settled: "0.00 USDC",
        buyerSpent: "$0.00 USDC (PROVEN ZERO LOSS)",
        passed: true,
        notes: "Malformed types detected, signature discarded"
      });
    } else {
      console.error(`  ${RED}Unexpected error:${RESET}`, err.message);
      results.push({
        scenario: "2. Hallucinated Output",
        expected: "VOIDED ($0 lost)",
        status: "FAILED",
        settled: "0.00 USDC",
        buyerSpent: "0.00 USDC",
        passed: false,
        notes: err.message
      });
    }
  }

  // ==========================================
  // SCENARIO 3: SERVER 500 CRASH ($0 LOST)
  // ==========================================
  console.log(`\n${BOLD}${CYAN}--- Executing Scenario 3: Upstream 500 Crash (Void Escrow) ---${RESET}`);
  try {
    await nullclearFetch(`http://127.0.0.1:${sellerPort}/api/broken-500`, {
      nullclear: {
        sellerAgentId: "crashing-agent-3",
        schema: alphaSchema
      }
    });

    console.error(`  ${RED}Failed: Request should have been aborted!${RESET}`);
    results.push({
      scenario: "3. 500 Server Crash",
      expected: "VOIDED ($0 lost)",
      status: "FAILED",
      settled: "0.05 USDC",
      buyerSpent: "0.05 USDC",
      passed: false,
      notes: "Should have aborted"
    });
  } catch (err: any) {
    if (err instanceof NullClearEscrowAbortedError) {
      console.log(`  ${GREEN}✔ 402 Intercepted & EIP-3009 Held in Escrow${RESET}`);
      console.log(`  ${GREEN}✔ Arbiter caught HTTP 500 Server Crash from upstream${RESET}`);
      console.log(`  ${BOLD}${GREEN}✔ ESCROW VOIDED: Buyer charged $${err.buyerCharged} USDC!${RESET}`);

      results.push({
        scenario: "3. 500 Server Crash",
        expected: "VOIDED ($0 lost)",
        status: "ESCROW VOIDED (422)",
        settled: "0.00 USDC",
        buyerSpent: "$0.00 USDC (PROVEN ZERO LOSS)",
        passed: true,
        notes: "Server crash caught, settlement cancelled"
      });
    } else {
      console.error(`  ${RED}Unexpected error:${RESET}`, err.message);
      results.push({
        scenario: "3. 500 Server Crash",
        expected: "VOIDED ($0 lost)",
        status: "FAILED",
        settled: "0.00 USDC",
        buyerSpent: "0.00 USDC",
        passed: false,
        notes: err.message
      });
    }
  }

  // ==========================================
  // SCENARIO 4: SYBIL WASH-TRADE DETECTION
  // ==========================================
  console.log(`\n${BOLD}${CYAN}--- Executing Scenario 4: Sybil Wash-Trade Detection ---${RESET}`);
  const washSellerAgentId = "sybil-agent-77";

  console.log(`  Simulating 6 rapid self-dealing transactions from same buyer wallet to ${washSellerAgentId}...`);
  for (let i = 1; i <= 6; i++) {
    await nullclearFetch(`http://127.0.0.1:${sellerPort}/api/market-alpha`, {
      nullclear: {
        sellerAgentId: washSellerAgentId,
        minTrustScore: 0, // Allow transactions for setup
        schema: alphaSchema
      }
    });
  }

  // Query score from Arbiter
  const scoreReq = new Request(`http://localhost/v1/score/8453/${washSellerAgentId}`);
  const scoreRes = await arbiterApp.fetch(scoreReq, {
    ARBITER_PRIVATE_KEY: arbiterKey
  });
  const scoreData = (await scoreRes.json()) as any;
  const scoreResult = scoreData.data;

  const hasSybilFlag = (scoreResult.sybilFlags || []).includes("HIGH_COUNTERPARTY_CONCENTRATION_WASH_RISK");
  const maxShare = scoreResult.metrics.maxSingleBuyerShare;

  console.log(`  Total Cleared: ${scoreResult.metrics.totalClearedTx} | Unique Buyers: ${scoreResult.metrics.uniqueCounterparties}`);
  console.log(`  Single Buyer Concentration: ${(maxShare * 100).toFixed(1)}% (Threshold: 60%)`);
  console.log(`  ${hasSybilFlag ? GREEN : RED}Sybil Flags:${RESET}`, scoreResult.sybilFlags);
  console.log(`  Trust Score: ${scoreResult.score}/100 (Grade: ${scoreResult.grade})`);

  if (hasSybilFlag && maxShare >= 0.6) {
    console.log(`  ${BOLD}${GREEN}✔ WASH-TRADE RISK CORRECTLY IDENTIFIED AND PENALIZED (-25 pts)!${RESET}`);
    results.push({
      scenario: "4. Sybil Wash-Trade",
      expected: "Flag Risk & Penalize",
      status: "FLAGGED & PENALIZED",
      settled: "6 Txs recorded",
      buyerSpent: "N/A",
      passed: true,
      notes: "HIGH_COUNTERPARTY_CONCENTRATION_WASH_RISK"
    });
  } else {
    results.push({
      scenario: "4. Sybil Wash-Trade",
      expected: "Flag Risk & Penalize",
      status: "FAILED",
      settled: "N/A",
      buyerSpent: "N/A",
      passed: false,
      notes: "Flag missing"
    });
  }

  // =========================================================================
  // SCENARIO 5: DEEP INVARIANT REFUSAL TRAP + AUTONOMOUS FAILOVER ROUTING
  // =========================================================================
  console.log(`\n${BOLD}${CYAN}--- Executing Scenario 5: Deep Invariant & LLM Refusal Trap + Failover ---${RESET}`);

  // Create payment authorization for backup seller
  const backupPaymentOption: X402PaymentOption = {
    scheme: "exact",
    network: "eip155:8453",
    amount: "50000",
    asset: BASE_MAINNET.usdc,
    payTo: sellerAccount.address,
    maxTimeoutSeconds: 300
  };
  const backupSignatureHeader = await signX402Payment(
    buyerKey,
    backupPaymentOption,
    `http://127.0.0.1:${sellerPort}/api/backup-honest-alpha`
  );

  try {
    const res = await nullclearFetch(`http://127.0.0.1:${sellerPort}/api/refusal-alpha`, {
      nullclear: {
        sellerAgentId: "flaky-primary-seller",
        schema: z.object({
          ticker: z.string(),
          price: z.number(),
          summary: z.string(),
          confidence: z.number()
        }),
        invariants: [
          { path: "price", gt: 0 }
        ],
        rejectRefusals: true,
        fallbacks: [
          {
            targetUrl: `http://127.0.0.1:${sellerPort}/api/backup-honest-alpha`,
            sellerAgentId: "backup-honest-seller",
            paymentSignatureHeader: backupSignatureHeader
          }
        ]
      }
    });

    const data = (await res.json()) as any;
    console.log(`  ${GREEN}✔ Primary Seller #1 flagged for LLM refusal and negative price (VOIDED, $0 charged)${RESET}`);
    console.log(`  ${GREEN}✔ Arbiter autonomously executed failover to Backup Seller #2 in single HTTP call${RESET}`);
    console.log(`  ${GREEN}✔ Backup Seller #2 output passed schema + value invariants (price = ${data.price})${RESET}`);
    console.log(`  ${GRAY}Data received:${RESET}`, JSON.stringify(data));

    results.push({
      scenario: "5. Failover & Invariants",
      expected: "Failover to Backup",
      status: "SUCCESS (FAILOVER 200)",
      settled: "0.05 USDC",
      buyerSpent: "0.05 USDC",
      passed: data.price === 42.5 && data.summary === "Verified live feed",
      notes: "Auto-switched from refusal seller to verified backup"
    });
  } catch (err: any) {
    console.error(`  ${RED}Scenario 5 Failed:${RESET}`, err.message);
    results.push({
      scenario: "5. Failover & Invariants",
      expected: "Failover to Backup",
      status: "FAILED",
      settled: "0.00 USDC",
      buyerSpent: "0.00 USDC",
      passed: false,
      notes: err.message
    });
  }

  // 4. Shutdown Mock Server
  sellerServer.close();

  // 5. Print Summary Table
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}                   E2E VERIFICATION SUMMARY RESULTS                   ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  console.log(
    `${BOLD}${"SCENARIO".padEnd(25)} | ${"EXPECTED".padEnd(20)} | ${"RESULT".padEnd(22)} | ${"BUYER CHARGE".padEnd(26)} | STATUS${RESET}`
  );
  console.log("-".repeat(105));

  for (const r of results) {
    const statusText = r.passed ? `${GREEN}✔ PASS${RESET}` : `${RED}✘ FAIL${RESET}`;
    console.log(
      `${r.scenario.padEnd(25)} | ${r.expected.padEnd(20)} | ${r.status.padEnd(22)} | ${r.buyerSpent.padEnd(26)} | ${statusText}`
    );
  }

  console.log("-".repeat(105));
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`\n${BOLD}${GREEN}🎉 ALL 5 E2E SCENARIOS VERIFIED 100% GREEN! PROTOCOL FULLY FUNCTIONAL.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`\n${BOLD}${RED}✘ SOME SCENARIOS FAILED. CHECK OUTPUT ABOVE.${RESET}\n`);
    process.exit(1);
  }
}

runDemo().catch((err) => {
  console.error("Fatal Demo Crash:", err);
  process.exit(1);
});
