// Nexoid data model types — matching core-client/types.ts + nx-core
// Used throughout the mobile app for identity, agent, and wallet operations

export interface IdentityRecord {
  address: string;
  entityType: number;      // 0=Human, 1=VirtualAgent, 2=PhysicalAgent, 3=Organization
  status: number;          // 0=Active, 1=Suspended, 2=Revoked
  createdAt: number;
  metadataHash: string;    // bytes32 — NOT parseable JSON, it's a hash
  owner: string;
}

export interface AgentRecord {
  agentSafe: string;
  agentEOA: string;
  createdAt: number;
  scopeHash: string;       // bytes32
  credentialHash: string;  // bytes32
  validUntil: number;      // unix timestamp, 0=infinite
  status: number;          // 0=Active, 1=Suspended, 2=Revoked
}

export interface TokenAllowance {
  amount: string;
  spent: string;
  remaining: string;
  nonce: number;
  resetTimeMin: number;
}

export interface LiveAgent {
  agentSafe: string;
  agentEOA: string;
  entityType: number;
  status: number;
  scopeHash: string;
  credentialHash: string;
  validUntil: number;
  createdAt: number;
  label?: string;
  delegates: string[];
  allowances?: Record<string, TokenAllowance>;
}

export const ENTITY_TYPES = ['Human', 'VirtualAgent', 'PhysicalAgent', 'Organization'] as const;
export const STATUS_NAMES = ['Active', 'Suspended', 'Revoked'] as const;
export const AGENT_STATUSES = STATUS_NAMES;

export function entityTypeName(type: number): string {
  return ENTITY_TYPES[type] ?? `Unknown(${type})`;
}

export function statusName(status: number): string {
  return STATUS_NAMES[status] ?? `Unknown(${status})`;
}

export function isActive(status: number): boolean {
  return status === 0;
}

export function formatDid(address: string): string {
  return `did:nexoid:eth:${address.toLowerCase()}`;
}

export function resolveAddress(didOrAddress: string): string {
  if (didOrAddress.startsWith('did:nexoid:eth:')) {
    return didOrAddress.split(':')[3];
  }
  return didOrAddress;
}
