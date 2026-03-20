import type { PublicClient, WalletClient } from 'viem';
import { DelegationRegistryABI } from './abi/index.js';
import type { DelegationRecord, AgentScope } from './types.js';
import { keccak256, stringToHex } from 'viem';

export interface DelegationOps {
  moduleAddress: `0x${string}`;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}

/**
 * Compute the scope hash for a V1 AgentScope object.
 * scopeHash = keccak256(JSON.stringify(canonicalized scope))
 */
export function computeScopeHash(scope: AgentScope): `0x${string}` {
  // Canonical JSON — keys sorted, no whitespace
  const canonical = JSON.stringify(scope, Object.keys(scope).sort());
  return keccak256(stringToHex(canonical));
}

/**
 * Create a scoped delegation from issuer to subject.
 */
export async function delegateWithScope(
  opts: DelegationOps,
  params: {
    subject: `0x${string}`;
    credentialHash: `0x${string}`;
    scope: AgentScope;
    validUntil: bigint;
    parentDelegationId?: bigint;
  }
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  const scopeHash = computeScopeHash(params.scope);

  return opts.walletClient.writeContract({
    address: opts.moduleAddress,
    abi: DelegationRegistryABI,
    functionName: 'delegateWithScope',
    args: [
      params.subject,
      params.credentialHash,
      scopeHash,
      params.validUntil,
      params.parentDelegationId ?? 0n,
      params.scope.delegationDepth,
    ],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Revoke a delegation (O(1) gas — chain-breaking design).
 */
export async function revokeDelegation(
  opts: DelegationOps,
  delegationId: bigint
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  return opts.walletClient.writeContract({
    address: opts.moduleAddress,
    abi: DelegationRegistryABI,
    functionName: 'revokeDelegation',
    args: [delegationId],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Validate a delegation chain.
 */
export async function validateDelegation(
  opts: DelegationOps,
  delegationId: bigint
): Promise<{ valid: boolean; depth: number }> {
  const result = await opts.publicClient.readContract({
    address: opts.moduleAddress,
    abi: DelegationRegistryABI,
    functionName: 'isValidDelegation',
    args: [delegationId],
  });

  const [valid, depth] = result as [boolean, number];
  return { valid, depth };
}

/**
 * Get a delegation record.
 */
export async function getDelegation(
  opts: DelegationOps,
  delegationId: bigint
): Promise<DelegationRecord> {
  const result = await opts.publicClient.readContract({
    address: opts.moduleAddress,
    abi: DelegationRegistryABI,
    functionName: 'getDelegation',
    args: [delegationId],
  });

  return result as unknown as DelegationRecord;
}
