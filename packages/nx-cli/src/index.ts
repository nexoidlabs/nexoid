#!/usr/bin/env node
import { Command } from 'commander';
import { setJsonMode, setQuietMode } from './output.js';
import { registerIdentityCommands } from './commands/identity.js';
import { registerFinancialCommands } from './commands/financial.js';
import { registerDelegationCommands } from './commands/delegation.js';
import { registerCredentialCommands } from './commands/credential.js';
import { registerHelpCommand } from './commands/help.js';
import { registerAdminCommands } from './commands/admin.js';

const program = new Command();

program
  .name('nxcli')
  .description('Nexoid CLI — identity, delegation, and payments for AI agents')
  .version('0.3.0')
  .option('--json', 'Machine-readable JSON output (errors to stderr)')
  .option('--quiet', 'Minimal output (just the primary value)')
  .option('--profile <name>', 'Config profile to use', 'default')
  .option('--mode <mode>', 'Override mode: operator or agent')
  .option('--dry-run', 'Simulate without on-chain operations')
  .hook('preAction', () => {
    const opts = program.opts();
    setJsonMode(!!opts.json);
    setQuietMode(!!opts.quiet);
  });

// Register all command modules
registerIdentityCommands(program);
registerFinancialCommands(program);
registerDelegationCommands(program);
registerCredentialCommands(program);
registerAdminCommands(program);
registerHelpCommand(program);

// Global error handler
program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const opts = program.opts();
  if (opts.json) {
    process.stderr.write(JSON.stringify({ error: message }) + '\n');
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }
  process.exit(1);
});
