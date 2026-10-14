import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseAbi,
  parseEventLogs
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Auto-load .env file if present
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const EXPECTED_ARBITER_ADDRESS = "0xfd74fF802EA0E735514C070AF04E0D6528deD145";
const ERC8004_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
const AGENT_URI = "https://nullclear.dev/.well-known/agent.json";

const ERC8004_ABI = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
]);

async function main() {
  console.log("\n============================================================");
  console.log("   NULLCLEAR PROTOCOL: BASE MAINNET ERC-8004 REGISTRATION    ");
  console.log("============================================================\n");

  const rawKey = process.env.ARBITER_PRIVATE_KEY;
  if (!rawKey) {
    console.error("❌ ERROR: ARBITER_PRIVATE_KEY is missing from environment variables.");
    console.error("Please supply it via environment variable or in a .env file:\n");
    console.error("  ARBITER_PRIVATE_KEY=0x... pnpm register:erc8004\n");
    process.exit(1);
  }

  const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  console.log(`Checking Arbiter Signer Address: ${account.address}`);
  if (account.address.toLowerCase() !== EXPECTED_ARBITER_ADDRESS.toLowerCase()) {
    console.error(`❌ Address Mismatch!`);
    console.error(`  Expected: ${EXPECTED_ARBITER_ADDRESS}`);
    console.error(`  Derived:  ${account.address}`);
    console.error(`The provided private key does not correspond to the official NullClear Arbiter address.`);
    process.exit(1);
  }
  console.log(`✔ Verified Hot Wallet Key matches official Arbiter: ${EXPECTED_ARBITER_ADDRESS}`);

  const rpcUrl = process.env.BASE_MAINNET_RPC_URL || process.env.BASE_RPC_URL || "https://mainnet.base.org";
  console.log(`Connecting to Base Mainnet (Chain ID 8453) via RPC: ${rpcUrl}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl)
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl)
  });

  const balance = await publicClient.getBalance({ address: account.address });
  const balanceEth = formatEther(balance);
  console.log(`Arbiter ETH Balance: ${balanceEth} ETH`);

  if (balance === 0n) {
    console.error(`\n❌ INSUFFICIENT GAS: Arbiter wallet ${account.address} has 0 ETH on Base Mainnet.`);
    console.error(`Please fund this address with a small amount of Base ETH (~$0.50 / 0.0002 ETH) to execute on-chain ERC-8004 registration.`);
    console.error(`Base Mainnet Explorer: https://basescan.org/address/${account.address}\n`);
    process.exit(1);
  }

  console.log(`\nCalling register("${AGENT_URI}") on ERC-8004 Identity Registry (${ERC8004_IDENTITY_REGISTRY})...`);
  const hash = await walletClient.writeContract({
    address: ERC8004_IDENTITY_REGISTRY,
    abi: ERC8004_ABI,
    functionName: "register",
    args: [AGENT_URI]
  });

  console.log(`Transaction Broadcast: ${hash}`);
  console.log(`BaseScan URL: https://basescan.org/tx/${hash}`);
  console.log(`Waiting for confirmation on Base Mainnet...`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`✔ Transaction confirmed in block #${receipt.blockNumber}! Status: ${receipt.status}`);

  if (receipt.status !== "success") {
    console.error(`❌ Transaction reverted on-chain.`);
    process.exit(1);
  }

  // Parse Registered event or Transfer event to get minted agentId
  let mintedAgentId: string | null = null;
  const parsedLogs = parseEventLogs({
    abi: ERC8004_ABI,
    logs: receipt.logs
  });

  for (const log of parsedLogs) {
    if (log.eventName === "Registered") {
      mintedAgentId = log.args.agentId.toString();
      break;
    }
  }

  if (!mintedAgentId) {
    for (const log of parsedLogs) {
      if (log.eventName === "Transfer" && log.args.tokenId !== undefined) {
        mintedAgentId = log.args.tokenId.toString();
        break;
      }
    }
  }

  if (!mintedAgentId && receipt.logs.length > 0) {
    // Fallback: check topics
    const lastLog = receipt.logs[receipt.logs.length - 1];
    if (lastLog.topics && lastLog.topics.length >= 2) {
      const hexId = lastLog.topics[1] ?? lastLog.topics[3];
      if (hexId) {
        mintedAgentId = BigInt(hexId).toString();
      }
    }
  }

  if (!mintedAgentId) {
    console.warn("⚠️ Could not automatically parse agentId from event logs. Please check the transaction on BaseScan.");
  } else {
    console.log(`\n🎉 ERC-8004 AGENT REGISTERED SUCCESSFULLY!`);
    console.log(`  Agent ID: ${mintedAgentId}`);
    console.log(`  Profile URL: https://8004scan.io/agents/8453/${mintedAgentId}`);

    // Update wrangler.toml
    const wranglerPath = path.join(rootDir, "packages", "worker-arbiter", "wrangler.toml");
    if (fs.existsSync(wranglerPath)) {
      let tomlContent = fs.readFileSync(wranglerPath, "utf-8");
      if (tomlContent.includes('ERC8004_AGENT_ID = "pending"')) {
        tomlContent = tomlContent.replace(
          'ERC8004_AGENT_ID = "pending"',
          `ERC8004_AGENT_ID = "${mintedAgentId}"`
        );
        fs.writeFileSync(wranglerPath, tomlContent, "utf-8");
        console.log(`✔ Updated ERC8004_AGENT_ID = "${mintedAgentId}" in packages/worker-arbiter/wrangler.toml`);
      } else if (tomlContent.includes("ERC8004_AGENT_ID = ")) {
        tomlContent = tomlContent.replace(
          /ERC8004_AGENT_ID = "[^"]*"/,
          `ERC8004_AGENT_ID = "${mintedAgentId}"`
        );
        fs.writeFileSync(wranglerPath, tomlContent, "utf-8");
        console.log(`✔ Updated ERC8004_AGENT_ID = "${mintedAgentId}" in packages/worker-arbiter/wrangler.toml`);
      }
    }
  }

  console.log("\n============================================================");
  console.log("               REGISTRATION COMPLETE                        ");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("Fatal Registration Error:", err);
  process.exit(1);
});
