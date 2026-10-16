import { describe, it, expect, beforeEach } from "vitest";
import { keccak256, stringToHex, verifyTypedData } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import {
  EIP3009_TYPES,
  SAFEPAY_RECEIPT_DOMAIN,
  SAFEPAY_RECEIPT_TYPES,
  SAFEPAY_TREASURY_ADDRESS,
  getChainConfig,
  type X402PaymentSignaturePayload
} from "@nullclear/shared";
import { app } from "../src/index.js";
import { getArbiterStore } from "../src/env.js";

const buyerAccount = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);
const sellerAccount = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
);
const arbiterPrivateKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const testEnv = {
  ENVIRONMENT: "development",
  SETTLEMENT_MODE: "simulated" as const,
  ARBITER_PRIVATE_KEY: arbiterPrivateKey,
  TREASURY_WALLET_ADDRESS: SAFEPAY_TREASURY_ADDRESS
};

async function createSignedEIP3009Payload(params: {
  signerPrivateKey?: `0x${string}`;
  from?: `0x${string}`;
  to: `0x${string}`;
  valueAtomic: string;
  chainId?: 8453 | 84532;
  validAfter?: number;
  validBefore?: number;
  nonce?: `0x${string}`;
}): Promise<X402PaymentSignaturePayload> {
  const chainId = params.chainId ?? 8453;
  const chainConfig = getChainConfig(chainId);
  const signer = privateKeyToAccount(
    params.signerPrivateKey ??
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  );
  const from = params.from ?? signer.address;
  const now = Math.floor(Date.now() / 1000);
  const validAfter = String(params.validAfter ?? now - 60);
  const validBefore = String(params.validBefore ?? now + 3600);
  const nonce =
    params.nonce ??
    keccak256(stringToHex(`nonce:${from}:${params.to}:${Date.now()}:${Math.random()}`));

  const signature = await signer.signTypedData({
    domain: chainConfig.usdcDomain,
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from,
      to: params.to,
      value: BigInt(params.valueAtomic),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce
    }
  });

  return {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: chainConfig.caip2,
      amount: params.valueAtomic,
      asset: chainConfig.usdc,
      payTo: params.to,
      maxTimeoutSeconds: 3600
    },
    payload: {
      signature,
      authorization: {
        from,
        to: params.to,
        value: params.valueAtomic,
        validAfter,
        validBefore,
        nonce
      }
    }
  };
}

describe("NullClear SafePay (nullclear.com) End-to-End Test Suite", () => {
  beforeEach(() => {
    getArbiterStore().reset();
  });

  it("1. Creates SafePay deals with accurate 1.0% fee, $0.50 floor, and 0.75% whale tier routed to 0xB586...d5c", async () => {
    // A: $500 USDC deal -> $5.00 USDC fee (1.0%), $495.00 USDC net to seller
    const res500 = await app.fetch(
      new Request("http://nullclear.com/api/safepay/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "5,000 Verified SaaS Leads Dataset",
          sellerAddress: sellerAccount.address,
          chainId: 8453,
          amountAtomic: "500000000", // $500.00 USDC
          feePayer: "seller",
          verificationMode: "DATASET_SCHEMA",
          verificationSpec: {
            requiredColumns: ["email", "company", "arrUsd"],
            minRows: 3,
            disallowNulls: true
          }
        })
      }),
      testEnv
    );

    expect(res500.status).toBe(201);
    const data500 = (await res500.json()) as any;
    expect(data500.success).toBe(true);
    expect(data500.feeBreakdown.protocolFeeAtomic).toBe("5000000"); // $5.00 USDC
    expect(data500.feeBreakdown.sellerNetAtomic).toBe("495000000"); // $495.00 USDC
    expect(data500.feeBreakdown.totalBuyerSignAtomic).toBe("500000000");
    expect(data500.feeBreakdown.treasuryAddress).toBe(SAFEPAY_TREASURY_ADDRESS);

    // B: $10 USDC small deal -> enforces $0.50 USDC (500,000 atomic) minimum fee floor
    const res10 = await app.fetch(
      new Request("http://nullclear.com/api/safepay/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Micro Script Bounty",
          sellerAddress: sellerAccount.address,
          amountAtomic: "10000000", // $10.00 USDC
          feePayer: "seller",
          verificationMode: "FILE_ARCHIVE"
        })
      }),
      testEnv
    );
    expect(res10.status).toBe(201);
    const data10 = (await res10.json()) as any;
    expect(data10.feeBreakdown.protocolFeeAtomic).toBe("500000"); // $0.50 floor
    expect(data10.feeBreakdown.sellerNetAtomic).toBe("9500000"); // $9.50 net

    // C: $20,000 USDC whale deal -> 0.75% (75 bps) = $150.00 USDC fee
    const resWhale = await app.fetch(
      new Request("http://nullclear.com/api/safepay/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Enterprise OTC Codebase Acquisition",
          sellerAddress: sellerAccount.address,
          amountAtomic: "20000000000", // $20,000 USDC
          feePayer: "buyer",
          verificationMode: "FILE_ARCHIVE"
        })
      }),
      testEnv
    );
    expect(resWhale.status).toBe(201);
    const dataWhale = (await resWhale.json()) as any;
    expect(dataWhale.feeBreakdown.effectiveFeeBps).toBe(75);
    expect(dataWhale.feeBreakdown.protocolFeeAtomic).toBe("150000000"); // $150.00 USDC
    expect(dataWhale.feeBreakdown.sellerNetAtomic).toBe("20000000000");
    expect(dataWhale.feeBreakdown.totalBuyerSignAtomic).toBe("20150000000");
  });

  it("2. Validates Dual EIP-3009 signatures on lock and rejects wrong fee recipient, expired validBefore, or forged signatures", async () => {
    const createRes = await app.fetch(
      new Request("http://nullclear.com/api/safepay/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Dual EIP-3009 Security Test Deal",
          sellerAddress: sellerAccount.address,
          chainId: 8453,
          amountAtomic: "100000000", // $100 USDC -> 99M seller, 1M fee
          feePayer: "seller",
          verificationMode: "DATASET_SCHEMA"
        })
      }),
      testEnv
    );
    const { dealId } = (await createRes.json()) as any;

    const validSellerSig = await createSignedEIP3009Payload({
      to: sellerAccount.address,
      valueAtomic: "99000000"
    });
    const validFeeSig = await createSignedEIP3009Payload({
      to: SAFEPAY_TREASURY_ADDRESS,
      valueAtomic: "1000000"
    });

    // 2A: Reject wrong fee recipient (attacker tries to route fee to seller instead of Treasury)
    const wrongFeeRecipientSig = await createSignedEIP3009Payload({
      to: sellerAccount.address,
      valueAtomic: "1000000"
    });
    const badFeeRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: buyerAccount.address,
          sellerSignaturePayload: validSellerSig,
          feeSignaturePayload: wrongFeeRecipientSig
        })
      }),
      testEnv
    );
    expect(badFeeRes.status).toBe(400);
    const badFeeJson = (await badFeeRes.json()) as any;
    expect(badFeeJson.error).toBe("INVALID_FEE_RECIPIENT");

    // 2B: Reject expired validBefore
    const expiredSellerSig = await createSignedEIP3009Payload({
      to: sellerAccount.address,
      valueAtomic: "99000000",
      validBefore: Math.floor(Date.now() / 1000) - 10
    });
    const expiredRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: buyerAccount.address,
          sellerSignaturePayload: expiredSellerSig,
          feeSignaturePayload: validFeeSig
        })
      }),
      testEnv
    );
    expect(expiredRes.status).toBe(400);
    const expiredJson = (await expiredRes.json()) as any;
    expect(expiredJson.error).toBe("INVALID_SELLER_SIGNATURE");

    // 2C: Reject forged signature (signed by random key, claiming from: buyerAccount.address)
    const randomAttackerKey = generatePrivateKey();
    const forgedSellerSig = await createSignedEIP3009Payload({
      signerPrivateKey: randomAttackerKey,
      from: buyerAccount.address,
      to: sellerAccount.address,
      valueAtomic: "99000000"
    });
    const forgedRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: buyerAccount.address,
          sellerSignaturePayload: forgedSellerSig,
          feeSignaturePayload: validFeeSig
        })
      }),
      testEnv
    );
    expect(forgedRes.status).toBe(400);
    const forgedJson = (await forgedRes.json()) as any;
    expect(forgedJson.error).toBe("INVALID_SELLER_SIGNATURE");

    // 2D: Accept valid Dual EIP-3009 signatures
    const goodLockRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: buyerAccount.address,
          sellerSignaturePayload: validSellerSig,
          feeSignaturePayload: validFeeSig
        })
      }),
      testEnv
    );
    expect(goodLockRes.status).toBe(200);
    const goodLockJson = (await goodLockRes.json()) as any;
    expect(goodLockJson.status).toBe("FUNDED_LOCKED");
    expect(goodLockJson.deal.hasLockedSignatures).toBe(true);
    // Ensure raw EIP-3009 signatures are NEVER leaked in deal state response
    expect(goodLockJson.deal.sellerSignaturePayload).toBeUndefined();
    expect(goodLockJson.deal.feeSignaturePayload).toBeUndefined();
  });

  it("3. Verifies Dataset Deliverable (Mode A): blocks bad data/refusal at $0 cost, then settles valid CSV/JSON with Redacted Preview & EIP-712 Receipt", async () => {
    const createRes = await app.fetch(
      new Request("http://nullclear.com/api/safepay/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Verified Enterprise Leads Dataset",
          sellerAddress: sellerAccount.address,
          chainId: 8453,
          amountAtomic: "200000000", // $200 USDC -> 198M seller, 2M fee
          feePayer: "seller",
          verificationMode: "DATASET_SCHEMA",
          verificationSpec: {
            requiredColumns: ["email", "company", "arrUsd"],
            minRows: 3,
            disallowNulls: true,
            rejectRefusals: true,
            invariants: [{ path: "arrUsd", gt: 10000 }]
          }
        })
      }),
      testEnv
    );
    const { dealId } = (await createRes.json()) as any;

    const sellerSig = await createSignedEIP3009Payload({
      to: sellerAccount.address,
      valueAtomic: "198000000"
    });
    const feeSig = await createSignedEIP3009Payload({
      to: SAFEPAY_TREASURY_ADDRESS,
      valueAtomic: "2000000"
    });

    await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: buyerAccount.address,
          sellerSignaturePayload: sellerSig,
          feeSignaturePayload: feeSig
        })
      }),
      testEnv
    );

    // 3A: Seller uploads hallucinated / refusal dataset with only 1 row -> MUST fail with 422 and charge $0
    const badDeliveryRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerAddress: sellerAccount.address,
          content: JSON.stringify([
            {
              email: "alice@stripe.com",
              company: "As an AI language model, I cannot fulfill this request",
              arrUsd: 500
            }
          ])
        })
      }),
      testEnv
    );
    expect(badDeliveryRes.status).toBe(422);
    const badJson = (await badDeliveryRes.json()) as any;
    expect(badJson.verified).toBe(false);
    expect(badJson.settled).toBe(false);
    expect(badJson.buyerChargedAtomic).toBe("0");
    expect(badJson.validationErrors.some((e: string) => e.includes("LLM Refusal Guard"))).toBe(true);
    expect(badJson.validationErrors.some((e: string) => e.includes("minRows"))).toBe(true);

    // Confirm download is locked before settlement
    const lockedDownload = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/download?buyer=${buyerAccount.address}`),
      testEnv
    );
    expect(lockedDownload.status).toBe(403);

    // 3B: Seller uploads valid 3-row dataset -> passes verification, generates redacted preview, settles both txs, unlocks download
    const validDataset = [
      { email: "alice@stripe.com", company: "Stripe Inc", arrUsd: 500000 },
      { email: "bob@openai.com", company: "OpenAI", arrUsd: 1200000 },
      { email: "carol@coinbase.com", company: "Coinbase Global", arrUsd: 950000 }
    ];

    const goodDeliveryRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerAddress: sellerAccount.address,
          content: JSON.stringify(validDataset)
        })
      }),
      testEnv
    );
    expect(goodDeliveryRes.status).toBe(200);
    const goodJson = (await goodDeliveryRes.json()) as any;
    expect(goodJson.verified).toBe(true);
    expect(goodJson.settled).toBe(true);
    expect(goodJson.status).toBe("SETTLED");
    expect(goodJson.sellerTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(goodJson.feeTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(goodJson.treasuryAddress).toBe(SAFEPAY_TREASURY_ADDRESS);

    // Verify Redacted Preview masks sensitive email addresses while proving row count & columns
    const sampleRow = goodJson.redactedPreview.datasetSummary.redactedSampleRows[0];
    expect(sampleRow.email).toBe("al***@stripe.com");
    expect(sampleRow.email).not.toBe("alice@stripe.com");
    expect(goodJson.redactedPreview.datasetSummary.totalRows).toBe(3);

    // Verify EIP-712 SafePaySettlementReceipt cryptographically
    const signedReceipt = goodJson.receipt;
    const isReceiptValid = await verifyTypedData({
      address: signedReceipt.arbiterAddress,
      domain: { ...SAFEPAY_RECEIPT_DOMAIN, chainId: 8453 },
      types: SAFEPAY_RECEIPT_TYPES,
      primaryType: "SafePaySettlementReceipt",
      message: {
        dealId: signedReceipt.receipt.dealId,
        buyer: signedReceipt.receipt.buyer,
        seller: signedReceipt.receipt.seller,
        sellerNetAtomic: BigInt(signedReceipt.receipt.sellerNetAtomic),
        protocolFeeAtomic: BigInt(signedReceipt.receipt.protocolFeeAtomic),
        treasuryAddress: signedReceipt.receipt.treasuryAddress,
        deliverableSha256: signedReceipt.receipt.deliverableSha256,
        specHash: signedReceipt.receipt.specHash,
        sellerTxHash: signedReceipt.receipt.sellerTxHash,
        feeTxHash: signedReceipt.receipt.feeTxHash,
        settledAt: BigInt(signedReceipt.receipt.settledAt)
      },
      signature: signedReceipt.signature
    });
    expect(isReceiptValid).toBe(true);

    // 3C: Buyer downloads unredacted deliverable now that status is SETTLED
    const downloadRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/download?buyer=${buyerAccount.address}`),
      testEnv
    );
    expect(downloadRes.status).toBe(200);
    const downloadedData = await downloadRes.json();
    expect(downloadedData).toEqual(validDataset);
  });

  it("4. Verifies Code Archive (Mode B) & Instant Buyer Void / Expiry Shredding", async () => {
    const createRes = await app.fetch(
      new Request("http://nullclear.com/api/safepay/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Next.js + Foundry Smart Contract Repo",
          sellerAddress: sellerAccount.address,
          chainId: 84532, // Base Sepolia
          amountAtomic: "50000000", // $50 USDC
          feePayer: "seller",
          verificationMode: "FILE_ARCHIVE",
          verificationSpec: {
            requiredFiles: ["README.md", "package.json", "src/index.ts"],
            minBytes: 50
          }
        })
      }),
      testEnv
    );
    const { dealId } = (await createRes.json()) as any;

    const sellerSig = await createSignedEIP3009Payload({
      to: sellerAccount.address,
      valueAtomic: "49500000",
      chainId: 84532
    });
    const feeSig = await createSignedEIP3009Payload({
      to: SAFEPAY_TREASURY_ADDRESS,
      valueAtomic: "500000",
      chainId: 84532
    });

    const lockRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: buyerAccount.address,
          sellerSignaturePayload: sellerSig,
          feeSignaturePayload: feeSig
        })
      }),
      testEnv
    );
    expect(lockRes.status).toBe(200);

    // Missing src/index.ts -> fails with 422
    const failArchiveRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerAddress: sellerAccount.address,
          content: JSON.stringify({
            "README.md": "# Project Docs",
            "package.json": "{\"name\":\"app\"}"
          })
        })
      }),
      testEnv
    );
    expect(failArchiveRes.status).toBe(422);

    // Buyer voids the deal -> shreds signatures and charges $0
    const voidRes = await app.fetch(
      new Request(`http://nullclear.com/api/safepay/deals/${dealId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: buyerAccount.address
        })
      }),
      testEnv
    );
    expect(voidRes.status).toBe(200);
    const voidJson = (await voidRes.json()) as any;
    expect(voidJson.status).toBe("VOIDED_EXPIRED");
    expect(voidJson.shreddedSignatures).toBe(true);
    expect(voidJson.deal.hasLockedSignatures).toBe(false);
  });

  it("5. Serves NullClear SafePay commercial pages, programmatic SEO verticals, sitemap.xml, and robots.txt on nullclear.com", async () => {
    const homeRes = await app.fetch(new Request("http://nullclear.com/"), testEnv);
    expect(homeRes.status).toBe(200);
    const homeHtml = await homeRes.text();
    expect(homeHtml).toContain("Escrow That Never Holds Your Money.");
    expect(homeHtml).toContain("FinancialProduct");

    for (const vertical of ["freelancers", "data-brokers", "ai-bounties", "otc-digital"]) {
      const vRes = await app.fetch(
        new Request(`http://nullclear.com/for/${vertical}?utm_term=Base+USDC+Escrow`),
        testEnv
      );
      expect(vRes.status).toBe(200);
      const vHtml = await vRes.text();
      expect(vHtml).toContain("Base USDC Escrow");
    }

    const sitemapRes = await app.fetch(new Request("http://nullclear.com/sitemap.xml"), testEnv);
    expect(sitemapRes.status).toBe(200);
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).toContain("https://nullclear.com/for/data-brokers");

    const robotsRes = await app.fetch(new Request("http://nullclear.com/robots.txt"), testEnv);
    expect(robotsRes.status).toBe(200);
    const robotsTxt = await robotsRes.text();
    expect(robotsTxt).toContain("Sitemap: https://nullclear.com/sitemap.xml");
  });
});
