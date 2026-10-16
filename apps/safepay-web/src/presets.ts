import type { SafePayVerificationMode, SafePayVerificationSpec } from "@nullclear/shared";

export interface NoCodeVerificationPreset {
  id: string;
  label: string;
  mode: SafePayVerificationMode;
  description: string;
  defaultSpec: SafePayVerificationSpec;
}

export const SAFEPAY_NO_CODE_PRESETS: NoCodeVerificationPreset[] = [
  {
    id: "dataset_csv_json",
    label: "CSV / JSON Dataset",
    mode: "DATASET_SCHEMA",
    description:
      "Validates required columns/keys, minimum row count, zero-null integrity, and generates a 5-row redacted sample preview.",
    defaultSpec: {
      requiredColumns: ["email", "company", "domain"],
      minRows: 1000,
      disallowNulls: true,
      rejectRefusals: true,
      inspectionWindowSeconds: 86400,
      autoSettleOnPass: true,
      strictSingleShot: false
    }
  },
  {
    id: "source_code_archive",
    label: "Source Code / ZIP Archive",
    mode: "FILE_ARCHIVE",
    description:
      "Inspects ZIP/archive file tree for required files and minimum byte size, generating a verified file manifest + SHA-256 seal.",
    defaultSpec: {
      requiredFiles: ["README.md", "package.json", "Dockerfile"],
      minBytes: 51200,
      rejectRefusals: true,
      inspectionWindowSeconds: 86400,
      autoSettleOnPass: true,
      strictSingleShot: false
    }
  },
  {
    id: "exact_sha256_seal",
    label: "Exact File SHA-256 Match",
    mode: "FILE_ARCHIVE",
    description:
      "Cryptographically verifies that the uploaded archive or binary matches a pre-agreed 64-character SHA-256 digest.",
    defaultSpec: {
      minBytes: 1,
      rejectRefusals: true,
      inspectionWindowSeconds: 86400,
      autoSettleOnPass: true,
      strictSingleShot: false
    }
  },
  {
    id: "live_api_webhook",
    label: "Live API / Webhook Delivery",
    mode: "LIVE_API",
    description:
      "Pings the seller's live HTTPS endpoint, enforces HTTP 200 status + latency SLA, and validates required JSON keys.",
    defaultSpec: {
      expectedStatus: [200],
      requiredColumns: ["status", "data"],
      maxLatencyMs: 1000,
      rejectRefusals: true,
      inspectionWindowSeconds: 86400,
      autoSettleOnPass: true,
      strictSingleShot: false
    }
  },
  {
    id: "optimistic_human_preview",
    label: "Optimistic Inspection + Auto-Settle",
    mode: "OPTIMISTIC_PREVIEW",
    description:
      "Verifies file integrity and LLM Refusal Guard, shows a watermarked preview, and releases via 1-click approval or 24h window.",
    defaultSpec: {
      inspectionWindowSeconds: 86400,
      autoSettleOnPass: false,
      strictSingleShot: false,
      rejectRefusals: true
    }
  }
];
