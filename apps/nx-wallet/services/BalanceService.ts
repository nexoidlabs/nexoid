import AsyncStorage from '@react-native-async-storage/async-storage';
import { wdkService } from './WDKService';
import { nexoidService } from './NexoidService';

export interface BalanceState {
  [address: string]: string; // address -> balance string
}

const STORAGE_KEY = 'storage:balances';

class BalanceService {
  private balances: BalanceState = {};
  private listeners: (() => void)[] = [];
  private isInitialized = false;

  // OPTIMIZATION: Deduplicate requests and rate limit
  private inFlightRequests = new Map<string, Promise<string | null>>();
  private lastFetchTime = new Map<string, number>();
  private readonly FETCH_COOLDOWN = 30000; // 30 seconds

  constructor() {
    this.loadFromStorage();
  }

  private async loadFromStorage() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.balances = JSON.parse(stored);
        this.emitChange();
      }
      this.isInitialized = true;
    } catch (e) {
      console.error('Failed to load balances from storage', e);
    }
  }

  private async saveToStorage() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.balances));
    } catch (e) {
      console.error('Failed to save balances to storage', e);
    }
  }

  addChangeListener(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emitChange() {
    this.listeners.forEach(l => l());
  }

  getBalance(address: string): string | null {
    if (!address) return null;
    return this.balances[address.toLowerCase()] || null;
  }

  async refreshBalance(address: string, force: boolean = false): Promise<string | null> {
    if (!address) return null;
    const key = address.toLowerCase();

    // Rate limit check
    const now = Date.now();
    const lastFetch = this.lastFetchTime.get(key) || 0;
    if (!force && (now - lastFetch < this.FETCH_COOLDOWN)) {
        return this.getBalance(address);
    }

    // Deduplication check
    if (this.inFlightRequests.has(key)) {
        return this.inFlightRequests.get(key)!;
    }

    const fetchPromise = (async () => {
        try {
          let balanceStr: string;

          // Determine how to fetch based on address type
          // If it matches Safe address, use NexoidService
          const safeAddr = nexoidService.getSafeAddress();
          if (safeAddr && key === safeAddr.toLowerCase() && nexoidService.isReady()) {
            balanceStr = await nexoidService.getUSDTBalance();
          } else {
            // Otherwise use WDK for EOA/agent addresses
            balanceStr = await wdkService.getUSDTBalanceForAddressFormatted('ethereum', address);
          }

          // Update state
          if (balanceStr) {
            this.balances[key] = balanceStr;
            this.lastFetchTime.set(key, Date.now());
            this.saveToStorage();
            this.emitChange();
          }
          return balanceStr;

        } catch (error) {
          return this.getBalance(address); // Return existing if failed
        } finally {
            this.inFlightRequests.delete(key);
        }
    })();

    this.inFlightRequests.set(key, fetchPromise);
    return fetchPromise;
  }

  async refreshBalances(addresses: string[]) {
    await Promise.all(addresses.map(addr => this.refreshBalance(addr)));
  }
}

export const balanceService = new BalanceService();
