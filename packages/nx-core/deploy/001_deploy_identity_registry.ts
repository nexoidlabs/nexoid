/**
 * Hardhat deployment script: IdentityRegistry
 *
 * Deploys the core identity registry contract that supports four entity types
 * (Human, VirtualAgent, PhysicalAgent, Organization) with status lifecycle management.
 *
 * Usage:
 *   npx tsx deploy/001_deploy_identity_registry.ts                          # local hardhat
 *   HARDHAT_NETWORK=sepolia npx tsx deploy/001_deploy_identity_registry.ts
 *   HARDHAT_NETWORK=ethereum npx tsx deploy/001_deploy_identity_registry.ts
 */
import hre from "hardhat";

async function main() {
  await hre.run("compile");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying IdentityRegistry with account:", deployer.address);
  console.log(
    "Account balance:",
    (await hre.ethers.provider.getBalance(deployer.address)).toString()
  );

  const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");

  const registry = await IdentityRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("IdentityRegistry deployed to:", address);

  const network = await hre.ethers.provider.getNetwork();
  const deploymentInfo = {
    contract: "IdentityRegistry",
    address,
    deployer: deployer.address,
    network: network.name,
    chainId: Number(network.chainId),
    timestamp: new Date().toISOString(),
  };
  console.log("\n--- DEPLOYMENT INFO ---");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
