# @nexoid/nx-cli

Command-line interface for **Nexoid** — identity, delegation, and payments for AI agents.

`nxcli` wraps the `@nexoid/core-client` SDK directly, giving any human operator or AI agent a composable, pipe-friendly interface to the Nexoid stack. Output is structured (JSON or table), commands use consistent exit codes, and every write operation can be previewed with `--dry-run`.

## Installation

From the monorepo root:

```bash
pnpm install
pnpm --filter @nexoid/nx-cli build
```

The binary is available at `packages/nx-cli/dist/index.js`, or via:

```bash
pnpm --filter @nexoid/nx-cli dev -- <command>   # run via tsx (no build needed)
node packages/nx-cli/dist/index.js <command>    # run compiled output
```

Once published, it will be installable globally:

```bash
npm install -g @nexoid/nx-cli
nxcli --help
```

## Quick Start

### 1. Initialize config

```bash
nxcli init \
  --rpc-url https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY \
  --registry 0xYourRegistryAddress \
  --module 0xYourModuleAddress \
  --private-key 0xYourPrivateKey
```

This creates `~/.nxcli/config.json` with restricted permissions (`0600`).

You can also supply values via environment variables instead of storing them in the config file (recommended for private keys):

```bash
export NEXOID_PRIVATE_KEY=0x...
export NEXOID_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
export NEXOID_REGISTRY=0x...
export NEXOID_MODULE=0x...
```

### 2. Register on-chain and verify

```bash
nxcli init --register      # creates config + registers operator identity
nxcli whoami               # shows DID, address, status, entity type
```

### 3. Create an agent

```bash
nxcli agent create --type virtual --label "trading-bot"
```

Output includes the agent's DID, address, and a one-time API key. Save the API key immediately — it cannot be retrieved again.

### 4. Delegate permissions

```bash
nxcli delegate did:nexoid:eth:0xAgentAddr \
  --budget 500 --budget-period monthly \
  --max-tx 50 \
  --tools send_usdt,get_balance
```

### 5. Send funds

```bash
nxcli send 0xRecipientAddress 10.00 --reason "Service payment"
nxcli send did:nexoid:eth:0xRecipient 5.00     # DIDs also work
```

## Commands

### Setup & Config

| Command | Description |
|---------|-------------|
| `nxcli init [--register]` | Initialize config file; optionally register operator on-chain |
| `nxcli whoami` | Display the current operator identity |
| `nxcli config show` | Show the active profile (private key redacted) |

### Agent Management

| Command | Description |
|---------|-------------|
| `nxcli agent create [--type] [--label]` | Create a new agent identity |
| `nxcli agent resolve <did>` | Look up any identity by DID |
| `nxcli agent revoke <did>` | Revoke an agent identity |
| `nxcli agent list` | List agents (stub — not yet indexed) |

### Delegation

| Command | Description |
|---------|-------------|
| `nxcli delegate <agentDid> [options]` | Create a scoped delegation |
| `nxcli delegation validate <id>` | Check if a delegation is still valid |
| `nxcli delegation list` | List delegations (stub — not yet indexed) |
| `nxcli request-scope [--tools] [--budget]` | Request additional scope (emits audit event) |

### Financial

| Command | Description |
|---------|-------------|
| `nxcli balance` | Show USDT and ETH balances |
| `nxcli send <to> <amount> [--reason]` | Send USDT to an address or DID |
| `nxcli set-allowance <agentDid> <amount>` | Set USDT spending allowance for an agent |
| `nxcli get-allowance <agentDid>` | Query current allowance |
| `nxcli request-funds <amount> --reason <text>` | Request funds from operator |

### Credentials

| Command | Description |
|---------|-------------|
| `nxcli credential verify-email <email>` | Start email verification (sends OTP) |
| `nxcli credential confirm-email <otp>` | Complete verification with OTP |
| `nxcli credential show` | List stored credentials |
| `nxcli credential disclose` | Create a signed disclosure of the first credential |

### Audit

| Command | Description |
|---------|-------------|
| `nxcli audit [--limit n] [--type actionType]` | Query audit event history (requires `databaseUrl` in config) |

### Help

| Command | Description |
|---------|-------------|
| `nxcli --help` | Show top-level help |
| `nxcli help <command>` | Show help for a specific command |
| `nxcli help-all` | Detailed help with examples for every command |

## Global Flags

Every command accepts these flags:

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON on stdout; errors as JSON on stderr |
| `--quiet` | Minimal output — only the primary value |
| `--profile <name>` | Use a named config profile (default: `"default"`) |
| `--dry-run` | Simulate write operations without submitting on-chain transactions |

## Exit Codes

Agents and scripts can branch on exit codes without parsing error text:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Configuration error — missing config, bad profile, no private key |
| `2` | Chain error — RPC failure, transaction reverted |
| `3` | Validation error — bad input, missing required arguments |

## Config

Config lives at `~/.nxcli/config.json` with file permissions `0600` (owner read/write only).

```json
{
  "version": "1",
  "defaultProfile": "default",
  "profiles": {
    "default": {
      "rpcUrl": "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY",
      "registryAddress": "0x...",
      "moduleAddress": "0x...",
      "usdtAddress": "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
      "privateKey": "0x...",
      "databaseUrl": "postgresql://..."
    }
  }
}
```

### Multiple profiles

```bash
nxcli init --profile staging --rpc-url https://ethereum-sepolia-rpc.publicnode.com ...
nxcli balance --profile staging
```

### Environment variable overrides

Environment variables take highest precedence over config file values:

| Variable | Overrides |
|----------|-----------|
| `NEXOID_RPC_URL` | `rpcUrl` |
| `NEXOID_PRIVATE_KEY` | `privateKey` |
| `NEXOID_REGISTRY` | `registryAddress` |
| `NEXOID_MODULE` | `moduleAddress` |
| `NEXOID_USDT` | `usdtAddress` |
| `NEXOID_DATABASE_URL` | `databaseUrl` |

## Machine-Readable Output

All commands support `--json` for agent consumption:

```bash
# Structured JSON on stdout, errors as JSON on stderr
nxcli whoami --json
# {"did":"did:nexoid:eth:0x...","address":"0x...","status":"0","entityType":"0"}

nxcli balance --json
# {"USDT":"142.50","ETH":"0.0341"}

nxcli send 0xDead...beef 10.00 --json
# {"txHash":"0x...","to":"0x...","amount":"10.00"}

# Errors go to stderr with the correct exit code
nxcli whoami --json  # (no config)
# stderr: {"error":"Config not found at ~/.nxcli/config.json. Run `nxcli init` first."}
# exit code: 1
```

## Dry Run

Preview any write operation without submitting a transaction:

```bash
nxcli send 0xDead...beef 100.00 --dry-run
# ⚠ [dry-run] Would call sendUSDT({"to":"0xDead...beef","amount":"100.00"})
```

This is critical for agent test runs and CI pipelines.

## Architecture

```
nxcli ──> NexoidClient (@nexoid/core-client)
             ├── Identity ops     (IdentityRegistry contract via nx-core)
             ├── Delegation ops   (SafeIdentityModule contract via nx-core)
             ├── Financial ops    (USDT ERC-20 via nx-core)
             └── Audit emission   (@nexoid/audit-lib)
```

The CLI wraps `NexoidClient` directly — it does **not** proxy through the Control Plane HTTP server. This means no approval gateway in the request path, but the CLI emits its own audit events via `@nexoid/audit-lib` with `source: 'cli'`.

## Project Structure

```
packages/nx-cli/
├── src/
│   ├── index.ts              # Commander root + bin entry
│   ├── config.ts             # Config load/save (~/.nxcli/config.json)
│   ├── client.ts             # NexoidClient factory + dry-run proxy
│   ├── output.ts             # Centralized stdout/stderr formatting
│   └── commands/
│       ├── identity.ts       # init, whoami, config show, agent *
│       ├── delegation.ts     # delegate, delegation *, request-scope
│       ├── financial.ts      # balance, send, allowance, request-funds
│       ├── credential.ts     # verify-email, confirm-email, show, disclose
│       ├── audit.ts          # audit event queries
│       └── help.ts           # Detailed help with examples
├── package.json
├── tsconfig.json
├── plan.md                   # Implementation plan
└── README.md                 # This file
```

## Development

```bash
# Run without building (via tsx)
pnpm --filter @nexoid/nx-cli dev -- whoami

# Build
pnpm --filter @nexoid/nx-cli build

# Type-check without emitting
pnpm --filter @nexoid/nx-cli typecheck

# Run tests
pnpm --filter @nexoid/nx-cli test
```
