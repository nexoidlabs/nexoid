/**
 * Nexoid on-chain type definitions.
 * Mirrors Solidity structs and enums for TypeScript usage.
 */

// ─── Entity Types ────────────────────────────────────────

export enum EntityType {
  Human = 0,
  VirtualAgent = 1,
  PhysicalAgent = 2,
  Organization = 3,
}

export enum EntityStatus {
  Active = 0,
  Suspended = 1,
  Revoked = 2,
}

export interface IdentityRecord {
  entityType: EntityType;
  status: EntityStatus;
  createdAt: bigint;
  metadataHash: `0x${string}`;
  owner: `0x${string}`;
}

// ─── Delegation Types ────────────────────────────────────

export enum DelegationStatus {
  Active = 0,
  Suspended = 1,
  Revoked = 2,
}

// ─── Agent Record (mirrors Solidity struct in NexoidModule) ──

export interface AgentRecord {
  agentSafe: `0x${string}`;
  agentEOA: `0x${string}`;
  createdAt: bigint;
  scopeHash: `0x${string}`;
  credentialHash: `0x${string}`;
  validUntil: bigint;
  status: DelegationStatus;
}

// ─── Scope Types (V1 — 3 fields, flat model) ────────────

export interface BudgetLimit {
  amount: string;
  /** Currency identifier (e.g. "USDT") */
  currency: string;
  period: 'daily' | 'weekly' | 'monthly';
}

export interface MaxTransactionAmount {
  amount: string;
  currency: string;
}

/**
 * V1 Agent Scope — 3 fields (flat delegation model, no delegationDepth).
 * On-chain: scopeHash = keccak256(canonicalize(scope))
 * Off-chain: full scope object stored with VC
 */
export interface AgentScope {
  budgetLimit: BudgetLimit;
  maxTransactionAmount: MaxTransactionAmount;
  allowedTools: string[];
}

// ─── DID Types ───────────────────────────────────────────

/** Nexoid DID format: did:nexoid:eth:<address> */
export type NexoidDID = `did:nexoid:eth:${string}`;

export function addressToDID(address: `0x${string}`): NexoidDID {
  return `did:nexoid:eth:${address.toLowerCase()}`;
}

export function didToAddress(did: NexoidDID): `0x${string}` {
  const parts = did.split(':');
  if (parts.length !== 4 || parts[0] !== 'did' || parts[1] !== 'nexoid' || parts[2] !== 'eth') {
    throw new Error(`Invalid Nexoid DID: ${did}`);
  }
  return parts[3] as `0x${string}`;
}

// ─── Email Credential ────────────────────────────────────

export interface EmailCredential {
  type: 'EmailVerification';
  issuer: NexoidDID;
  subject: NexoidDID;
  emailHash: string;
  emailDomain: string;
  verified: boolean;
  verifiedAt: string;
}
