/**
 * Hardhat deployment script: Full Stack
 *
 * Deploys IdentityRegistry and NexoidModule in sequence.
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

  // 2. Deploy NexoidModule
  console.log("[2/2] Deploying NexoidModule...");
  const NexoidModule = await hre.ethers.getContractFactory("NexoidModule");
  const nexoidModule = await NexoidModule.deploy();
  await nexoidModule.waitForDeployment();
  const nexoidModuleAddress = await nexoidModule.getAddress();
  console.log("      NexoidModule:", nexoidModuleAddress);

  // Summary
  const deploymentManifest = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      IdentityRegistry: registryAddress,
      NexoidModule: nexoidModuleAddress,
    },
  };

  console.log("\n=== DEPLOYMENT MANIFEST ===");
  console.log(JSON.stringify(deploymentManifest, null, 2));

  console.log("\n=== Add to .env ===");
  console.log(`IDENTITY_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`NEXOID_MODULE_ADDRESS=${nexoidModuleAddress}`);

  return deploymentManifest;
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
