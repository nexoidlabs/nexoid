import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  type Chain,
} from "viem";
import { mainnet, sepolia, hardhat } from "viem/chains";

// Full ABI for IdentityRegistry — read + write functions
export const IDENTITY_REGISTRY_ABI = [
  // --- Read functions ---
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
  // --- Write functions ---
  {
    type: "function",
    name: "registerIdentity",
    inputs: [
      { name: "entityType", type: "uint8" },
      { name: "metadataHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createAgentIdentity",
    inputs: [
      { name: "agent", type: "address" },
      { name: "entityType", type: "uint8" },
      { name: "metadataHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateStatus",
    inputs: [
      { name: "identity", type: "address" },
      { name: "newStatus", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateMetadata",
    inputs: [
      { name: "identity", type: "address" },
      { name: "newMetadataHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // --- Events ---
  {
    type: "event",
    name: "IdentityRegistered",
    inputs: [
      { name: "identity", type: "address", indexed: true },
      { name: "entityType", type: "uint8", indexed: false },
      { name: "owner", type: "address", indexed: true },
      { name: "metadataHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "IdentityStatusUpdated",
    inputs: [
      { name: "identity", type: "address", indexed: true },
      { name: "oldStatus", type: "uint8", indexed: false },
      { name: "newStatus", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MetadataUpdated",
    inputs: [
      { name: "identity", type: "address", indexed: true },
      { name: "oldHash", type: "bytes32", indexed: false },
      { name: "newHash", type: "bytes32", indexed: false },
    ],
  },
] as const;


// Minimal AllowanceModule ABI for reading delegate allowances
export const ALLOWANCE_MODULE_ABI = [
  {
    type: "function",
    name: "getDelegates",
    inputs: [
      { name: "safe", type: "address" },
      { name: "start", type: "uint48" },
      { name: "pageSize", type: "uint8" },
    ],
    outputs: [
      { name: "results", type: "address[]" },
      { name: "next", type: "uint48" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTokenAllowance",
    inputs: [
      { name: "safe", type: "address" },
      { name: "delegate", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256[5]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTokens",
    inputs: [
      { name: "safe", type: "address" },
      { name: "delegate", type: "address" },
    ],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
] as const;

// Minimal ERC-20 ABI for balance queries
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

export const ALLOWANCE_MODULE_ADDRESS = "0xCFbFaC74C26F8647cBDb8c5caf80BB5b32E43134" as Address;

// NexoidModule ABI for agent management
export const NEXOID_MODULE_ABI = [
  // --- Read functions ---
  {
    type: "function",
    name: "getAgentSafes",
    inputs: [{ name: "operatorSafe", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
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
  {
    type: "function",
    name: "getOperator",
    inputs: [{ name: "agentSafe", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "agentCount",
    inputs: [{ name: "operatorSafe", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
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
  // --- Write functions ---
  {
    type: "function",
    name: "registerAgentSafe",
    inputs: [
      { name: "agentSafe", type: "address" },
      { name: "agentEOA", type: "address" },
      { name: "scopeHash", type: "bytes32" },
      { name: "credentialHash", type: "bytes32" },
      { name: "validUntil", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateAgentScope",
    inputs: [
      { name: "agentSafe", type: "address" },
      { name: "scopeHash", type: "bytes32" },
      { name: "credentialHash", type: "bytes32" },
      { name: "validUntil", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "suspendAgent",
    inputs: [{ name: "agentSafe", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeAgent",
    inputs: [{ name: "agentSafe", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "reactivateAgent",
    inputs: [{ name: "agentSafe", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  // --- Events ---
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "operatorSafe", type: "address", indexed: true },
      { name: "agentSafe", type: "address", indexed: true },
      { name: "agentEOA", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentScopeUpdated",
    inputs: [
      { name: "agentSafe", type: "address", indexed: true },
      { name: "scopeHash", type: "bytes32", indexed: false },
      { name: "credentialHash", type: "bytes32", indexed: false },
      { name: "validUntil", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentStatusChanged",
    inputs: [
      { name: "agentSafe", type: "address", indexed: true },
      { name: "oldStatus", type: "uint8", indexed: false },
      { name: "newStatus", type: "uint8", indexed: false },
    ],
  },
] as const;

export const USDT_ADDRESSES: Record<string, Address> = {
  ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  sepolia: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
  hardhat: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
};

export function getTokenAddress(): Address {
  const network = process.env.NEXT_PUBLIC_NETWORK ?? "hardhat";
  return (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? USDT_ADDRESSES[network] ?? USDT_ADDRESSES.sepolia) as Address;
}

export const ENTITY_TYPES = ["Human", "VirtualAgent", "PhysicalAgent", "Organization"] as const;
export const ENTITY_STATUSES = ["Active", "Suspended", "Revoked"] as const;
export const AGENT_STATUSES = ["Active", "Suspended", "Revoked"] as const;
export const DELEGATION_STATUSES = AGENT_STATUSES; // backward compat alias

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

export function getModuleAddress(): Address {
  return (process.env.NEXT_PUBLIC_MODULE_ADDRESS ??
    "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512") as Address;
}

export function getNexoidModuleAddress(): Address | undefined {
  return process.env.NEXT_PUBLIC_NEXOID_MODULE_ADDRESS as Address | undefined;
}

export function getPublicClient(): PublicClient {
  return createPublicClient({
    chain: getChain(),
    transport: http(getRpcUrl()),
  });
}
