import { Hono, type Context } from "hono";
import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  encodeBase64Json,
  NULLCLEAR_TREASURY_ADDRESS,
  type X402PaymentOption
} from "@nullclear/shared";
import {
  getArbiterStore,
  type Env,
  type WatchtowerMonitorRecord
} from "../env.js";
import { settleTransfer } from "../services/facilitator.js";
import { validateTargetUrl } from "../services/ssrf-guard.js";
import {
  scanTokenForensics,
  inspectContractAbiAndProxy,
  normalizeChain,
  isEvmAddress,
  isSolanaAddress
} from "../services/forensics-engine.js";
import {
  authenticateAndDebitPass,
  authenticatePassReadOnly
} from "../middleware/pass-auth.js";
import { buildNullClearMetadata } from "../middleware/free-tier.js";
import {
  extractPaymentAuthorization,
  attachDualX402Headers
} from "../utils/x402-headers.js";
import { getBazaarResourceMetadata, parseAtomicBigInt } from "./bazaar-metadata.js";

export const monitorsRouter = new Hono<Env>();

const FALLBACK_DEV_ARBITER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`;

export interface WatchtowerAlertRules {
  onProxyChange: boolean;
  onTaxSpikeAbove: number;
  onCriticalTrap: boolean;
  onLiquidityDropPct: number;
  onMintAuthorityChange: boolean;
}

export const DEFAULT_ALERT_RULES: WatchtowerAlertRules = {
  onProxyChange: true,
  onTaxSpikeAbove: 5,
  onCriticalTrap: true,
  onLiquidityDropPct: 30,
  onMintAuthorityChange: true
};

export interface MonitorSnapshot {
  chain: string;
  address: string;
  verdict: string;
  score: number;
  isProxy: boolean;
  implementationAddress: string | null;
  buyTaxPercent: number;
  sellTaxPercent: number;
  liquidityUsd: number;
  ownerStatus: string;
  solanaMintAuthority?: string | null;
  solanaFreezeAuthority?: string | null;
  capturedAt: number;
}

function sanitizeAlertRules(raw: any): WatchtowerAlertRules {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    onProxyChange:
      typeof obj.onProxyChange === "boolean" ? obj.onProxyChange : DEFAULT_ALERT_RULES.onProxyChange,
    onTaxSpikeAbove:
      typeof obj.onTaxSpikeAbove === "number" && obj.onTaxSpikeAbove >= 0 && obj.onTaxSpikeAbove <= 100
        ? obj.onTaxSpikeAbove
        : DEFAULT_ALERT_RULES.onTaxSpikeAbove,
    onCriticalTrap:
      typeof obj.onCriticalTrap === "boolean"
        ? obj.onCriticalTrap
        : DEFAULT_ALERT_RULES.onCriticalTrap,
    onLiquidityDropPct:
      typeof obj.onLiquidityDropPct === "number" &&
      obj.onLiquidityDropPct >= 5 &&
      obj.onLiquidityDropPct <= 99
        ? obj.onLiquidityDropPct
        : DEFAULT_ALERT_RULES.onLiquidityDropPct,
    onMintAuthorityChange:
      typeof obj.onMintAuthorityChange === "boolean"
        ? obj.onMintAuthorityChange
        : DEFAULT_ALERT_RULES.onMintAuthorityChange
  };
}

export async function captureMonitorSnapshot(
  chain: string,
  address: string,
  env?: Env["Bindings"]
): Promise<MonitorSnapshot> {
  const normChain = normalizeChain(chain);
  const [scan, inspect] = await Promise.all([
    scanTokenForensics(normChain, address, env),
    normChain !== "solana" && isEvmAddress(address)
      ? inspectContractAbiAndProxy(normChain, address, env).catch(() => null)
      : Promise.resolve(null)
  ]);

  const solMeta = (scan.evidence as any)?.solanaTokenInfo;
  return {
    chain: scan.chain,
    address: scan.address,
    verdict: scan.verdict,
    score: scan.score,
    isProxy: Boolean(inspect?.isProxy ?? scan.evidence.isProxy),
    implementationAddress: inspect?.implementationAddress || scan.evidence.implementationAddress || null,
    buyTaxPercent: Number(scan.evidence.buyTaxPercent || 0),
    sellTaxPercent: Number(scan.evidence.sellTaxPercent || 0),
    liquidityUsd: Number(scan.evidence.liquidityUsd || 0),
    ownerStatus: String(scan.evidence.ownerStatus || "UNKNOWN"),
    solanaMintAuthority: solMeta?.mintAuthority ?? null,
    solanaFreezeAuthority: solMeta?.freezeAuthority ?? null,
    capturedAt: Date.now()
  };
}

export function diffMonitorSnapshots(
  prev: MonitorSnapshot | null,
  curr: MonitorSnapshot,
  rules: WatchtowerAlertRules
): string[] {
  const alerts: string[] = [];

  if (rules.onCriticalTrap && curr.verdict === "CRITICAL TRAP" && prev?.verdict !== "CRITICAL TRAP") {
    alerts.push(`CRITICAL TRAP detected on ${curr.chain}:${curr.address} (score=${curr.score})`);
  }

  if (!prev) {
    return alerts;
  }

  if (
    rules.onProxyChange &&
    (prev.implementationAddress || "").toLowerCase() !== (curr.implementationAddress || "").toLowerCase()
  ) {
    alerts.push(
      `Proxy implementation changed from ${prev.implementationAddress || "none"} to ${curr.implementationAddress || "none"}`
    );
  }

  if (
    (curr.sellTaxPercent > rules.onTaxSpikeAbove && curr.sellTaxPercent > prev.sellTaxPercent) ||
    (curr.buyTaxPercent > rules.onTaxSpikeAbove && curr.buyTaxPercent > prev.buyTaxPercent)
  ) {
    alerts.push(
      `Token tax spiked above ${rules.onTaxSpikeAbove}%: buy ${prev.buyTaxPercent}%->${curr.buyTaxPercent}%, sell ${prev.sellTaxPercent}%->${curr.sellTaxPercent}%`
    );
  }

  if (prev.liquidityUsd > 100 && curr.liquidityUsd < prev.liquidityUsd) {
    const dropPct = ((prev.liquidityUsd - curr.liquidityUsd) / prev.liquidityUsd) * 100;
    if (dropPct >= rules.onLiquidityDropPct) {
      alerts.push(
        `Liquidity dropped ${dropPct.toFixed(1)}% ($${prev.liquidityUsd.toFixed(0)} -> $${curr.liquidityUsd.toFixed(0)})`
      );
    }
  }

  if (rules.onMintAuthorityChange) {
    if (prev.ownerStatus !== curr.ownerStatus) {
      alerts.push(`Owner status changed: ${prev.ownerStatus} -> ${curr.ownerStatus}`);
    }
    if (prev.solanaMintAuthority !== curr.solanaMintAuthority) {
      alerts.push(
        `Solana mintAuthority changed: ${prev.solanaMintAuthority || "revoked"} -> ${curr.solanaMintAuthority || "revoked"}`
      );
    }
    if (prev.solanaFreezeAuthority !== curr.solanaFreezeAuthority) {
      alerts.push(
        `Solana freezeAuthority changed: ${prev.solanaFreezeAuthority || "revoked"} -> ${curr.solanaFreezeAuthority || "revoked"}`
      );
    }
  }

  return alerts;
}

async function dispatchWatchtowerWebhook(
  monitor: WatchtowerMonitorRecord,
  alerts: string[],
  previousState: MonitorSnapshot | null,
  currentState: MonitorSnapshot,
  env?: Env["Bindings"]
): Promise<{ delivered: boolean; status?: number; signature: string }> {
  const payload = {
    event: "NULLCLEAR_WATCHTOWER_ALERT",
    monitorId: monitor.id,
    chain: monitor.chain,
    address: monitor.targetAddress,
    alerts,
    previousState,
    currentState,
    timestamp: Date.now()
  };
  const bodyStr = JSON.stringify(payload);
  const digest = keccak256(stringToHex(bodyStr));
  const key = (
    env?.ARBITER_PRIVATE_KEY &&
    env.ARBITER_PRIVATE_KEY.startsWith("0x") &&
    env.ARBITER_PRIVATE_KEY.length === 66
      ? env.ARBITER_PRIVATE_KEY
      : FALLBACK_DEV_ARBITER_KEY
  ) as `0x${string}`;
  const account = privateKeyToAccount(key);
  const signature = await account.signMessage({ message: digest });

  try {
    const res = await fetch(monitor.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NullClear-Watchtower-Digest": digest,
        "X-NullClear-Watchtower-Signature": signature,
        "X-NullClear-Watchtower-Signer": account.address
      },
      body: bodyStr
    });
    return { delivered: res.ok, status: res.status, signature };
  } catch {
    return { delivered: false, signature };
  }
}

export async function evaluateSingleMonitor(
  monitor: WatchtowerMonitorRecord,
  env?: Env["Bindings"]
): Promise<{
  monitorId: string;
  alerts: string[];
  webhookDelivered: boolean;
  currentState: MonitorSnapshot;
}> {
  const store = getArbiterStore(env);
  let prev: MonitorSnapshot | null = null;
  if (monitor.lastStateJson) {
    try {
      prev = JSON.parse(monitor.lastStateJson) as MonitorSnapshot;
    } catch {}
  }
  let rules: WatchtowerAlertRules = DEFAULT_ALERT_RULES;
  try {
    rules = sanitizeAlertRules(JSON.parse(monitor.alertRulesJson));
  } catch {}

  const currentState = await captureMonitorSnapshot(monitor.chain, monitor.targetAddress, env);
  const alerts = diffMonitorSnapshots(prev, currentState, rules);
  const now = Date.now();
  let webhookDelivered = false;

  if (alerts.length > 0) {
    const delivery = await dispatchWatchtowerWebhook(monitor, alerts, prev, currentState, env);
    webhookDelivered = delivery.delivered;
  }

  await store.updateWatchtowerMonitorState(monitor.id, {
    lastStateJson: JSON.stringify(currentState),
    lastCheckedAt: now,
    lastAlertAt: alerts.length > 0 ? now : undefined,
    incrementAlerts: alerts.length > 0
  });

  return {
    monitorId: monitor.id,
    alerts,
    webhookDelivered,
    currentState
  };
}

/**
 * Bounded batch cron worker invoked from Worker scheduled() handler.
 * Processes oldest-checked active monitors without exceeding Cloudflare Worker subrequest limits.
 */
export async function runWatchtowerCronTick(
  env?: Env["Bindings"],
  batchLimit = 6
): Promise<{ checked: number; alertsFired: number }> {
  const store = getArbiterStore(env);
  const dueMonitors = await store.listActiveWatchtowerMonitors(batchLimit);
  let checked = 0;
  let alertsFired = 0;

  for (const mon of dueMonitors) {
    try {
      const result = await evaluateSingleMonitor(mon, env);
      checked += 1;
      if (result.alerts.length > 0) {
        alertsFired += result.alerts.length;
      }
    } catch {
      // Keep cron tick resilient across individual monitor RPC hiccups
    }
  }
  return { checked, alertsFired };
}

const MONITOR_AMOUNT_ATOMIC = "1000000";
const MONITOR_DESCRIPTION =
  "30-Day Continuous Watchtower Monitor across 7 chains (proxy upgrades, tax spikes, LP pulls, Solana mint/freeze hooks) with signed webhooks";

function buildMonitor402Response(c: Context<Env>, msg?: string): Response {
  const resourceMeta = getBazaarResourceMetadata("/v1/monitors");
  const payload = {
    x402Version: 2,
    scheme: "exact",
    network: "eip155:8453",
    amount: MONITOR_AMOUNT_ATOMIC,
    payTo: NULLCLEAR_TREASURY_ADDRESS,
    resource: {
      url: "https://api.nullclear.dev/v1/monitors",
      description: MONITOR_DESCRIPTION,
      mimeType: "application/json",
      ...resourceMeta
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: MONITOR_AMOUNT_ATOMIC,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: NULLCLEAR_TREASURY_ADDRESS,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" }
      }
    ],
    extensions: {
      bazaar: {
        discoverable: true,
        description: MONITOR_DESCRIPTION
      }
    }
  };
  const encoded = encodeBase64Json(payload);
  c.header("PAYMENT-REQUIRED", encoded);
  c.header("Pay-To", NULLCLEAR_TREASURY_ADDRESS);
  return c.json(
    {
      error: "Payment Required",
      message:
        msg ||
        "Register a 30-day Watchtower Monitor using Authorization: Bearer <nc_live_key> (50 credits) OR $1.00 USDC x402 EIP-3009 payment.",
      buyPassUrl: "POST https://api.nullclear.dev/v1/pass/buy",
      endpoints: {
        create: "POST https://api.nullclear.dev/v1/monitors",
        list: "GET https://api.nullclear.dev/v1/monitors (Authorization: Bearer nc_live_...)",
        checkNow: "POST https://api.nullclear.dev/v1/monitors/:id/check",
        delete: "DELETE https://api.nullclear.dev/v1/monitors/:id"
      },
      ...payload
    },
    402
  );
}

async function resolveMonitorCreateAuth(c: Context<Env>): Promise<{
  authorized: boolean;
  ownerAddress?: string;
  passId?: string | null;
  settlementTx?: string;
  errorResponse?: Response;
}> {
  // 1. Prepaid Pass (50 credits = 30-day continuous watchtower monitor)
  const passAuth = await authenticateAndDebitPass(c, 50);
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

  // 2. Direct x402 EIP-3009 USDC ($1.00 USDC / 1,000,000 atomic for 30 days)
  const amountAtomic = MONITOR_AMOUNT_ATOMIC;
  const paymentHeader =
    c.req.header("payment-signature") ||
    c.req.header("x-payment") ||
    c.req.header("x-nullclear-authorization");

  const make402 = (msg?: string) => ({
    authorized: false,
    errorResponse: buildMonitor402Response(c, msg)
  });

  if (!paymentHeader) return make402();

  let parsedAuth: ReturnType<typeof extractPaymentAuthorization> = null;
  try {
    parsedAuth = extractPaymentAuthorization(c.req);
  } catch {
    parsedAuth = null;
  }
  if (!parsedAuth || !parsedAuth.from || !parsedAuth.signature) {
    return make402("Invalid x402 payment header");
  }
  const parsedValue = parseAtomicBigInt(parsedAuth.value);
  if (parsedValue === null || parsedValue < BigInt(amountAtomic)) {
    return make402(`Insufficient payment: expected ${amountAtomic} atomic USDC ($1.00)`);
  }

  const payer = parsedAuth.from.toLowerCase() as `0x${string}`;
  const isTestWallet =
    payer === "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" ||
    (c.env?.ENVIRONMENT !== "production" && !c.env?.FACILITATOR_URL);

  let txHash: `0x${string}`;
  if (isTestWallet) {
    txHash = keccak256(stringToHex(`monitor_sim:${payer}:${parsedAuth.nonce}:${Date.now()}`));
  } else {
    const accepted: X402PaymentOption = parsedAuth.accepted || {
      scheme: "exact",
      network: "eip155:8453",
      amount: amountAtomic,
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
        amount: amountAtomic,
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
        url: "https://api.nullclear.dev/v1/monitors",
        description: MONITOR_DESCRIPTION,
        mimeType: "application/json",
        ...getBazaarResourceMetadata("/v1/monitors")
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

// GET /v1/monitors — List monitors for authenticated pass, or emit 402 Payment Required challenge for x402 conformance
monitorsRouter.get("/", async (c) => {
  const auth = await authenticatePassReadOnly(c);
  if (auth.authenticated && auth.pass) {
    const store = getArbiterStore(c.env);
    const monitors = await store.listWatchtowerMonitorsByOwner(auth.pass.ownerAddress);
    return c.json({
      ownerAddress: auth.pass.ownerAddress,
      count: monitors.length,
      monitors: monitors.map((m) => ({
        monitorId: m.id,
        chain: m.chain,
        address: m.targetAddress,
        webhookUrl: m.webhookUrl,
        alertRules: JSON.parse(m.alertRulesJson),
        lastState: m.lastStateJson ? JSON.parse(m.lastStateJson) : null,
        lastCheckedAt: m.lastCheckedAt,
        lastAlertAt: m.lastAlertAt,
        alertCount: m.alertCount,
        active: m.active,
        expiresAt: m.expiresAt
      }))
    });
  }

  return buildMonitor402Response(c);
});

// POST /v1/monitors — Register a new 30-day Watchtower Monitor
monitorsRouter.post("/", async (c) => {
  const auth = await resolveMonitorCreateAuth(c);
  if (!auth.authorized) return auth.errorResponse!;

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {}

  const rawAddress = typeof body.address === "string" ? body.address.trim() : "";
  const rawWebhook = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  const chain = normalizeChain(body.chain || (isSolanaAddress(rawAddress) && !isEvmAddress(rawAddress) ? "solana" : "base"));

  if (!rawAddress || (!isEvmAddress(rawAddress) && !isSolanaAddress(rawAddress))) {
    return c.json(
      { error: "Invalid target address", message: "Provide a valid EVM (0x...) or Solana base58 address." },
      400
    );
  }
  if (!rawWebhook) {
    return c.json(
      { error: "Missing webhookUrl", message: "Provide a valid HTTPS webhookUrl to receive signed alerts." },
      400
    );
  }
  const ssrf = validateTargetUrl(rawWebhook, c.env?.ENVIRONMENT);
  if (!ssrf.allowed) {
    return c.json({ error: "Forbidden webhookUrl", reason: ssrf.reason }, 400);
  }

  const alertRules = sanitizeAlertRules(body.alertRules || body.rules);
  const baseline = await captureMonitorSnapshot(chain, rawAddress, c.env);
  const now = Date.now();
  const durationDays =
    typeof body.durationDays === "number" && body.durationDays >= 1 && body.durationDays <= 365
      ? Math.floor(body.durationDays)
      : 30;
  const monitorId = `mon_${now}_${Math.random().toString(36).slice(2, 8)}`;

  const record: WatchtowerMonitorRecord = {
    id: monitorId,
    ownerAddress: auth.ownerAddress || "0x0000000000000000000000000000000000000000",
    passId: auth.passId || null,
    chain,
    targetAddress: isEvmAddress(rawAddress) ? rawAddress.toLowerCase() : rawAddress,
    webhookUrl: rawWebhook,
    alertRulesJson: JSON.stringify(alertRules),
    lastStateJson: JSON.stringify(baseline),
    lastCheckedAt: now,
    lastAlertAt: 0,
    alertCount: 0,
    active: true,
    expiresAt: now + durationDays * 24 * 3600 * 1000,
    createdAt: now
  };

  const store = getArbiterStore(c.env);
  await store.createWatchtowerMonitor(record);

  return c.json(
    {
      monitorId,
      chain: record.chain,
      address: record.targetAddress,
      webhookUrl: record.webhookUrl,
      alertRules,
      baseline,
      active: true,
      expiresAt: record.expiresAt,
      settlementTransaction: auth.settlementTx,
      checkNowEndpoint: `POST https://api.nullclear.dev/v1/monitors/${monitorId}/check`
    },
    201
  );
});

// POST /v1/monitors/:id/check — Run an immediate diff check & dispatch webhook if triggered
monitorsRouter.post("/:id/check", async (c) => {
  const auth = await authenticatePassReadOnly(c);
  if (!auth.authenticated || !auth.pass) {
    return c.json({ error: auth.errorReason || "Requires Authorization: Bearer nc_live_..." }, 401);
  }
  const store = getArbiterStore(c.env);
  const monitor = await store.getWatchtowerMonitor(c.req.param("id"));
  if (!monitor) {
    return c.json({ error: "Monitor not found" }, 404);
  }
  if (monitor.ownerAddress.toLowerCase() !== auth.pass.ownerAddress.toLowerCase()) {
    return c.json({ error: "Forbidden: monitor belongs to a different pass owner" }, 403);
  }
  const result = await evaluateSingleMonitor(monitor, c.env);
  return c.json(result);
});

// DELETE /v1/monitors/:id — Deactivate & remove monitor
monitorsRouter.delete("/:id", async (c) => {
  const auth = await authenticatePassReadOnly(c);
  if (!auth.authenticated || !auth.pass) {
    return c.json({ error: auth.errorReason || "Requires Authorization: Bearer nc_live_..." }, 401);
  }
  const store = getArbiterStore(c.env);
  const deleted = await store.deleteWatchtowerMonitor(c.req.param("id"), auth.pass.ownerAddress);
  if (!deleted) {
    return c.json({ error: "Monitor not found or not owned by this pass" }, 404);
  }
  return c.json({ deleted: true, monitorId: c.req.param("id") });
});
