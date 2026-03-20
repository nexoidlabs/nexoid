import { Command } from 'commander';
import { buildClient } from '../client.js';
import { kv, success, error, isJsonMode } from '../output.js';
import { EntityType } from '@nexoid/nx-core';

export function registerAdminCommands(program: Command): void {
  const adminCmd = program
    .command('admin')
    .description('Nexoid admin operations (registrar management, sponsored registration)');

  // nxcli admin set-registrar <address> --authorize/--revoke
  adminCmd
    .command('set-registrar <address>')
    .description('Add or remove a registrar address (admin only)')
    .option('--revoke', 'Remove registrar authorization')
    .action(async (address: string, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile, globalOpts.dryRun);

      const authorized = !opts.revoke;
      const txHash = await client.setRegistrar(
        address as `0x${string}`,
        authorized
      );

      kv({ txHash, registrar: address, authorized: String(authorized) });
      if (!isJsonMode()) {
        success(`Registrar ${address} ${authorized ? 'authorized' : 'revoked'}.`);
      }
    });

  // nxcli admin transfer <newAdmin>
  adminCmd
    .command('transfer <newAdmin>')
    .description('Transfer admin role to a new address (admin only)')
    .action(async (newAdmin: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile, globalOpts.dryRun);

      const txHash = await client.transferAdmin(newAdmin as `0x${string}`);

      kv({ txHash, newAdmin });
      if (!isJsonMode()) {
        success(`Admin role transferred to ${newAdmin}.`);
      }
    });

  // nxcli admin register-for <ownerAddress>
  adminCmd
    .command('register-for <ownerAddress>')
    .description('Register an identity on behalf of a user (registrar only)')
    .option('--type <type>', 'Entity type: human or organization', 'human')
    .action(async (ownerAddress: string, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile, globalOpts.dryRun);

      const entityType = opts.type === 'organization'
        ? EntityType.Organization
        : EntityType.Human;

      const txHash = await client.registerIdentityFor(
        ownerAddress as `0x${string}`,
        entityType,
        '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
      );

      kv({ txHash, owner: ownerAddress, entityType: opts.type });
      if (!isJsonMode()) {
        success(`Identity registered for ${ownerAddress}.`);
      }
    });

  // nxcli admin info
  adminCmd
    .command('info')
    .description('Show admin address and check registrar status')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);

      const adminAddress = await client.getAdmin();
      const operatorDid = client.getOperatorDid();

      const output: Record<string, string> = {
        admin: adminAddress,
      };

      if (operatorDid) {
        const { didToAddress } = await import('@nexoid/nx-core');
        const myAddress = didToAddress(operatorDid);
        const isAdmin = myAddress.toLowerCase() === adminAddress.toLowerCase();
        const isRegistrar = await client.isRegistrar(myAddress);
        output.myAddress = myAddress;
        output.isAdmin = String(isAdmin);
        output.isRegistrar = String(isRegistrar);
      }

      kv(output);
    });
}
