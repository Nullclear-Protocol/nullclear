import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ERC8004_IDENTITY_ABI,
  ERC8004_REPUTATION_ABI,
  getChainConfig
} from "@nullclear/shared";
import type { IArbiterStore } from "../env.js";
import { DEFAULT_ARBITER_KEY } from "./attestation.js";

export interface TrustScoreMetrics {
  totalClearedTx: number;
  totalFailedValidations: number;
  uniqueCounterparties: number;
  maxSingleBuyerShare: number;
  identityVerified: boolean;
  onChainReputationCount: number;
  hasActiveKya: boolean;
}

export interface TrustScoreResult {
  agentId: string;
  chainId: number;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  sybilFlags: string[];
  metrics: TrustScoreMetrics;
  timestamp: number;
  arbiterSignature: `0x${string}`;
  arbiterAddress: `0x${string}`;
}

export async function computeTrustScore(
  agentId: string,
  chainId: number,
  store: IArbiterStore,
  options?: {
    arbiterPrivateKey?: string;
    rpcUrl?: string;
  }
): Promise<TrustScoreResult> {
  const chainConfig = getChainConfig(chainId);
  const rpcUrl = options?.rpcUrl || chainConfig.rpcUrl;

  // 1. On-Chain Identity & Reputation read (with graceful RPC fallback)
  let identityVerified = false;
  let onChainReputationCount = 0;

  try {
    const publicClient = createPublicClient({
      transport: http(rpcUrl, { timeout: 2000 })
    });

    const isNumericId = /^\d+$/.test(agentId);
    if (isNumericId) {
      const tokenId = BigInt(agentId);
      try {
        const owner = await publicClient.readContract({
          address: chainConfig.erc8004Identity,
          abi: ERC8004_IDENTITY_ABI,
          functionName: "ownerOf",
          args: [tokenId]
        });
        if (owner && owner !== "0x0000000000000000000000000000000000000000") {
          identityVerified = true;
        }
      } catch {
        // Not minted or RPC error
      }

      try {
        const summary = (await publicClient.readContract({
          address: chainConfig.erc8004Reputation,
          abi: ERC8004_REPUTATION_ABI,
          functionName: "getSummary",
          args: [tokenId, [], "", ""]
        })) as [bigint, bigint, number];
        if (summary) {
          onChainReputationCount = Number(summary[0]);
        }
      } catch {
        // No reputation summary
      }
    }
  } catch {
    // RPC offline in dev/test, fallback cleanly
  }

  // 1b. Fallback to store registration if on-chain check timed out or offline
  if (!identityVerified) {
    try {
      const storedAgent = await store.getAgent(agentId, chainId);
      if (storedAgent && storedAgent.ownerAddress) {
        identityVerified = true;
      }
    } catch {
      // Ignore
    }
  }

  // 2. Fetch local store metrics
  const stats = await store.getAgentStats(agentId);
  const edges = await store.getCounterpartyEdges(agentId);

  const totalCleared = stats.totalClearedTx;
  const totalFailed = stats.totalFailedValidations;
  const uniqueCounterparties = edges.length;

  let totalEdgeTx = 0;
  let maxEdgeTx = 0;
  for (const edge of edges) {
    totalEdgeTx += edge.txCount;
    if (edge.txCount > maxEdgeTx) {
      maxEdgeTx = edge.txCount;
    }
  }
  const maxSingleBuyerShare = totalEdgeTx > 0 ? maxEdgeTx / totalEdgeTx : 0;

  // 3. Check active corporate KYA Mandate
  const kya = await store.getKyaMandate(agentId, chainId);
  const now = Math.floor(Date.now() / 1000);
  const hasActiveKya = Boolean(kya && kya.validUntil > now);

  // 4. Compute composite score (0 - 100)
  // Identity component: 25 points if on-chain verified, or 15 baseline for active endpoints
  const identityPoints = identityVerified ? 25 : 15;

  // Validation reliability: 40 * (passed / (passed + failed * 3))
  let reliabilityPoints: number;
  if (totalCleared === 0 && totalFailed === 0) {
    reliabilityPoints = 35; // clean baseline for fresh endpoints (15 identity + 35 = 50)
  } else {
    const denom = Math.max(1, totalCleared + totalFailed * 3);
    reliabilityPoints = Math.round(40 * (totalCleared / denom));
  }

  // Sybil & Wash-Trade Penalty
  const sybilFlags: string[] = [];
  let washPenalty = 0;

  if (totalCleared >= 3 && maxSingleBuyerShare > 0.6) {
    washPenalty = 25;
    sybilFlags.push("HIGH_COUNTERPARTY_CONCENTRATION_WASH_RISK");
  }

  // Counterparty diversity & volume track record (up to 23 points for clean composite scores up to 100)
  let diversityBonus = 0;
  if (totalCleared > 0 && uniqueCounterparties > 1 && maxSingleBuyerShare <= 0.6) {
    const counterpartyPoints = Math.min(15, uniqueCounterparties * 3);
    const volumePoints = Math.min(8, Math.floor(totalCleared / 3));
    diversityBonus = counterpartyPoints + volumePoints;
  }

  // KYA Mandate bonus
  const kyaBonus = hasActiveKya ? 10 : 0;

  // Calculate final score
  const rawScore = identityPoints + reliabilityPoints + diversityBonus + kyaBonus - washPenalty;
  const score = Math.max(0, Math.min(100, rawScore));

  // Determine letter grade
  let grade: "A" | "B" | "C" | "D" | "F";
  if (score >= 85) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 50) grade = "C";
  else if (score >= 35) grade = "D";
  else grade = "F";

  // 5. Sign the calculated score
  const privateKey = (options?.arbiterPrivateKey && options.arbiterPrivateKey.startsWith("0x")
    ? options.arbiterPrivateKey
    : DEFAULT_ARBITER_KEY) as `0x${string}`;

  const account = privateKeyToAccount(privateKey);
  const timestamp = Math.floor(Date.now() / 1000);

  const payloadToSign = `NULLCLEAR_SCORE:${agentId}:${chainId}:${score}:${timestamp}:${sybilFlags.join(",")}`;
  const arbiterSignature = await account.signMessage({ message: payloadToSign });

  return {
    agentId,
    chainId,
    score,
    grade,
    sybilFlags,
    metrics: {
      totalClearedTx: totalCleared,
      totalFailedValidations: totalFailed,
      uniqueCounterparties,
      maxSingleBuyerShare,
      identityVerified,
      onChainReputationCount,
      hasActiveKya
    },
    timestamp,
    arbiterSignature,
    arbiterAddress: account.address
  };
}
