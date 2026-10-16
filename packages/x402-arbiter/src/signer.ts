import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { WalletClient } from "viem";
import {
  EIP3009_TYPES,
  getChainConfig,
  encodeBase64Json,
  type EIP3009Authorization,
  type X402PaymentOption,
  type X402PaymentSignaturePayload
} from "@nullclear/shared";

export type SignerInput =
  | `0x${string}`
  | PrivateKeyAccount
  | {
      account: { address: `0x${string}` };
      signTypedData: (params: any) => Promise<`0x${string}`>;
    }
  | WalletClient;

/**
 * Signs an EIP-3009 TransferWithAuthorization and returns a Base64 encoded X402PaymentSignaturePayload
 */
export async function signX402Payment(
  signer: SignerInput,
  option: X402PaymentOption,
  resourceUrl?: string
): Promise<string> {
  let accountAddress: `0x${string}`;
  let signTypedDataFn: (params: any) => Promise<`0x${string}`>;

  if (typeof signer === "string" && signer.startsWith("0x")) {
    const account = privateKeyToAccount(signer as `0x${string}`);
    accountAddress = account.address;
    signTypedDataFn = (params) => account.signTypedData(params);
  } else if (typeof signer === "object" && signer !== null && "signTypedData" in signer) {
    if ("account" in signer && (signer as any).account) {
      const rawAccount = (signer as any).account;
      accountAddress = typeof rawAccount === "string" ? (rawAccount as `0x${string}`) : rawAccount.address;
    } else if ("address" in signer && (signer as any).address) {
      accountAddress = (signer as any).address;
    } else {
      throw new Error("Signer object missing address");
    }
    signTypedDataFn = (params) => (signer as any).signTypedData(params);
  } else {
    throw new Error("Invalid signer provided to signX402Payment: must be private key or viem account/wallet client");
  }

  // Generate 32-byte cryptographic nonce
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const nonce = (`0x` + Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;

  const validAfter = "0";
  const timeoutSeconds = option.maxTimeoutSeconds && option.maxTimeoutSeconds > 0 ? option.maxTimeoutSeconds : 300;
  const validBefore = String(Math.floor(Date.now() / 1000) + timeoutSeconds);

  const chainConfig = getChainConfig(option.network);
  const domain = {
    name: chainConfig.usdcDomain.name,
    version: chainConfig.usdcDomain.version,
    chainId: chainConfig.chainId,
    verifyingContract: chainConfig.usdc
  };

  const authorization: EIP3009Authorization = {
    from: accountAddress,
    to: option.payTo,
    value: option.amount,
    validAfter,
    validBefore,
    nonce
  };

  const signature = await signTypedDataFn({
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
    }
  });

  const acceptedOption: X402PaymentOption = {
    ...option,
    extra: option.extra || { name: "USD Coin", version: "2" }
  };

  const payload: X402PaymentSignaturePayload = {
    x402Version: 2,
    resource: resourceUrl ? { url: resourceUrl } : undefined,
    accepted: acceptedOption,
    payload: {
      signature,
      authorization
    }
  };

  return encodeBase64Json(payload);
}
