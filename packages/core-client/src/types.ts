/**
 * Core client configuration and option types.
 */

import type {
  NexoidDID,
  EntityType,
  AgentScope,
  IdentityRecord,
  DelegationRecord,
  Balance,
  EmailCredential,
} from '@nexoid/nx-core';

// Re-export for convenience
export type { NexoidDID, AgentScope, IdentityRecord, DelegationRecord, Balance, EmailCredential };
export { EntityType, EntityStatus, DelegationStatus } from '@nexoid/nx-core';

/**
 * Configuration for the NexoidClient.
 */
export interface NexoidClientConfig {
  /** Ethereum RPC URL (e.g., https://eth-mainnet.g.alchemy.com/v2/...) */
  rpcUrl: string;
  /** IdentityRegistry contract address */
  registryAddress: `0x${string}`;
  /** DelegationRegistry contract address */
  delegationRegistryAddress: `0x${string}`;
  /** USDT contract address (defaults to Ethereum Mainnet/Sepolia USDT) */
  tokenAddress?: `0x${string}`;
  /** AllowanceModule singleton address (defaults to Ethereum Mainnet) */
  allowanceModuleAddress?: `0x${string}`;
  /** NexoidModule contract address (for agent Safe registry) */
  nexoidModuleAddress?: `0x${string}`;
  /** Private key for signing transactions (operator) */
  privateKey?: `0x${string}`;
}

/**
 * Options for creating an agent.
 */
export interface CreateAgentOpts {
  entityType: EntityType;
  label?: string;
  metadata?: Record<string, unknown>;
  /** WDK seed phrase for deterministic key derivation */
  seedPhrase?: string;
  /** BIP-44 agent index (1+) */
  agentIndex?: number;
}

/**
 * Result of agent creation.
 */
export interface AgentIdentity {
  did: NexoidDID;
  address: `0x${string}`;
  apiKey: string;
  txHash: `0x${string}`;
}

/**
 * Options for delegating scope to an agent.
 */
export interface DelegateOpts {
  agentDid: NexoidDID;
  scope: AgentScope;
  validUntil: Date;
  parentDelegationId?: string;
}

/**
 * Result of delegation.
 */
export interface DelegationResult {
  delegationId: string;
  txHash: `0x${string}`;
  scope: AgentScope;
}

/**
 * Result of delegation validation.
 */
export interface ValidationResult {
  valid: boolean;
  depth: number;
  chain?: Array<{
    delegationId: string;
    issuer: NexoidDID;
    subject: NexoidDID;
  }>;
}

/**
 * Options for USDT transfer.
 */
export interface TransferOpts {
  to: `0x${string}`;
  amount: string;
}

/**
 * Result of a transaction.
 */
export interface TransactionResult {
  txHash: `0x${string}`;
  amount: string;
  to: `0x${string}`;
}

/**
 * Options for setting allowance.
 */
export interface AllowanceOpts {
  agentDid: NexoidDID;
  amount: string;
}
