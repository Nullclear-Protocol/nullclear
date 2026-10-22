import { getArbiterStore, type Env } from "../env.js";
import { DEFAULT_ARBITER_KEY } from "./attestation.js";

export interface VerifiedKyaAttestationPayload {
  mandateId: string;
  agentAddress: `0x${string}`;
  corporateEntity: string;
  jurisdiction: string;
  maxPerCallAtomic: string;
  arbiterAgentId: number;
  issuedAt: number;
}

export interface OutboundKyaHeaders {
  "X-NullClear-Verified-KYA": string;
  "X-NullClear-KYA-Signature": string;
  payload: VerifiedKyaAttestationPayload;
}

declare const Buffer: any;

function encodeBase64Url(str: string): string {
  let b64: string;
  if (typeof Buffer !== "undefined") {
    b64 = Buffer.from(str, "utf-8").toString("base64");
  } else {
    b64 = btoa(unescape(encodeURIComponent(str)));
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64UrlToString(b64url: string): string {
  const normalized = b64url.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf-8");
  }
  return decodeURIComponent(escape(atob(padded)));
}

function resolveBindings(env?: Env | Env["Bindings"] | Record<string, any>): Env["Bindings"] {
  if (!env) return {};
  if ((env as any).Bindings && typeof (env as any).Bindings === "object") {
    return (env as any).Bindings;
  }
  return env as Env["Bindings"];
}

function resolveHmacSecret(env?: Env | Env["Bindings"] | Record<string, any>): string {
  const bindings = resolveBindings(env);
  return (bindings?.ARBITER_PRIVATE_KEY && bindings.ARBITER_PRIVATE_KEY.trim()) || DEFAULT_ARBITER_KEY;
}

export async function computeHmacSha256Hex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const sigBytes = Array.from(new Uint8Array(sigBuffer));
  return sigBytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Looks up active, non-expired KYA mandates for buyerAddress (case-insensitive) in D1 / memory store.
 * If found, constructs a canonical attestation payload, signs with HMAC-SHA256, and returns
 * X-NullClear-Verified-KYA (Base64URL JSON) and X-NullClear-KYA-Signature (hex).
 */
export async function getVerifiedKyaHeaderForBuyer(
  env: Env | Env["Bindings"] | undefined,
  buyerAddress?: string | null
): Promise<OutboundKyaHeaders | null> {
  if (!buyerAddress || !buyerAddress.trim()) {
    return null;
  }

  const bindings = resolveBindings(env);
  const store = getArbiterStore(bindings);
  const record = await store.getKyaMandateByWallet(buyerAddress.trim());
  if (!record) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (record.validUntil <= nowSec) {
    return null;
  }

  const maxPerCallAtomic =
    record.maxPerCallAtomic ||
    BigInt(Math.round(Number(record.maxTxLimitUsd || 50) * 1_000_000)).toString();

  const arbiterAgentIdNum = Number(bindings?.ERC8004_AGENT_ID || 124595) || 124595;

  const payload: VerifiedKyaAttestationPayload = {
    mandateId: record.id,
    agentAddress: record.agentWallet,
    corporateEntity: record.corporateEntity,
    jurisdiction: record.jurisdiction || "US-DE",
    maxPerCallAtomic,
    arbiterAgentId: arbiterAgentIdNum,
    issuedAt: nowSec
  };

  const canonicalJson = JSON.stringify(payload);
  const secret = resolveHmacSecret(env);
  const signatureHex = await computeHmacSha256Hex(canonicalJson, secret);
  const encodedHeader = encodeBase64Url(canonicalJson);

  return {
    "X-NullClear-Verified-KYA": encodedHeader,
    "X-NullClear-KYA-Signature": signatureHex,
    payload
  };
}

/**
 * Verifies an incoming X-NullClear-Verified-KYA Base64URL header and X-NullClear-KYA-Signature hex string.
 */
export async function verifyKyaHeaderAttestation(
  env: Env | Env["Bindings"] | undefined,
  kyaHeaderB64Url: string,
  signatureHex: string
): Promise<{
  valid: boolean;
  verified: boolean;
  payload?: VerifiedKyaAttestationPayload;
  error?: string;
}> {
  try {
    if (!kyaHeaderB64Url || !signatureHex) {
      return {
        valid: false,
        verified: false,
        error: "Missing X-NullClear-Verified-KYA or X-NullClear-KYA-Signature"
      };
    }

    const decodedJsonStr = decodeBase64UrlToString(kyaHeaderB64Url);
    const parsedPayload = JSON.parse(decodedJsonStr) as VerifiedKyaAttestationPayload;

    const secret = resolveHmacSecret(env);
    const expectedHex = await computeHmacSha256Hex(decodedJsonStr, secret);
    const cleanProvided = signatureHex.trim().toLowerCase().replace(/^0x/, "");

    if (cleanProvided.length !== expectedHex.length) {
      return {
        valid: false,
        verified: false,
        error: "KYA HMAC signature length mismatch"
      };
    }

    // Constant-time comparison
    let diff = 0;
    for (let i = 0; i < expectedHex.length; i++) {
      diff |= expectedHex.charCodeAt(i) ^ cleanProvided.charCodeAt(i);
    }

    if (diff !== 0) {
      return {
        valid: false,
        verified: false,
        error: "Invalid KYA HMAC-SHA256 signature"
      };
    }

    return {
      valid: true,
      verified: true,
      payload: parsedPayload
    };
  } catch (err: any) {
    return {
      valid: false,
      verified: false,
      error: `Failed to verify KYA header: ${err.message || String(err)}`
    };
  }
}
