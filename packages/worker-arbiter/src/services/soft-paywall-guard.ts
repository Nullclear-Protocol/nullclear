export type SoftPaywallRule = "CAPTCHA_BLOCK" | "SOFT_PAYWALL" | "TRUNCATED_TEASER";

export interface SoftPaywallAbortPayload {
  error: "NULLCLEAR_ESCROW_ABORTED";
  reason: "SOFT_PAYWALL_OR_CAPTCHA_DETECTED";
  ruleTriggered: SoftPaywallRule;
  settled: false;
  amountChargedAtomic: "0";
  cleared: false;
  buyerCharged: "0";
  stage: "SOFT_PAYWALL_OR_CAPTCHA_DETECTED";
}

export interface SoftPaywallGuardResult {
  passed: boolean;
  valid: boolean;
  blocked: boolean;
  triggered: boolean;
  ruleTriggered: SoftPaywallRule | null;
  reason?: string;
  matchedPattern?: string;
  errorPayload?: SoftPaywallAbortPayload;
}

export const CAPTCHA_TRAP_SIGNATURES = [
  "attention required! | cloudflare",
  "just a moment...",
  "cf-turnstile",
  "_cf_chl_opt",
  "px-captcha",
  "datadome",
  "verify you are human",
  "enable javascript and cookies to continue"
] as const;

export const SOFT_PAYWALL_SIGNATURES = [
  "subscribe to continue reading",
  "sign in to read the full article",
  "you have reached your free article limit",
  "create a free account to continue",
  "members-only content",
  "upgrade your plan to access"
] as const;

function buildAbortResult(
  ruleTriggered: SoftPaywallRule,
  matchedPattern: string,
  detail: string
): SoftPaywallGuardResult {
  return {
    passed: false,
    valid: false,
    blocked: true,
    triggered: true,
    ruleTriggered,
    matchedPattern,
    reason: detail,
    errorPayload: {
      error: "NULLCLEAR_ESCROW_ABORTED",
      reason: "SOFT_PAYWALL_OR_CAPTCHA_DETECTED",
      ruleTriggered,
      settled: false,
      amountChargedAtomic: "0",
      cleared: false,
      buyerCharged: "0",
      stage: "SOFT_PAYWALL_OR_CAPTCHA_DETECTED"
    }
  };
}

/**
 * Inspects upstream HTTP responses for:
 * - Rule A: Anti-Bot / Cloudflare Turnstile / CAPTCHA traps (CAPTCHA_BLOCK)
 * - Rule B: Publisher Soft-Paywall / Login Wall traps (SOFT_PAYWALL)
 * - Rule C: Truncated Teaser / Empty HTML Skeleton / under-minBytes responses (TRUNCATED_TEASER)
 */
export function inspectSoftPaywallAndContent(
  bodyText: string,
  contentType = "",
  status = 200,
  minBytes?: number
): SoftPaywallGuardResult {
  const raw = typeof bodyText === "string" ? bodyText : "";
  const trimmed = raw.trim();
  const lowerBody = trimmed.toLowerCase();
  const lowerCt = (contentType || "").toLowerCase();

  // Rule A — Anti-Bot / CAPTCHA Trap Detection
  for (const sig of CAPTCHA_TRAP_SIGNATURES) {
    if (lowerBody.includes(sig)) {
      return buildAbortResult(
        "CAPTCHA_BLOCK",
        sig,
        `Upstream returned anti-bot or CAPTCHA challenge signature ("${sig}")`
      );
    }
  }

  // Determine content category
  const isHtmlContent =
    lowerCt.includes("text/html") ||
    lowerCt.includes("application/xhtml") ||
    /^<!doctype\s+html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed);

  const isMarkdownOrText =
    lowerCt.includes("text/markdown") ||
    lowerCt.includes("text/plain") ||
    lowerCt.includes("text/");

  const isJsonContent =
    lowerCt.includes("application/json") ||
    (!isHtmlContent && (trimmed.startsWith("{") || trimmed.startsWith("[")));

  // Rule B — Soft-Paywall / Login Wall Trap Detection
  // Applies to HTML, Markdown, or text responses, or short JSON bodies (< 4,000 bytes)
  const shouldCheckPaywall =
    isHtmlContent || isMarkdownOrText || !isJsonContent || trimmed.length < 4000;

  if (shouldCheckPaywall) {
    for (const trap of SOFT_PAYWALL_SIGNATURES) {
      if (lowerBody.includes(trap)) {
        return buildAbortResult(
          "SOFT_PAYWALL",
          trap,
          `Upstream returned publisher soft-paywall or login wall ("${trap}")`
        );
      }
    }
  }

  // Rule C — Truncated Teaser / Empty Skeleton Guard (evaluated on 2xx deliverable responses)
  if (status >= 200 && status < 300) {
    if (!trimmed) {
      return buildAbortResult(
        "TRUNCATED_TEASER",
        "empty_body",
        "Upstream returned an empty or whitespace-only deliverable on HTTP 2xx"
      );
    }

    // Check for empty HTML skeleton (e.g. <html><body></body></html>)
    if (isHtmlContent) {
      const withoutScriptsAndStyles = trimmed
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<head[\s\S]*?<\/head>/gi, "");
      const visibleText = withoutScriptsAndStyles.replace(/<[^>]+>/g, "").trim();
      if (visibleText.length === 0) {
        return buildAbortResult(
          "TRUNCATED_TEASER",
          "empty_html_skeleton",
          "Upstream returned an empty HTML skeleton with no visible content"
        );
      }
    }

    const isArticleLike = isHtmlContent || lowerCt.includes("markdown");
    const effectiveMinBytes =
      typeof minBytes === "number" && !Number.isNaN(minBytes)
        ? minBytes
        : isArticleLike
          ? 120
          : 32;

    const byteLength = new TextEncoder().encode(trimmed).byteLength;
    if (byteLength < effectiveMinBytes) {
      return buildAbortResult(
        "TRUNCATED_TEASER",
        `byte_length_${byteLength}_lt_${effectiveMinBytes}`,
        `Upstream deliverable is shorter than minimum required bytes (${byteLength} < ${effectiveMinBytes} bytes)`
      );
    }
  }

  return {
    passed: true,
    valid: true,
    blocked: false,
    triggered: false,
    ruleTriggered: null
  };
}
