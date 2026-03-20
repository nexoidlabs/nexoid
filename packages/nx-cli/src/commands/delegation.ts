import { Command } from 'commander';
import { buildClient } from '../client.js';
import { kv, success, error, isJsonMode } from '../output.js';
import { requireOperatorMode } from '../mode.js';
import type { AgentScope, BudgetLimit, MaxTransactionAmount } from '@nexoid/nx-core';

export function registerDelegationCommands(program: Command): void {
  // nxcli delegate <agentDid>
  program
    .command('delegate <agentDid>')
    .description('Create a scoped delegation to an agent')
    .requiredOption('--budget <amount>', 'Budget limit amount')
    .option('--budget-period <period>', 'Budget period: daily, weekly, or monthly', 'monthly')
    .requiredOption('--max-tx <amount>', 'Max single transaction amount')
    .option('--depth <n>', 'Max delegation depth', '1')
    .option('--valid-until <iso>', 'Expiry date (ISO 8601)')
    .action(async (agentDid: string, opts, cmd) => {
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
        delegationDepth: parseInt(opts.depth, 10),
      };

      const validUntil = opts.validUntil
        ? new Date(opts.validUntil)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

      if (isNaN(validUntil.getTime())) {
        error(`Invalid date "${opts.validUntil}". Use ISO 8601 format.`, 'validation');
      }

      const result = await client.delegate({
        agentDid: agentDid as `did:nexoid:eth:${string}`,
        scope,
        validUntil,
      });

      kv({
        delegationId: result.delegationId,
        txHash: result.txHash,
      });
      if (!isJsonMode()) success(`Delegation created for ${agentDid}`);
    });

  // nxcli delegation validate/revoke
  const delegationCmd = program
    .command('delegation')
    .description('Delegation management');

  delegationCmd
    .command('validate <id>')
    .description('Validate a delegation by ID')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);
      const result = await client.validateDelegation(id);
      kv({
        valid: String(result.valid),
        depth: String(result.depth),
      });
    });

  delegationCmd
    .command('revoke <id>')
    .description('Revoke a delegation (O(1) chain-breaking)')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);
      const txHash = await client.revoke(id);
      kv({ txHash });
      if (!isJsonMode()) success(`Delegation ${id} revoked.`);
    });
}
