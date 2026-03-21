import WDK from '@tetherto/wdk';
import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { identityCacheService } from './IdentityCacheService';
import { USDT_ADDRESS_SEPOLIA, USDT_ABI } from './ContractABIs';

export type SupportedChain = 'ethereum';

const CACHED_ADDRESS_KEY = 'cache:wdk:address:ethereum';

// USDT contract addresses for supported chains
const USDT_ADDRESSES: Record<SupportedChain, string> = {
  ethereum: USDT_ADDRESS_SEPOLIA,
};

// RPC providers — Sepolia only
const RPC_PROVIDERS: Record<SupportedChain, string> = {
  ethereum: 'https://ethereum-sepolia-rpc.publicnode.com',
};

class WDKService {
  private wdk: any = null;
  private isInitialized = false;
  private providerCache: Map<SupportedChain, ethers.JsonRpcProvider> = new Map();

  constructor() {}

  async initialize(existingSeedPhrase?: string, forceReinitialize: boolean = false): Promise<string> {
    if (this.isInitialized && this.wdk && !forceReinitialize) {
        console.warn('WDKService is already initialized. Use forceReinitialize=true to reinitialize.');
        return '';
    }

    let seedPhrase = existingSeedPhrase;
    if (!seedPhrase) {
      // @ts-ignore
      seedPhrase = WDK.getRandomSeedPhrase();
    }

    console.log(forceReinitialize ? 'Reinitializing WDK...' : 'Initializing WDK...');

    this.wdk = new WDK(seedPhrase)
      .registerWallet('ethereum', WalletManagerEvm, {
        provider: RPC_PROVIDERS.ethereum
      });

    this.isInitialized = true;
    console.log('WDK Initialized successfully (Ethereum Sepolia)');

    setImmediate(() => {
      console.log('[WDKService] Caching WDK address in background...');
      this.getAddress('ethereum').then(address => {
          console.log(`[WDKService] Address cached: ${address}`);
          AsyncStorage.setItem(CACHED_ADDRESS_KEY, address).catch(e =>
              console.warn('Failed to cache WDK address:', e)
          );
      }).catch(e => console.warn('Failed to fetch address for caching:', e));
    });

    return seedPhrase!;
  }

  getWDKInstance() {
    if (!this.wdk) {
      throw new Error('WDKService not initialized. Call initialize() first.');
    }
    return this.wdk;
  }

  private getProvider(chain: SupportedChain): ethers.JsonRpcProvider {
    if (!this.providerCache.has(chain)) {
      const provider = new ethers.JsonRpcProvider(RPC_PROVIDERS[chain], undefined, {
        staticNetwork: new ethers.Network('sepolia', 11155111),
        batchMaxCount: 1
      });
      this.providerCache.set(chain, provider);
    }
    return this.providerCache.get(chain)!;
  }

  async getAccount(chain: SupportedChain, index = 0) {
    if (!this.wdk) throw new Error('WDK not initialized');
    return await this.wdk.getAccount(chain, index);
  }

  async getAddress(chain: SupportedChain, index = 0): Promise<string> {
    try {
      const account = await this.getAccount(chain, index);
      return await account.getAddress();
    } catch (e) {
      console.warn(`[WDKService] Failed to get address from WDK for ${chain}:`, e);
      const cached = await AsyncStorage.getItem(CACHED_ADDRESS_KEY);
      if (cached) {
          console.log('[WDKService] Returning cached address fallback');
          return cached;
      }
      throw e;
    }
  }

  async getNativeBalance(chain: SupportedChain, index = 0): Promise<string> {
    const account = await this.getAccount(chain, index);
    const balance = await account.getBalance();
    return balance.toString();
  }

  async getNativeBalanceFormatted(chain: SupportedChain, index = 0): Promise<string> {
    const balanceWei = await this.getNativeBalance(chain, index);
    const balanceEth = Number(balanceWei) / 1e18;
    return balanceEth.toFixed(6);
  }

  async getBalanceForAddress(chain: SupportedChain, address: string): Promise<string> {
    const provider = this.getProvider(chain);
    const balance = await provider.getBalance(address);
    return balance.toString();
  }

  async getBalanceForAddressFormatted(chain: SupportedChain, address: string): Promise<string> {
    const balanceWei = await this.getBalanceForAddress(chain, address);
    const balanceEth = Number(balanceWei) / 1e18;
    return balanceEth.toFixed(6);
  }

  async estimateFee(chain: SupportedChain, to: string, amount: string | number | bigint, index = 0) {
    const account = await this.getAccount(chain, index);
    const value = typeof amount === 'bigint' ? amount : BigInt(amount);
    const quote = await account.quoteSendTransaction({ to, value });
    return quote.fee.toString();
  }

  async getTokenBalance(chain: SupportedChain, tokenAddress: string, index = 0): Promise<string> {
    const ownerAddress = await this.getAddress(chain, index);
    const provider = this.getProvider(chain);
    const contract = new ethers.Contract(tokenAddress, USDT_ABI, provider);
    const balance = await contract.balanceOf(ownerAddress);
    return balance.toString();
  }

  async getUSDTBalance(chain: SupportedChain, index = 0): Promise<string> {
    const usdtAddress = USDT_ADDRESSES[chain];
    if (!usdtAddress) {
      throw new Error(`USDT not supported on chain: ${chain}`);
    }
    return await this.getTokenBalance(chain, usdtAddress, index);
  }

  async getUSDTBalanceFormatted(chain: SupportedChain, index = 0): Promise<string> {
    try {
      let address: string;
      try {
        address = await this.getAddress(chain, index);
      } catch (e) {
        const cached = await AsyncStorage.getItem(CACHED_ADDRESS_KEY);
        if (cached) {
            address = cached;
        } else {
            throw e;
        }
      }
      return await this.getUSDTBalanceForAddressFormatted(chain, address);
    } catch (error) {
      throw error;
    }
  }

  async getUSDTBalanceForAddress(chain: SupportedChain, address: string): Promise<string> {
    const usdtAddress = USDT_ADDRESSES[chain];
    if (!usdtAddress) {
      throw new Error(`USDT not supported on chain: ${chain}`);
    }
    console.log(`[WDKService] Fetching USDT balance for ${address} on ${chain}`);
    const start = Date.now();
    const provider = this.getProvider(chain);
    const contract = new ethers.Contract(usdtAddress, USDT_ABI, provider);
    const balance = await contract.balanceOf(address);
    console.log(`[WDKService] USDT balance fetched in ${Date.now() - start}ms`);
    return balance.toString();
  }

  async getUSDTBalanceForAddressFormatted(chain: SupportedChain, address: string): Promise<string> {
    const usdtAddress = USDT_ADDRESSES[chain];
    if (!usdtAddress) {
      throw new Error(`USDT not supported on chain: ${chain}`);
    }
    const balance = await this.getUSDTBalanceForAddress(chain, address);
    const balanceFormatted = ethers.formatUnits(balance, 6);
    return Number(balanceFormatted).toFixed(2);
  }

  async sendTransfer(chain: SupportedChain, to: string, amount: string | number | bigint, index = 0) {
     const account = await this.getAccount(chain, index);
     const value = typeof amount === 'bigint' ? amount : BigInt(amount);
     console.log(`Sending ${value} on ${chain} to ${to}`);
     const result = await account.sendTransaction({ to, value });
     return result;
  }

  async sendUSDTTransfer(chain: SupportedChain, to: string, amount: string | number, index = 0) {
    const account = await this.getAccount(chain, index);
    const usdtAddress = USDT_ADDRESSES[chain];
    if (!usdtAddress) {
      throw new Error(`USDT not supported on chain: ${chain}`);
    }
    const amountInSmallestUnits = BigInt(Math.floor(Number(amount) * 1e6));
    // Use USDT-specific ABI (no returns(bool)) to avoid decoding errors
    const iface = new ethers.Interface(USDT_ABI);
    const data = iface.encodeFunctionData('transfer', [to, amountInSmallestUnits]);
    console.log(`Sending ${amount} USDT on ${chain} to ${to}`);
    const result = await account.sendTransaction({
      to: usdtAddress,
      data: data,
      value: 0n
    });
    await identityCacheService.invalidateTokenBalances();
    return result;
  }

  async waitForTransaction(chain: SupportedChain, hash: string, confirmations = 1) {
    const provider = this.getProvider(chain);
    return await provider.waitForTransaction(hash, confirmations);
  }
}

export const wdkService = new WDKService();
