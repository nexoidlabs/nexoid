// Contract ABIs and addresses for the Nexoid platform
// Copied from nexoid/apps/nx-platform/src/lib/contracts.ts
// Converted to ethers.js compatible format

// ============================================
// CONTRACT ADDRESSES (Sepolia)
// ============================================

export const IDENTITY_REGISTRY_ADDRESS = '0x34bF67E80E4c6Cf6D41e90da9c2c072f0692172B';
export const NEXOID_MODULE_ADDRESS = '0x4903EEb232C30fb16447405D38FBe7841c677547';
export const ALLOWANCE_MODULE_ADDRESS = '0xCFbFaC74C26F8647cBDb8c5caf80BB5b32E43134';
export const USDT_ADDRESS_SEPOLIA = '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0';

// Mainnet addresses (for reference / future use)
export const IDENTITY_REGISTRY_ADDRESS_MAINNET = '0x74f7057413bba81d07372A8902Cd630EB44c4386';
export const NEXOID_MODULE_ADDRESS_MAINNET = '0xa38B960f15BAc9117358068351428370BfE8Dc54';
export const USDT_ADDRESS_MAINNET = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

// ============================================
// USDT-SPECIFIC ERC-20 ABI
// USDT transfer() returns void, NOT bool — non-standard ERC-20
// Using standard ABI with returns(bool) causes ethers to throw a decoding error
// on direct EOA transfers. Safe-routed transfers are fine (Safe handles execution).
// ============================================

export const USDT_ABI = [
  'function transfer(address to, uint256 value)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 value)',
];

// Standard ERC-20 ABI (for tokens that follow the spec correctly)
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
];

// ============================================
// IDENTITY REGISTRY ABI
// ============================================

export const IDENTITY_REGISTRY_ABI = [
  // Read functions
  'function getIdentity(address identity) view returns (tuple(uint8 entityType, uint8 status, uint64 createdAt, bytes32 metadataHash, address owner))',
  'function isRegistered(address identity) view returns (bool)',
  'function ownerOf(address identity) view returns (address)',
  'function admin() view returns (address)',
  'function isRegistrar(address addr) view returns (bool)',
  // Write functions
  'function setRegistrar(address registrar, bool authorized)',
  'function registerIdentityFor(address identity, uint8 entityType, bytes32 metadataHash)',
  'function registerIdentity(uint8 entityType, bytes32 metadataHash)',
  'function createAgentIdentity(address agent, uint8 entityType, bytes32 metadataHash)',
  'function updateStatus(address identity, uint8 newStatus)',
  'function updateMetadata(address identity, bytes32 newMetadataHash)',
];

// ============================================
// NEXOID MODULE ABI (Agent Management)
// ============================================

export const NEXOID_MODULE_ABI = [
  // Read functions
  'function getAgentSafes(address operatorSafe) view returns (tuple(address agentSafe, address agentEOA, uint64 createdAt, bytes32 scopeHash, bytes32 credentialHash, uint64 validUntil, uint8 status)[])',
  'function getOperator(address agentSafe) view returns (address)',
  'function agentCount(address operatorSafe) view returns (uint256)',
  'function isValidAgent(address agentSafe) view returns (bool)',
  'function getAgentRecord(address agentSafe) view returns (tuple(address agentSafe, address agentEOA, uint64 createdAt, bytes32 scopeHash, bytes32 credentialHash, uint64 validUntil, uint8 status))',
  // Write functions
  'function registerAgentSafe(address agentSafe, address agentEOA, bytes32 scopeHash, bytes32 credentialHash, uint64 validUntil)',
  'function updateAgentScope(address agentSafe, bytes32 scopeHash, bytes32 credentialHash, uint64 validUntil)',
  'function suspendAgent(address agentSafe)',
  'function revokeAgent(address agentSafe)',
  'function reactivateAgent(address agentSafe)',
];

// ============================================
// ALLOWANCE MODULE ABI (Read)
// ============================================

export const ALLOWANCE_MODULE_ABI = [
  'function getDelegates(address safe, uint48 start, uint8 pageSize) view returns (address[] results, uint48 next)',
  'function getTokenAllowance(address safe, address delegate, address token) view returns (uint256[5])',
  'function getTokens(address safe, address delegate) view returns (address[])',
];

// ============================================
// ALLOWANCE MODULE ABI (Write — executed via Safe)
// ============================================

export const ALLOWANCE_MODULE_WRITE_ABI = [
  'function addDelegate(address delegate)',
  'function setAllowance(address delegate, address token, uint96 allowanceAmount, uint16 resetTimeMin, uint32 resetBaseMin)',
  'function removeDelegate(address delegate, bool removeAllowances)',
];

// ============================================
// SAFE ABI (Minimal)
// ============================================

export const SAFE_ABI = [
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function nonce() view returns (uint256)',
  'function isModuleEnabled(address module) view returns (bool)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
];

// ============================================
// ENUMS (matching NX Platform)
// ============================================

export const ENTITY_TYPES = ['Human', 'VirtualAgent', 'PhysicalAgent', 'Organization'] as const;
export const ENTITY_STATUSES = ['Active', 'Suspended', 'Revoked'] as const;
export const AGENT_STATUSES = ['Active', 'Suspended', 'Revoked'] as const;
