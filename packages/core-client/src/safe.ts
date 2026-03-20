/**
 * Safe wallet integration for NexoidClient.
 *
 * Handles:
 * 1. Deploying a new Safe (1-of-1, operator as sole owner)
 * 2. Enabling AllowanceModule on the Safe
 * 3. Adding delegates and setting allowances (operator actions, via Safe tx)
 * 4. Executing allowance transfers (agent actions, direct call)
 *
 * Uses @safe-global/protocol-kit for Safe deployment and transaction execution.
 * Uses viem for AllowanceModule read operations.
 */

// Safe Protocol Kit — dynamic import for ESM/CJS interop with Node16 module resolution
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _Safe: any;
async function getSafe() {
  if (!_Safe) {
    const mod = await import('@safe-global/protocol-kit');
    _Safe = (mod as unknown as { default: unknown }).default ?? mod;
  }
  return _Safe;
}
import type { PublicClient, WalletClient } from 'viem';
import {
  ALLOWANCE_MODULE,
  NexoidModuleABI,
  encodeAddDelegate,
  encodeSetAllowance,
  encodeRemoveDelegate,
  getTokenAllowance as getTokenAllowanceOnChain,
  getDelegates as getDelegatesOnChain,
  generateTransferHash as generateTransferHashOnChain,
  executeAllowanceTransfer as executeAllowanceTransferOnChain,
  type SafeAllowanceOps,
  type TokenAllowance,
} from '@nexoid/nx-core';

// ─── Types ──────────────────────────────────────────────────

export interface SafeConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  publicClient: PublicClient;
  walletClient: WalletClient;
  tokenAddress: `0x${string}`;
  allowanceModuleAddress: `0x${string}`;
}

export interface SafeDeployResult {
  safeAddress: `0x${string}`;
  txHash: `0x${string}`;
  moduleEnabled: boolean;
}

// ─── Safe Deployment ────────────────────────────────────────

/**
 * Deploy a new Safe wallet for the operator and enable AllowanceModule.
 * This is a one-time operation during `nxcli register`.
 *
 * Creates a 1-of-1 Safe with the operator's EOA as sole owner,
 * then enables the AllowanceModule singleton on it.
 */
export async function deploySafe(config: SafeConfig): Promise<SafeDeployResult> {
  const ownerAddress = config.walletClient.account!.address;

  // Initialize Safe SDK with predicted Safe config
  const protocolKit = await (await getSafe()).init({
    provider: config.rpcUrl,
    signer: config.privateKey,
    predictedSafe: {
      safeAccountConfig: {
        owners: [ownerAddress],
        threshold: 1,
      },
    },
  });

  // Get the deterministic Safe address before deployment
  const safeAddress = (await protocolKit.getAddress()) as `0x${string}`;

  // Create and execute the deployment transaction
  const deployTx = await protocolKit.createSafeDeploymentTransaction();

  const txHash = await config.walletClient.sendTransaction({
    to: deployTx.to as `0x${string}`,
    value: BigInt(deployTx.value),
    data: deployTx.data as `0x${string}`,
    chain: config.walletClient.chain,
    account: config.walletClient.account!,
  });

  // Wait for deployment confirmation
  await config.publicClient.waitForTransactionReceipt({ hash: txHash });

  // Reconnect to the deployed Safe
  const deployedKit = await protocolKit.connect({ safeAddress });

  // Enable AllowanceModule on the Safe
  let moduleEnabled = false;
  try {
    const enableModuleTx = await deployedKit.createEnableModuleTx(
      config.allowanceModuleAddress
    );
    const signedTx = await deployedKit.signTransaction(enableModuleTx);
    await deployedKit.executeTransaction(signedTx);
    moduleEnabled = true;
  } catch (err) {
    // Log but don't fail — module can be enabled later
    console.error('Warning: Failed to enable AllowanceModule:', err);
  }

  return { safeAddress, txHash, moduleEnabled };
}

/**
 * Enable AllowanceModule on an existing Safe (if not already enabled).
 */
export async function enableAllowanceModule(
  config: SafeConfig,
  safeAddress: `0x${string}`
): Promise<`0x${string}`> {
  const kit = await (await getSafe()).init({
    provider: config.rpcUrl,
    signer: config.privateKey,
    safeAddress,
  });

  // Check if already enabled
  const modules = await kit.getModules();
  const isEnabled = modules.some(
    (m: string) => m.toLowerCase() === config.allowanceModuleAddress.toLowerCase()
  );
  if (isEnabled) {
    return '0x0' as `0x${string}`; // Already enabled
  }

  const enableTx = await kit.createEnableModuleTx(config.allowanceModuleAddress);
  const signedTx = await kit.signTransaction(enableTx);
  const result = await kit.executeTransaction(signedTx);
  return (result.hash ?? '0x0') as `0x${string}`;
}

// ─── Agent Safe Deployment ──────────────────────────────────

export interface AgentSafeDeployResult {
  agentSafeAddress: `0x${string}`;
  txHash: `0x${string}`;
}

/**
 * Deploy a new Safe wallet for an agent (1-of-1 with operator EOA as owner),
 * enable AllowanceModule on it, add agent EOA as delegate, and register
 * with NexoidModule.
 *
 * @param config - Operator's SafeConfig (operator signs everything)
 * @param operatorSafeAddress - Operator's Safe address (for NexoidModule registration)
 * @param agentEOA - Agent's signing EOA address
 * @param nexoidModuleAddress - NexoidModule contract address
 */
export async function deployAgentSafe(
  config: SafeConfig,
  operatorSafeAddress: `0x${string}`,
  agentEOA: `0x${string}`,
  nexoidModuleAddress: `0x${string}`
): Promise<AgentSafeDeployResult> {
  const ownerAddress = config.walletClient.account!.address;

  // 1. Deploy 1-of-1 Safe with operator's EOA as sole owner
  const protocolKit = await (await getSafe()).init({
    provider: config.rpcUrl,
    signer: config.privateKey,
    predictedSafe: {
      safeAccountConfig: {
        owners: [ownerAddress],
        threshold: 1,
      },
    },
  });

  const agentSafeAddress = (await protocolKit.getAddress()) as `0x${string}`;

  const deployTx = await protocolKit.createSafeDeploymentTransaction();
  const txHash = await config.walletClient.sendTransaction({
    to: deployTx.to as `0x${string}`,
    value: BigInt(deployTx.value),
    data: deployTx.data as `0x${string}`,
    chain: config.walletClient.chain,
    account: config.walletClient.account!,
  });
  await config.publicClient.waitForTransactionReceipt({ hash: txHash });

  // 2. Reconnect to deployed agent Safe and enable AllowanceModule
  const deployedKit = await protocolKit.connect({ safeAddress: agentSafeAddress });
  try {
    const enableModuleTx = await deployedKit.createEnableModuleTx(
      config.allowanceModuleAddress
    );
    const signedTx = await deployedKit.signTransaction(enableModuleTx);
    await deployedKit.executeTransaction(signedTx);
  } catch (err) {
    console.error('Warning: Failed to enable AllowanceModule on agent Safe:', err);
  }

  // 3. Add agent EOA as delegate on agent's Safe AllowanceModule
  try {
    const addDelegateTx = await deployedKit.createTransaction({
      transactions: [
        {
          to: config.allowanceModuleAddress,
          value: '0',
          data: encodeAddDelegate(agentEOA),
        },
      ],
    });
    const signedDelegateTx = await deployedKit.signTransaction(addDelegateTx);
    await deployedKit.executeTransaction(signedDelegateTx);
  } catch (err) {
    console.error('Warning: Failed to add agent as delegate on agent Safe:', err);
  }

  // 4. Register agent Safe with NexoidModule (via operator Safe tx)
  try {
    const operatorKit = await (await getSafe()).init({
      provider: config.rpcUrl,
      signer: config.privateKey,
      safeAddress: operatorSafeAddress,
    });

    const { encodeFunctionData } = await import('viem');
    const registerData = encodeFunctionData({
      abi: NexoidModuleABI,
      functionName: 'registerAgentSafe',
      args: [agentSafeAddress, agentEOA, '0x' + '0'.repeat(64) as `0x${string}`, '0x' + '0'.repeat(64) as `0x${string}`, 0n],
    });

    const registerTx = await operatorKit.createTransaction({
      transactions: [
        {
          to: nexoidModuleAddress,
          value: '0',
          data: registerData,
        },
      ],
    });
    const signedRegisterTx = await operatorKit.signTransaction(registerTx);
    await operatorKit.executeTransaction(signedRegisterTx);
  } catch (err) {
    console.error('Warning: Failed to register agent Safe with NexoidModule:', err);
  }

  return { agentSafeAddress, txHash };
}

/**
 * Query NexoidModule for all agent Safes belonging to an operator.
 */
export async function getAgentSafes(
  publicClient: PublicClient,
  nexoidModuleAddress: `0x${string}`,
  operatorSafeAddress: `0x${string}`
): Promise<Array<{ agentSafe: `0x${string}`; agentEOA: `0x${string}`; createdAt: bigint; scopeHash: `0x${string}`; credentialHash: `0x${string}`; validUntil: bigint; status: number }>> {
  const result = await publicClient.readContract({
    address: nexoidModuleAddress,
    abi: NexoidModuleABI,
    functionName: 'getAgentSafes',
    args: [operatorSafeAddress],
  });

  return (result as Array<{ agentSafe: `0x${string}`; agentEOA: `0x${string}`; createdAt: bigint; scopeHash: `0x${string}`; credentialHash: `0x${string}`; validUntil: bigint; status: number }>);
}

/**
 * Send USDT from operator's Safe to an agent's Safe (fund the agent).
 */
export async function fundAgentSafe(
  config: SafeConfig,
  operatorSafeAddress: `0x${string}`,
  agentSafeAddress: `0x${string}`,
  amount: string
): Promise<`0x${string}`> {
  return sendFromSafe(config, operatorSafeAddress, agentSafeAddress, amount);
}

// ─── Operator Actions (executed through Safe) ───────────────

/**
 * Add a delegate (agent) to the AllowanceModule and set their USDT allowance.
 * Both operations are batched into a single Safe transaction.
 *
 * @param amount - USDT amount (human-readable, e.g. "100" for 100 USDT)
 * @param resetTimeMin - Auto-reset period in minutes (0 = no reset, 1440 = daily, 10080 = weekly)
 */
export async function addDelegateAndSetAllowance(
  config: SafeConfig,
  safeAddress: `0x${string}`,
  delegateAddress: `0x${string}`,
  amount: string,
  resetTimeMin = 0
): Promise<`0x${string}`> {
  const kit = await (await getSafe()).init({
    provider: config.rpcUrl,
    signer: config.privateKey,
    safeAddress,
  });

  // Batch: addDelegate + setAllowance in one Safe transaction
  const safeTx = await kit.createTransaction({
    transactions: [
      {
        to: config.allowanceModuleAddress,
        value: '0',
        data: encodeAddDelegate(delegateAddress),
      },
      {
        to: config.allowanceModuleAddress,
        value: '0',
        data: encodeSetAllowance(
          delegateAddress,
          config.tokenAddress,
          amount,
          resetTimeMin
        ),
      },
    ],
  });

  const signedTx = await kit.signTransaction(safeTx);
  const result = await kit.executeTransaction(signedTx);
  return (result.hash ?? '0x0') as `0x${string}`;
}

/**
 * Update the allowance for an existing delegate.
 */
export async function updateAllowance(
  config: SafeConfig,
  safeAddress: `0x${string}`,
  delegateAddress: `0x${string}`,
  amount: string,
  resetTimeMin = 0
): Promise<`0x${string}`> {
  const kit = await (await getSafe()).init({
    provider: config.rpcUrl,
    signer: config.privateKey,
    safeAddress,
  });

  const safeTx = await kit.createTransaction({
    transactions: [
      {
        to: config.allowanceModuleAddress,
        value: '0',
        data: encodeSetAllowance(
          delegateAddress,
          config.tokenAddress,
          amount,
          resetTimeMin
        ),
      },
    ],
  });

  const signedTx = await kit.signTransaction(safeTx);
  const result = await kit.executeTransaction(signedTx);
  return (result.hash ?? '0x0') as `0x${string}`;
}

/**
 * Remove a delegate from the AllowanceModule.
 */
export async function removeDelegate(
  config: SafeConfig,
  safeAddress: `0x${string}`,
  delegateAddress: `0x${string}`
): Promise<`0x${string}`> {
  const kit = await (await getSafe()).init({
    provider: config.rpcUrl,
    signer: config.privateKey,
    safeAddress,
  });

  const safeTx = await kit.createTransaction({
    transactions: [
      {
        to: config.allowanceModuleAddress,
        value: '0',
        data: encodeRemoveDelegate(delegateAddress),
      },
    ],
  });

  const signedTx = await kit.signTransaction(safeTx);
  const result = await kit.executeTransaction(signedTx);
  return (result.hash ?? '0x0') as `0x${string}`;
}

/**
 * Send USDT from the Safe as the owner (direct Safe transaction, not allowance).
 * Used by operators to send from their own Safe.
 */
export async function sendFromSafe(
  config: SafeConfig,
  safeAddress: `0x${string}`,
  to: `0x${string}`,
  amount: string
): Promise<`0x${string}`> {
  const kit = await (await getSafe()).init({
    provider: config.rpcUrl,
    signer: config.privateKey,
    safeAddress,
  });

  const { parseUnits, encodeFunctionData } = await import('viem');
  const amountRaw = parseUnits(amount, 6);

  // Encode ERC-20 transfer call
  const transferData = encodeFunctionData({
    abi: [{
      type: 'function',
      name: 'transfer',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
    }] as const,
    functionName: 'transfer',
    args: [to, amountRaw],
  });

  const safeTx = await kit.createTransaction({
    transactions: [{
      to: config.tokenAddress,
      value: '0',
      data: transferData,
    }],
  });

  const signedTx = await kit.signTransaction(safeTx);
  const result = await kit.executeTransaction(signedTx);
  return (result.hash ?? '0x0') as `0x${string}`;
}

// ─── Agent Actions (direct AllowanceModule call) ────────────

/**
 * Send USDT as an agent using the AllowanceModule.
 * The agent signs a transfer hash and calls executeAllowanceTransfer directly.
 *
 * This does NOT go through the Safe — the agent calls the AllowanceModule contract,
 * which then internally moves funds from the Safe.
 */
export async function sendViaAllowance(
  config: SafeConfig,
  safeAddress: `0x${string}`,
  to: `0x${string}`,
  amount: string
): Promise<`0x${string}`> {
  if (!config.walletClient.account) throw new Error('Wallet client account required');

  const allowanceOps: SafeAllowanceOps = {
    publicClient: config.publicClient,
    walletClient: config.walletClient,
    allowanceModuleAddress: config.allowanceModuleAddress,
  };

  // Get current nonce for transfer hash
  const allowance = await getTokenAllowanceOnChain(
    allowanceOps,
    safeAddress,
    config.walletClient.account.address as `0x${string}`,
    config.tokenAddress
  );

  // Generate the transfer hash
  const transferHash = await generateTransferHashOnChain(
    allowanceOps,
    safeAddress,
    config.tokenAddress,
    to,
    amount,
    allowance.nonce
  );

  // Agent signs the hash
  const signature = await config.walletClient.signMessage({
    account: config.walletClient.account,
    message: { raw: transferHash },
  });

  // Execute the transfer
  return executeAllowanceTransferOnChain(
    allowanceOps,
    safeAddress,
    config.tokenAddress,
    to,
    amount,
    signature
  );
}

// ─── Read Operations ────────────────────────────────────────

/**
 * Get the USDT allowance for a delegate on a Safe.
 */
export async function getAllowance(
  publicClient: PublicClient,
  allowanceModuleAddress: `0x${string}`,
  safeAddress: `0x${string}`,
  delegateAddress: `0x${string}`,
  tokenAddress: `0x${string}`
): Promise<TokenAllowance> {
  return getTokenAllowanceOnChain(
    { publicClient, allowanceModuleAddress },
    safeAddress,
    delegateAddress,
    tokenAddress
  );
}

/**
 * Get all delegates registered on a Safe's AllowanceModule.
 */
export async function listDelegates(
  publicClient: PublicClient,
  allowanceModuleAddress: `0x${string}`,
  safeAddress: `0x${string}`
): Promise<`0x${string}`[]> {
  return getDelegatesOnChain(
    { publicClient, allowanceModuleAddress },
    safeAddress
  );
}
