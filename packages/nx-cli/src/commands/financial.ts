import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildClient } from '../client.js';
import { loadConfig } from '../config.js';
import { kv, primary, success, error, isJsonMode } from '../output.js';
import { requireOperatorMode, resolveMode } from '../mode.js';

interface PendingApproval {
  id: string;
  agentDid: string;
  requestedAmount: string;
  reason: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'denied';
}

function getRequestsPath(): string {
  const dir = join(homedir(), '.nexoid');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'pending-requests.json');
}

function loadRequests(): PendingApproval[] {
  const path = getRequestsPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PendingApproval[];
  } catch {
    return [];
  }
}

function saveRequests(requests: PendingApproval[]): void {
  writeFileSync(getRequestsPath(), JSON.stringify(requests, null, 2) + '\n', 'utf-8');
}

export function registerFinancialCommands(program: Command): void {
  // nxcli balance
  program
    .command('balance')
    .description('Show USDT and ETH balance')
    .option('--agents', 'Show per-agent Safe balances (operator mode)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);
      const did = client.getOperatorDid();
      if (!did) {
        error('No identity. Run `nxcli register` first.', 'config');
      }

      // If Safe is configured, query Safe balance
      let safeAddress: `0x${string}` | undefined;
      let nexoidModuleAddress: `0x${string}` | undefined;
      try {
        const profile = loadConfig(globalOpts.profile);
        safeAddress = profile.safeAddress;
        nexoidModuleAddress = profile.nexoidModuleAddress;
      } catch { /* no config */ }

      const balance = await client.getBalance(did!, safeAddress);
      const output: Record<string, string> = {
        USDT: balance.usdt,
        ETH: balance.eth,
      };
      if (safeAddress) {
        output.wallet = safeAddress;
        output.type = 'Safe';
      }
      kv(output);

      // Show per-agent Safe balances if --agents flag
      if (opts.agents && safeAddress && nexoidModuleAddress) {
        try {
          const agents = await client.getAgentSafes(safeAddress);
          if (agents.length === 0) {
            if (!isJsonMode()) primary('No agent Safes registered.');
          } else {
            if (!isJsonMode()) primary(`\nAgent Safes (${agents.length}):`);
            for (const agent of agents) {
              const agentBalance = await client.getBalance(
                `did:nexoid:eth:${agent.agentEOA.toLowerCase()}` as any,
                agent.agentSafe
              );
              kv({
                agentSafe: agent.agentSafe,
                agentEOA: agent.agentEOA,
                USDT: agentBalance.usdt,
                ETH: agentBalance.eth,
              });
            }
          }
        } catch (err) {
          if (!isJsonMode()) primary(`Could not fetch agent Safes: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });

  // nxcli send <to> <amount>
  program
    .command('send <to> <amount>')
    .description('Send USDT to an address or DID')
    .action(async (to: string, amount: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile, globalOpts.dryRun);

      // Resolve DID to address if needed
      let toAddress: `0x${string}`;
      if (to.startsWith('did:nexoid:')) {
        const { didToAddress } = await import('@nexoid/nx-core');
        toAddress = didToAddress(to as `did:nexoid:eth:${string}`);
      } else if (to.startsWith('0x')) {
        toAddress = to as `0x${string}`;
      } else {
        error(`Invalid recipient "${to}". Provide a 0x address or did:nexoid:eth:... DID.`, 'validation');
      }

      // Determine mode and Safe address
      const mode = resolveMode(globalOpts);
      let safeAddress: `0x${string}` | undefined;
      try {
        const profile = loadConfig(globalOpts.profile);
        safeAddress = profile.safeAddress;
      } catch { /* no config */ }

      const result = await client.sendUSDT({ to: toAddress!, amount }, safeAddress, mode);

      kv({
        txHash: result.txHash,
        to: result.to,
        amount: result.amount,
      });
      if (!isJsonMode()) success(`Sent ${amount} USDT to ${to}`);
    });

  // nxcli fund-agent <agentDid> <amount>
  program
    .command('fund-agent <agentDid> <amount>')
    .description('Send USDT from operator Safe to agent Safe')
    .action(async (agentDid: string, amount: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);

      let safeAddress: `0x${string}` | undefined;
      let nexoidModuleAddress: `0x${string}` | undefined;
      try {
        const profile = loadConfig(globalOpts.profile);
        safeAddress = profile.safeAddress;
        nexoidModuleAddress = profile.nexoidModuleAddress;
      } catch { /* no config */ }

      if (!safeAddress) {
        error('No Safe address configured. Run `nxcli enable-safe` first.', 'config');
      }

      if (!nexoidModuleAddress) {
        error('No NexoidModule address configured. Add --nexoid-module to `nxcli init`.', 'config');
      }

      // Look up agent's Safe address from NexoidModule
      const { didToAddress } = await import('@nexoid/nx-core');
      const agentEOA = didToAddress(agentDid as `did:nexoid:eth:${string}`);
      const agents = await client.getAgentSafes(safeAddress!);
      const agentRecord = agents.find(a => a.agentEOA.toLowerCase() === agentEOA.toLowerCase());

      if (!agentRecord) {
        error(`No agent Safe found for ${agentDid}. Deploy one with \`nxcli agent create\`.`, 'validation');
      }

      const txHash = await client.fundAgentSafe(safeAddress!, agentRecord!.agentSafe, amount);

      kv({
        txHash,
        from: safeAddress!,
        to: agentRecord!.agentSafe,
        amount,
      });
      if (!isJsonMode()) success(`Sent ${amount} USDT to agent Safe ${agentRecord!.agentSafe}`);
    });

  // nxcli set-allowance <agentDid> <amount>
  program
    .command('set-allowance <agentDid> <amount>')
    .description('Set USDT spending allowance for an agent on their Safe (or operator Safe)')
    .option('--reset <minutes>', 'Auto-reset period in minutes (0=none, 1440=daily, 10080=weekly)', '0')
    .action(async (agentDid: string, amount: string, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);

      let safeAddress: `0x${string}` | undefined;
      let nexoidModuleAddress: `0x${string}` | undefined;
      try {
        const profile = loadConfig(globalOpts.profile);
        safeAddress = profile.safeAddress;
        nexoidModuleAddress = profile.nexoidModuleAddress;
      } catch { /* no config */ }

      const resetTimeMin = parseInt(opts.reset, 10);

      // If NexoidModule is configured, look up agent's own Safe
      let agentSafeAddress: `0x${string}` | undefined;
      if (safeAddress && nexoidModuleAddress) {
        try {
          const { didToAddress } = await import('@nexoid/nx-core');
          const agentEOA = didToAddress(agentDid as `did:nexoid:eth:${string}`);
          const agents = await client.getAgentSafes(safeAddress);
          const agentRecord = agents.find(a => a.agentEOA.toLowerCase() === agentEOA.toLowerCase());
          if (agentRecord) {
            agentSafeAddress = agentRecord.agentSafe;
          }
        } catch {
          // Fall back to operator Safe
        }
      }

      const txHash = await client.setAllowance(
        { agentDid: agentDid as `did:nexoid:eth:${string}`, amount },
        safeAddress,
        resetTimeMin,
        agentSafeAddress
      );

      const target = agentSafeAddress ? `agent Safe ${agentSafeAddress}` : 'operator Safe';
      kv({ txHash, target: agentSafeAddress ?? safeAddress });
      if (!isJsonMode()) {
        const resetLabel = resetTimeMin === 0 ? 'no reset' :
          resetTimeMin === 1440 ? 'daily reset' :
          resetTimeMin === 10080 ? 'weekly reset' :
          `${resetTimeMin}min reset`;
        success(`Allowance set to ${amount} USDT for ${agentDid} on ${target} (${resetLabel})`);
      }
    });

  // nxcli get-allowance [agentDid]
  program
    .command('get-allowance [agentDid]')
    .description('Get the current USDT allowance for an agent')
    .option('--details', 'Show full allowance details (spent, reset time, nonce)')
    .action(async (agentDid: string | undefined, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);

      const targetDid = agentDid ?? client.getOperatorDid();
      if (!targetDid) {
        error('Provide an agent DID or ensure NEXOID_PRIVATE_KEY is set.', 'validation');
      }

      let safeAddress: `0x${string}` | undefined;
      try {
        const profile = loadConfig(globalOpts.profile);
        safeAddress = profile.safeAddress;
      } catch { /* no config */ }

      if (safeAddress && opts.details) {
        // Detailed view from AllowanceModule
        const details = await client.getAllowanceDetails(
          safeAddress,
          targetDid as `did:nexoid:eth:${string}`
        );
        kv({
          allowance: details.amount,
          spent: details.spent,
          remaining: details.remaining,
          resetPeriod: details.resetTimeMin === 0 ? 'none' : `${details.resetTimeMin} min`,
          nonce: String(details.nonce),
        });
      } else {
        const allowance = await client.getAllowance(
          targetDid as `did:nexoid:eth:${string}`,
          safeAddress
        );
        primary(allowance);
      }
    });

  // nxcli request-funds --amount <usdt> --reason <text>
  program
    .command('request-funds')
    .description('Request additional USDT funds from operator (agent mode)')
    .requiredOption('--amount <usdt>', 'Amount of USDT to request')
    .requiredOption('--reason <text>', 'Reason for the request')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);
      const did = client.getOperatorDid();
      if (!did) {
        error('No identity. Set NEXOID_PRIVATE_KEY.', 'config');
      }

      const request: PendingApproval = {
        id: randomUUID(),
        agentDid: did!,
        requestedAmount: opts.amount,
        reason: opts.reason,
        timestamp: Date.now(),
        status: 'pending',
      };

      const requests = loadRequests();
      requests.push(request);
      saveRequests(requests);

      kv({
        id: request.id,
        amount: request.requestedAmount,
        reason: request.reason,
        status: request.status,
      });
      if (!isJsonMode()) success(`Fund request submitted (${opts.amount} USDT).`);
    });

  // nxcli list-requests
  program
    .command('list-requests')
    .description('List pending fund requests')
    .action(async () => {
      const requests = loadRequests();
      const pending = requests.filter(r => r.status === 'pending');

      if (pending.length === 0) {
        if (isJsonMode()) {
          process.stdout.write('[]\n');
        } else {
          process.stdout.write('No pending requests.\n');
        }
        return;
      }

      if (isJsonMode()) {
        process.stdout.write(JSON.stringify(pending) + '\n');
      } else {
        for (const r of pending) {
          kv({
            id: r.id,
            agent: r.agentDid,
            amount: r.requestedAmount,
            reason: r.reason,
            time: new Date(r.timestamp).toISOString(),
          });
          process.stdout.write('\n');
        }
      }
    });

  // nxcli approve-request <id>
  program
    .command('approve-request <id>')
    .description('Approve a pending fund request (operator mode)')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const requests = loadRequests();
      const request = requests.find(r => r.id === id);
      if (!request) {
        error(`Request ${id} not found.`, 'validation');
      }
      if (request!.status !== 'pending') {
        error(`Request ${id} is already ${request!.status}.`, 'validation');
      }

      request!.status = 'approved';
      saveRequests(requests);

      kv({
        id: request!.id,
        status: 'approved',
        amount: request!.requestedAmount,
        agent: request!.agentDid,
      });
      if (!isJsonMode()) success(`Request approved. Increase allowance for ${request!.agentDid} by ${request!.requestedAmount} USDT.`);
    });
}
