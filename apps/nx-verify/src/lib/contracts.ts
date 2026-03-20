import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  type Chain,
} from "viem";
import { mainnet, sepolia, hardhat } from "viem/chains";

// Reuse the same ABIs from nx-platform for identity/agent reads
export const IDENTITY_REGISTRY_ABI = [
  {
    type: "function",
    name: "getIdentity",
    inputs: [{ name: "identity", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "entityType", type: "uint8" },
          { name: "status", type: "uint8" },
          { name: "createdAt", type: "uint64" },
          { name: "metadataHash", type: "bytes32" },
          { name: "owner", type: "address" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isRegistered",
    inputs: [{ name: "identity", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "identity", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

export const NEXOID_MODULE_ABI = [
  {
    type: "function",
    name: "isValidAgent",
    inputs: [{ name: "agentSafe", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAgentRecord",
    inputs: [{ name: "agentSafe", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "agentSafe", type: "address" },
          { name: "agentEOA", type: "address" },
          { name: "createdAt", type: "uint64" },
          { name: "scopeHash", type: "bytes32" },
          { name: "credentialHash", type: "bytes32" },
          { name: "validUntil", type: "uint64" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

export const ENTITY_TYPES = ["Human", "VirtualAgent", "PhysicalAgent", "Organization"] as const;
export const ENTITY_STATUSES = ["Active", "Suspended", "Revoked"] as const;
export const DELEGATION_STATUSES = ["Active", "Suspended", "Revoked"] as const;

export function getChain(): Chain {
  const networkName = process.env.NEXT_PUBLIC_NETWORK ?? "hardhat";
  switch (networkName) {
    case "ethereum":
      return mainnet;
    case "sepolia":
      return sepolia;
    default:
      return hardhat;
  }
}

export function getRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_RPC_URL ??
    process.env.ETH_SEPOLIA_RPC_URL ??
    "http://127.0.0.1:8545"
  );
}

export function getRegistryAddress(): Address {
  return (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
    "0x5FbDB2315678afecb367f032d93F642f64180aa3") as Address;
}

export function getNexoidModuleAddress(): Address {
  return (process.env.NEXT_PUBLIC_MODULE_ADDRESS ??
    "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512") as Address;
}

export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: getChain(),
    transport: http(getRpcUrl()),
  });
}
