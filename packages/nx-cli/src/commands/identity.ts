import { Command } from 'commander';
import { buildClient } from '../client.js';
import { initConfig, configExists, loadConfig, getConfigPath, updateProfile, getSeedPhrase, type NxCliProfile } from '../config.js';
import { kv, success, warn, error, isJsonMode } from '../output.js';
import { requireOperatorMode } from '../mode.js';
import { EntityType } from '@nexoid/nx-core';
import { deriveOperator, deriveAgent, isValidSeedPhrase } from '@nexoid/core-client';

export function registerIdentityCommands(program: Command): void {
  // nxcli init
  program
    .command('init')
    .description('Initialize CLI config')
    .requiredOption('--rpc-url <url>', 'RPC URL for Ethereum network')
    .requiredOption('--registry <address>', 'IdentityRegistry contract address')
    .option('--safe <address>', 'Operator Safe wallet address')
    .option('--token <address>', 'USDT token contract address')
    .requiredOption('--nexoid-module <address>', 'NexoidModule contract address (agent Safe registry)')
    .option('--mode <mode>', 'Profile mode: operator or agent', 'operator')
    .option('--profile <name>', 'Profile name', 'default')
    .option('--seed', 'Use WDK seed phrase from NEXOID_SEED_PHRASE env var to derive operator key')
    .action(async (opts) => {
      requireOperatorMode({ mode: opts.mode === 'agent' ? undefined : 'operator' });

      const mode = opts.mode === 'agent' ? 'agent' as const : 'operator' as const;

      const profile: NxCliProfile = {
        mode,
        rpcUrl: opts.rpcUrl,
        registryAddress: opts.registry as `0x${string}`,
        safeAddress: opts.safe as `0x${string}` | undefined,
        tokenAddress: opts.token as `0x${string}` | undefined,
        nexoidModuleAddress: opts.nexoidModule as `0x${string}`,
        nextAgentIndex: 1,
      };

      initConfig(profile, opts.profile);

      const output: Record<string, string> = {
        config: getConfigPath(),
        profile: opts.profile,
        mode,
      };

      // If --seed flag is provided, derive operator address from seed phrase
      if (opts.seed) {
        const seedPhrase = getSeedPhrase();
        if (!seedPhrase) {
          error('--seed flag requires NEXOID_SEED_PHRASE environment variable to be set.', 'config');
        }
        if (!isValidSeedPhrase(seedPhrase)) {
          error('Invalid seed phrase in NEXOID_SEED_PHRASE.', 'config');
        }
        const operator = deriveOperator(seedPhrase);
        output.operatorAddress = operator.address;
        if (!isJsonMode()) warn('Operator key derived from seed phrase (WDK).');
      }

      kv(output);
      if (!isJsonMode()) success('Config initialized.');
    });

  // nxcli register
  program
    .command('register')
    .description('Verify identity (must be pre-registered by a registrar), deploy Safe wallet, and enable AllowanceModule')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);
      const did = client.getOperatorDid();
      if (!did) {
        error('No private key configured. Set NEXOID_PRIVATE_KEY.', 'config');
      }

      // Verify identity is already registered (by a registrar)
      if (!isJsonMode()) warn('Verifying identity is registered...');
      let identity;
      try {
        identity = await client.resolveIdentity(did);
      } catch {
        error(
          'Identity not found on-chain. A registrar must register your identity first.\n' +
          'Ask your admin to run: nxcli admin register-for <your-address>',
          'validation'
        );
      }

      const output: Record<string, string | undefined> = {
        did: identity.did,
        address: identity.owner,
        entityType: String(identity.entityType),
        status: String(identity.status),
      };

      // Deploy Safe + enable AllowanceModule
      if (!isJsonMode()) warn('Deploying Safe wallet + enabling AllowanceModule...');
      try {
        const safeResult = await client.deploySafe();
        output.safeAddress = safeResult.safeAddress;
        output.safeTxHash = safeResult.txHash;
        output.moduleEnabled = String(safeResult.moduleEnabled);

        // Save Safe address to config
        try {
          updateProfile(globalOpts.profile ?? 'default', {
            safeAddress: safeResult.safeAddress,
          });
        } catch {
          if (!isJsonMode()) warn('Could not save Safe address to config. Add it manually.');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!isJsonMode()) warn(`Safe deployment failed: ${msg}. You can retry with \`nxcli enable-safe\`.`);
        output.safeError = msg;
      }

      kv(output);
      if (!isJsonMode()) success('Identity verified.' + (output.safeAddress ? ' Safe wallet deployed.' : ''));
    });

  // nxcli enable-safe — for retrying Safe deployment if register --skip-safe was used
  program
    .command('enable-safe')
    .description('Deploy Safe wallet and enable AllowanceModule (if not done during register)')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const profile = loadConfig(globalOpts.profile);
      if (profile.safeAddress) {
        // Safe already exists, just ensure module is enabled
        if (!isJsonMode()) warn('Safe already configured. Checking AllowanceModule...');
        const client = buildClient(globalOpts.profile);
        const txHash = await client.enableAllowanceModule(profile.safeAddress);
        kv({ safeAddress: profile.safeAddress, moduleEnableTxHash: txHash });
        if (!isJsonMode()) success('AllowanceModule enabled on existing Safe.');
        return;
      }

      if (!isJsonMode()) warn('Deploying new Safe wallet...');
      const client = buildClient(globalOpts.profile, globalOpts.dryRun);
      const safeResult = await client.deploySafe();

      // Save to config
      try {
        updateProfile(globalOpts.profile ?? 'default', {
          safeAddress: safeResult.safeAddress,
        });
      } catch {
        if (!isJsonMode()) warn('Could not save Safe address to config. Add it manually.');
      }

      kv({
        safeAddress: safeResult.safeAddress,
        txHash: safeResult.txHash,
        moduleEnabled: String(safeResult.moduleEnabled),
      });
      if (!isJsonMode()) success('Safe wallet deployed and AllowanceModule enabled.');
    });

  // nxcli whoami
  program
    .command('whoami')
    .description('Show the current identity')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);
      const did = client.getOperatorDid();
      if (!did) {
        error('No identity found. Register with `nxcli register`', 'config');
      }
      const identity = await client.resolveIdentity(did);

      const output: Record<string, string | undefined> = {
        did: identity.did,
        address: identity.owner,
        status: String(identity.status),
        entityType: String(identity.entityType),
      };
      if (identity.ownerDid) {
        output.ownerDid = identity.ownerDid;
      }

      // Show safe address if in operator mode
      try {
        const profile = loadConfig(globalOpts.profile);
        if (profile.safeAddress) {
          output.safeAddress = profile.safeAddress;
        }
      } catch {
        // Config may not exist yet
      }

      kv(output);
    });

  // nxcli config show
  const configCmd = program
    .command('config')
    .description('Config management');

  configCmd
    .command('show')
    .description('Show the active profile config')
    .action((_, cmd) => {
      const profileName = cmd.optsWithGlobals().profile;
      if (!configExists()) {
        error(`No config found. Run \`nxcli init\` first.`, 'config');
      }
      const profile = loadConfig(profileName);
      kv({
        mode: profile.mode,
        rpcUrl: profile.rpcUrl,
        registryAddress: profile.registryAddress,
        nexoidModuleAddress: profile.nexoidModuleAddress,
        safeAddress: profile.safeAddress ?? '(not set)',
        tokenAddress: profile.tokenAddress ?? '(default)',
        privateKey: process.env['NEXOID_PRIVATE_KEY'] ? '***SET***' : '(not set)',
      });
    });

  // nxcli agent create/resolve/revoke
  const agentCmd = program
    .command('agent')
    .description('Agent identity management');

  agentCmd
    .command('create')
    .description('Create a new agent identity')
    .option('--type <type>', 'Agent type: virtual or physical', 'virtual')
    .option('--label <name>', 'Human-readable label')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);
      const entityType = opts.type === 'physical' ? EntityType.PhysicalAgent : EntityType.VirtualAgent;

      // Check for WDK seed phrase to derive agent key
      const seedPhrase = getSeedPhrase();
      let createOpts: { entityType: number; label?: string; seedPhrase?: string; agentIndex?: number } = {
        entityType,
        label: opts.label,
      };

      if (seedPhrase) {
        const profile = loadConfig(globalOpts.profile);
        const agentIndex = profile.nextAgentIndex ?? 1;
        const derived = deriveAgent(seedPhrase, agentIndex);

        createOpts = { ...createOpts, seedPhrase, agentIndex };

        if (!isJsonMode()) warn(`Deriving agent key at index ${agentIndex} (WDK): ${derived.address}`);

        // Increment nextAgentIndex in config
        updateProfile(globalOpts.profile ?? 'default', { nextAgentIndex: agentIndex + 1 });
      }

      const result = await client.createAgent(createOpts);

      const output: Record<string, string | undefined> = {
        did: result.did,
        address: result.address,
        apiKey: result.apiKey,
        txHash: result.txHash,
      };

      // Deploy agent Safe if operator has a Safe and NexoidModule configured
      const profile = loadConfig(globalOpts.profile);
      if (profile.safeAddress && profile.nexoidModuleAddress) {
        if (!isJsonMode()) warn('Deploying agent Safe wallet...');
        try {
          const agentSafeResult = await client.deployAgentSafe(
            result.address,
            profile.safeAddress
          );
          output.agentSafeAddress = agentSafeResult.agentSafeAddress;
          output.agentSafeTxHash = agentSafeResult.txHash;

          if (!isJsonMode()) warn(`Agent Safe deployed at ${agentSafeResult.agentSafeAddress}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!isJsonMode()) warn(`Agent Safe deployment failed: ${msg}`);
          output.agentSafeError = msg;
        }
      }

      kv(output);

      // Output ready-to-use agent config
      if (!isJsonMode()) {
        success('Agent created. Save the apiKey — it is shown only once.');

        try {
          const agentConfig = {
            version: '1',
            defaultProfile: 'default',
            profiles: {
              default: {
                mode: 'agent',
                rpcUrl: profile.rpcUrl,
                registryAddress: profile.registryAddress,
                safeAddress: output.agentSafeAddress ?? profile.safeAddress,
                tokenAddress: profile.tokenAddress,
                nexoidModuleAddress: profile.nexoidModuleAddress,
              },
            },
          };
          process.stderr.write('\nAgent config (save as ~/.nxcli/config.json on the agent):\n');
          process.stderr.write(JSON.stringify(agentConfig, null, 2) + '\n');
        } catch {
          // Config output is best-effort
        }
      }
    });

  agentCmd
    .command('resolve <did>')
    .description('Resolve an agent or operator identity by DID')
    .action(async (did: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = buildClient(globalOpts.profile);
      const identity = await client.resolveIdentity(did as `did:nexoid:eth:${string}`);
      kv({
        did: identity.did,
        owner: identity.owner,
        entityType: String(identity.entityType),
        status: String(identity.status),
        createdAt: String(identity.createdAt),
        ownerDid: identity.ownerDid,
      });
    });

  agentCmd
    .command('revoke <did>')
    .description('Revoke an agent identity')
    .action(async (did: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      requireOperatorMode(globalOpts);

      const client = buildClient(globalOpts.profile, globalOpts.dryRun);
      const { EntityStatus } = await import('@nexoid/nx-core');
      const txHash = await client.updateIdentityStatus(
        did as `did:nexoid:eth:${string}`,
        EntityStatus.Revoked,
      );
      kv({ txHash, status: 'Revoked' });
      if (!isJsonMode()) success(`Agent ${did} revoked.`);
    });
}
