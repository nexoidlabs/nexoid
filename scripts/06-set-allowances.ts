#!/usr/bin/env tsx
/**
 * Demo Setup Script 6: Set USDT allowances for agents on the Safe.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(import.meta.dirname, "demo-config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

async function main() {
  console.log("=== Step 6: Set Allowances ===\n");

  const { NexoidClient } = await import("@nexoid/core-client");
  const { deriveOperator, deriveAgent } = await import("@nexoid/core-client");
  const { addressToDID } = await import("@nexoid/nx-core");

  const operator = deriveOperator(config.operator.seedPhrase);
  const safeAddress = config.operator.safeAddress as `0x${string}`;

  if (!safeAddress || safeAddress === "REPLACE_AFTER_DEPLOYMENT") {
    console.error("Safe address not set. Run 05-deploy-safe.ts first.");
    process.exit(1);
  }

  const client = new NexoidClient({
    rpcUrl: config.rpcUrl,
    registryAddress: config.contracts.identityRegistry,
    delegationRegistryAddress: config.contracts.delegationRegistry,
    privateKey: operator.privateKey,
  });

  for (const agent of config.agents) {
    const derived = deriveAgent(config.operator.seedPhrase, agent.index);
    const agentDid = addressToDID(derived.address);

    console.log(`Setting allowance for ${agent.name}: ${agent.allowance} USDT...`);

    const txHash = await client.setAllowance(
      { agentDid, amount: agent.allowance },
      safeAddress,
      agent.resetMinutes
    );

    console.log("  tx:", txHash);
    console.log();
  }

  console.log("All allowances set.");
}

main().catch((e) => { console.error(e); process.exit(1); });
