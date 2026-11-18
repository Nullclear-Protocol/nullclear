/**
 * Zero-dependency Web Crypto JWT signer for Coinbase Developer Platform (CDP) REST APIs
 * (`api.cdp.coinbase.com/platform/v2/x402/*`). Supports both Ed25519 (`EdDSA`) and
 * ECDSA P-256 (`ES256`) CDP API secrets natively in Cloudflare Workers and Node.js.
 */

export interface CdpJwtOptions {
  apiKeyId: string;
  apiKeySecret: string;
  requestMethod: "GET" | "POST" | "PUT" | "DELETE";
  requestHost?: string;
  requestPath: string;
  expiresInSeconds?: number;
}

const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
]);

const P256_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
  0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
  0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
  0x01, 0x04, 0x20
]);

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeJsonBase64Url(obj: Record<string, unknown>): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function normalizePemBody(pem: string): Uint8Array {
  const stripped = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return decodeBase64(stripped);
}

function extractSec1P256Scalar(sec1Der: Uint8Array): Uint8Array {
  for (let i = 0; i < sec1Der.length - 33; i++) {
    if (sec1Der[i] === 0x04 && sec1Der[i + 1] === 0x20) {
      return sec1Der.slice(i + 2, i + 34);
    }
  }
  throw new Error("Invalid SEC1 EC private key: 32-byte P-256 scalar not found");
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function generateCdpJwt(options: CdpJwtOptions): Promise<string> {
  const secretRaw = options.apiKeySecret.replace(/\\n/g, "\n").trim();
  const host = options.requestHost || "api.cdp.coinbase.com";
  const path = options.requestPath.startsWith("/") ? options.requestPath : `/${options.requestPath}`;
  const now = Math.floor(Date.now() / 1000);
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const isPem = secretRaw.includes("BEGIN ");
  const alg = isPem ? "ES256" : "EdDSA";

  const headerB64 = encodeJsonBase64Url({
    alg,
    kid: options.apiKeyId,
    typ: "JWT",
    nonce
  });
  const payloadB64 = encodeJsonBase64Url({
    sub: options.apiKeyId,
    iss: "cdp",
    nbf: now,
    exp: now + (options.expiresInSeconds ?? 120),
    uris: [`${options.requestMethod} ${host}${path}`]
  });

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  if (alg === "ES256") {
    const rawDer = normalizePemBody(secretRaw);
    const pkcs8Bytes = secretRaw.includes("BEGIN EC PRIVATE KEY")
      ? concatBytes(P256_PKCS8_PREFIX, extractSec1P256Scalar(rawDer))
      : rawDer;
    const key = await crypto.subtle.importKey(
      "pkcs8",
      toArrayBuffer(pkcs8Bytes),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
    const sigBuf = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      toArrayBuffer(signingInput)
    );
    return `${headerB64}.${payloadB64}.${toBase64Url(new Uint8Array(sigBuf))}`;
  }

  // Ed25519 (CDP v2 default Base64 key: 64-byte keypair or 32-byte seed)
  const decoded = decodeBase64(secretRaw);
  const seed = decoded.length >= 32 ? decoded.slice(0, 32) : decoded;
  if (seed.length !== 32) {
    throw new Error(`Invalid CDP Ed25519 secret length: expected 32 or 64 bytes, got ${decoded.length}`);
  }
  const pkcs8Ed = concatBytes(ED25519_PKCS8_PREFIX, seed);
  const edKey = await crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(pkcs8Ed),
    { name: "Ed25519" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("Ed25519", edKey, toArrayBuffer(signingInput));
  return `${headerB64}.${payloadB64}.${toBase64Url(new Uint8Array(sigBuf))}`;
}
