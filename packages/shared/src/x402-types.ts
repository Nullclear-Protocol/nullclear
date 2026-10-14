import { parseAbi } from "viem";

export const EIP3009_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external"
]);

export interface X402PaymentOption {
  scheme: "exact";
  network: "eip155:8453" | "eip155:84532";
  amount: string; // atomic units (e.g., "10000" = 0.01 USDC with 6 decimals)
  asset: `0x${string}`;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string; feePayer?: `0x${string}` };
}

export interface X402PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: { url: string; description?: string; mimeType?: string };
  accepts: X402PaymentOption[];
}

export interface EIP3009Authorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string; // atomic string
  validAfter: string; // unix timestamp seconds string
  validBefore: string; // unix timestamp seconds string
  nonce: `0x${string}`; // 32-byte hex nonce
}

export interface X402PaymentSignaturePayload {
  x402Version: 2;
  resource?: { url: string; mimeType?: string };
  accepted: X402PaymentOption;
  payload: {
    signature: `0x${string}`;
    authorization: EIP3009Authorization;
  };
}

export const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
} as const;

export interface X402PaymentResponse {
  success: boolean;
  transaction?: `0x${string}`;
  network: "eip155:8453" | "eip155:84532";
  payer: `0x${string}`;
  errorReason?: string;
}

declare const Buffer: any;

/**
 * Universal base64 encoder that works in Node.js, Cloudflare Workers, and Browser
 */
export function encodeBase64Json(obj: unknown): string {
  const json = JSON.stringify(obj);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf-8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(json)));
}

/**
 * Universal base64 decoder that works in Node.js, Cloudflare Workers, and Browser
 */
export function decodeBase64Json<T>(base64: string): T {
  let json: string;
  if (typeof Buffer !== "undefined") {
    json = Buffer.from(base64, "base64").toString("utf-8");
  } else {
    json = decodeURIComponent(escape(atob(base64)));
  }
  return JSON.parse(json) as T;
}
