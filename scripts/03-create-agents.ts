#!/usr/bin/env tsx
/**
 * Demo Setup Script 3: Create agent identities using WDK-derived keys.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(import.meta.dirname, "demo-config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

async function main() {
  console.log("=== Step 3: Create Agents ===\n");

  const { NexoidClient } = await import("@nexoid/core-client");
  const { deriveOperator, deriveAgent } = await import("@nexoid/core-client");
  const { EntityType } = await import("@nexoid/core-client");

  const operator = deriveOperator(config.operator.seedPhrase);

  const client = new NexoidClient({
    rpcUrl: config.rpcUrl,
    registryAddress: config.contracts.identityRegistry,
    delegationRegistryAddress: config.contracts.delegationRegistry,
    privateKey: operator.privateKey,
  });

  for (const agent of config.agents) {
    const derived = deriveAgent(config.operator.seedPhrase, agent.index);
    console.log(`Creating ${agent.name} (index ${agent.index})...`);
    console.log("  Address:", derived.address);

    const result = await client.createAgent({
      entityType: EntityType.VirtualAgent,
      label: agent.name,
      seedPhrase: config.operator.seedPhrase,
      agentIndex: agent.index,
    });

    console.log("  DID:", result.did);
    console.log("  tx:", result.txHash);
    console.log();
  }

  console.log("All agents created.");
}

main().catch((e) => { console.error(e); process.exit(1); });
