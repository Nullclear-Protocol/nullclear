import { keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  EIP3009_TYPES,
  SAFEPAY_TREASURY_ADDRESS,
  getChainConfig,
  type X402PaymentSignaturePayload
} from "@nullclear/shared";

export interface DualEIP3009SignParams {
  dealId: string;
  chainId: 8453 | 84532;
  buyerPrivateKey: `0x${string}`;
  sellerAddress: `0x${string}`;
  sellerNetAtomic: string;
  protocolFeeAtomic: string;
  validBeforeSeconds?: number;
}

export interface DualEIP3009SignedBundle {
  buyerAddress: `0x${string}`;
  sellerAddress: `0x${string}`;
  treasuryAddress: `0x${string}`;
  sellerSignaturePayload: X402PaymentSignaturePayload;
  feeSignaturePayload: X402PaymentSignaturePayload;
}

function generateBytes32Nonce(seed: string): `0x${string}` {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const randHex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return keccak256(stringToHex(`${seed}:${Date.now()}:${randHex}`));
}

/**
 * Signs both EIP-3009 TransferWithAuthorization payloads (Seller Net Payout + Protocol Fee to 0xB586...d5c)
 * using Viem against Base Mainnet (8453) or Base Sepolia (84532) USDC domain parameters.
 */
export async function signDualSafePayAuthorizations(
  params: DualEIP3009SignParams
): Promise<DualEIP3009SignedBundle> {
  const {
    dealId,
    chainId,
    buyerPrivateKey,
    sellerAddress,
    sellerNetAtomic,
    protocolFeeAtomic,
    validBeforeSeconds
  } = params;

  const account = privateKeyToAccount(buyerPrivateKey);
  const chainConfig = getChainConfig(chainId);
  const nowSec = Math.floor(Date.now() / 1000);
  const validAfter = String(nowSec - 60);
  const validBefore = String(validBeforeSeconds ?? nowSec + 86400);

  const sellerNonce = generateBytes32Nonce(`safepay:${dealId}:seller`);
  const feeNonce = generateBytes32Nonce(`safepay:${dealId}:fee`);

  const sellerSignature = await account.signTypedData({
    domain: chainConfig.usdcDomain,
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: account.address,
      to: sellerAddress,
      value: BigInt(sellerNetAtomic),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: sellerNonce
    }
  });

  const feeSignature = await account.signTypedData({
    domain: chainConfig.usdcDomain,
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: account.address,
      to: SAFEPAY_TREASURY_ADDRESS,
      value: BigInt(protocolFeeAtomic),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: feeNonce
    }
  });

  const sellerSignaturePayload: X402PaymentSignaturePayload = {
    x402Version: 2,
    resource: { url: `https://nullclear.com/deal/${dealId}` },
    accepted: {
      scheme: "exact",
      network: chainConfig.caip2 as "eip155:8453" | "eip155:84532",
      amount: sellerNetAtomic,
      asset: chainConfig.usdc,
      payTo: sellerAddress,
      maxTimeoutSeconds: 86400,
      extra: { name: chainConfig.usdcDomain.name, version: chainConfig.usdcDomain.version }
    },
    payload: {
      signature: sellerSignature,
      authorization: {
        from: account.address,
        to: sellerAddress,
        value: sellerNetAtomic,
        validAfter,
        validBefore,
        nonce: sellerNonce
      }
    }
  };

  const feeSignaturePayload: X402PaymentSignaturePayload = {
    x402Version: 2,
    resource: { url: `https://nullclear.com/deal/${dealId}#fee` },
    accepted: {
      scheme: "exact",
      network: chainConfig.caip2 as "eip155:8453" | "eip155:84532",
      amount: protocolFeeAtomic,
      asset: chainConfig.usdc,
      payTo: SAFEPAY_TREASURY_ADDRESS,
      maxTimeoutSeconds: 86400,
      extra: { name: chainConfig.usdcDomain.name, version: chainConfig.usdcDomain.version }
    },
    payload: {
      signature: feeSignature,
      authorization: {
        from: account.address,
        to: SAFEPAY_TREASURY_ADDRESS,
        value: protocolFeeAtomic,
        validAfter,
        validBefore,
        nonce: feeNonce
      }
    }
  };

  return {
    buyerAddress: account.address,
    sellerAddress,
    treasuryAddress: SAFEPAY_TREASURY_ADDRESS,
    sellerSignaturePayload,
    feeSignaturePayload
  };
}
