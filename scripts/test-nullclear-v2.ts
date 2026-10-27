#!/usr/bin/env tsx
/**
 * NullClear V2.2 Autonomous Smoke Test Harness
 *
 * Verifies the 3 core requirements:
 * 1. GET /v1/scan/base/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 ($USDC on Base)
 *    - isProxy === true
 *    - implementationAddress is non-null
 *    - buyTaxPercent === 0 && sellTaxPercent === 0
 *    - recommendedAgentAction === "EXECUTE_SAFE"
 *    - score >= 90
 * 2. GET /scan/base/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 with Accept: text/markdown
 *    - pure Markdown (no HTML doctype/tags)
 *    - total response length < 450 words / ~400 tokens
 * 3. POST /v1/decode with ERC-20 infinite approval calldata
 *    - function identified as approve(address,uint256)
 *    - isInfiniteAllowance === true or risk warning flagged in llmDigest
 */

import assert from "node:assert";
import app from "../packages/worker-arbiter/src/index.js";

const BASE_URL = process.env.TEST_BASE_URL || "https://api.nullclear.dev";
const mockEnv = {
  ARBITER_PRIVATE_KEY: "0x0123456789012345678901234567890123456789012345678901234567890123"
};

async function executeRequest(url: string, init?: RequestInit): Promise<Response> {
  if (process.env.TEST_BASE_URL) {
    return await fetch(url, init);
  }
  return await app.fetch(new Request(url, init), mockEnv);
}

async function main() {
  console.log("\n========================================================");
  console.log(" 🛡️  NULLCLEAR V2.2 AUTONOMOUS SMOKE TEST HARNESS");
  console.log("========================================================\n");

  let passed = 0;
  let failed = 0;

  // TEST 1: USDC on Base Forensic Scan
  try {
    console.log("🧪 Test 1: Verifying USDC on Base proxy resolution & 0% tax forensic scan...");
    const scanUrl = `${BASE_URL}/v1/scan/base/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`;
    const reqHeaders: Record<string, string> = { Accept: "application/json" };
    if (!process.env.TEST_BASE_URL) {
      reqHeaders["CF-Connecting-IP"] = "198.51.100.99";
    }
    const res = await executeRequest(scanUrl, {
      headers: reqHeaders
    });

    assert.strictEqual(res.status, 200, `Expected HTTP 200 from ${scanUrl}, got ${res.status}`);
    const data = (await res.json()) as any;

    const isProxy = data.isProxy ?? data.evidence?.isProxy;
    const implAddr = data.implementationAddress ?? data.evidence?.implementationAddress;
    const buyTax = data.buyTaxPercent ?? data.evidence?.buyTaxPercent;
    const sellTax = data.sellTaxPercent ?? data.evidence?.sellTaxPercent;
    const action = data.recommendedAgentAction;
    const score = data.score;

    assert.strictEqual(isProxy, true, "Assertion failed: isProxy must be true");
    assert.ok(implAddr && typeof implAddr === "string", "Assertion failed: implementationAddress must be non-null");
    assert.strictEqual(buyTax, 0, "Assertion failed: buyTaxPercent must be 0");
    assert.strictEqual(sellTax, 0, "Assertion failed: sellTaxPercent must be 0");
    assert.strictEqual(action, "EXECUTE_SAFE", "Assertion failed: recommendedAgentAction must be EXECUTE_SAFE");
    assert.ok(score >= 90, `Assertion failed: score must be >= 90, got ${score}`);

    console.log("   ✅ Assertions passed:");
    console.log(`      - isProxy: ${isProxy}`);
    console.log(`      - implementationAddress: ${implAddr}`);
    console.log(`      - buyTaxPercent / sellTaxPercent: ${buyTax}% / ${sellTax}%`);
    console.log(`      - recommendedAgentAction: ${action}`);
    console.log(`      - score: ${score}/100`);
    console.log(`      - LLM Digest: "${data.llmDigest}"\n`);
    passed++;
  } catch (err: any) {
    console.error("   ❌ Test 1 FAILED:", err.message);
    failed++;
  }

  // TEST 2: Content Negotiation (Accept: text/markdown)
  try {
    console.log("🧪 Test 2: Verifying Accept: text/markdown content negotiation & word count...");
    const mdUrl = `https://nullclear.com/scan/base/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`;
    const res = await executeRequest(mdUrl, {
      headers: {
        Accept: "text/markdown",
        "User-Agent": "Claude/3.5-Sonnet (Anthropic)"
      }
    });

    assert.strictEqual(res.status, 200, `Expected HTTP 200 from ${mdUrl}, got ${res.status}`);
    const contentType = res.headers.get("Content-Type") || "";
    assert.ok(contentType.includes("text/markdown"), `Expected text/markdown Content-Type, got ${contentType}`);

    const text = await res.text();
    assert.ok(!text.includes("<!DOCTYPE html>"), "Assertion failed: markdown response must not contain <!DOCTYPE html>");
    assert.ok(!text.includes("<html>"), "Assertion failed: markdown response must not contain <html> tags");

    const wordCount = text.trim().split(/\s+/).length;
    assert.ok(
      wordCount < 450,
      `Assertion failed: total response length must be under 450 words (~400 tokens), got ${wordCount} words`
    );

    console.log("   ✅ Assertions passed:");
    console.log(`      - Content-Type: ${contentType}`);
    console.log(`      - Pure Markdown: No HTML doctype or tags`);
    console.log(`      - Word count: ${wordCount} words (<450 words / ~400 tokens threshold)\n`);
    passed++;
  } catch (err: any) {
    console.error("   ❌ Test 2 FAILED:", err.message);
    failed++;
  }

  // TEST 3: POST /v1/decode with ERC-20 infinite approval calldata
  try {
    console.log("🧪 Test 3: Verifying POST /v1/decode infinite approval detection...");
    const infiniteApprovalCalldata =
      "0x095ea7b300000000000000000000000068b3465833fb72a70ecdf485e0e4c7bd8665fc45ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    const decodeUrl = `${BASE_URL}/v1/decode`;
    const decodeHeaders: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (!process.env.TEST_BASE_URL) {
      decodeHeaders["CF-Connecting-IP"] = "198.51.100.99";
    }
    const res = await executeRequest(decodeUrl, {
      method: "POST",
      headers: decodeHeaders,
      body: JSON.stringify({
        input: infiniteApprovalCalldata,
        chain: "base"
      })
    });

    assert.strictEqual(res.status, 200, `Expected HTTP 200 from ${decodeUrl}, got ${res.status}`);
    const data = (await res.json()) as any;

    const signature = data.signature || data.functionSignature;
    assert.strictEqual(
      signature,
      "approve(address,uint256)",
      `Assertion failed: expected function to be identified as approve(address,uint256), got ${signature}`
    );

    const isInfinite =
      data.isInfiniteAllowance === true ||
      data.securityFlags?.isUnlimitedApproval === true ||
      (typeof data.llmDigest === "string" && data.llmDigest.toLowerCase().includes("unlimited token approval"));

    assert.ok(
      isInfinite,
      `Assertion failed: isInfiniteAllowance must be true or risk warning flagged in llmDigest. Got: isInfiniteAllowance=${data.isInfiniteAllowance}, digest=${data.llmDigest}`
    );

    console.log("   ✅ Assertions passed:");
    console.log(`      - Function identified: ${signature}`);
    console.log(`      - isInfiniteAllowance: ${data.isInfiniteAllowance ?? data.securityFlags?.isUnlimitedApproval}`);
    console.log(`      - Recommended agent action: ${data.recommendedAgentAction}`);
    console.log(`      - LLM Digest: "${data.llmDigest}"\n`);
    passed++;
  } catch (err: any) {
    console.error("   ❌ Test 3 FAILED:", err.message);
    failed++;
  }

  console.log("========================================================");
  console.log(` 🏁 RESULT: ${passed}/3 tests passed, ${failed} failed.`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal test harness error:", e);
  process.exit(1);
});
