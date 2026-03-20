/**
 * Hardhat deployment script: DelegationRegistry
 *
 * Deploys the scoped delegation contract with chain-breaking revocation.
 * Pass IDENTITY_REGISTRY_ADDRESS env var to link to an existing registry,
 * otherwise deploys a fresh IdentityRegistry first.
 *
 * Usage:
 *   npx tsx deploy/002_deploy_delegation_registry.ts
 *   IDENTITY_REGISTRY_ADDRESS=0x... HARDHAT_NETWORK=sepolia npx tsx deploy/002_deploy_delegation_registry.ts
 */
import hre from "hardhat";

async function main() {
  await hre.run("compile");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying DelegationRegistry with account:", deployer.address);
  console.log(
    "Account balance:",
    (await hre.ethers.provider.getBalance(deployer.address)).toString()
  );

  let registryAddress = process.env.IDENTITY_REGISTRY_ADDRESS;

  if (!registryAddress) {
    console.log(
      "\nNo IDENTITY_REGISTRY_ADDRESS set — deploying IdentityRegistry first..."
    );
    const IdentityRegistry = await hre.ethers.getContractFactory("IdentityRegistry");
    const registry = await IdentityRegistry.deploy();
    await registry.waitForDeployment();
    registryAddress = await registry.getAddress();
    console.log("IdentityRegistry deployed to:", registryAddress);
  } else {
    console.log("Using existing IdentityRegistry at:", registryAddress);
  }

  const DelegationRegistry = await hre.ethers.getContractFactory("DelegationRegistry");
  const delegation = await DelegationRegistry.deploy(registryAddress);
  await delegation.waitForDeployment();

  const delegationAddress = await delegation.getAddress();
  console.log("DelegationRegistry deployed to:", delegationAddress);

  const network = await hre.ethers.provider.getNetwork();
  const deploymentInfo = {
    contract: "DelegationRegistry",
    address: delegationAddress,
    identityRegistry: registryAddress,
    deployer: deployer.address,
    network: network.name,
    chainId: Number(network.chainId),
    timestamp: new Date().toISOString(),
  };
  console.log("\n--- DEPLOYMENT INFO ---");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  return delegationAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
