/**
 * Contract ABIs for Nexoid on-chain primitives.
 * These are used by viem for type-safe contract interactions.
 */

export { AllowanceModuleABI } from './allowance-module.js';

export const NexoidModuleABI = [
  {
    type: 'function',
    name: 'registerAgentSafe',
    inputs: [
      { name: 'agentSafe', type: 'address' },
      { name: 'agentEOA', type: 'address' },
      { name: 'scopeHash', type: 'bytes32' },
      { name: 'credentialHash', type: 'bytes32' },
      { name: 'validUntil', type: 'uint64' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeAgentSafe',
    inputs: [{ name: 'agentSafe', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateAgentScope',
    inputs: [
      { name: 'agentSafe', type: 'address' },
      { name: 'scopeHash', type: 'bytes32' },
      { name: 'credentialHash', type: 'bytes32' },
      { name: 'validUntil', type: 'uint64' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'suspendAgent',
    inputs: [{ name: 'agentSafe', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revokeAgent',
    inputs: [{ name: 'agentSafe', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'reactivateAgent',
    inputs: [{ name: 'agentSafe', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isValidAgent',
    inputs: [{ name: 'agentSafe', type: 'address' }],
    outputs: [{ name: 'valid', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentRecord',
    inputs: [{ name: 'agentSafe', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'agentSafe', type: 'address' },
          { name: 'agentEOA', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'scopeHash', type: 'bytes32' },
          { name: 'credentialHash', type: 'bytes32' },
          { name: 'validUntil', type: 'uint64' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentSafes',
    inputs: [{ name: 'operatorSafe', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'agentSafe', type: 'address' },
          { name: 'agentEOA', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'scopeHash', type: 'bytes32' },
          { name: 'credentialHash', type: 'bytes32' },
          { name: 'validUntil', type: 'uint64' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getOperator',
    inputs: [{ name: 'agentSafe', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'operatorOf',
    inputs: [{ name: 'agentSafe', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'agentCount',
    inputs: [{ name: 'operatorSafe', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AgentSafeRegistered',
    inputs: [
      { name: 'operatorSafe', type: 'address', indexed: true },
      { name: 'agentSafe', type: 'address', indexed: true },
      { name: 'agentEOA', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentSafeRemoved',
    inputs: [
      { name: 'operatorSafe', type: 'address', indexed: true },
      { name: 'agentSafe', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'AgentScopeUpdated',
    inputs: [
      { name: 'operatorSafe', type: 'address', indexed: true },
      { name: 'agentSafe', type: 'address', indexed: true },
      { name: 'scopeHash', type: 'bytes32', indexed: false },
      { name: 'credentialHash', type: 'bytes32', indexed: false },
      { name: 'validUntil', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentStatusChanged',
    inputs: [
      { name: 'operatorSafe', type: 'address', indexed: true },
      { name: 'agentSafe', type: 'address', indexed: true },
      { name: 'newStatus', type: 'uint8', indexed: false },
    ],
  },
] as const;

export const IdentityRegistryABI = [
  {
    type: 'function',
    name: 'createAgentIdentity',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'entityType', type: 'uint8' },
      { name: 'metadataHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateStatus',
    inputs: [
      { name: 'identity', type: 'address' },
      { name: 'newStatus', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateMetadata',
    inputs: [
      { name: 'identity', type: 'address' },
      { name: 'newMetadataHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getIdentity',
    inputs: [{ name: 'identity', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'entityType', type: 'uint8' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'metadataHash', type: 'bytes32' },
          { name: 'owner', type: 'address' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [{ name: 'identity', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ownerOf',
    inputs: [{ name: 'identity', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'IdentityRegistered',
    inputs: [
      { name: 'identity', type: 'address', indexed: true },
      { name: 'entityType', type: 'uint8', indexed: false },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'metadataHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'IdentityStatusUpdated',
    inputs: [
      { name: 'identity', type: 'address', indexed: true },
      { name: 'oldStatus', type: 'uint8', indexed: false },
      { name: 'newStatus', type: 'uint8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MetadataUpdated',
    inputs: [
      { name: 'identity', type: 'address', indexed: true },
      { name: 'oldHash', type: 'bytes32', indexed: false },
      { name: 'newHash', type: 'bytes32', indexed: false },
    ],
  },
  // --- Admin & Registrar ---
  {
    type: 'function',
    name: 'registerIdentityFor',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'entityType', type: 'uint8' },
      { name: 'metadataHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setRegistrar',
    inputs: [
      { name: 'registrar', type: 'address' },
      { name: 'authorized', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferAdmin',
    inputs: [{ name: 'newAdmin', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isRegistrar',
    inputs: [{ name: 'registrar', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'admin',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'RegistrarUpdated',
    inputs: [
      { name: 'registrar', type: 'address', indexed: true },
      { name: 'authorized', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AdminTransferred',
    inputs: [
      { name: 'oldAdmin', type: 'address', indexed: true },
      { name: 'newAdmin', type: 'address', indexed: true },
    ],
  },
] as const;
