import type {
  DeliverSafePayDealRequest,
  SafePayRedactedPreview,
  SafePayVerificationMode,
  SafePayVerificationSpec
} from "@nullclear/shared";
import {
  computeSha256,
  evaluateInvariants,
  findLlmRefusal,
  validateJsonSchema
} from "./validator.js";
import { validateTargetUrl } from "./ssrf-guard.js";

export interface SafePayVerificationOutcome {
  valid: boolean;
  errors: string[];
  deliverableSha256: string;
  byteSize: number;
  redactedPreview: SafePayRedactedPreview;
}

/**
 * Masks sensitive string or numeric values for the Buyer's pre-settlement Redacted Preview
 */
export function redactValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") {
    const str = String(val);
    if (str.length <= 2) return val;
    return `${str.slice(0, 2)}${"*".repeat(Math.min(4, str.length - 2))}`;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.length === 0) return "";
    // Email redaction: al***@domain.com
    const emailMatch = trimmed.match(/^([^@]{1,2})([^@]*)@(.+)$/);
    if (emailMatch) {
      return `${emailMatch[1]}***@${emailMatch[3]}`;
    }
    // Hex / Address redaction: 0x1234...abcd
    if (trimmed.startsWith("0x") && trimmed.length >= 12) {
      return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
    }
    // URL redaction
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const u = new URL(trimmed);
        return `${u.origin}/[REDACTED_PATH]`;
      } catch {
        // fall through
      }
    }
    if (trimmed.length <= 4) {
      return `${trimmed[0]}***`;
    }
    const visiblePrefix = Math.min(3, Math.floor(trimmed.length / 3));
    return `${trimmed.slice(0, visiblePrefix)}***[REDACTED]`;
  }
  if (Array.isArray(val)) {
    return val.slice(0, 3).map((item) => redactValue(item));
  }
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = redactValue(v);
    }
    return out;
  }
  return "[REDACTED]";
}

/**
 * Redacts a single row/record object while preserving all keys
 */
export function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    redacted[k] = redactValue(v);
  }
  return redacted;
}

/**
 * RFC-4180 compliant CSV parser for edge datasets
 */
export function parseCsvRecords(csvText: string): {
  headers: string[];
  rows: Array<Record<string, unknown>>;
} {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && csvText[i + 1] === "\n") i++;
      if (current.trim().length > 0) {
        lines.push(current);
      }
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) {
    lines.push(current);
  }

  const splitCsvLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (c === "," && !quoted) {
        fields.push(field.trim());
        field = "";
      } else {
        field += c;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.replace(/^["']|["']$/g, ""));
  const rows: Array<Record<string, unknown>> = [];

  for (let idx = 1; idx < lines.length; idx++) {
    const values = splitCsvLine(lines[idx]);
    const record: Record<string, unknown> = {};
    headers.forEach((h, colIdx) => {
      const rawVal = values[colIdx] ?? "";
      if (rawVal === "") {
        record[h] = "";
      } else if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
        record[h] = Number(rawVal);
      } else if (rawVal.toLowerCase() === "true" || rawVal.toLowerCase() === "false") {
        record[h] = rawVal.toLowerCase() === "true";
      } else {
        record[h] = rawVal;
      }
    });
    rows.push(record);
  }

  return { headers, rows };
}

/**
 * Parses binary ZIP local file headers (0x04034b50) from base64 or raw binary string
 */
export function extractZipFileEntries(content: string): Array<{ path: string; sizeBytes: number }> {
  const entries: Array<{ path: string; sizeBytes: number }> = [];
  let bytes: Uint8Array;

  try {
    const cleaned = content.replace(/^data:[^;]+;base64,/, "").trim();
    const binaryStr = atob(cleaned);
    bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
  } catch {
    const encoder = new TextEncoder();
    bytes = encoder.encode(content);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset + 30 <= bytes.byteLength) {
    const sig = view.getUint32(offset, true);
    // Local file header signature = 0x04034b50
    if (sig === 0x04034b50) {
      const compressedSize = view.getUint32(offset + 18, true);
      const uncompressedSize = view.getUint32(offset + 22, true);
      const fileNameLength = view.getUint16(offset + 26, true);
      const extraFieldLength = view.getUint16(offset + 28, true);

      if (offset + 30 + fileNameLength <= bytes.byteLength) {
        const nameBytes = bytes.slice(offset + 30, offset + 30 + fileNameLength);
        const path = new TextDecoder().decode(nameBytes);
        entries.push({
          path,
          sizeBytes: uncompressedSize || compressedSize
        });
      }

      const nextOffset = offset + 30 + fileNameLength + extraFieldLength + compressedSize;
      if (nextOffset <= offset) {
        offset += 4;
      } else {
        offset = nextOffset;
      }
    } else {
      offset++;
    }
  }

  return entries;
}

/**
 * Executes the complete SafePay deterministic deliverable verification pipeline
 */
export async function verifySafePayDeliverable(
  mode: SafePayVerificationMode,
  spec: SafePayVerificationSpec,
  submission: DeliverSafePayDealRequest,
  environment = "development"
): Promise<SafePayVerificationOutcome> {
  const errors: string[] = [];
  const checks: Array<{ label: string; passed: boolean; detail: string }> = [];
  const rawContent = submission.content || submission.targetUrl || JSON.stringify(submission.archiveManifest || []);
  const encoder = new TextEncoder();
  const byteSize = encoder.encode(rawContent).byteLength;
  const deliverableSha256 = await computeSha256(rawContent);
  const computedAt = Date.now();

  // 1. Canonical LLM Refusal Guard (unless explicitly disabled)
  if (spec.rejectRefusals !== false) {
    const refusal = findLlmRefusal(rawContent);
    if (refusal) {
      errors.push(`LLM Refusal Guard triggered: detected forbidden phrase "${refusal}"`);
      checks.push({
        label: "LLM Refusal & Boilerplate Guard",
        passed: false,
        detail: `Detected refusal pattern: "${refusal}"`
      });
    } else {
      checks.push({
        label: "LLM Refusal & Boilerplate Guard",
        passed: true,
        detail: "Zero refusal or error boilerplate patterns detected"
      });
    }
  }

  // 2. Optional Expected SHA-256 Seal Check
  if (spec.expectedSha256) {
    const normalizedExpected = spec.expectedSha256.toLowerCase().replace(/^0x/, "");
    const matched = deliverableSha256.toLowerCase() === normalizedExpected;
    if (!matched) {
      errors.push(
        `SHA-256 cryptographic seal mismatch: expected ${normalizedExpected}, computed ${deliverableSha256}`
      );
    }
    checks.push({
      label: "SHA-256 Cryptographic Digest Match",
      passed: matched,
      detail: matched
        ? `Verified exact SHA-256: ${deliverableSha256.slice(0, 16)}...`
        : `Mismatch (got ${deliverableSha256.slice(0, 16)}...)`
    });
  }

  // 3. Minimum Byte Size Check
  if (typeof spec.minBytes === "number" && spec.minBytes > 0) {
    const passed = byteSize >= spec.minBytes;
    if (!passed) {
      errors.push(`Deliverable size (${byteSize} bytes) is below minimum required (${spec.minBytes} bytes)`);
    }
    checks.push({
      label: "Minimum Payload Byte Size",
      passed,
      detail: `${byteSize.toLocaleString()} bytes (required >= ${spec.minBytes.toLocaleString()} bytes)`
    });
  }

  // ============================================================================
  // MODE A: DATASET & JSON CONTRACT VALIDATOR
  // ============================================================================
  if (mode === "DATASET_SCHEMA") {
    let format: "json" | "csv" | "ndjson" =
      submission.format === "csv"
        ? "csv"
        : submission.format === "ndjson"
        ? "ndjson"
        : "json";

    let parsedRoot: unknown = null;
    let rows: Array<Record<string, unknown>> = [];
    let columns: string[] = [];

    const trimmed = (submission.content || "").trim();
    if (!trimmed) {
      errors.push("Dataset deliverable content is empty");
    } else if (format === "csv" || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      // Check if NDJSON first
      const rawLines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (rawLines.length > 0 && rawLines.every((l) => l.trim().startsWith("{"))) {
        format = "ndjson";
        try {
          rows = rawLines.map((l) => JSON.parse(l));
          parsedRoot = rows;
          columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
        } catch (err: any) {
          errors.push(`Invalid NDJSON syntax: ${err.message}`);
        }
      } else {
        format = "csv";
        const csvParsed = parseCsvRecords(trimmed);
        columns = csvParsed.headers;
        rows = csvParsed.rows;
        parsedRoot = rows;
      }
    } else {
      try {
        parsedRoot = JSON.parse(trimmed);
        if (Array.isArray(parsedRoot)) {
          rows = parsedRoot.filter((item) => typeof item === "object" && item !== null) as Array<
            Record<string, unknown>
          >;
          columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
        } else if (typeof parsedRoot === "object" && parsedRoot !== null) {
          const rootObj = parsedRoot as Record<string, unknown>;
          const candidateArray =
            (Array.isArray(rootObj.data) && rootObj.data) ||
            (Array.isArray(rootObj.items) && rootObj.items) ||
            (Array.isArray(rootObj.records) && rootObj.records) ||
            (Array.isArray(rootObj.rows) && rootObj.rows);
          if (candidateArray) {
            rows = candidateArray.filter((item) => typeof item === "object" && item !== null) as Array<
              Record<string, unknown>
            >;
            columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
          } else {
            rows = [rootObj];
            columns = Object.keys(rootObj);
          }
        }
      } catch (err: any) {
        errors.push(`Invalid JSON syntax in dataset deliverable: ${err.message}`);
      }
    }

    // Check minRows
    if (typeof spec.minRows === "number" && spec.minRows > 0) {
      const passed = rows.length >= spec.minRows;
      if (!passed) {
        errors.push(`Dataset row count (${rows.length}) is less than required minRows (${spec.minRows})`);
      }
      checks.push({
        label: "Minimum Record Count (minRows)",
        passed,
        detail: `${rows.length} records parsed (required >= ${spec.minRows})`
      });
    } else {
      checks.push({
        label: "Dataset Records Parsed",
        passed: rows.length > 0,
        detail: `${rows.length} structured records parsed`
      });
    }

    // Check requiredColumns
    if (Array.isArray(spec.requiredColumns) && spec.requiredColumns.length > 0) {
      const missingCols = spec.requiredColumns.filter((col) => !columns.includes(col));
      const passed = missingCols.length === 0 && rows.length > 0;
      if (!passed) {
        errors.push(
          missingCols.length > 0
            ? `Missing required columns/keys: ${missingCols.join(", ")}`
            : "Dataset contains 0 rows to verify required columns"
        );
      }
      checks.push({
        label: "Required Schema Columns",
        passed,
        detail: passed
          ? `All required columns present: [${spec.requiredColumns.join(", ")}]`
          : `Missing columns: [${missingCols.join(", ")}]`
      });

      // Check disallowNulls across required columns
      if (spec.disallowNulls && passed) {
        let nullCount = 0;
        rows.forEach((r, idx) => {
          for (const col of spec.requiredColumns!) {
            const v = r[col];
            if (v === null || v === undefined || v === "") {
              nullCount++;
              if (nullCount <= 3) {
                errors.push(`Row ${idx + 1} has null/empty value for required column "${col}"`);
              }
            }
          }
        });
        checks.push({
          label: "Zero-Null Integrity Check",
          passed: nullCount === 0,
          detail:
            nullCount === 0
              ? `100% non-null values across ${rows.length} rows`
              : `${nullCount} null/empty cells detected`
        });
      }
    }

    // Check JSON Schema
    if (spec.jsonSchema && Object.keys(spec.jsonSchema).length > 0) {
      const schemaErrors = validateJsonSchema(parsedRoot, spec.jsonSchema);
      if (schemaErrors.length > 0) {
        errors.push(...schemaErrors.slice(0, 5));
      }
      checks.push({
        label: "JSON Schema Draft-07 Validation",
        passed: schemaErrors.length === 0,
        detail:
          schemaErrors.length === 0
            ? "Payload conforms 100% to compiled JSON Schema"
            : schemaErrors[0]
      });
    }

    // Check Deep Value Invariants
    if (Array.isArray(spec.invariants) && spec.invariants.length > 0) {
      const targetForInvariants =
        Array.isArray(parsedRoot) && parsedRoot.length > 0 ? parsedRoot[0] : parsedRoot;
      const invErrors = evaluateInvariants(targetForInvariants, spec.invariants);
      if (invErrors.length > 0) {
        errors.push(...invErrors);
      }
      checks.push({
        label: "Deep Deterministic Value Invariants",
        passed: invErrors.length === 0,
        detail:
          invErrors.length === 0
            ? `All ${spec.invariants.length} invariant rules satisfied`
            : invErrors[0]
      });
    }

    const redactedSampleRows = rows.slice(0, 5).map((r) => redactRow(r));

    return {
      valid: errors.length === 0,
      errors,
      deliverableSha256,
      byteSize,
      redactedPreview: {
        mode,
        verified: errors.length === 0,
        deliverableSha256,
        byteSize,
        computedAt,
        checks,
        datasetSummary: {
          format,
          totalRows: rows.length,
          columns,
          redactedSampleRows
        }
      }
    };
  }

  // ============================================================================
  // MODE B: CODE ARCHIVE / FILE CRYPTOGRAPHIC SEAL
  // ============================================================================
  if (mode === "FILE_ARCHIVE") {
    let entries: Array<{ path: string; sizeBytes: number }> = [];

    if (Array.isArray(submission.archiveManifest) && submission.archiveManifest.length > 0) {
      entries = submission.archiveManifest;
    } else if (submission.content) {
      // Attempt ZIP header extraction first
      const zipEntries = extractZipFileEntries(submission.content);
      if (zipEntries.length > 0) {
        entries = zipEntries;
      } else {
        // Check if JSON bundle of files { "README.md": "...", "package.json": "..." }
        try {
          const parsed = JSON.parse(submission.content);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            entries = Object.entries(parsed as Record<string, unknown>).map(([k, v]) => ({
              path: k,
              sizeBytes: typeof v === "string" ? v.length : JSON.stringify(v).length
            }));
          }
        } catch {
          // Single file submission
          entries = [
            {
              path: submission.filename || "deliverable.bin",
              sizeBytes: byteSize
            }
          ];
        }
      }
    }

    const allPaths = entries.map((e) => e.path);
    const totalUncompressedBytes =
      entries.reduce((acc, item) => acc + item.sizeBytes, 0) || byteSize;

    const verifiedPaths: string[] = [];
    if (Array.isArray(spec.requiredFiles) && spec.requiredFiles.length > 0) {
      const missingFiles: string[] = [];
      for (const reqPath of spec.requiredFiles) {
        const normalizedReq = reqPath.replace(/^\/+/, "");
        const found = allPaths.some(
          (p) =>
            p === normalizedReq ||
            p.endsWith(`/${normalizedReq}`) ||
            (normalizedReq.endsWith("/") && (p.startsWith(normalizedReq) || p.includes(`/${normalizedReq}`))) ||
            p.startsWith(`${normalizedReq}/`)
        );
        if (found) {
          verifiedPaths.push(reqPath);
        } else {
          missingFiles.push(reqPath);
        }
      }

      const passed = missingFiles.length === 0;
      if (!passed) {
        errors.push(`Archive missing required files/paths: ${missingFiles.join(", ")}`);
      }
      checks.push({
        label: "Archive File Tree & Manifest Check",
        passed,
        detail: passed
          ? `Verified all required paths: [${spec.requiredFiles.join(", ")}]`
          : `Missing required paths: [${missingFiles.join(", ")}]`
      });
    } else {
      checks.push({
        label: "Archive Structure Inspected",
        passed: entries.length > 0,
        detail: `${entries.length} file entries indexed (${totalUncompressedBytes.toLocaleString()} bytes)`
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      deliverableSha256,
      byteSize,
      redactedPreview: {
        mode,
        verified: errors.length === 0,
        deliverableSha256,
        byteSize,
        computedAt,
        checks,
        archiveSummary: {
          filename: submission.filename || "archive-deliverable.zip",
          totalFiles: entries.length,
          totalUncompressedBytes,
          verifiedPaths,
          fileTree: entries.slice(0, 25).map((e) => ({
            path: e.path,
            sizeBytes: e.sizeBytes,
            sha256Prefix: deliverableSha256.slice(0, 12)
          }))
        }
      }
    };
  }

  // ============================================================================
  // MODE C: LIVE API / WEBHOOK ENDPOINT SLA
  // ============================================================================
  if (mode === "LIVE_API") {
    const endpointUrl = submission.targetUrl || spec.targetEndpointUrl || submission.content || "";
    if (!endpointUrl || (!endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://"))) {
      errors.push("Valid HTTP/HTTPS targetUrl is required for LIVE_API verification mode");
      return {
        valid: false,
        errors,
        deliverableSha256,
        byteSize,
        redactedPreview: {
          mode,
          verified: false,
          deliverableSha256,
          byteSize,
          computedAt,
          checks
        }
      };
    }

    const ssrf = validateTargetUrl(endpointUrl, environment);
    if (!ssrf.allowed) {
      errors.push(ssrf.reason || "SSRF guard blocked targetUrl");
      return {
        valid: false,
        errors,
        deliverableSha256,
        byteSize,
        redactedPreview: {
          mode,
          verified: false,
          deliverableSha256,
          byteSize,
          computedAt,
          checks
        }
      };
    }

    const startMs = Date.now();
    let httpStatus = 0;
    let responseText = "";
    let responseJson: unknown = null;

    try {
      const res = await fetch(endpointUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "NullClear-SafePay-Arbiter/1.1"
        }
      });
      httpStatus = res.status;
      responseText = await res.text();
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = null;
      }
    } catch (err: any) {
      errors.push(`Live API probe failed: ${err.message}`);
    }

    const latencyMs = Math.max(1, Date.now() - startMs);
    const allowedStatus =
      spec.expectedStatus && spec.expectedStatus.length > 0 ? spec.expectedStatus : [200];
    const statusPassed = allowedStatus.includes(httpStatus);
    if (!statusPassed) {
      errors.push(`Live API returned HTTP ${httpStatus}, expected [${allowedStatus.join(", ")}]`);
    }
    checks.push({
      label: "Live Endpoint HTTP Status",
      passed: statusPassed,
      detail: `HTTP ${httpStatus} (expected ${allowedStatus.join(", ")})`
    });

    if (typeof spec.maxLatencyMs === "number" && spec.maxLatencyMs > 0) {
      const latencyPassed = latencyMs <= spec.maxLatencyMs;
      if (!latencyPassed) {
        errors.push(`Endpoint latency ${latencyMs}ms exceeded SLA threshold ${spec.maxLatencyMs}ms`);
      }
      checks.push({
        label: "Endpoint Latency SLA",
        passed: latencyPassed,
        detail: `${latencyMs}ms response time (SLA <= ${spec.maxLatencyMs}ms)`
      });
    }

    if (spec.rejectRefusals !== false) {
      const apiRefusal = findLlmRefusal(responseJson ?? responseText);
      if (apiRefusal) {
        errors.push(`Live API response triggered LLM Refusal Guard: "${apiRefusal}"`);
      }
    }

    const verifiedKeys: string[] = [];
    if (Array.isArray(spec.requiredColumns) && spec.requiredColumns.length > 0) {
      if (typeof responseJson !== "object" || responseJson === null) {
        errors.push("Live API did not return a JSON object to verify required keys");
      } else {
        const obj = responseJson as Record<string, unknown>;
        for (const reqKey of spec.requiredColumns) {
          if (reqKey in obj && obj[reqKey] !== undefined && obj[reqKey] !== null) {
            verifiedKeys.push(reqKey);
          } else {
            errors.push(`Live API JSON missing required key "${reqKey}"`);
          }
        }
      }
      checks.push({
        label: "Required JSON Response Keys",
        passed: verifiedKeys.length === spec.requiredColumns.length,
        detail: `Verified ${verifiedKeys.length}/${spec.requiredColumns.length} required keys`
      });
    }

    if (spec.jsonSchema && Object.keys(spec.jsonSchema).length > 0) {
      const schemaErrors = validateJsonSchema(responseJson, spec.jsonSchema);
      if (schemaErrors.length > 0) {
        errors.push(...schemaErrors);
      }
      checks.push({
        label: "Live Response JSON Schema",
        passed: schemaErrors.length === 0,
        detail: schemaErrors.length === 0 ? "100% schema match" : schemaErrors[0]
      });
    }

    if (Array.isArray(spec.invariants) && spec.invariants.length > 0) {
      const invErrors = evaluateInvariants(responseJson, spec.invariants);
      if (invErrors.length > 0) {
        errors.push(...invErrors);
      }
      checks.push({
        label: "Live Response Value Invariants",
        passed: invErrors.length === 0,
        detail: invErrors.length === 0 ? "All invariants passed" : invErrors[0]
      });
    }

    const redactedResponseSample =
      typeof responseJson === "object" && responseJson !== null && !Array.isArray(responseJson)
        ? redactRow(responseJson as Record<string, unknown>)
        : { rawPreview: redactValue(responseText.slice(0, 120)) };

    return {
      valid: errors.length === 0,
      errors,
      deliverableSha256: await computeSha256(responseText || endpointUrl),
      byteSize: responseText.length,
      redactedPreview: {
        mode,
        verified: errors.length === 0,
        deliverableSha256: await computeSha256(responseText || endpointUrl),
        byteSize: responseText.length,
        computedAt,
        checks,
        liveApiSummary: {
          endpointUrl,
          httpStatus,
          latencyMs,
          verifiedKeys:
            verifiedKeys.length > 0
              ? verifiedKeys
              : typeof responseJson === "object" && responseJson !== null
              ? Object.keys(responseJson as Record<string, unknown>)
              : [],
          redactedResponseSample
        }
      }
    };
  }

  // ============================================================================
  // MODE D: OPTIMISTIC HUMAN INSPECTION + AUTO-SETTLE
  // ============================================================================
  const rawPreviewLines = (submission.content || "")
    .split(/\r?\n/)
    .slice(0, 6)
    .map((line, i) => (i % 2 === 0 ? line.slice(0, 48) + " [REDACTED BY NULLCLEAR SAFEPAY]" : "[WATERMARKED PREVIEW LINE]"));

  const windowSec = spec.inspectionWindowSeconds || 86400;
  checks.push({
    label: "Optimistic Integrity & Watermark Seal",
    passed: errors.length === 0 && byteSize > 0,
    detail: `Watermarked preview generated; auto-settle window: ${Math.round(windowSec / 3600)}h`
  });

  if (byteSize === 0) {
    errors.push("Deliverable content cannot be empty");
  }

  return {
    valid: errors.length === 0,
    errors,
    deliverableSha256,
    byteSize,
    redactedPreview: {
      mode,
      verified: errors.length === 0,
      deliverableSha256,
      byteSize,
      computedAt,
      checks,
      optimisticSummary: {
        watermarkedExcerpt: rawPreviewLines.join("\n"),
        autoSettleDeadline: computedAt + windowSec * 1000
      }
    }
  };
}
