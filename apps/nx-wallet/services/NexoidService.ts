import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import { identityCacheService } from './IdentityCacheService';
import { wdkService } from './WDKService';
import { transactionService } from './TransactionService';
import { Transaction } from '@/constants/MockData';
import {
  IDENTITY_REGISTRY_ADDRESS,
  NEXOID_MODULE_ADDRESS,
  ALLOWANCE_MODULE_ADDRESS,
  USDT_ADDRESS_SEPOLIA,
  IDENTITY_REGISTRY_ABI,
  NEXOID_MODULE_ABI,
  ALLOWANCE_MODULE_ABI,
  ALLOWANCE_MODULE_WRITE_ABI,
  USDT_ABI,
  SAFE_ABI,
} from './ContractABIs';
import type { IdentityRecord, AgentRecord, TokenAllowance } from '@/types/nexoid';

// Sepolia RPC endpoints
const RPC_ENDPOINTS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://rpc2.sepolia.org',
  'https://sepolia.drpc.org',
];

/**
 * EIP-1193 Provider Adapter
 * Wraps WDK account to provide EIP-1193 compliant interface for Safe SDK
 */
class WDKProviderAdapter {
  private account: any;
  private signer: any;
  private provider: ethers.JsonRpcProvider;

  constructor(account: any, provider: ethers.JsonRpcProvider) {
    this.account = account;
    this.provider = provider;
    this.signer = account._account || account;
  }

  async request({ method, params }: { method: string; params?: any[] }): Promise<any> {
    switch (method) {
      case 'eth_accounts':
        const addr = await this.account.getAddress();
        return [ethers.getAddress(addr)];

      case 'eth_chainId':
        const network = await this.provider.getNetwork();
        return `0x${network.chainId.toString(16)}`;

      case 'eth_signTypedData_v4':
      case 'eth_signTypedData':
        if (!params || params.length < 2) {
          throw new Error('Invalid params for eth_signTypedData');
        }
        const typedData = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
        const { EIP712Domain, ...signingTypes } = typedData.types;
        const signTypedData = this.signer.signTypedData || this.account.signTypedData;
        const signTypedDataV4 = this.signer.signTypedDataV4 || this.account.signTypedDataV4;
        if (typeof signTypedData === 'function') {
          return await signTypedData.call(this.signer, typedData.domain, signingTypes, typedData.message);
        } else if (typeof signTypedDataV4 === 'function') {
          return await signTypedDataV4.call(this.signer, {
            domain: typedData.domain,
            types: typedData.types,
            message: typedData.message,
            primaryType: typedData.primaryType || 'SafeTx'
          });
        }
        throw new Error(`Signer does not support typed data signing`);

      case 'personal_sign':
        if (!params || params.length < 1) throw new Error('Invalid params for personal_sign');
        const signMessage = this.signer.signMessage || this.account.signMessage;
        if (typeof signMessage !== 'function') throw new Error('Signer does not support signMessage');
        return await signMessage.call(this.signer, params[0]);

      case 'eth_sendTransaction':
        if (!params || params.length < 1) throw new Error('Invalid params for eth_sendTransaction');
        const sendTransaction = this.account.sendTransaction || this.signer.sendTransaction;
        if (typeof sendTransaction !== 'function') throw new Error('Account does not support sendTransaction');
        const result = await sendTransaction.call(this.account, params[0]);
        return result.hash;

      case 'eth_blockNumber':
        return await this.provider.getBlockNumber();

      case 'eth_getBalance':
        if (!params || params.length < 1) throw new Error('Invalid params');
        const balance = await this.provider.getBalance(params[0]);
        return `0x${balance.toString(16)}`;

      case 'eth_getTransactionCount':
        if (!params || params.length < 1) throw new Error('Invalid params');
        const count = await this.provider.getTransactionCount(params[0]);
        return `0x${count.toString(16)}`;

      case 'eth_call':
      case 'eth_estimateGas':
      case 'eth_getCode':
      case 'eth_getStorageAt':
      case 'eth_getTransactionByHash':
      case 'eth_getTransactionReceipt':
        return await this.provider.send(method, params || []);

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  on() {}
  removeListener() {}
}

/**
 * NexoidService — replaces SafeService
 * Mirrors NexoidClient from core-client but uses ethers.js + Safe Protocol Kit + WDK
 */
class NexoidService {
  private protocolKit: Safe | null = null;
  private safeAddress: string | null = null;
  private moduleAddress: string = NEXOID_MODULE_ADDRESS;
  private registryAddress: string = IDENTITY_REGISTRY_ADDRESS;
  private allowanceModuleAddress: string = ALLOWANCE_MODULE_ADDRESS;
  private isInitialized = false;
  private provider: ethers.JsonRpcProvider;
  private listeners: (() => void)[] = [];
  private contractCache: Map<string, ethers.Contract> = new Map();
  private inFlightRequests = new Map<string, Promise<any>>();

  constructor() {
    this.provider = this.createProvider();
  }

  private createProvider(): ethers.JsonRpcProvider {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[0], undefined, {
      staticNetwork: new ethers.Network('sepolia', 11155111),
      batchMaxCount: 1
    });

    // Intercept for retry with fallback endpoints
    const originalSend = provider.send.bind(provider);
    let currentProvider = provider;
    let currentSend = originalSend;

    provider.send = async (method: string, params: any[]): Promise<any> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await currentSend(method, params);
        } catch (error: any) {
          const msg = error.message || '';
          const isRetryable = msg.includes('429') || msg.includes('timeout') || msg.includes('ECONNREFUSED');
          if (isRetryable && attempt < 2 && attempt + 1 < RPC_ENDPOINTS.length) {
            const nextRpc = RPC_ENDPOINTS[attempt + 1];
            console.log(`[NexoidService] Switching to RPC: ${nextRpc}`);
            currentProvider = new ethers.JsonRpcProvider(nextRpc, undefined, {
              staticNetwork: new ethers.Network('sepolia', 11155111),
              batchMaxCount: 1
            });
            currentSend = currentProvider.send.bind(currentProvider);
            continue;
          }
          throw error;
        }
      }
      throw new Error('All RPC attempts failed');
    };

    return provider;
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  addChangeListener(listener: () => void) {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emitChange() {
    this.listeners.forEach(l => l());
  }

  configure(safeAddress: string, moduleAddress?: string, registryAddress?: string) {
    this.safeAddress = ethers.getAddress(safeAddress);
    this.moduleAddress = ethers.getAddress(moduleAddress || this.moduleAddress);
    this.registryAddress = ethers.getAddress(registryAddress || this.registryAddress);
    this.emitChange();
  }

  async initialize(safeAddress: string, moduleAddress?: string, registryAddress?: string): Promise<void> {
    const checksummed = ethers.getAddress(safeAddress);
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('NexoidService initialization timeout (15s)')), 15000)
    );

    try {
      this.configure(checksummed, moduleAddress, registryAddress);
      await Promise.race([this._performInit(checksummed), timeout]);
      this.isInitialized = true;
      console.log('NexoidService initialized successfully on Ethereum Sepolia');
    } catch (error) {
      console.error('NexoidService init error:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  private async _performInit(safeAddress: string): Promise<void> {
    console.log('[NexoidService] Initializing...');
    const start = Date.now();

    // Get WDK account for Ethereum chain
    const account = await wdkService.getAccount('ethereum', 0);
    const signerAddress = ethers.getAddress(await account.getAddress());
    console.log('[NexoidService] Signer (WDK) Address:', signerAddress);

    // Create EIP-1193 provider adapter wrapping WDK account
    const providerAdapter = new WDKProviderAdapter(account, this.provider);

    // Initialize Safe Protocol Kit
    this.protocolKit = await Safe.init({
      provider: providerAdapter as any,
      signer: signerAddress,
      safeAddress,
    });

    this.safeAddress = safeAddress;
    console.log(`[NexoidService] Initialized in ${Date.now() - start}ms`);
  }

  private getCachedContract(address: string, abi: any, key: string): ethers.Contract {
    if (!this.contractCache.has(key)) {
      this.contractCache.set(key, new ethers.Contract(address, abi, this.provider));
    }
    return this.contractCache.get(key)!;
  }

  private async deduplicateRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.inFlightRequests.has(key)) return this.inFlightRequests.get(key)!;
    const promise = fn().finally(() => this.inFlightRequests.delete(key));
    this.inFlightRequests.set(key, promise);
    return promise;
  }

  getSafeAddress(): string | null { return this.safeAddress; }
  isReady(): boolean { return this.isInitialized && this.protocolKit !== null && this.safeAddress !== null; }
  isIdentityReady(): boolean { return this.isReady() && !!this.moduleAddress && !!this.registryAddress; }

  // ============================================
  // SAFE TRANSACTION EXECUTION (ported from SafeService)
  // ============================================

  async executeSafeTransaction(to: string, data: string, targetSafeAddress?: string): Promise<string> {
    if (!this.protocolKit || !this.safeAddress) {
      throw new Error('NexoidService not initialized');
    }

    // If targeting a different Safe (e.g., agent's Safe), re-init protocol kit temporarily
    let kit = this.protocolKit;
    if (targetSafeAddress && ethers.getAddress(targetSafeAddress) !== ethers.getAddress(this.safeAddress)) {
      const account = await wdkService.getAccount('ethereum', 0);
      const signerAddress = ethers.getAddress(await account.getAddress());
      const providerAdapter = new WDKProviderAdapter(account, this.provider);
      kit = await Safe.init({
        provider: providerAdapter as any,
        signer: signerAddress,
        safeAddress: ethers.getAddress(targetSafeAddress),
      });
    }

    const safeTx = await kit.createTransaction({
      transactions: [{ to, data, value: '0' }]
    });

    const signedTx = await kit.signTransaction(safeTx);
    const result = await kit.executeTransaction(signedTx);
    console.log('[NexoidService] Transaction executed:', result.hash);
    return result.hash;
  }

  async waitForTransaction(hash: string, confirmations = 1): Promise<any> {
    return await this.provider.waitForTransaction(hash, confirmations);
  }

  // ============================================
  // IDENTITY OPERATIONS
  // ============================================

  async getIdentity(address: string): Promise<IdentityRecord | null> {
    const registry = this.getCachedContract(this.registryAddress, IDENTITY_REGISTRY_ABI, 'registry');
    const registered = await registry.isRegistered(address);
    if (!registered) return null;

    const result = await registry.getIdentity(address);
    return {
      address,
      entityType: Number(result.entityType),
      status: Number(result.status),
      createdAt: Number(result.createdAt),
      metadataHash: result.metadataHash,
      owner: result.owner,
    };
  }

  async isRegistered(address: string): Promise<boolean> {
    const registry = this.getCachedContract(this.registryAddress, IDENTITY_REGISTRY_ABI, 'registry');
    return await registry.isRegistered(address);
  }

  // ============================================
  // AGENT MANAGEMENT (via NexoidModule)
  // ============================================

  async getAgentSafes(): Promise<AgentRecord[]> {
    if (!this.safeAddress) throw new Error('Safe not configured');

    return this.deduplicateRequest('getAgentSafes', async () => {
      const module = this.getCachedContract(this.moduleAddress, NEXOID_MODULE_ABI, 'module');
      const records = await module.getAgentSafes(this.safeAddress);
      return records.map((r: any) => ({
        agentSafe: r.agentSafe,
        agentEOA: r.agentEOA,
        createdAt: Number(r.createdAt),
        scopeHash: r.scopeHash,
        credentialHash: r.credentialHash,
        validUntil: Number(r.validUntil),
        status: Number(r.status),
      }));
    });
  }

  async getAgentRecord(agentSafe: string): Promise<AgentRecord> {
    const module = this.getCachedContract(this.moduleAddress, NEXOID_MODULE_ABI, 'module');
    const r = await module.getAgentRecord(agentSafe);
    return {
      agentSafe: r.agentSafe,
      agentEOA: r.agentEOA,
      createdAt: Number(r.createdAt),
      scopeHash: r.scopeHash,
      credentialHash: r.credentialHash,
      validUntil: Number(r.validUntil),
      status: Number(r.status),
    };
  }

  async isValidAgent(agentSafe: string): Promise<boolean> {
    const module = this.getCachedContract(this.moduleAddress, NEXOID_MODULE_ABI, 'module');
    return await module.isValidAgent(agentSafe);
  }

  async registerAgentSafe(
    agentSafe: string,
    agentEOA: string,
    scopeHash: string,
    credentialHash: string,
    validUntil: number
  ): Promise<string> {
    const iface = new ethers.Interface(NEXOID_MODULE_ABI);
    const data = iface.encodeFunctionData('registerAgentSafe', [
      agentSafe, agentEOA, scopeHash, credentialHash, BigInt(validUntil)
    ]);
    return this.executeSafeTransaction(this.moduleAddress, data);
  }

  async suspendAgent(agentSafe: string): Promise<string> {
    const iface = new ethers.Interface(NEXOID_MODULE_ABI);
    const data = iface.encodeFunctionData('suspendAgent', [agentSafe]);
    return this.executeSafeTransaction(this.moduleAddress, data);
  }

  async revokeAgent(agentSafe: string): Promise<string> {
    const iface = new ethers.Interface(NEXOID_MODULE_ABI);
    const data = iface.encodeFunctionData('revokeAgent', [agentSafe]);
    return this.executeSafeTransaction(this.moduleAddress, data);
  }

  async reactivateAgent(agentSafe: string): Promise<string> {
    const iface = new ethers.Interface(NEXOID_MODULE_ABI);
    const data = iface.encodeFunctionData('reactivateAgent', [agentSafe]);
    return this.executeSafeTransaction(this.moduleAddress, data);
  }

  async updateAgentScope(
    agentSafe: string,
    scopeHash: string,
    credentialHash: string,
    validUntil: number
  ): Promise<string> {
    const iface = new ethers.Interface(NEXOID_MODULE_ABI);
    const data = iface.encodeFunctionData('updateAgentScope', [
      agentSafe, scopeHash, credentialHash, BigInt(validUntil)
    ]);
    return this.executeSafeTransaction(this.moduleAddress, data);
  }

  // ============================================
  // DELEGATION / ALLOWANCE (via AllowanceModule)
  // ============================================

  async addDelegateAndSetAllowance(
    agentSafeAddress: string,
    delegateAddress: string,
    amount: string,
    resetTimeMin: number = 0
  ): Promise<string> {
    const iface = new ethers.Interface(ALLOWANCE_MODULE_WRITE_ABI);
    const rawAmount = ethers.parseUnits(amount, 6);

    // Step 1: Add delegate
    const addData = iface.encodeFunctionData('addDelegate', [delegateAddress]);
    await this.executeSafeTransaction(this.allowanceModuleAddress, addData, agentSafeAddress);

    // Step 2: Set allowance
    const setData = iface.encodeFunctionData('setAllowance', [
      delegateAddress, USDT_ADDRESS_SEPOLIA, rawAmount, resetTimeMin, 0
    ]);
    return this.executeSafeTransaction(this.allowanceModuleAddress, setData, agentSafeAddress);
  }

  async removeDelegate(agentSafeAddress: string, delegateAddress: string): Promise<string> {
    const iface = new ethers.Interface(ALLOWANCE_MODULE_WRITE_ABI);
    const data = iface.encodeFunctionData('removeDelegate', [delegateAddress, true]);
    return this.executeSafeTransaction(this.allowanceModuleAddress, data, agentSafeAddress);
  }

  async getAllDelegates(safeAddress: string): Promise<string[]> {
    const allowance = this.getCachedContract(this.allowanceModuleAddress, ALLOWANCE_MODULE_ABI, 'allowance');
    const allDelegates: string[] = [];
    let start = 0;
    const PAGE_SIZE = 50;

    while (true) {
      const [results, next] = await allowance.getDelegates(safeAddress, start, PAGE_SIZE);
      const valid = results.filter((a: string) => a !== ethers.ZeroAddress);
      allDelegates.push(...valid);
      if (Number(next) === 0 || valid.length < PAGE_SIZE) break;
      start = Number(next);
    }
    return allDelegates;
  }

  async getTokenAllowance(safeAddress: string, delegateAddress: string): Promise<TokenAllowance> {
    const allowance = this.getCachedContract(this.allowanceModuleAddress, ALLOWANCE_MODULE_ABI, 'allowance');
    const raw = await allowance.getTokenAllowance(safeAddress, delegateAddress, USDT_ADDRESS_SEPOLIA);
    // raw is uint256[5]: [amount, spent, resetTimeMin, lastResetMin, nonce]
    const amount = BigInt(raw[0]);
    const spent = BigInt(raw[1]);
    const remaining = amount - spent;
    return {
      amount: ethers.formatUnits(amount, 6),
      spent: ethers.formatUnits(spent, 6),
      remaining: ethers.formatUnits(remaining >= 0n ? remaining : 0n, 6),
      nonce: Number(raw[4]),
      resetTimeMin: Number(raw[2]),
    };
  }

  // ============================================
  // WALLET / TRANSFERS
  // ============================================

  async getUSDTBalance(address?: string): Promise<string> {
    const target = address || this.safeAddress;
    if (!target) throw new Error('No address specified');
    const usdt = this.getCachedContract(USDT_ADDRESS_SEPOLIA, USDT_ABI, 'usdt');
    const raw = await usdt.balanceOf(target);
    return Number(ethers.formatUnits(raw, 6)).toFixed(2);
  }

  async getUSDTBalanceRaw(address?: string): Promise<string> {
    const target = address || this.safeAddress;
    if (!target) throw new Error('No address specified');
    const usdt = this.getCachedContract(USDT_ADDRESS_SEPOLIA, USDT_ABI, 'usdt');
    const raw = await usdt.balanceOf(target);
    return raw.toString();
  }

  async getETHBalance(address?: string): Promise<string> {
    const target = address || this.safeAddress;
    if (!target) throw new Error('No address specified');
    const raw = await this.provider.getBalance(target);
    return ethers.formatEther(raw);
  }

  async sendUSDTTransfer(to: string, amount: string | number): Promise<string> {
    if (!this.protocolKit || !this.safeAddress) throw new Error('NexoidService not initialized');
    if (!ethers.isAddress(to)) throw new Error('Invalid recipient address');

    const rawAmount = BigInt(Math.floor(Number(amount) * 1e6));
    const iface = new ethers.Interface(USDT_ABI);
    const data = iface.encodeFunctionData('transfer', [to, rawAmount]);
    const hash = await this.executeSafeTransaction(USDT_ADDRESS_SEPOLIA, data);
    await identityCacheService.invalidateTokenBalances();
    return hash;
  }

  async proposeUSDTTransfer(to: string, amount: string | number): Promise<any> {
    if (!this.protocolKit || !this.safeAddress) throw new Error('NexoidService not initialized');
    if (!ethers.isAddress(to)) throw new Error('Invalid recipient address');

    const rawAmount = BigInt(Math.floor(Number(amount) * 1e6));
    const iface = new ethers.Interface(USDT_ABI);
    const data = iface.encodeFunctionData('transfer', [to, rawAmount]);

    return await this.protocolKit.createTransaction({
      transactions: [{ to: USDT_ADDRESS_SEPOLIA, data, value: '0' }]
    });
  }

  // ============================================
  // TRANSACTION HISTORY
  // ============================================

  async getCachedUSDTTransactionHistory(): Promise<Transaction[]> {
    if (!this.safeAddress) return [];
    return await transactionService.getCachedTransactions(this.safeAddress);
  }

  async getUSDTTransactionHistory(forceRefresh = false): Promise<Transaction[]> {
    if (!this.safeAddress) return [];
    return await transactionService.getTransactionHistory(this.safeAddress, forceRefresh);
  }

  // ============================================
  // MODULE STATUS CHECKS
  // ============================================

  async isModuleEnabled(moduleAddress: string): Promise<boolean> {
    if (!this.safeAddress) throw new Error('Safe not configured');
    const safe = this.getCachedContract(this.safeAddress, SAFE_ABI, `safe-${this.safeAddress}`);
    return await safe.isModuleEnabled(moduleAddress);
  }

  async isAllowanceModuleEnabled(): Promise<boolean> {
    return this.isModuleEnabled(this.allowanceModuleAddress);
  }

  // ============================================
  // SIGN / EXECUTE (for multi-step flows)
  // ============================================

  async signTransaction(safeTx: any): Promise<any> {
    if (!this.protocolKit) throw new Error('NexoidService not initialized');
    return await this.protocolKit.signTransaction(safeTx);
  }

  async executeTransaction(signedTx: any): Promise<string> {
    if (!this.protocolKit) throw new Error('NexoidService not initialized');
    const result = await this.protocolKit.executeTransaction(signedTx);
    return result.hash;
  }

  // ============================================
  // UTILITY
  // ============================================

  static canonicalHash(obj: Record<string, unknown>): string {
    const sorted = Object.keys(obj).sort();
    const canonical = JSON.stringify(obj, sorted);
    return ethers.keccak256(ethers.toUtf8Bytes(canonical));
  }
}

export const nexoidService = new NexoidService();
