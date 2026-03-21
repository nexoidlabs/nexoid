import { ethers } from 'ethers';

export type SupportedChain = 'ethereum';

interface RPCEndpoint {
  url: string;
  name: string;
  priority: number;
  lastFailure?: number;
}

interface ChainRPCs {
  primary: RPCEndpoint[];
  fallback: RPCEndpoint[];
}

class RPCProviderService {
  private providers: Map<SupportedChain, ethers.JsonRpcProvider> = new Map();
  private currentEndpoints: Map<SupportedChain, RPCEndpoint> = new Map();
  private failureThreshold = 3;
  private failureCount: Map<string, number> = new Map();

  private rpcConfig: Record<SupportedChain, ChainRPCs> = {
    ethereum: {
      primary: [
        { url: 'https://ethereum-sepolia-rpc.publicnode.com', name: 'PublicNode Sepolia', priority: 1 },
        { url: 'https://rpc.sepolia.org', name: 'Sepolia RPC', priority: 2 },
        { url: 'https://eth-sepolia.g.alchemy.com/v2/demo', name: 'Alchemy Sepolia', priority: 3 },
      ],
      fallback: [
        { url: 'https://rpc2.sepolia.org', name: 'Sepolia RPC 2', priority: 10 },
        { url: 'https://sepolia.drpc.org', name: 'dRPC Sepolia', priority: 11 },
      ]
    },
  };

  constructor() {}

  async getProvider(chain: SupportedChain): Promise<ethers.JsonRpcProvider> {
    const cached = this.providers.get(chain);
    if (cached) {
      const endpoint = this.currentEndpoints.get(chain);
      if (endpoint && !this.isEndpointDown(endpoint.url)) {
        return cached;
      }
    }

    const allEndpoints = [
      ...this.rpcConfig[chain].primary,
      ...this.rpcConfig[chain].fallback
    ];

    allEndpoints.sort((a, b) => {
      const aDown = this.isEndpointDown(a.url);
      const bDown = this.isEndpointDown(b.url);
      if (aDown && !bDown) return 1;
      if (!aDown && bDown) return -1;
      return a.priority - b.priority;
    });

    for (const endpoint of allEndpoints) {
      try {
        console.log(`[RPCProvider] Trying ${endpoint.name} for ${chain}...`);
        const provider = new ethers.JsonRpcProvider(endpoint.url);
        await provider.getNetwork();
        console.log(`[RPCProvider] ✓ Connected to ${endpoint.name} (${chain})`);
        this.providers.set(chain, provider);
        this.currentEndpoints.set(chain, endpoint);
        this.resetFailureCount(endpoint.url);
        return provider;
      } catch (error: any) {
        console.warn(`[RPCProvider] ✗ ${endpoint.name} failed:`, error.message);
        this.recordFailure(endpoint.url);
      }
    }

    console.error(`[RPCProvider] All endpoints exhausted for ${chain}, using last attempted`);
    const fallbackEndpoint = allEndpoints[0];
    const provider = new ethers.JsonRpcProvider(fallbackEndpoint.url);
    this.providers.set(chain, provider);
    this.currentEndpoints.set(chain, fallbackEndpoint);
    return provider;
  }

  async retryWithFallback<T>(
    chain: SupportedChain,
    operation: (provider: ethers.JsonRpcProvider) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const provider = await this.getProvider(chain);
        return await operation(provider);
      } catch (error: any) {
        lastError = error;
        const currentEndpoint = this.currentEndpoints.get(chain);
        console.warn(`[RPCProvider] Attempt ${attempt} failed:`, error.message);
        if (currentEndpoint) {
          this.recordFailure(currentEndpoint.url);
          this.providers.delete(chain);
        }
        if (attempt < maxRetries) {
          const delayMs = 1000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
  }

  private recordFailure(endpoint: string): void {
    const count = (this.failureCount.get(endpoint) || 0) + 1;
    this.failureCount.set(endpoint, count);
  }

  private resetFailureCount(endpoint: string): void {
    this.failureCount.delete(endpoint);
  }

  private isEndpointDown(endpoint: string): boolean {
    const count = this.failureCount.get(endpoint) || 0;
    return count >= this.failureThreshold;
  }

  clearCache(): void {
    this.providers.clear();
    this.currentEndpoints.clear();
    this.failureCount.clear();
  }

  getCurrentEndpoint(chain: SupportedChain): RPCEndpoint | undefined {
    return this.currentEndpoints.get(chain);
  }

  getAllEndpoints(chain: SupportedChain): RPCEndpoint[] {
    return [
      ...this.rpcConfig[chain].primary,
      ...this.rpcConfig[chain].fallback
    ];
  }

  getEndpointHealth(endpoint: string): { isDown: boolean; failureCount: number } {
    const count = this.failureCount.get(endpoint) || 0;
    return { isDown: count >= this.failureThreshold, failureCount: count };
  }
}

export const rpcProviderService = new RPCProviderService();
