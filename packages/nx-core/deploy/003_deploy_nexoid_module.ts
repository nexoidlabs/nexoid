/**
 * Hardhat deployment script: NexoidModule
 *
 * Deploys the NexoidModule contract (operator→agent Safe registry).
 *
 * Usage:
 *   npx tsx deploy/003_deploy_nexoid_module.ts
 *   HARDHAT_NETWORK=sepolia npx tsx deploy/003_deploy_nexoid_module.ts
 */
import hre from "hardhat";

async function main() {
  await hre.run("compile");

  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("=== NexoidModule Deployment ===");
  console.log("Network:       ", network.name, `(chainId: ${network.chainId})`);
  console.log("Deployer:      ", deployer.address);
  console.log(
    "Balance:       ",
    (await hre.ethers.provider.getBalance(deployer.address)).toString(),
    "wei"
  );
  console.log("");

  console.log("[1/1] Deploying NexoidModule...");
  const NexoidModule = await hre.ethers.getContractFactory("NexoidModule");
  const nexoidModule = await NexoidModule.deploy();
  await nexoidModule.waitForDeployment();
  const moduleAddress = await nexoidModule.getAddress();
  console.log("      NexoidModule:", moduleAddress);

  const deploymentManifest = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      NexoidModule: moduleAddress,
    },
  };

  console.log("\n=== DEPLOYMENT MANIFEST ===");
  console.log(JSON.stringify(deploymentManifest, null, 2));

  console.log("\n=== Add to .env ===");
  console.log(`NEXOID_MODULE_ADDRESS=${moduleAddress}`);

  return deploymentManifest;
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
