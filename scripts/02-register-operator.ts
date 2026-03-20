#!/usr/bin/env tsx
/**
 * Demo Setup Script 2: Register operator identity.
 * The deployer is also the admin/registrar, so they register themselves.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(import.meta.dirname, "demo-config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

async function main() {
  console.log("=== Step 2: Register Operator ===\n");

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

  // Set self as registrar (deployer = admin)
  console.log("Setting operator as registrar...");
  const tx1 = await client.setRegistrar(operator.address, true);
  console.log("  tx:", tx1);

  // Register operator identity
  console.log("Registering operator identity...");
  const tx2 = await client.registerIdentityFor(
    operator.address,
    0, // EntityType.Human
    "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`
  );
  console.log("  tx:", tx2);

  console.log("\nOperator registered. DID: did:nexoid:eth:" + operator.address.toLowerCase());
}

main().catch((e) => { console.error(e); process.exit(1); });
