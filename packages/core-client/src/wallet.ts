/**
 * Wallet operations for the NexoidClient.
 * Wraps nx-core wallet functions for balance queries and direct ERC-20 transfers.
 * Safe-routed operations are handled in safe.ts.
 */

import {
  getBalance as getBalanceOnChain,
  sendUSDT as sendUSDTOnChain,
  didToAddress,
  type WalletOps,
  type Balance,
  type NexoidDID,
} from '@nexoid/nx-core';
import type { TransferOpts, TransactionResult } from './types.js';

/**
 * Get USDT and ETH balance for a DID or direct address.
 */
export async function getBalance(
  walletOps: WalletOps,
  target: NexoidDID | { did: string; address: `0x${string}` }
): Promise<Balance> {
  const address = typeof target === 'string'
    ? didToAddress(target)
    : target.address;
  return getBalanceOnChain(walletOps, address);
}

/**
 * Send USDT to a recipient (direct ERC-20 transfer, legacy path).
 */
export async function sendUSDTTransfer(
  walletOps: WalletOps,
  senderDid: NexoidDID,
  opts: TransferOpts
): Promise<TransactionResult> {
  const txHash = await sendUSDTOnChain(walletOps, opts.to, opts.amount);
  return { txHash, amount: opts.amount, to: opts.to };
}
