import type { PublicClient, WalletClient } from 'viem';
import { NexoidModuleABI } from './abi/index.js';
import type { AgentRecord, AgentScope } from './types.js';
import { keccak256, stringToHex } from 'viem';

export interface AgentOps {
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
 * Update scope, credential, and expiry for an agent.
 */
export async function updateAgentScope(
  opts: AgentOps,
  params: {
    agentSafe: `0x${string}`;
    scopeHash: `0x${string}`;
    credentialHash: `0x${string}`;
    validUntil: bigint;
  }
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  return opts.walletClient.writeContract({
    address: opts.moduleAddress,
    abi: NexoidModuleABI,
    functionName: 'updateAgentScope',
    args: [
      params.agentSafe,
      params.scopeHash,
      params.credentialHash,
      params.validUntil,
    ],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Suspend an active agent (reversible).
 */
export async function suspendAgent(
  opts: AgentOps,
  agentSafe: `0x${string}`
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  return opts.walletClient.writeContract({
    address: opts.moduleAddress,
    abi: NexoidModuleABI,
    functionName: 'suspendAgent',
    args: [agentSafe],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Permanently revoke an agent.
 */
export async function revokeAgent(
  opts: AgentOps,
  agentSafe: `0x${string}`
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  return opts.walletClient.writeContract({
    address: opts.moduleAddress,
    abi: NexoidModuleABI,
    functionName: 'revokeAgent',
    args: [agentSafe],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Reactivate a suspended agent.
 */
export async function reactivateAgent(
  opts: AgentOps,
  agentSafe: `0x${string}`
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  return opts.walletClient.writeContract({
    address: opts.moduleAddress,
    abi: NexoidModuleABI,
    functionName: 'reactivateAgent',
    args: [agentSafe],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Check if an agent is valid (Active status and not expired).
 */
export async function isValidAgent(
  opts: AgentOps,
  agentSafe: `0x${string}`
): Promise<boolean> {
  const result = await opts.publicClient.readContract({
    address: opts.moduleAddress,
    abi: NexoidModuleABI,
    functionName: 'isValidAgent',
    args: [agentSafe],
  });

  return result as boolean;
}

/**
 * Get the full agent record by agent Safe address (O(1) lookup).
 */
export async function getAgentRecord(
  opts: AgentOps,
  agentSafe: `0x${string}`
): Promise<AgentRecord> {
  const result = await opts.publicClient.readContract({
    address: opts.moduleAddress,
    abi: NexoidModuleABI,
    functionName: 'getAgentRecord',
    args: [agentSafe],
  });

  return result as unknown as AgentRecord;
}
