import type { InvariantRule, ValidationConfig } from "@nullclear/shared";

export type ValidationOptions = ValidationConfig;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Canonical LLM refusal/error boilerplate phrases (case-insensitive)
 */
export const CANONICAL_REFUSAL_PHRASES = [
  "as an ai language model",
  "i cannot fulfill this request",
  "i am unable to assist",
  "rate limit exceeded",
  "internal server error"
];

/**
 * Recursively scans arbitrary JSON data or strings for LLM refusal / fatal error boilerplate
 */
export function findLlmRefusal(data: unknown): string | null {
  if (typeof data === "string") {
    const lower = data.toLowerCase();
    for (const phrase of CANONICAL_REFUSAL_PHRASES) {
      if (lower.includes(phrase)) return phrase;
    }
    return null;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findLlmRefusal(item);
      if (found) return found;
    }
    return null;
  }
  if (data !== null && typeof data === "object") {
    for (const val of Object.values(data)) {
      const found = findLlmRefusal(val);
      if (found) return found;
    }
    return null;
  }
  return null;
}

/**
 * Checks a dot-notation property path against an object (e.g., "data.price")
 */
export function getDotProperty(obj: unknown, path: string): unknown {
  if (obj === null || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Evaluates deep deterministic invariant rules against parsed response data
 */
export function evaluateInvariants(jsonBody: unknown, invariants: InvariantRule[]): string[] {
  const errors: string[] = [];
  if (!invariants || invariants.length === 0) return errors;

  for (const rule of invariants) {
    const val = getDotProperty(jsonBody, rule.path);
    if (val === undefined) {
      errors.push(`Invariant failed at '${rule.path}': property does not exist in response`);
      continue;
    }

    // 1. Numeric Bounds: gt, gte, lt, lte
    if (typeof rule.gt === "number") {
      if (typeof val !== "number" || Number.isNaN(val) || val <= rule.gt) {
        errors.push(`Invariant failed at '${rule.path}': expected > ${rule.gt}, got ${val}`);
      }
    }
    if (typeof rule.gte === "number") {
      if (typeof val !== "number" || Number.isNaN(val) || val < rule.gte) {
        errors.push(`Invariant failed at '${rule.path}': expected >= ${rule.gte}, got ${val}`);
      }
    }
    if (typeof rule.lt === "number") {
      if (typeof val !== "number" || Number.isNaN(val) || val >= rule.lt) {
        errors.push(`Invariant failed at '${rule.path}': expected < ${rule.lt}, got ${val}`);
      }
    }
    if (typeof rule.lte === "number") {
      if (typeof val !== "number" || Number.isNaN(val) || val > rule.lte) {
        errors.push(`Invariant failed at '${rule.path}': expected <= ${rule.lte}, got ${val}`);
      }
    }

    // 2. Exact Equality / Inequality
    if (rule.eq !== undefined) {
      if (val !== rule.eq) {
        errors.push(`Invariant failed at '${rule.path}': expected === ${rule.eq}, got ${val}`);
      }
    }
    if (rule.neq !== undefined) {
      if (val === rule.neq) {
        errors.push(`Invariant failed at '${rule.path}': expected !== ${rule.neq}, got ${val}`);
      }
    }

    // 3. String or Array Length Bounds
    if (typeof rule.minLength === "number") {
      const len = typeof val === "string" || Array.isArray(val) ? val.length : -1;
      if (len < rule.minLength) {
        errors.push(`Invariant failed at '${rule.path}': length ${len >= 0 ? len : typeof val} is less than minLength ${rule.minLength}`);
      }
    }
    if (typeof rule.maxLength === "number") {
      const len = typeof val === "string" || Array.isArray(val) ? val.length : Infinity;
      if (len > rule.maxLength) {
        errors.push(`Invariant failed at '${rule.path}': length ${len !== Infinity ? len : typeof val} exceeds maxLength ${rule.maxLength}`);
      }
    }

    // 4. Regex Pattern
    if (typeof rule.pattern === "string") {
      if (typeof val !== "string" || !new RegExp(rule.pattern).test(val)) {
        errors.push(`Invariant failed at '${rule.path}': value does not match regex pattern '${rule.pattern}'`);
      }
    }

    // 5. Forbidden Substrings (Case-Insensitive)
    if (Array.isArray(rule.notContains) && rule.notContains.length > 0) {
      const strVal = typeof val === "string" ? val.toLowerCase() : JSON.stringify(val).toLowerCase();
      for (const forbidden of rule.notContains) {
        if (strVal.includes(forbidden.toLowerCase())) {
          errors.push(`Invariant failed at '${rule.path}': contains forbidden substring '${forbidden}'`);
        }
      }
    }

    // 6. Max Staleness (Timestamp Check)
    if (typeof rule.maxStalenessSeconds === "number") {
      let timestampSeconds: number | null = null;
      if (typeof val === "number") {
        timestampSeconds = val > 1e11 ? val / 1000 : val;
      } else if (typeof val === "string") {
        const num = Number(val);
        if (!Number.isNaN(num) && num > 0) {
          timestampSeconds = num > 1e11 ? num / 1000 : num;
        } else {
          const parsed = Date.parse(val);
          if (!Number.isNaN(parsed)) {
            timestampSeconds = parsed / 1000;
          }
        }
      }

      if (timestampSeconds === null) {
        errors.push(`Invariant failed at '${rule.path}': value '${val}' cannot be parsed as a valid timestamp`);
      } else {
        const nowSeconds = Date.now() / 1000;
        const staleness = Math.abs(nowSeconds - timestampSeconds);
        if (staleness > rule.maxStalenessSeconds) {
          errors.push(`Invariant failed at '${rule.path}': timestamp staleness ${Math.round(staleness)}s exceeds max allowable ${rule.maxStalenessSeconds}s`);
        }
      }
    }
  }

  return errors;
}

/**
 * Clean recursive JSON Schema Draft-07 validator with zero eval
 * Fully compliant with Cloudflare Workers V8 isolates
 */
export function validateJsonSchema(data: unknown, schema: Record<string, unknown>, path = "$"): string[] {
  const errors: string[] = [];
  if (!schema || typeof schema !== "object") return errors;

  // 1. Type validation
  if (schema.type) {
    const expectedType = schema.type;
    const actualType = Array.isArray(data) ? "array" : data === null ? "null" : typeof data;

    if (expectedType === "integer") {
      if (typeof data !== "number" || !Number.isInteger(data)) {
        errors.push(`${path}: expected integer, received ${typeof data === "number" ? "floating number" : actualType}`);
      }
    } else if (expectedType === "number") {
      if (typeof data !== "number" || Number.isNaN(data)) {
        errors.push(`${path}: expected number, received ${actualType}`);
      }
    } else if (actualType !== expectedType) {
      errors.push(`${path}: expected ${expectedType}, received ${actualType}`);
    }
  }

  // 2. Enum validation
  if (Array.isArray(schema.enum)) {
    const matched = schema.enum.some((val) => val === data);
    if (!matched) {
      errors.push(`${path}: value not in allowed enum [${schema.enum.join(", ")}]`);
    }
  }

  // 3. String minLength
  if (typeof data === "string" && typeof schema.minLength === "number") {
    if (data.length < schema.minLength) {
      errors.push(`${path}: string length ${data.length} is less than minLength ${schema.minLength}`);
    }
  }

  // 4. Numeric minimum / maximum
  if (typeof data === "number") {
    if (typeof schema.minimum === "number" && data < schema.minimum) {
      errors.push(`${path}: value ${data} is less than minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && data > schema.maximum) {
      errors.push(`${path}: value ${data} is greater than maximum ${schema.maximum}`);
    }
  }

  // 5. Object validation: required and properties
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required as string[]) {
        if (!(reqKey in obj) || obj[reqKey] === undefined) {
          errors.push(`${path}.${reqKey}: required property is missing`);
        }
      }
    }

    if (schema.properties && typeof schema.properties === "object") {
      const propSchemas = schema.properties as Record<string, Record<string, unknown>>;
      for (const [propKey, propSchema] of Object.entries(propSchemas)) {
        if (propKey in obj && obj[propKey] !== undefined) {
          const subErrors = validateJsonSchema(obj[propKey], propSchema, `${path}.${propKey}`);
          errors.push(...subErrors);
        }
      }
    }
  }

  // 6. Array validation: items
  if (Array.isArray(data) && schema.items && typeof schema.items === "object") {
    const itemSchema = schema.items as Record<string, unknown>;
    data.forEach((item, index) => {
      const itemErrors = validateJsonSchema(item, itemSchema, `${path}[${index}]`);
      errors.push(...itemErrors);
    });
  }

  return errors;
}

/**
 * Computes SHA-256 hex digest using Web Crypto API
 */
export async function computeSha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates upstream HTTP response body, status, required fields, SHA-256, LLM refusal, and deep value invariants
 */
export async function validateUpstreamResponse(
  status: number,
  rawBody: string,
  jsonBody: unknown,
  options: ValidationOptions
): Promise<ValidationResult> {
  const errors: string[] = [];

  // 1. Status Code
  const allowedStatuses = options.expectedStatus && options.expectedStatus.length > 0 ? options.expectedStatus : [200];
  if (!allowedStatuses.includes(status)) {
    errors.push(`HTTP status ${status} not in expected statuses [${allowedStatuses.join(", ")}]`);
  }

  // 2. SHA-256 Hash Match
  if (options.sha256Match) {
    const calculated = await computeSha256(rawBody);
    const expected = options.sha256Match.toLowerCase().replace(/^0x/, "");
    if (calculated.toLowerCase() !== expected) {
      errors.push(`SHA-256 mismatch: calculated ${calculated}, expected ${expected}`);
    }
  }

  // 3. Dot-Notation Required Fields
  if (options.requiredFields && options.requiredFields.length > 0) {
    if (jsonBody === null || typeof jsonBody !== "object") {
      errors.push("Response body is not a JSON object, cannot verify requiredFields");
    } else {
      for (const fieldPath of options.requiredFields) {
        const val = getDotProperty(jsonBody, fieldPath);
        if (val === undefined || val === null) {
          errors.push(`Missing required field at path "${fieldPath}"`);
        }
      }
    }
  }

  // 4. JSON Schema
  if (options.jsonSchema) {
    if (jsonBody === undefined || jsonBody === null) {
      errors.push("Response body is empty or not JSON, cannot validate JSON Schema");
    } else {
      const schemaErrors = validateJsonSchema(jsonBody, options.jsonSchema);
      errors.push(...schemaErrors);
    }
  }

  // 5. LLM Refusal Guard (enabled by default unless explicitly set to false)
  const shouldRejectRefusals = options.rejectRefusals !== false;
  if (shouldRejectRefusals) {
    const refusalInJson = jsonBody !== null ? findLlmRefusal(jsonBody) : null;
    const refusalInRaw = findLlmRefusal(rawBody);
    const foundRefusal = refusalInJson || refusalInRaw;
    if (foundRefusal) {
      errors.push(`LLM refusal pattern detected in response payload: "${foundRefusal}"`);
    }
  }

  // 6. Deep Value Invariants
  if (options.invariants && options.invariants.length > 0) {
    if (jsonBody === null || typeof jsonBody !== "object") {
      errors.push("Response body is not a JSON object, cannot evaluate invariants");
    } else {
      const invariantErrors = evaluateInvariants(jsonBody, options.invariants);
      errors.push(...invariantErrors);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
