export interface KYAMandate {
  corporateEntity: string;
  entityRegistrationNumber: string;
  agentId: string;
  agentWallet: `0x${string}`;
  maxTxLimitUsd: number;
  liabilityCoverageUsd: number;
  validUntil: number; // Unix timestamp seconds
  jurisdiction: string;
}

export const KYA_MANDATE_TYPES = {
  CorporateMandate: [
    { name: "corporateEntity", type: "string" },
    { name: "entityRegistrationNumber", type: "string" },
    { name: "agentId", type: "string" },
    { name: "agentWallet", type: "address" },
    { name: "maxTxLimitUsd", type: "uint256" },
    { name: "liabilityCoverageUsd", type: "uint256" },
    { name: "validUntil", type: "uint256" },
    { name: "jurisdiction", type: "string" }
  ]
} as const;

export const KYA_DOMAIN = {
  name: "NullClear KYA Registry",
  version: "1",
  chainId: 8453
} as const;

export interface ClearingAttestation {
  clearingId: string;
  buyer: `0x${string}`;
  sellerAgentId: string;
  amountAtomic: string;
  feeAtomic: string;
  responseHash: `0x${string}`;
  timestamp: number;
  cleared: boolean;
}

export const ARBITER_ATTESTATION_TYPES = {
  ClearingAttestation: [
    { name: "clearingId", type: "string" },
    { name: "buyer", type: "address" },
    { name: "sellerAgentId", type: "string" },
    { name: "amountAtomic", type: "uint256" },
    { name: "feeAtomic", type: "uint256" },
    { name: "responseHash", type: "bytes32" },
    { name: "timestamp", type: "uint256" },
    { name: "cleared", type: "bool" }
  ]
} as const;

export const ARBITER_DOMAIN = {
  name: "NullClear Arbiter",
  version: "1",
  chainId: 8453
} as const;
