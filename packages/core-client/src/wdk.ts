/**
 * WDK (Wallet Development Kit) integration for Nexoid.
 * Provides BIP-44 HD key derivation for operator and agent wallets.
 *
 * Derivation path: m/44'/60'/0'/0/{index}
 * - Index 0: Operator key
 * - Index 1+: Agent keys
 *
 * Uses ethers.js v6 directly for BIP-44 HD derivation (the same approach
 * used internally by @tetherto/wdk-wallet-evm). When the actual WDK
 * packages stabilise, imports can be swapped to use them directly.
 */

import { HDNodeWallet, Mnemonic } from 'ethers';

// BIP-44 Ethereum derivation base path
const ETH_DERIVATION_BASE = "m/44'/60'/0'/0";

/**
 * Generate a new random 24-word BIP-39 seed phrase.
 */
export function generateSeedPhrase(): string {
  const mnemonic = Mnemonic.fromEntropy(crypto.getRandomValues(new Uint8Array(32)));
  return mnemonic.phrase;
}

/**
 * Derive an Ethereum account from a seed phrase at a given BIP-44 index.
 *
 * @param seedPhrase - BIP-39 mnemonic seed phrase
 * @param index - BIP-44 index (0 = operator, 1+ = agents)
 * @returns { address, privateKey } - Ethereum address and private key
 */
export function deriveAccount(seedPhrase: string, index: number): {
  address: `0x${string}`;
  privateKey: `0x${string}`;
} {
  const mnemonic = Mnemonic.fromPhrase(seedPhrase);
  const hdNode = HDNodeWallet.fromMnemonic(mnemonic, `${ETH_DERIVATION_BASE}/${index}`);
  return {
    address: hdNode.address as `0x${string}`,
    privateKey: hdNode.privateKey as `0x${string}`,
  };
}

/**
 * Derive the operator account (index 0).
 */
export function deriveOperator(seedPhrase: string): {
  address: `0x${string}`;
  privateKey: `0x${string}`;
} {
  return deriveAccount(seedPhrase, 0);
}

/**
 * Derive an agent account at the given index (starting from 1).
 */
export function deriveAgent(seedPhrase: string, agentIndex: number): {
  address: `0x${string}`;
  privateKey: `0x${string}`;
} {
  if (agentIndex < 1) throw new Error('Agent index must be >= 1');
  return deriveAccount(seedPhrase, agentIndex);
}

/**
 * Validate a BIP-39 seed phrase.
 */
export function isValidSeedPhrase(phrase: string): boolean {
  try {
    Mnemonic.fromPhrase(phrase);
    return true;
  } catch {
    return false;
  }
}
