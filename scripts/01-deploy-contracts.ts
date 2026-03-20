#!/usr/bin/env tsx
/**
 * Demo Setup Script 1: Deploy contracts to target network.
 *
 * Usage: HARDHAT_NETWORK=sepolia tsx scripts/01-deploy-contracts.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(import.meta.dirname, "demo-config.json");

console.log("=== Step 1: Deploy Contracts ===\n");

// Run the deploy script
const output = execFileSync(
  "npx",
  ["tsx", "deploy/003_deploy_all.ts"],
  {
    cwd: join(import.meta.dirname, "../packages/nx-core"),
    encoding: "utf-8",
    env: { ...process.env },
  }
);

console.log(output);

// Parse contract addresses from output
const registryMatch = output.match(/IdentityRegistry:\s*(0x[a-fA-F0-9]+)/);
const delegationMatch = output.match(/DelegationRegistry:\s*(0x[a-fA-F0-9]+)/);

if (registryMatch && delegationMatch) {
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  config.contracts.identityRegistry = registryMatch[1];
  config.contracts.delegationRegistry = delegationMatch[1];
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log("\nContract addresses saved to demo-config.json");
} else {
  console.error("Could not parse contract addresses from deploy output.");
  process.exit(1);
}
