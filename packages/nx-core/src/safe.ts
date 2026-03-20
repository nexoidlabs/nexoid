/**
 * Safe wallet constants and AllowanceModule operations.
 *
 * The AllowanceModule is a singleton — one contract per chain, shared by all Safes.
 * Each Safe enables it as a module, then the operator manages per-agent allowances.
 *
 * Key pattern:
 * - Operator calls addDelegate/setAllowance THROUGH the Safe (Safe tx)
 * - Agent calls executeAllowanceTransfer DIRECTLY on the AllowanceModule
 */

import type { PublicClient, WalletClient } from 'viem';
import { encodeFunctionData, parseUnits, formatUnits } from 'viem';
import { AllowanceModuleABI } from './abi/allowance-module.js';

// ─── Deployed Contract Addresses ────────────────────────────

/** AllowanceModule singleton addresses (same contract, different chains) */
export const ALLOWANCE_MODULE = {
  /** Ethereum Mainnet — AllowanceModule v0.1.0 */
  ETH_MAINNET: '0xCFbFaC74C26F8647cBDb8c5caf80BB5b32E43134' as const,
  /** Ethereum Sepolia — AllowanceModule v0.1.0 */
  ETH_SEPOLIA: '0xCFbFaC74C26F8647cBDb8c5caf80BB5b32E43134' as const,
} as const;

/** ERC-4337 EntryPoint addresses */
export const ENTRYPOINT = {
  /** EntryPoint v0.7 — same address on all chains */
  V07: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const,
} as const;

// ─── AllowanceModule Read Operations ────────────────────────

export interface SafeAllowanceOps {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  allowanceModuleAddress: `0x${string}`;
}

export interface TokenAllowance {
  /** Total allowance amount (USDT formatted) */
  amount: string;
  /** Amount spent in current period (USDT formatted) */
  spent: string;
  /** Reset period in minutes (0 = no reset) */
  resetTimeMin: number;
  /** Last reset timestamp in minutes */
  lastResetMin: number;
  /** Current nonce (for executeAllowanceTransfer signatures) */
  nonce: number;
  /** Remaining allowance (amount - spent, accounting for reset) */
  remaining: string;
  /** Raw values */
  amountRaw: bigint;
  spentRaw: bigint;
}

/**
 * Query the current allowance for a delegate on a Safe.
 */
export async function getTokenAllowance(
  opts: SafeAllowanceOps,
  safeAddress: `0x${string}`,
  delegateAddress: `0x${string}`,
  tokenAddress: `0x${string}`
): Promise<TokenAllowance> {
  const result = await opts.publicClient.readContract({
    address: opts.allowanceModuleAddress,
    abi: AllowanceModuleABI,
    functionName: 'getTokenAllowance',
    args: [safeAddress, delegateAddress, tokenAddress],
  });

  const values = result as readonly bigint[];
  const amountRaw = values[0]!;
  const spentRaw = values[1]!;
  const resetTimeMin = Number(values[2]!);
  const lastResetMin = Number(values[3]!);
  const nonce = Number(values[4]!);

  // Calculate remaining (if reset period passed, spent resets to 0)
  let effectiveSpent = spentRaw;
  if (resetTimeMin > 0) {
    const nowMin = Math.floor(Date.now() / 60000);
    if (nowMin >= lastResetMin + resetTimeMin) {
      effectiveSpent = 0n;
    }
  }
  const remainingRaw = amountRaw > effectiveSpent ? amountRaw - effectiveSpent : 0n;

  return {
    amount: formatUnits(amountRaw, 6),
    spent: formatUnits(spentRaw, 6),
    resetTimeMin,
    lastResetMin,
    nonce,
    remaining: formatUnits(remainingRaw, 6),
    amountRaw,
    spentRaw,
  };
}

/**
 * Get all delegates for a Safe.
 */
export async function getDelegates(
  opts: SafeAllowanceOps,
  safeAddress: `0x${string}`
): Promise<`0x${string}`[]> {
  const result = await opts.publicClient.readContract({
    address: opts.allowanceModuleAddress,
    abi: AllowanceModuleABI,
    functionName: 'getDelegates',
    args: [safeAddress, 0, 50],
  });

  const [delegates] = result as unknown as [`0x${string}`[], bigint];
  return delegates;
}

// ─── AllowanceModule Calldata Encoders ──────────────────────
// These produce calldata to be executed THROUGH the Safe (as Safe transactions).

/**
 * Encode calldata for AllowanceModule.addDelegate().
 * This must be executed as a Safe transaction (msg.sender = Safe).
 */
export function encodeAddDelegate(delegateAddress: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: AllowanceModuleABI,
    functionName: 'addDelegate',
    args: [delegateAddress],
  });
}

/**
 * Encode calldata for AllowanceModule.setAllowance().
 * This must be executed as a Safe transaction (msg.sender = Safe).
 *
 * @param delegate - Agent address
 * @param token - ERC-20 token address (USDT)
 * @param amount - Human-readable amount (e.g., "100" for 100 USDT)
 * @param resetTimeMin - Auto-reset period in minutes (0 = no reset, 1440 = daily)
 */
export function encodeSetAllowance(
  delegate: `0x${string}`,
  token: `0x${string}`,
  amount: string,
  resetTimeMin = 0
): `0x${string}` {
  const amountRaw = parseUnits(amount, 6);

  return encodeFunctionData({
    abi: AllowanceModuleABI,
    functionName: 'setAllowance',
    args: [delegate, token, amountRaw, resetTimeMin, 0],
  });
}

/**
 * Encode calldata for AllowanceModule.removeDelegate().
 * This must be executed as a Safe transaction (msg.sender = Safe).
 */
export function encodeRemoveDelegate(
  delegateAddress: `0x${string}`,
  removeAllowances = true
): `0x${string}` {
  return encodeFunctionData({
    abi: AllowanceModuleABI,
    functionName: 'removeDelegate',
    args: [delegateAddress, removeAllowances],
  });
}

// ─── Agent-side: Direct AllowanceModule Execution ───────────

/**
 * Generate the transfer hash that the agent must sign for executeAllowanceTransfer.
 */
export async function generateTransferHash(
  opts: SafeAllowanceOps,
  safeAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  to: `0x${string}`,
  amount: string,
  nonce: number
): Promise<`0x${string}`> {
  const amountRaw = parseUnits(amount, 6);

  const result = await opts.publicClient.readContract({
    address: opts.allowanceModuleAddress,
    abi: AllowanceModuleABI,
    functionName: 'generateTransferHash',
    args: [
      safeAddress,
      tokenAddress,
      to,
      amountRaw,
      '0x0000000000000000000000000000000000000000' as `0x${string}`, // no payment token
      0n, // no payment
      nonce,
    ],
  });

  return result as `0x${string}`;
}

/**
 * Execute an allowance transfer as a delegate (agent).
 * The agent calls this DIRECTLY on the AllowanceModule — not through the Safe.
 */
export async function executeAllowanceTransfer(
  opts: SafeAllowanceOps,
  safeAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  to: `0x${string}`,
  amount: string,
  signature: `0x${string}`
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required');

  const amountRaw = parseUnits(amount, 6);

  return opts.walletClient.writeContract({
    address: opts.allowanceModuleAddress,
    abi: AllowanceModuleABI,
    functionName: 'executeAllowanceTransfer',
    args: [
      safeAddress,
      tokenAddress,
      to,
      amountRaw,
      '0x0000000000000000000000000000000000000000' as `0x${string}`, // no payment token
      0n, // no payment
      opts.walletClient.account!.address, // delegate = caller
      signature,
    ],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}
