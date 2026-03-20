/**
 * Contract ABIs for Nexoid on-chain primitives.
 * These are used by viem for type-safe contract interactions.
 */

export { AllowanceModuleABI } from './allowance-module.js';

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

export const DelegationRegistryABI = [
  {
    type: 'constructor',
    inputs: [{ name: '_identityRegistry', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'delegateWithScope',
    inputs: [
      { name: 'subject', type: 'address' },
      { name: 'credentialHash', type: 'bytes32' },
      { name: 'scopeHash', type: 'bytes32' },
      { name: 'validUntil', type: 'uint64' },
      { name: 'parentDelegationId', type: 'uint256' },
      { name: 'delegationDepth', type: 'uint8' },
    ],
    outputs: [{ name: 'delegationId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revokeDelegation',
    inputs: [{ name: 'delegationId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'suspendDelegation',
    inputs: [{ name: 'delegationId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'reactivateDelegation',
    inputs: [{ name: 'delegationId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isValidDelegation',
    inputs: [{ name: 'delegationId', type: 'uint256' }],
    outputs: [
      { name: 'valid', type: 'bool' },
      { name: 'depth', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDelegation',
    inputs: [{ name: 'delegationId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'issuer', type: 'address' },
          { name: 'subject', type: 'address' },
          { name: 'credentialHash', type: 'bytes32' },
          { name: 'scopeHash', type: 'bytes32' },
          { name: 'validFrom', type: 'uint64' },
          { name: 'validUntil', type: 'uint64' },
          { name: 'parentDelegationId', type: 'uint256' },
          { name: 'delegationDepth', type: 'uint8' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nextDelegationId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'identityRegistry',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'DelegationCreated',
    inputs: [
      { name: 'delegationId', type: 'uint256', indexed: true },
      { name: 'issuer', type: 'address', indexed: true },
      { name: 'subject', type: 'address', indexed: true },
      { name: 'scopeHash', type: 'bytes32', indexed: false },
      { name: 'delegationDepth', type: 'uint8', indexed: false },
      { name: 'validUntil', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DelegationRevoked',
    inputs: [
      { name: 'delegationId', type: 'uint256', indexed: true },
      { name: 'revokedBy', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'DelegationSuspended',
    inputs: [
      { name: 'delegationId', type: 'uint256', indexed: true },
      { name: 'suspendedBy', type: 'address', indexed: true },
    ],
  },
] as const;
