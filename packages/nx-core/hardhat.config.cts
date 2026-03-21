import type { HardhatUserConfig } from "hardhat/config";
require("@nomicfoundation/hardhat-toolbox");
const { vars } = require("hardhat/config");

// Stored via: npx hardhat vars set NEXOID_SEED_PHRASE
const SEED_PHRASE = vars.get("NEXOID_SEED_PHRASE", "");

function getAccounts(): HardhatUserConfig["networks"] extends Record<string, infer N> ? NonNullable<N extends { accounts?: infer A } ? A : never> : never {
  if (process.env.DEPLOYER_PRIVATE_KEY) return [process.env.DEPLOYER_PRIVATE_KEY];
  if (SEED_PHRASE) return { mnemonic: SEED_PHRASE };
  return [];
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.ETH_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: getAccounts(),
    },
    ethereum: {
      url: process.env.ETH_MAINNET_RPC_URL ?? "https://ethereum-rpc.publicnode.com",
      accounts: getAccounts(),
    },
  },
};

export default config;
