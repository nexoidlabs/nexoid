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
  type DelegationOps,
  type WalletOps,
  type NexoidDID,
  type Balance,
  type AgentScope,
  type EmailCredential,
  type TokenAllowance,
} from '@nexoid/nx-core';

import type {
  NexoidClientConfig,
  CreateAgentOpts,
  AgentIdentity,
  DelegateOpts,
  DelegationResult,
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
  delegate,
  revoke,
  validateDelegation,
  listDelegations,
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
  addDelegateAndSetAllowance,
  updateAllowance,
  sendFromSafe,
  sendViaAllowance,
  getAllowance as getSafeAllowance,
  listDelegates,
  type SafeConfig,
  type SafeDeployResult,
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
  private delegationOps: DelegationOps;
  private walletOps: WalletOps;
  private config: NexoidClientConfig;
  private operatorDid?: NexoidDID;
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private isMainnet: boolean;
  private tokenAddress: `0x${string}`;
  private allowanceModuleAddress: `0x${string}`;

  constructor(config: NexoidClientConfig) {
    this.config = config;

    // Determine chain from RPC URL
    const isLocalhost = config.rpcUrl.includes('localhost') || config.rpcUrl.includes('127.0.0.1');
    this.isMainnet = config.rpcUrl.includes('mainnet');
    const chain = isLocalhost ? hardhat : this.isMainnet ? mainnet : sepolia;
    this.tokenAddress = config.tokenAddress ?? (this.isMainnet ? USDT_ETH_MAINNET : USDT_ETH_SEPOLIA);
    this.allowanceModuleAddress = config.allowanceModuleAddress ?? ALLOWANCE_MODULE.ETH_MAINNET;

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

    this.delegationOps = {
      moduleAddress: config.delegationRegistryAddress,
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

  // ─── Delegation ─────────────────────────────────────────────

  /** Create a scoped delegation to an agent */
  async delegate(opts: DelegateOpts): Promise<DelegationResult> {
    if (!this.operatorDid) throw new Error('Operator DID not set');
    return delegate(this.delegationOps, this.operatorDid, opts);
  }

  /** Revoke a delegation (O(1) chain-breaking) */
  async revoke(delegationId: string): Promise<`0x${string}`> {
    if (!this.operatorDid) throw new Error('Operator DID not set');
    return revoke(this.delegationOps, this.operatorDid, delegationId);
  }

  /** Validate a delegation chain */
  async validateDelegation(delegationId: string): Promise<ValidationResult> {
    return validateDelegation(this.delegationOps, delegationId);
  }

  /** List delegations for a DID */
  async listDelegations(did: NexoidDID) {
    return listDelegations(this.delegationOps, did);
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
   * Set spending allowance for an agent on the operator's Safe.
   * Adds the agent as a delegate and sets their USDT allowance via AllowanceModule.
   *
   * @param opts.agentDid - Agent's DID
   * @param opts.amount - USDT allowance amount (human-readable)
   * @param safeAddress - Operator's Safe address
   * @param resetTimeMin - Auto-reset period in minutes (0 = no reset, 1440 = daily)
   */
  async setAllowance(
    opts: AllowanceOpts,
    safeAddress?: `0x${string}`,
    resetTimeMin = 0
  ): Promise<`0x${string}`> {
    if (safeAddress) {
      const agentAddress = didToAddress(opts.agentDid);
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
    const agentAddress = didToAddress(opts.agentDid);
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
