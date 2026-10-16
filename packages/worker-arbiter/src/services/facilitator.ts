import {
  verifyTypedData,
  keccak256,
  stringToHex,
  hexToSignature,
  createWalletClient,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import {
  EIP3009_TYPES,
  EIP3009_ABI,
  getChainConfig,
  type EIP3009Authorization,
  type X402PaymentOption,
  type X402PaymentResponse
} from "@nullclear/shared";

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

export interface SettlementOptions {
  authorization: EIP3009Authorization;
  signature: `0x${string}`;
  accepted: X402PaymentOption;
  facilitatorUrl?: string;
  settlementMode?: "onchain" | "facilitator" | "simulated";
  arbiterPrivateKey?: string;
  rpcUrl?: string;
  environment?: string;
}

/**
 * Cryptographically verifies an EIP-3009 TransferWithAuthorization signature locally
 * using viem verifyTypedData against the configured USDC contract and network domain
 */
export async function verifyEIP3009Local(
  authorization: EIP3009Authorization,
  signature: `0x${string}`,
  accepted: X402PaymentOption
): Promise<VerificationResult> {
  try {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const validBefore = BigInt(authorization.validBefore);
    const validAfter = BigInt(authorization.validAfter);

    if (validBefore <= now) {
      return { valid: false, error: `Authorization expired: validBefore ${validBefore} <= current ${now}` };
    }

    if (validAfter > now) {
      return { valid: false, error: `Authorization not yet active: validAfter ${validAfter} > current ${now}` };
    }

    if (authorization.to.toLowerCase() !== accepted.payTo.toLowerCase()) {
      return {
        valid: false,
        error: `Authorization recipient ${authorization.to} does not match accepted payTo ${accepted.payTo}`
      };
    }

    if (BigInt(authorization.value) < BigInt(accepted.amount)) {
      return {
        valid: false,
        error: `Authorization value ${authorization.value} is less than required ${accepted.amount}`
      };
    }

    const chainConfig = getChainConfig(accepted.network);
    const domain = {
      name: chainConfig.usdcDomain.name,
      version: chainConfig.usdcDomain.version,
      chainId: chainConfig.chainId,
      verifyingContract: chainConfig.usdc
    };

    const isSigValid = await verifyTypedData({
      address: authorization.from,
      domain,
      types: EIP3009_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce
      },
      signature
    });

    if (!isSigValid) {
      return { valid: false, error: "Cryptographic signature verification failed for EIP-3009 typed data" };
    }

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: `Verification error: ${err.message || String(err)}` };
  }
}

/**
 * Executes direct on-chain USDC transferWithAuthorization settlement
 */
export async function settleOnChain(options: SettlementOptions): Promise<X402PaymentResponse> {
  const {
    authorization,
    signature,
    accepted,
    arbiterPrivateKey,
    rpcUrl,
    environment = "development"
  } = options;

  const isProduction = environment === "production";
  const chainConfig = getChainConfig(accepted.network);

  if (!arbiterPrivateKey || !arbiterPrivateKey.startsWith("0x")) {
    if (isProduction) {
      return {
        success: false,
        network: accepted.network,
        payer: authorization.from,
        errorReason: "ARBITER_PRIVATE_KEY_MISSING: Cannot settle on-chain without private key"
      };
    }
    const txHash = keccak256(
      stringToHex(`settle:${authorization.from}:${authorization.to}:${authorization.nonce}:${Date.now()}`)
    );
    return {
      success: true,
      transaction: txHash,
      network: accepted.network,
      payer: authorization.from
    };
  }

  try {
    const targetRpc = rpcUrl || chainConfig.rpcUrl;
    const account = privateKeyToAccount(arbiterPrivateKey as `0x${string}`);
    const targetChain = chainConfig.chainId === 8453 ? base : baseSepolia;
    const walletClient = createWalletClient({
      account,
      chain: targetChain,
      transport: http(targetRpc, { timeout: 8000 })
    });

    const { r, s, v } = hexToSignature(signature);

    const txHash = await walletClient.writeContract({
      address: chainConfig.usdc,
      abi: EIP3009_ABI,
      functionName: "transferWithAuthorization",
      args: [
        authorization.from,
        authorization.to,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce,
        Number(v),
        r,
        s
      ]
    });

    return {
      success: true,
      transaction: txHash,
      network: accepted.network,
      payer: authorization.from
    };
  } catch (err: any) {
    if (isProduction) {
      return {
        success: false,
        network: accepted.network,
        payer: authorization.from,
        errorReason: `On-chain settlement failed: ${err.message || String(err)}`
      };
    }
    const txHash = keccak256(
      stringToHex(`simulated_onchain:${authorization.from}:${authorization.to}:${authorization.nonce}:${Date.now()}`)
    );
    return {
      success: true,
      transaction: txHash,
      network: accepted.network,
      payer: authorization.from
    };
  }
}

/**
 * Routes settlement through upstream facilitator endpoint
 */
export async function settleViaFacilitator(options: SettlementOptions): Promise<X402PaymentResponse> {
  const {
    authorization,
    signature,
    accepted,
    facilitatorUrl,
    environment = "development"
  } = options;

  const isProduction = environment === "production";

  if (facilitatorUrl) {
    try {
      const endpoint = facilitatorUrl.endsWith("/settle")
        ? facilitatorUrl
        : `${facilitatorUrl.replace(/\/$/, "")}/settle`;

      const paymentRequirements = {
        scheme: accepted.scheme || "exact",
        network: accepted.network,
        amount: String(accepted.amount),
        payTo: accepted.payTo,
        asset: accepted.asset,
        maxTimeoutSeconds: accepted.maxTimeoutSeconds || 300,
        extra: accepted.extra || { name: "USD Coin", version: "2" }
      };

      const normalizedAuth: EIP3009Authorization = {
        from: authorization.from,
        to: authorization.to,
        value: String(authorization.value),
        validAfter: String(authorization.validAfter),
        validBefore: String(authorization.validBefore),
        nonce: authorization.nonce
      };

      const requestBody = {
        x402Version: 2,
        paymentPayload: {
          x402Version: 2,
          accepted: paymentRequirements,
          payload: {
            signature,
            authorization: normalizedAuth
          }
        },
        paymentRequirements
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          network: accepted.network,
          payer: authorization.from,
          errorReason: `Facilitator settlement failed: HTTP ${res.status} ${errorText}`
        };
      }

      const data = (await res.json()) as {
        success?: boolean;
        transaction?: `0x${string}`;
        txHash?: `0x${string}`;
        errorReason?: string;
        network?: "eip155:8453" | "eip155:84532";
        payer?: `0x${string}`;
      };

      if (data.success === false) {
        return {
          success: false,
          network: accepted.network,
          payer: authorization.from,
          errorReason: data.errorReason || "Facilitator rejected settlement"
        };
      }

      const txHash = data.transaction || data.txHash;
      if (!txHash) {
        return {
          success: false,
          network: accepted.network,
          payer: authorization.from,
          errorReason: data.errorReason || "Facilitator response missing transaction hash"
        };
      }

      return {
        success: true,
        transaction: txHash,
        network: accepted.network,
        payer: authorization.from
      };
    } catch (err: any) {
      if (isProduction) {
        return {
          success: false,
          network: accepted.network,
          payer: authorization.from,
          errorReason: `Facilitator connection error in production: ${err.message || String(err)}`
        };
      }
    }
  }

  if (isProduction) {
    return {
      success: false,
      network: accepted.network,
      payer: authorization.from,
      errorReason: "FACILITATOR_URL_REQUIRED: Live facilitator settlement required in production"
    };
  }

  // Simulation mode for tests / non-production
  const txHash = keccak256(
    stringToHex(`facilitator:${authorization.from}:${authorization.to}:${authorization.nonce}:${Date.now()}`)
  );

  return {
    success: true,
    transaction: txHash,
    network: accepted.network,
    payer: authorization.from
  };
}

/**
 * Verifies EIP-3009 payment signature via upstream PayAI Facilitator (/verify)
 */
export async function verifyViaFacilitator(options: SettlementOptions): Promise<{ isValid: boolean; invalidReason?: string }> {
  const { authorization, signature, accepted, facilitatorUrl } = options;
  if (!facilitatorUrl) {
    return { isValid: false, invalidReason: "FACILITATOR_URL_MISSING" };
  }

  try {
    const endpoint = facilitatorUrl.endsWith("/verify")
      ? facilitatorUrl
      : `${facilitatorUrl.replace(/\/settle\/?$/, "").replace(/\/$/, "")}/verify`;

    const paymentRequirements = {
      scheme: accepted.scheme || "exact",
      network: accepted.network,
      amount: String(accepted.amount),
      payTo: accepted.payTo,
      asset: accepted.asset,
      maxTimeoutSeconds: accepted.maxTimeoutSeconds || 300,
      extra: accepted.extra || { name: "USD Coin", version: "2" }
    };

    const normalizedAuth: EIP3009Authorization = {
      from: authorization.from,
      to: authorization.to,
      value: String(authorization.value),
      validAfter: String(authorization.validAfter),
      validBefore: String(authorization.validBefore),
      nonce: authorization.nonce
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload: {
          x402Version: 2,
          accepted: paymentRequirements,
          payload: {
            signature,
            authorization: normalizedAuth
          }
        },
        paymentRequirements
      })
    });

    if (!res.ok) {
      return { isValid: false, invalidReason: `HTTP_${res.status}` };
    }

    const data = (await res.json()) as { isValid: boolean; invalidReason?: string };
    return { isValid: Boolean(data.isValid), invalidReason: data.invalidReason };
  } catch (err: any) {
    return { isValid: false, invalidReason: err.message || String(err) };
  }
}

/**
 * Executes EIP-3009 settlement via:
 * 1. Direct on-chain USDC contract call (when settlementMode === "onchain")
 * 2. Facilitator HTTP proxy (when settlementMode === "facilitator")
 * 3. Deterministic simulation (strictly for development / test environments)
 */
export async function settleTransfer(options: SettlementOptions): Promise<X402PaymentResponse> {
  const { settlementMode = "facilitator", environment = "development", arbiterPrivateKey } = options;

  if (settlementMode === "onchain") {
    const onchainResult = await settleOnChain(options);
    if (onchainResult.success) {
      return onchainResult;
    }
    if (options.facilitatorUrl) {
      const facResult = await settleViaFacilitator(options);
      if (facResult.success) return facResult;
    }
    return onchainResult;
  }

  if (settlementMode === "facilitator") {
    const facResult = await settleViaFacilitator(options);
    if (facResult.success) {
      return facResult;
    }
    // Fallback to direct on-chain settlement if PayAI returns 5xx or connection error and arbiter private key is available
    if (
      arbiterPrivateKey &&
      arbiterPrivateKey.startsWith("0x") &&
      facResult.errorReason &&
      (facResult.errorReason.includes("50") ||
        facResult.errorReason.includes("502") ||
        facResult.errorReason.includes("503") ||
        facResult.errorReason.includes("504") ||
        facResult.errorReason.includes("500") ||
        facResult.errorReason.includes("Facilitator connection error") ||
        facResult.errorReason.includes("fetch failed"))
    ) {
      const onchainResult = await settleOnChain(options);
      if (onchainResult.success) {
        return onchainResult;
      }
    }
    return facResult;
  }

  if (environment === "production") {
    return {
      success: false,
      network: options.accepted.network,
      payer: options.authorization.from,
      errorReason: "PRODUCTION_SETTLEMENT_REQUIRED: Live settlement required in production"
    };
  }

  const txHash = keccak256(
    stringToHex(`settle:${options.authorization.from}:${options.authorization.to}:${options.authorization.nonce}:${Date.now()}`)
  );

  return {
    success: true,
    transaction: txHash,
    network: options.accepted.network,
    payer: options.authorization.from
  };
}
