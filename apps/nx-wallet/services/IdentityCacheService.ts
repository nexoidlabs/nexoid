import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache entry with timestamp and data
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Default TTL: 15 minutes (900 seconds)
const DEFAULT_TTL_SECONDS = 900;

class IdentityCacheService {
  private memoryCache = new Map<string, CacheEntry<any>>();

  /**
   * Generate cache key for managed identities
   */
  private getManagedIdsKey(): string {
    return 'cache:managed-ids';
  }

  /**
   * Generate cache key for registry identity details
   */
  private getRegistryKey(identityId: string): string {
    return `cache:registry:${identityId}`;
  }

  /**
   * Generate cache key for delegates
   */
  private getDelegatesKey(identityId: string): string {
    return `cache:delegates:${identityId}`;
  }

  /**
   * Generate cache key for USDT balance (Safe)
   */
  private getSafeUSDTBalanceKey(): string {
    return 'cache:usdt-balance:safe';
  }

  /**
   * Generate cache key for token balance by address
   */
  private getTokenBalanceKey(address: string, tokenAddress: string): string {
    return `cache:token-balance:${address.toLowerCase()}:${tokenAddress.toLowerCase()}`;
  }

  /**
   * Check if a cached entry is still valid (not expired)
   */
  private isValid<T>(entry: CacheEntry<T>, ttlSeconds: number = DEFAULT_TTL_SECONDS): boolean {
    const now = Date.now();
    const age = (now - entry.timestamp) / 1000;
    return age < ttlSeconds;
  }

  /**
   * Get from cache (memory first, then AsyncStorage)
   */
  async get<T>(key: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<T | null> {
    try {
      // Try memory cache first
      const memEntry = this.memoryCache.get(key);
      if (memEntry && this.isValid(memEntry, ttlSeconds)) {
        return memEntry.data as T;
      }

      // Try AsyncStorage
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const entry = JSON.parse(stored) as CacheEntry<T>;
        if (this.isValid(entry, ttlSeconds)) {
          // Refresh memory cache
          this.memoryCache.set(key, entry);
          return entry.data;
        } else {
          // Expired, remove from storage
          await AsyncStorage.removeItem(key);
        }
      }

      // Clear from memory if expired
      this.memoryCache.delete(key);
      return null;
    } catch (error) {
      console.error(`[IdentityCacheService] Error getting cache for ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cache entry (both memory and AsyncStorage)
   */
  async set<T>(key: string, data: T): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
      };

      // Update memory cache
      this.memoryCache.set(key, entry);

      // Persist to AsyncStorage
      await AsyncStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      console.error(`[IdentityCacheService] Error setting cache for ${key}:`, error);
    }
  }

  /**
   * Get cache with stale-while-revalidate pattern
   * Returns cached value immediately (if valid) and invalidation flag
   */
  async getStaleWhileRevalidate<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
  ): Promise<{ data: T | null; shouldRevalidate: boolean }> {
    try {
      // Try to get from cache
      const cached = await this.get<T>(key, ttlSeconds);

      if (cached) {
        console.log(`[IdentityCacheService] Cache HIT for ${key}`);
        // Check if we should revalidate in the background
        const memEntry = this.memoryCache.get(key);
        if (memEntry) {
          const age = (Date.now() - memEntry.timestamp) / 1000;
          // Revalidate if older than 75% of TTL
          const shouldRevalidate = age > ttlSeconds * 0.75;
          if (shouldRevalidate) console.log(`[IdentityCacheService] Revalidation needed for ${key} (age: ${age.toFixed(1)}s)`);
          return { data: cached, shouldRevalidate };
        }
        return { data: cached, shouldRevalidate: false };
      }

      console.log(`[IdentityCacheService] Cache MISS for ${key}`);
      // No cache, fetch fresh data
      const fresh = await fetchFn();
      await this.set(key, fresh);
      return { data: fresh, shouldRevalidate: false };
    } catch (error) {
      console.error(`[IdentityCacheService] Error in getStaleWhileRevalidate for ${key}:`, error);
      // On error, try to return any stale data
      const stale = await this.get<T>(key, Infinity); // Get regardless of TTL
      return { data: stale, shouldRevalidate: true };
    }
  }

  /**
   * Invalidate specific cache key
   */
  async invalidate(key: string): Promise<void> {
    try {
      this.memoryCache.delete(key);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`[IdentityCacheService] Error invalidating cache for ${key}:`, error);
    }
  }

  /**
   * Invalidate multiple keys
   */
  async invalidateMultiple(keys: string[]): Promise<void> {
    try {
      keys.forEach(key => this.memoryCache.delete(key));
      await AsyncStorage.multiRemove(keys);
    } catch (error) {
      console.error(`[IdentityCacheService] Error invalidating multiple cache keys:`, error);
    }
  }

  /**
   * Invalidate all identity-related caches
   */
  async invalidateAll(): Promise<void> {
    try {
      // Get all keys from AsyncStorage that start with "cache:"
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(key => key.startsWith('cache:'));
      
      // Clear memory cache
      this.memoryCache.clear();
      
      // Clear AsyncStorage
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (error) {
      console.error(`[IdentityCacheService] Error invalidating all cache:`, error);
    }
  }

  /**
   * Invalidate caches for a specific identity
   */
  async invalidateIdentity(identityId: string): Promise<void> {
    const keysToInvalidate = [
      this.getRegistryKey(identityId),
      this.getDelegatesKey(identityId),
      // Also invalidate managed IDs list since this identity might be added/removed
      this.getManagedIdsKey(),
    ];
    await this.invalidateMultiple(keysToInvalidate);
  }

  /**
   * Cache helpers for specific data types
   */
  async getManagedIds(
    fetchFn: () => Promise<string[]>
  ): Promise<{ data: string[] | null; shouldRevalidate: boolean }> {
    return this.getStaleWhileRevalidate(this.getManagedIdsKey(), fetchFn);
  }

  async setManagedIds(ids: string[]): Promise<void> {
    await this.set(this.getManagedIdsKey(), ids);
  }

  async getRegistryIdentity(
    identityId: string,
    fetchFn: () => Promise<any>
  ): Promise<{ data: any | null; shouldRevalidate: boolean }> {
    return this.getStaleWhileRevalidate(this.getRegistryKey(identityId), fetchFn);
  }

  async setRegistryIdentity(identityId: string, data: any): Promise<void> {
    await this.set(this.getRegistryKey(identityId), data);
  }

  async getDelegates(
    identityId: string,
    fetchFn: () => Promise<string[]>
  ): Promise<{ data: string[] | null; shouldRevalidate: boolean }> {
    return this.getStaleWhileRevalidate(this.getDelegatesKey(identityId), fetchFn);
  }

  async setDelegates(identityId: string, delegates: string[]): Promise<void> {
    await this.set(this.getDelegatesKey(identityId), delegates);
  }

  /**
   * Cache helpers for token balances
   */
  async getSafeUSDTBalance(
    fetchFn: () => Promise<string>
  ): Promise<{ data: string | null; shouldRevalidate: boolean }> {
    // Use shorter TTL for balances (5 minutes) since they change more frequently
    return this.getStaleWhileRevalidate(this.getSafeUSDTBalanceKey(), fetchFn, 300);
  }

  async setSafeUSDTBalance(balance: string): Promise<void> {
    await this.set(this.getSafeUSDTBalanceKey(), balance);
  }

  async getTokenBalance(
    address: string,
    tokenAddress: string,
    fetchFn: () => Promise<string>
  ): Promise<{ data: string | null; shouldRevalidate: boolean }> {
    // Use shorter TTL for balances (5 minutes) since they change more frequently
    return this.getStaleWhileRevalidate(
      this.getTokenBalanceKey(address, tokenAddress),
      fetchFn,
      300
    );
  }

  async setTokenBalance(address: string, tokenAddress: string, balance: string): Promise<void> {
    await this.set(this.getTokenBalanceKey(address, tokenAddress), balance);
  }

  /**
   * Invalidate all token balance caches
   */
  async invalidateTokenBalances(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const balanceKeys = allKeys.filter(key => key.startsWith('cache:usdt-balance:') || key.startsWith('cache:usdc-balance:') || key.startsWith('cache:token-balance:'));
      
      balanceKeys.forEach(key => this.memoryCache.delete(key));
      
      if (balanceKeys.length > 0) {
        await AsyncStorage.multiRemove(balanceKeys);
      }
    } catch (error) {
      console.error(`[IdentityCacheService] Error invalidating token balances:`, error);
    }
  }
}

export const identityCacheService = new IdentityCacheService();
