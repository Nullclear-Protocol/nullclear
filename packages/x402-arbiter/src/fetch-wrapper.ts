import { z } from "zod";
import {
  decodeBase64Json,
  type X402PaymentRequired,
  type X402PaymentOption,
  type InvariantRule,
  type FallbackTarget,
  type SpendPolicy
} from "@nullclear/shared";
import { signX402Payment, type SignerInput } from "./signer.js";

export class NullClearEscrowAbortedError extends Error {
  public stage: string;
  public buyerCharged: string;
  public validationErrors: string[];
  public score?: number;
  public upstreamStatus?: number;
  public reason?: string;
  public failoverAttempts?: number;
  public failedCandidates?: Array<{ targetUrl: string; sellerAgentId?: string; stage: string; reason: string }>;

  constructor(message: string, details: {
    stage: string;
    buyerCharged?: string;
    validationErrors?: string[];
    score?: number;
    upstreamStatus?: number;
    reason?: string;
    failoverAttempts?: number;
    failedCandidates?: Array<{ targetUrl: string; sellerAgentId?: string; stage: string; reason: string }>;
  }) {
    super(message);
    this.name = "NullClearEscrowAbortedError";
    this.stage = details.stage;
    this.buyerCharged = details.buyerCharged || "0";
    this.validationErrors = details.validationErrors || [];
    this.score = details.score;
    this.upstreamStatus = details.upstreamStatus;
    this.reason = details.reason;
  }
}

/**
 * Lightweight deterministic Zod-to-JSON-Schema converter
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = (schema as any)._def;
  if (!def) return {};

  const typeName = def.typeName;

  switch (typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray":
      return {
        type: "array",
        items: def.type ? zodToJsonSchema(def.type) : {}
      };
    case "ZodObject": {
      const shape = def.shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value as z.ZodTypeAny);
        const subDef = (value as any)._def;
        if (subDef.typeName !== "ZodOptional" && subDef.typeName !== "ZodNullable") {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined
      };
    }
    case "ZodEnum":
      return {
        type: "string",
        enum: def.values
      };
    case "ZodOptional":
    case "ZodNullable":
      return def.innerType ? zodToJsonSchema(def.innerType) : {};
    default:
      return {};
  }
}

export interface NullClearOptions {
  sellerAgentId?: string;
  minTrustScore?: number;
  schema?: z.ZodTypeAny | Record<string, unknown>;
  requiredFields?: string[];
  sha256Match?: string;
  invariants?: InvariantRule[];
  rejectRefusals?: boolean;
  fallbacks?: FallbackTarget[];
  spendPolicy?: SpendPolicy;
}

export interface NullClearFetchConfig {
  accountOrPrivateKey: SignerInput;
  chainId?: number;
  arbiterUrl?: string;
  defaultMinTrustScore?: number;
  customFetch?: typeof fetch;
}

export type NullClearRequestInit = RequestInit & {
  nullclear?: NullClearOptions;
};

/**
 * Creates an enhanced fetch client that autonomously intercepts HTTP 402 Payment Required
 * and safely wraps the call in NullClear Deferred Non-Custodial Schema Escrow
 */
export function createNullClearFetch(config: NullClearFetchConfig) {
  const chainId = config.chainId || 8453;
  const arbiterUrl = (config.arbiterUrl || "https://arbiter.nullclear.dev").replace(/\/$/, "");
  const defaultMinTrustScore = config.defaultMinTrustScore || 50;
  const customFetch = config.customFetch || fetch;

  return async function nullclearFetch(
    input: RequestInfo | URL,
    init?: NullClearRequestInit
  ): Promise<Response> {
    const targetUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const fetchInit: RequestInit = { ...init };
    delete (fetchInit as any).nullclear;

    // 1. Initial attempt
    const initialRes = await customFetch(input, fetchInit);

    // If not HTTP 402, return response normally
    if (initialRes.status !== 402) {
      return initialRes;
    }

    // 2. Intercept HTTP 402
    const paymentRequiredHeader =
      initialRes.headers.get("PAYMENT-REQUIRED") || initialRes.headers.get("payment-required");

    if (!paymentRequiredHeader) {
      // 402 without x402 header - return as is
      return initialRes;
    }

    let paymentRequired: X402PaymentRequired;
    try {
      paymentRequired = decodeBase64Json<X402PaymentRequired>(paymentRequiredHeader);
    } catch {
      return initialRes;
    }

    // 3. Find matching payment option for target network
    const targetNetwork = `eip155:${chainId}`;
    const selectedOption: X402PaymentOption | undefined = paymentRequired.accepts.find(
      (opt) => opt.network === targetNetwork && opt.scheme === "exact"
    );

    if (!selectedOption) {
      throw new Error(
        `Seller does not accept payments on network ${targetNetwork}. Accepted: ${paymentRequired.accepts
          .map((a) => a.network)
          .join(", ")}`
      );
    }

    // 4. Sign EIP-3009 TransferWithAuthorization
    const paymentSignatureHeader = await signX402Payment(
      config.accountOrPrivateKey,
      selectedOption,
      targetUrl
    );

    // 5. Convert schema if provided
    let jsonSchema: Record<string, unknown> | undefined;
    if (init?.nullclear?.schema) {
      if (init.nullclear.schema instanceof z.ZodType) {
        jsonSchema = zodToJsonSchema(init.nullclear.schema);
      } else if (typeof init.nullclear.schema === "object") {
        jsonSchema = init.nullclear.schema as Record<string, unknown>;
      }
    }

    // 6. Forward request through NullClear Arbiter escrow pipeline
    const clearPayload = {
      targetUrl,
      method: (init?.method as any) || "GET",
      headers: (init?.headers as Record<string, string>) || {},
      body: init?.body,
      paymentSignatureHeader,
      sellerAgentId: init?.nullclear?.sellerAgentId,
      minTrustScore: init?.nullclear?.minTrustScore ?? defaultMinTrustScore,
      validation: {
        expectedStatus: [200],
        jsonSchema,
        requiredFields: init?.nullclear?.requiredFields,
        sha256Match: init?.nullclear?.sha256Match,
        rejectRefusals: init?.nullclear?.rejectRefusals ?? true,
        invariants: init?.nullclear?.invariants
      },
      fallbacks: init?.nullclear?.fallbacks,
      spendPolicy: init?.nullclear?.spendPolicy
    };

    const arbiterRes = await customFetch(`${arbiterUrl}/v1/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clearPayload)
    });

    const arbiterData = (await arbiterRes.json()) as any;

    // 7. Check Arbiter outcome
    if (arbiterRes.status === 200 && arbiterData.cleared) {
      // Return synthetic Response with verified upstream data and attestation headers
      const resBody =
        typeof arbiterData.data === "string" ? arbiterData.data : JSON.stringify(arbiterData.data);

      const resHeaders = new Headers();
      resHeaders.set("Content-Type", "application/json");

      const paymentResponseHdr = arbiterRes.headers.get("PAYMENT-RESPONSE");
      if (paymentResponseHdr) resHeaders.set("PAYMENT-RESPONSE", paymentResponseHdr);

      const attestationHdr = arbiterRes.headers.get("X-NullClear-Attestation");
      if (attestationHdr) resHeaders.set("X-NullClear-Attestation", attestationHdr);

      return new Response(resBody, {
        status: 200,
        headers: resHeaders
      });
    }

    // Aborted: Throw typed error proving $0 was spent!
    throw new NullClearEscrowAbortedError(
      `NullClear Escrow Aborted: ${arbiterData.stage || "FAILED"} - ${
        arbiterData.reason || arbiterData.error || (arbiterData.validationErrors || []).join("; ")
      }`,
      {
        stage: arbiterData.stage || "UNKNOWN_FAILURE",
        buyerCharged: arbiterData.buyerCharged || "0",
        validationErrors: arbiterData.validationErrors || [],
        score: arbiterData.score,
        upstreamStatus: arbiterData.upstreamStatus,
        reason: arbiterData.reason || arbiterData.error,
        failoverAttempts: arbiterData.failoverAttempts,
        failedCandidates: arbiterData.failedCandidates
      }
    );
  };
}
