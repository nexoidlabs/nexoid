import { Command } from 'commander';
import chalk from 'chalk';

const HELP_TEXT = `
${chalk.bold('Nexoid CLI')} — identity, delegation, and payments for AI agents

${chalk.bold.underline('QUICK START')}

  ${chalk.dim('# 1. Admin registers your identity (registrar-only — no self-registration)')}
  ${chalk.cyan('$')} nxcli admin register-for 0xYourAddress --type human

  ${chalk.dim('# 2. You set up your CLI and deploy a Safe wallet')}
  ${chalk.cyan('$')} export NEXOID_PRIVATE_KEY=0x...
  ${chalk.cyan('$')} nxcli init --rpc-url https://mainnet.base.org \\
       --registry 0x... --delegation-registry 0x...
  ${chalk.cyan('$')} nxcli register                  ${chalk.dim('# verify identity + deploy Safe')}
  ${chalk.cyan('$')} nxcli whoami                     ${chalk.dim('# verify your identity')}

${chalk.bold.underline('SETUP & CONFIG')}

  ${chalk.yellow('nxcli init')}                       Initialize config file
      --rpc-url <url>                 Ethereum network RPC endpoint
      --registry <0x...>              IdentityRegistry contract address
      --delegation-registry <0x...>   DelegationRegistry contract address
      --safe <0x...>                  Operator Safe wallet address
      --token <0x...>                 USDT token address (optional)
      --mode operator|agent           Profile mode (default: operator)

  ${chalk.yellow('nxcli register')}                   Verify identity (registrar-registered) + deploy Safe + enable AllowanceModule

  ${chalk.yellow('nxcli enable-safe')}                Deploy Safe wallet (if skipped during register)
  ${chalk.yellow('nxcli whoami')}                     Show current identity
  ${chalk.yellow('nxcli config show')}                Display active profile

${chalk.bold.underline('AGENT MANAGEMENT')} ${chalk.dim('(operator only)')}

  ${chalk.yellow('nxcli agent create')}               Create a new agent identity
      --type virtual|physical         Agent type (default: virtual)
      --label <name>                  Human-readable label

  ${chalk.yellow('nxcli agent resolve')} <did>        Look up any identity by DID
  ${chalk.yellow('nxcli agent revoke')} <did>         Revoke an agent identity

  ${chalk.dim('Examples:')}
    ${chalk.cyan('$')} nxcli agent create --type virtual --label "trading-bot"
    ${chalk.cyan('$')} nxcli agent resolve did:nexoid:eth:0xabc...123

${chalk.bold.underline('DELEGATION')}

  ${chalk.yellow('nxcli delegate')} <agentDid>        Create a scoped delegation ${chalk.dim('(operator only)')}
      --budget <amount>               Budget limit (USDT)
      --budget-period daily|weekly|monthly  (default: monthly)
      --max-tx <amount>               Max per-transaction amount (USDT)
      --depth <n>                     Max delegation depth (default: 1)
      --valid-until <ISO>             Expiry date (default: 30 days)

  ${chalk.yellow('nxcli delegation validate')} <id>   Check if a delegation is valid
  ${chalk.yellow('nxcli delegation revoke')} <id>     Revoke a delegation ${chalk.dim('(operator only)')}

  ${chalk.dim('Examples:')}
    ${chalk.cyan('$')} nxcli delegate did:nexoid:eth:0xabc...123 \\
         --budget 500 --max-tx 50
    ${chalk.cyan('$')} nxcli delegation validate 42
    ${chalk.cyan('$')} nxcli delegation revoke 42

${chalk.bold.underline('FINANCIAL')}

  ${chalk.yellow('nxcli balance')}                     Show USDT and ETH balances
  ${chalk.yellow('nxcli send')} <to> <amount>          Send USDT to address or DID
  ${chalk.yellow('nxcli set-allowance')} <did> <amt>   Set agent spending allowance on Safe ${chalk.dim('(operator only)')}
      --reset <minutes>               Auto-reset period (0=none, 1440=daily, 10080=weekly)
  ${chalk.yellow('nxcli get-allowance')} [did]         Query current allowance
      --details                       Show spent, remaining, reset info

  ${chalk.dim('Examples:')}
    ${chalk.cyan('$')} nxcli balance --json
    ${chalk.cyan('$')} nxcli send 0xDead...beef 10.00
    ${chalk.cyan('$')} nxcli send did:nexoid:eth:0xabc...123 5.00 --dry-run

${chalk.bold.underline('CREDENTIALS')}

  ${chalk.yellow('nxcli credential verify-email')} <email>   Start email verification ${chalk.dim('(operator only)')}
  ${chalk.yellow('nxcli credential confirm-email')} <otp>    Complete with OTP ${chalk.dim('(operator only)')}
  ${chalk.yellow('nxcli credential show')}                    List stored credentials
  ${chalk.yellow('nxcli credential disclose')}                Create signed disclosure

${chalk.bold.underline('MODES')}

  ${chalk.bold('operator')} (default) — full admin: register, create agents, delegate, set allowances
  ${chalk.bold('agent')} — restricted: balance, send, get-allowance, validate, show/disclose credentials

  Set mode in config profile or override with --mode flag.
  Agent mode blocks: init, register, agent create/revoke, delegate, delegation revoke, set-allowance

${chalk.bold.underline('GLOBAL FLAGS')}

  --json              Output machine-readable JSON (errors to stderr)
  --quiet             Minimal output (just the primary value)
  --profile <name>    Use a named config profile (default: "default")
  --mode <mode>       Override mode: operator or agent
  --dry-run           Simulate write operations without submitting transactions
  --version           Show version number
  --help              Show built-in help for any command

${chalk.bold.underline('EXIT CODES')}

  ${chalk.green('0')}  Success
  ${chalk.red('1')}  Configuration error (missing config, bad profile, no private key)
  ${chalk.red('2')}  Chain error (RPC failure, transaction reverted)
  ${chalk.red('3')}  Validation error (bad input, blocked by mode)

${chalk.bold.underline('ENVIRONMENT VARIABLES')}

  NEXOID_PRIVATE_KEY             Operator/agent private key (required, never in config)
  NEXOID_RPC_URL                 Override RPC URL
  NEXOID_REGISTRY                Override IdentityRegistry address
  NEXOID_DELEGATION_REGISTRY     Override DelegationRegistry address
  NEXOID_SAFE                    Override Safe wallet address
  NEXOID_TOKEN                   Override USDT token address
  NEXOID_MODE                    Override mode (operator|agent)

${chalk.bold.underline('CONFIG')}

  Config file: ${chalk.dim('~/.nxcli/config.json')} (permissions: 0600)
  Credentials: ${chalk.dim('~/.nxcli/credentials.json')}
  Private key: ${chalk.dim('NEXOID_PRIVATE_KEY env var only — never stored in config')}

  Supports multiple named profiles. Use --profile to switch.

${chalk.dim('Docs: https://github.com/nexoid/nx  |  Version: 0.3.0')}
`;

export function registerHelpCommand(program: Command): void {
  program
    .command('help-all')
    .description('Show detailed help with examples for all commands')
    .action(() => {
      process.stdout.write(HELP_TEXT);
    });

  // Override the default help to add a hint about help-all
  program.addHelpText('after', `
Use ${chalk.yellow('nxcli help-all')} for detailed help with examples.
Use ${chalk.yellow('nxcli help <command>')} for help on a specific command.`);
}
