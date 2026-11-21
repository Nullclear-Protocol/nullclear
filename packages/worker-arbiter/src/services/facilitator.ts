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
  type SettlementErrorCode,
  type X402PaymentOption,
  type X402PaymentResponse
} from "@nullclear/shared";
import { generateCdpJwt } from "./cdp-auth.js";

export interface VerificationResult {
  valid: boolean;
  error?: string;
  errorCode?: SettlementErrorCode;
}

export interface SettlementOptions {
  authorization: EIP3009Authorization;
  signature: `0x${string}`;
  accepted: X402PaymentOption;
  facilitatorUrl?: string;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  settlementMode?: "onchain" | "facilitator" | "simulated";
  onchainMethod?: "transferWithAuthorization" | "receiveWithAuthorization";
  arbiterPrivateKey?: string;
  rpcUrl?: string;
  environment?: string;
  resource?: {
    url: string;
    description?: string;
    mimeType?: string;
    serviceName?: string;
    tags?: string[];
    toolName?: string;
    iconUrl?: string;
  };
  bazaarExtension?: unknown;
}

const MIN_RELAYER_GAS_WEI = 10_000_000_000_000n; // 0.00001 ETH on Base

/**
 * Classifies EIP-3009 / facilitator / on-chain settlement error strings into explicit HTTP status codes
 * and protocol error codes so relayer failures (502) never masquerade as 402 payment rejections.
 */
export function classifySettlementErrorReason(reason: string): {
  errorCode: SettlementErrorCode;
  httpStatus: 400 | 402 | 502;
} {
  const lower = (reason || "").toLowerCase();

  if (
    /relayer_insufficient_gas|arbiter_private_key_missing|facilitator_url_required|insufficient funds for gas|insufficient funds for intrinsic|intrinsic transaction cost|http 5\d{2}|http 429|settlement_pending|connection error|fetch failed|timeout|aborted|econnrefused|network error|nonce too low|replacement transaction underpriced|rpc/i.test(
      lower
    )
  ) {
    return { errorCode: "RELAYER_ERROR", httpStatus: 502 };
  }

  if (
    /authorization expired|authorization is expired|validbefore|expired|not yet active|validafter/i.test(
      lower
    )
  ) {
    return { errorCode: "AUTHORIZATION_EXPIRED", httpStatus: 400 };
  }

  if (
    /authorization is used|authorization_used|nonce_already_used|nonce already used|nonce_used|already used|transfer amount exceeds balance|exceeds balance|insufficient_funds|insufficient funds|insufficient usdc|insufficient balance/i.test(
      lower
    )
  ) {
    return { errorCode: "NONCE_USED_OR_INSUFFICIENT_FUNDS", httpStatus: 402 };
  }

  if (
    /invalid signature|invalid_exact_evm_payload_signature|signature verification failed|ecrecover|wrong domain|domain separator|verifyingcontract|chainid|does not match accepted payto|bad_request|invalid signer/i.test(
      lower
    )
  ) {
    return { errorCode: "INVALID_SIGNATURE", httpStatus: 400 };
  }

  if (/less than required|insufficient.*value/i.test(lower)) {
    return { errorCode: "INSUFFICIENT_VALUE", httpStatus: 402 };
  }

  return { errorCode: "RELAYER_ERROR", httpStatus: 502 };
}

const AUTHORIZATION_USED_TOPIC0 =
  "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";

async function jsonRpcPost(rpcUrl: string, method: string, params: unknown[], timeoutMs = 3000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.error ? null : json?.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifies whether an EIP-3009 authorization has already settled on-chain (receipt or AuthorizationUsed log).
 * Prevents charging a buyer on-chain while returning HTTP 402 if PayAI returned settlement_pending or 5xx post-broadcast.
 */
export async function verifyAuthorizationSettledOnChain(
  rpcUrl: string | undefined,
  network: "eip155:8453" | "eip155:84532",
  assetAddress: string,
  authorizer: string,
  nonce: string,
  candidateTxHash?: string
): Promise<`0x${string}` | null> {
  const defaultRpcs =
    network === "eip155:8453"
      ? ["https://base-rpc.publicnode.com", "https://mainnet.base.org"]
      : ["https://sepolia.base.org"];
  const candidates = Array.from(new Set([rpcUrl, ...defaultRpcs].filter(Boolean))) as string[];

  const cleanAuthorizer = authorizer.toLowerCase().replace(/^0x/, "");
  const cleanNonce = nonce.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  if (cleanAuthorizer.length !== 40) return null;
  const paddedAuthorizer = "0x" + cleanAuthorizer.padStart(64, "0");
  const topicNonce = "0x" + cleanNonce;

  for (const endpoint of candidates) {
    if (candidateTxHash && /^0x[a-fA-F0-9]{64}$/.test(candidateTxHash)) {
      const receipt = await jsonRpcPost(endpoint, "eth_getTransactionReceipt", [candidateTxHash]);
      if (receipt?.status === "0x1") {
        return candidateTxHash as `0x${string}`;
      }
    }

    const latestHex = await jsonRpcPost(endpoint, "eth_blockNumber", []);
    if (typeof latestHex === "string") {
      const latest = parseInt(latestHex, 16);
      if (Number.isFinite(latest) && latest > 0) {
        const fromBlk = Math.max(0, latest - 120);
        const logs = await jsonRpcPost(endpoint, "eth_getLogs", [
          {
            address: assetAddress,
            fromBlock: "0x" + fromBlk.toString(16),
            toBlock: latestHex,
            topics: [AUTHORIZATION_USED_TOPIC0, paddedAuthorizer, topicNonce]
          }
        ]);
        if (Array.isArray(logs) && logs.length > 0 && typeof logs[0]?.transactionHash === "string") {
          return logs[0].transactionHash as `0x${string}`;
        }
      }
    }
  }
  return null;
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
      return {
        valid: false,
        errorCode: "AUTHORIZATION_EXPIRED",
        error: `Authorization expired: validBefore ${validBefore} <= current ${now}`
      };
    }

    if (validAfter > now) {
      return {
        valid: false,
        errorCode: "AUTHORIZATION_NOT_YET_ACTIVE",
        error: `Authorization not yet active: validAfter ${validAfter} > current ${now}`
      };
    }

    if (authorization.to.toLowerCase() !== accepted.payTo.toLowerCase()) {
      return {
        valid: false,
        errorCode: "INVALID_SIGNATURE",
        error: `Authorization recipient ${authorization.to} does not match accepted payTo ${accepted.payTo}`
      };
    }

    if (BigInt(authorization.value) < BigInt(accepted.amount)) {
      return {
        valid: false,
        errorCode: "INSUFFICIENT_VALUE",
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
      return {
        valid: false,
        errorCode: "INVALID_SIGNATURE",
        error: `Cryptographic signature verification failed for EIP-3009 typed data (expected domain name="${domain.name}", version="${domain.version}", chainId=${domain.chainId}, verifyingContract=${domain.verifyingContract})`
      };
    }

    return { valid: true };
  } catch (err: any) {
    return {
      valid: false,
      errorCode: "INVALID_SIGNATURE",
      error: `Verification error: ${err.message || String(err)}`
    };
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
        errorCode: "RELAYER_ERROR",
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

    // Pre-flight check: in production, verify facilitator/relayer signer has sufficient Base ETH for gas
    if (isProduction) {
      const balanceHex = await jsonRpcPost(targetRpc, "eth_getBalance", [account.address, "latest"], 2500);
      if (typeof balanceHex === "string" && /^0x[0-9a-fA-F]+$/.test(balanceHex)) {
        const ethBalanceWei = BigInt(balanceHex);
        if (ethBalanceWei < MIN_RELAYER_GAS_WEI) {
          return {
            success: false,
            network: accepted.network,
            payer: authorization.from,
            errorCode: "RELAYER_ERROR",
            errorReason: `RELAYER_INSUFFICIENT_GAS: Facilitator signer ${account.address} has insufficient Base ETH (${ethBalanceWei.toString()} wei) for gas`
          };
        }
      }
    }

    const walletClient = createWalletClient({
      account,
      chain: targetChain,
      transport: http(targetRpc, { timeout: 8000 })
    });

    const { r, s, v } = hexToSignature(signature);
    const normalizedV = Number(v === 0n || v === 1n ? v + 27n : v ?? 27n);
    const fnName =
      options.onchainMethod === "receiveWithAuthorization" ||
      authorization.to.toLowerCase() === account.address.toLowerCase()
        ? "receiveWithAuthorization"
        : "transferWithAuthorization";

    const txHash = await walletClient.writeContract({
      address: chainConfig.usdc,
      abi: EIP3009_ABI,
      functionName: fnName,
      args: [
        authorization.from,
        authorization.to,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce,
        normalizedV,
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
    const errMsg = err.message || String(err);
    const classified = classifySettlementErrorReason(errMsg);
    if (isProduction) {
      return {
        success: false,
        network: accepted.network,
        payer: authorization.from,
        errorCode: classified.errorCode,
        errorReason: `On-chain settlement failed: ${errMsg}`
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
    rpcUrl,
    resource,
    bazaarExtension,
    environment = "development"
  } = options;

  const isProduction = environment === "production";

  if (facilitatorUrl) {
    const paymentRequirements: Record<string, unknown> = {
      scheme: accepted.scheme || "exact",
      network: accepted.network,
      amount: String(accepted.amount),
      payTo: accepted.payTo,
      asset: accepted.asset,
      maxTimeoutSeconds: accepted.maxTimeoutSeconds || 300,
      extra: accepted.extra || { name: "USD Coin", version: "2" },
      ...(resource?.url ? { resource: resource.url } : {}),
      ...(resource?.description ? { description: resource.description } : {}),
      ...(resource?.mimeType ? { mimeType: resource.mimeType } : {})
    };

    const normalizedAuth: EIP3009Authorization = {
      from: authorization.from,
      to: authorization.to,
      value: String(authorization.value),
      validAfter: String(authorization.validAfter),
      validBefore: String(authorization.validBefore),
      nonce: authorization.nonce
    };

    const resourceMetadata = resource
      ? {
          ...(resource.serviceName ? { serviceName: resource.serviceName } : {}),
          ...(resource.tags && resource.tags.length > 0 ? { tags: resource.tags } : {}),
          ...(resource.toolName ? { toolName: resource.toolName } : {}),
          ...(resource.iconUrl ? { iconUrl: resource.iconUrl } : {}),
          ...(resource.description ? { description: resource.description } : {}),
          ...(resource.mimeType ? { mimeType: resource.mimeType } : {})
        }
      : undefined;

    const requestBody: Record<string, unknown> = {
      x402Version: 2,
      paymentPayload: {
        x402Version: 2,
        ...(resource ? { resource } : {}),
        accepted: paymentRequirements,
        payload: {
          signature,
          authorization: normalizedAuth
        },
        ...(bazaarExtension ? { extensions: { bazaar: bazaarExtension } } : {})
      },
      paymentRequirements,
      ...(resourceMetadata && Object.keys(resourceMetadata).length > 0
        ? { metadata: resourceMetadata }
        : {}),
      ...(bazaarExtension
        ? {
            extensions: { bazaar: bazaarExtension },
            serverExtensions: { bazaar: bazaarExtension }
          }
        : {})
    };

    let candidateTxHash: string | undefined;

    try {
      const endpoint = facilitatorUrl.endsWith("/settle")
        ? facilitatorUrl
        : `${facilitatorUrl.replace(/\/$/, "")}/settle`;

      const postHeaders: Record<string, string> = { "Content-Type": "application/json" };
      const parsedEndpoint = new URL(endpoint);
      if (
        parsedEndpoint.hostname.includes("cdp.coinbase.com") &&
        options.cdpApiKeyId &&
        options.cdpApiKeySecret
      ) {
        const jwt = await generateCdpJwt({
          apiKeyId: options.cdpApiKeyId,
          apiKeySecret: options.cdpApiKeySecret,
          requestMethod: "POST",
          requestHost: parsedEndpoint.host,
          requestPath: parsedEndpoint.pathname
        });
        postHeaders.Authorization = `Bearer ${jwt}`;
      }

      const postSettle = async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
          return await fetch(endpoint, {
            method: "POST",
            headers: postHeaders,
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
        } finally {
          clearTimeout(timer);
        }
      };

      let res = await postSettle();

      if (!res.ok) {
        const errorText = await res.text();
        // Check on-chain in case PayAI broadcast before returning HTTP 5xx/timeout
        const recoveredHash =
          res.status >= 500
            ? await verifyAuthorizationSettledOnChain(
                rpcUrl,
                accepted.network,
                accepted.asset,
                authorization.from,
                authorization.nonce
              )
            : null;
        if (recoveredHash) {
          return {
            success: true,
            transaction: recoveredHash,
            network: accepted.network,
            payer: authorization.from
          };
        }
        const errorReason = `Facilitator settlement failed: HTTP ${res.status} ${errorText}`;
        return {
          success: false,
          network: accepted.network,
          payer: authorization.from,
          errorCode: classifySettlementErrorReason(errorReason).errorCode,
          errorReason
        };
      }

      let data = (await res.json()) as {
        success?: boolean;
        transaction?: `0x${string}`;
        txHash?: `0x${string}`;
        errorReason?: string;
        errorMessage?: string;
        network?: "eip155:8453" | "eip155:84532";
        payer?: `0x${string}`;
      };

      candidateTxHash = data.transaction || data.txHash || undefined;

      // Handle PayAI `settlement_pending` (broadcast in flight whose confirmation outran PayAI's response budget)
      if (
        data.success === false &&
        (data.errorReason === "settlement_pending" ||
          (candidateTxHash && /^0x[a-fA-F0-9]{64}$/.test(candidateTxHash)))
      ) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const onchainHash = await verifyAuthorizationSettledOnChain(
            rpcUrl,
            accepted.network,
            accepted.asset,
            authorization.from,
            authorization.nonce,
            candidateTxHash
          );
          if (onchainHash) {
            return {
              success: true,
              transaction: onchainHash,
              network: accepted.network,
              payer: authorization.from
            };
          }

          await new Promise((r) => setTimeout(r, 850));
          res = await postSettle();
          if (res.ok) {
            data = (await res.json()) as any;
            candidateTxHash = data.transaction || data.txHash || candidateTxHash;
            if (data.success !== false && candidateTxHash) {
              break;
            }
          }
        }
      }

      const finalTxHash = (data.transaction || data.txHash || candidateTxHash) as `0x${string}` | undefined;

      if (data.success === false) {
        const onchainHash = await verifyAuthorizationSettledOnChain(
          rpcUrl,
          accepted.network,
          accepted.asset,
          authorization.from,
          authorization.nonce,
          finalTxHash
        );
        if (onchainHash) {
          return {
            success: true,
            transaction: onchainHash,
            network: accepted.network,
            payer: authorization.from
          };
        }
        const errorReason = data.errorReason || data.errorMessage || "Facilitator rejected settlement";
        return {
          success: false,
          network: data.network || accepted.network,
          payer: data.payer || authorization.from,
          errorCode: classifySettlementErrorReason(errorReason).errorCode,
          errorReason
        };
      }

      if (!finalTxHash) {
        const errorReason = data.errorReason || "Facilitator response missing transaction hash";
        return {
          success: false,
          network: accepted.network,
          payer: authorization.from,
          errorCode: classifySettlementErrorReason(errorReason).errorCode,
          errorReason
        };
      }

      return {
        success: true,
        transaction: finalTxHash,
        network: accepted.network,
        payer: authorization.from
      };
    } catch (err: any) {
      const recoveredHash = await verifyAuthorizationSettledOnChain(
        rpcUrl,
        accepted.network,
        accepted.asset,
        authorization.from,
        authorization.nonce,
        candidateTxHash
      );
      if (recoveredHash) {
        return {
          success: true,
          transaction: recoveredHash,
          network: accepted.network,
          payer: authorization.from
        };
      }
      if (isProduction) {
        const errorReason = `Facilitator connection error in production: ${err.message || String(err)}`;
        return {
          success: false,
          network: accepted.network,
          payer: authorization.from,
          errorCode: "RELAYER_ERROR",
          errorReason
        };
      }
    }
  }

  if (isProduction) {
    return {
      success: false,
      network: accepted.network,
      payer: authorization.from,
      errorCode: "RELAYER_ERROR",
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
    // Fallback to direct on-chain settlement if PayAI is unavailable/timed out/pending without receipt and arbiter key is available
    if (
      arbiterPrivateKey &&
      arbiterPrivateKey.startsWith("0x") &&
      facResult.errorReason &&
      /HTTP 5\d{2}|HTTP 429|settlement_pending|Facilitator connection error|fetch failed|timeout|aborted/i.test(
        facResult.errorReason
      )
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
