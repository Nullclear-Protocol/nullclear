export const MAX_PAYLOAD_BYTES = 1048576; // 1 MB
export const UPSTREAM_TIMEOUT_MS = 8000; // 8000 ms max timeout

export const OPT_OUT_DOMAINS = new Set<string>([
  "x402-trust.com",
  "www.x402-trust.com"
]);

export interface SsrfCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates a target URL against SSRF attack vectors and protocol policies
 */
export function validateTargetUrl(targetUrl: string, environment?: string): SsrfCheckResult {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return { allowed: false, reason: "SSRF_GUARD: Malformed or unparseable target URL" };
  }

  const hostname = url.hostname.toLowerCase();

  // 1. Publisher Opt-Out Check (Applies in all environments)
  if (OPT_OUT_DOMAINS.has(hostname)) {
    return {
      allowed: false,
      reason: `PUBLISHER_OPT_OUT: Domain "${hostname}" has opted out of third-party proxy wrapping and directory indexing.`
    };
  }

  const isProduction = environment === "production";

  // 2. Protocol validation
  if (url.protocol !== "https:") {
    if (!isProduction && (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1"))) {
      // Allowed strictly for local test/dev environments
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "SSRF_GUARD: Only secure HTTPS protocols are permitted in production"
    };
  }

  // 2. Production SSRF blocklists (Private IP ranges, Cloud Metadata, Localhost)
  if (isProduction) {
    const hostname = url.hostname.toLowerCase();

    // Check internal domains
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".localhost")
    ) {
      return {
        allowed: false,
        reason: `SSRF_GUARD: Access to internal host "${hostname}" is forbidden`
      };
    }

    // Check IPv4 ranges
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const a = parseInt(ipv4Match[1], 10);
      const b = parseInt(ipv4Match[2], 10);

      // 127.0.0.0/8 (Loopback)
      if (a === 127) {
        return { allowed: false, reason: `SSRF_GUARD: Loopback IP "${hostname}" is forbidden` };
      }
      // 10.0.0.0/8 (Private Class A)
      if (a === 10) {
        return { allowed: false, reason: `SSRF_GUARD: Private Class A IP "${hostname}" is forbidden` };
      }
      // 172.16.0.0/12 (Private Class B)
      if (a === 172 && b >= 16 && b <= 31) {
        return { allowed: false, reason: `SSRF_GUARD: Private Class B IP "${hostname}" is forbidden` };
      }
      // 192.168.0.0/16 (Private Class C)
      if (a === 192 && b === 168) {
        return { allowed: false, reason: `SSRF_GUARD: Private Class C IP "${hostname}" is forbidden` };
      }
      // 169.254.0.0/16 (Link-local & Cloud Metadata e.g. AWS/GCP/Azure 169.254.169.254)
      if (a === 169 && b === 254) {
        return { allowed: false, reason: `SSRF_GUARD: Cloud metadata / Link-local IP "${hostname}" is forbidden` };
      }
      // 0.0.0.0/8
      if (a === 0) {
        return { allowed: false, reason: `SSRF_GUARD: Broadcast / zero IP "${hostname}" is forbidden` };
      }
    }

    // Check IPv6
    if (
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.startsWith("fe80:") ||
      hostname.startsWith("fc00:") ||
      hostname.startsWith("fd00:")
    ) {
      return {
        allowed: false,
        reason: `SSRF_GUARD: Private or loopback IPv6 "${hostname}" is forbidden`
      };
    }
  }

  return { allowed: true };
}
