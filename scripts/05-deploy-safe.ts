#!/usr/bin/env tsx
/**
 * Demo Setup Script 5: Deploy Safe wallet for the operator.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(import.meta.dirname, "demo-config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

async function main() {
  console.log("=== Step 5: Deploy Safe Wallet ===\n");

  const { NexoidClient } = await import("@nexoid/core-client");
  const { deriveOperator } = await import("@nexoid/core-client");

  const operator = deriveOperator(config.operator.seedPhrase);
  console.log("Operator address:", operator.address);

  const client = new NexoidClient({
    rpcUrl: config.rpcUrl,
    registryAddress: config.contracts.identityRegistry,
    delegationRegistryAddress: config.contracts.delegationRegistry,
    privateKey: operator.privateKey,
  });

  console.log("Deploying Safe (1-of-1) + enabling AllowanceModule...");
  const result = await client.deploySafe();

  console.log("  Safe address:", result.safeAddress);
  console.log("  tx:", result.txHash);
  console.log("  AllowanceModule enabled:", result.moduleEnabled);

  // Save to config
  config.operator.safeAddress = result.safeAddress;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log("\nSafe address saved to demo-config.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
