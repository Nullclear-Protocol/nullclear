export interface ValidationOptions {
  expectedStatus?: number[];
  jsonSchema?: Record<string, unknown>;
  requiredFields?: string[];
  sha256Match?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Checks a dot-notation property path against an object (e.g., "data.price")
 */
function getDotProperty(obj: unknown, path: string): unknown {
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
    const matched = schema.enum.some(val => val === data);
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
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates upstream HTTP response body, status, required fields, and SHA-256
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

  // If status check failed, we still inspect other validations
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

  return {
    valid: errors.length === 0,
    errors
  };
}
