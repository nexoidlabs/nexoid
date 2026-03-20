// Main client
export { NexoidClient } from './client.js';

// Types
export type {
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

// Re-export common types from nx-core
export type {
  NexoidDID,
  AgentScope,
  IdentityRecord,
  AgentRecord,
  Balance,
  EmailCredential,
} from './types.js';
export { EntityType, EntityStatus, DelegationStatus } from './types.js';

// Safe wallet operations
export type { SafeConfig, SafeDeployResult, AgentSafeDeployResult } from './safe.js';
export { getAgentSafes, fundAgentSafe } from './safe.js';

// Re-export Safe constants from nx-core
export { ALLOWANCE_MODULE, ENTRYPOINT, NexoidModuleABI } from '@nexoid/nx-core';
export type { TokenAllowance } from '@nexoid/nx-core';

// Credential utilities
export { formatEmailDisclosure, extractEmailDomain } from './credentials.js';

// API key utilities
export { hashApiKey } from './identity.js';

// Identity proof
export {
  createProofDomain,
  createProof,
  verifyProof,
  serializeProof,
  deserializeProof,
  isProofExpired,
  generateNonce,
  IDENTITY_PROOF_TYPES,
} from './proof.js';
export type {
  IdentityProofDomain,
  IdentityProof,
  SignedIdentityProof,
} from './proof.js';

// WDK key management
export {
  generateSeedPhrase,
  deriveAccount,
  deriveOperator,
  deriveAgent,
  isValidSeedPhrase,
} from './wdk.js';
