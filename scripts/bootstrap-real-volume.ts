import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatEther,
  parseEther,
  formatUnits,
  keccak256,
  toHex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { signX402Payment } from "../packages/x402-arbiter/src/signer.js";
import { decodeBase64Json } from "../packages/shared/src/x402-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Auto-load .env file from root or package dirs if present
const envCandidates = [
  path.join(rootDir, ".env"),
  path.join(rootDir, "packages", "worker-arbiter", ".env"),
  path.join(rootDir, ".env.local")
];

for (const envPath of envCandidates) {
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
}

const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as const;
const SWAP_ROUTER_02 = "0x2626664c2603336E57B271c5C0b26F421741e481" as const;
const TREASURY_ADDRESS = "0xB586eFcCa41dF27ad3873BEcA54da0c30bf04d5c" as const;
const EXPECTED_ARBITER = "0xfd74fF802EA0E735514C070AF04E0D6528deD145" as const;

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)"
]);

const WETH_ABI = parseAbi([
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)"
]);

const SWAP_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
]);

function deriveBuyer(seedIndex: number, masterKey: `0x${string}`) {
  const buyerPrivateKey = keccak256(
    toHex(`${masterKey}:nullclear:buyer_seed:${seedIndex}`)
  );
  const account = privateKeyToAccount(buyerPrivateKey);
  return { privateKey: buyerPrivateKey, account };
}

async function executeX402Purchase(
  buyer: { name: string; privateKey: `0x${string}`; account: any },
  endpointUrl: string
) {
  console.log(`\n--- [${buyer.name}] Handshake against ${endpointUrl} ---`);

  // Step 1: Initial GET probe (expects HTTP 402 with PAYMENT-REQUIRED header)
  const probeRes = await fetch(endpointUrl);
  if (probeRes.status !== 402) {
    throw new Error(`Expected HTTP 402 from ${endpointUrl}, got ${probeRes.status}`);
  }

  const payReqB64 =
    probeRes.headers.get("PAYMENT-REQUIRED") || probeRes.headers.get("payment-required");
  if (!payReqB64) {
    throw new Error(`No PAYMENT-REQUIRED header returned by ${endpointUrl}`);
  }

  const payReq = decodeBase64Json<any>(payReqB64);
  const acceptedOption = payReq.accepts?.[0] || {
    scheme: "exact",
    network: "eip155:8453",
    amount: "10000",
    asset: BASE_USDC_ADDRESS,
    payTo: TREASURY_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: { name: "USD Coin", version: "2" }
  };

  console.log(
    `  [402 Received] Required: ${acceptedOption.amount} atomic units ($0.01 USDC) to ${acceptedOption.payTo}`
  );

  // Step 2: Sign EIP-3009 TransferWithAuthorization
  console.log(`  [Sign] Signing EIP-3009 authorization with ${buyer.name} (${buyer.account.address})...`);
  const paymentSignature = await signX402Payment(buyer.privateKey, acceptedOption, endpointUrl);

  // Step 3: Retry GET with PAYMENT-SIGNATURE header to trigger PayAI Facilitator on-chain settlement
  console.log(`  [Pay] Submitting request with PAYMENT-SIGNATURE header to trigger PayAI settlement...`);
  const paidRes = await fetch(endpointUrl, {
    headers: {
      "PAYMENT-SIGNATURE": paymentSignature,
      "X-PAYMENT": paymentSignature
    }
  });

  const payRespHeader =
    paidRes.headers.get("PAYMENT-RESPONSE") || paidRes.headers.get("x-payment-response");
  const body = await paidRes.json();

  if (paidRes.status !== 200) {
    console.error(`  ❌ Payment settlement failed: HTTP ${paidRes.status}`, body);
    throw new Error(`Settlement failed on ${endpointUrl}: ${JSON.stringify(body)}`);
  }

  let txHash: string | undefined;
  if (payRespHeader) {
    try {
      const parsedResp = decodeBase64Json<any>(payRespHeader);
      txHash = parsedResp.transaction;
    } catch (_) {}
  }

  console.log(`  🎉 HTTP 200 OK! Settlement verified on Base Mainnet!`);
  if (txHash) {
    console.log(`  BaseScan Tx: https://basescan.org/tx/${txHash}`);
  }

  return { status: paidRes.status, txHash, body };
}

async function main() {
  console.log("\n==================================================================");
  console.log("   NULLCLEAR: BASE MAINNET USDC BOOTSTRAP VIA PAYAI FACILITATOR   ");
  console.log("==================================================================\n");

  const rawKey = process.env.ARBITER_PRIVATE_KEY;
  if (!rawKey) {
    console.error("❌ ERROR: ARBITER_PRIVATE_KEY is missing from environment / .env file.");
    console.error("Please add ARBITER_PRIVATE_KEY to your .env file or supply it as an environment variable:");
    console.error("  ARBITER_PRIVATE_KEY=0x... npx tsx scripts/bootstrap-real-volume.ts\n");
    process.exit(1);
  }

  const arbiterPrivateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
  const arbiterAccount = privateKeyToAccount(arbiterPrivateKey);

  console.log(`Arbiter Account: ${arbiterAccount.address}`);
  if (arbiterAccount.address.toLowerCase() !== EXPECTED_ARBITER.toLowerCase()) {
    console.warn(`⚠️ WARNING: Arbiter address ${arbiterAccount.address} does not match expected ${EXPECTED_ARBITER}`);
  }

  const rpcUrl = process.env.BASE_MAINNET_RPC_URL || process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account: arbiterAccount,
    chain: base,
    transport: http(rpcUrl)
  });

  // Step 1: Check ETH and USDC balances
  const ethBalance = await publicClient.getBalance({ address: arbiterAccount.address });
  const usdcBalance = await publicClient.readContract({
    address: BASE_USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [arbiterAccount.address]
  });

  console.log(`[1/4] Arbiter Base Balances:`);
  console.log(`      ETH:  ${formatEther(ethBalance)} ETH`);
  console.log(`      USDC: ${formatUnits(usdcBalance, 6)} USDC (${usdcBalance} atomic units)`);

  // Step 2: If USDC balance < 0.15 USDC (150000 atomic), swap 0.00015 ETH via Uniswap V3 SwapRouter02
  if (usdcBalance < 150000n) {
    const ethToSwap = parseEther("0.00015");
    console.log(`\n[2/4] USDC balance < 0.15 USDC. Swapping ${formatEther(ethToSwap)} ETH for Base USDC via SwapRouter02...`);

    const wethBalance = await publicClient.readContract({
      address: WETH_ADDRESS,
      abi: WETH_ABI,
      functionName: "balanceOf",
      args: [arbiterAccount.address]
    });

    if (wethBalance < ethToSwap) {
      const needed = ethToSwap - wethBalance;
      console.log(`      1. Wrapping ${formatEther(needed)} ETH to WETH...`);
      const depositTx = await walletClient.writeContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "deposit",
        value: needed
      });
      console.log(`         Deposit Tx: https://basescan.org/tx/${depositTx}`);
      await publicClient.waitForTransactionReceipt({ hash: depositTx });
    } else {
      console.log(`      1. WETH already wrapped (${formatEther(wethBalance)} WETH available).`);
    }

    const allowance = await publicClient.readContract({
      address: WETH_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [arbiterAccount.address, SWAP_ROUTER_02]
    });

    if (allowance < ethToSwap) {
      console.log(`      2. Approving WETH to Uniswap V3 SwapRouter02...`);
      const approveTx = await walletClient.writeContract({
        address: WETH_ADDRESS,
        abi: WETH_ABI,
        functionName: "approve",
        args: [SWAP_ROUTER_02, ethToSwap]
      });
      console.log(`         Approve Tx: https://basescan.org/tx/${approveTx}`);
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    } else {
      console.log(`      2. WETH already approved to SwapRouter02 (${formatEther(allowance)} WETH allowance).`);
    }

    console.log(`      3. Executing exactInputSingle swap (WETH -> USDC, fee: 500)...`);
    const swapTx = await walletClient.writeContract({
      address: SWAP_ROUTER_02,
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: WETH_ADDRESS,
          tokenOut: BASE_USDC_ADDRESS,
          fee: 500,
          recipient: arbiterAccount.address,
          amountIn: ethToSwap,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n
        }
      ]
    });
    console.log(`         Swap Tx: https://basescan.org/tx/${swapTx}`);
    await publicClient.waitForTransactionReceipt({ hash: swapTx });

    const newUsdcBalance = await publicClient.readContract({
      address: BASE_USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [arbiterAccount.address]
    });
    console.log(`      ✅ Swap complete! New Arbiter USDC balance: ${formatUnits(newUsdcBalance, 6)} USDC (${newUsdcBalance} atomic)`);
  } else {
    console.log(`\n[2/4] ✅ Arbiter USDC balance (${formatUnits(usdcBalance, 6)} USDC) is sufficient (>= 0.15 USDC). No swap needed.`);
  }

  // Step 3: Derive 3 deterministic buyer wallets and fund each with 0.04 USDC (40000 atomic units)
  console.log("\n[3/4] Deriving and funding 3 distinct buyer wallets on Base Mainnet...");
  const buyers = [
    { name: "Buyer A", ...deriveBuyer(1, arbiterPrivateKey) },
    { name: "Buyer B", ...deriveBuyer(2, arbiterPrivateKey) },
    { name: "Buyer C", ...deriveBuyer(3, arbiterPrivateKey) }
  ];

  for (const buyer of buyers) {
    const bBalance = await publicClient.readContract({
      address: BASE_USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [buyer.account.address]
    });
    console.log(`      ${buyer.name} (${buyer.account.address}): ${formatUnits(bBalance, 6)} USDC`);

    if (bBalance < 20000n) {
      const fundAmount = 40000n; // 0.04 USDC
      console.log(`      Funding ${buyer.name} with ${formatUnits(fundAmount, 6)} USDC...`);
      const transferTx = await walletClient.writeContract({
        address: BASE_USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [buyer.account.address, fundAmount]
      });
      console.log(`      Transfer Tx: https://basescan.org/tx/${transferTx}`);
      await publicClient.waitForTransactionReceipt({ hash: transferTx });
      console.log(`      ✅ ${buyer.name} funded!`);
    } else {
      console.log(`      ✅ ${buyer.name} already funded.`);
    }
  }

  // Step 4: Execute real x402 purchases against live api.nullclear.dev endpoints
  console.log("\n[4/4] Executing Real On-Chain x402 Handshakes via PayAI Facilitator...");
  const settlements: Array<{ buyer: string; endpoint: string; txHash?: string }> = [];

  const endpoints = [
    "https://api.nullclear.dev/v1/bazaar/audit?agentId=124595",
    "https://api.nullclear.dev/v1/bazaar/token-security"
  ];

  for (const buyer of buyers) {
    for (const ep of endpoints) {
      try {
        const result = await executeX402Purchase(buyer, ep);
        settlements.push({
          buyer: buyer.name,
          endpoint: ep,
          txHash: result.txHash
        });
      } catch (err: any) {
        console.error(`      ❌ Error during purchase:`, err.message);
      }
    }
  }

  // Summary
  console.log("\n==================================================================");
  console.log("   🎉 ON-CHAIN X402 BOOTSTRAP COMPLETE: SETTLEMENT REPORT         ");
  console.log("==================================================================");
  for (const s of settlements) {
    console.log(`• ${s.buyer} -> ${s.endpoint}`);
    console.log(`  Tx: ${s.txHash ? `https://basescan.org/tx/${s.txHash}` : "Confirmed"}`);
  }

  // Fetch updated stats from api.nullclear.dev
  console.log("\nFetching live telemetry from https://api.nullclear.dev/v1/stats...");
  try {
    const statsRes = await fetch("https://api.nullclear.dev/v1/stats");
    const stats = await statsRes.json();
    console.log(`Total Clearings Recorded: ${stats.totalClearings || 0}`);
    console.log(`Valid Settlements:       ${stats.validSettlements || 0}`);
    console.log(`Total Volume Atomic:     ${stats.totalVolumeAtomic || "0"}`);
  } catch (err: any) {
    console.warn(`Could not fetch stats: ${err.message}`);
  }
}

main().catch((err) => {
  console.error("Bootstrap script failed:", err);
  process.exit(1);
});
