/**
 * Hardhat deployment script: Full Stack
 *
 * Deploys both IdentityRegistry and DelegationRegistry in sequence,
 * wiring the delegation registry to the identity registry automatically.
 *
 * Usage:
 *   npx tsx deploy/003_deploy_all.ts
 *   HARDHAT_NETWORK=sepolia npx tsx deploy/003_deploy_all.ts
 *   HARDHAT_NETWORK=ethereum npx tsx deploy/003_deploy_all.ts
 */
import hre from "hardhat";

async function main() {
  await hre.run("compile");

  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("=== Nexoid Full Stack Deployment ===");
  console.log("Network:       ", network.name, `(chainId: ${network.chainId})`);
  console.log("Deployer:      ", deployer.address);
  console.log(
    "Balance:       ",
    (await hre.ethers.provider.getBalance(deployer.address)).toString(),
    "wei"
  );
  console.log("");

  // 1. Deploy IdentityRegistry
  console.log("[1/2] Deploying IdentityRegistry...");
  const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
  const registry = await IdentityRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("      IdentityRegistry:", registryAddress);

  // 2. Deploy DelegationRegistry (linked to registry)
  console.log("[2/2] Deploying DelegationRegistry...");
  const DelegationRegistry = await hre.ethers.getContractFactory("DelegationRegistry");
  const delegation = await DelegationRegistry.deploy(registryAddress);
  await delegation.waitForDeployment();
  const delegationAddress = await delegation.getAddress();
  console.log("      DelegationRegistry:", delegationAddress);

  // Summary
  const deploymentManifest = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      IdentityRegistry: registryAddress,
      DelegationRegistry: delegationAddress,
    },
  };

  console.log("\n=== DEPLOYMENT MANIFEST ===");
  console.log(JSON.stringify(deploymentManifest, null, 2));

  console.log("\n=== Add to .env ===");
  console.log(`IDENTITY_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`DELEGATION_REGISTRY_ADDRESS=${delegationAddress}`);

  return deploymentManifest;
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
