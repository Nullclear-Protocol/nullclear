export interface ChainConfig {
  name: string;
  chainId: number;
  caip2: `eip155:${number}`;
  erc8004Identity: `0x${string}`;
  erc8004Reputation: `0x${string}`;
  usdc: `0x${string}`;
  usdcDomain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  rpcUrl: string;
  blockExplorer: string;
}

export const BASE_MAINNET: ChainConfig = {
  name: "Base Mainnet",
  chainId: 8453,
  caip2: "eip155:8453",
  erc8004Identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  erc8004Reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  usdcDomain: {
    name: "USD Coin",
    version: "2",
    chainId: 8453,
    verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  },
  rpcUrl: "https://mainnet.base.org",
  blockExplorer: "https://basescan.org"
};

export const BASE_SEPOLIA: ChainConfig = {
  name: "Base Sepolia",
  chainId: 84532,
  caip2: "eip155:84532",
  erc8004Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  erc8004Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  usdcDomain: {
    name: "USDC",
    version: "2",
    chainId: 84532,
    verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  },
  rpcUrl: "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org"
};

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  8453: BASE_MAINNET,
  84532: BASE_SEPOLIA
};

export const CAIP2_TO_CHAIN_ID: Record<string, number> = {
  "eip155:8453": 8453,
  "eip155:84532": 84532
};

export function getChainConfig(chainIdOrCaip2: number | string): ChainConfig {
  let chainId: number;
  if (typeof chainIdOrCaip2 === "string") {
    if (chainIdOrCaip2.startsWith("eip155:")) {
      chainId = CAIP2_TO_CHAIN_ID[chainIdOrCaip2] ?? parseInt(chainIdOrCaip2.slice(7), 10);
    } else {
      chainId = parseInt(chainIdOrCaip2, 10);
    }
  } else {
    chainId = chainIdOrCaip2;
  }

  const config = SUPPORTED_CHAINS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID or CAIP-2 identifier: ${chainIdOrCaip2}`);
  }
  return config;
}
