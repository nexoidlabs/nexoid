/**
 * NexoidClient — the single developer interface for all Nexoid operations.
 *
 * Wraps contract operations (identity, delegation, wallet) and Safe smart wallet
 * integration. Used by the CLI and external developers.
 *
 * Two operational modes:
 * - Operator: Deploys Safe, manages agents, sets allowances, sends via Safe owner
 * - Agent: Sends via AllowanceModule within allowance, queries own allowance
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, sepolia, hardhat } from 'viem/chains';
import {
  addressToDID,
  didToAddress,
  EntityType,
  EntityStatus,
  USDT_ETH_MAINNET,
  USDT_ETH_SEPOLIA,
  ALLOWANCE_MODULE,
  type IdentityOps,
  type AgentOps,
  type WalletOps,
  type NexoidDID,
  type Balance,
  type AgentScope,
  type AgentRecord,
  type EmailCredential,
  type TokenAllowance,
} from '@nexoid/nx-core';

import type {
  NexoidClientConfig,
  CreateAgentOpts,
  AgentIdentity,
  UpdateScopeOpts,
  ScopeUpdateResult,
  ValidationResult,
  TransferOpts,
  TransactionResult,
  AllowanceOpts,
} from './types.js';

import {
  createAgent,
  resolveIdentity,
  updateIdentityStatus,
  hashApiKey,
} from './identity.js';
import {
  updateAgentScope,
  revokeAgent,
  suspendAgent,
  reactivateAgent,
  isValidAgent,
  getAgentRecord,
} from './delegation.js';
import {
  getBalance,
  sendUSDTTransfer,
} from './wallet.js';
import {
  initiateEmailVerification,
  completeEmailVerification,
  formatEmailDisclosure,
} from './credentials.js';
import {
  deploySafe,
  enableAllowanceModule,
  deployAgentSafe,
  getAgentSafes,
  fundAgentSafe,
  addDelegateAndSetAllowance,
  updateAllowance,
  sendFromSafe,
  sendViaAllowance,
  getAllowance as getSafeAllowance,
  listDelegates,
  type SafeConfig,
  type SafeDeployResult,
  type AgentSafeDeployResult,
} from './safe.js';
import {
  createProofDomain,
  createProof,
  verifyProof as verifyProofFn,
  isProofExpired,
  type SignedIdentityProof,
  IDENTITY_PROOF_TYPES,
} from './proof.js';

export class NexoidClient {
  private identityOps: IdentityOps;
  private agentOps: AgentOps;
  private walletOps: WalletOps;
  private config: NexoidClientConfig;
  private operatorDid?: NexoidDID;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private isMainnet: boolean;
  private tokenAddress: `0x${string}`;
  private allowanceModuleAddress: `0x${string}`;
  private nexoidModuleAddress: `0x${string}`;

  constructor(config: NexoidClientConfig) {
    this.config = config;

    // Determine chain from RPC URL
    const isLocalhost = config.rpcUrl.includes('localhost') || config.rpcUrl.includes('127.0.0.1');
    this.isMainnet = config.rpcUrl.includes('mainnet');
    const chain = isLocalhost ? hardhat : this.isMainnet ? mainnet : sepolia;
    this.tokenAddress = config.tokenAddress ?? (this.isMainnet ? USDT_ETH_MAINNET : USDT_ETH_SEPOLIA);
    this.allowanceModuleAddress = config.allowanceModuleAddress ?? ALLOWANCE_MODULE.ETH_MAINNET;
    this.nexoidModuleAddress = config.nexoidModuleAddress;

    // Create viem clients
    const publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    const walletClient = config.privateKey
      ? createWalletClient({
          account: privateKeyToAccount(config.privateKey),
          chain,
          transport: http(config.rpcUrl),
        })
      : undefined;

    // Cast to generic types — chain-specific types are compatible at runtime
    this.publicClient = publicClient as unknown as PublicClient;
    this.walletClient = walletClient as unknown as WalletClient | undefined;

    this.identityOps = {
      registryAddress: config.registryAddress,
      publicClient: this.publicClient,
      walletClient: this.walletClient,
    };

    this.agentOps = {
      moduleAddress: config.nexoidModuleAddress,
      publicClient: this.publicClient,
      walletClient: this.walletClient,
    };

    this.walletOps = {
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      tokenAddress: this.tokenAddress,
    };

    // Set operator DID from wallet
    if (walletClient?.account) {
      this.operatorDid = addressToDID(walletClient.account.address as `0x${string}`);
    }
  }

  // ─── Safe Wallet ────────────────────────────────────────────

  /** Build SafeConfig from current client state */
  private getSafeConfig(): SafeConfig {
    if (!this.config.privateKey) throw new Error('Private key required for Safe operations');
    if (!this.walletClient) throw new Error('Wallet client required for Safe operations');
    return {
      rpcUrl: this.config.rpcUrl,
      privateKey: this.config.privateKey,
      publicClient: this.publicClient,
      walletClient: this.walletClient,
      tokenAddress: this.tokenAddress,
      allowanceModuleAddress: this.allowanceModuleAddress,
    };
  }

  /**
   * Deploy a new Safe wallet for the operator.
   * Creates a 1-of-1 Safe and enables AllowanceModule.
   * Returns the Safe address to be stored in config.
   */
  async deploySafe(): Promise<SafeDeployResult> {
    return deploySafe(this.getSafeConfig());
  }

  /**
   * Enable AllowanceModule on an existing Safe (if not already enabled).
   */
  async enableAllowanceModule(safeAddress: `0x${string}`): Promise<`0x${string}`> {
    return enableAllowanceModule(this.getSafeConfig(), safeAddress);
  }

  // ─── Agent Safe ───────────────────────────────────────────────

  /**
   * Deploy a new Safe for an agent.
   * Creates a 1-of-1 Safe (operator as owner), enables AllowanceModule,
   * adds agent EOA as delegate, registers with NexoidModule.
   */
  async deployAgentSafe(
    agentEOA: `0x${string}`,
    operatorSafeAddress: `0x${string}`
  ): Promise<AgentSafeDeployResult> {
    return deployAgentSafe(
      this.getSafeConfig(),
      operatorSafeAddress,
      agentEOA,
      this.nexoidModuleAddress
    );
  }

  /**
   * Get all agent Safes registered under an operator Safe.
   */
  async getAgentSafes(
    operatorSafeAddress: `0x${string}`
  ): Promise<Array<{ agentSafe: `0x${string}`; agentEOA: `0x${string}`; createdAt: bigint; scopeHash: `0x${string}`; credentialHash: `0x${string}`; validUntil: bigint; status: number }>> {
    return getAgentSafes(this.publicClient, this.nexoidModuleAddress, operatorSafeAddress);
  }

  /**
   * Send USDT from operator's Safe to an agent's Safe.
   */
  async fundAgentSafe(
    operatorSafeAddress: `0x${string}`,
    agentSafeAddress: `0x${string}`,
    amount: string
  ): Promise<`0x${string}`> {
    return fundAgentSafe(
      this.getSafeConfig(),
      operatorSafeAddress,
      agentSafeAddress,
      amount
    );
  }

  /** Get the NexoidModule address being used */
  getNexoidModuleAddress(): `0x${string}` {
    return this.nexoidModuleAddress;
  }

  // ─── Identity ───────────────────────────────────────────────

  /** Create an agent identity under this operator */
  async createAgent(opts: CreateAgentOpts): Promise<AgentIdentity> {
    if (!this.operatorDid) throw new Error('Operator DID not set — provide privateKey in config');
    return createAgent(this.identityOps, this.operatorDid, opts);
  }

  /** Resolve any DID to its identity record */
  async resolveIdentity(did: NexoidDID) {
    return resolveIdentity(this.identityOps, did);
  }

  /** Update an identity's status (Active/Suspended/Revoked) */
  async updateIdentityStatus(targetDid: NexoidDID, newStatus: EntityStatus): Promise<`0x${string}`> {
    if (!this.operatorDid) throw new Error('Operator DID not set');
    return updateIdentityStatus(this.identityOps, this.operatorDid, targetDid, newStatus);
  }

  // ─── Admin & Registrar ─────────────────────────────────────

  /**
   * Register an identity on behalf of a user (registrar only).
   * Called by Nexoid backend after identity verification.
   * The identity is owned by `owner`, not by the registrar.
   */
  async registerIdentityFor(
    owner: `0x${string}`,
    entityType: EntityType,
    metadataHash: `0x${string}`
  ): Promise<`0x${string}`> {
    const { registerIdentityFor } = await import('@nexoid/nx-core');
    return registerIdentityFor(this.identityOps, owner, entityType, metadataHash);
  }

  /**
   * Add or remove a registrar address (admin only).
   */
  async setRegistrar(registrar: `0x${string}`, authorized: boolean): Promise<`0x${string}`> {
    const { setRegistrar } = await import('@nexoid/nx-core');
    return setRegistrar(this.identityOps, registrar, authorized);
  }

  /**
   * Transfer admin role to a new address (admin only).
   */
  async transferAdmin(newAdmin: `0x${string}`): Promise<`0x${string}`> {
    const { transferAdmin } = await import('@nexoid/nx-core');
    return transferAdmin(this.identityOps, newAdmin);
  }

  /**
   * Check if an address is an authorized registrar.
   */
  async isRegistrar(registrar: `0x${string}`): Promise<boolean> {
    const { isRegistrarAddress } = await import('@nexoid/nx-core');
    return isRegistrarAddress(this.identityOps, registrar);
  }

  /**
   * Get the admin address of the IdentityRegistry.
   */
  async getAdmin(): Promise<`0x${string}`> {
    const { getAdmin } = await import('@nexoid/nx-core');
    return getAdmin(this.identityOps);
  }

  // ─── Agent Scope (via NexoidModule) ────────────────────────

  /** Update scope, credential, and expiry for an agent */
  async updateAgentScope(opts: UpdateScopeOpts): Promise<ScopeUpdateResult> {
    return updateAgentScope(this.agentOps, opts);
  }

  /** Revoke an agent permanently */
  async revokeAgent(agentSafe: `0x${string}`): Promise<`0x${string}`> {
    return revokeAgent(this.agentOps, agentSafe);
  }

  /** Suspend an active agent (reversible) */
  async suspendAgent(agentSafe: `0x${string}`): Promise<`0x${string}`> {
    return suspendAgent(this.agentOps, agentSafe);
  }

  /** Reactivate a suspended agent */
  async reactivateAgent(agentSafe: `0x${string}`): Promise<`0x${string}`> {
    return reactivateAgent(this.agentOps, agentSafe);
  }

  /** Check if an agent is valid (Active + not expired) */
  async isValidAgent(agentSafe: `0x${string}`): Promise<ValidationResult> {
    return isValidAgent(this.agentOps, agentSafe);
  }

  /** Get the full agent record */
  async getAgentRecord(agentSafe: `0x${string}`): Promise<AgentRecord> {
    return getAgentRecord(this.agentOps, agentSafe);
  }

  // ─── Financial (Safe-aware) ─────────────────────────────────

  /**
   * Get USDT and ETH balance.
   * If safeAddress is provided, queries the Safe balance (operator mode).
   * Otherwise queries the EOA balance.
   */
  async getBalance(did: NexoidDID, safeAddress?: `0x${string}`): Promise<Balance> {
    if (safeAddress) {
      // Query Safe balance directly
      return getBalance(this.walletOps, { did: 'safe' as NexoidDID, address: safeAddress });
    }
    return getBalance(this.walletOps, did);
  }

  /**
   * Send USDT — routing depends on mode:
   * - With safeAddress + operator: sends via Safe owner transaction
   * - With safeAddress + agent: sends via AllowanceModule
   * - Without safeAddress: direct ERC-20 transfer (legacy)
   */
  async sendUSDT(
    opts: TransferOpts,
    safeAddress?: `0x${string}`,
    mode: 'operator' | 'agent' = 'operator'
  ): Promise<TransactionResult> {
    if (safeAddress) {
      const safeConfig = this.getSafeConfig();
      let txHash: `0x${string}`;

      if (mode === 'agent') {
        // Agent: send via AllowanceModule
        txHash = await sendViaAllowance(safeConfig, safeAddress, opts.to, opts.amount);
      } else {
        // Operator: send via Safe owner tx
        txHash = await sendFromSafe(safeConfig, safeAddress, opts.to, opts.amount);
      }

      return { txHash, amount: opts.amount, to: opts.to };
    }

    // Legacy: direct ERC-20 transfer
    if (!this.operatorDid) throw new Error('Operator DID not set');
    return sendUSDTTransfer(this.walletOps, this.operatorDid, opts);
  }

  /**
   * Set spending allowance for an agent.
   *
   * If agentSafeAddress is provided, sets allowance on the agent's own Safe.
   * Otherwise falls back to setting on the operator's Safe (legacy).
   *
   * @param opts.agentDid - Agent's DID
   * @param opts.amount - USDT allowance amount (human-readable)
   * @param safeAddress - Safe address to set allowance on (agent's Safe or operator's Safe)
   * @param resetTimeMin - Auto-reset period in minutes (0 = no reset, 1440 = daily)
   * @param agentSafeAddress - Agent's own Safe address (new architecture)
   */
  async setAllowance(
    opts: AllowanceOpts,
    safeAddress?: `0x${string}`,
    resetTimeMin = 0,
    agentSafeAddress?: `0x${string}`
  ): Promise<`0x${string}`> {
    const agentAddress = didToAddress(opts.agentDid);

    // New architecture: set allowance on agent's own Safe
    if (agentSafeAddress) {
      return addDelegateAndSetAllowance(
        this.getSafeConfig(),
        agentSafeAddress,
        agentAddress,
        opts.amount,
        resetTimeMin
      );
    }

    // Legacy: set allowance on operator's Safe
    if (safeAddress) {
      return addDelegateAndSetAllowance(
        this.getSafeConfig(),
        safeAddress,
        agentAddress,
        opts.amount,
        resetTimeMin
      );
    }

    // Legacy: ERC-20 approve
    if (!this.operatorDid) throw new Error('Operator DID not set');
    const { setAllowance: setAllowanceOnChain } = await import('@nexoid/nx-core');
    return setAllowanceOnChain(this.walletOps, agentAddress, opts.amount);
  }

  /**
   * Get USDT allowance for an agent.
   * With safeAddress: queries AllowanceModule (returns detailed TokenAllowance).
   * Without: queries ERC-20 allowance (legacy).
   */
  async getAllowance(
    agentDid: NexoidDID,
    safeAddress?: `0x${string}`
  ): Promise<string> {
    if (safeAddress) {
      const agentAddress = didToAddress(agentDid);
      const allowance = await getSafeAllowance(
        this.publicClient,
        this.allowanceModuleAddress,
        safeAddress,
        agentAddress,
        this.tokenAddress
      );
      return allowance.remaining;
    }

    // Legacy: ERC-20 allowance
    if (!this.operatorDid) throw new Error('Operator DID not set');
    const { getAllowance: getAllowanceOnChain } = await import('@nexoid/nx-core');
    const ownerAddress = didToAddress(this.operatorDid);
    const spenderAddress = didToAddress(agentDid);
    return getAllowanceOnChain(this.walletOps, ownerAddress, spenderAddress);
  }

  /**
   * Get detailed allowance info (Safe AllowanceModule only).
   */
  async getAllowanceDetails(
    safeAddress: `0x${string}`,
    agentDid: NexoidDID
  ): Promise<TokenAllowance> {
    const agentAddress = didToAddress(agentDid);
    return getSafeAllowance(
      this.publicClient,
      this.allowanceModuleAddress,
      safeAddress,
      agentAddress,
      this.tokenAddress
    );
  }

  /**
   * List all delegates on the operator's Safe AllowanceModule.
   */
  async listSafeDelegates(safeAddress: `0x${string}`): Promise<`0x${string}`[]> {
    return listDelegates(
      this.publicClient,
      this.allowanceModuleAddress,
      safeAddress
    );
  }

  // ─── Email Credentials ─────────────────────────────────────

  /** Initiate email verification (returns OTP to be delivered) */
  async initiateEmailVerification(email: string) {
    if (!this.operatorDid) throw new Error('Operator DID not set');
    return initiateEmailVerification(this.operatorDid, email);
  }

  /** Complete email verification with OTP */
  async completeEmailVerification(
    emailHash: string,
    emailDomain: string,
    otp: string,
    expectedOtp: string
  ): Promise<EmailCredential> {
    if (!this.operatorDid) throw new Error('Operator DID not set');
    return completeEmailVerification(this.operatorDid, emailHash, emailDomain, otp, expectedOtp);
  }

  /** Format email credential for counterparty disclosure */
  formatEmailDisclosure(credential: EmailCredential): string {
    return formatEmailDisclosure(credential);
  }

  // ─── Identity Proof ─────────────────────────────────────────

  /**
   * Generate a signed EIP-712 identity proof.
   * Used by agents to prove their identity to verifiers.
   */
  async generateIdentityProof(
    delegationId: bigint,
    verifierAddress: `0x${string}`,
    nonce?: `0x${string}`
  ): Promise<SignedIdentityProof> {
    if (!this.walletClient?.account) throw new Error('Wallet client with account required for signing');

    const chainId = this.walletClient.chain?.id ?? 1;
    const domain = createProofDomain(chainId, this.config.registryAddress);
    const proof = createProof(
      this.walletClient.account.address as `0x${string}`,
      delegationId,
      verifierAddress,
      nonce
    );

    const signature = await this.walletClient.signTypedData({
      account: this.walletClient.account,
      domain,
      types: IDENTITY_PROOF_TYPES,
      primaryType: 'IdentityProof',
      message: {
        agent: proof.agent,
        delegationId: proof.delegationId,
        nonce: proof.nonce,
        timestamp: proof.timestamp,
        verifier: proof.verifier,
      },
    });

    return { proof, signature, domain };
  }

  /**
   * Verify an identity proof signature.
   */
  async verifyIdentityProof(signedProof: SignedIdentityProof): Promise<{
    valid: boolean;
    recoveredAddress: `0x${string}`;
    expired: boolean;
  }> {
    const result = await verifyProofFn(signedProof);
    const expired = isProofExpired(signedProof.proof);
    return { ...result, expired };
  }

  // ─── Utilities ──────────────────────────────────────────────

  /** Get the operator's DID */
  getOperatorDid(): NexoidDID | undefined {
    return this.operatorDid;
  }

  /** Get the USDT token address being used */
  getTokenAddress(): `0x${string}` {
    return this.tokenAddress;
  }

  /** Get the AllowanceModule address being used */
  getAllowanceModuleAddress(): `0x${string}` {
    return this.allowanceModuleAddress;
  }

  /** Hash an API key for storage */
  static hashApiKey(apiKey: string): string {
    return hashApiKey(apiKey);
  }
}
