// Types
export type {
  IdentityRecord,
  AgentRecord,
  AgentScope,
  BudgetLimit,
  MaxTransactionAmount,
  NexoidDID,
  EmailCredential,
} from './types.js';
export {
  EntityType,
  EntityStatus,
  DelegationStatus,
  addressToDID,
  didToAddress,
} from './types.js';

// Identity operations
export {
  createAgentIdentity,
  getIdentityRecord,
  isRegistered,
  updateIdentityStatus,
  getIdentityOwner,
  registerIdentityFor,
  setRegistrar,
  transferAdmin,
  isRegistrarAddress,
  getAdmin,
  type IdentityOps,
} from './identity.js';

// Agent scope operations (replaces delegation)
export {
  updateAgentScope,
  suspendAgent,
  revokeAgent,
  reactivateAgent,
  isValidAgent,
  getAgentRecord,
  computeScopeHash,
  type AgentOps,
} from './agent-scope.js';

// Wallet operations
export {
  getBalance,
  sendUSDT,
  setAllowance,
  getAllowance,
  USDT_ETH_MAINNET,
  USDT_ETH_SEPOLIA,
  type WalletOps,
  type Balance,
} from './wallet.js';

// Safe wallet + AllowanceModule operations
export {
  ALLOWANCE_MODULE,
  ENTRYPOINT,
  getTokenAllowance,
  getDelegates,
  encodeAddDelegate,
  encodeSetAllowance,
  encodeRemoveDelegate,
  generateTransferHash,
  executeAllowanceTransfer,
  type SafeAllowanceOps,
  type TokenAllowance,
} from './safe.js';

// ABIs
export { IdentityRegistryABI, AllowanceModuleABI, NexoidModuleABI } from './abi/index.js';
