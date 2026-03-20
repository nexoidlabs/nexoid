/**
 * Identity operations for the NexoidClient.
 * Wraps nx-core identity functions with audit emission.
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  createAgentIdentity as createAgentOnChain,
  getIdentityRecord,
  updateIdentityStatus as updateStatusOnChain,
  addressToDID,
  didToAddress,
  EntityType,
  EntityStatus,
  type IdentityOps,
  type IdentityRecord,
  type NexoidDID,
} from '@nexoid/nx-core';
import type {
  CreateAgentOpts,
  AgentIdentity,
} from './types.js';
import { deriveAgent } from './wdk.js';

/**
 * Generate a metadata hash from arbitrary metadata object.
 */
function hashMetadata(metadata: Record<string, unknown>): `0x${string}` {
  const canonical = JSON.stringify(metadata, Object.keys(metadata).sort());
  const hash = createHash('sha256').update(canonical).digest('hex');
  return `0x${hash}` as `0x${string}`;
}

/**
 * Generate an API key with the nxk_ prefix.
 * Format: nxk_agent_<32 random hex chars>
 */
function generateApiKey(): string {
  const random = randomBytes(24).toString('hex');
  return `nxk_agent_${random}`;
}

/**
 * Hash an API key for storage (never store plaintext).
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Create an agent identity under an operator.
 * Generates a new address and API key for the agent.
 */
export async function createAgent(
  identityOps: IdentityOps,
  operatorDid: NexoidDID,
  opts: CreateAgentOpts
): Promise<AgentIdentity> {
  // Validate entity type
  if (opts.entityType !== EntityType.VirtualAgent && opts.entityType !== EntityType.PhysicalAgent) {
    throw new Error('Agent must be VirtualAgent or PhysicalAgent');
  }

  // If WDK seed phrase provided, derive deterministically
  let agentAddress: `0x${string}`;
  let agentPrivateKey: `0x${string}`;
  if (opts.seedPhrase && opts.agentIndex) {
    const derived = deriveAgent(opts.seedPhrase, opts.agentIndex);
    agentAddress = derived.address;
    agentPrivateKey = derived.privateKey;
  } else {
    // Legacy: random key generation (not recommended)
    agentPrivateKey = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
    const { privateKeyToAccount } = await import('viem/accounts');
    agentAddress = privateKeyToAccount(agentPrivateKey).address as `0x${string}`;
  }

  const metadata = {
    ...opts.metadata,
    label: opts.label,
    operator: operatorDid,
  };
  const metadataHash = hashMetadata(metadata);

  const txHash = await createAgentOnChain(identityOps, agentAddress, opts.entityType, metadataHash);

  const did = addressToDID(agentAddress);
  const apiKey = generateApiKey();

  return { did, address: agentAddress, apiKey, txHash };
}

/**
 * Resolve an identity by DID.
 */
export async function resolveIdentity(
  identityOps: IdentityOps,
  did: NexoidDID
): Promise<IdentityRecord & { did: NexoidDID; ownerDid?: NexoidDID }> {
  const address = didToAddress(did);
  const record = await getIdentityRecord(identityOps, address);

  let ownerDid: NexoidDID | undefined;
  if (record.owner !== address) {
    ownerDid = addressToDID(record.owner);
  }

  return { ...record, did, ownerDid };
}

/**
 * Update an identity's status.
 */
export async function updateIdentityStatus(
  identityOps: IdentityOps,
  actorDid: NexoidDID,
  targetDid: NexoidDID,
  newStatus: EntityStatus
): Promise<`0x${string}`> {
  const targetAddress = didToAddress(targetDid);
  const txHash = await updateStatusOnChain(identityOps, targetAddress, newStatus);
  return txHash;
}

/**
 * List agents owned by an operator.
 * Note: This requires off-chain indexing (database). In v0.2, we track via events.
 */
export async function listAgents(
  _identityOps: IdentityOps,
  _operatorDid: NexoidDID
): Promise<AgentIdentity[]> {
  // TODO: Implement via database query (agents table)
  // For now, return empty — will be populated when database integration is complete
  return [];
}
