#!/usr/bin/env tsx
/**
 * Agent Demo Scenario — scripted flow for the hackathon demo video.
 *
 * Steps:
 * 1. Agent confirms identity (whoami)
 * 2. Agent validates delegation
 * 3. Agent checks allowance
 * 4. Agent sends USDT to recipient
 * 5. Agent attempts to exceed allowance → revert
 * 6. Agent requests additional funds
 * 7. (Operator approves on dashboard — manual step)
 * 8. Agent sends larger amount
 * 9. Agent generates identity proof
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(import.meta.dirname, "../scripts/demo-config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

// Demo recipient — just another derived address
const DEMO_RECIPIENT = "0x000000000000000000000000000000000000dead" as `0x${string}`;

function step(n: number, title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Step ${n}: ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

function pause(msg = "Press Enter to continue...") {
  return new Promise<void>((resolve) => {
    process.stdout.write(`\n> ${msg}\n`);
    process.stdin.once("data", () => resolve());
  });
}

async function main() {
  const { NexoidClient, deriveAgent, deriveOperator, serializeProof } = await import("@nexoid/core-client");
  const { addressToDID } = await import("@nexoid/nx-core");

  // Use Agent Alpha (index 1) for the demo
  const agentIndex = 1;
  const agent = deriveAgent(config.operator.seedPhrase, agentIndex);
  const agentDid = addressToDID(agent.address);
  const operatorSafeAddress = config.operator.safeAddress as `0x${string}`;
  // Agent's own Safe (new architecture)
  const agentSafeAddress = (config.agents[0]?.safeAddress ?? operatorSafeAddress) as `0x${string}`;

  const client = new NexoidClient({
    rpcUrl: config.rpcUrl,
    registryAddress: config.contracts.identityRegistry,
    nexoidModuleAddress: config.contracts.nexoidModule,
    privateKey: agent.privateKey,
  });

  console.log("Nexoid Agent Demo Scenario");
  console.log("Agent:", agentDid);
  console.log("Operator Safe:", operatorSafeAddress);
  console.log("Agent Safe:", agentSafeAddress);

  // Step 1: Confirm identity
  step(1, "Agent confirms identity");
  const identity = await client.resolveIdentity(agentDid);
  console.log("DID:", identity.did);
  console.log("Type:", identity.entityType);
  console.log("Status:", identity.status);
  console.log("Owner:", identity.ownerDid ?? identity.owner);
  await pause();

  // Step 2: Validate agent
  step(2, "Agent validates registration");
  const validation = await client.isValidAgent(agentSafeAddress);
  console.log("Valid:", validation.valid);
  await pause();

  // Step 3: Check allowance (on agent's own Safe)
  step(3, "Agent checks USDT allowance on own Safe");
  const allowance = await client.getAllowance(agentDid, agentSafeAddress);
  console.log("Remaining allowance:", allowance, "USDT");
  await pause();

  // Step 4: Send USDT within limits (from agent's own Safe)
  step(4, "Agent sends 10 USDT from own Safe");
  try {
    const result = await client.sendUSDT(
      { to: DEMO_RECIPIENT, amount: "10" },
      agentSafeAddress,
      "agent"
    );
    console.log("tx:", result.txHash);
    console.log("Amount:", result.amount, "USDT");
    console.log("To:", result.to);
  } catch (e) {
    console.log("Transfer result:", (e as Error).message);
  }
  await pause();

  // Step 5: Attempt to exceed allowance
  step(5, "Agent attempts to exceed allowance");
  try {
    await client.sendUSDT(
      { to: DEMO_RECIPIENT, amount: "99999" },
      agentSafeAddress,
      "agent"
    );
    console.log("ERROR: Should have reverted!");
  } catch (e) {
    console.log("Correctly reverted:", (e as Error).message.slice(0, 100));
  }
  await pause();

  // Step 6: Request additional funds
  step(6, "Agent requests additional funds");
  console.log("Writing fund request to ~/.nexoid/pending-requests.json...");
  const { writeFileSync, existsSync, mkdirSync } = await import("node:fs");
  const { homedir } = await import("node:os");
  const requestsDir = join(homedir(), ".nexoid");
  if (!existsSync(requestsDir)) mkdirSync(requestsDir, { recursive: true });
  const requestsPath = join(requestsDir, "pending-requests.json");
  const requests = existsSync(requestsPath) ? JSON.parse(readFileSync(requestsPath, "utf-8")) : [];
  requests.push({
    id: crypto.randomUUID(),
    agentDid,
    requestedAmount: "500",
    reason: "Need additional funds for API subscription payment",
    timestamp: Date.now(),
    status: "pending",
  });
  writeFileSync(requestsPath, JSON.stringify(requests, null, 2) + "\n");
  console.log("Request submitted: 500 USDT");
  console.log("Check the Nexoid dashboard at http://localhost:3100/approvals to approve.");
  await pause("Approve the request on the dashboard, then press Enter...");

  // Step 7: (Manual approval on dashboard)

  // Step 8: After approval, verify increased allowance
  step(8, "Agent checks updated allowance after approval");
  const newAllowance = await client.getAllowance(agentDid, agentSafeAddress);
  console.log("Updated allowance:", newAllowance, "USDT");
  await pause();

  // Step 9: Generate identity proof
  step(9, "Agent generates EIP-712 identity proof");
  const proof = await client.generateIdentityProof(
    0n, // delegationId (zero — scope set during agent registration)
    DEMO_RECIPIENT // verifier
  );
  console.log("Proof generated:");
  console.log(serializeProof(proof));
  console.log("\nVerify at: http://localhost:3200/verify");

  console.log("\n=== Demo Complete ===");
  process.exit(0);
}

// Enable stdin for pause prompts
process.stdin.setEncoding("utf-8");
process.stdin.resume();

main().catch((e) => { console.error(e); process.exit(1); });
