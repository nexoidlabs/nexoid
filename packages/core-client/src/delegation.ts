/**
 * Delegation operations for the NexoidClient.
 * Wraps nx-core delegation functions with audit emission.
 */

import {
  delegateWithScope as delegateOnChain,
  revokeDelegation as revokeOnChain,
  validateDelegation as validateOnChain,
  getDelegation as getDelegationOnChain,
  computeScopeHash,
  didToAddress,
  addressToDID,
  type DelegationOps,
  type DelegationRecord,
  type NexoidDID,
} from '@nexoid/nx-core';
import type {
  DelegateOpts,
  DelegationResult,
  ValidationResult,
} from './types.js';

/**
 * Create a scoped delegation from operator to agent.
 */
export async function delegate(
  delegationOps: DelegationOps,
  issuerDid: NexoidDID,
  opts: DelegateOpts
): Promise<DelegationResult> {
  const subjectAddress = didToAddress(opts.agentDid);

  // Create a placeholder credential hash (in production, this would be the VC hash)
  const scopeHash = computeScopeHash(opts.scope);
  const credentialHash = scopeHash; // Simplified for v0.2

  const txHash = await delegateOnChain(delegationOps, {
    subject: subjectAddress,
    credentialHash,
    scope: opts.scope,
    validUntil: BigInt(Math.floor(opts.validUntil.getTime() / 1000)),
    parentDelegationId: opts.parentDelegationId
      ? BigInt(opts.parentDelegationId)
      : undefined,
  });

  return {
    delegationId: '0', // Will be resolved from tx receipt in production
    txHash,
    scope: opts.scope,
  };
}

/**
 * Revoke a delegation (O(1) gas — chain-breaking design).
 */
export async function revoke(
  delegationOps: DelegationOps,
  actorDid: NexoidDID,
  delegationId: string
): Promise<`0x${string}`> {
  const txHash = await revokeOnChain(delegationOps, BigInt(delegationId));
  return txHash;
}

/**
 * Validate a delegation chain from agent back to trust anchor.
 */
export async function validateDelegation(
  delegationOps: DelegationOps,
  delegationId: string
): Promise<ValidationResult> {
  const result = await validateOnChain(delegationOps, BigInt(delegationId));
  return {
    valid: result.valid,
    depth: result.depth,
  };
}

/**
 * List delegations for a given DID.
 * Note: Requires off-chain indexing. In v0.2, tracks via events.
 */
export async function listDelegations(
  _delegationOps: DelegationOps,
  _did: NexoidDID
): Promise<DelegationRecord[]> {
  // TODO: Implement via event indexing or database
  return [];
}
