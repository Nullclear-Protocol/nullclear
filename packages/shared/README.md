# @nullclear/shared

Core shared constants, CAIP-2 network configurations, SafePay escrow fee helpers, ABIs, and cryptographic schemas for the NullClear protocol (`v1.5.0`).

## Features
- **Networks & Endpoints (`chains.ts`)**: Base Mainnet (8453) & Base Sepolia (84532) contract addresses, `DEFAULT_BASE_MAINNET_RPCS` failover list, `NULLCLEAR_ERC8004_AGENT_ID`, `NULLCLEAR_API_BASE_URL`, and `NULLCLEAR_BAZAAR_PRICES`.
- **ERC-8004 ABIs (`erc8004-abi.ts`)**: Official viem `parseAbi` definitions for Identity and Reputation Registries.
- **x402 V2 & Bazaar Types (`x402-types.ts`)**: Payment options, `X402BazaarExtension`, `X402DiscoveryManifest`, `X402ServiceGuarantee`, EIP-3009 typed data schemas, and universal Base64 helpers.
- **EIP-712 KYA & SafePay (`eip712-kya.ts`, `safepay.ts`)**: Corporate Mandate, Arbiter Clearing Attestation, and deterministic SafePay escrow fee calculation (`computeSafePayFeeBreakdown`).
