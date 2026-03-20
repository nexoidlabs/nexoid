#!/usr/bin/env tsx
/**
 * Demo Setup Script 7: Fund agent addresses with ETH for gas.
 * On Sepolia, use a faucet. On Mainnet, send small amounts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(import.meta.dirname, "demo-config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

async function main() {
  console.log("=== Step 7: Fund Agents with ETH ===\n");

  const { deriveOperator, deriveAgent } = await import("@nexoid/core-client");
  const { createWalletClient, createPublicClient, http, parseEther } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { sepolia, mainnet } = await import("viem/chains");

  const operator = deriveOperator(config.operator.seedPhrase);
  const chain = config.network === "ethereum" ? mainnet : sepolia;
  const account = privateKeyToAccount(operator.privateKey);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });

  const fundAmount = parseEther("0.01"); // 0.01 ETH per agent

  for (const agent of config.agents) {
    const derived = deriveAgent(config.operator.seedPhrase, agent.index);

    const balance = await publicClient.getBalance({ address: derived.address });
    if (balance >= fundAmount) {
      console.log(`${agent.name} (${derived.address}) already funded: ${balance} wei`);
      continue;
    }

    console.log(`Funding ${agent.name} (${derived.address}) with 0.01 ETH...`);
    const txHash = await walletClient.sendTransaction({
      to: derived.address,
      value: fundAmount,
    });
    console.log("  tx:", txHash);
  }

  console.log("\nAll agents funded.");
}

main().catch((e) => { console.error(e); process.exit(1); });
