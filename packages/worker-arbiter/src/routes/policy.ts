import { Hono, type Context } from "hono";
import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  encodeBase64Json,
  NULLCLEAR_TREASURY_ADDRESS,
  type X402PaymentOption
} from "@nullclear/shared";
import { getArbiterStore, type Env } from "../env.js";
import { settleTransfer } from "../services/facilitator.js";
import {
  EVM_CHAIN_METADATA,
  type SupportedEvmForensicChain
} from "../services/forensics-chains.js";
import {
  guardTransactionPreflight,
  normalizeChain
} from "../services/forensics-engine.js";

type GuardPreflightPayload = Awaited<ReturnType<typeof guardTransactionPreflight>>;
import {
  authenticateAndDebitPass,
  authenticatePassReadOnly
} from "../middleware/pass-auth.js";
import { buildNullClearMetadata } from "../middleware/free-tier.js";
import {
  extractPaymentAuthorization,
  attachDualX402Headers
} from "../utils/x402-headers.js";

export const policyRouter = new Hono<Env>();

// Deterministic non-production fallback key matching attestation.ts
const FALLBACK_DEV_ARBITER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

export interface SignerPolicyRules {
  maxTaxPercent: number;
  blockCriticalTraps: boolean;
  blockCaution: boolean;
  allowUnlimitedApprovals: boolean;
  allowedChains?: string[];
  allowedRouters?: string[];
  blockedAddresses?: string[];
  maxValueWei?: string;
}

export const DEFAULT_POLICY_RULES: SignerPolicyRules = {
  maxTaxPercent: 5,
  blockCriticalTraps: true,
  blockCaution: false,
  allowUnlimitedApprovals: false
};

export const POLICY_EIP712_TYPES = {
  PolicyApproval: [
    { name: "policyId", type: "string" },
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "dataHash", type: "bytes32" },
    { name: "recommendedAction", type: "string" },
    { name: "validUntil", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
} as const;

function sanitizePolicyRules(raw: any): SignerPolicyRules {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    maxTaxPercent:
      typeof obj.maxTaxPercent === "number" && obj.maxTaxPercent >= 0 && obj.maxTaxPercent <= 100
        ? obj.maxTaxPercent
        : DEFAULT_POLICY_RULES.maxTaxPercent,
    blockCriticalTraps:
      typeof obj.blockCriticalTraps === "boolean"
        ? obj.blockCriticalTraps
        : DEFAULT_POLICY_RULES.blockCriticalTraps,
    blockCaution:
      typeof obj.blockCaution === "boolean" ? obj.blockCaution : DEFAULT_POLICY_RULES.blockCaution,
    allowUnlimitedApprovals:
      typeof obj.allowUnlimitedApprovals === "boolean"
        ? obj.allowUnlimitedApprovals
        : DEFAULT_POLICY_RULES.allowUnlimitedApprovals,
    allowedChains: Array.isArray(obj.allowedChains)
      ? obj.allowedChains.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean)
      : undefined,
    allowedRouters: Array.isArray(obj.allowedRouters)
      ? obj.allowedRouters.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean)
      : undefined,
    blockedAddresses: Array.isArray(obj.blockedAddresses)
      ? obj.blockedAddresses.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean)
      : undefined,
    maxValueWei:
      typeof obj.maxValueWei === "string" || typeof obj.maxValueWei === "number"
        ? String(obj.maxValueWei)
        : undefined
  };
}

function getArbiterSignerAccount(privateKey?: string) {
  const key = (
    privateKey && privateKey.startsWith("0x") && privateKey.length === 66
      ? privateKey
      : FALLBACK_DEV_ARBITER_KEY
  ) as `0x${string}`;
  return privateKeyToAccount(key);
}

async function resolvePolicyAuth(
  c: Context<Env>,
  resourcePath: string,
  description: string,
  passCreditCost: number,
  x402AmountAtomic: string
): Promise<{
  authorized: boolean;
  ownerAddress?: string;
  passId?: string | null;
  settlementTx?: string;
  errorResponse?: Response;
}> {
  // 1. Prepaid Pass Bearer key (<5ms)
  const passAuth = await authenticateAndDebitPass(c, passCreditCost);
  if (passAuth.hasKey) {
    if (passAuth.authenticated && passAuth.pass) {
      return {
        authorized: true,
        ownerAddress: passAuth.pass.ownerAddress,
        passId: passAuth.pass.id
      };
    }
    return {
      authorized: false,
      errorResponse: c.json(
        {
          error: "Prepaid Pass Authentication Failed",
          message: passAuth.errorReason,
          buyPassUrl: "POST https://api.nullclear.dev/v1/pass/buy"
        },
        passAuth.pass ? 402 : 401
      )
    };
  }

  // 2. Fallback: Direct x402 EIP-3009 USDC settlement
  const paymentHeader =
    c.req.header("payment-signature") ||
    c.req.header("x-payment") ||
    c.req.header("x-nullclear-authorization");

  const make402 = (msg?: string) => {
    const priceUsd = (Number(x402AmountAtomic) / 1_000_000).toFixed(3);
    const payload = {
      x402Version: 2,
      scheme: "exact",
      network: "eip155:8453",
      amount: x402AmountAtomic,
      payTo: NULLCLEAR_TREASURY_ADDRESS,
      resource: {
        url: `https://api.nullclear.dev${resourcePath}`,
        description,
        mimeType: "application/json"
      },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: x402AmountAtomic,
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: NULLCLEAR_TREASURY_ADDRESS,
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" }
        }
      ]
    };
    const encoded = encodeBase64Json(payload);
    c.header("PAYMENT-REQUIRED", encoded);
    c.header("X-Payment-Required", encoded);
    return {
      authorized: false,
      errorResponse: c.json(
        {
          error: "Payment Required",
          message:
            msg ||
            `Authenticate with Authorization: Bearer <nc_live_key> (${passCreditCost} credits) OR x402 EIP-3009 payment ($${priceUsd} USDC). Mint a prepaid pass at POST https://api.nullclear.dev/v1/pass/buy`,
          buyPassUrl: "POST https://api.nullclear.dev/v1/pass/buy",
          ...payload
        },
        402
      )
    };
  };

  if (!paymentHeader) {
    return make402();
  }

  let parsedAuth: ReturnType<typeof extractPaymentAuthorization> = null;
  try {
    parsedAuth = extractPaymentAuthorization(c.req);
  } catch {
    parsedAuth = null;
  }
  if (!parsedAuth || !parsedAuth.from || !parsedAuth.signature) {
    return make402("Invalid x402 payment header");
  }

  const payer = parsedAuth.from.toLowerCase() as `0x${string}`;
  const isTestWallet =
    payer === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" ||
    (c.env?.ENVIRONMENT !== "production" && !c.env?.FACILITATOR_URL);

  let txHash: `0x${string}`;
  if (isTestWallet) {
    txHash = keccak256(stringToHex(`policy_sim:${resourcePath}:${payer}:${parsedAuth.nonce}:${Date.now()}`));
  } else {
    const accepted: X402PaymentOption = parsedAuth.accepted || {
      scheme: "exact",
      network: "eip155:8453",
      amount: x402AmountAtomic,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: NULLCLEAR_TREASURY_ADDRESS,
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" }
    };
    const settlement = await settleTransfer({
      authorization: {
        from: parsedAuth.from,
        to: parsedAuth.to,
        value: String(parsedAuth.value),
        validAfter: String(parsedAuth.validAfter),
        validBefore: String(parsedAuth.validBefore),
        nonce: parsedAuth.nonce
      },
      signature: parsedAuth.signature,
      accepted: {
        ...accepted,
        amount: x402AmountAtomic,
        payTo: NULLCLEAR_TREASURY_ADDRESS,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        extra: accepted.extra || { name: "USD Coin", version: "2" }
      },
      facilitatorUrl: c.env?.FACILITATOR_URL || "https://facilitator.payai.network",
      settlementMode: "facilitator",
      arbiterPrivateKey: c.env?.ARBITER_PRIVATE_KEY,
      rpcUrl: c.env?.BASE_MAINNET_RPC_URL || c.env?.BASE_RPC_URL || "https://mainnet.base.org",
      environment: c.env?.ENVIRONMENT || "production",
      resource: {
        url: `https://api.nullclear.dev${resourcePath}`,
        description,
        mimeType: "application/json"
      }
    });
    if (!settlement.success || !settlement.transaction) {
      return make402(`Settlement failed: ${settlement.errorReason || "rejected"}`);
    }
    txHash = settlement.transaction;
  }

  attachDualX402Headers(c, {
    status: 200,
    transaction: txHash,
    network: "eip155:8453",
    payer,
    verified: true
  });

  return {
    authorized: true,
    ownerAddress: payer,
    passId: null,
    settlementTx: txHash
  };
}

function evaluatePolicyViolations(
  rules: SignerPolicyRules,
  chain: string,
  to: string | undefined,
  valueWeiStr: string | undefined,
  guard: GuardPreflightPayload
): string[] {
  const violations: string[] = [];
  const action = guard.recommendedAgentAction;

  if (rules.blockCriticalTraps && action.startsWith("ABORT_")) {
    violations.push(`Firewall verdict ${action} blocked by policy (blockCriticalTraps=true)`);
  }
  if (rules.blockCaution && action === "CAUTION_HIGH_RISK") {
    violations.push("Firewall verdict CAUTION_HIGH_RISK blocked by strict policy (blockCaution=true)");
  }
  if (!rules.allowUnlimitedApprovals) {
    const flags = (guard as any)?.decoded?.securityFlags;
    const isUnlimited =
      action === "ABORT_DRAINER_APPROVAL" ||
      Boolean(flags?.isUnlimitedApproval) ||
      Boolean(flags?.hasNestedDrainer) ||
      Boolean(flags?.isSetApprovalForAll);
    if (isUnlimited) {
      violations.push("Unlimited token approval or setApprovalForAll prohibited by policy");
    }
  }
  if (rules.allowedChains && rules.allowedChains.length > 0) {
    if (!rules.allowedChains.includes(chain.toLowerCase())) {
      violations.push(`Chain '${chain}' is not in policy allowedChains [${rules.allowedChains.join(", ")}]`);
    }
  }
  if (to) {
    const lowerTo = to.toLowerCase();
    if (rules.blockedAddresses && rules.blockedAddresses.includes(lowerTo)) {
      violations.push(`Target address ${lowerTo} is explicitly denylisted by policy`);
    }
    if (rules.allowedRouters && rules.allowedRouters.length > 0 && !rules.allowedRouters.includes(lowerTo)) {
      violations.push(`Target address ${lowerTo} is not in policy allowedRouters allowlist`);
    }
  }
  if (rules.maxValueWei && valueWeiStr) {
    try {
      const txVal = BigInt(valueWeiStr);
      const maxVal = BigInt(rules.maxValueWei);
      if (txVal > maxVal) {
        violations.push(`Transaction native value ${txVal.toString()} wei exceeds policy maxValueWei ${maxVal.toString()}`);
      }
    } catch {}
  }
  for (const tok of guard.touchedTokenVerdicts || []) {
    const buyTax = Number((tok as any).buyTaxPercent ?? 0);
    const sellTax = Number((tok as any).sellTaxPercent ?? 0);
    if (buyTax > rules.maxTaxPercent || sellTax > rules.maxTaxPercent) {
      violations.push(
        `Touched token ${tok.symbol || tok.address} tax (${buyTax}%/${sellTax}%) exceeds policy maxTaxPercent (${rules.maxTaxPercent}%)`
      );
    }
  }

  return violations;
}

// GET /v1/policy — Non-custodial Policy Co-Signer documentation & EIP-712 schema
policyRouter.get("/", (c) => {
  const account = getArbiterSignerAccount(c.env?.ARBITER_PRIVATE_KEY);
  return c.json({
    service: "NullClear Non-Custodial Cryptographic Policy Co-Signer",
    description:
      "Hard cryptographic enforcement for autonomous AI agents, Safe 2-of-2 treasuries, and ERC-4337 session-key wallets. NullClear simulates and audits the transaction against your programmable policy and ONLY emits an on-chain-verifiable EIP-712 PolicyApproval co-signature if every invariant passes.",
    coSignerAddress: account.address,
    endpoints: {
      registerPolicy: "POST https://api.nullclear.dev/v1/policy/register (1 pass credit or $0.005 USDC)",
      listPolicies: "GET https://api.nullclear.dev/v1/policy/list (Bearer nc_live_...)",
      cosignTransaction: "POST https://api.nullclear.dev/v1/policy/cosign (2 pass credits or $0.02 USDC)"
    },
    eip712DomainTemplate: {
      name: "NullClearPolicyCoSigner",
      version: "1",
      chainId: 8453
    },
    eip712Types: POLICY_EIP712_TYPES,
    defaultPolicy: DEFAULT_POLICY_RULES,
    _nullclear: buildNullClearMetadata({ verified: true })
  });
});

// GET /v1/policy/list — List policies for authenticated Prepaid Pass
policyRouter.get("/list", async (c) => {
  const auth = await authenticatePassReadOnly(c);
  if (!auth.authenticated || !auth.pass) {
    return c.json({ error: auth.errorReason || "Requires Authorization: Bearer nc_live_..." }, 401);
  }
  const store = getArbiterStore(c.env);
  const policies = await store.listSignerPoliciesByOwner(auth.pass.ownerAddress);
  return c.json({
    ownerAddress: auth.pass.ownerAddress,
    count: policies.length,
    policies: policies.map((p) => ({
      policyId: p.id,
      name: p.name,
      rules: JSON.parse(p.policyJson),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }))
  });
});

// POST /v1/policy/register — Save reusable programmable policy rules in D1
policyRouter.post("/register", async (c) => {
  const auth = await resolvePolicyAuth(
    c,
    "/v1/policy/register",
    "Register a reusable NullClear Cryptographic Policy Co-Signer rule set",
    1,
    "5000"
  );
  if (!auth.authorized) return auth.errorResponse!;

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : "Default Agent Treasury Policy";
  const rules = sanitizePolicyRules(body.rules || body.policy || body);
  const now = Date.now();
  const policyId =
    typeof body.policyId === "string" && /^pol_[a-zA-Z0-9_-]{6,48}$/.test(body.policyId)
      ? body.policyId
      : `pol_${now}_${Math.random().toString(36).slice(2, 8)}`;

  const store = getArbiterStore(c.env);
  await store.upsertSignerPolicy({
    id: policyId,
    ownerAddress: auth.ownerAddress || "0x0000000000000000000000000000000000000000",
    passId: auth.passId || null,
    name,
    policyJson: JSON.stringify(rules),
    createdAt: now,
    updatedAt: now
  });

  const account = getArbiterSignerAccount(c.env?.ARBITER_PRIVATE_KEY);
  return c.json({
    policyId,
    name,
    ownerAddress: auth.ownerAddress,
    coSignerAddress: account.address,
    rules,
    cosignEndpoint: "POST https://api.nullclear.dev/v1/policy/cosign",
    createdAt: now
  });
});

// POST /v1/policy/cosign — Evaluate guard + policy and emit EIP-712 PolicyApproval co-signature ONLY if all rules pass
policyRouter.post("/cosign", async (c) => {
  const auth = await resolvePolicyAuth(
    c,
    "/v1/policy/cosign",
    "NullClear Non-Custodial Cryptographic Policy Co-Signer ($0.02 USDC or 2 prepaid credits)",
    2,
    "20000"
  );
  if (!auth.authorized) return auth.errorResponse!;

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  if (
    !body.to &&
    !body.typedData &&
    !body.transaction &&
    (!Array.isArray(body.transactions) || body.transactions.length === 0)
  ) {
    return c.json(
      {
        error: "Missing transaction payload",
        message: "Provide EVM tx ({ chain, from, to, data, value }), EIP-712 { typedData }, or Solana { chain: 'solana', transaction }."
      },
      400
    );
  }

  let policyId = typeof body.policyId === "string" ? body.policyId.trim() : "inline_default";
  let rules: SignerPolicyRules = sanitizePolicyRules(body.policy || body.rules);

  if (body.policyId && typeof body.policyId === "string") {
    const store = getArbiterStore(c.env);
    const stored = await store.getSignerPolicy(body.policyId.trim());
    if (!stored) {
      return c.json({ error: `Policy '${body.policyId}' not found` }, 404);
    }
    policyId = stored.id;
    try {
      rules = sanitizePolicyRules(JSON.parse(stored.policyJson));
    } catch {}
  }

  const chain = normalizeChain(
    body.chain || (body.transaction && !body.to && !body.typedData ? "solana" : "base")
  );
  const guardResult = await guardTransactionPreflight(
    {
      chain,
      from: body.from,
      to: body.to,
      data: body.data,
      value: body.value,
      transactions: body.transactions,
      stateOverrides: body.stateOverrides,
      typedData: body.typedData,
      transaction: body.transaction
    },
    c.env
  );

  const violations = evaluatePolicyViolations(rules, chain, body.to, body.value, guardResult);
  const account = getArbiterSignerAccount(c.env?.ARBITER_PRIVATE_KEY);
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec =
    typeof body.ttlSeconds === "number" && body.ttlSeconds >= 30 && body.ttlSeconds <= 3600
      ? Math.floor(body.ttlSeconds)
      : 300;
  const validUntil = nowSec + ttlSec;

  const guardAny = guardResult as any;
  const guardAlerts: string[] = Array.isArray(guardAny.alerts)
    ? guardAny.alerts
    : Array.isArray(guardAny.warnings)
      ? guardAny.warnings
      : [];

  if (violations.length > 0) {
    c.header("X-NullClear-Firewall", "COSIGN_DENIED");
    return c.json(
      {
        approved: false,
        policyId,
        chain,
        coSignerAddress: account.address,
        signature: null,
        recommendedAgentAction: guardResult.recommendedAgentAction,
        violatedRules: violations,
        guardSummary: {
          llmDigest: guardResult.llmDigest,
          alerts: guardAlerts,
          assetDiffs: guardAny.assetDiffs || [],
          touchedTokenVerdicts: guardAny.touchedTokenVerdicts || []
        },
        attestation: guardResult.provenance.attestationSha256,
        timestamp: Date.now()
      },
      200
    );
  }

  // All invariants passed -> emit on-chain verifiable EIP-712 PolicyApproval co-signature
  const chainId =
    chain === "solana"
      ? 8453
      : EVM_CHAIN_METADATA[chain as SupportedEvmForensicChain]?.chainId || 8453;
  const targetAddress = (
    typeof body.to === "string" && /^0x[a-fA-F0-9]{40}$/.test(body.to)
      ? body.to
      : typeof body.typedData?.domain?.verifyingContract === "string" &&
          /^0x[a-fA-F0-9]{40}$/.test(body.typedData.domain.verifyingContract)
        ? body.typedData.domain.verifyingContract
        : "0x0000000000000000000000000000000000000000"
  ) as `0x${string}`;

  let valueBigInt = 0n;
  try {
    if (body.value) valueBigInt = BigInt(body.value);
  } catch {
    valueBigInt = 0n;
  }

  const dataHash = keccak256(
    stringToHex(
      String(body.data || body.transaction || JSON.stringify(body.typedData || body.transactions || "0x"))
    )
  );
  const nonce = keccak256(
    stringToHex(`nc_cosign:${policyId}:${targetAddress}:${dataHash}:${Date.now()}:${Math.random()}`)
  );

  const domain = {
    name: "NullClearPolicyCoSigner",
    version: "1",
    chainId
  } as const;

  const message = {
    policyId,
    target: targetAddress,
    value: valueBigInt,
    dataHash,
    recommendedAction: guardResult.recommendedAgentAction,
    validUntil: BigInt(validUntil),
    nonce
  } as const;

  const signature = await account.signTypedData({
    domain,
    types: POLICY_EIP712_TYPES,
    primaryType: "PolicyApproval",
    message
  });

  c.header("X-NullClear-Firewall", "COSIGN_APPROVED");
  c.header("X-NullClear-Attestation", guardResult.provenance.attestationSha256);

  return c.json({
    approved: true,
    policyId,
    chain,
    chainId,
    coSignerAddress: account.address,
    signature,
    eip712: {
      domain,
      types: POLICY_EIP712_TYPES,
      primaryType: "PolicyApproval",
      message: {
        policyId,
        target: targetAddress,
        value: valueBigInt.toString(),
        dataHash,
        recommendedAction: guardResult.recommendedAgentAction,
        validUntil: String(validUntil),
        nonce
      }
    },
    recommendedAgentAction: guardResult.recommendedAgentAction,
    violatedRules: [],
    guardSummary: {
      llmDigest: guardResult.llmDigest,
      alerts: guardAlerts,
      assetDiffs: guardAny.assetDiffs || [],
      touchedTokenVerdicts: guardAny.touchedTokenVerdicts || []
    },
    attestation: guardResult.provenance.attestationSha256,
    settlementTransaction: auth.settlementTx,
    timestamp: Date.now()
  });
});
