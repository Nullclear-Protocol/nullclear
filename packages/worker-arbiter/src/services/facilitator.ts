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
 * Executes EIP-3009 settlement via:
 * 1. Direct on-chain USDC contract call (when settlementMode === "onchain" and private key + RPC present)
 * 2. Facilitator HTTP proxy (when facilitatorUrl provided)
 * 3. Deterministic simulation (strictly for development / test environments)
 */
export async function settleTransfer(options: SettlementOptions): Promise<X402PaymentResponse> {
  const {
    authorization,
    signature,
    accepted,
    facilitatorUrl,
    settlementMode = "facilitator",
    arbiterPrivateKey,
    rpcUrl,
    environment = "development"
  } = options;

  const isProduction = environment === "production";
  const chainConfig = getChainConfig(accepted.network);

  // 1. Direct On-Chain Settlement Mode
  if (settlementMode === "onchain" && arbiterPrivateKey && arbiterPrivateKey.startsWith("0x")) {
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
      // In production, log and do not silently fall back to simulation if onchain was mandated
      if (isProduction && !facilitatorUrl) {
        return {
          success: false,
          network: accepted.network,
          payer: authorization.from,
          errorReason: `On-chain settlement failed: ${err.message || String(err)}`
        };
      }
    }
  }

  // 2. Facilitator Settlement Endpoint
  if (facilitatorUrl) {
    try {
      const endpoint = facilitatorUrl.endsWith("/settle")
        ? facilitatorUrl
        : `${facilitatorUrl.replace(/\/$/, "")}/settle`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorization,
          signature,
          network: accepted.network
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          network: accepted.network,
          payer: authorization.from,
          errorReason: `Facilitator settlement failed: ${res.status} ${errorText}`
        };
      }

      const data = (await res.json()) as { txHash?: `0x${string}`; success?: boolean };
      return {
        success: true,
        transaction: data.txHash,
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

  // 3. In Production: Fail closed if neither live on-chain nor facilitator succeeded
  if (isProduction) {
    return {
      success: false,
      network: accepted.network,
      payer: authorization.from,
      errorReason:
        "PRODUCTION_SETTLEMENT_REQUIRED: Live settlement via on-chain RPC or facilitator must succeed in production"
    };
  }

  // 4. Local / Test simulation mode: deterministic transaction hash
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
