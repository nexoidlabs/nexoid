# nx-cli Implementation Plan

**Version:** 2.0 (post-architecture revision, 2026-03-13)
**Supersedes:** Previous plan (control-plane era)

## What & Why

`nxcli` is the **primary interface** for the Nexoid stack — replacing the MCP Control Plane entirely. It serves both human operators and AI agents. Modern LLMs work better with CLIs: `--help` manuals don't bloat context windows, output is pipeable, and commands are composable.

The CLI wraps `NexoidClient` from `@nexoid/core-client`, which interacts directly with on-chain contracts (IdentityRegistry, DelegationRegistry) and the operator's Safe smart wallet.

**Key architecture decisions:**
- CLI replaces the Control Plane — there is no MCP server
- Safe smart wallets provide EVM-enforced spending limits via AllowanceModule
- No database dependency (no PostgreSQL, no audit-lib)
- Two modes: operator (human) and agent
- Private keys via environment variable only (never stored in config)
- Focus on identity and delegation, not general permission management

---

## Design Decisions & Rationale

| Decision | Why |
|---|---|
| CLI replaces Control Plane | Simpler architecture; on-chain enforcement via Safe makes middleware unnecessary |
| Two modes: operator / agent | Prevents agents from accessing admin commands; clear security boundary |
| Safe AllowanceModule for spending | EVM-enforced limits; compromised agent key cannot drain beyond allowance |
| No `@nexoid/audit-lib` | On-chain events provide traceability; DB audit is deferred |
| Private key via env var only | Config file never contains secrets; safe to share/version |
| `nxcli agent create` outputs agent config | Zero-friction agent onboarding; operator generates everything the agent needs |
| Exit codes 1/2/3 | Agents branch on exit code without parsing stderr text |
| `--dry-run` flag | Prevents on-chain tx; critical for agent test runs |
| `--json` flag | Agents parse stdout cleanly; no stdout corruption from stray logs |
| DID resolution for `send <to>` | Accepts both `0x` addresses and `did:nexoid:base:...` DIDs |

---

## Package Structure

```
packages/nx-cli/
├── src/
│   ├── index.ts                # Commander root + bin entry (#!/usr/bin/env node)
│   ├── config.ts               # Config load/save from ~/.nxcli/config.json
│   ├── client.ts               # buildClient(profile?, dryRun?) → NexoidClient
│   ├── output.ts               # Centralized stdout/stderr: kv(), table(), error()
│   └── commands/
│       ├── identity.ts         # init, register, whoami, config show, agent create/resolve/revoke
│       ├── delegation.ts       # delegate, delegation validate/revoke
│       ├── financial.ts        # balance, send, set-allowance, get-allowance
│       ├── credential.ts       # verify-email, confirm-email, show, disclose
│       └── help.ts             # Detailed help with examples
├── package.json
├── tsconfig.json
├── README.md
└── plan.md                     # ← this file
```

---

## Dependencies

```json
{
  "dependencies": {
    "@nexoid/core-client": "workspace:*",
    "@nexoid/nx-core": "workspace:*",
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.5"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "~5.7.0",
    "vitest": "^3.0.0"
  }
}
```

Removed: `@nexoid/audit-lib` (no database dependency).

---

## Config

### Profile structure

```typescript
interface NxCliProfile {
  mode: 'operator' | 'agent';
  rpcUrl: string;
  registryAddress: `0x${string}`;
  delegationRegistryAddress: `0x${string}`;
  safeAddress?: `0x${string}`;          // Operator's Safe (set after register)
  usdcAddress?: `0x${string}`;          // Defaults to Base Mainnet USDC
}

interface NxCliConfig {
  version: '1';
  defaultProfile: string;
  profiles: Record<string, NxCliProfile>;
}
```

Config path: `~/.nxcli/config.json` (permissions: `0600`)
Config dir: `~/.nxcli/` (permissions: `0700`)

**No private key in config.** Always via `NEXOID_PRIVATE_KEY` environment variable.

### Environment variable overrides

| Variable | Overrides |
|----------|-----------|
| `NEXOID_PRIVATE_KEY` | (required, not stored in config) |
| `NEXOID_RPC_URL` | `rpcUrl` |
| `NEXOID_REGISTRY` | `registryAddress` |
| `NEXOID_DELEGATION_REGISTRY` | `delegationRegistryAddress` |
| `NEXOID_SAFE` | `safeAddress` |
| `NEXOID_USDC` | `usdcAddress` |

---

## Modes

### Operator mode (default)

Full administrative control. Used by human operators.

### Agent mode (`--mode agent` or `mode: "agent"` in profile)

Restricted to self-service commands only. Cannot create agents, delegate, or set allowances.

### Mode enforcement

When mode is `agent`, the following commands are blocked with exit code 3:
- `init`, `register`
- `agent create`, `agent revoke`
- `delegate`, `delegation revoke`
- `set-allowance`
- `credential verify-email`, `credential confirm-email`

---

## Command Reference

### Global flags

```
--json              Machine-readable JSON output (errors to stderr)
--quiet             Minimal output (just the primary value)
--profile <name>    Config profile to use [default: "default"]
--mode <mode>       Override mode: operator or agent
--dry-run           Simulate without on-chain operations
--version           Show version
--help              Show help
```

### Operator commands

| Command | Description | Output |
|---|---|---|
| `nxcli init` | Create config file with contract addresses | config path |
| `nxcli register` | Register operator on-chain + deploy Safe | DID, address, safeAddress, txHash |
| `nxcli whoami` | Show operator identity | DID, address, safeAddress, status, entityType |
| `nxcli config show` | Display active profile | All config fields |
| `nxcli agent create [--type] [--label]` | Create agent identity | DID, address, txHash, agent config JSON |
| `nxcli agent resolve <did>` | Look up any identity | Full identity record |
| `nxcli agent revoke <did>` | Revoke an agent | txHash, status |
| `nxcli delegate <agentDid>` | Create scoped delegation | delegationId, txHash |
| `nxcli delegation validate <id>` | Validate delegation chain | valid, depth |
| `nxcli delegation revoke <id>` | Revoke a delegation | txHash |
| `nxcli set-allowance <agentDid> <amount>` | Set Safe AllowanceModule limit | txHash |
| `nxcli balance` | Show Safe USDC + ETH | USDC, ETH |
| `nxcli send <to> <amount>` | Send USDC from Safe (as owner) | txHash, to, amount |
| `nxcli credential verify-email <email>` | Start email verification | emailDomain, otp (dev) |
| `nxcli credential confirm-email <otp>` | Complete verification | credential details |

### Agent commands

| Command | Description | Output |
|---|---|---|
| `nxcli whoami` | Show agent identity + owner | DID, address, ownerDid, status |
| `nxcli balance` | Show allowance remaining | allowance, safeBalance |
| `nxcli send <to> <amount>` | Send via AllowanceModule | txHash, to, amount |
| `nxcli get-allowance` | Check remaining allowance | amount |
| `nxcli delegation validate <id>` | Validate own delegation | valid, depth |
| `nxcli credential show` | List own credentials | credential table |
| `nxcli credential disclose` | Signed disclosure | JSON disclosure object |

### Shared commands (both modes)

| Command | Description |
|---|---|
| `nxcli help-all` | Detailed help with examples |
| `nxcli --help` | Built-in help |
| `nxcli <command> --help` | Command-specific help |

---

## Agent onboarding flow

When an operator runs `nxcli agent create`, the CLI:

1. Generates a new EOA keypair for the agent
2. Registers the agent identity on-chain (linked to operator)
3. Outputs the agent's private key (shown once, never stored by the CLI)
4. Outputs a ready-to-use agent config:

```json
{
  "version": "1",
  "defaultProfile": "default",
  "profiles": {
    "default": {
      "mode": "agent",
      "rpcUrl": "https://mainnet.base.org",
      "registryAddress": "0x...",
      "delegationRegistryAddress": "0x...",
      "safeAddress": "0x...",
      "usdcAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    }
  }
}
```

The operator then:
1. Saves this config as the agent's `~/.nxcli/config.json`
2. Sets `NEXOID_PRIVATE_KEY` in the agent's environment
3. Runs `nxcli set-allowance <agentDid> <amount>` to fund the agent
4. Runs `nxcli delegate <agentDid> ...` to set delegation scope

The agent can then immediately use `nxcli --mode agent send ...` to transact.

---

## Dry-run implementation

The `--dry-run` flag creates a Proxy around `NexoidClient` that intercepts write methods (`registerOperator`, `createAgent`, `updateIdentityStatus`, `delegate`, `revoke`, `sendUSDC`, `setAllowance`) and logs the intended call to stderr without submitting a transaction.

Read methods (`resolveIdentity`, `getBalance`, `getAllowance`, `validateDelegation`) execute normally.

---

## Exit codes

| Code | Meaning | Examples |
|------|---------|---------|
| 0 | Success | Command completed |
| 1 | Config error | Missing config, bad profile, no private key |
| 2 | Chain error | RPC failure, tx reverted, insufficient funds |
| 3 | Validation error | Bad input, blocked by mode, missing args |

---

## Verification checklist

- [ ] `pnpm install` — workspace links resolve
- [ ] `pnpm --filter @nexoid/nx-cli build` — zero TS errors
- [ ] `node packages/nx-cli/dist/index.js --help` — all commands visible
- [ ] `nxcli init --rpc-url ... --registry ... --delegation-registry ...` — creates config
- [ ] `nxcli register` (with `NEXOID_PRIVATE_KEY`) — registers + deploys Safe
- [ ] `nxcli whoami --json` — `{"did":"...","safeAddress":"...",...}`
- [ ] `nxcli agent create --type virtual --label "bot" --json` — DID + agent config
- [ ] `nxcli --mode agent whoami --json` — agent identity
- [ ] `nxcli --mode agent send 0xDead...beef 1.00 --dry-run` — logs intent, exit 0
- [ ] `nxcli --mode agent register` — blocked, exit 3
- [ ] `nxcli balance --json` — `{"USDC":"...","ETH":"..."}`
- [ ] Missing config → exit 1
- [ ] Bad command → exit 3

---

## Deferred (Post-MVP)

| Item | Why |
|------|-----|
| `nxcli audit` | Requires DB or subgraph; on-chain events suffice for now |
| `nxcli approvals` | No approval gateway; Safe multi-sig is the approval mechanism |
| `nxcli present` (JWT-VC) | EIP-712 signed structs suffice; full VC infra deferred |
| `request-funds` / `request-scope` | Fire-and-forget without approval return channel |
| Gas sponsorship | Paymaster integration deferred; operators fund with ETH for now |
