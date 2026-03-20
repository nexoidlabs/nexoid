import { Command } from 'commander';
import { buildClient } from '../client.js';
import { kv, success, error, isJsonMode } from '../output.js';
import { requireOperatorMode } from '../mode.js';
import type { AgentScope, BudgetLimit, MaxTransactionAmount } from '@nexoid/nx-core';

export function registerDelegationCommands(program: Command): void {
  // nxcli delegate <agentSafe>
  program
    .command('delegate <agentSafe>')
    .description('Create or update a scoped delegation to an agent Safe')
    .requiredOption('--budget <amount>', 'Budget limit amount')
    .option('--budget-period <period>', 'Budget period: daily, weekly, or monthly', 'monthly')
    .requiredOption('--max-tx <amount>', 'Max single transaction amount')
    .option('--valid-until <iso>', 'Expiry date (ISO 8601)')
    .action(async (agentSafe: string, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);

      const budgetPeriod = opts.budgetPeriod as 'daily' | 'weekly' | 'monthly';
      if (!['daily', 'weekly', 'monthly'].includes(budgetPeriod)) {
        error(`Invalid budget period "${budgetPeriod}". Use daily, weekly, or monthly.`, 'validation');
      }

      const budgetLimit: BudgetLimit = {
        amount: opts.budget,
        currency: 'USDT',
        period: budgetPeriod,
      };

      const maxTransactionAmount: MaxTransactionAmount = {
        amount: opts.maxTx,
        currency: 'USDT',
      };

      const scope: AgentScope = {
        budgetLimit,
        maxTransactionAmount,
        allowedTools: [],
      };

      const validUntil = opts.validUntil
        ? new Date(opts.validUntil)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

      if (isNaN(validUntil.getTime())) {
        error(`Invalid date "${opts.validUntil}". Use ISO 8601 format.`, 'validation');
      }

      const result = await client.updateAgentScope({
        agentSafe: agentSafe as `0x${string}`,
        scope,
        validUntil,
      });

      kv({
        txHash: result.txHash,
      });
      if (!isJsonMode()) success(`Agent scope updated for ${agentSafe}`);
    });

  // nxcli delegation validate/revoke/suspend/reactivate
  const delegationCmd = program
    .command('delegation')
    .description('Delegation management');

  delegationCmd
    .command('validate <agentSafe>')
    .description('Validate an agent by Safe address')
    .action(async (agentSafe: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);
      const result = await client.isValidAgent(agentSafe as `0x${string}`);
      kv({
        valid: String(result.valid),
      });
    });

  delegationCmd
    .command('revoke <agentSafe>')
    .description('Revoke an agent by Safe address')
    .action(async (agentSafe: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);
      const txHash = await client.revokeAgent(agentSafe as `0x${string}`);
      kv({ txHash });
      if (!isJsonMode()) success(`Agent ${agentSafe} revoked.`);
    });

  delegationCmd
    .command('suspend <agentSafe>')
    .description('Suspend an agent by Safe address')
    .action(async (agentSafe: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);
      const txHash = await client.suspendAgent(agentSafe as `0x${string}`);
      kv({ txHash });
      if (!isJsonMode()) success(`Agent ${agentSafe} suspended.`);
    });

  delegationCmd
    .command('reactivate <agentSafe>')
    .description('Reactivate a suspended agent by Safe address')
    .action(async (agentSafe: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);
      const txHash = await client.reactivateAgent(agentSafe as `0x${string}`);
      kv({ txHash });
      if (!isJsonMode()) success(`Agent ${agentSafe} reactivated.`);
    });
}
