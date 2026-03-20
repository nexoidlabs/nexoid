import type { PublicClient, WalletClient } from 'viem';
import { IdentityRegistryABI } from './abi/index.js';
import type { EntityType, EntityStatus, IdentityRecord } from './types.js';

export interface IdentityOps {
  registryAddress: `0x${string}`;
  publicClient: PublicClient;
  walletClient?: WalletClient;
}

/**
 * Create an agent identity under an operator.
 */
export async function createAgentIdentity(
  opts: IdentityOps,
  agentAddress: `0x${string}`,
  entityType: EntityType,
  metadataHash: `0x${string}`
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  const hash = await opts.walletClient.writeContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'createAgentIdentity',
    args: [agentAddress, entityType, metadataHash],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });

  return hash;
}

/**
 * Get an identity record from on-chain.
 */
export async function getIdentityRecord(
  opts: IdentityOps,
  address: `0x${string}`
): Promise<IdentityRecord> {
  const result = await opts.publicClient.readContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'getIdentity',
    args: [address],
  });

  return result as unknown as IdentityRecord;
}

/**
 * Check if an address has a registered identity.
 */
export async function isRegistered(
  opts: IdentityOps,
  address: `0x${string}`
): Promise<boolean> {
  return opts.publicClient.readContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'isRegistered',
    args: [address],
  }) as Promise<boolean>;
}

/**
 * Update an identity's status.
 */
export async function updateIdentityStatus(
  opts: IdentityOps,
  identity: `0x${string}`,
  newStatus: EntityStatus
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  return opts.walletClient.writeContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'updateStatus',
    args: [identity, newStatus],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Get the owner of an identity.
 */
export async function getIdentityOwner(
  opts: IdentityOps,
  identity: `0x${string}`
): Promise<`0x${string}`> {
  return opts.publicClient.readContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'ownerOf',
    args: [identity],
  }) as Promise<`0x${string}`>;
}

// ─── Admin & Registrar Operations ────────────────────────

/**
 * Register an identity on behalf of a user (registrar only).
 * Called by Nexoid backend after identity verification (e.g., email).
 * The identity is owned by `owner`, not by the registrar.
 */
export async function registerIdentityFor(
  opts: IdentityOps,
  owner: `0x${string}`,
  entityType: EntityType,
  metadataHash: `0x${string}`
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  return opts.walletClient.writeContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'registerIdentityFor',
    args: [owner, entityType, metadataHash],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Add or remove a registrar (admin only).
 */
export async function setRegistrar(
  opts: IdentityOps,
  registrar: `0x${string}`,
  authorized: boolean
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  return opts.walletClient.writeContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'setRegistrar',
    args: [registrar, authorized],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Transfer admin role to a new address (admin only).
 */
export async function transferAdmin(
  opts: IdentityOps,
  newAdmin: `0x${string}`
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  return opts.walletClient.writeContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'transferAdmin',
    args: [newAdmin],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Check if an address is an authorized registrar.
 */
export async function isRegistrarAddress(
  opts: IdentityOps,
  registrar: `0x${string}`
): Promise<boolean> {
  return opts.publicClient.readContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'isRegistrar',
    args: [registrar],
  }) as Promise<boolean>;
}

/**
 * Get the admin address.
 */
export async function getAdmin(
  opts: IdentityOps
): Promise<`0x${string}`> {
  return opts.publicClient.readContract({
    address: opts.registryAddress,
    abi: IdentityRegistryABI,
    functionName: 'admin',
    args: [],
  }) as Promise<`0x${string}`>;
}
