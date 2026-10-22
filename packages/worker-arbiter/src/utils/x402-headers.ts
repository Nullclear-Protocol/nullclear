import { hexToSignature } from "viem";
import {
  BASE_MAINNET_USDC,
  BASE_SEPOLIA,
  NULLCLEAR_TREASURY_ADDRESS,
  decodeBase64Json,
  encodeBase64Json,
  type EIP3009Authorization,
  type X402PaymentOption,
  type X402PaymentRequired,
  type X402PaymentResponse,
  type X402PaymentSignaturePayload
} from "@nullclear/shared";

const BASE_SEPOLIA_USDC = BASE_SEPOLIA.usdc;

export interface NormalizedPaymentAuthorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
  signature: `0x${string}`;
  rawHeader: string;
  protocolVersion: "v1" | "v2";
  accepted: X402PaymentOption;
  paymentSigPayload: X402PaymentSignaturePayload;
}

export interface NormalizedUpstream402Challenge {
  sellerAddress: `0x${string}` | null;
  priceAtomic: string | null;
  network: "eip155:8453" | "eip155:84532" | string;
  scheme: "exact" | "upto";
  description: string | null;
  rawChallenge: unknown;
  asset?: `0x${string}`;
  maxTimeoutSeconds?: number;
  accepts?: X402PaymentOption[];
  isValidX402: boolean;
}

export interface DualX402HeaderOptions {
  /** Outbound 402 challenge payload (object or Base64 string) */
  paymentRequired?: Record<string, unknown> | X402PaymentRequired | string;
  /** Outbound 200 settlement receipt payload (object or Base64 string) */
  paymentResponse?: X402PaymentResponse | Record<string, unknown> | string;
  /** Explicit X-NullClear-Verified value (defaults to true when paymentResponse is settled) */
  verified?: boolean;
  /** Optional status shorthand (e.g. 200 or 402) */
  status?: number;
  transaction?: string;
  network?: string;
  payer?: string;
}

function normalizeNetworkId(rawNetwork?: string): "eip155:8453" | "eip155:84532" {
  if (!rawNetwork) return "eip155:8453";
  const lower = String(rawNetwork).trim().toLowerCase();
  if (lower.includes("84532") || lower.includes("sepolia")) {
    return "eip155:84532";
  }
  return "eip155:8453";
}

function parseJsonOrBase64(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Empty header payload");
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  try {
    return decodeBase64Json<unknown>(trimmed);
  } catch {
    // Try base64url normalization
    const base64Norm = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64Norm + "=".repeat((4 - (base64Norm.length % 4)) % 4);
    return decodeBase64Json<unknown>(padded);
  }
}

function extractVrsFromSignature(
  signature?: string,
  rawV?: number | string,
  rawR?: string,
  rawS?: string
): { v: number; r: `0x${string}`; s: `0x${string}`; signature: `0x${string}` } {
  if (signature && typeof signature === "string" && signature.startsWith("0x")) {
    try {
      const parsed = hexToSignature(signature as `0x${string}`);
      return {
        v: Number(parsed.v ?? (parsed.yParity !== undefined ? parsed.yParity + 27 : 27)),
        r: parsed.r,
        s: parsed.s,
        signature: signature as `0x${string}`
      };
    } catch {
      const clean = signature.slice(2);
      if (clean.length >= 128) {
        const r = `0x${clean.slice(0, 64)}` as `0x${string}`;
        const s = `0x${clean.slice(64, 128)}` as `0x${string}`;
        const vHex = clean.slice(128, 130);
        const v = vHex ? parseInt(vHex, 16) : 27;
        return { v: Number.isNaN(v) ? 27 : v, r, s, signature: signature as `0x${string}` };
      }
    }
  }

  const v = rawV !== undefined ? Number(rawV) : 27;
  const r = (rawR && rawR.startsWith("0x") ? rawR : `0x${"0".repeat(64)}`) as `0x${string}`;
  const s = (rawS && rawS.startsWith("0x") ? rawS : `0x${"0".repeat(64)}`) as `0x${string}`;
  const reconstructedSig =
    signature && signature.startsWith("0x")
      ? (signature as `0x${string}`)
      : (`0x${r.slice(2).padStart(64, "0")}${s.slice(2).padStart(64, "0")}${v.toString(16).padStart(2, "0")}` as `0x${string}`);

  return {
    v,
    r,
    s,
    signature: reconstructedSig
  };
}

function getHeaderCaseInsensitive(
  reqOrHeaders: any,
  headerName: string
): string | undefined {
  if (!reqOrHeaders) return undefined;
  const lower = headerName.toLowerCase();

  // HonoRequest: req.header(name)
  if (typeof reqOrHeaders.header === "function") {
    const val = reqOrHeaders.header(headerName) ?? reqOrHeaders.header(lower) ?? reqOrHeaders.header(headerName.toUpperCase());
    if (val) return val;
  }

  // Standard Request: req.headers.get(name)
  if (reqOrHeaders.headers && typeof reqOrHeaders.headers.get === "function") {
    const val = reqOrHeaders.headers.get(headerName) ?? reqOrHeaders.headers.get(lower);
    if (val) return val;
  }

  // Standard Headers instance directly
  if (typeof reqOrHeaders.get === "function") {
    const val = reqOrHeaders.get(headerName) ?? reqOrHeaders.get(lower);
    if (val) return val;
  }

  // Plain object of headers
  const obj = reqOrHeaders.headers && typeof reqOrHeaders.headers === "object" && !(reqOrHeaders.headers instanceof Headers)
    ? reqOrHeaders.headers
    : typeof reqOrHeaders === "object"
      ? reqOrHeaders
      : null;

  if (obj) {
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase() === lower && typeof v === "string") {
        return v;
      }
    }
  }

  return undefined;
}

/**
 * Decodes a raw payment header value (Base64 JSON or raw JSON, V1 or V2) into a NormalizedPaymentAuthorization.
 */
export function decodePaymentAuthorizationHeader(
  rawHeaderValue: string,
  protocolVersionHint?: "v1" | "v2"
): NormalizedPaymentAuthorization | null {
  const trimmed = (rawHeaderValue || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "free-trial" || trimmed.toLowerCase() === "sponsored") {
    return null;
  }

  const cleaned = trimmed.replace(/^(?:x402|Bearer\s+x402:?)\s+/i, "").trim();
  const decoded: any = parseJsonOrBase64(cleaned);
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Decoded payment authorization is not an object");
  }

  const authObj = decoded.payload?.authorization || decoded.authorization || decoded;
  const rawSig = decoded.payload?.signature || decoded.signature || authObj?.signature;

  const from = authObj?.from as `0x${string}` | undefined;
  const to = (authObj?.to || decoded.accepted?.payTo || decoded.payTo) as `0x${string}` | undefined;
  const rawValue = authObj?.value ?? decoded.accepted?.amount ?? decoded.amount ?? decoded.maxAmountRequired;
  const validAfter = String(authObj?.validAfter ?? "0");
  const validBefore = String(authObj?.validBefore ?? Math.floor(Date.now() / 1000) + 300);
  const nonce = (authObj?.nonce || "0x" + "00".repeat(32)) as `0x${string}`;

  if (!from || !to || rawValue === undefined || rawValue === null) {
    throw new Error("Missing required EIP-3009 authorization fields (from, to, value)");
  }

  const value = String(rawValue);
  const { v, r, s, signature } = extractVrsFromSignature(rawSig, authObj?.v, authObj?.r, authObj?.s);

  const network = normalizeNetworkId(
    decoded.accepted?.network || decoded.network || authObj?.network
  );
  const defaultAsset = network === "eip155:84532" ? BASE_SEPOLIA_USDC : BASE_MAINNET_USDC;

  const accepted: X402PaymentOption = decoded.accepted
    ? {
        scheme: "exact",
        network: normalizeNetworkId(decoded.accepted.network),
        amount: String(decoded.accepted.amount ?? value),
        asset: (decoded.accepted.asset || defaultAsset) as `0x${string}`,
        payTo: (decoded.accepted.payTo || to) as `0x${string}`,
        maxTimeoutSeconds: Number(decoded.accepted.maxTimeoutSeconds || 300),
        extra: decoded.accepted.extra || { name: "USD Coin", version: "2" }
      }
    : {
        scheme: "exact",
        network,
        amount: value,
        asset: (decoded.asset || defaultAsset) as `0x${string}`,
        payTo: (decoded.payTo || to) as `0x${string}`,
        maxTimeoutSeconds: Number(decoded.maxTimeoutSeconds || 300),
        extra: decoded.extra || { name: "USD Coin", version: "2" }
      };

  const authorization: EIP3009Authorization = {
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce
  };

  let protocolVersion: "v1" | "v2" = protocolVersionHint || "v2";
  if (decoded.x402Version === 1) {
    protocolVersion = "v1";
  } else if (decoded.x402Version === 2 && !protocolVersionHint) {
    protocolVersion = "v2";
  }

  const paymentSigPayload: X402PaymentSignaturePayload = {
    x402Version: 2,
    resource: decoded.resource,
    accepted,
    payload: {
      signature,
      authorization
    }
  };

  return {
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
    v,
    r,
    s,
    signature,
    rawHeader: trimmed,
    protocolVersion,
    accepted,
    paymentSigPayload
  };
}

/**
 * Checks incoming headers in priority order:
 * 1. PAYMENT-SIGNATURE (x402 V2)
 * 2. X-Payment (x402 V1)
 * 3. X-NullClear-Authorization
 * 4. Authorization: x402 ...
 * Automatically decodes Base64-encoded JSON or raw JSON payloads into a normalized EIP-3009 authorization object.
 */
export function extractPaymentAuthorization(
  req: Request | { header: (name: string) => string | undefined } | Headers | Record<string, string | undefined> | string
): NormalizedPaymentAuthorization | null {
  if (typeof req === "string") {
    return decodePaymentAuthorizationHeader(req, "v2");
  }

  // 1. PAYMENT-SIGNATURE (V2)
  const v2Sig = getHeaderCaseInsensitive(req, "PAYMENT-SIGNATURE");
  if (v2Sig && v2Sig.toLowerCase() !== "free-trial" && v2Sig.toLowerCase() !== "sponsored") {
    return decodePaymentAuthorizationHeader(v2Sig, "v2");
  }

  // 2. X-Payment (V1)
  const v1Sig = getHeaderCaseInsensitive(req, "X-Payment");
  if (v1Sig && v1Sig.toLowerCase() !== "free-trial" && v1Sig.toLowerCase() !== "sponsored") {
    return decodePaymentAuthorizationHeader(v1Sig, "v1");
  }

  // 3. X-NullClear-Authorization
  const ncAuth = getHeaderCaseInsensitive(req, "X-NullClear-Authorization");
  if (ncAuth && ncAuth.toLowerCase() !== "free-trial" && ncAuth.toLowerCase() !== "sponsored") {
    return decodePaymentAuthorizationHeader(ncAuth, "v2");
  }

  // 4. Authorization: x402 ...
  const authHeader = getHeaderCaseInsensitive(req, "Authorization");
  if (authHeader && /^x402\s+/i.test(authHeader.trim())) {
    const token = authHeader.trim().replace(/^x402\s+/i, "").trim();
    return decodePaymentAuthorizationHeader(token, "v1");
  }

  return null;
}

function parsePriceToAtomic(rawPrice: string | number | undefined | null): string | null {
  if (rawPrice === undefined || rawPrice === null) return null;
  const str = String(rawPrice).trim().replace(/^\$/, "").replace(/\s*usdc?$/i, "").trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    return str;
  }
  const floatVal = Number(str);
  if (!Number.isNaN(floatVal) && floatVal > 0) {
    // Decimal USD price (e.g. "0.01" from crawler-price) -> convert to 6-decimal USDC atomic units
    return String(Math.round(floatVal * 1_000_000));
  }
  return null;
}

/**
 * Extracts payment requirements from upstream 402 Payment Required responses across
 * PAYMENT-REQUIRED (x402 V2), X-Payment-Required (x402 V1), WWW-Authenticate,
 * crawler-price / x-crawler-price, or the JSON response body (accepts array).
 */
export function parseUpstream402Challenge(
  res: Response | { status?: number; headers: Headers | Record<string, string> },
  bodyText?: string
): NormalizedUpstream402Challenge {
  let sellerAddress: `0x${string}` | null = null;
  let priceAtomic: string | null = null;
  let network: string = "eip155:8453";
  let scheme: "exact" | "upto" = "exact";
  let description: string | null = null;
  let rawChallenge: unknown = null;
  let asset: `0x${string}` | undefined;
  let maxTimeoutSeconds: number | undefined;
  let accepts: X402PaymentOption[] | undefined;
  let isValidX402 = false;

  const headers = res.headers;

  const applyChallengeObject = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    if (!rawChallenge) rawChallenge = obj;
    isValidX402 = true;

    const firstAccept = Array.isArray(obj.accepts) ? obj.accepts[0] : null;
    if (Array.isArray(obj.accepts)) {
      accepts = obj.accepts;
    }

    const candidatePayTo =
      firstAccept?.payTo ||
      obj.payTo ||
      obj.sellerAddress ||
      obj.recipient ||
      obj.gateway?.sellerAddress;
    if (typeof candidatePayTo === "string" && /^0x[a-fA-F0-9]{40}$/.test(candidatePayTo.trim())) {
      sellerAddress = (sellerAddress || candidatePayTo.trim()) as `0x${string}`;
    }

    const candidateAmt =
      firstAccept?.amount ??
      firstAccept?.maxAmountRequired ??
      obj.amount ??
      obj.maxAmountRequired ??
      obj.priceAtomic ??
      obj.price ??
      obj.gateway?.priceAtomic;
    const parsedAmt = parsePriceToAtomic(candidateAmt);
    if (parsedAmt && !priceAtomic) {
      priceAtomic = parsedAmt;
    }

    const candidateNet = firstAccept?.network || obj.network;
    if (typeof candidateNet === "string" && candidateNet.trim()) {
      network = normalizeNetworkId(candidateNet);
    }

    const candidateScheme = firstAccept?.scheme || obj.scheme;
    if (candidateScheme === "upto" || candidateScheme === "exact") {
      scheme = candidateScheme;
    }

    const candidateAsset = firstAccept?.asset || obj.asset;
    if (typeof candidateAsset === "string" && /^0x[a-fA-F0-9]{40}$/.test(candidateAsset)) {
      asset = candidateAsset as `0x${string}`;
    }

    const candidateTimeout = firstAccept?.maxTimeoutSeconds ?? obj.maxTimeoutSeconds;
    if (typeof candidateTimeout === "number" && candidateTimeout > 0) {
      maxTimeoutSeconds = candidateTimeout;
    }

    const candidateDesc =
      obj.resource?.description ||
      firstAccept?.description ||
      obj.description ||
      obj.gateway?.description;
    if (typeof candidateDesc === "string" && candidateDesc.trim() && !description) {
      description = candidateDesc.trim();
    }
  };

  // 1. Check PAYMENT-REQUIRED (V2) and X-Payment-Required (V1)
  const paymentReqHdr =
    getHeaderCaseInsensitive(headers, "PAYMENT-REQUIRED") ||
    getHeaderCaseInsensitive(headers, "X-Payment-Required");
  if (paymentReqHdr) {
    isValidX402 = true;
    rawChallenge = paymentReqHdr;
    try {
      const decoded = parseJsonOrBase64(paymentReqHdr);
      applyChallengeObject(decoded);
    } catch {
      const addrMatch = paymentReqHdr.match(/0x[a-fA-F0-9]{40}/);
      if (addrMatch) sellerAddress = addrMatch[0] as `0x${string}`;
      const amtMatch = paymentReqHdr.match(/(?:amount|price|maxAmountRequired)=["']?([0-9.]+)["']?/i);
      if (amtMatch) priceAtomic = parsePriceToAtomic(amtMatch[1]);
    }
  }

  // 2. Check WWW-Authenticate header
  const wwwAuth = getHeaderCaseInsensitive(headers, "WWW-Authenticate");
  if (wwwAuth) {
    if (!rawChallenge) rawChallenge = wwwAuth;
    if (/x402|eip3009|usdc|payment/i.test(wwwAuth) || res.status === 402) {
      isValidX402 = true;
    }
    const addrMatch = wwwAuth.match(/0x[a-fA-F0-9]{40}/);
    if (addrMatch && !sellerAddress) sellerAddress = addrMatch[0] as `0x${string}`;
    const amtMatch = wwwAuth.match(/(?:amount|price|maxAmountRequired)=["']?([0-9.]+)["']?/i);
    if (amtMatch && !priceAtomic) priceAtomic = parsePriceToAtomic(amtMatch[1]);
    const schemeMatch = wwwAuth.match(/scheme=["']?(exact|upto)["']?/i);
    if (schemeMatch) scheme = schemeMatch[1].toLowerCase() as "exact" | "upto";
  }

  // 3. Check Cloudflare Pay-Per-Crawl headers (crawler-price, x-crawler-price, Pay-To)
  const crawlerPrice =
    getHeaderCaseInsensitive(headers, "crawler-price") ||
    getHeaderCaseInsensitive(headers, "x-crawler-price");
  if (crawlerPrice) {
    isValidX402 = true;
    if (!rawChallenge) rawChallenge = { crawlerPrice };
    const parsedCrawlerAmt = parsePriceToAtomic(crawlerPrice);
    if (parsedCrawlerAmt && !priceAtomic) {
      priceAtomic = parsedCrawlerAmt;
    }
  }

  const payToHdr =
    getHeaderCaseInsensitive(headers, "Pay-To") ||
    getHeaderCaseInsensitive(headers, "x-pay-to") ||
    getHeaderCaseInsensitive(headers, "crawler-pay-to");
  if (payToHdr && /^0x[a-fA-F0-9]{40}$/.test(payToHdr.trim())) {
    sellerAddress = (sellerAddress || payToHdr.trim()) as `0x${string}`;
    if (res.status === 402 || crawlerPrice) {
      isValidX402 = true;
    }
  }

  // 4. Check JSON response body if provided
  if (bodyText && bodyText.trim()) {
    try {
      const parsedBody = JSON.parse(bodyText);
      applyChallengeObject(parsedBody);
    } catch {
      // Non-JSON body
    }
  }

  // Build normalized accepts array if not already present
  if (!accepts && (sellerAddress || priceAtomic)) {
    const resolvedNetwork = normalizeNetworkId(network);
    const resolvedAsset =
      asset || (resolvedNetwork === "eip155:84532" ? BASE_SEPOLIA_USDC : BASE_MAINNET_USDC);
    accepts = [
      {
        scheme: "exact",
        network: resolvedNetwork,
        amount: priceAtomic || "10000",
        asset: resolvedAsset,
        payTo: (sellerAddress || NULLCLEAR_TREASURY_ADDRESS) as `0x${string}`,
        maxTimeoutSeconds: maxTimeoutSeconds || 300,
        extra: { name: "USD Coin", version: "2" }
      }
    ];
  }

  return {
    sellerAddress,
    priceAtomic,
    network,
    scheme,
    description,
    rawChallenge,
    asset,
    maxTimeoutSeconds,
    accepts,
    isValidX402
  };
}

/**
 * Emits dual x402 V1 and V2 headers on outbound 402 challenges and settled 200 responses:
 * - On 402: sets both PAYMENT-REQUIRED (V2 Base64 JSON) and X-Payment-Required (V1)
 * - On 200: sets both PAYMENT-RESPONSE (V2) and X-Payment-Response (V1) alongside X-NullClear-Verified: true
 */
export function attachDualX402Headers(
  target: Headers | { header: (name: string, value: string) => void } | Record<string, string>,
  opts: DualX402HeaderOptions
): void {
  const setHdr = (key: string, val: string) => {
    if (typeof (target as any).header === "function") {
      // Hono Context `c.header(key, val)` (checked before `.set` because Hono Context also has `c.set` for context vars)
      (target as { header: (name: string, value: string) => void }).header(key, val);
    } else if (target instanceof Headers || typeof (target as any).append === "function") {
      (target as Headers).set(key, val);
    } else if (target && typeof target === "object") {
      (target as Record<string, string>)[key] = val;
    }
  };

  if (opts.paymentRequired !== undefined) {
    const encoded =
      typeof opts.paymentRequired === "string"
        ? opts.paymentRequired
        : encodeBase64Json(opts.paymentRequired);
    setHdr("PAYMENT-REQUIRED", encoded);
    setHdr("X-Payment-Required", encoded);
  }

  const effectivePaymentResponse =
    opts.paymentResponse !== undefined
      ? opts.paymentResponse
      : opts.status === 200 && opts.transaction
        ? {
            success: true,
            transaction: opts.transaction,
            network: (opts.network || "eip155:8453") as "eip155:8453" | "eip155:84532",
            payer: (opts.payer || "0x0000000000000000000000000000000000000000") as `0x${string}`
          }
        : undefined;

  if (effectivePaymentResponse !== undefined) {
    const encoded =
      typeof effectivePaymentResponse === "string"
        ? effectivePaymentResponse
        : encodeBase64Json(effectivePaymentResponse);
    setHdr("PAYMENT-RESPONSE", encoded);
    setHdr("X-Payment-Response", encoded);
    setHdr("X-PAYMENT-RESPONSE", encoded);

    const isSuccess =
      opts.verified !== undefined
        ? opts.verified
        : typeof effectivePaymentResponse === "object" && effectivePaymentResponse !== null
          ? (effectivePaymentResponse as any).success !== false
          : true;
    setHdr("X-NullClear-Verified", isSuccess ? "true" : "false");
  } else if (opts.verified !== undefined) {
    setHdr("X-NullClear-Verified", opts.verified ? "true" : "false");
  }
}
