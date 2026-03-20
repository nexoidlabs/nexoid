# NX-Core — Identity & Wallets

Foundation layer. On-chain identity and wallet infrastructure on Base Mainnet.

Answers: **"Who is this agent, and what is it allowed to do?"**

## Key Components

- **IdentityRegistry** — Global DID registry (`did:nexoid:base:<address>`)
- **SafeIdentityModule** — Scoped delegation chains with cascading revocation
- **Wallet Primitives** — Safe smart contract wallets with dual-key model (human owner + agent operator)
- **Credential Anchoring** — On-chain hashes of W3C Verifiable Credentials

## Entity Types

- **Human** — Safe address, SIWE auth, holds W3C VCs
- **Virtual Agent** — EOA, scoped delegation VCs
- **Physical Agent** — EOA + hardware-rooted identity (TPM/TEE)
- **Organization** — Safe multisig, root of corporate delegation chains

