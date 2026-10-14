import { privateKeyToAccount } from "viem/accounts";
import {
  ARBITER_DOMAIN,
  ARBITER_ATTESTATION_TYPES,
  type ClearingAttestation
} from "@nullclear/shared";

export const DEFAULT_ARBITER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

export interface SignedAttestationReceipt {
  attestation: ClearingAttestation;
  signature: `0x${string}`;
  arbiterAddress: `0x${string}`;
}

/**
 * Signs a clearing attestation receipt using the arbiter's private key
 */
export async function signClearingReceipt(
  attestation: ClearingAttestation,
  arbiterPrivateKey?: string
): Promise<SignedAttestationReceipt> {
  const privateKey = (arbiterPrivateKey && arbiterPrivateKey.startsWith("0x")
    ? arbiterPrivateKey
    : DEFAULT_ARBITER_KEY) as `0x${string}`;

  const account = privateKeyToAccount(privateKey);

  const signature = await account.signTypedData({
    domain: ARBITER_DOMAIN,
    types: ARBITER_ATTESTATION_TYPES,
    primaryType: "ClearingAttestation",
    message: {
      clearingId: attestation.clearingId,
      buyer: attestation.buyer,
      sellerAgentId: attestation.sellerAgentId,
      amountAtomic: BigInt(attestation.amountAtomic),
      feeAtomic: BigInt(attestation.feeAtomic),
      responseHash: attestation.responseHash,
      timestamp: BigInt(attestation.timestamp),
      cleared: attestation.cleared
    }
  });

  return {
    attestation,
    signature,
    arbiterAddress: account.address
  };
}
