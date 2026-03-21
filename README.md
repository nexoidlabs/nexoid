# Nexoid — Governed Autonomy for AI Agents

**On-chain identity, scoped delegation, Safe smart wallets with per-agent spending limits, and cryptographic identity proof — so operators can trust their agents to move real money.**

> Hackathon submission for [Tether Hackathon Galactica: WDK Edition 1](https://dorahacks.io/) — Track 1: Agent Wallets

## What Nexoid Does

AI agents can reason and act, but they cannot prove who they are, spend money within guardrails, or be held accountable. Nexoid solves this:

| Feature | Description |
|---------|-------------|
| **On-chain Identity** | Register operators and agents on the Ethereum IdentityRegistry |
| **Scoped Delegation** | Flat operator→agent delegation with budget limits, max transaction amounts, and expiry |
| **Safe Smart Wallets** | Operator funds held in Safe{Wallet} with AllowanceModule for per-agent spending limits |
| **WDK Key Derivation** | BIP-44 HD key derivation (m/44'/60'/0'/0/{index}) — deterministic, recoverable agent keys |
| **EIP-712 Identity Proof** | Agents generate verifiable cryptographic proofs of identity and delegation |
| **Approval Workflow** | Agents request additional funds, operators approve via dashboard |

## Architecture

```
Operator (Human)
  └─ WDK Seed Phrase (BIP-39)
       ├─ m/44'/60'/0'/0/0 → Operator EOA
       │    └─ Safe{Wallet} (1-of-1, AllowanceModule enabled)
       │         ├─ USDT balance
       │         └─ Per-agent allowances
       ├─ m/44'/60'/0'/0/1 → Agent Alpha (100 USDT/day)
       └─ m/44'/60'/0'/0/2 → Agent Beta (50 USDT, no reset)

On-chain:
  IdentityRegistry ← register operators + agents
  NexoidModule ← agent registry with embedded scope, status, expiry
  AllowanceModule ← per-agent USDT spending limits (EVM-enforced)
```

## Project Structure

```
packages/
  nx-core/        — Solidity contracts + TypeScript wrappers
  core-client/    — NexoidClient SDK (identity, delegation, wallet, proof, WDK)
  nx-cli/         — CLI tool (nxcli)
apps/
  nx-platform/    — Operator dashboard (Next.js)
  nx-verify/      — Public identity explorer & proof verifier (Next.js)
  nx-wallet/      — Mobile wallet app (React Native / Expo, WDK + Safe)
scripts/          — Demo setup scripts (01-07)
demo/             — Agent demo scenario
```

## Quick Start

```bash
# Prerequisites: Node.js >=22, pnpm >=9

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run contract tests (174 passing)
cd packages/nx-core && npx hardhat test

# Start the operator dashboard
cd apps/nx-platform && pnpm dev   # http://localhost:3100

# Start the identity explorer
cd apps/nx-verify && pnpm dev     # http://localhost:3200

# Start the mobile wallet (Expo)
cd apps/nx-wallet && npx expo start
```

## CLI Usage

```bash
# Initialize CLI config
nxcli init --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --registry 0x... --nexoid-module 0x...

# Register identity + deploy Safe
nxcli register

# Create an agent (WDK-derived key)
nxcli agent create --label "Agent Alpha"

# Delegate scope to agent
nxcli delegate 0xAgentSafeAddress --budget 100 --max-tx 50

# Set allowance on Safe
nxcli set-allowance did:nexoid:eth:0x... 100 --reset 1440

# Agent: send USDT (within allowance)
nxcli send 0xRecipient 10

# Agent: generate identity proof
nxcli credential prove --verifier 0x...

# Agent: request additional funds
nxcli request-funds --amount 500 --reason "API subscription payment"
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity 0.8.24, Hardhat |
| Wallet SDK | Tether WDK (BIP-44 HD derivation via ethers.js v6) |
| Smart Wallet | Safe{Wallet} Protocol Kit v6.1.2 + AllowanceModule |
| Client SDK | TypeScript, viem v2.21 |
| CLI | Commander.js, chalk |
| Dashboard | Next.js 15, React 19, viem |
| Mobile Wallet | React Native (Expo 54), WDK + Safe Protocol Kit, ethers.js v6 |
| Chain | Ethereum Mainnet / Sepolia |
| Token | USDT (Tether USD) |

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Key variables:

```
DEPLOYER_PRIVATE_KEY=     # For contract deployment
NEXOID_PRIVATE_KEY=       # For CLI operations
NEXOID_SEED_PHRASE=       # WDK seed phrase (BIP-39)
ETH_SEPOLIA_RPC_URL=      # Ethereum Sepolia RPC
```

## Demo Setup

Run the setup scripts in order:
```bash
HARDHAT_NETWORK=sepolia tsx scripts/01-deploy-contracts.ts
tsx scripts/02-register-operator.ts
tsx scripts/03-create-agents.ts
tsx scripts/05-deploy-safe.ts
tsx scripts/06-set-allowances.ts
tsx scripts/07-fund-agents-eth.ts
```
