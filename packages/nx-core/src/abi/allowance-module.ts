/**
 * AllowanceModule ABI — Safe singleton for per-delegate spending limits.
 *
 * Deployed on Base Mainnet at 0xCFbFaC74C26F8647cBDb8c5caf80BB5b32E43134
 * This is a shared singleton — each Safe enables it as a module.
 *
 * Key design:
 * - addDelegate/setAllowance are called THROUGH the Safe (operator signs Safe tx)
 * - executeAllowanceTransfer is called DIRECTLY by the delegate (agent signs)
 * - getTokenAllowance is a read-only query
 */
export const AllowanceModuleABI = [
  // --- Delegate Management (called via Safe transaction) ---
  {
    type: 'function',
    name: 'addDelegate',
    inputs: [{ name: 'delegate', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'removeDelegate',
    inputs: [
      { name: 'delegate', type: 'address' },
      { name: 'removeAllowances', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getDelegates',
    inputs: [
      { name: 'safe', type: 'address' },
      { name: 'start', type: 'uint48' },
      { name: 'pageSize', type: 'uint8' },
    ],
    outputs: [
      { name: 'results', type: 'address[]' },
      { name: 'next', type: 'uint48' },
    ],
    stateMutability: 'view',
  },

  // --- Allowance Management (called via Safe transaction) ---
  {
    type: 'function',
    name: 'setAllowance',
    inputs: [
      { name: 'delegate', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'allowanceAmount', type: 'uint96' },
      { name: 'resetTimeMin', type: 'uint16' },
      { name: 'resetBaseMin', type: 'uint32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'resetAllowance',
    inputs: [
      { name: 'delegate', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'deleteAllowance',
    inputs: [
      { name: 'delegate', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // --- Read Functions ---
  {
    type: 'function',
    name: 'getTokenAllowance',
    inputs: [
      { name: 'safe', type: 'address' },
      { name: 'delegate', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256[5]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTokens',
    inputs: [
      { name: 'safe', type: 'address' },
      { name: 'delegate', type: 'address' },
    ],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },

  // --- Transfer Execution (called DIRECTLY by delegate/agent) ---
  {
    type: 'function',
    name: 'executeAllowanceTransfer',
    inputs: [
      { name: 'safe', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint96' },
      { name: 'paymentToken', type: 'address' },
      { name: 'payment', type: 'uint96' },
      { name: 'delegate', type: 'address' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // --- Hash Generation (for delegate signature) ---
  {
    type: 'function',
    name: 'generateTransferHash',
    inputs: [
      { name: 'safe', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint96' },
      { name: 'paymentToken', type: 'address' },
      { name: 'payment', type: 'uint96' },
      { name: 'nonce', type: 'uint16' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },

  // --- Events ---
  {
    type: 'event',
    name: 'AddDelegate',
    inputs: [
      { name: 'safe', type: 'address', indexed: true },
      { name: 'delegate', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'RemoveDelegate',
    inputs: [
      { name: 'safe', type: 'address', indexed: true },
      { name: 'delegate', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'ExecuteAllowanceTransfer',
    inputs: [
      { name: 'safe', type: 'address', indexed: true },
      { name: 'delegate', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'to', type: 'address', indexed: false },
      { name: 'value', type: 'uint96', indexed: false },
      { name: 'nonce', type: 'uint16', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SetAllowance',
    inputs: [
      { name: 'safe', type: 'address', indexed: true },
      { name: 'delegate', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'allowanceAmount', type: 'uint96', indexed: false },
      { name: 'resetTime', type: 'uint16', indexed: false },
    ],
  },
] as const;
