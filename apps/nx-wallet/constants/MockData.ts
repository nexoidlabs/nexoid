export interface Token {
  symbol: string;
  name: string;
  amount: number;
  valueUsd: number;
}

export interface Wallet {
  id: string;
  name: string;
  type: 'main' | 'robot';
  balance: number;
  currency: string;
  avatarUrl?: string; // For robots
  tokens: Token[];
  address?: string; // EVM address
}

export interface Transaction {
  id: string;
  walletId: string;
  merchant: string;
  amount: number;
  date: string;
  status: 'pending' | 'completed';
  type: 'expense' | 'income';
  iconName: string; // Lucide icon name
  initiatedBy?: string; // ID of the wallet/unit that initiated it
  
  // Blockchain specific fields
  txHash?: string;
  blockNumber?: number;
  timestamp?: number;
  from?: string;
  to?: string;
  tokenSymbol?: string;
}

export type CredentialCategory = 'id' | 'health' | 'document';

export interface Credential {
  id: string;
  title: string;
  issuer: string;
  category: CredentialCategory;
  issuedAt: string;
  validUntil: string;
  verified: boolean;
  accentColor: string;
  icon?: string; // Optional icon override
}

export interface CredentialDelegation {
  id: string;
  credentialId: string;
  delegatedToWalletId: string;
  purpose: string;
  delegatedAt: string;
  expiresAt?: string;
}

export const MAIN_WALLET_ID = 'main-wallet-01';

export const INITIAL_WALLETS: Wallet[] = [
  {
    id: MAIN_WALLET_ID,
    name: 'Main Wallet',
    type: 'main',
    balance: 12450.00,
    currency: 'USD',
    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    tokens: [
      { symbol: 'NEXO', name: 'Nexoid', amount: 5000, valueUsd: 5000 },
      { symbol: 'ETH', name: 'Ethereum', amount: 2.5, valueUsd: 4500 },
      { symbol: 'SOL', name: 'Solana', amount: 15, valueUsd: 2250 },
    ],
  },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    walletId: MAIN_WALLET_ID,
    merchant: 'Starbucks',
    amount: -5.40,
    date: 'Today, 9:41 AM',
    status: 'completed',
    type: 'expense',
    iconName: 'coffee',
    initiatedBy: 'robot-01',
    tokenSymbol: 'USDT',
  },
  {
    id: 'tx-2',
    walletId: MAIN_WALLET_ID,
    merchant: 'Apple Store',
    amount: -1299.00,
    date: 'Yesterday',
    status: 'completed',
    type: 'expense',
    iconName: 'smartphone',
    initiatedBy: 'robot-02',
    tokenSymbol: 'USDT',
  },
  {
    id: 'tx-3',
    walletId: MAIN_WALLET_ID,
    merchant: 'Transfer from Unit-02',
    amount: 500.00,
    date: 'Yesterday',
    status: 'completed',
    type: 'income',
    iconName: 'arrow-down-left',
    tokenSymbol: 'USDT',
  },
];

export const MOCK_CREDENTIALS: Credential[] = [
  {
    id: 'cred-1',
    title: 'National ID Card',
    issuer: 'Federal Republic of Germany',
    category: 'id',
    issuedAt: '15.03.2024',
    validUntil: '15.03.2034',
    verified: true,
    accentColor: '#2196F3',
  },
  {
    id: 'cred-2',
    title: 'Driver\'s License',
    issuer: 'European Union',
    category: 'id',
    issuedAt: '01.06.2023',
    validUntil: '01.06.2033',
    verified: true,
    accentColor: '#673AB7',
  },
  {
    id: 'cred-3',
    title: 'Health Insurance',
    issuer: 'AOK Bayern',
    category: 'health',
    issuedAt: '01.01.2024',
    validUntil: '31.12.2024',
    verified: true,
    accentColor: '#4CAF50',
  },
  {
    id: 'cred-4',
    title: 'University Degree',
    issuer: 'Technical University Munich',
    category: 'document',
    issuedAt: '15.07.2022',
    validUntil: 'Lifetime',
    verified: true,
    accentColor: '#FF9800',
  },
];

export const MOCK_CREDENTIAL_DELEGATIONS: CredentialDelegation[] = [
  {
    id: 'del-1',
    credentialId: 'cred-1',
    delegatedToWalletId: 'robot-01',
    purpose: 'Age verification for purchase',
    delegatedAt: 'Today, 10:00 AM',
    expiresAt: '2h',
  },
  {
    id: 'del-2',
    credentialId: 'cred-3',
    delegatedToWalletId: 'robot-02',
    purpose: 'Pharmacy pickup',
    delegatedAt: 'Yesterday, 4:30 PM',
    expiresAt: '4h',
  },
];