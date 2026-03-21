import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INITIAL_WALLETS, Transaction, MAIN_WALLET_ID } from '@/constants/MockData';
import { ManagedUnitsService } from '@/services/ManagedUnitsService';

import { USDT_ADDRESS_SEPOLIA } from './ContractABIs';

// Constants
const CACHE_KEY_PREFIX = 'transactions:allium:usdt:';
const ALLIUM_API_URL = 'https://api.allium.so/api/v1/developer/wallet/transactions';
const ALLIUM_LIMIT = 100;

interface AlliumAssetAmount {
  raw_amount?: string | null;
  amount_str?: string | null;
  amount?: number | null;
}

interface AlliumEVMAsset {
  type?: string | null;
  address?: string | null;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  token_id?: string | null;
}

interface AlliumEVMTransfer {
  transfer_type: 'sent' | 'received';
  operation?: 'mint' | 'burn' | null;
  transaction_hash: string;
  log_index?: number | null;
  from_address: string;
  to_address: string;
  asset: AlliumEVMAsset;
  amount: AlliumAssetAmount;
}

interface AlliumWalletTransaction {
  hash: string;
  block_timestamp: string;
  block_number: number;
  from_address?: string | null;
  to_address?: string | null;
  asset_transfers: AlliumEVMTransfer[];
}

interface AlliumResponse {
  items: AlliumWalletTransaction[];
  cursor?: string | null;
}

class TransactionService {
  constructor() {}

  /**
   * Get transactions from cache only (instant)
   */
  async getCachedTransactions(safeAddress: string): Promise<Transaction[]> {
    if (!safeAddress) return [];
    const normalizedAddress = ethers.getAddress(safeAddress);
    const storageKey = `${CACHE_KEY_PREFIX}${normalizedAddress}`;
    
    try {
      const cachedDataStr = await AsyncStorage.getItem(storageKey);
      if (cachedDataStr) {
        const data = JSON.parse(cachedDataStr);
        return data.transactions || [];
      }
    } catch (e) {
      console.warn('Failed to load cached transactions:', e);
    }
    return [];
  }

  /**
   * Fetch USDT transactions for a given Safe address
   * Merges cached data with fresh data from Allium
   */
  async getTransactionHistory(
    safeAddress: string,
    forceRefresh = false,
    walletId: string = MAIN_WALLET_ID
  ): Promise<Transaction[]> {
    if (!safeAddress) return [];
    
    const normalizedAddress = ethers.getAddress(safeAddress);
    const storageKey = `${CACHE_KEY_PREFIX}${normalizedAddress}`;
    
    try {
      // 1. Load cached transactions
      const cachedDataStr = await AsyncStorage.getItem(storageKey);
      let cachedData: { cursor?: string | null; transactions: Transaction[] } = { 
        cursor: null,
        transactions: [] 
      };
      
      if (cachedDataStr) {
        try {
          cachedData = JSON.parse(cachedDataStr);
        } catch (e) {
          console.error('Failed to parse cached transactions', e);
        }
      }

      const nameMap = await this.buildNameMap(normalizedAddress);

      // 2. Fetch new transactions from Allium
      console.log(`[TransactionService] Fetching from Allium...`);
      
      const { transactions: newTransactions, cursor } = await this.fetchAlliumTransactions(
        normalizedAddress,
        nameMap,
        walletId
      );
      
      // 3. Merge and sort
      const existingIds = new Set(cachedData.transactions.map(t => t.id));
      const uniqueNewTransactions = newTransactions.filter(t => !existingIds.has(t.id));
      
      const allTransactions = [...uniqueNewTransactions, ...cachedData.transactions]
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Newest first

      // 4. Save to cache
      await AsyncStorage.setItem(storageKey, JSON.stringify({
        cursor: cursor || cachedData.cursor || null,
        transactions: allTransactions
      }));

      return allTransactions;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      // Fallback to cache if API fails
      const cachedDataStr = await AsyncStorage.getItem(storageKey);
      if (cachedDataStr) {
        return JSON.parse(cachedDataStr).transactions;
      }
      return [];
    }
  }

  private async fetchAlliumTransactions(
    address: string,
    nameMap: Map<string, string>,
    walletId: string
  ): Promise<{ transactions: Transaction[]; cursor?: string | null }> {
    const apiKey = process.env.EXPO_PUBLIC_ALLIUM_API_KEY;
    if (!apiKey) {
      console.warn('[TransactionService] No Allium API key found (EXPO_PUBLIC_ALLIUM_API_KEY)');
    }

    const query = new URLSearchParams({
      limit: ALLIUM_LIMIT.toString(),
    });

    try {
      const response = await fetch(`${ALLIUM_API_URL}?${query.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey || '',
        },
        body: JSON.stringify([{ chain: 'ethereum', address }]),
      });

      if (!response.ok) {
        const text = await response.text();
        console.warn('[TransactionService] Allium API error:', response.status, text);
        return { transactions: [] };
      }

      const data = (await response.json()) as AlliumResponse;
      const result = data.items || [];
      console.log(`[TransactionService] Found ${result.length} Allium transactions`);

      const transactions = result.flatMap((tx, index) =>
        this.mapAlliumTxToTransactions(tx, address, index, nameMap, walletId)
      );

      return { transactions, cursor: data.cursor ?? null };
    } catch (error) {
      console.error('[TransactionService] Allium API request failed:', error);
      throw error;
    }
  }

  private mapAlliumTxToTransactions(
    tx: AlliumWalletTransaction,
    myAddress: string,
    txIndex: number,
    nameMap: Map<string, string>,
    walletId: string
  ): Transaction[] {
    const timestamp = this.parseAlliumTimestamp(tx.block_timestamp);

    const transfers = (tx.asset_transfers || []).filter(transfer => {
      const assetAddress = transfer.asset?.address?.toLowerCase();
      return assetAddress === USDT_ADDRESS_SEPOLIA.toLowerCase();
    });

    return transfers.map((transfer, transferIndex) => {
      const isIncome = transfer.transfer_type === 'received';
      const amount = this.parseAlliumAmount(transfer.amount, transfer.asset?.decimals ?? 6);
      const fromAddress = transfer.from_address || tx.from_address || '';

      return {
        id: this.buildAlliumTransferId(walletId, tx.hash, transfer.log_index, txIndex, transferIndex),
        walletId,
        merchant: this.resolveDisplayName(fromAddress, nameMap),
        amount: isIncome ? amount : -amount,
        date: this.formatDate(timestamp),
        status: 'completed',
        type: isIncome ? 'income' : 'expense',
        iconName: isIncome ? 'arrow-down-left' : 'shopping-bag',
        txHash: tx.hash,
        blockNumber: tx.block_number,
        timestamp: timestamp,
        from: fromAddress || undefined,
        to: transfer.to_address || tx.to_address || undefined,
        tokenSymbol: transfer.asset?.symbol || 'USDT',
      };
    });
  }

  private parseAlliumAmount(amount: AlliumAssetAmount, decimals: number): number {
    if (typeof amount.amount === 'number') {
      return Math.abs(amount.amount);
    }
    if (amount.raw_amount) {
      try {
        return Number(ethers.formatUnits(BigInt(amount.raw_amount), decimals));
      } catch (e) {
        console.warn('[TransactionService] Failed to parse Allium raw amount:', e);
      }
    }
    if (amount.amount_str) {
      const parsed = Number(amount.amount_str);
      return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
    }
    return 0;
  }

  private parseAlliumTimestamp(timestamp: string): number {
    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed)) {
      return Math.floor(Date.now() / 1000);
    }
    return Math.floor(parsed / 1000);
  }

  private buildAlliumTransferId(
    walletId: string,
    hash: string,
    logIndex?: number | null,
    txIndex?: number,
    transferIndex?: number
  ): string {
    const logPart = typeof logIndex === 'number' ? logIndex.toString() : 'na';
    const txPart = typeof txIndex === 'number' ? txIndex.toString() : 'na';
    const transferPart = typeof transferIndex === 'number' ? transferIndex.toString() : 'na';
    return `${walletId}:${hash}:${logPart}:${txPart}:${transferPart}`;
  }

  private shortenAddress(address: string): string {
    if (!address) return 'Unknown';
    const normalized = address.toLowerCase();
    if (normalized.length < 12) return normalized;
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
  }

  private resolveDisplayName(address: string, nameMap: Map<string, string>): string {
    if (!address) return 'Unknown';
    const normalized = address.toLowerCase();
    const named = nameMap.get(normalized);
    return named || this.shortenAddress(normalized);
  }

  private async buildNameMap(mainAddress: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const normalizedMain = mainAddress.toLowerCase();
    const mainWalletName = INITIAL_WALLETS.find(w => w.id === MAIN_WALLET_ID)?.name || 'Main Wallet';
    map.set(normalizedMain, mainWalletName);

    try {
      const units = await ManagedUnitsService.getAll();
      units.forEach(unit => {
        if (unit.address) {
          map.set(unit.address.toLowerCase(), unit.name);
        }
      });
    } catch (error) {
      console.warn('[TransactionService] Failed to load managed units for name map:', error);
    }

    return map;
  }

  private formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 24) {
        if (date.getDate() === now.getDate()) {
            return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else {
             return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
    } else if (diffHours < 48) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  
  async clearCache(safeAddress: string) {
    const normalizedAddress = ethers.getAddress(safeAddress);
    const storageKey = `${CACHE_KEY_PREFIX}${normalizedAddress}`;
    await AsyncStorage.removeItem(storageKey);
  }

  async clearAllCache() {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const transactionKeys = allKeys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
      if (transactionKeys.length > 0) {
        await AsyncStorage.multiRemove(transactionKeys);
      }
    } catch (error) {
      console.error('[TransactionService] Failed to clear transaction cache:', error);
    }
  }
}

export const transactionService = new TransactionService();
