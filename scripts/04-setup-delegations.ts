#!/usr/bin/env tsx
/**
 * Demo Setup Script 4: Create delegations from operator to agents.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(import.meta.dirname, "demo-config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

async function main() {
  console.log("=== Step 4: Setup Delegations ===\n");

  const { NexoidClient } = await import("@nexoid/core-client");
  const { deriveOperator, deriveAgent } = await import("@nexoid/core-client");
  const { addressToDID } = await import("@nexoid/nx-core");

  const operator = deriveOperator(config.operator.seedPhrase);

  const client = new NexoidClient({
    rpcUrl: config.rpcUrl,
    registryAddress: config.contracts.identityRegistry,
    delegationRegistryAddress: config.contracts.delegationRegistry,
    privateKey: operator.privateKey,
  });

  for (const agent of config.agents) {
    const derived = deriveAgent(config.operator.seedPhrase, agent.index);
    const agentDid = addressToDID(derived.address);

    console.log(`Delegating to ${agent.name} (${agentDid})...`);

    const result = await client.delegate({
      agentDid,
      scope: {
        budgetLimit: {
          amount: agent.allowance,
          currency: "USDT",
          period: "monthly",
        },
        maxTransactionAmount: {
          amount: String(Math.floor(Number(agent.allowance) / 2)),
          currency: "USDT",
        },
        allowedTools: [],
        delegationDepth: 1,
      },
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    });

    console.log("  Delegation ID:", result.delegationId);
    console.log("  tx:", result.txHash);
    console.log();
  }

  console.log("All delegations created.");
}

main().catch((e) => { console.error(e); process.exit(1); });
