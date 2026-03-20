/**
 * Agent scope operations for the NexoidClient.
 * Wraps nx-core agent-scope functions with NexoidModule integration.
 */

import {
  updateAgentScope as updateScopeOnChain,
  suspendAgent as suspendOnChain,
  revokeAgent as revokeOnChain,
  reactivateAgent as reactivateOnChain,
  isValidAgent as isValidOnChain,
  getAgentRecord as getRecordOnChain,
  computeScopeHash,
  type AgentOps,
  type AgentRecord,
} from '@nexoid/nx-core';
import type {
  UpdateScopeOpts,
  ScopeUpdateResult,
  ValidationResult,
} from './types.js';

/**
 * Update scope, credential, and expiry for an agent via NexoidModule.
 */
export async function updateAgentScope(
  agentOps: AgentOps,
  opts: UpdateScopeOpts
): Promise<ScopeUpdateResult> {
  const scopeHash = computeScopeHash(opts.scope);
  const credentialHash = scopeHash; // Simplified for v0.2

  const txHash = await updateScopeOnChain(agentOps, {
    agentSafe: opts.agentSafe,
    scopeHash,
    credentialHash,
    validUntil: BigInt(Math.floor(opts.validUntil.getTime() / 1000)),
  });

  return {
    txHash,
    scope: opts.scope,
  };
}

/**
 * Revoke an agent permanently via NexoidModule.
 */
export async function revokeAgent(
  agentOps: AgentOps,
  agentSafe: `0x${string}`
): Promise<`0x${string}`> {
  return revokeOnChain(agentOps, agentSafe);
}

/**
 * Suspend an active agent via NexoidModule.
 */
export async function suspendAgent(
  agentOps: AgentOps,
  agentSafe: `0x${string}`
): Promise<`0x${string}`> {
  return suspendOnChain(agentOps, agentSafe);
}

/**
 * Reactivate a suspended agent via NexoidModule.
 */
export async function reactivateAgent(
  agentOps: AgentOps,
  agentSafe: `0x${string}`
): Promise<`0x${string}`> {
  return reactivateOnChain(agentOps, agentSafe);
}

/**
 * Check if an agent is valid (Active status and not expired).
 */
export async function isValidAgent(
  agentOps: AgentOps,
  agentSafe: `0x${string}`
): Promise<ValidationResult> {
  const valid = await isValidOnChain(agentOps, agentSafe);
  return { valid };
}

/**
 * Get the full agent record.
 */
export async function getAgentRecord(
  agentOps: AgentOps,
  agentSafe: `0x${string}`
): Promise<AgentRecord> {
  return getRecordOnChain(agentOps, agentSafe);
}
