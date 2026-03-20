import type { PublicClient, WalletClient } from 'viem';
import { parseUnits, formatUnits } from 'viem';

// USDT on Ethereum Mainnet
export const USDT_ETH_MAINNET = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as const;
// USDT on Ethereum Sepolia
export const USDT_ETH_SEPOLIA = '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0' as const;

/** Minimal ERC-20 ABI for USDT operations (non-standard: transfer/approve return void) */
const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

export interface WalletOps {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  tokenAddress: `0x${string}`;
}

export interface Balance {
  usdt: string;
  eth: string;
  usdtRaw: bigint;
  ethRaw: bigint;
}

/**
 * Get USDT and ETH balance for an address.
 */
export async function getBalance(
  opts: WalletOps,
  address: `0x${string}`
): Promise<Balance> {
  const [usdtRaw, ethRaw] = await Promise.all([
    opts.publicClient.readContract({
      address: opts.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as Promise<bigint>,
    opts.publicClient.getBalance({ address }),
  ]);

  return {
    usdt: formatUnits(usdtRaw, 6), // USDT has 6 decimals
    eth: formatUnits(ethRaw, 18),
    usdtRaw,
    ethRaw,
  };
}

/**
 * Send USDT to a recipient address.
 */
export async function sendUSDT(
  opts: WalletOps,
  to: `0x${string}`,
  amount: string
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  const amountRaw = parseUnits(amount, 6); // USDT 6 decimals

  return opts.walletClient.writeContract({
    address: opts.tokenAddress,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to, amountRaw],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Set USDT spending allowance (for Safe allowance module).
 */
export async function setAllowance(
  opts: WalletOps,
  spender: `0x${string}`,
  amount: string
): Promise<`0x${string}`> {
  if (!opts.walletClient) throw new Error('Wallet client required for write operations');

  const amountRaw = parseUnits(amount, 6);

  return opts.walletClient.writeContract({
    address: opts.tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, amountRaw],
    chain: opts.walletClient.chain,
    account: opts.walletClient.account!,
  });
}

/**
 * Get USDT allowance for a spender.
 */
export async function getAllowance(
  opts: WalletOps,
  owner: `0x${string}`,
  spender: `0x${string}`
): Promise<string> {
  const raw = await opts.publicClient.readContract({
    address: opts.tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  }) as bigint;

  return formatUnits(raw, 6);
}
